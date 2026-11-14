import mongoose from "mongoose";

/**
 * Background AI job.
 *
 * Long-running AI work (report generation, transcript extraction, process
 * mining, anomaly scans, operations-agent queries) is CPU/IO heavy and must
 * never run synchronously on the Express event loop: doing so blocks every
 * other academic and administrative request while the model responds.
 *
 * Jobs are persisted in MongoDB so their status survives a restart and can be
 * observed through the API. Results are stored here and are *not* written to
 * official institutional records: a human authorised workflow must still apply
 * any consequential AI output.
 */
export const AI_JOB_STATUSES = ["QUEUED", "PROCESSING", "COMPLETED", "FAILED"];

const AIJobSchema = new mongoose.Schema(
  {
    kind: { type: String, required: true, trim: true, index: true },
    status: {
      type: String,
      enum: AI_JOB_STATUSES,
      default: "QUEUED",
      index: true,
    },
    idempotencyKey: { type: String, default: null },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    requestedRole: { type: String, default: null },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    error: { type: String, default: null },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    timeoutMs: { type: Number, default: 120000 },
    lockedAt: { type: Date, default: null },
    lockedBy: { type: String, default: null },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// One active job per idempotency key, so a double submit cannot enqueue the
// same expensive operation twice.
AIJobSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } },
);

// Workers poll the oldest QUEUED job; stale PROCESSING leases are recoverable.
AIJobSchema.index({ status: 1, createdAt: 1 });
AIJobSchema.index({ status: 1, lockedAt: 1 });

export const AIJob = mongoose.model("AIJob", AIJobSchema);