import { AIJob } from "../../models/index.js";
import { logger } from "../../utils/logger.js";
import { getUserById } from "../identityService.js";
import { badRequest, notFound } from "../../utils/apiError.js";

/**
 * Background AI job runner.
 *
 * Design goals:
 *   - Keep CPU/IO-heavy AI work off the Express event loop.
 *   - Persist every job so status survives a restart.
 *   - Never execute the same logical job twice (unique idempotency key).
 *   - Bound every attempt with a timeout and a retry budget.
 *   - Keep AI output out of official records; handlers only *produce* results.
 *
 * The runner is process-local (an in-memory poller over a MongoDB queue), so no
 * Redis/Kafka infrastructure is introduced. A multi-instance deployment can run
 * the worker in one process while the API scales horizontally.
 */

const DEFAULT_POLL_INTERVAL_MS = 1000;
// A PROCESSING lease is only considered abandoned after this long. It must
// exceed the longest allowed job timeout so a still-running job is never
// requeued and executed twice.
const STALE_LEASE_MS = 10 * 60 * 1000;

/** kind -> async ({ payload, user, role }) => result */
const handlers = new Map();

/**
 * Registers the business handler for a job kind. AI services call this at
 * module load, so routes never import heavy AI logic directly.
 */
export function registerAIJobHandler(kind, handler) {
  if (typeof handler !== "function") {
    throw new Error(`AI job handler for "${kind}" must be a function.`);
  }
  handlers.set(kind, handler);
}

function assertKnownKind(kind) {
  if (!handlers.has(kind)) {
    throw badRequest(`Unknown AI job type: ${kind}.`);
  }
}

/**
 * Enqueues a job. When `idempotencyKey` matches an existing job, that job is
 * returned instead of creating a second one, so a double-click or a retried
 * request cannot launch the same expensive operation twice.
 */
export async function enqueueAIJob({
  kind,
  payload = {},
  idempotencyKey = null,
  requestedBy = null,
  requestedRole = null,
  maxAttempts = 3,
  timeoutMs = 120000,
}) {
  assertKnownKind(kind);
  const key = idempotencyKey ? String(idempotencyKey).trim() : null;
  if (key) {
    const existing = await AIJob.findOne({ idempotencyKey: key }).lean();
    if (existing) {
      return { job: existing, reused: true };
    }
  }

  const job = await AIJob.create({
    kind,
    payload,
    idempotencyKey: key,
    requestedBy: requestedBy || null,
    requestedRole: requestedRole || null,
    maxAttempts,
    timeoutMs,
    status: "QUEUED",
  });
  return { job: job.toObject(), reused: false };
}

export async function getAIJob(jobId) {
  const job = await AIJob.findById(jobId).lean();
  if (!job) throw notFound("AI job not found.");
  return job;
}

export async function listAIJobs({ status, limit = 25 } = {}) {
  const filter = status ? { status } : {};
  return await AIJob.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
}

async function claimNextJob(workerId) {
  const now = new Date();

  // Recover jobs whose worker died mid-flight: a PROCESSING lease older than
  // its own timeout plus a grace period is put back on the queue.
  await AIJob.updateMany(
    {
      status: "PROCESSING",
      lockedAt: { $lt: new Date(now.getTime() - STALE_LEASE_MS) },
    },
    { $set: { status: "QUEUED", lockedAt: null, lockedBy: null } },
  );

  const job = await AIJob.findOneAndUpdate(
    { status: "QUEUED" },
    {
      $set: {
        status: "PROCESSING",
        lockedAt: now,
        lockedBy: workerId,
        startedAt: now,
      },
      $inc: { attempts: 1 },
    },
    { sort: { createdAt: 1 }, returnDocument: "after" },
  );

  // findOneAndUpdate is atomic per document, so only one worker can win the
  // QUEUED -> PROCESSING transition.
  return job || null;
}

function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`AI job timed out after ${timeoutMs}ms.`)),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function runJob(job) {
  const handler = handlers.get(job.kind);
  if (!handler) {
    throw new Error(`No handler registered for AI job kind "${job.kind}".`);
  }

  const user = job.requestedBy ? await getUserById(job.requestedBy) : null;
  const result = await withTimeout(
    handler({ payload: job.payload || {}, user, role: job.requestedRole }),
    job.timeoutMs,
  );

  await AIJob.updateOne(
    { _id: job._id, status: "PROCESSING" },
    {
      $set: {
        status: "COMPLETED",
        result,
        error: null,
        finishedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      },
    },
  );
}

async function failJob(job, error) {
  const attempts = job.attempts || 1;
  const canRetry = attempts < (job.maxAttempts || 3);
  const message = String(error?.message || error || "AI job failed.").slice(0, 500);

  await AIJob.updateOne(
    { _id: job._id },
    {
      $set: {
        status: canRetry ? "QUEUED" : "FAILED",
        error: message,
        finishedAt: canRetry ? null : new Date(),
        lockedAt: null,
        lockedBy: null,
      },
    },
  );

  if (!canRetry) {
    logger.error("ai_job_failed", {
      jobId: String(job._id),
      kind: job.kind,
      attempts,
      message,
    });
  } else {
    logger.warn("ai_job_retry", {
      jobId: String(job._id),
      kind: job.kind,
      attempts,
      message,
    });
  }
}

let workerTimer = null;
let workerRunning = false;
let workerGeneration = 0;

/**
 * Starts the background poller. Safe to call once; repeated calls are ignored
 * while a worker is running.
 */
export function startAIJobWorker({
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
} = {}) {
  if (workerTimer) return;
  workerRunning = true;
  const generation = ++workerGeneration;

  const tick = async () => {
    if (!workerRunning || generation !== workerGeneration) return;
    try {
      // Drain all currently-queued jobs rather than one per tick, but bound the
      // loop so a large backlog cannot starve the event loop.
      for (let processed = 0; processed < 25; processed += 1) {
        const job = await claimNextJob(`worker-${process.pid}-${generation}`);
        if (!job) break;
        try {
          await runJob(job);
        } catch (error) {
          await failJob(job, error);
        }
      }
    } catch (error) {
      logger.error("ai_job_worker_tick_failed", {
        message: error?.message,
      });
    } finally {
      if (workerRunning && generation === workerGeneration) {
        workerTimer = setTimeout(tick, pollIntervalMs);
      }
    }
  };

  workerTimer = setTimeout(tick, pollIntervalMs);
  workerTimer.unref?.();
}

export async function stopAIJobWorker() {
  workerRunning = false;
  workerGeneration += 1;
  if (workerTimer) {
    clearTimeout(workerTimer);
    workerTimer = null;
  }
}

export default {
  registerAIJobHandler,
  enqueueAIJob,
  getAIJob,
  listAIJobs,
  startAIJobWorker,
  stopAIJobWorker,
};