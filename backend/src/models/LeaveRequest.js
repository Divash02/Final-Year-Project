import mongoose from "mongoose";

const LeaveRequestSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    leaveType: {
      type: String,
      enum: ["annual", "sick", "casual", "maternity", "paternity", "unpaid", "other"],
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    reason: {
      type: String,
      trim: true,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
      index: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    comments: {
      type: String,
      trim: true,
      default: null,
    },
    supportingDocument: {
      type: String,
      default: null,
    },
    balanceDeducted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

export const LeaveRequest = mongoose.model("LeaveRequest", LeaveRequestSchema);
