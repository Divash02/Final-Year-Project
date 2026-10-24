import mongoose from "mongoose";

export const CODING_EXECUTION_STATUSES = [
  "QUEUED",
  "PROCESSING",
  "ACCEPTED",
  "FAILED",
  "TIMEOUT",
  "PROVIDER_ERROR",
];

/**
 * Execution audit record.
 *
 * One row per execution request, tying the caller to the
 * provider's submission id so results can be polled later and
 * every run is attributable. Provider output is stored capped
 * (stdout/stderr ≤ 64 KiB each) so a runaway program cannot
 * bloat the database. Documents expire after 24 h via the TTL
 * index — execution history is session-scoped by design.
 */
const CodingExecutionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CodingProject",
      default: null,
      index: true,
    },
    languageId: { type: String, required: true, trim: true, maxlength: 40 },
    providerSubmissionId: { type: String, default: null, maxlength: 120 },
    status: {
      type: String,
      enum: CODING_EXECUTION_STATUSES,
      default: "QUEUED",
      index: true,
    },
    description: { type: String, default: null, trim: true },
    stdout: { type: String, default: "", maxlength: 65536 },
    stderr: { type: String, default: "", maxlength: 65536 },
    compileOutput: { type: String, default: "", maxlength: 65536 },
    exitCode: { type: Number, default: null },
    durationMs: { type: Number, default: null },
    memoryKb: { type: Number, default: null },
    message: { type: String, default: null, trim: true },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 24 * 3600 * 1000) },
  },
  { timestamps: true },
);

CodingExecutionSchema.index({ user: 1, createdAt: -1 });
CodingExecutionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const CodingExecution = mongoose.model("CodingExecution", CodingExecutionSchema);
