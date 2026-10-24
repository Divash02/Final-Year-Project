import mongoose from "mongoose";

export const CODING_SHARE_TYPES = ["COURSE", "SECTION", "STUDENTS"];
export const CODING_SHARE_PERMISSIONS = ["VIEW", "COPY"];

/**
 * Teacher-to-student project sharing.
 *
 * A share is a capability record, not a link: it grants students in a
 * course, a section, or an explicit list access to one teacher-owned
 * project. Sharing never bypasses authentication — the recipient must
 * still be an enrolled student, and the teacher must be authorised for
 * the target course/section (checked at share creation in the route
 * layer). `permission` distinguishes view-only starters from
 * open-as-copy templates.
 */
const CodingShareSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CodingProject",
      required: true,
      index: true,
    },
    sharedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    shareType: {
      type: String,
      enum: CODING_SHARE_TYPES,
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      default: null,
      index: true,
    },
    sectionCode: { type: String, default: null, trim: true, maxlength: 20 },
    /** Explicit student user ids for shareType STUDENTS. */
    studentUsers: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    ],
    permission: {
      type: String,
      enum: CODING_SHARE_PERMISSIONS,
      default: "VIEW",
    },
    expiresAt: { type: Date, default: null, index: true },
    revokedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

CodingShareSchema.index({ project: 1, revokedAt: 1 });
CodingShareSchema.index({ course: 1, sectionCode: 1, revokedAt: 1 });

export const CodingShare = mongoose.model("CodingShare", CodingShareSchema);
