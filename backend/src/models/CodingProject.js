import mongoose from "mongoose";

export const CODING_PROJECT_TYPES = ["COMPILER", "PLAYGROUND"];
export const CODING_PROJECT_VISIBILITY = ["PRIVATE", "SHARED"];

const CodingProjectFileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    language: { type: String, default: null, trim: true, maxlength: 40 },
    content: { type: String, default: "", maxlength: 524288 },
    isMain: { type: Boolean, default: false },
  },
  { _id: false },
);

/**
 * Online Coding Lab project.
 *
 * One document per saved workspace. Source files are embedded because
 * they are small text payloads (capped at 512 KiB per file, 20 files
 * per project) and always travel with the project record, which keeps
 * save/reload to a single query. Ownership is the only write rule: a
 * student may edit only projects they own, and a teacher only their
 * own — shared read access never implies write access.
 */
const CodingProjectSchema = new mongoose.Schema(
  {
    ownerUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    ownerRole: {
      type: String,
      enum: ["student", "faculty"],
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, default: "", trim: true, maxlength: 2000 },
    projectType: {
      type: String,
      enum: CODING_PROJECT_TYPES,
      default: "COMPILER",
      index: true,
    },
    /** Registry id of the active language, validated against the execution provider. */
    defaultLanguage: { type: String, default: "python", trim: true, maxlength: 40 },
    files: { type: [CodingProjectFileSchema], default: [] },
    /** Optional course/section the project was created for (teacher originals). */
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null, index: true },
    sectionCode: { type: String, default: null, trim: true, maxlength: 20 },
    visibility: {
      type: String,
      enum: CODING_PROJECT_VISIBILITY,
      default: "PRIVATE",
      index: true,
    },
    /** Assignment a student copy was started from, if any. */
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CodingAssignment",
      default: null,
      index: true,
    },
    /** Teacher original this project was duplicated from, if any. */
    copiedFrom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CodingProject",
      default: null,
    },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

CodingProjectSchema.index({ ownerUser: 1, updatedAt: -1 });
CodingProjectSchema.index({ course: 1, visibility: 1 });

export const CodingProject = mongoose.model("CodingProject", CodingProjectSchema);
