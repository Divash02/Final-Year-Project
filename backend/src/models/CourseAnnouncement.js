import mongoose from "mongoose";
import { AudienceSchema, normalizeAudienceInput } from "./Audience.js";

/**
 * Course announcement.
 *
 * A dated, auditable message inside a course rather than free-floating mail,
 * so students keep the academic context. `alsoSendMail` reuses the centralised
 * College Mail service instead of sending anything itself, so announcements do
 * not become a second communication system.
 */
const CourseAnnouncementSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    week: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CourseWeek",
      default: null,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    body: { type: String, required: true, trim: true, maxlength: 12000 },
    /** Pinned announcements stay at the top of the course feed. */
    pinned: { type: Boolean, default: false, index: true },
    /** Optional scheduled publication in institution time. */
    publishAt: { type: Date, default: null },
    publishedAt: { type: Date, default: null },

    audience: { type: AudienceSchema, default: () => normalizeAudienceInput({}) },
    /** Mirror the announcement through College Mail on publish. */
    alsoSendMail: { type: Boolean, default: false },
    mailSentAt: { type: Date, default: null },
    mailRecipientCount: { type: Number, default: 0 },

    authorUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

CourseAnnouncementSchema.index({ course: 1, pinned: -1, publishedAt: -1 });

export const CourseAnnouncement = mongoose.model(
  "CourseAnnouncement",
  CourseAnnouncementSchema,
);