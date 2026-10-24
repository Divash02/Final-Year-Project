import mongoose from "mongoose";

export const TIMETABLE_SESSION_TYPES = [
  "REGULAR_CLASS",
  "LAB",
  "TUTORIAL",
  "EXAM",
  "WORKSHOP",
  "SEMINAR",
  "OTHER",
];

export const TIMETABLE_SESSION_STATUSES = [
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];

/**
 * Institutional timetable lifecycle states.
 *
 * A timetable is not published to students the moment an admin saves it.
 * Draft work happens in the dark; only `PUBLISHED` sessions reach the
 * student portal, and only after the conflicts have been cleared.
 */
export const TIMETABLE_LIFECYCLE_STATES = [
  "DRAFT",
  "UNDER_REVIEW",
  "APPROVED",
  "PUBLISHED",
  "ARCHIVED",
];

/**
 * A timetable session: the recurring weekly slot or the dated class that a
 * course is delivered to a section by a teacher in a room.
 *
 * A session is the single academic record that timetabling, conflict
 * detection and attendance all reference. When a teacher starts the class, the
 * route creates (or reuses) an `AttendanceSession` for the same course,
 * section, date and time and stores its id in `attendanceSession`, so marking
 * attendance never invents a second, disconnected class record.
 */
const TimetableChangeSchema = new mongoose.Schema(
  {
    field: { type: String, required: true, trim: true },
    /** Value before the change, as the teacher saw it. */
    from: { type: String, default: null },
    /** Value after the change. */
    to: { type: String, default: null },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    changedByName: { type: String, trim: true, default: "" },
    reason: { type: String, trim: true, maxlength: 500, default: "" },
    changedAt: { type: Date, default: Date.now },
    /**
     * Whether the affected teacher was told. A change to someone's own class that
     * nobody notified them about is the failure this flag exists to make visible.
     */
    notifiedFaculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    notifiedAt: { type: Date, default: null },
  },
  { _id: false },
);

const TimetableSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    facultyUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    program: { type: String, default: null, uppercase: true, trim: true, index: true },
    batch: { type: String, default: null, trim: true, index: true },
    semester: { type: Number, required: true, index: true },
    sectionCode: { type: String, required: true, uppercase: true, trim: true, index: true },

    room: { type: String, default: null, trim: true },
    building: { type: String, default: null, trim: true },
    /** Room model reference when the room comes from the facilities register. */
    roomRef: { type: mongoose.Schema.Types.ObjectId, ref: "Room", default: null },

    /** Recurring weekday, or the specific date when the slot is a one-off. */
    scheduledDay: { type: String, required: true, trim: true },
    date: { type: String, default: null, trim: true, index: true },
    academicYear: { type: String, required: true, trim: true, index: true },

    /** `HH:mm` 24-hour wall clock. */
    startTime: { type: String, required: true, trim: true },
    endTime: { type: String, required: true, trim: true },

    sessionType: {
      type: String,
      enum: TIMETABLE_SESSION_TYPES,
      default: "REGULAR_CLASS",
      index: true,
    },
    status: {
      type: String,
      enum: TIMETABLE_SESSION_STATUSES,
      default: "SCHEDULED",
      index: true,
    },
    notes: { type: String, default: "", trim: true, maxlength: 1000 },

    /** Linked attendance session, created when the teacher starts the class. */
    attendanceSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AttendanceSession",
      default: null,
    },

    cancellationReason: { type: String, default: null, trim: true, maxlength: 500 },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    /**
     * Institutional lifecycle state.
     *
     * Draft sessions are invisible to students. Only `PUBLISHED` sessions are
     * returned by the student timetable endpoints, so an admin can keep
     * editing a draft without a student ever seeing the half-built schedule.
     */
    lifecycleState: {
      type: String,
      enum: TIMETABLE_LIFECYCLE_STATES,
      default: "DRAFT",
      index: true,
    },
    /** Monotonically increasing version within this cohort's schedule. */
    version: { type: Number, default: 1, min: 1 },
    publishedAt: { type: Date, default: null },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    /** Inclusive effective window for this version of the schedule. */
    effectiveFrom: { type: String, default: null, trim: true, index: true },
    effectiveTo: { type: String, default: null, trim: true, index: true },
    /** Reason recorded when this version was published or replaced. */
    publishReason: { type: String, default: null, trim: true, maxlength: 500 },

    /**
     * Append-only timetable change trail.
     *
     * A rescheduled room or a shifted start time has to be explainable months
     * later — by whom, when, and why — and the teacher who owns the class has to
     * be able to see that it moved. Kept on the session itself so the history is
     * read in the same request as the class, rather than reconstructed from an
     * audit table that may later be pruned.
     */
    changes: { type: [TimetableChangeSchema], default: [] },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

TimetableSchema.index({ scheduledDay: 1, startTime: 1 });
TimetableSchema.index({ room: 1, scheduledDay: 1, startTime: 1 });

export const Timetable = mongoose.model("Timetable", TimetableSchema);
