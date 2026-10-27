import mongoose from "mongoose";

/**
 * AI Activity and Audit Log
 *
 * Implements Section 20 of CollegeOS AI Architecture.
 * Records all interactions with the modular AI layer:
 * - User and active role
 * - AI module & category
 * - Data scope inspected (role-filtered)
 * - Source records cited
 * - Recommendation & analysis
 * - Proposed consequential action
 * - Human confirmation & approval status
 * - Execution outcome
 *
 * Append-only by design.
 */
const AIActivityLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    userEmail: { type: String, trim: true },
    userName: { type: String, trim: true },
    role: { type: String, required: true, trim: true, index: true },
    module: {
      type: String,
      required: true,
      enum: [
        "operations_agent",
        "academic_ai",
        "faculty_copilot",
        "student_copilot",
        "examination_ai",
        "finance_ai",
        "admissions_ai",
        "cases_ai",
        "security_ai",
        "system_health",
        "rag_assistant",
        "document_intelligence",
        "report_generator",
        "scenario_simulator",
        "process_mining",
        "it_service",
        "cross_module",
      ],
      index: true,
    },
    requestCategory: { type: String, required: true, trim: true },
    queryPrompt: { type: String, default: "", trim: true },
    dataScope: {
      department: { type: String, default: null },
      program: { type: String, default: null },
      semester: { type: Number, default: null },
      recordsInspectedCount: { type: Number, default: 0 },
      permittedScopeSummary: { type: String, default: "" },
    },
    sourceRecords: [
      {
        _id: false,
        collectionName: { type: String, required: true },
        recordId: { type: String, required: true },
        label: { type: String, required: true },
        identifier: { type: String, default: "" },
      },
    ],
    recommendation: { type: String, required: true },
    proposedAction: {
      actionKey: { type: String, default: null },
      label: { type: String, default: null },
      payload: { type: mongoose.Schema.Types.Mixed, default: null },
      targetEndpoint: { type: String, default: null },
      method: { type: String, default: "POST" },
      riskLevel: {
        type: String,
        enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
        default: "LOW",
      },
    },
    humanConfirmation: {
      required: { type: Boolean, default: false },
      status: {
        type: String,
        enum: ["NOT_REQUIRED", "PENDING", "CONFIRMED", "REJECTED"],
        default: "NOT_REQUIRED",
      },
      confirmedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      confirmedAt: { type: Date, default: null },
      rejectionReason: { type: String, default: null },
    },
    finalResult: {
      executed: { type: Boolean, default: false },
      success: { type: Boolean, default: null },
      message: { type: String, default: "" },
      details: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    executionLatencyMs: { type: Number, default: 0 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // append-only
  }
);

AIActivityLogSchema.index({ createdAt: -1 });
AIActivityLogSchema.index({ module: 1, createdAt: -1 });

export const AIActivityLog = mongoose.model("AIActivityLog", AIActivityLogSchema);
