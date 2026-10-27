import mongoose from "mongoose";

export const SECURITY_EVENT_TYPES = [
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "PASSWORD_CHANGED",
  "ROLE_MODIFIED",
  "SUSPICIOUS_IP_SESSION",
  "RATE_LIMIT_HIT",
  "UNAUTHORIZED_RESOURCE_ATTEMPT",
  "ADMIN_ELEVATION",
  "CREDENTIAL_EXPIRED",
];

const SecurityEventSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      enum: SECURITY_EVENT_TYPES,
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    userEmail: { type: String, trim: true, default: "" },
    ipAddress: { type: String, default: "127.0.0.1", trim: true },
    userAgent: { type: String, default: "Unknown Client" },
    locationEstimate: { type: String, default: "Kathmandu, Nepal" },
    severity: {
      type: String,
      enum: ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "INFO",
      index: true,
    },
    details: { type: String, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    incidentStatus: {
      type: String,
      enum: ["NONE", "FLAGGED", "UNDER_INVESTIGATION", "CONTAINED", "RESOLVED", "FALSE_POSITIVE"],
      default: "NONE",
      index: true,
    },
    investigatorNotes: { type: String, default: "" },
    investigatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resolvedAt: { type: Date, default: null },
    isSimulationDemo: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

SecurityEventSchema.index({ createdAt: -1 });
SecurityEventSchema.index({ eventType: 1, createdAt: -1 });

export const SecurityEvent = mongoose.model("SecurityEvent", SecurityEventSchema);
