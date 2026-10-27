import mongoose from "mongoose";
import { AnomalyAlert, AuditLog } from "../../models/index.js";
import { logAIActivity } from "./aiActivityService.js";

/**
 * System Health & Reliability Intelligence Service
 *
 * Implements Section 11 of CollegeOS Master Prompt.
 * Provides live backend telemetry, database ping, uptime stats,
 * and simulated diagnostic incident triggers.
 */

// Memory ring buffer for recording recent API metrics
const _recentRequests = [];
const MAX_BUFFER_SIZE = 150;

export function recordApiMetric({ method, path, status, durationMs }) {
  _recentRequests.push({
    method,
    path,
    status,
    durationMs,
    timestamp: Date.now(),
  });
  if (_recentRequests.length > MAX_BUFFER_SIZE) {
    _recentRequests.shift();
  }
}

export async function getSystemHealthMetrics() {
  const dbState = mongoose.connection.readyState;
  const dbStateLabel =
    dbState === 1 ? "CONNECTED" : dbState === 2 ? "CONNECTING" : "DISCONNECTED";

  // Test live DB ping
  const pingStart = Date.now();
  let dbLatencyMs = 0;
  try {
    await mongoose.connection.db.admin().ping();
    dbLatencyMs = Date.now() - pingStart;
  } catch (err) {
    dbLatencyMs = -1;
  }

  // Calculate API error rates from live request ring buffer
  const totalRecorded = _recentRequests.length;
  const errorRequests = _recentRequests.filter((r) => r.status >= 500);
  const slowRequests = _recentRequests.filter((r) => r.durationMs > 1000);
  const avgDurationMs =
    totalRecorded > 0
      ? Math.round(
          _recentRequests.reduce((acc, r) => acc + r.durationMs, 0) / totalRecorded
        )
      : 12;

  const errorRatePct =
    totalRecorded > 0
      ? Math.round((errorRequests.length / totalRecorded) * 100)
      : 0;

  // Recent system error audit logs
  const recentErrors = await AuditLog.find({ action: { $regex: /FAIL|ERROR/i } })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  return {
    uptimeSeconds: Math.round(process.uptime()),
    database: {
      status: dbStateLabel,
      latencyMs: dbLatencyMs,
      host: mongoose.connection.host || "127.0.0.1",
      name: mongoose.connection.name || "collegeos",
    },
    apiHealth: {
      totalRequestsTracked: totalRecorded,
      errorRatePercentage: errorRatePct,
      averageLatencyMs: avgDurationMs,
      slowRequestsCount: slowRequests.length,
      status: errorRatePct > 5 ? "DEGRADED" : "HEALTHY",
    },
    nodeRuntime: {
      version: process.version,
      memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      platform: process.platform,
    },
    recentErrorLogs: recentErrors,
  };
}

/**
 * Trigger clearly labelled simulated system incident (e.g. API Error Spike or DB connectivity timeout).
 */
export async function triggerSimulatedSystemIncident({ incidentType = "API_ERROR_SPIKE" }) {
  const alert = await AnomalyAlert.create({
    event: "SIMULATED_API_ERROR_SPIKE",
    module: "system",
    affectedRecord: {
      collectionName: "System",
      recordId: "cluster-gateway-primary",
      identifier: "/api/examinations/results",
      label: "[DEMO SIMULATION] High Error Spike on /api/examinations/results",
    },
    reason: "[DEMO SIMULATION] 14 consecutive HTTP 500 internal server exceptions triggered within 60 seconds.",
    severity: "HIGH",
    evidence: [
      { key: "endpoint", label: "Failing Endpoint", value: "/api/examinations/results" },
      { key: "errorRate", label: "Error Rate Spike", value: "38%", threshold: "5%" },
      { key: "duration", label: "Window", value: "60 seconds" },
    ],
    detectionType: "STATISTICAL",
    recommendedInvestigation:
      "Inspect recent database indexing or schema lock events. Check application log tracer for unhandled promise rejection.",
    isSimulatedDemo: true,
  });

  return {
    success: true,
    message: "Simulated system performance incident triggered and recorded.",
    alert,
  };
}
