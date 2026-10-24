import mongoose from "mongoose";

export const WEEK_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"];

/**
 * Course week — the unit of course delivery.
 *
 * A week is the spine of the academic journey: objectives, materials,
 * assignments and quizzes all hang off it, so a student sees the course as a
 * sequence of teaching units rather than an undifferentiated file list.
 *
 * `weekNumber` is system-controlled. It is allocated from the highest existing
 * number for the course and is never re-used, so a deleted or archived week
 * cannot make "Week 4" silently become "Week 5" and orphan the submissions,
 * attempts and grades that already reference it. Teachers edit `title` (the
 * topic); the identity of the week stays with the system.
 */
const CourseWeekSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    /** System-allocated, immutable within a course. */
    weekNumber: { type: Number, required: true, min: 1, index: true },
    /** The teacher-editable topic, e.g. "Arrays and Linked Lists". */
    title: { type: String, required: true, trim: true, maxlength: 180 },

    /** Rich teaching description shown to students when the week is published. */
    description: { type: String, default: "", trim: true, maxlength: 12000 },
    /** "What will be covered this week?" */
    teachingPlan: { type: String, default: "", trim: true, maxlength: 12000 },
    /** "Expected Learning Outcome". */
    expectedOutcome: { type: String, default: "", trim: true, maxlength: 8000 },
    /** Student-facing study guidance for the week. */
    studyTimeMinutes: { type: Number, default: null, min: 0, max: 100000 },

    /**
     * Teacher-only working notes for the week.
     *
     * Deliberately separate from `teachingPlan` and `expectedOutcome`, which are
     * student-facing teaching copy: this is where a lecturer keeps what to stress,
     * what slipped, and where to resume. It is never released to the cohort.
     */
    notes: { type: String, default: "", trim: true, maxlength: 8000 },

    /** Manual ordering; ties fall back to `weekNumber`. */
    position: { type: Number, default: 0, index: true },
    /** The original week this one was duplicated from, when applicable. */
    duplicatedFrom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CourseWeek",
      default: null,
    },

    status: {
      type: String,
      enum: WEEK_STATUSES,
      default: "DRAFT",
      index: true,
    },
    /** When the week becomes visible to students (optional scheduled release). */
    releaseAt: { type: Date, default: null },
    publishedAt: { type: Date, default: null },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    /** Retired weeks keep every reference so history stays resolvable. */
    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

CourseWeekSchema.index({ course: 1, weekNumber: 1 }, { unique: true });
CourseWeekSchema.index({ course: 1, status: 1, position: 1 });

export const CourseWeek = mongoose.model("CourseWeek", CourseWeekSchema);