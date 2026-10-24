import mongoose from "mongoose";

/**
 * Attendance marks a teacher or administrator can record.
 *
 * P/A/L/B is the fast-entry set used by the register; `Excused` is retained for
 * institutionally approved absences recorded through the correction workflow.
 */
export const ATTENDANCE_STATUSES = [
  "Present",
  "Absent",
  "Late",
  "Bunk",
  "Excused",
];

/** Marks that count towards a student's attendance percentage. */
export const ATTENDING_STATUSES = ["Present", "Late"];

const attendanceStatusSchema = new mongoose.Schema(
  {
    from: { type: String, enum: [...ATTENDANCE_STATUSES, null], default: null },
    to: { type: String, enum: ATTENDANCE_STATUSES, required: true },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    changedByName: { type: String, trim: true, default: "" },
    reason: { type: String, trim: true, default: "" },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const AttendanceSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    studentUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    section: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    date: {
      type: String, // Format: YYYY-MM-DD
      required: true,
      index: true,
    },
    session: {
      type: String,
      default: "Lecture 1",
      trim: true,
      index: true,
    },
    /**
     * Reference to the attendance session this mark belongs to. The record keeps
     * its own course/section/date/session columns so historical rows created
     * before sessions existed remain queryable, but identity is never copied
     * from the session — it is referenced.
     */
    attendanceSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AttendanceSession",
      default: null,
      index: true,
    },
    classType: {
      type: String,
      enum: ["Lecture", "Tutorial", "Practical"],
      default: "Lecture",
    },
    status: {
      type: String,
      enum: ATTENDANCE_STATUSES,
      default: "Present",
      required: true,
      index: true,
    },
    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    remarks: {
      type: String,
      default: "",
      trim: true,
    },
    /**
     * Append-only correction trail. Every status change records who changed it,
     * the previous and new value, when, and the stated reason, so an
     * attendance record can always be audited.
     */
    statusHistory: {
      type: [attendanceStatusSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Prevent accidental duplicate attendance for the same student + course + section + date + session
AttendanceSchema.index(
  { student: 1, course: 1, section: 1, date: 1, session: 1 },
  { unique: true }
);
AttendanceSchema.index({ course: 1, section: 1, date: 1 });
AttendanceSchema.index({ student: 1, date: 1 });
AttendanceSchema.index({ attendanceSession: 1, student: 1 });

export const Attendance = mongoose.model("Attendance", AttendanceSchema);