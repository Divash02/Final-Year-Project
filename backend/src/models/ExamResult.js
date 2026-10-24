import mongoose from "mongoose";

const ResultWorkflowStatus = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_VERIFICATION",
  "VERIFIED",
  "FINALIZED",
  "PUBLISHED",
  "CORRECTION_REQUIRED",
  "REVISED",
];

const SubjectMarkItemSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null },
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    marksObtained: { type: Number, default: null },
    totalMarks: { type: Number, default: 100 },
    passMarks: { type: Number, default: 40 },
    credits: { type: Number, default: 3 },
    isAbsent: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["PASS", "FAIL", "ABSENT", "INCOMPLETE"],
      default: "INCOMPLETE",
    },
    grade: { type: String, default: "" },
    gradePoint: { type: Number, default: null },
  },
  { _id: false }
);

const ExamResultSchema = new mongoose.Schema(
  {
    exam: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true, index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    studentUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null },
    marksObtained: { type: Number, default: 0 },
    totalMarksPossible: { type: Number, default: 100 },
    percentage: { type: Number, default: null },
    grade: { type: String, default: "" },
    gradePoint: { type: Number, default: null },
    gpa: { type: Number, default: null },
    isAbsent: { type: Boolean, default: false },
    isIncomplete: { type: Boolean, default: false },
    subjectMarks: [SubjectMarkItemSchema],
    remarks: { type: String, default: "" },
    status: {
      type: String,
      enum: ["PASSED", "FAILED", "ABSENT", "WITHHELD", "INCOMPLETE"],
      default: "INCOMPLETE",
    },
    workflowStatus: {
      type: String,
      enum: ResultWorkflowStatus,
      default: "DRAFT",
    },
    examOfficer: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    workflowHistory: [
      {
        status: { type: String, enum: ResultWorkflowStatus, required: true },
        actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        role: { type: String },
        timestamp: { type: Date, default: Date.now },
        remarks: { type: String, default: "" },
        oldValue: { type: mongoose.Schema.Types.Mixed },
        newValue: { type: mongoose.Schema.Types.Mixed },
      },
    ],
    submittedAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
    finalizedAt: { type: Date, default: null },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

ExamResultSchema.index({ exam: 1, student: 1 }, { unique: true });
ExamResultSchema.index({ studentUser: 1, workflowStatus: 1 });
ExamResultSchema.index({ workflowStatus: 1 });

export const EXAM_RESULT_WORKFLOW_STATUSES = ResultWorkflowStatus;
export const ExamResult = mongoose.model("ExamResult", ExamResultSchema);
