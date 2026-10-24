import mongoose from "mongoose";

/**
 * Discussion Thread.
 *
 * Course-specific, persistent discussion threads for asynchronous discussions.
 */
const DiscussionThreadSchema = new mongoose.Schema(
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
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 8000,
      default: "",
    },
    isOfficial: {
      type: Boolean,
      default: false,
      index: true,
    },
    isPinned: {
      type: Boolean,
      default: false,
      index: true,
    },
    isClosed: {
      type: Boolean,
      default: false,
      index: true,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    closedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assignment",
      default: null,
      index: true,
    },
    participationDeadline: {
      type: Date,
      default: null,
      index: true,
    },
    authorUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tags: [{
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 30,
    }],
    replyCount: {
      type: Number,
      default: 0,
    },
    lastReplyAt: {
      type: Date,
      default: null,
    },
    lastReplyBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

DiscussionThreadSchema.index({ course: 1, isPinned: -1, lastReplyAt: -1 });
DiscussionThreadSchema.index({ course: 1, assignment: 1, isClosed: 1 });
DiscussionThreadSchema.index({ authorUser: 1, createdAt: -1 });

/**
 * Discussion Reply.
 *
 * Replies to discussion threads with support for mentions, attachments, and official clarifications.
 */
const DiscussionReplySchema = new mongoose.Schema(
  {
    thread: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DiscussionThread",
      required: true,
      index: true,
    },
    parentReply: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DiscussionReply",
      default: null,
      index: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 8000,
    },
    isOfficialClarification: {
      type: Boolean,
      default: false,
      index: true,
    },
    authorUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    mentionedUsers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    }],
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
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    moderated: {
      type: Boolean,
      default: false,
    },
    moderatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    moderatedAt: {
      type: Date,
      default: null,
    },
    moderationReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
  },
  { timestamps: true }
);

DiscussionReplySchema.index({ thread: 1, createdAt: 1 });
DiscussionReplySchema.index({ authorUser: 1, createdAt: -1 });

export const DiscussionThread = mongoose.model("DiscussionThread", DiscussionThreadSchema);
export const DiscussionReply = mongoose.model("DiscussionReply", DiscussionReplySchema);