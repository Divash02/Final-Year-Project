import mongoose from "mongoose";

/**
 * Action Item.
 *
 * Personal actions for students derived from discussions, decisions, assignments, and group activities.
 */
const ActionItemSchema = new mongoose.Schema(
  {
    student: {
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
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assignment",
      default: null,
      index: true,
    },
    discussion: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DiscussionThread",
      default: null,
      index: true,
    },
    decision: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicDecision",
      default: null,
      index: true,
    },
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null,
      index: true,
    },
    proposal: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProjectProposal",
      default: null,
      index: true,
    },
    classSummary: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClassSummary",
      default: null,
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
      trim: true,
      maxlength: 4000,
      default: "",
    },
    type: {
      type: String,
      required: true,
      enum: [
        "READ_CLASS_SUMMARY",
        "SUBMIT_GROUP_PREFERENCE",
        "REQUEST_GROUP_MEMBERSHIP",
        "CONFIRM_GROUP_MEMBERSHIP",
        "SUBMIT_PROJECT_TITLE",
        "REVISE_PROJECT_PROPOSAL",
        "ACKNOWLEDGE_DECISION",
        "RESPOND_TO_LECTURER_QUESTION",
        "COMPLETE_PROJECT_MILESTONE",
        "SUBMIT_ASSIGNMENT",
        "PARTICIPATE_IN_DISCUSSION",
        "OTHER",
      ],
      index: true,
    },
    status: {
      type: String,
      enum: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "OVERDUE", "CANCELLED"],
      default: "NOT_STARTED",
      index: true,
    },
    priority: {
      type: String,
      enum: ["LOW", "NORMAL", "HIGH", "URGENT"],
      default: "NORMAL",
    },
    dueAt: {
      type: Date,
      default: null,
      index: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    sourceEntityType: {
      type: String,
      enum: [
        "CLASS_SUMMARY",
        "DISCUSSION_THREAD",
        "ACADEMIC_DECISION",
        "GROUP",
        "PROJECT_PROPOSAL",
        "ASSIGNMENT",
      ],
      required: true,
    },
    sourceEntityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    actionUrl: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    acknowledged: {
      type: Boolean,
      default: false,
    },
    acknowledgedAt: {
      type: Date,
      default: null,
    },
    isHidden: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

ActionItemSchema.index({ student: 1, status: 1, dueAt: 1 });
ActionItemSchema.index({ student: 1, course: 1, status: 1 });
ActionItemSchema.index({ student: 1, type: 1, status: 1 });

export const ACTION_ITEM_TYPES = [
  "READ_CLASS_SUMMARY",
  "SUBMIT_GROUP_PREFERENCE",
  "REQUEST_GROUP_MEMBERSHIP",
  "CONFIRM_GROUP_MEMBERSHIP",
  "SUBMIT_PROJECT_TITLE",
  "REVISE_PROJECT_PROPOSAL",
  "ACKNOWLEDGE_DECISION",
  "RESPOND_TO_LECTURER_QUESTION",
  "COMPLETE_PROJECT_MILESTONE",
  "SUBMIT_ASSIGNMENT",
  "PARTICIPATE_IN_DISCUSSION",
  "OTHER",
];

export const ACTION_ITEM_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETED",
  "OVERDUE",
  "CANCELLED",
];

export const ActionItem = mongoose.model("ActionItem", ActionItemSchema);