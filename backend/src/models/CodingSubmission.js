import mongoose from "mongoose";

export const CODING_SUBMISSION_STATUSES = ["SUBMITTED", "LATE", "GRADED"];

const CodingSubmissionFileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    language: { type: String, default: null, trim: true, maxlength: 40 },
    content: { type: String, default: "", maxlength: 524288 },
  },
  { _id: false },
);

/** Frozen snapshot of the last execution result attached to a submission. */
const CodingExecutionSnapshotSchema = new mongoose.Schema(
  {
    status: { type: String, default: null },
    description: { type: String, default: null },
    stdout: { type: String, default: "" },
    stderr: { type: String, default: "" },
    compileOutput: { type: String, default: "" },
    exitCode: { type: Number, default: null },
    durationMs: { type: Number, default: null },
    memoryKb: { type: Number, default: null },
    executedAt: { type: Date, default: null },
  },
  { _id: false },
);

/**
 * Coding assignment submission.
 *
 * Separate from `CodingProject`: submitting freezes the student's
 * files and language at that moment, so later edits to the
 * personal project never change what was graded. One active
 * submission per student per assignment; resubmission replaces
 * the payload while preserving the original submittedAt.
 */
const CodingSubmissionSchema = new mongoose.Schema(
  {
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CodingAssignment",
      required: true,
      index: true,
    },
    studentUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    language: { type: String, required: true, trim: true, maxlength: 40 },
    files: { type: [CodingSubmissionFileSchema], default: [] },
    status: {
      type: String,
      enum: CODING_SUBMISSION_STATUSES,
      default: "SUBMITTED",
    },
    submittedAt: { type: Date, default: Date.now, index: true },
    isLate: { type: Boolean, default: false },
    version: { type: Number, default: 1, min: 1 },
    lastExecution: { type: CodingExecutionSnapshotSchema, default: null },
    feedback: { type: String, default: "", trim: true, maxlength: 4000 },
    marks: { type: Number, default: null, min: 0 },
    gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    gradedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

CodingSubmissionSchema.index(
  { assignment: 1, studentUser: 1 },
  { unique: true },
);

export const CodingSubmission = mongoose.model("CodingSubmission", CodingSubmissionSchema);
