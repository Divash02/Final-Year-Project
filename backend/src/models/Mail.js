import mongoose from "mongoose";

const AttachmentSchema = new mongoose.Schema(
  {
    fileName: { type: String, required: true },
    fileUrl: { type: String, required: true },
    fileSize: { type: Number, default: 0 },
    fileType: { type: String, default: "application/octet-stream" },
  },
  { _id: false }
);

const UserMailStatusSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    folder: {
      type: String,
      enum: ["inbox", "sent", "drafts", "trash", "starred", "archive"],
      default: "inbox",
      index: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    isStarred: {
      type: Boolean,
      default: false,
      index: true,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const MailSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    senderEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    senderName: {
      type: String,
      default: "",
    },
    recipientEmails: [
      {
        type: String,
        lowercase: true,
        trim: true,
      },
    ],
    ccEmails: [
      {
        type: String,
        lowercase: true,
        trim: true,
      },
    ],
    bccEmails: [
      {
        type: String,
        lowercase: true,
        trim: true,
      },
    ],
    recipients: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        index: true,
      },
    ],
    subject: {
      type: String,
      required: true,
      trim: true,
      default: "(no subject)",
    },
    body: {
      type: String,
      required: true,
      default: "",
    },
    attachments: [AttachmentSchema],
    isDraft: {
      type: Boolean,
      default: false,
      index: true,
    },
    userStates: [UserMailStatusSchema],
  },
  {
    timestamps: true,
  }
);

MailSchema.index({ "userStates.user": 1, "userStates.folder": 1, createdAt: -1 });
MailSchema.index({ "userStates.user": 1, "userStates.isStarred": 1 });
MailSchema.index({ sender: 1, createdAt: -1 });

export const Mail = mongoose.model("Mail", MailSchema);
