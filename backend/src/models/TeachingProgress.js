import mongoose from "mongoose";

/**
 * Teaching progress — a teacher's confirmed position inside a document.
 *
 * The real problem this solves is narrow and practical: a teacher uploads a
 * twenty-slide deck for Week 1, teaches slides 1 to 12 in class, and three days
 * later cannot remember where they stopped. Opening the file again is no help,
 * because "opened" and "taught" are different facts.
 *
 * So the two are recorded separately:
 *  - `LearningMaterial.firstViewedAt` / `viewCount` say a file was opened. That is
 *    a passive event and never implies anything was taught.
 *  - This document says the teacher *declared* a covered range. Only the teacher
 *    can write it, so the system never claims to know what was actually taught.
 *
 * Each record is one teaching session against one material version, optionally
 * tied to the class session it happened in, so the same class is not entered
 * twice: the timetable session, the attendance session and the teaching record
 * all reference the same moment.
 *
 * `totalUnits` is a snapshot of the document length taken when the position was
 * recorded. It is copied rather than read live because a later upload changes the
 * file, and history must keep reporting the progress the teacher actually
 * achieved against the deck they were holding at the time.
 */
const TeachingProgressSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    material: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LearningMaterial",
      required: true,
      index: true,
    },
    /**
     * The material version this position refers to. A replacement upload creates
     * a new material row, so progress on "Introduction v1" is never silently
     * re-interpreted against "Introduction v2".
     */
    materialVersion: { type: Number, default: 1 },

    /** Section(s) the class was delivered to. */
    sectionCode: { type: String, uppercase: true, trim: true, index: true },
    sectionCodes: { type: [String], default: [] },

    /** The class session, when the record was written from the timetable. */
    timetableSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Timetable",
      default: null,
      index: true,
    },
    attendanceSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AttendanceSession",
      default: null,
      index: true,
    },

    facultyUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /** Teaching date as institution wall-clock calendar day. */
    taughtOn: { type: String, required: true, index: true },
    /** Optional wall-clock window of the class that carried this position. */
    sessionStartTime: { type: String, trim: true, default: null },
    sessionEndTime: { type: String, trim: true, default: null },
    /** Free-text class label, e.g. "Lecture 4". */
    sessionName: { type: String, trim: true, maxlength: 120, default: "" },
    classType: { type: String, trim: true, maxlength: 40, default: null },

    /** Units the class started from (1-based, inclusive). */
    fromUnit: { type: Number, required: true, min: 1 },
    /** Units the class finished on (1-based, inclusive). */
    toUnit: { type: Number, required: true, min: 1 },
    /** Snapshot of the document length when this position was recorded. */
    totalUnits: { type: Number, default: null, min: 1 },
    /** What the units mean for this file: "slide", "page" or "section". */
    unitLabel: {
      type: String,
      enum: ["slide", "page", "section"],
      default: "slide",
    },

    /** Topic actually covered, as taught. */
    topic: { type: String, trim: true, maxlength: 500, default: "" },
    /** The teacher's own note for the next class. */
    notes: { type: String, trim: true, maxlength: 4000, default: "" },
    /** Explicit "resume here" hint; defaults to the next unit after `toUnit`. */
    nextStartUnit: { type: Number, default: null, min: 1 },

    /** Course week this delivery belonged to, when known. */
    week: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CourseWeek",
      default: null,
      index: true,
    },

    recordedAt: { type: Date, default: Date.now, index: true },
    updatedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

TeachingProgressSchema.index({ material: 1, taughtOn: -1 });
TeachingProgressSchema.index({ course: 1, taughtOn: -1 });
TeachingProgressSchema.index({ facultyUser: 1, taughtOn: -1 });

export const TeachingProgress = mongoose.model(
  "TeachingProgress",
  TeachingProgressSchema,
);

export const TEACHING_UNIT_LABELS = ["slide", "page", "section"];