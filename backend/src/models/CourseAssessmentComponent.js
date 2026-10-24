import mongoose from "mongoose";

const AssessmentComponentItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // "Assignment", "Examination", "Practical", etc.
    type: {
      type: String,
      enum: ["ASSIGNMENT", "EXAMINATION", "PRACTICAL", "INTERNAL", "PROJECT", "OTHER"],
      default: "ASSIGNMENT",
    },
    maxMarks: { type: Number, required: true, default: 100, min: 1 },
    passMarks: { type: Number, required: true, default: 40, min: 0 },
    weightage: { type: Number, default: 50 },
    assignedFaculty: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    dueDate: { type: Date, default: null },
    submissionDeadline: { type: Date, default: null },
    description: { type: String, default: "" },
  },
  { _id: false }
);

const CourseAssessmentComponentSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    courseCode: { type: String, required: true, uppercase: true, trim: true },
    courseName: { type: String, required: true, trim: true },
    academicYear: { type: String, required: true, trim: true, index: true },
    semester: { type: Number, required: true, index: true },
    program: { type: String, default: "BCA", uppercase: true, trim: true, index: true },
    sectionCode: { type: String, default: "ALL", uppercase: true, trim: true },
    components: {
      type: [AssessmentComponentItemSchema],
      default: () => [
        { name: "Assignment", type: "ASSIGNMENT", maxMarks: 100, passMarks: 40, weightage: 50 },
        { name: "Examination", type: "EXAMINATION", maxMarks: 100, passMarks: 40, weightage: 50 },
      ],
    },
    totalMaxMarks: { type: Number, default: 200 },
    totalPassMarks: { type: Number, default: 80 },
    passingRule: {
      type: String,
      enum: ["ALL_COMPONENTS_MUST_PASS", "AGGREGATE_ONLY", "EXAM_AND_AGGREGATE"],
      default: "ALL_COMPONENTS_MUST_PASS",
    },
    configuredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    status: {
      type: String,
      enum: ["ACTIVE", "ARCHIVED"],
      default: "ACTIVE",
    },
  },
  { timestamps: true }
);

CourseAssessmentComponentSchema.index(
  { course: 1, academicYear: 1, semester: 1, sectionCode: 1 },
  { unique: true }
);

export const CourseAssessmentComponent = mongoose.model(
  "CourseAssessmentComponent",
  CourseAssessmentComponentSchema
);
