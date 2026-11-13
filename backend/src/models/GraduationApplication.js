import mongoose from "mongoose";

const GraduationClearanceSchema = new mongoose.Schema(
  {
    department: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    requirement: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    isRequired: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "IN_PROGRESS", "CLEARED", "NOT_APPLICABLE", "WAIVED"],
      default: "PENDING",
      index: true,
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
    clearanceDocument: {
      fileId: { type: mongoose.Schema.Types.ObjectId, ref: "StoredFile" },
      issuedAt: { type: Date },
    },
  },
  { _id: false }
);

const GraduationApplicationSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
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
    program: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    applicationNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
      uppercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: [
        "DRAFT",
        "SUBMITTED",
        "ACADEMIC_REVIEW",
        "EXAM_REVIEW",
        "FINANCE_REVIEW",
        "LIBRARY_REVIEW",
        "REGISTRAR_REVIEW",
        "APPROVED",
        "REJECTED",
        "WITHDRAWN",
      ],
      default: "DRAFT",
      index: true,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    expectedGraduationDate: {
      type: Date,
      default: null,
    },
    convocationPreference: {
      type: String,
      enum: ["ATTEND", "IN_ABSENTIA", "DEFER"],
      default: "ATTEND",
    },
    gownSize: {
      type: String,
      enum: ["XS", "S", "M", "L", "XL", "XXL", "CUSTOM"],
      default: null,
    },
    gownSizeCustom: {
      type: String,
      trim: true,
      maxlength: 50,
      default: "",
    },
    clearanceChecks: [GraduationClearanceSchema],
    academicVerifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    academicVerifiedAt: {
      type: Date,
      default: null,
    },
    examVerifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    examVerifiedAt: {
      type: Date,
      default: null,
    },
    financeVerifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    financeVerifiedAt: {
      type: Date,
      default: null,
    },
    libraryVerifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    libraryVerifiedAt: {
      type: Date,
      default: null,
    },
    registrarApprovedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    registrarApprovedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    convocationRegisteredAt: {
      type: Date,
      default: null,
    },
    certificateIssuedAt: {
      type: Date,
      default: null,
    },
    certificateCollectedAt: {
      type: Date,
      default: null,
    },
    documents: [{
      fileId: { type: mongoose.Schema.Types.ObjectId, ref: "StoredFile", required: true },
      originalName: { type: String, required: true },
      mimeType: { type: String, required: true },
      sizeBytes: { type: Number, required: true },
      category: {
        type: String,
        enum: ["TRANSCRIPT", "CHARACTER_CERTIFICATE", "NO_DUES", "ID_COPY", "PHOTO", "OTHER"],
        default: "OTHER",
      },
    }],
    workflowCase: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkflowCase",
      default: null,
    },
  },
  { timestamps: true }
);

GraduationApplicationSchema.index({ student: 1, status: 1 });
GraduationApplicationSchema.index({ academicYear: 1, program: 1, status: 1 });
GraduationApplicationSchema.index({ "clearanceChecks.department": 1, "clearanceChecks.status": 1 });

export const GraduationClearance = GraduationClearanceSchema;
export const GraduationApplication = mongoose.model("GraduationApplication", GraduationApplicationSchema);