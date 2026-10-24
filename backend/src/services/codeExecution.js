import {
  CodingExecution,
} from "../models/index.js";
import { badRequest, forbidden, notFound, validationError } from "../utils/apiError.js";

/**
 * Execution provider integration for the Online Coding Lab.
 *
 * Untrusted student code is never executed on the CollegeOS server
 * process: every run is dispatched to an isolated execution
 * provider (Judge0 CE by default) over HTTPS, and only the
 * resulting stdout/stderr/metrics cross back. Provider credentials
 * live server-side in environment variables and are never returned
 * to the browser.
 *
 * Configuration (backend .env):
 *   JUDGE0_BASE_URL      e.g. https://ce.judge0.com or a self-hosted
 *                        Judge0 CE origin such as http://127.0.0.1:2358
 *   JUDGE0_API_KEY       optional RapidAPI key (self-hosted CE needs none)
 *   JUDGE0_HOST          RapidAPI host header when a key is used
 *   JUDGE0_LANGUAGE_ID_MAP  optional JSON { slug: judge0LanguageId }
 *                            overrides/extends the built-in id map
 *   CODING_CPU_TIME_LIMIT  seconds, default 5 (sent when provider honours it)
 *   CODING_MEMORY_LIMIT_KB default 262144 (256 MiB)
 *   CODING_RATE_LIMIT_PER_MINUTE  default 40 executions per user
 */

const JUDGE0_BASE_URL = (process.env.JUDGE0_BASE_URL || "").trim().replace(/\/+$/, "");
const JUDGE0_API_KEY = (process.env.JUDGE0_API_KEY || "").trim();
const JUDGE0_HOST = (process.env.JUDGE0_HOST || "judge0.p.rapidapi.com").trim();
const CPU_TIME_LIMIT = Number(process.env.CODING_CPU_TIME_LIMIT || 5);
const MEMORY_LIMIT_KB = Number(process.env.CODING_MEMORY_LIMIT_KB || 262144);
const RATE_LIMIT_PER_MINUTE = Number(process.env.CODING_RATE_LIMIT_PER_MINUTE || 40);

export const MAX_SOURCE_BYTES = 512 * 1024;
export const MAX_STDIN_BYTES = 64 * 1024;
export const MAX_FILES_PER_PROJECT = 20;

/**
 * Built-in language metadata. The `judge0Id` values are the
 * provider's language ids for the stock Judge0 CE catalogue; the
 * provider's own `/languages` response remains the source of truth
 * for what is actually available, and `JUDGE0_LANGUAGE_ID_MAP` can
 * override ids per deployment. Languages with `execution: false`
 * (HTML/CSS) are playground-only and are never sent to the provider.
 */
const BUILT_IN_LANGUAGES = [
  { id: "python", name: "Python", extension: "py", judge0Id: 71, execution: true },
  { id: "java", name: "Java", extension: "java", judge0Id: 62, execution: true },
  { id: "c", name: "C", extension: "c", judge0Id: 50, execution: true },
  { id: "cpp", name: "C++", extension: "cpp", judge0Id: 53, execution: true },
  { id: "javascript", name: "JavaScript (Node.js)", extension: "js", judge0Id: 63, execution: true },
  { id: "typescript", name: "TypeScript", extension: "ts", judge0Id: 74, execution: true },
  { id: "csharp", name: "C#", extension: "cs", judge0Id: 51, execution: true },
  { id: "php", name: "PHP", extension: "php", judge0Id: 68, execution: true },
  { id: "go", name: "Go", extension: "go", judge0Id: 60, execution: true },
  { id: "rust", name: "Rust", extension: "rs", judge0Id: 64, execution: true },
  { id: "ruby", name: "Ruby", extension: "rb", judge0Id: 72, execution: true },
  { id: "kotlin", name: "Kotlin", extension: "kt", judge0Id: 78, execution: true },
  { id: "swift", name: "Swift", extension: "swift", judge0Id: 81, execution: true },
  { id: "sql", name: "SQL (SQLite)", extension: "sql", judge0Id: 83, execution: true },
  { id: "html", name: "HTML", extension: "html", judge0Id: null, execution: false },
  { id: "css", name: "CSS", extension: "css", judge0Id: null, execution: false },
];

