import mongoose from "mongoose";
import { AudienceSchema, normalizeAudienceInput } from "./Audience.js";
import { FileReferenceSchema } from "./StoredFile.js";

export const ACADEMIC_EVENT_TYPES = [
  "SEMESTER_START",
  "SEMESTER_END",
  "REGISTRATION",
  "ORIENTATION",
  "HOLIDAY",
  "EXAMINATION",
  "ASSIGNMENT_DEADLINE",
  "PROJECT_SUBMISSION",
  "RESULT_PUBLICATION",
  "ADMISSION",
  "PUBLIC_HOLIDAY",
  "COLLEGE_EVENT",
  "OTHER",
];

const AcademicCalendarEventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, default: "", trim: true, maxlength: 4000 },
    eventType: {
      type: String,
      enum: ACADEMIC_EVENT_TYPES,
      default: "OTHER",
      index: true,
    },

    /** Inclusive ISO calendar dates (`YYYY-MM-DD`). */
    startDate: { type: String, required: true, index: true },
    endDate: { type: String, required: true },
    /** Optional `HH:mm` local wall-clock times; an all-day event omits both. */
    startTime: { type: String, default: null, trim: true },
    endTime: { type: String, default: null, trim: true },
    allDay: { type: Boolean, default: true },

    academicYear: { type: String, required: true, trim: true, index: true },
    semester: { type: Number, default: null, index: true },

    /**
     * Institutional targeting. `audience` is authoritative; the flat cohort
     * fields below are the quick-glance cohort the record was created for and
     * are kept consistent with `audience.target` by the route layer.
     */
    audience: { type: AudienceSchema, default: () => normalizeAudienceInput({}) },
    batch: { type: String, default: null, trim: true, index: true },
    section: { type: String, default: null, uppercase: true, trim: true },

    attachment: { type: FileReferenceSchema, default: null },

    status: {
      type: String,
      enum: ["PUBLISHED", "DRAFT", "CANCELLED"],
      default: "PUBLISHED",
      index: true,
    },
    cancellationReason: { type: String, default: null, trim: true, maxlength: 500 },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

AcademicCalendarEventSchema.index({ startDate: 1, endDate: 1 });
AcademicCalendarEventSchema.index({ academicYear: 1, eventType: 1 });

export const AcademicCalendarEvent = mongoose.model(
  "AcademicCalendarEvent",
  AcademicCalendarEventSchema,
);
