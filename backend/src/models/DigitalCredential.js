import mongoose from "mongoose";

export const CREDENTIAL_TYPES = [
  "STUDENT_ID_CARD",
  "SEMESTER_TRANSCRIPT",
  "ENROLLMENT_BONAFIDE",
  "CHARACTER_CERTIFICATE",
  "PROVISIONAL_DEGREE",
];

export const CREDENTIAL_STATUSES = ["ACTIVE", "EXPIRED", "REVOKED", "PENDING_VERIFICATION"];

const DigitalCredentialSchema = new mongoose.Schema(
  {
    credentialNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    credentialType: {
      type: String,
      enum: CREDENTIAL_TYPES,
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    studentId: { type: String, required: true, trim: true },
    studentName: { type: String, required: true, trim: true },
    program: { type: String, required: true, trim: true },
    academicYear: { type: String, default: "2083/84" },
    semester: { type: Number, default: 1 },
    issuedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null },
    status: {
      type: String,
      enum: CREDENTIAL_STATUSES,
      default: "ACTIVE",
      index: true,
    },
    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    revokedAt: { type: Date, default: null },
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    revocationReason: { type: String, default: null },
    signatureDigest: { type: String, required: true }, // HMAC tamper-evident signature
    verificationNonce: { type: String, required: true },
    metadata: {
      cgpa: { type: Number, default: null },
      completedCredits: { type: Number, default: null },
      admitCardExamCode: { type: String, default: null },
    },
  },
  {
    timestamps: true,
  }
);

DigitalCredentialSchema.index({ student: 1, credentialType: 1 });

export const DigitalCredential = mongoose.model(
  "DigitalCredential",
  DigitalCredentialSchema
);
