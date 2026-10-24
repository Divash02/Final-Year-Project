import mongoose from "mongoose";

const WorkflowStepSchema = new mongoose.Schema(
  {
    actorUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, required: true },
    note: { type: String, default: "" },
    actedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const WorkflowCaseSchema = new mongoose.Schema(
  {
    caseNumber: { type: String, required: true, unique: true, index: true },
    type: { type: String, required: true },
    subject: { type: String, required: true },
    description: { type: String, default: "" },
    department: { type: String, default: "Registrar" },
    priority: { type: String, enum: ["LOW", "NORMAL", "HIGH", "URGENT"], default: "NORMAL" },
    requesterUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", default: null },
    assignedUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    status: {
      type: String,
      enum: ["SUBMITTED", "IN_REVIEW", "MORE_INFO", "APPROVED", "REJECTED", "COMPLETED", "CANCELLED"],
      default: "SUBMITTED",
      index: true,
    },
    steps: [WorkflowStepSchema],
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const WorkflowCase = mongoose.model("WorkflowCase", WorkflowCaseSchema);
