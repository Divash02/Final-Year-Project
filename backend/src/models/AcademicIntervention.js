import mongoose from "mongoose";

const AcademicInterventionSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    riskIndicator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicRiskIndicator",
      default: null,
      index: true,
    },
    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    interventionType: {
      type: String,
      enum: [
        "ACADEMIC_ADVISING",
        "ATTENDANCE_REMEDIATION",
        "PEER_TUTORING",
        "COURSE_REMEDIAL_SESSION",
        "FACULTY_CONSULTATION",
        "PARENT_GUARDIAN_MEETING",
        "STUDY_SKILLS_WORKSHOP",
        "COUNSELING_REFERRAL",
        "OTHER",
      ],
      required: true,
      index: true,
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
    status: {
      type: String,
      enum: ["PLANNED", "IN_PROGRESS", "COMPLETED", "DEFERRED", "CANCELLED"],
      default: "PLANNED",
      index: true,
    },
    priority: {
      type: String,
      enum: ["LOW", "MODERATE", "HIGH", "URGENT"],
      default: "MODERATE",
    },
    scheduledAt: {
      type: Date,
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    outcome: {
      type: String,
      enum: ["POSITIVE", "NEUTRAL", "NEGATIVE", "PENDING"],
      default: "PENDING",
    },
    outcomeNotes: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    followUpRequired: {
      type: Boolean,
      default: false,
    },
    followUpDate: {
      type: Date,
      default: null,
    },
    relatedCourse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

AcademicInterventionSchema.index({ student: 1, status: 1, createdAt: -1 });
AcademicInterventionSchema.index({ initiatedBy: 1, status: 1 });
AcademicInterventionSchema.index({ interventionType: 1, status: 1 });

export const AcademicIntervention = mongoose.model(
  "AcademicIntervention",
  AcademicInterventionSchema
);