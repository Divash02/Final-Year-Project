import mongoose from "mongoose";

export const ASSESSMENT_WORKFLOW_STATUSES = [
  "NOT_STARTED",
  "DRAFT",
  "IN_PROGRESS",
  "SUBMITTED",
  "UNDER_REVIEW",
  "RETURNED_FOR_CORRECTION",
  "VERIFIED",
  "FINALIZED",
  "PUBLISHED",
];

const StudentComponentMarkSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // "Assignment", "Examination"
    type: { type: String, default: "ASSIGNMENT" },
    maxMarks: { type: Number, required: true, default: 100 },
    passMarks: { type: Number, required: true, default: 40 },
    marksObtained: { type: Number, default: null },
    isAbsent: { type: Boolean, default: false },
    isExempt: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["PENDING", "ENTERED", "ABSENT", "EXEMPT"],
      default: "PENDING",
    },
    enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    enteredAt: { type: Date, default: null },
    remarks: { type: String, default: "" },
  },
  { _id: false }
);

const AssessmentAuditSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    actorName: { type: String, default: "" },
    role: { type: String, default: "" },
    timestamp: { type: Date, default: Date.now },
    remarks: { type: String, default: "" },
    oldValues: { type: mongoose.Schema.Types.Mixed },
    newValues: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const StudentAssessmentMarkSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    studentUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    studentId: { type: String, required: true, trim: true },
    rollNumber: { type: String, trim: true }, // Examination symbol number
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    courseCode: { type: String, required: true, uppercase: true, trim: true },
    courseName: { type: String, required: true, trim: true },
    academicYear: { type: String, required: true, trim: true, index: true },
    semester: { type: Number, required: true, index: true },
    sectionCode: { type: String, default: "A", uppercase: true, trim: true, index: true },
    program: { type: String, default: "BScIT", uppercase: true, trim: true, index: true },

    components: [StudentComponentMarkSchema],

    totalMarksObtained: { type: Number, default: null },
    totalMaxMarks: { type: Number, default: 200 },
    percentage: { type: Number, default: null },
    grade: { type: String, default: "—" },
    gradePoint: { type: Number, default: null },
    resultStatus: {
      type: String,
      enum: ["PASS", "FAIL", "INCOMPLETE", "ABSENT", "WITHHELD", "PENDING"],
      default: "INCOMPLETE",
    },
    workflowStatus: {
      type: String,
      enum: ASSESSMENT_WORKFLOW_STATUSES,
      default: "DRAFT",
      index: true,
    },

    // Review & Workflow details
    correctionReason: { type: String, default: "" },
    correctionRequestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    correctionRequestedAt: { type: Date, default: null },

    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    submittedAt: { type: Date, default: null },

    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    verifiedAt: { type: Date, default: null },

    finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    finalizedAt: { type: Date, default: null },

    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    publishedAt: { type: Date, default: null },

    auditHistory: [AssessmentAuditSchema],
  },
  { timestamps: true }
);

StudentAssessmentMarkSchema.index(
  { student: 1, course: 1, academicYear: 1, semester: 1 },
  { unique: true }
);
StudentAssessmentMarkSchema.index({ academicYear: 1, semester: 1, course: 1, sectionCode: 1 });
StudentAssessmentMarkSchema.index({ studentUser: 1, workflowStatus: 1 });

export const StudentAssessmentMark = mongoose.model(
  "StudentAssessmentMark",
  StudentAssessmentMarkSchema
);
