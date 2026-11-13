import mongoose from "mongoose";

const InternshipCompanySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
      index: true,
    },
    industry: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    address: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    city: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    country: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    website: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    contactPerson: {
      type: String,
      trim: true,
      maxlength: 150,
    },
    contactEmail: {
      type: String,
      lowercase: true,
      trim: true,
      maxlength: 200,
    },
    contactPhone: {
      type: String,
      trim: true,
      maxlength: 30,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
  },
  { timestamps: true }
);

const InternshipSupervisorSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InternshipCompany",
      required: true,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      maxlength: 200,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 30,
    },
    designation: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    department: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    isPrimary: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const InternshipApplicationSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    academicSupervisor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    coordinator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InternshipCompany",
      required: true,
    },
    industrySupervisor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InternshipSupervisor",
      default: null,
    },
    academicYear: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20,
      index: true,
    },
    semester: {
      type: Number,
      min: 1,
      max: 12,
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    durationWeeks: {
      type: Number,
      min: 1,
      max: 52,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    objectives: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    status: {
      type: String,
      enum: [
        "DRAFT",
        "SUBMITTED",
        "UNDER_REVIEW",
        "APPROVED",
        "REJECTED",
        "ACTIVE",
        "COMPLETED",
        "TERMINATED",
      ],
      default: "DRAFT",
      index: true,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewNotes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    approvalLetter: {
      fileId: { type: mongoose.Schema.Types.ObjectId, ref: "StoredFile" },
      issuedAt: { type: Date },
    },
    attachments: [{
      fileId: { type: mongoose.Schema.Types.ObjectId, ref: "StoredFile", required: true },
      originalName: { type: String, required: true },
      mimeType: { type: String, required: true },
      sizeBytes: { type: Number, required: true },
      category: {
        type: String,
        enum: ["OFFER_LETTER", "NOC", "INSURANCE", "AGREEMENT", "OTHER"],
        default: "OTHER",
      },
    }],
  },
  { timestamps: true }
);

InternshipApplicationSchema.index({ student: 1, status: 1 });
InternshipApplicationSchema.index({ academicSupervisor: 1, status: 1 });
InternshipApplicationSchema.index({ coordinator: 1, status: 1 });
InternshipApplicationSchema.index({ academicYear: 1, semester: 1, status: 1 });

const InternshipProgressReportSchema = new mongoose.Schema(
  {
    application: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InternshipApplication",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    weekNumber: {
      type: Number,
      min: 1,
      max: 52,
      required: true,
    },
    weekStartDate: {
      type: Date,
      required: true,
    },
    weekEndDate: {
      type: Date,
      required: true,
    },
    activitiesSummary: {
      type: String,
      required: true,
      trim: true,
      maxlength: 4000,
    },
    learningOutcomes: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    challengesFaced: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    hoursWorked: {
      type: Number,
      min: 0,
      max: 80,
      default: 0,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    supervisorFeedback: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    academicSupervisorFeedback: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    status: {
      type: String,
      enum: ["SUBMITTED", "REVIEWED", "NEEDS_REVISION"],
      default: "SUBMITTED",
    },
    attachments: [{
      fileId: { type: mongoose.Schema.Types.ObjectId, ref: "StoredFile", required: true },
      originalName: { type: String, required: true },
      mimeType: { type: String, required: true },
      sizeBytes: { type: Number, required: true },
    }],
  },
  { timestamps: true }
);

InternshipProgressReportSchema.index({ application: 1, weekNumber: 1 }, { unique: true });
InternshipProgressReportSchema.index({ student: 1, submittedAt: -1 });

const InternshipEvaluationSchema = new mongoose.Schema(
  {
    application: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InternshipApplication",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    evaluatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    evaluatorType: {
      type: String,
      enum: ["INDUSTRY_SUPERVISOR", "ACADEMIC_SUPERVISOR"],
      required: true,
    },
    technicalSkills: {
      type: Number,
      min: 1,
      max: 10,
    },
    professionalism: {
      type: Number,
      min: 1,
      max: 10,
    },
    communication: {
      type: Number,
      min: 1,
      max: 10,
    },
    problemSolving: {
      type: Number,
      min: 1,
      max: 10,
    },
    teamwork: {
      type: Number,
      min: 1,
      max: 10,
    },
    initiative: {
      type: Number,
      min: 1,
      max: 10,
    },
    overallRating: {
      type: Number,
      min: 1,
      max: 10,
    },
    strengths: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    areasForImprovement: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    additionalComments: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    evaluatedAt: {
      type: Date,
      default: Date.now,
    },
    isFinal: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

InternshipEvaluationSchema.index({ application: 1, evaluatorType: 1, isFinal: 1 });

export const InternshipCompany = mongoose.model("InternshipCompany", InternshipCompanySchema);
export const InternshipSupervisor = mongoose.model("InternshipSupervisor", InternshipSupervisorSchema);
export const InternshipApplication = mongoose.model("InternshipApplication", InternshipApplicationSchema);
export const InternshipProgressReport = mongoose.model("InternshipProgressReport", InternshipProgressReportSchema);
export const InternshipEvaluation = mongoose.model("InternshipEvaluation", InternshipEvaluationSchema);