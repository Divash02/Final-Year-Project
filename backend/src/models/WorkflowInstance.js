import mongoose from "mongoose";

const WorkflowHistorySchema = new mongoose.Schema(
  {
    event: {
      type: String,
      enum: ["started", "approved", "rejected", "returned", "step_skipped", "completed"],
      required: true,
    },
    stepId: { type: String, default: null },
    stepName: { type: String, default: "" },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    message: { type: String, default: "", maxlength: 500 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const WorkflowInstanceSchema = new mongoose.Schema(
  {
    workflow: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkflowDefinition",
      required: true,
      index: true,
    },
    requestType: { type: String, required: true, index: true },
    request: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkflowCase",
      required: true,
      index: true,
    },
    requester: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: ["in_progress", "completed", "rejected", "returned"],
      default: "in_progress",
      index: true,
    },
    currentStepIndex: { type: Number, default: 0 },
    currentApprovers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    approvalMode: { type: String, enum: ["sequential", "parallel"], required: true },
    parallelApprovals: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    history: { type: [WorkflowHistorySchema], default: [] },
    requestSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
    completedAt: { type: Date, default: null },
    lastReminderAt: { type: Date, default: null },
  },
  { timestamps: true },
);

WorkflowInstanceSchema.index({ requestType: 1, request: 1 }, { unique: true });
WorkflowInstanceSchema.index({ currentApprovers: 1, status: 1 });

export const WorkflowInstance = mongoose.model(
  "WorkflowInstance",
  WorkflowInstanceSchema,
);
