import mongoose from "mongoose";

const CodingDraftFileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    language: { type: String, default: null, trim: true, maxlength: 40 },
    content: { type: String, default: "", maxlength: 524288 },
    isMain: { type: Boolean, default: false },
  },
  { _id: false },
);

/**
 * Student draft for a coding assignment.
 *
 * Separate from both CodingProject and CodingSubmission.
 * Tracks the student's work-in-progress so they can return
 * later and continue coding. One draft per student per assignment.
 */
const CodingDraftSchema = new mongoose.Schema(
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
    files: { type: [CodingDraftFileSchema], default: [] },
    lastSavedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

CodingDraftSchema.index(
  { assignment: 1, studentUser: 1 },
  { unique: true },
);

export const CodingDraft = mongoose.model("CodingDraft", CodingDraftSchema);