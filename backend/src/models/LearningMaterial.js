import mongoose from "mongoose";
import { AudienceSchema, normalizeAudienceInput } from "./Audience.js";
import { FileReferenceSchema } from "./StoredFile.js";

/**
 * Learning material — one LMS artefact attached to a course week.
 *
 * A material can be an uploaded file (lecture slides, a PDF, a handout), an
 * external link, an embedded page, a video/audio reference, or a written
 * reading. `materialType` records which of those it is; `file` is therefore only
 * required for a real upload, while `url` and `content` carry the other kinds.
 *
 * `status` is the student-visible publishing state, and `releaseAt` lets a
 * teacher schedule a release. The state a student experiences is derived from
 * these fields plus the server clock (`services/lms/materialState.js`), so a
 * scheduled material becomes visible at its release time without the teacher
 * opening it.
 *
 * `week` is optional so the pre-existing course-level materials library keeps
 * working: a material without a week is simply a course resource.
 */
export const MATERIAL_STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "PUBLISHED",
  "HIDDEN",
  "ARCHIVED",
];

export const MATERIAL_TYPES = [
  "FILE",
  "SLIDES",
  "DOCUMENT",
  "IMAGE",
  "ARCHIVE",
  "VIDEO",
  "AUDIO",
  "LINK",
  "EMBED",
  "READING",
  "TEXT",
];

/** The state a member of the target cohort actually experiences. */
export const MATERIAL_EFFECTIVE_STATES = [
  "DRAFT",
  "SCHEDULED",
  "PUBLISHED",
  "HIDDEN",
  "ARCHIVED",
];

const LearningMaterialSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, default: "", trim: true, maxlength: 4000 },
    topic: { type: String, default: null, trim: true, maxlength: 160 },

    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    /** Course week this material belongs to; null = course-level resource. */
    week: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CourseWeek",
      default: null,
      index: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    materialType: { type: String, enum: MATERIAL_TYPES, default: "FILE" },
    /** Required for a real upload; absent for link/embed/text materials. */
    file: { type: FileReferenceSchema, default: null },
    /** External link or media URL for LINK / VIDEO / AUDIO / EMBED. */
    url: { type: String, default: null, trim: true, maxlength: 2000 },
    /** Rich text body for TEXT / READING material. */
    content: { type: String, default: "", maxlength: 40000 },
    /** Estimated reading/viewing time in minutes, for student planning. */
    estimatedMinutes: { type: Number, default: null, min: 0, max: 10000 },

    academicYear: { type: String, required: true, trim: true, index: true },
    program: { type: String, default: null, uppercase: true, trim: true },
    batch: { type: String, default: null, trim: true },
    semester: { type: Number, default: null, index: true },
    sectionCodes: { type: [String], default: [] },

    audience: { type: AudienceSchema, default: () => normalizeAudienceInput({}) },
    status: {
      type: String,
      enum: MATERIAL_STATUSES,
      default: "PUBLISHED",
      index: true,
    },
    /** Scheduled release instant; meaningful when `status` is SCHEDULED. */
    releaseAt: { type: Date, default: null, index: true },
    publishedAt: { type: Date, default: null },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    /** Students may download the file; otherwise the file opens in the browser. */
    allowDownload: { type: Boolean, default: true },
    /** Replaced uploads keep the previous file reference for the audit trail. */
    replacedFileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StoredFile",
      default: null,
    },
    /**
     * Version lineage.
     *
     * Replacing a presentation must not destroy the record of what the cohort was
     * taught, so a replacement is a *new* material row with the next `version`
     * number that points back at the row it supersedes. The previous version stays
     * retrievable, which is also what keeps teaching progress attached to the
     * document the teacher was actually holding.
     */
    version: { type: Number, default: 1, min: 1 },
    supersedes: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LearningMaterial",
      default: null,
      index: true,
    },
    supersededBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LearningMaterial",
      default: null,
      index: true,
    },
    /**
     * Structural facts read from the file itself (slide count, page count).
     *
     * Detected on upload from the real bytes, never declared by the uploader, and
     * nullable throughout: an unreadable or unsupported file simply has no count
     * and the teacher records positions manually.
     */
    documentMeta: {
      pageCount: { type: Number, default: null, min: 1 },
      slideCount: { type: Number, default: null, min: 1 },
      /** How many units the teacher can mark against, when it is knowable. */
      unitCount: { type: Number, default: null, min: 1 },
      unitLabel: {
        type: String,
        enum: ["slide", "page", "section"],
        default: "slide",
      },
      detectedBy: { type: String, trim: true, default: null },
      detectedAt: { type: Date, default: null },
    },
    downloadCount: { type: Number, default: 0 },
    /** Set once a student opens the material, for participation reporting. */
    firstViewedAt: { type: Date, default: null },
    viewCount: { type: Number, default: 0 },

    /**
     * The teacher's own last-confirmed teaching position in this document.
     *
     * Written only from an explicit `TeachingProgress` declaration. Never advanced
     * by opening or downloading the file: `firstViewedAt` records that access
     * happened, these fields record that the teacher said they taught the material
     * up to a point. Keeping them apart is what stops CollegeOS from claiming to
     * know what was actually covered in a class.
     */
    lastTaughtAt: { type: String, default: null },
    lastTaughtFromUnit: { type: Number, default: null, min: 1 },
    lastTaughtToUnit: { type: Number, default: null, min: 1 },
    lastTaughtTopic: { type: String, trim: true, maxlength: 500, default: "" },
    lastTaughtNotes: { type: String, trim: true, maxlength: 4000, default: "" },

    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

LearningMaterialSchema.index({ course: 1, createdAt: -1 });
LearningMaterialSchema.index({ course: 1, week: 1, createdAt: -1 });
LearningMaterialSchema.index({ status: 1, releaseAt: 1 });

export const LearningMaterial = mongoose.model(
  "LearningMaterial",
  LearningMaterialSchema,
);