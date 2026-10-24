import mongoose from "mongoose";

export const CLASS_TYPES = ["Lecture", "Tutorial", "Practical"];

const AttendanceSessionSchema = new mongoose.Schema(
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
    /**
     * One session can cover several sections at once (for example A1 + A2). The
     * original single `sectionCode` is kept for backward compatibility with
     * records created before multi-section delivery existed.
     */
    sectionCode: {
      type: String,
      uppercase: true,
      trim: true,
      default: null,
    },
    sectionCodes: {
      type: [String],
      default: [],
    },
    academicYear: {
      type: String,
      trim: true,
      default: null,
    },
    batches: {
      type: [String],
      default: [],
    },
    semester: {
      type: Number,
      required: true,
    },
    classType: {
      type: String,
      enum: CLASS_TYPES,
      default: "Lecture",
    },
    date: {
      type: String, // YYYY-MM-DD
      required: true,
      index: true,
    },
    /** Wall-clock class window, stored as HH:mm in 24-hour form. */
    startTime: {
      type: String,
      trim: true,
      default: null,
    },
    endTime: {
      type: String,
      trim: true,
      default: null,
    },
    /** What was taught in this class. */
    topic: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    sessionName: {
      type: String,
      default: "Lecture",
      trim: true,
    },
    status: {
      type: String,
      enum: ["OPEN", "CLOSED"],
      default: "OPEN",
      index: true,
    },
    openedAt: {
      type: Date,
      default: Date.now,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    qrTokens: [
      {
        tokenHash: String,
        expiresAt: Date,
        revokedAt: Date,
      },
    ],
  },
  { timestamps: true },
);

AttendanceSessionSchema.index({ facultyUser: 1, date: -1 });
AttendanceSessionSchema.index({ course: 1, sectionCodes: 1, date: -1 });

export const AttendanceSession = mongoose.model(
  "AttendanceSession",
  AttendanceSessionSchema,
);