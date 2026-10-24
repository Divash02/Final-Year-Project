import mongoose from "mongoose";

/**
 * Academic Decision Version.
 *
 * Stores the history of changes to an academic decision.
 */
const AcademicDecisionVersionSchema = new mongoose.Schema(
  {
    decision: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicDecision",
      required: true,
      index: true,
    },
    version: {
      type: Number,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 12000,
      default: "",
    },
    category: {
      type: String,
      required: true,
      enum: [
        "ASSIGNMENT_REQUIREMENTS",
        "PROJECT_TITLE_APPROVAL",
        "GROUP_MEMBERSHIP",
        "DEADLINE_CHANGE",
        "SUBMISSION_REQUIREMENTS",
        "PROJECT_MILESTONES",
        "GRADING_CLARIFICATION",
        "ATTENDANCE_REQUIREMENT",
        "EXAM_SCHEDULE",
        "COURSE_POLICY",
        "OTHER",
      ],
    },
    effectiveDate: {
      type: Date,
      default: null,
    },
    affectedStudents: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    }],
    affectedGroups: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      index: true,
    }],
    followUpActions: [{
      description: { type: String, trim: true, maxlength: 500 },
      dueAt: { type: Date },
      responsibleRole: { type: String, trim: true, maxlength: 50 },
    }],
    responseDeadline: {
      type: Date,
      default: null,
    },
    requiresAcknowledgement: {
      type: Boolean,
      default: false,
    },
    attachments: [{
      fileId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "StoredFile",
        required: true,
      },
      originalName: { type: String, required: true },
      mimeType: { type: String, required: true },
      sizeBytes: { type: Number, required: true },
    }],
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    changeReason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    isMaterialChange: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AcademicDecisionVersionSchema.index({ decision: 1, version: -1 });

/**
 * Academic Decision.
 *
 * Official academic decisions published by authorized staff.
 * Supports versioning, audit trail, and acknowledgement tracking.
 */
const AcademicDecisionSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    sectionCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 10,
      index: true,
    },
    semester: {
      type: Number,
      min: 1,
      max: 12,
      index: true,
    },
    academicYear: {
      type: String,
      maxlength: 20,
    },
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assignment",
      default: null,
      index: true,
    },
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null,
      index: true,
    },
    decisionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 30,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 12000,
    },
    category: {
      type: String,
      required: true,
      enum: [
        "ASSIGNMENT_REQUIREMENTS",
        "PROJECT_TITLE_APPROVAL",
        "GROUP_MEMBERSHIP",
        "DEADLINE_CHANGE",
        "SUBMISSION_REQUIREMENTS",
        "PROJECT_MILESTONES",
        "GRADING_CLARIFICATION",
        "ATTENDANCE_REQUIREMENT",
        "EXAM_SCHEDULE",
        "COURSE_POLICY",
        "OTHER",
      ],
      index: true,
    },
    status: {
      type: String,
      enum: ["DRAFT", "PUBLISHED", "REVISED", "SUPERSEDED"],
      default: "DRAFT",
      index: true,
    },
    decisionMaker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    publishedAt: {
      type: Date,
      default: null,
      index: true,
    },
    effectiveDate: {
      type: Date,
      default: null,
      index: true,
    },
    affectedStudents: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    }],
    affectedGroups: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      index: true,
    }],
    followUpActions: [{
      description: { type: String, trim: true, maxlength: 500 },
      dueAt: { type: Date },
      responsibleRole: { type: String, trim: true, maxlength: 50 },
    }],
    responseDeadline: {
      type: Date,
      default: null,
    },
    requiresAcknowledgement: {
      type: Boolean,
      default: false,
    },
    acknowledgementCount: {
      type: Number,
      default: 0,
    },
    targetAcknowledgementCount: {
      type: Number,
      default: 0,
    },
    attachments: [{
      fileId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "StoredFile",
        required: true,
      },
      originalName: { type: String, required: true },
      mimeType: { type: String, required: true },
      sizeBytes: { type: Number, required: true },
    }],
    currentVersion: {
      type: Number,
      default: 1,
    },
    supersededBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicDecision",
      default: null,
    },
    supersedes: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicDecision",
      default: null,
    },
  },
  { timestamps: true }
);

AcademicDecisionSchema.index({ course: 1, status: 1, publishedAt: -1 });
AcademicDecisionSchema.index({ course: 1, sectionCode: 1, semester: 1, status: 1 });
AcademicDecisionSchema.index({ decisionMaker: 1, createdAt: -1 });

export const ACADEMIC_DECISION_CATEGORIES = [
  "ASSIGNMENT_REQUIREMENTS",
  "PROJECT_TITLE_APPROVAL",
  "GROUP_MEMBERSHIP",
  "DEADLINE_CHANGE",
  "SUBMISSION_REQUIREMENTS",
  "PROJECT_MILESTONES",
  "GRADING_CLARIFICATION",
  "ATTENDANCE_REQUIREMENT",
  "EXAM_SCHEDULE",
  "COURSE_POLICY",
  "OTHER",
];

export const ACADEMIC_DECISION_LIFECYCLE = [
  "DRAFT",
  "PUBLISHED",
  "REVISED",
  "SUPERSEDED",
];

export const AcademicDecision = mongoose.model("AcademicDecision", AcademicDecisionSchema);
export const AcademicDecisionVersion = mongoose.model("AcademicDecisionVersion", AcademicDecisionVersionSchema);