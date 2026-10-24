import mongoose from "mongoose";

const EnrollmentSchema = new mongoose.Schema(
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
    sectionCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    semester: {
      type: Number,
      required: true,
    },
    academicYear: {
      type: String,
      default: "2025/2026",
    },
    status: {
      type: String,
      enum: ["ENROLLED", "DROPPED", "COMPLETED"],
      default: "ENROLLED",
    },
  },
  { timestamps: true }
);

EnrollmentSchema.index(
  { student: 1, course: 1, sectionCode: 1, semester: 1 },
  { unique: true }
);

export const Enrollment = mongoose.model("Enrollment", EnrollmentSchema);
