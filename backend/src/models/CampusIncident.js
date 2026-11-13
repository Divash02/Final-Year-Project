import mongoose from "mongoose";

const INCIDENT_STATUSES = [
  "SUBMITTED",
  "RECEIVED",
  "UNDER_REVIEW",
  "ASSIGNED_FOR_INVESTIGATION",
  "INVESTIGATION_IN_PROGRESS",
  "AWAITING_STUDENT_INFORMATION",
  "ACTION_TAKEN",
  "RESOLVED",
  "CLOSED",
  // Legacy statuses retained for backward compatibility with existing records.
  "REPORTED",
  "ACKNOWLEDGED",
  "UNDER_INVESTIGATION",
  "ESCALATED",
];

const INCIDENT_TYPES = [
  "THEFT",
  "ASSAULT",
  "HARASSMENT",
  "VANDALISM",
  "FIRE_HAZARD",
  "MEDICAL_EMERGENCY",
  "BULLYING",
  "CYBERBULLYING",
  "SAFETY_CONCERN",
  "UNSAFE_CONDITION",
  "SECURITY_BREACH",
  "SUSPICIOUS_ACTIVITY",
  "OTHER",
];

const INCIDENT_SEVERITIES = ["LOW", "MODERATE", "HIGH", "CRITICAL"];

const RESOLUTION_OUTCOMES = ["RESOLVED", "UNFOUNDED", "REFERRED_EXTERNAL", "ONGOING_MONITORING"];

const ACCESS_LEVELS = ["SECURITY_STAFF", "CAMPUS_ADMIN", "PRINCIPAL_MANAGEMENT"];

const CampusIncidentSchema = new mongoose.Schema(
  {
    incidentNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
      uppercase: true,
      trim: true,
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      default: null,
      index: true,
    },
    incidentType: {
      type: String,
      enum: INCIDENT_TYPES,
      required: true,
      index: true,
    },
    severity: {
      type: String,
      enum: INCIDENT_SEVERITIES,
      required: true,
      default: "MODERATE",
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
      required: true,
      trim: true,
      maxlength: 5000,
    },
    incidentDate: {
      type: Date,
      index: true,
    },
    incidentTime: {
      type: String,
      trim: true,
      maxlength: 50,
    },
    location: {
      building: { type: String, trim: true, maxlength: 100 },
      room: { type: String, trim: true, maxlength: 50 },
      area: { type: String, trim: true, maxlength: 200 },
      description: { type: String, trim: true, maxlength: 500 },
      coordinates: {
        latitude: { type: Number },
        longitude: { type: Number },
      },
    },
    occurredAt: {
      type: Date,
      required: true,
      index: true,
    },
    reportedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    peopleInvolved: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    witnesses: [{
      name: { type: String, required: true, trim: true, maxlength: 150 },
      contact: { type: String, trim: true, maxlength: 200 },
      statement: { type: String, trim: true, maxlength: 2000, default: "" },
    }],
    anonymous: {
      type: Boolean,
      default: false,
    },
    confidentialityRequest: {
      type: Boolean,
      default: true,
    },
    isConfidential: {
      type: Boolean,
      default: true,
    },
    accessLevel: {
      type: String,
      enum: ACCESS_LEVELS,
      default: "SECURITY_STAFF",
    },
    severityLabel: { type: String, trim: true, default: "" },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    assignedDepartment: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    assignedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: INCIDENT_STATUSES,
      default: "SUBMITTED",
      index: true,
    },
    priority: {
      type: String,
      enum: ["LOW", "NORMAL", "HIGH", "URGENT"],
      default: "NORMAL",
    },
    evidence: [{
      fileId: { type: mongoose.Schema.Types.ObjectId, ref: "StoredFile", required: true },
      originalName: { type: String, required: true },
      mimeType: { type: String, required: true },
      sizeBytes: { type: Number, required: true },
      description: { type: String, trim: true, maxlength: 500, default: "" },
      uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      uploadedAt: { type: Date, default: Date.now },
      visibility: { type: String, enum: ["student", "internal"], default: "student" },
    }],
    actions: [{
      action: { type: String, required: true, trim: true, maxlength: 500 },
      takenBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      takenAt: { type: Date, default: Date.now },
      notes: { type: String, trim: true, maxlength: 1000, default: "" },
    }],
    internalNotes: [{
      note: { type: String, trim: true, maxlength: 4000, default: "" },
      writtenBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      writtenByName: { type: String, trim: true },
      writtenAt: { type: Date, default: Date.now },
    }],
    resolution: {
      summary: { type: String, trim: true, maxlength: 2000, default: "" },
      category: { type: String, trim: true, maxlength: 100, default: "" },
      actionsTaken: { type: String, trim: true, maxlength: 2000, default: "" },
      resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      resolvedAt: { type: Date, default: null },
      reopenedAt: { type: Date, default: null },
      reopenedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      reopenReason: { type: String, trim: true, maxlength: 1000, default: "" },
      outcome: {
        type: String,
        enum: RESOLUTION_OUTCOMES,
        default: null,
      },
    },
    tags: [{
      type: String,
      trim: true,
      maxlength: 50,
    }],
  },
  { timestamps: true }
);

CampusIncidentSchema.index({ incidentType: 1, severity: 1, status: 1 });
CampusIncidentSchema.index({ reportedBy: 1, status: 1 });
CampusIncidentSchema.index({ assignedTo: 1, status: 1 });
CampusIncidentSchema.index({ assignedDepartment: 1, status: 1 });
CampusIncidentSchema.index({ occurredAt: -1 });

export const CampusIncident = mongoose.model("CampusIncident", CampusIncidentSchema);
export { INCIDENT_STATUSES, INCIDENT_TYPES, INCIDENT_SEVERITIES, RESOLUTION_OUTCOMES, ACCESS_LEVELS };
