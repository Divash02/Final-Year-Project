import mongoose from "mongoose";

const StudentCheckInRecordSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    studentId: { type: String, required: true },
    studentName: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    ipAddress: { type: String, default: "127.0.0.1" },
    userAgent: { type: String, default: "" },
    verified: { type: Boolean, default: true },
  },
  { _id: false }
);

const AttendanceQRSessionSchema = new mongoose.Schema(
  {
    sessionCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    courseCode: { type: String, required: true },
    courseName: { type: String, required: true },
    sectionCode: { type: String, required: true },
    facultyUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    facultyName: { type: String, required: true },
    room: { type: String, default: "Lecture Hall" },
    topic: { type: String, default: "Regular Lecture Session" },
    sessionDate: { type: String, required: true },
    startTime: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    sessionNonce: { type: String, required: true },
    status: {
      type: String,
      enum: ["ACTIVE", "EXPIRED", "CONCLUDED", "CANCELLED"],
      default: "ACTIVE",
    },
    checkIns: [StudentCheckInRecordSchema],
    totalCheckIns: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

AttendanceQRSessionSchema.index({ status: 1, expiresAt: 1 });

export const AttendanceQRSession = mongoose.model(
  "AttendanceQRSession",
  AttendanceQRSessionSchema
);
