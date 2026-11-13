import mongoose from "mongoose";

const SystemMetricSchema = new mongoose.Schema(
  {
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    // Process-level metrics (Node.js process)
    processCpuUsage: {
      type: Number,
      default: null,
    },
    processMemoryUsed: {
      type: Number,
      default: null,
    },
    processMemoryTotal: {
      type: Number,
      default: null,
    },
    processMemoryUsagePercentage: {
      type: Number,
      default: null,
    },
    eventLoopLag: {
      type: Number,
      default: null,
    },
    // Host-level metrics (OS level) - may be unavailable in containers
    hostCpuUsage: {
      type: Number,
      default: null,
    },
    hostMemoryTotal: {
      type: Number,
      default: null,
    },
    hostMemoryUsed: {
      type: Number,
      default: null,
    },
    hostMemoryUsagePercentage: {
      type: Number,
      default: null,
    },
    hostCpuCores: {
      type: Number,
      default: null,
    },
    // API performance metrics
    apiResponseTime: {
      type: Number,
      default: null,
    },
    apiResponseTimeP50: {
      type: Number,
      default: null,
    },
    apiResponseTimeP95: {
      type: Number,
      default: null,
    },
    apiResponseTimeP99: {
      type: Number,
      default: null,
    },
    requestsPerMinute: {
      type: Number,
      default: 0,
    },
    errorRate: {
      type: Number,
      default: 0,
    },
    slowRequestsCount: {
      type: Number,
      default: 0,
    },
    // Database performance metrics
    databaseResponseTime: {
      type: Number,
      default: null,
    },
    databaseActiveConnections: {
      type: Number,
      default: null,
    },
    databaseConnectionPoolUtilization: {
      type: Number,
      default: null,
    },
    slowQueriesCount: {
      type: Number,
      default: 0,
    },
    failedQueriesCount: {
      type: Number,
      default: 0,
    },
    databaseOperationVolume: {
      type: Number,
      default: 0,
    },
    // User activity metrics
    concurrentUsers: {
      type: Number,
      default: 0,
    },
    activeSessions: {
      type: Number,
      default: 0,
    },
    // System health
    serverUptime: {
      type: Number,
      default: null,
    },
    systemHealthStatus: {
      type: String,
      enum: ["healthy", "warning", "critical", "unknown"],
      default: "unknown",
      index: true,
    },
    // Metadata
    collectionInterval: {
      type: Number,
      default: 60000,
    },
    source: {
      type: String,
      default: "server",
    },
  },
  {
    timestamps: true,
  }
);

SystemMetricSchema.index({ timestamp: -1 });
SystemMetricSchema.index({ systemHealthStatus: 1, timestamp: -1 });

export const SystemMetric = mongoose.model("SystemMetric", SystemMetricSchema);