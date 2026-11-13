import mongoose from "mongoose";

const PerformanceAlertSchema = new mongoose.Schema(
  {
    metricType: {
      type: String,
      enum: [
        "cpu",
        "memory",
        "api_response_time",
        "database_response_time",
        "error_rate",
        "concurrent_users",
        "disk_space",
        "event_loop_lag",
        "connection_pool",
      ],
      required: true,
      index: true,
    },
    severity: {
      type: String,
      enum: ["info", "warning", "critical"],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    threshold: {
      type: Number,
      required: true,
    },
    currentValue: {
      type: Number,
      required: true,
    },
    unit: {
      type: String,
      default: "",
    },
    firstDetectedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    lastDetectedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    acknowledgedAt: {
      type: Date,
      default: null,
    },
    acknowledgedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    status: {
      type: String,
      enum: ["active", "acknowledged", "resolved", "auto_resolved"],
      default: "active",
      index: true,
    },
    affectedService: {
      type: String,
      default: "api",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

PerformanceAlertSchema.index({ metricType: 1, status: 1, lastDetectedAt: -1 });
PerformanceAlertSchema.index({ severity: 1, status: 1, firstDetectedAt: -1 });

export const PerformanceAlert = mongoose.model("PerformanceAlert", PerformanceAlertSchema);