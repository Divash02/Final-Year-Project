import {
  AnomalyAlert,
  AttendanceSession,
  Payment,
  ExamResult,
  Exam,
  SecurityEvent,
  WorkflowCase,
} from "../../models/index.js";

/**
 * Anomaly Detection Engine
 *
 * Implements Section 5 of CollegeOS Master Prompt.
 * Evaluates deterministic institutional rules and statistical thresholds
 * to flag potential integrity issues, security anomalies, or administrative bottlenecks.
 */

export async function runDeterministicAnomalyDetection() {
  const alertsCreated = [];

  // 1. Finance Anomaly: Duplicate or Suspicious Payment Transaction References
  try {
    const duplicatePayments = await Payment.aggregate([
      { $match: { transactionReference: { $ne: null, $ne: "" } } },
      {
        $group: {
          _id: "$transactionReference",
          count: { $sum: 1 },
          paymentIds: { $push: "$_id" },
          amounts: { $push: "$amount" },
          studentIds: { $push: "$student" },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]);

    for (const dup of duplicatePayments) {
      const existing = await AnomalyAlert.findOne({
        event: "DUPLICATE_PAYMENT_REFERENCE",
        "affectedRecord.identifier": dup._id,
        status: { $in: ["OPEN", "INVESTIGATING"] },
      });

      if (!existing) {
        const alert = await AnomalyAlert.create({
          event: "DUPLICATE_PAYMENT_REFERENCE",
          module: "finance",
          affectedRecord: {
            collectionName: "Payment",
            recordId: String(dup.paymentIds[0]),
            identifier: dup._id,
            label: `Transaction Ref #${dup._id} used across ${dup.count} payments`,
          },
          reason: `Transaction reference "${dup._id}" is duplicated across ${dup.count} different payment records.`,
          severity: "HIGH",
          evidence: [
            { key: "reference", label: "Transaction Reference", value: dup._id },
            { key: "occurrences", label: "Duplicate Occurrences", value: dup.count, threshold: 1 },
            { key: "amountsNpr", label: "Amounts Recorded", value: dup.amounts.join(", ") },
          ],
          detectionType: "RULE_BASED",
          recommendedInvestigation:
            "Cross-verify bank gateway reconciliation statement with eSewa/Khalti/ConnectIPS reference to verify genuine receipt vs duplicate entry.",
        });
        alertsCreated.push(alert);
      }
    }
  } catch (err) {
    console.error("Finance anomaly scan error:", err);
  }

  // 2. Examination Anomaly: Zero Variance / Suspicious Mark Distributions
  try {
    const exams = await Exam.find({ status: { $in: ["PUBLISHED", "COMPLETED"] } }).limit(20);
    for (const ex of exams) {
      const results = await ExamResult.find({ exam: ex._id, workflowStatus: { $in: ["VERIFIED", "FINALIZED", "PUBLISHED"] } });
      if (results.length >= 5) {
        const marks = results.map((r) => r.marksObtained).filter((m) => typeof m === "number" && !isNaN(m));
        if (marks.length >= 5) {
          const mean = marks.reduce((acc, v) => acc + v, 0) / marks.length;
          const variance = marks.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / marks.length;
          const stdDev = Math.sqrt(variance);

          // Anomaly: standard deviation is abnormally low (<= 1.0 mark across entire cohort)
          if (stdDev < 1.0) {
            const existing = await AnomalyAlert.findOne({
              event: "UNUSUAL_EXAM_SCORE_DISTRIBUTION",
              "affectedRecord.recordId": String(ex._id),
              status: { $in: ["OPEN", "INVESTIGATING"] },
            });
            if (!existing) {
              const alert = await AnomalyAlert.create({
                event: "UNUSUAL_EXAM_SCORE_DISTRIBUTION",
                module: "examinations",
                affectedRecord: {
                  collectionName: "Exam",
                  recordId: String(ex._id),
                  identifier: ex.examCode || String(ex._id),
                  label: `${ex.title} (Cohort Standard Deviation: ${stdDev.toFixed(2)})`,
                },
                reason: `Unusual exam result pattern: Cohort standard deviation is ${stdDev.toFixed(2)}, indicating virtually identical scores across all ${marks.length} candidates.`,
                severity: "HIGH",
                evidence: [
                  { key: "meanScore", label: "Cohort Mean Score", value: mean.toFixed(1) },
                  { key: "stdDev", label: "Standard Deviation", value: stdDev.toFixed(2), threshold: ">= 3.0" },
                  { key: "candidateCount", label: "Candidate Count", value: marks.length },
                ],
                detectionType: "STATISTICAL",
                recommendedInvestigation:
                  "Audit the assessment paper and individual answer scripts to ensure grading keys and subjective questions were evaluated with standard rubric separation.",
              });
              alertsCreated.push(alert);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("Exam anomaly scan error:", err);
  }

  // 3. Security Anomaly: Repeated Failed Logins
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const failedLogins = await SecurityEvent.aggregate([
      {
        $match: {
          eventType: "LOGIN_FAILED",
          createdAt: { $gte: fifteenMinutesAgo },
        },
      },
      {
        $group: {
          _id: "$userEmail",
          attempts: { $sum: 1 },
          ips: { $addToSet: "$ipAddress" },
        },
      },
      { $match: { attempts: { $gte: 5 } } },
    ]);

    for (const fail of failedLogins) {
      if (!fail._id) continue;
      const existing = await AnomalyAlert.findOne({
        event: "REPEATED_FAILED_LOGINS",
        "affectedRecord.identifier": fail._id,
        status: { $in: ["OPEN", "INVESTIGATING"] },
      });

      if (!existing) {
        const alert = await AnomalyAlert.create({
          event: "REPEATED_FAILED_LOGINS",
          module: "auth",
          affectedRecord: {
            collectionName: "User",
            recordId: fail._id,
            identifier: fail._id,
            label: `Account: ${fail._id}`,
          },
          reason: `Detected ${fail.attempts} consecutive failed login attempts within 15 minutes from IP(s): ${fail.ips.join(", ")}.`,
          severity: fail.attempts >= 10 ? "CRITICAL" : "HIGH",
          evidence: [
            { key: "email", label: "Target Account", value: fail._id },
            { key: "failedAttempts", label: "Failed Attempts", value: fail.attempts, threshold: 5 },
            { key: "originIps", label: "Origin IPs", value: fail.ips.join(", ") },
          ],
          detectionType: "RULE_BASED",
          recommendedInvestigation:
            "Review authentication timeline, verify whether legitimate user is locked out, check for credential stuffing patterns, and consider temporary challenge verification.",
        });
        alertsCreated.push(alert);
      }
    }
  } catch (err) {
    console.error("Security anomaly scan error:", err);
  }

  // 4. Workflow / Cases Anomaly: SLA Breaches & Stalled Requests
  try {
    const overdueCases = await WorkflowCase.find({
      status: { $in: ["OPEN", "PENDING", "IN_REVIEW"] },
      createdAt: { $lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    }).limit(10);

    for (const c of overdueCases) {
      const existing = await AnomalyAlert.findOne({
        event: "SLA_BREACH_PENDING_CASE",
        "affectedRecord.recordId": String(c._id),
        status: { $in: ["OPEN", "INVESTIGATING"] },
      });

      if (!existing) {
        const alert = await AnomalyAlert.create({
          event: "SLA_BREACH_PENDING_CASE",
          module: "cases",
          affectedRecord: {
            collectionName: "WorkflowCase",
            recordId: String(c._id),
            identifier: c.caseNumber || String(c._id),
            label: `Case #${c.caseNumber || String(c._id).slice(-6)}: ${c.subject || c.title || "Student Request"}`,
          },
          reason: `Case has remained unresolved for over 7 business days exceeding standard institutional response SLA.`,
          severity: "MEDIUM",
          evidence: [
            { key: "caseType", label: "Case Type", value: c.type || "General Request" },
            { key: "department", label: "Responsible Department", value: c.department || "Administration" },
            { key: "daysOpen", label: "Days Elapsed", value: Math.round((Date.now() - new Date(c.createdAt).getTime()) / (24 * 60 * 60 * 1000)), threshold: 7 },
          ],
          detectionType: "RULE_BASED",
          recommendedInvestigation:
            "Reassign case to active queue supervisor and notify department coordinator to expedite review.",
        });
        alertsCreated.push(alert);
      }
    }
  } catch (err) {
    console.error("Workflow anomaly scan error:", err);
  }

  return alertsCreated;
}

/**
 * Fetch anomaly alerts with module, severity and status filters.
 */
export async function getAnomalyAlerts({
  module = null,
  severity = null,
  status = "OPEN",
  limit = 50,
}) {
  const query = {};
  if (module && module !== "all") query.module = module;
  if (severity && severity !== "all") query.severity = severity;
  if (status && status !== "all") query.status = status;

  return AnomalyAlert.find(query).sort({ severity: -1, createdAt: -1 }).limit(Number(limit)).lean();
}

/**
 * Acknowledge or update status on an anomaly alert.
 */
export async function updateAnomalyAlertStatus({
  alertId,
  user,
  status,
  resolutionNotes = "",
}) {
  const alert = await AnomalyAlert.findById(alertId);
  if (!alert) throw new Error("Anomaly alert not found.");

  alert.status = status;
  if (status === "ACKNOWLEDGED" || status === "INVESTIGATING") {
    alert.acknowledgedBy = user._id || user.id;
    alert.acknowledgedAt = new Date();
  }
  if (status === "RESOLVED" || status === "FALSE_POSITIVE") {
    alert.resolvedBy = user._id || user.id;
    alert.resolvedAt = new Date();
    alert.resolutionNotes = resolutionNotes || alert.resolutionNotes;
  }
  await alert.save();
  return alert;
}
