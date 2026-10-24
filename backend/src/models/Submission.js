import mongoose from "mongoose";
import { FileReferenceSchema } from "./StoredFile.js";

export const SUBMISSION_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "LATE",
  "GRADED",
  "RETURNED",
];

export const SIMILARITY_STATUSES = [
  "NOT_CHECKED",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "NOT_SUPPORTED",
];

/**
 * Similarity / plagiarism result.
 *
 * CollegeOS has no Turnitin-class engine wired up, so this document records the
 * *request* for a check and, once a provider is configured, its real result.
 * `status` defaults to `NOT_CHECKED` and `percentage` stays null; the API never
 * invents a score. `provider` names the engine that produced a `COMPLETED`
 * result so a future integration is a configuration change, not a schema one.
 */
const SimilaritySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: SIMILARITY_STATUSES,
      default: "NOT_CHECKED",
    },
    percentage: { type: Number, default: null, min: 0, max: 100 },
    provider: { type: String, default: null, trim: true },
    matchedSources: [
      {
        label: { type: String, trim: true },
        url: { type: String, trim: true },
        matchedPercent: { type: Number, default: null },
      },
    ],
    reportUrl: { type: String, default: null, trim: true },
    message: { type: String, default: null, trim: true },
    checkedAt: { type: Date, default: null },
  },
  { _id: false },
);

const SubmissionSchema = new mongoose.Schema(
  {
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assignment",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    studentUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    /** Denormalised for teacher views so a class list never re-queries students. */
    studentId: { type: String, default: null, trim: true },
    studentName: { type: String, default: null, trim: true },

    file: { type: FileReferenceSchema, default: null },
    status: {
      type: String,
      enum: SUBMISSION_STATUSES,
      default: "DRAFT",
      index: true,
    },
    submittedAt: { type: Date, default: null },
    isLate: { type: Boolean, default: false },
    /** Incremented each time a student replaces the file. */
    attemptCount: { type: Number, default: 0 },

    marks: { type: Number, default: null, min: 0 },
    feedback: { type: String, default: "", trim: true, maxlength: 4000 },
    privateComment: { type: String, default: "", trim: true, maxlength: 4000 },
    gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    gradedAt: { type: Date, default: null },

    similarity: { type: SimilaritySchema, default: () => ({ status: "NOT_CHECKED" }) },
  },
  { timestamps: true },
);

SubmissionSchema.index({ assignment: 1, student: 1 }, { unique: true });

export const Submission = mongoose.model("Submission", SubmissionSchema);
