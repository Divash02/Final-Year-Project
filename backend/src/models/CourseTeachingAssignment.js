import mongoose from "mongoose";

const CourseTeachingAssignmentSchema = new mongoose.Schema(
  {
    facultyUser: {
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
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

CourseTeachingAssignmentSchema.index(
  { facultyUser: 1, course: 1, sectionCode: 1, semester: 1 },
  { unique: true }
);

export const CourseTeachingAssignment = mongoose.model(
  "CourseTeachingAssignment",
  CourseTeachingAssignmentSchema
);
