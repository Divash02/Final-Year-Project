import mongoose from "mongoose";
import { AudienceSchema, normalizeAudienceInput, isEmptySpecificTarget } from "./Audience.js";
import { FileReferenceSchema } from "./StoredFile.js";

export const ACADEMIC_DOCUMENT_CATEGORIES = [
  "ACADEMIC_PLANNER",
  "EXAMINATION_SCHEDULE",
  "HOLIDAY_CALENDAR",
  "SEMESTER_CALENDAR",
  "ADMISSION_CALENDAR",
  "REGISTRATION_SCHEDULE",
  "ORIENTATION_SCHEDULE",
  "PROJECT_THESIS_SCHEDULE",
  "RESULT_SCHEDULE",
  "OTHER_OFFICIAL_ACADEMIC_DOCUMENT",
];

export const ACADEMIC_DOCUMENT_LIFECYCLE = [
  "DRAFT",
  "UNDER_REVIEW",
  "APPROVED",
  "PUBLISHED",
  "ARCHIVED",
];

const AcademicCalendarDocumentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "", trim: true, maxlength: 4000 },
    category: {
      type: String,
      enum: ACADEMIC_DOCUMENT_CATEGORIES,
      default: "OTHER_OFFICIAL_ACADEMIC_DOCUMENT",
      index: true,
    },

    academicYear: { type: String, required: true, trim: true, index: true },
    semester: { type: Number, default: null, index: true },

    audience: { type: AudienceSchema, default: () => normalizeAudienceInput({}) },

    file: { type: FileReferenceSchema, required: true },

    version: { type: Number, default: 1, min: 1 },
    previousVersionId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicCalendarDocument", default: null },
    versionReason: { type: String, default: null, trim: true, maxlength: 500 },

    lifecycleState: {
      type: String,
      enum: ACADEMIC_DOCUMENT_LIFECYCLE,
      default: "DRAFT",
      index: true,
    },

    effectiveFrom: { type: String, default: null, trim: true, index: true },
    effectiveTo: { type: String, default: null, trim: true, index: true },

    publishedAt: { type: Date, default: null },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

AcademicCalendarDocumentSchema.index({ academicYear: 1, category: 1 });
AcademicCalendarDocumentSchema.index({ lifecycleState: 1, academicYear: 1 });

export const AcademicCalendarDocument = mongoose.model(
  "AcademicCalendarDocument",
  AcademicCalendarDocumentSchema,
);