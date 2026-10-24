import mongoose from "mongoose";
import { AudienceSchema, normalizeAudienceInput } from "./Audience.js";

/**
 * Class Summary.
 *
 * Authorized lecturers record important information discussed during class.
 * Students can read published summaries after class.
 */
const ClassSummarySchema = new mongoose.Schema(
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
    discussionDate: {
      type: Date,
      required: true,
      index: true,
    },
    classSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Timetable",
      default: null,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    summary: {
      type: String,
      required: true,
      trim: true,
      maxlength: 12000,
    },
    instructions: {
      type: String,
      trim: true,
      maxlength: 8000,
      default: "",
    },
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assignment",
      default: null,
      index: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CodingProject",
      default: null,
      index: true,
    },
    relevantDeadlines: [{
      label: { type: String, trim: true, maxlength: 120 },
      dueAt: { type: Date, required: true },
    }],
    relatedDiscussion: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DiscussionThread",
      default: null,
      index: true,
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
    authorUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["DRAFT", "PUBLISHED", "ARCHIVED"],
      default: "DRAFT",
      index: true,
    },
    publishedAt: {
      type: Date,
      default: null,
      index: true,
    },
    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    version: {
      type: Number,
      default: 1,
    },
    previousVersion: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClassSummary",
      default: null,
    },
    changeReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
  },
  { timestamps: true }
);

ClassSummarySchema.index({ course: 1, status: 1, discussionDate: -1 });
ClassSummarySchema.index({ course: 1, sectionCode: 1, semester: 1, status: 1 });

export const CLASS_SUMMARY_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"];

export const ClassSummary = mongoose.model("ClassSummary", ClassSummarySchema);