import mongoose from "mongoose";
import { FileReferenceSchema } from "./StoredFile.js";
import { AudienceSchema } from "./Audience.js";

/**
 * Institutional notice.
 *
 * `content` remains the plain-text body every existing client renders, so
 * old notices keep working. `contentHtml` carries the sanitized rich-text
 * composition from the notice editor; it is never trusted on render — the
 * server strips it down to a strict allow-list on write and the client
 * sanitizes again before it reaches `innerHTML`.
 *
 * `attachments` embeds the same `FileReferenceSchema` the academic
 * calendar uses: the binary lives in `StoredFile` (module
 * `notice_attachment`), the notice only carries identifiers, so no
 * document ever stores file bytes inside MongoDB.
 */
const NoticeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    /** Sanitized rich-text HTML; null for legacy plain-text notices. */
    contentHtml: { type: String, default: null },
    category: {
      type: String,
      enum: ["ACADEMIC", "EXAMINATION", "ADMINISTRATIVE", "EVENT", "URGENT", "HOLIDAY"],
      default: "ACADEMIC",
    },
    priority: { type: String, enum: ["LOW", "NORMAL", "HIGH", "URGENT"], default: "NORMAL" },
    authorUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    targetRoles: [{ type: String, default: "ALL" }],
    targetUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    /** Cohort targeting (programme, batch, semester, section) — same shape as calendar events. */
    audience: { type: AudienceSchema, default: () => ({ targetType: "ALL", target: {} }) },
    examId: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", default: null, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
    publishedAt: { type: Date, default: Date.now, index: true },
    expiresAt: { type: Date, default: null, index: true },
    attachmentUrl: { type: String, default: null },
    /**
     * Lifecycle: DRAFT is invisible to every reader except its author
     * and notice managers; ARCHIVED is withdrawn from every view.
     * Existing notices default to PUBLISHED, so historical records
     * behave exactly as before.
     */
    status: {
      type: String,
      enum: ["DRAFT", "PUBLISHED", "ARCHIVED"],
      default: "PUBLISHED",
      index: true,
    },
    attachments: [FileReferenceSchema],
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

NoticeSchema.index({ category: 1, publishedAt: -1 });
NoticeSchema.index({ status: 1, expiresAt: 1 });

export const Notice = mongoose.model("Notice", NoticeSchema);