let extraLanguageOverride = null;
function languageIdMapOverride() {
  if (extraLanguageOverride !== null) return extraLanguageOverride;
  const raw = (process.env.JUDGE0_LANGUAGE_ID_MAP || "").trim();
  if (!raw) {
    extraLanguageOverride = {};
    return extraLanguageOverride;
  }
  try {
    const parsed = JSON.parse(raw);
    extraLanguageOverride =
      parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    extraLanguageOverride = {};
  }
  return extraLanguageOverride;
}

/** Registry metadata for one lab language id. */
export function getLanguageMeta(languageId) {
  const normalized = String(languageId || "").trim().toLowerCase();
  const meta = BUILT_IN_LANGUAGES.find((entry) => entry.id === normalized);
  if (!meta) return null;
  const override = languageIdMapOverride()[meta.id];
  return {
    ...meta,
    judge0Id: override !== undefined ? Number(override) : meta.judge0Id,
  };
}

export function listLanguageMeta() {
  const overrides = languageIdMapOverride();
  return BUILT_IN_LANGUAGES.map((entry) => ({
    ...entry,
    judge0Id:
      overrides[entry.id] !== undefined
        ? Number(overrides[entry.id])
        : entry.judge0Id,
  }));
}

/** True when a provider execution service is configured. */
export function isExecutionProviderConfigured() {
  return Boolean(JUDGE0_BASE_URL);
}

function providerHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (JUDGE0_API_KEY) {
    headers["x-rapidapi-key"] = JUDGE0_API_KEY;
    headers["x-rapidapi-host"] = JUDGE0_HOST;
  }
  return headers;
}

/**
 * Languages the configured provider actually offers, merged with
 * local metadata (display name, file extension, playground flag).
 * Returns an empty catalogue with `configured: false` when no
 * provider URL is set, so the UI can say so instead of pretending.
 */
