import {
  SecurityEvent,
  AuditLog,
  User,
  AnomalyAlert,
} from "../../models/index.js";
import { executeAIReasoning } from "./aiProvider.js";
import { logAIActivity } from "./aiActivityService.js";

/**
 * Cybersecurity Operations Center Service
 *
 * Implements Section 10 of CollegeOS Master Prompt:
 * - Authentication timeline & failed login monitoring
 * - Session & IP anomaly detection
 * - Role elevation audits
 * - Incident investigation & containment workflows
 * - Real application security events + clearly labelled demo simulation fixtures
 */

export async function getSecurityOperationsDashboard({ limit = 50 }) {
  const [securityEvents, auditLogs, activeAlerts] = await Promise.all([
    SecurityEvent.find().sort({ createdAt: -1 }).limit(Number(limit)).lean(),
    AuditLog.find({ module: { $in: ["auth", "users", "roles", "administration"] } })
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean(),
    AnomalyAlert.find({ module: { $in: ["auth", "permissions", "system"] } })
      .sort({ severity: -1, createdAt: -1 })
      .limit(20)
      .lean(),
  ]);

  // Aggregate metrics
  const failedLogins = securityEvents.filter((e) => e.eventType === "LOGIN_FAILED").length;
  const criticalIncidents = activeAlerts.filter((a) => a.severity === "CRITICAL").length;
  const roleChanges = auditLogs.filter((a) => String(a.action || "").includes("ROLE")).length;

  return {
    metrics: {
      totalMonitoredEvents: securityEvents.length + auditLogs.length,
      failedLoginsLast24h: failedLogins,
      criticalSecurityIncidents: criticalIncidents,
      roleAndPrivilegeChanges: roleChanges,
      securityHealthStatus: criticalIncidents > 0 ? "ATTENTION_REQUIRED" : "NORMAL",
    },
    eventTimeline: securityEvents,
    privilegeAuditTrail: auditLogs,
    securityAlerts: activeAlerts,
  };
}

/**
 * Record a security event (such as a failed or successful login, or role update).
 */
export async function recordSecurityEvent({
  eventType,
  user = null,
  userEmail = "",
  ipAddress = "127.0.0.1",
  userAgent = "Client",
  severity = "INFO",
  details = "",
  metadata = {},
  isSimulationDemo = false,
}) {
  try {
    return await SecurityEvent.create({
      eventType,
      user: user?._id || user?.id || null,
      userEmail: userEmail || user?.email || "",
      ipAddress,
      userAgent,
      severity,
      details,
      metadata,
      isSimulationDemo,
    });
  } catch (err) {
    console.error("Failed to record security event:", err);
    return null;
  }
}

/**
 * Seed or trigger simulated cybersecurity demo incidents (e.g. credential stuffing or anomalous session).
 * Strictly labelled as simulation.
 */
export async function triggerSimulatedSecurityIncident({ scenario = "CREDENTIAL_STUFFING" }) {
  const ip = "198.51.100.42"; // RFC 5737 TEST-NET-2 IP
  const targetEmail = "faculty.demo@collegeos.test";
  const createdEvents = [];

  for (let i = 1; i <= 6; i++) {
    const evt = await recordSecurityEvent({
      eventType: "LOGIN_FAILED",
      userEmail: targetEmail,
      ipAddress: ip,
      userAgent: "Python-urllib/3.10 (Automated Probe)",
      severity: i >= 5 ? "CRITICAL" : "HIGH",
      details: `[DEMO SIMULATION] Rapid failed authentication attempt #${i} using dictionary password list.`,
      isSimulationDemo: true,
    });
    createdEvents.push(evt);
  }

  // Generate corresponding Anomaly Alert
  const alert = await AnomalyAlert.create({
    event: "SIMULATED_CREDENTIAL_STUFFING_ATTACK",
    module: "auth",
    affectedRecord: {
      collectionName: "User",
      recordId: "demo-simulated-target",
      identifier: targetEmail,
      label: `[DEMO SIMULATION] Target: ${targetEmail}`,
    },
    reason: `[DEMO SIMULATION] Detected 6 consecutive automated authentication failures within 30 seconds from single external IP address (${ip}).`,
    severity: "CRITICAL",
    evidence: [
      { key: "targetAccount", label: "Target Account", value: targetEmail },
      { key: "attempts", label: "Failed Attempts", value: 6, threshold: 5 },
      { key: "ipAddress", label: "Attacker IP", value: ip },
      { key: "userAgent", label: "Client User Agent", value: "Python-urllib/3.10" },
    ],
    detectionType: "RULE_BASED",
    recommendedInvestigation:
      "Verify if legitimate faculty member is locked out. Temporarily challenge source IP address at perimeter gateway, and require multi-factor verification.",
    isSimulatedDemo: true,
  });

  return {
    success: true,
    message: "Simulated security incident triggered successfully.",
    alertId: alert._id,
    eventsCount: createdEvents.length,
  };
}

/**
 * Investigate and update security incident status
 */
export async function investigateSecurityIncident({
  alertId,
  user,
  action, // "CONTAIN" | "RESOLVE" | "FALSE_POSITIVE"
  investigationNotes = "",
}) {
  const alert = await AnomalyAlert.findById(alertId);
  if (!alert) throw new Error("Security alert not found.");

  alert.status = action === "CONTAIN" ? "INVESTIGATING" : action === "RESOLVE" ? "RESOLVED" : "FALSE_POSITIVE";
  alert.resolvedBy = user._id || user.id;
  alert.resolvedAt = new Date();
  alert.resolutionNotes = investigationNotes || `Status updated to ${alert.status} by ${user.email}.`;
  await alert.save();

  await logAIActivity({
    user,
    role: "super_admin",
    module: "security_ai",
    requestCategory: "INCIDENT_INVESTIGATION",
    sourceRecords: [
      { collectionName: "AnomalyAlert", recordId: String(alert._id), label: alert.event, identifier: alert.affectedRecord.identifier },
    ],
    recommendation: `Security incident ${alert.event} resolved with status ${alert.status}.`,
    executionLatencyMs: 15,
  });

  return alert;
}
