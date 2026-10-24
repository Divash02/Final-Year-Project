import mongoose from "mongoose";

/**
 * Project Proposal.
 *
 * Formal project-title workflow connected to course, group, and assignment.
 * Students submit proposals, lecturers review and approve/reject.
 */
const ProjectProposalSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assignment",
      required: true,
      index: true,
    },
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null,
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
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 8000,
      default: "",
    },
    objectives: {
      type: String,
      trim: true,
      maxlength: 4000,
      default: "",
    },
    status: {
      type: String,
      enum: ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "REVISION_REQUIRED", "APPROVED", "REJECTED"],
      default: "DRAFT",
      index: true,
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    studentIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    }],
    submittedAt: {
      type: Date,
      default: null,
      index: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewFeedback: {
      type: String,
      trim: true,
      maxlength: 4000,
      default: "",
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
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
    version: {
      type: Number,
      default: 1,
    },
    previousVersion: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProjectProposal",
      default: null,
    },
    duplicateOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProjectProposal",
      default: null,
      index: true,
    },
    duplicateCheckNote: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

ProjectProposalSchema.index({ course: 1, assignment: 1, status: 1 });
ProjectProposalSchema.index({ submittedBy: 1, status: 1, createdAt: -1 });
ProjectProposalSchema.index({ group: 1, assignment: 1, status: 1 });

export const PROJECT_PROPOSAL_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "REVISION_REQUIRED",
  "APPROVED",
  "REJECTED",
];

export const ProjectProposal = mongoose.model("ProjectProposal", ProjectProposalSchema);