export async function fetchProviderLanguages() {
  if (!isExecutionProviderConfigured()) {
    return { configured: false, languages: [] };
  }
  const response = await fetch(`${JUDGE0_BASE_URL}/languages`, {
    headers: providerHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Execution provider returned HTTP ${response.status}.`);
  }
  const payload = await response.json();
  const providerList = Array.isArray(payload) ? payload : payload.languages || [];
  const supportedIds = new Set(
    providerList
      .map((entry) => Number(entry?.id))
      .filter((id) => Number.isFinite(id)),
  );
  const languages = listLanguageMeta()
    .filter((meta) => !meta.execution || supportedIds.has(meta.judge0Id))
    .map((meta) => ({
      id: meta.id,
      name: meta.name,
      extension: meta.extension,
      execution: meta.execution,
      providerLanguageId: meta.execution ? meta.judge0Id : null,
    }));
  return { configured: true, languages };
}

/** In-memory per-user execution rate limiter (per backend process). */
const executionLog = new Map();

function assertWithinRateLimit(userId) {
  const key = String(userId);
  const now = Date.now();
  const windowMs = 60 * 1000;
  const history = (executionLog.get(key) || []).filter((ts) => now - ts < windowMs);
  if (history.length >= RATE_LIMIT_PER_MINUTE) {
    throw validationError(
      `Execution rate limit reached. Try again in a minute. (${RATE_LIMIT_PER_MINUTE} runs per minute)`,
    );
  }
  history.push(now);
  executionLog.set(key, history);
}

/**
 * Judge0 numeric status → lab execution status. Anything the lab
 * does not classify as terminal keeps the caller polling.
 */
const PROVIDER_STATUS_MAP = {
  1: { status: "QUEUED", terminal: false },
  2: { status: "PROCESSING", terminal: false },
  3: { status: "ACCEPTED", terminal: true },
  4: { status: "FAILED", terminal: true },
  5: { status: "TIMEOUT", terminal: true },
  6: { status: "FAILED", terminal: true, kind: "compile" },
  7: { status: "FAILED", terminal: true, kind: "runtime" },
  8: { status: "PROVIDER_ERROR", terminal: true },
  9: { status: "FAILED", terminal: true, kind: "runtime" },
  10: { status: "FAILED", terminal: true, kind: "memory" },
  11: { status: "TIMEOUT", terminal: true },
  12: { status: "PROVIDER_ERROR", terminal: true },
  13: { status: "PROVIDER_ERROR", terminal: true },
  14: { status: "PROVIDER_ERROR", terminal: true },
  15: { status: "PROVIDER_ERROR", terminal: true },
};

function clampOutput(value, limit = 65536) {
  if (typeof value !== "string") return "";
  return value.length > limit ? `${value.slice(0, limit)}\n…[output truncated]` : value;
}

/**
 * Submits source code for isolated execution and persists an audit
 * record. Returns the record id the caller polls.
 */
export async function submitExecution({
  user,
  project = null,
  languageId,
  sourceCode,
  stdin = "",
}) {
  const userId = user?._id || user?.id;
  if (!userId) throw forbidden("Authentication required.");

  const meta = getLanguageMeta(languageId);
  if (!meta) {
    throw badRequest(`Unsupported language: ${languageId}.`);
  }
  if (!meta.execution) {
    throw badRequest(
      `${meta.name} is a playground language and runs in the browser preview, not the execution service.`,
    );
  }

  const source = typeof sourceCode === "string" ? sourceCode : "";
  if (Buffer.byteLength(source, "utf8") > MAX_SOURCE_BYTES) {
    throw validationError(`Source code must be ${MAX_SOURCE_BYTES / 1024} KiB or smaller.`);
  }
  const input = typeof stdin === "string" ? stdin : "";
  if (Buffer.byteLength(input, "utf8") > MAX_STDIN_BYTES) {
    throw validationError(`Standard input must be ${MAX_STDIN_BYTES / 1024} KiB or smaller.`);
  }
  if (source.trim().length === 0) {
    throw validationError("Source code is empty. Write some code before running.");
  }

  if (!isExecutionProviderConfigured()) {
    throw forbidden(
      "The execution service is not configured on this CollegeOS deployment. Ask your administrator to set JUDGE0_BASE_URL.",
    );
  }

  assertWithinRateLimit(userId);

  const record = await CodingExecution.create({
    user: userId,
    project: project?._id || project || null,
    languageId: meta.id,
    status: "QUEUED",
  });

  const url = new URL(`${JUDGE0_BASE_URL}/submissions`);
  url.searchParams.set("base64_encoded", "false");
  url.searchParams.set("fields", "*");
  const body = {
    language_id: meta.judge0Id,
    source_code: source,
    stdin: input,
    cpu_time_limit: CPU_TIME_LIMIT,
    memory_limit: MEMORY_LIMIT_KB,
  };

  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: providerHeaders(),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Execution provider rejected the submission (HTTP ${response.status}). ${text.slice(0, 200)}`,
      );
    }
    const payload = await response.json();
    await CodingExecution.findByIdAndUpdate(record._id, {
      providerSubmissionId: payload?.token || String(payload?.submission_id || ""),
      status: "PROCESSING",
    });
    record.providerSubmissionId = payload?.token || "";
    record.status = "PROCESSING";
  } catch (error) {
    await CodingExecution.findByIdAndUpdate(record._id, {
      status: "PROVIDER_ERROR",
      message: "The execution service could not accept this program.",
    });
    // Surface a safe message; the provider detail stays in the log.
    console.error(
      `[coding] provider submission failed for user ${userId}:`,
      error?.message || error,
    );
    throw forbidden(
      "The execution service is unavailable right now. Please try again in a moment.",
    );
  }

  return record._id.toString();
}

/**
 * Returns the current state of one execution, polling the provider
 * when the stored record is still pending. Only the owner may read
 * a record — enforced by the route layer before calling this.
 */
