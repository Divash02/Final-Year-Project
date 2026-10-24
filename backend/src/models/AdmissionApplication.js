import mongoose from "mongoose";

export const ADMISSION_APPLICATION_STATUSES = [
  "SUBMITTED",
  "VERIFIED",
  "OFFERED",
  "REJECTED",
  "ENROLLED",
];

/**
 * Admission applications.
 *
 * Replaces the SQLite `admission_applications` table that the previous route
 * module still queried through `better-sqlite3` while the rest of the backend
 * had moved to MongoDB. Applications are institutional candidates, not user
 * accounts: no login is provisioned until an application is enrolled, and the
 * enrolled `Student`/`User` pair remains the single student identity shared by
 * every other module.
 */
const AdmissionApplicationSchema = new mongoose.Schema(
  {
    applicantName: { type: String, required: true, trim: true, maxlength: 180 },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    phone: { type: String, default: null, trim: true, maxlength: 32 },
    programme: { type: String, required: true, trim: true, maxlength: 120 },

    /** Intended academic placement, mirroring the Student enrolment fields. */
    batch: { type: String, default: null, trim: true },
    semester: { type: Number, default: null },
    section: { type: String, default: null, uppercase: true, trim: true },
    gender: { type: String, default: null, trim: true },
    dateOfBirth: { type: Date, default: null },
    qualification: { type: String, default: null, trim: true, maxlength: 200 },
    notes: { type: String, default: "", trim: true, maxlength: 2000 },

    status: {
      type: String,
      enum: ADMISSION_APPLICATION_STATUSES,
      default: "SUBMITTED",
      index: true,
    },
    decisionReason: { type: String, default: null, trim: true, maxlength: 500 },

    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },

    /** Set once the applicant has been enrolled into the student directory. */
    enrolledStudent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      default: null,
    },
    enrolledUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

AdmissionApplicationSchema.index({ programme: 1, status: 1 });

export const AdmissionApplication = mongoose.model(
  "AdmissionApplication",
  AdmissionApplicationSchema,
);
