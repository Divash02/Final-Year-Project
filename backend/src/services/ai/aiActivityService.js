import { AIActivityLog } from "../../models/AIActivityLog.js";
import { Notification, Student } from "../../models/index.js";
import { getUserRoles } from "../../db.js";
import { hasPermission } from "../../permissions/catalog.js";
import { badRequest, conflict, forbidden } from "../../utils/apiError.js";

const EXECUTABLE_ACTIONS = {
  DISPATCH_ATTENDANCE_WARNING_NOTICES: {
    permission: "attendance.reviewCorrection",
    module: "Academic",
    operation: "SEND_ATTENDANCE_WARNING_NOTICES",
  },
};

function isCompleteConsequentialAction(action) {
  const policy = action?.actionKey && EXECUTABLE_ACTIONS[action.actionKey];
  return Boolean(
    policy &&
      action.label?.trim() &&
      action.targetModule === policy.module &&
      action.targetRecord?.trim() &&
      action.operation === policy.operation &&
      action.reason?.trim() &&
      action.requiredPermission === policy.permission &&
      Array.isArray(action.targetSnapshot) &&
      action.targetSnapshot.length > 0,
  );
}

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
  idempotencyKey = null,
  classification = null,
  classificationReason = "",
}) {
  const eligibleAction = isCompleteConsequentialAction(proposedAction);
  const requiresConfirmation = Boolean(humanConfirmation?.required && eligibleAction);
  const resolvedClassification =
    classification ||
    (requiresConfirmation
      ? "CONSEQUENTIAL_ACTION"
      : proposedAction
        ? "DRAFT_ACTION"
        : "INFORMATIONAL_RESPONSE");
  const values = {
      user: user._id || user.id,
      userEmail: user.email || "",
      userName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username || "Authorized User",
      role: role || user.activeRole || "user",
      module,
      requestCategory,
      queryPrompt,
      classification: resolvedClassification,
      classificationReason:
        classificationReason ||
        (requiresConfirmation
          ? "A supported consequential operation was explicitly proposed."
          : proposedAction
            ? "Proposal is retained for review; no executable approval handler is registered."
            : "No institutional operation was requested."),
      idempotencyKey: idempotencyKey || null,
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
      proposedAction: proposedAction || null,
      humanConfirmation: {
        required: requiresConfirmation,
        status: requiresConfirmation ? "PENDING" : "NOT_REQUIRED",
        confirmedBy: humanConfirmation?.confirmedBy || null,
        confirmedAt: humanConfirmation?.confirmedAt || null,
        rejectionReason: humanConfirmation?.rejectionReason || null,
      },
      finalResult: finalResult || { executed: false },
      executionLatencyMs,
      approvalHistory: requiresConfirmation
        ? [{ event: "PROPOSED", actor: user._id || user.id, reason: classificationReason || "" }]
        : [],
  };

  try {
    return await AIActivityLog.create(values);
  } catch (error) {
    if (error.code === 11000 && idempotencyKey) {
      const existing = await AIActivityLog.findOne({
        user: user._id || user.id,
        idempotencyKey,
      });
      if (existing?.queryPrompt === queryPrompt) return existing;
      if (existing) throw conflict("The idempotency key was already used for a different request.");
    }
    throw error;
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
  pendingOnly = false,
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

  if (pendingOnly) {
    query["humanConfirmation.required"] = true;
    query["humanConfirmation.status"] = "PENDING";
    query["proposedAction.actionKey"] = { $in: Object.keys(EXECUTABLE_ACTIONS) };
    query["proposedAction.label"] = { $type: "string", $ne: "" };
    query["proposedAction.targetModule"] = { $type: "string", $ne: "" };
    query["proposedAction.targetRecord"] = { $type: "string", $ne: "" };
    query["proposedAction.operation"] = { $type: "string", $ne: "" };
    query["proposedAction.reason"] = { $type: "string", $ne: "" };
    query["proposedAction.requiredPermission"] = { $type: "string", $ne: "" };
    query["proposedAction.targetSnapshot.0"] = { $exists: true };
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
    count: total,
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
    throw conflict("AI Activity record not found.");
  }

  const action = log.proposedAction;
  const policy = action?.actionKey && EXECUTABLE_ACTIONS[action.actionKey];
  if (!policy || !isCompleteConsequentialAction(action)) {
    await AIActivityLog.updateOne(
      { _id: logId },
      {
        $push: {
          approvalHistory: {
            event: "EXECUTION_BLOCKED",
            actor: user._id || user.id,
            at: new Date(),
            reason: "The action is incomplete or has no approved execution handler.",
          },
        },
      },
    );
    throw conflict("This action is incomplete or has no approved execution handler.");
  }

  if (!log.humanConfirmation || log.humanConfirmation.status !== "PENDING") {
    await AIActivityLog.updateOne(
      { _id: logId },
      {
        $push: {
          approvalHistory: {
            event: "EXECUTION_BLOCKED",
            actor: user._id || user.id,
            at: new Date(),
            reason: `Action is not pending (status: ${log.humanConfirmation?.status || "missing"}).`,
          },
        },
      },
    );
    throw conflict("Action is not in pending confirmation status.");
  }

  const approverId = String(user._id || user.id);
  if (String(log.user) === approverId) {
    await AIActivityLog.updateOne(
      { _id: logId, "humanConfirmation.status": "PENDING" },
      {
        $push: {
          approvalHistory: {
            event: "APPROVAL_DENIED",
            actor: approverId,
            at: new Date(),
            reason: "Separation of duties prevents self-approval.",
          },
        },
      },
    );
    throw forbidden("The action initiator cannot approve their own consequential action.");
  }
  const roles = getUserRoles(user);
  if (!hasPermission(roles, policy.permission)) {
    await AIActivityLog.updateOne(
      { _id: logId, "humanConfirmation.status": "PENDING" },
      {
        $push: {
          approvalHistory: {
            event: "APPROVAL_DENIED",
            actor: approverId,
            at: new Date(),
            reason: `Missing required permission: ${policy.permission}.`,
          },
        },
      },
    );
    throw forbidden(`Approval requires the ${policy.permission} permission.`);
  }

  if (!approved) {
    if (!String(notes || "").trim()) {
      throw badRequest("A rejection reason is required.");
    }
    const rejected = await AIActivityLog.findOneAndUpdate(
      { _id: logId, "humanConfirmation.status": "PENDING" },
      {
        $set: {
          "humanConfirmation.status": "REJECTED",
          "humanConfirmation.confirmedBy": approverId,
          "humanConfirmation.confirmedAt": new Date(),
          "humanConfirmation.rejectionReason": notes.trim(),
        },
        $push: {
          approvalHistory: {
            event: "REJECTED",
            actor: approverId,
            at: new Date(),
            reason: notes.trim(),
          },
        },
      },
      { returnDocument: "after" },
    );
    if (!rejected) throw conflict("Action is no longer pending confirmation.");
    return { success: true, message: "Proposed action rejected." };
  }

  const executing = await AIActivityLog.findOneAndUpdate(
    { _id: logId, "humanConfirmation.status": "PENDING" },
    {
      $set: {
        "humanConfirmation.status": "EXECUTING",
        "humanConfirmation.confirmedBy": approverId,
        "humanConfirmation.confirmedAt": new Date(),
      },
      $push: {
        approvalHistory: {
          event: "EXECUTION_STARTED",
          actor: approverId,
          at: new Date(),
          reason: notes.trim(),
        },
      },
    },
    { returnDocument: "after" },
  );
  if (!executing) throw conflict("Action is no longer pending confirmation.");

  let sideEffectsStarted = false;
  try {
    const targetIds = action.targetSnapshot.map((target) => target.studentId);
    const students = await Student.find({ studentId: { $in: targetIds } }).lean();
    const currentSnapshot = students.map((student) => ({
      studentId: student.studentId,
      attendancePercentage: student.attendancePercentage,
      userId: String(student.user),
    }));
    const expectedSnapshot = action.targetSnapshot.map((target) => ({
      studentId: target.studentId,
      attendancePercentage: target.attendancePercentage,
      userId: String(target.userId),
    }));
    if (
      JSON.stringify(currentSnapshot.sort((a, b) => a.studentId.localeCompare(b.studentId))) !==
      JSON.stringify(expectedSnapshot.sort((a, b) => a.studentId.localeCompare(b.studentId)))
    ) {
      throw conflict("The target records changed after this action was proposed.");
    }

    const threshold = Number(action.payload?.threshold);
    if (!Number.isFinite(threshold) || students.some((student) => student.attendancePercentage >= threshold)) {
      throw conflict("The attendance-warning policy is no longer satisfied.");
    }

    sideEffectsStarted = true;
    await Promise.all(
      students.map(async (student) => {
        const idempotencyKey = `${log._id}:${student._id}`;
        const existing = await Notification.findOne({ user: student.user, idempotencyKey }).lean();
        if (existing) return;
        await Notification.create({
          user: student.user,
          title: "Official Attendance Warning",
          message: `Your recorded attendance is below the institutional ${threshold}% threshold. Please contact your academic department.`,
          category: "academic",
          priority: "high",
          actionUrl: "/student/attendance",
          idempotencyKey,
          metadata: { aiActivityLogId: String(log._id), studentId: student.studentId },
        });
      }),
    );

    const completedAt = new Date();
    await AIActivityLog.updateOne(
      { _id: logId, "humanConfirmation.status": "EXECUTING" },
      {
        $set: {
          "humanConfirmation.status": "EXECUTED",
          finalResult: {
            executed: true,
            success: true,
            message: `Attendance warnings were issued to ${students.length} student(s).`,
            details: { targetCount: students.length, completedAt, actor: approverId },
          },
        },
        $push: {
          approvalHistory: {
            event: "EXECUTED",
            actor: approverId,
            at: completedAt,
            reason: notes.trim(),
            details: { targetCount: students.length },
          },
        },
      },
    );
    return { success: true, message: `Attendance warnings were issued to ${students.length} student(s).`, action };
  } catch (error) {
    const failedAt = new Date();
    await AIActivityLog.updateOne(
      { _id: logId, "humanConfirmation.status": "EXECUTING" },
      {
        $set: {
          "humanConfirmation.status": "FAILED",
          finalResult: {
            executed: sideEffectsStarted,
            success: false,
            message: error.message || "Action execution failed.",
            details: { failedAt, actor: approverId, sideEffectsStarted },
          },
        },
        $push: {
          approvalHistory: {
            event: "EXECUTION_FAILED",
            actor: approverId,
            at: failedAt,
            reason: error.message || "Action execution failed.",
          },
        },
      },
    );
    throw error;
  }
}
