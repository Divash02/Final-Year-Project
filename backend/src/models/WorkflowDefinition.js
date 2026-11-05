import mongoose from "mongoose";

const WorkflowApprovalStepSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    assigneeType: { type: String, enum: ["role", "user"], required: true },
    role: { type: String, default: null },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { _id: true },
);

const WorkflowConditionSchema = new mongoose.Schema(
  {
    stage: { type: String, enum: ["before_start", "before_step"], required: true },
    stepId: { type: String, default: null },
    field: { type: String, required: true, trim: true, maxlength: 120 },
    operator: {
      type: String,
      enum: ["equals", "not_equals", "greater_than", "greater_or_equal", "less_than", "less_or_equal", "contains", "exists"],
      required: true,
    },
    value: { type: mongoose.Schema.Types.Mixed, default: null },
    action: { type: String, enum: ["skip_step", "return", "reject"], required: true },
    message: { type: String, trim: true, default: "", maxlength: 300 },
  },
  { _id: false },
);

const WorkflowDefinitionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, default: "", maxlength: 1000 },
    category: { type: String, required: true, trim: true, maxlength: 80 },
    department: { type: String, required: true, trim: true, maxlength: 120 },
    triggerEvent: { type: String, enum: ["case.created"], default: "case.created" },
    requestTypes: { type: [String], default: [] },
    applicableUserTypes: { type: [String], default: [] },
    approvalMode: { type: String, enum: ["sequential", "parallel"], default: "sequential" },
    steps: { type: [WorkflowApprovalStepSchema], default: [] },
    conditions: { type: [WorkflowConditionSchema], default: [] },
    notifications: {
      approvers: { type: Boolean, default: true },
      requesterStatusChanges: { type: Boolean, default: true },
      pendingReminders: { type: Boolean, default: false },
      reminderHours: { type: Number, min: 1, max: 720, default: 24 },
    },
    actions: {
      approvedStatus: { type: String, enum: ["APPROVED", "COMPLETED"], default: "APPROVED" },
      rejectedStatus: { type: String, enum: ["REJECTED"], default: "REJECTED" },
      returnedStatus: { type: String, enum: ["MORE_INFO"], default: "MORE_INFO" },
    },
    status: {
      type: String,
      enum: ["draft", "published", "paused", "archived", "template"],
      default: "draft",
      index: true,
    },
    isTemplate: { type: Boolean, default: false, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

WorkflowDefinitionSchema.index({ status:  1, triggerEvent: 1, requestTypes: 1 });

export const WorkflowDefinition = mongoose.model(
  "WorkflowDefinition",
  WorkflowDefinitionSchema,
);
