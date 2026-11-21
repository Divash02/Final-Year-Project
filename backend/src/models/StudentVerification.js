import mongoose from "mongoose";

// ============================================================================
// STUDENT IDENTITY VERIFICATION DOMAIN
// ============================================================================

// Institutional verification of a genuine CollegeOS student identity. One
// verification record per student; reusable across career paths per policy.
export const StudentIdentityVerificationSchema = new mongoose.Schema(
  {
    institutionId: {
      type: String,
      default: "techspire",
      index: true,
      trim: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      unique: true,
      index: true,
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    status: {
      type: String,
      enum: [
        "PENDING_VERIFICATION",
        "VERIFIED",
        "REJECTED",
        "ADDITIONAL_INFORMATION_REQUIRED",
        "SUSPENDED",
        "EXPIRED",
      ],
      default: "PENDING_VERIFICATION",
      index: true,
    },
    // Declared details to compare against official records
    declaredStudentId: {
      type: String,
      trim: true,
      default: null,
    },
    declaredName: {
      type: String,
      trim: true,
      default: null,
    },
    declaredEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
    },
    declaredEnrollmentStatus: {
      type: String,
      trim: true,
      default: null,
    },
    declaredDepartment: {
      type: String,
      trim: true,
      default: null,
    },
    declaredProgram: {
      type: String,
      trim: true,
      default: null,
    },
    declaredBatch: {
      type: String,
      trim: true,
      default: null,
    },
    declaredSemester: {
      type: Number,
      default: null,
    },
    // Verified outcome details
    verifiedStudentId: {
      type: String,
      trim: true,
      default: null,
    },
    verifiedName: {
      type: String,
      trim: true,
      default: null,
    },
    verifiedEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
    },
    verifiedEnrollmentStatus: {
      type: String,
      trim: true,
      default: null,
    },
    verifiedDepartment: {
      type: String,
      trim: true,
      default: null,
    },
    verifiedProgram: {
      type: String,
      trim: true,
      default: null,
    },
    verifiedBatch: {
      type: String,
      trim: true,
      default: null,
    },
    verifiedSemester: {
      type: Number,
      default: null,
    },
    supportingDocuments: [
      {
        title: { type: String, required: true, trim: true },
        fileId: { type: mongoose.Schema.Types.ObjectId, ref: "StoredFile" },
        fileName: { type: String, trim: true },
        url: { type: String, trim: true },
      },
    ],
    reviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: "",
    },
    additionalInfoRequested: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: "",
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    verificationNotes: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: "",
    },
    auditTrail: [
      {
        action: { type: String, required: true },
        actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        timestamp: { type: Date, default: Date.now },
        note: { type: String, trim: true, default: "" },
      },
    ],
  },
  { timestamps: true }
);

StudentIdentityVerificationSchema.index({ status: 1, createdAt: -1 });
StudentIdentityVerificationSchema.index({ reviewer: 1, status: 1 });

export const StudentIdentityVerification =
  mongoose.models.StudentIdentityVerification ||
  mongoose.model("StudentIdentityVerification", StudentIdentityVerificationSchema);

// Immutable history of verification decisions for audit.
export const VerificationHistorySchema = new mongoose.Schema(
  {
    verification: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentIdentityVerification",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    fromStatus: {
      type: String,
      trim: true,
      default: null,
    },
    toStatus: {
      type: String,
      trim: true,
      required: true,
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      trim: true,
      required: true,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: "",
    },
    decidedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

VerificationHistorySchema.index({ verification: 1, decidedAt: -1 });
VerificationHistorySchema.index({ student: 1, decidedAt: -1 });

export const VerificationHistory =
  mongoose.models.VerificationHistory ||
  mongoose.model("VerificationHistory", VerificationHistorySchema);
