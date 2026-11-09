import mongoose from "mongoose";
import { ACADEMIC_STRING_VALIDATION } from "../config/academic.js";

const StudentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    studentId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    rollNumber: {
      type: String,
      trim: true,
      default: function () {
        return this.studentId;
      },
    },
    enrollmentId: {
      type: String,
      trim: true,
      default: function () {
        return `ENR-${this.studentId}`;
      },
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    collegeEmail: {
      type: String,
      lowercase: true,
      trim: true,
      index: true,
    },
    avatarUrl: {
      type: String,
      default: null,
    },
    program: {
      type: String,
      default: "BScIT",
      trim: true,
      ...ACADEMIC_STRING_VALIDATION.program,
    },
    programCode: {
      type: String,
      default: "BScIT",
      trim: true,
      ...ACADEMIC_STRING_VALIDATION.program,
    },
    department: {
      type: String,
      default: "Computer Science",
      trim: true,
    },
    batch: {
      type: String,
      default: "2025",
      trim: true,
    },
    section: {
      type: String,
      default: "A25",
      trim: true,
      index: true,
      ...ACADEMIC_STRING_VALIDATION.section,
    },
    academicYear: {
      type: String,
      default: "2025/2026",
      trim: true,
    },
    semester: {
      type: Number,
      default: 1,
      index: true,
    },
    campus: {
      type: String,
      default: "Main Campus",
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      default: null,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "TRANSFERRED", "SUSPENDED", "GRADUATED"],
      default: "ACTIVE",
      index: true,
    },
    gpa: {
      type: Number,
      default: 0.0,
    },
    cgpa: {
      type: Number,
      default: 0.0,
    },
    attendancePercentage: {
      type: Number,
      default: 100,
    },
    feeBalanceDue: {
      type: Number,
      default: 0,
    },
    enrollmentDate: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

StudentSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`.trim();
});

export const Student = mongoose.model("Student", StudentSchema);