export async function getExecutionResult(user, executionId) {
  const userId = user?._id || user?.id;
  const record = await CodingExecution.findById(executionId);
  if (!record || String(record.user) !== String(userId)) {
    throw notFound("Execution record not found.");
  }

  if (
    record.providerSubmissionId &&
    isExecutionProviderConfigured() &&
    ["QUEUED", "PROCESSING"].includes(record.status)
  ) {
    try {
      const url = `${JUDGE0_BASE_URL}/submissions/${encodeURIComponent(
        record.providerSubmissionId,
      )}?base64_encoded=false&fields=*`;
      const response = await fetch(url, { headers: providerHeaders() });
      if (response.ok) {
        const payload = await response.json();
        const mapped = mapProviderResult(payload);
        Object.assign(record, mapped);
        await record.save();
      } else if (response.status >= 500) {
        record.status = "PROVIDER_ERROR";
        record.message = "The execution service did not respond in time.";
        await record.save();
      }
    } catch (error) {
      // A transient polling failure keeps the job pending so the
      // caller can retry; repeated failures eventually surface as
      // PROVIDER_ERROR on the next successful poll or timeout.
      console.error(
        `[coding] provider poll failed for execution ${record._id}:`,
        error?.message || error,
      );
    }
  }

  return {
    id: record._id.toString(),
    languageId: record.languageId,
    status: record.status,
    description: record.description,
    stdout: record.stdout,
    stderr: record.stderr,
    compileOutput: record.compileOutput,
    exitCode: record.exitCode,
    durationMs: record.durationMs,
    memoryKb: record.memoryKb,
    message: record.message,
    createdAt: record.createdAt,
  };
}

function mapProviderResult(payload) {
  const providerStatus = Number(payload?.status?.id ?? payload?.status);
  const mapped = PROVIDER_STATUS_MAP[providerStatus] || {
    status: "PROCESSING",
    terminal: false,
  };
  const description =
    payload?.status?.description ||
    (mapped.kind === "compile"
      ? "Compilation Error"
      : mapped.kind === "runtime"
        ? "Runtime Error"
        : mapped.kind === "memory"
          ? "Memory Limit Exceeded"
          : null);

  const timeSeconds = Number.parseFloat(payload?.time);
  const wallSeconds = Number.parseFloat(payload?.wall_time);
  const durationMs = Number.isFinite(timeSeconds)
    ? Math.round(timeSeconds * 1000)
    : Number.isFinite(wallSeconds)
      ? Math.round(wallSeconds * 1000)
      : null;

  const update = {
    status: mapped.status,
    description,
    stdout: clampOutput(payload?.stdout),
    stderr: clampOutput(payload?.stderr),
    compileOutput: clampOutput(payload?.compile_output),
    exitCode:
      payload?.exit_code === undefined || payload?.exit_code === null
        ? null
        : Number(payload.exit_code),
    durationMs,
    memoryKb: Number.isFinite(payload?.memory) ? Number(payload.memory) : null,
    message:
      mapped.status === "PROVIDER_ERROR"
        ? (payload?.message || "The execution service reported an internal error.")
        : null,
  };
  return update;
}

/**
 * Validates a language choice for a project/assignment against the
 * configured provider catalogue. Returns the metadata or throws a
 * 422 naming the unsupported language.
 */
export async function assertLanguageAvailable(languageId) {
  const meta = getLanguageMeta(languageId);
  if (!meta) {
    throw validationError(`Unsupported language: ${languageId}.`, [
      { field: "languageId", message: "Choose a language from the lab catalogue." },
    ]);
  }
  if (meta.execution) {
    const { configured, languages } = await fetchProviderLanguages();
    if (configured && !languages.some((entry) => entry.id === meta.id)) {
      throw validationError(
        `${meta.name} is not available on the configured execution service.`,
        [{ field: "languageId", message: "Choose a supported language." }],
      );
    }
  }
  return meta;
}
