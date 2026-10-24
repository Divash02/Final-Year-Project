import mongoose from "mongoose";
import { AudienceSchema, normalizeAudienceInput } from "./Audience.js";

export const ASSIGNMENT_TYPES = [
  "ESSAY",
  "PROJECT",
  "REPORT",
  "PRESENTATION",
  "PRACTICAL",
  "PROBLEM_SET",
  "OTHER",
];

export const ASSIGNMENT_ATTEMPT_POLICIES = ["SINGLE", "MULTIPLE"];
export const ASSIGNMENT_STATUSES = ["DRAFT", "SCHEDULED", "OPEN", "CLOSED", "ARCHIVED"];

/**
 * Assignment.
 *
 * One document is the whole academic workflow: the brief a teacher writes, the
 * cohort it is targeted at (`audience`, enforced server-side), the submission
 * rules (allowed file types, maximum size, attempt policy) and the grading
 * window. Grades live on the matching `Submission` document, so a mark can
 * never exist without the submission it belongs to.
 */
const AssignmentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, default: "", trim: true, maxlength: 4000 },
    instructions: { type: String, default: "", trim: true, maxlength: 8000 },

    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    /**
     * Course week this assignment belongs to, so the weekly planner can show
     * "what is due in Week 6" without a second scheduling table. Optional:
     * an assignment created outside the planner stays a course-level deadline.
     */
    week: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CourseWeek",
      default: null,
      index: true,
    },
    facultyUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    assignmentType: {
      type: String,
      enum: ASSIGNMENT_TYPES,
      default: "ESSAY",
    },

    /** Window during which submissions are accepted. */
    opensAt: { type: Date, default: null },
    dueAt: { type: Date, default: null, index: true },
    maxMarks: { type: Number, default: 100, min: 0 },

    /** Extensions accepted for submissions, validated server-side on upload. */
    allowedFileTypes: {
      type: [String],
      default: ["pdf", "doc", "docx", "ppt", "pptx"],
    },
    maxFileSizeMb: { type: Number, default: 10, min: 1, max: 100 },
    attemptPolicy: {
      type: String,
      enum: ASSIGNMENT_ATTEMPT_POLICIES,
      default: "MULTIPLE",
    },
    /** Whether a submission may be replaced after it is submitted. */
    allowReplacement: { type: Boolean, default: true },
    /** Whether a similarity check is requested for this assignment. */
    similarityCheckEnabled: { type: Boolean, default: false },

    audience: { type: AudienceSchema, default: () => normalizeAudienceInput({}) },
    academicYear: { type: String, required: true, trim: true, index: true },
    program: { type: String, default: null, uppercase: true, trim: true },
    batch: { type: String, default: null, trim: true },
    semester: { type: Number, default: null, index: true },
    /** Convenience mirror of `audience.target.sectionCodes` for list filtering. */
    sectionCodes: { type: [String], default: [] },

    status: {
      type: String,
      enum: ASSIGNMENT_STATUSES,
      default: "OPEN",
      index: true,
    },
    closedAt: { type: Date, default: null },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

AssignmentSchema.index({ course: 1, dueAt: -1 });
AssignmentSchema.index({ status: 1, dueAt: 1 });

export const Assignment = mongoose.model("Assignment", AssignmentSchema);
