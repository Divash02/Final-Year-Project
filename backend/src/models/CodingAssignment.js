import mongoose from "mongoose";
import { AudienceSchema, normalizeAudienceInput } from "./Audience.js";

export const CODING_ASSIGNMENT_STATUSES = ["DRAFT", "OPEN", "CLOSED"];

const CodingTestCaseSchema = new mongoose.Schema(
  {
    input: { type: String, default: "", maxlength: 16384 },
    expectedOutput: { type: String, default: "", maxlength: 16384 },
    /** Hidden cases are never returned to students. */
    isHidden: { type: Boolean, default: false },
  },
  { _id: false },
);

/** Embedded starter file handed to every student's working copy. */
const CodingFileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, maxlength: 120 },
    content: { type: String, default: "" },
    language: { type: String, default: null },
    isMain: { type: Boolean, default: false },
  },
  { _id: false },
);

/**
 * Coding assignment.
 *
 * A teacher-authored brief targeting a course cohort: allowed
 * languages, starter files, deadline, and optional example and
 * test data. Submissions are stored as separate documents so a
 * student's graded work is frozen independently of their
 * personal projects.
 */
const CodingAssignmentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, default: "", trim: true, maxlength: 4000 },
    instructions: { type: String, default: "", trim: true, maxlength: 8000 },

    facultyUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    sectionCodes: { type: [String], default: [] },
    semester: { type: Number, default: null },
    program: { type: String, default: null, uppercase: true, trim: true },
    academicYear: { type: String, default: null, trim: true },

    allowedLanguages: { type: [String], default: [] },
    starterFiles: { type: [CodingFileSchema], default: [] },
    exampleInput: { type: String, default: "", maxlength: 8000 },
    exampleOutput: { type: String, default: "", maxlength: 8000 },
    testCases: { type: [CodingTestCaseSchema], default: [] },

    audience: { type: AudienceSchema, default: () => normalizeAudienceInput({}) },

    opensAt: { type: Date, default: null },
    dueAt: { type: Date, required: true, index: true },
    maxMarks: { type: Number, default: 100, min: 0 },

    status: {
      type: String,
      enum: CODING_ASSIGNMENT_STATUSES,
      default: "OPEN",
      index: true,
    },
    closedAt: { type: Date, default: null },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

CodingAssignmentSchema.index({ course: 1, dueAt: -1 });
CodingAssignmentSchema.index({ status: 1, dueAt: 1 });

export const CodingAssignment = mongoose.model("CodingAssignment", CodingAssignmentSchema);
