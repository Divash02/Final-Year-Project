import mongoose from "mongoose";

/**
 * Group.
 *
 * Groups associated with a course and assignment for project work.
 */
const GroupSchema = new mongoose.Schema(
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
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
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
    minSize: {
      type: Number,
      default: 2,
      min: 1,
      max: 50,
    },
    maxSize: {
      type: Number,
      default: 5,
      min: 1,
      max: 50,
    },
    sectionCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 10,
      default: "",
    },
    leader: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ["FORMING", "OPEN_FOR_SELECTION", "FINALIZED", "ARCHIVED"],
      default: "FORMING",
      index: true,
    },
    selectionOpensAt: {
      type: Date,
      default: null,
    },
    selectionClosesAt: {
      type: Date,
      default: null,
    },
    finalizedAt: {
      type: Date,
      default: null,
    },
    finalizedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    memberIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    }],
  },
  { timestamps: true }
);

GroupSchema.index({ course: 1, assignment: 1, status: 1 });
GroupSchema.index({ course: 1, sectionCode: 1, semester: 1, status: 1 });

export const GROUP_STATUSES = [
  "FORMING",
  "OPEN_FOR_SELECTION",
  "FINALIZED",
  "ARCHIVED",
];

export const Group = mongoose.model("Group", GroupSchema);