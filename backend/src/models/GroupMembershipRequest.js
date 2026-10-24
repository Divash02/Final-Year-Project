import mongoose from "mongoose";

/**
 * Group Membership Request.
 *
 * Tracks student requests to join groups, invitations, and assignments.
 */
const GroupMembershipRequestSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
      index: true,
    },
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
      required: true,
      index: true,
    },
    semester: {
      type: Number,
      min: 1,
      max: 12,
      index: true,
    },
    type: {
      type: String,
      enum: ["JOIN_REQUEST", "INVITATION", "ASSIGNMENT"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "EXPIRED"],
      default: "PENDING",
      index: true,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    respondedAt: {
      type: Date,
      default: null,
    },
    respondedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    responseNote: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    studentMessage: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    isStudentInitiated: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

GroupMembershipRequestSchema.index({ group: 1, student: 1, type: 1, status: 1 });
GroupMembershipRequestSchema.index({ student: 1, assignment: 1, status: 1 });
GroupMembershipRequestSchema.index({ group: 1, status: 1 });

export const GROUP_MEMBERSHIP_TYPES = ["JOIN_REQUEST", "INVITATION", "ASSIGNMENT"];
export const GROUP_MEMBERSHIP_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "EXPIRED"];

export const GroupMembershipRequest = mongoose.model("GroupMembershipRequest", GroupMembershipRequestSchema);