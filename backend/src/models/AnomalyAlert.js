import mongoose from "mongoose";

/**
 * Anomaly Alert Model
 *
 * Implements Section 5 of CollegeOS AI Architecture.
 * Stores deterministic and statistical anomaly detections across modules:
 * - Attendance pace / rapid entries
 * - Duplicate or anomalous payment references
 * - Unusual examination grade distributions
 * - Repeated failed authentication attempts
 * - Unexpected permission escalation
 * - API error rate spikes & failed jobs
 * - Case routing bottlenecks
 */
const AnomalyAlertSchema = new mongoose.Schema(
  {
    event: { type: String, required: true, trim: true },
    module: {
      type: String,
      required: true,
      enum: [
        "attendance",
        "finance",
        "examinations",
        "auth",
        "permissions",
        "system",
        "cases",
        "workflow",
      ],
      index: true,
    },
    affectedRecord: {
      collectionName: { type: String, required: true },
      recordId: { type: String, required: true },
      identifier: { type: String, default: "" },
      label: { type: String, required: true },
    },
    reason: { type: String, required: true, trim: true },
    severity: {
      type: String,
      required: true,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "MEDIUM",
      index: true,
    },
    evidence: [
      {
        _id: false,
        key: { type: String, required: true },
        label: { type: String, required: true },
        value: { type: mongoose.Schema.Types.Mixed, required: true },
        threshold: { type: mongoose.Schema.Types.Mixed, default: null },
      },
    ],
    detectionType: {
      type: String,
      enum: ["RULE_BASED", "STATISTICAL", "HEURISTIC"],
      default: "RULE_BASED",
    },
    recommendedInvestigation: { type: String, required: true },
    status: {
      type: String,
      enum: ["OPEN", "ACKNOWLEDGED", "INVESTIGATING", "RESOLVED", "FALSE_POSITIVE"],
      default: "OPEN",
      index: true,
    },
    acknowledgedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    acknowledgedAt: { type: Date, default: null },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resolvedAt: { type: Date, default: null },
    resolutionNotes: { type: String, default: "" },
    linkedIncidentCaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkflowCase",
      default: null,
    },
    linkedTicketId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ITTicket",
      default: null,
    },
    isSimulatedDemo: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

AnomalyAlertSchema.index({ status: 1, severity: 1, createdAt: -1 });

export const AnomalyAlert = mongoose.model("AnomalyAlert", AnomalyAlertSchema);
