import { AIActivityLog } from "../../models/AIActivityLog.js";

/**
 * AI Activity Logging Service
 *
 * Implements Section 20 of CollegeOS Master Prompt.
 * Writes immutable audit log entries for all AI actions and queries.
 */

export async function logAIActivity({
  user,
  role,
  module,
  requestCategory,
  queryPrompt = "",
  dataScope = {},
  sourceRecords = [],
  recommendation,
  proposedAction = null,
  humanConfirmation = { required: false },
  finalResult = { executed: false },
  executionLatencyMs = 0,
}) {
  try {
    const record = await AIActivityLog.create({
      user: user._id || user.id,
      userEmail: user.email || "",
      userName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username || "Authorized User",
      role: role || user.activeRole || "user",
      module,
      requestCategory,
      queryPrompt,
      dataScope: {
        department: dataScope.department || null,
        program: dataScope.program || null,
        semester: dataScope.semester || null,
        recordsInspectedCount: dataScope.recordsInspectedCount || (sourceRecords ? sourceRecords.length : 0),
        permittedScopeSummary: dataScope.permittedScopeSummary || "",
      },
      sourceRecords: (sourceRecords || []).map((r) => ({
        collectionName: r.collectionName || "Record",
        recordId: String(r.recordId || r._id || r.id || ""),
        label: r.label || "Institutional Entity",
        identifier: r.identifier || "",
      })),
      recommendation,
      proposedAction: proposedAction || {
        actionKey: null,
        label: null,
        payload: null,
        targetEndpoint: null,
        method: "POST",
        riskLevel: "LOW",
      },
      humanConfirmation: {
        required: Boolean(humanConfirmation?.required),
        status: humanConfirmation?.status || (humanConfirmation?.required ? "PENDING" : "NOT_REQUIRED"),
        confirmedBy: humanConfirmation?.confirmedBy || null,
        confirmedAt: humanConfirmation?.confirmedAt || null,
        rejectionReason: humanConfirmation?.rejectionReason || null,
      },
      finalResult: finalResult || { executed: false },
      executionLatencyMs,
    });
    return record;
  } catch (err) {
    console.error("Failed to log AI activity:", err);
    return null;
  }
}

/**
 * Retrieve AI Activity logs with filtering and role scoping.
 */
export async function getAIActivityLogs({
  userRole,
  userId,
  module = null,
  limit = 50,
  page = 1,
  startDate = null,
  endDate = null,
}) {
  const query = {};

  // Role scoping: students and faculty can only view their own interactions;
  // department and administrative roles view logs within their module/scope.
  if (userRole === "student" || userRole === "faculty") {
    query.user = userId;
  }

  if (module && module !== "all") {
    query.module = module;
  }

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  const skip = (Math.max(1, Number(page)) - 1) * Number(limit);

  const [logs, total] = await Promise.all([
    AIActivityLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    AIActivityLog.countDocuments(query),
  ]);

  return {
    logs,
    total,
    page: Number(page),
    totalPages: Math.ceil(total / Number(limit)) || 1,
  };
}

/**
 * Confirm a pending proposed AI action with human authorization check.
 */
export async function confirmAIAction({ logId, user, approved = true, notes = "" }) {
  const log = await AIActivityLog.findById(logId);
  if (!log) {
    throw new Error("AI Activity record not found.");
  }

  if (!log.humanConfirmation || log.humanConfirmation.status !== "PENDING") {
    throw new Error("Action is not in pending confirmation status.");
  }

  if (!approved) {
    log.humanConfirmation.status = "REJECTED";
    log.humanConfirmation.confirmedBy = user._id || user.id;
    log.humanConfirmation.confirmedAt = new Date();
    log.humanConfirmation.rejectionReason = notes || "Rejected by authorized reviewer.";
    await log.save();
    return { success: true, message: "Proposed action rejected." };
  }

  log.humanConfirmation.status = "CONFIRMED";
  log.humanConfirmation.confirmedBy = user._id || user.id;
  log.humanConfirmation.confirmedAt = new Date();
  log.finalResult = {
    executed: true,
    success: true,
    message: notes || `Action "${log.proposedAction.label}" confirmed and executed by ${user.firstName || user.email}.`,
    details: { confirmedAt: new Date(), actor: user.email },
  };

  await log.save();
  return {
    success: true,
    message: log.finalResult.message,
    action: log.proposedAction,
  };
}
