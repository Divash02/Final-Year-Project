import mongoose from "mongoose";

export const TICKET_CATEGORIES = [
  "HARDWARE_FAILURE",
  "NETWORK_CONNECTIVITY",
  "SOFTWARE_ACCESS",
  "ACCOUNT_CREDENTIALS",
  "CLASSROOM_AV",
  "LAB_ENVIRONMENT",
  "SECURITY_INCIDENT",
  "OTHER",
];

export const TICKET_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
export const TICKET_STATUSES = [
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_ON_USER",
  "RESOLVED",
  "CLOSED",
];

const ITTicketSchema = new mongoose.Schema(
  {
    ticketNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: TICKET_CATEGORIES,
      default: "OTHER",
      index: true,
    },
    priority: {
      type: String,
      enum: TICKET_PRIORITIES,
      default: "MEDIUM",
      index: true,
    },
    status: {
      type: String,
      enum: TICKET_STATUSES,
      default: "OPEN",
      index: true,
    },
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    department: { type: String, default: "" },
    linkedAsset: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ITAsset",
      default: null,
    },
    assignedTechnician: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    slaTargetHours: { type: Number, default: 24 },
    slaDueAt: { type: Date, required: true },
    slaBreached: { type: Boolean, default: false },
    resolutionNotes: { type: String, default: "" },
    resolvedAt: { type: Date, default: null },
    aiAnalysis: {
      predictedCategory: { type: String, default: null },
      urgencyAssessment: { type: String, default: null },
      suggestedTroubleshooting: [{ type: String }],
      possibleDuplicateTicketNumber: { type: String, default: null },
      confidenceScore: { type: Number, default: null },
    },
  },
  {
    timestamps: true,
  }
);

ITTicketSchema.index({ status: 1, priority: 1, slaDueAt: 1 });

export const ITTicket = mongoose.model("ITTicket", ITTicketSchema);
