import mongoose from "mongoose";
import {
  Notification,
  User,
  WorkflowCase,
  WorkflowDefinition,
  WorkflowInstance,
} from "../models/index.js";
import { getUserRoles } from "../db.js";
import { CORE_ROLES } from "../permissions/catalog.js";

const APPROVER_ROLES = CORE_ROLES.filter(
  (role) => !["student", "parent"].includes(role),
);
const CONDITION_OPERATORS = new Set([
  "equals",
  "not_equals",
  "greater_than",
  "greater_or_equal",
  "less_than",
  "less_or_equal",
  "contains",
  "exists",
]);
const CONDITION_ACTIONS = new Set(["skip_step", "return", "reject"]);
const ACTIVE_ACCOUNT_FILTER = {
  $or: [{ accountStatus: "ACTIVE" }, { accountStatus: { $exists: false } }],
};

function requestField(requestSnapshot, path) {
  if (!path.startsWith("request.")) return undefined;
  return path
    .slice("request.".length)
    .split(".")
    .reduce((value, part) => value?.[part], requestSnapshot.request);
}

function matchesCondition(actual, operator, expected) {
  switch (operator) {
    case "equals":
      return actual === expected;
    case "not_equals":
      return actual !== expected;
    case "greater_than":
      return Number(actual) > Number(expected);
    case "greater_or_equal":
      return Number(actual) >= Number(expected);
    case "less_than":
      return Number(actual) < Number(expected);
    case "less_or_equal":
      return Number(actual) <= Number(expected);
    case "contains":
      return Array.isArray(actual)
        ? actual.includes(expected)
        : String(actual ?? "").includes(String(expected ?? ""));
    case "exists":
      return actual !== undefined && actual !== null;
    default:
      return false;
  }
}

export function validateWorkflowDefinition(definition) {
  const errors = [];
  if (!String(definition.name || "").trim()) errors.push("Workflow name is required.");
  if (!String(definition.category || "").trim()) errors.push("Select a workflow category.");
  if (!String(definition.department || "").trim()) errors.push("Select a department.");
  if (definition.triggerEvent !== "case.created") {
    errors.push("Select a supported request trigger.");
  }
  if (!Array.isArray(definition.requestTypes) || definition.requestTypes.length === 0) {
    errors.push("Select at least one request type.");
  }
  if (!Array.isArray(definition.steps) || definition.steps.length === 0) {
    errors.push("Add at least one approval step.");
  }

  const stepIds = new Set((definition.steps || []).map((step) => String(step._id || step.id || "")));
  for (const [index, step] of (definition.steps || []).entries()) {
    if (!String(step.name || "").trim()) {
      errors.push(`Approval step ${index + 1} needs a name.`);
    }
    if (step.assigneeType === "role") {
      if (!APPROVER_ROLES.includes(step.role)) {
        errors.push(`Approval step ${index + 1} has an invalid approver role.`);
      }
    } else if (step.assigneeType === "user") {
      if (!mongoose.isValidObjectId(String(step.user || ""))) {
        errors.push(`Approval step ${index + 1} needs a valid assigned user.`);
      }
    } else {
      errors.push(`Approval step ${index + 1} needs a valid assignee.`);
    }
  }

  for (const [index, condition] of (definition.conditions || []).entries()) {
    if (!/^request\.[a-zA-Z0-9_.]+$/.test(String(condition.field || ""))) {
      errors.push(`Condition ${index + 1} must use a request field, such as request.priority.`);
    }
    if (!CONDITION_OPERATORS.has(condition.operator)) {
      errors.push(`Condition ${index + 1} has an unsupported operator.`);
    }
    if (!CONDITION_ACTIONS.has(condition.action)) {
      errors.push(`Condition ${index + 1} has an unsupported action.`);
    }
    if (condition.stage === "before_step" && !stepIds.has(String(condition.stepId || ""))) {
      errors.push(`Condition ${index + 1} refers to an approval step that no longer exists.`);
    }
    if (condition.stage === "before_start" && condition.action === "skip_step") {
      errors.push(`Condition ${index + 1} must select a step when skipping.`);
    }
  }
  return errors;
}

export async function validateWorkflowAssignments(definition) {
  const errors = validateWorkflowDefinition(definition);
  const roleChecks = new Set();
  for (const [index, step] of (definition.steps || []).entries()) {
    if (step.assigneeType === "user" && mongoose.isValidObjectId(String(step.user || ""))) {
      const user = await User.findOne({
        _id: step.user,
        roles: { $in: APPROVER_ROLES },
        isActive: { $ne: false },
        ...ACTIVE_ACCOUNT_FILTER,
      }).select("_id roles");
      if (!user) errors.push(`Approval step ${index + 1} assigns a user who is unavailable.`);
    }
    if (step.assigneeType === "role" && APPROVER_ROLES.includes(step.role)) {
      roleChecks.add(step.role);
    }
  }
  for (const role of roleChecks) {
    const user = await User.findOne({
      roles: role,
      isActive: { $ne: false },
      ...ACTIVE_ACCOUNT_FILTER,
    }).select("_id");
    if (!user) errors.push(`No active user is currently assigned to the ${role} role.`);
  }
  return errors;
}

function applicableCondition(definition, stage, stepId, request) {
  return (definition.conditions || []).find(
    (condition) =>
      condition.stage === stage &&
      (stage !== "before_step" || String(condition.stepId) === String(stepId)) &&
      matchesCondition(
        requestField(request, condition.field),
        condition.operator,
        condition.value,
      ),
  );
}

async function activeRoleUsers(role) {
  return User.find({
    roles: role,
    isActive: { $ne: false },
    ...ACTIVE_ACCOUNT_FILTER,
  })
    .select("_id firstName lastName roles")
    .sort({ createdAt: 1 });
}

async function resolveStepApprovers(definition, step, requesterId) {
  if (step.assigneeType === "user") {
    const user = await User.findOne({
      _id: step.user,
      roles: { $in: APPROVER_ROLES },
      isActive: { $ne: false },
      ...ACTIVE_ACCOUNT_FILTER,
    }).select("_id roles");
    return user && String(user._id) !== String(requesterId) ? [user] : [];
  }
  const users = (await activeRoleUsers(step.role)).filter(
    (user) => String(user._id) !== String(requesterId),
  );
  return definition.approvalMode === "parallel" ? users : users.slice(0, 1);
}

import { emitForNotificationUsers } from "./notificationService.js";

export async function createNotifications(users, title, message, idempotencyKey, extra = {}) {
  if (!users.length) return;
  const docs = users.map((user) => ({
    user: user._id,
    senderType: "automated",
    senderLabel: "CollegeOS Workflow",
    title,
    message,
    category: "workflow",
    priority: "normal",
    idempotencyKey: `${idempotencyKey}:${user._id}`,
    metadata: extra.metadata || null,
    actionUrl: extra.actionUrl || null,
    relatedEntityType: extra.relatedEntityType || null,
    relatedEntityId: extra.relatedEntityId || null,
  }));
  try {
    await Notification.insertMany(docs, { ordered: false });
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }
  await emitForNotificationUsers(users.map((u) => u._id)).catch(() => {});
}

async function syncCase(instance, definition, request, status, actor, note) {
  request.status = status;
  request.assignedUser = instance.currentApprovers[0] || null;
  if (["APPROVED", "REJECTED", "COMPLETED", "CANCELLED"].includes(status)) {
    request.resolvedAt = new Date();
  }
  request.steps.push({
    actorUser: actor || instance.currentApprovers[0] || request.requesterUser,
    status,
    note,
    actedAt: new Date(),
  });
  request.workflowInstance = instance._id;
  await request.save();
  if (definition.notifications.requesterStatusChanges) {
    await createNotifications(
      [{ _id: request.requesterUser }],
      `Request ${status.toLowerCase().replaceAll("_", " ")}`,
      `${request.caseNumber}: ${note}`,
      `workflow:${instance._id}:${status}:${instance.history.length}`,
    );
  }
}

async function enterNextStep(instance, definition, request, actor = null) {
  while (instance.currentStepIndex < definition.steps.length) {
    const step = definition.steps[instance.currentStepIndex];
    const condition = applicableCondition(
      definition,
      "before_step",
      step._id,
      instance.requestSnapshot,
    );
    if (condition?.action === "skip_step") {
      instance.history.push({
        event: "step_skipped",
        stepId: String(step._id),
        stepName: step.name,
        actor,
        message: condition.message || "Skipped by a workflow condition.",
      });
      instance.currentStepIndex += 1;
      continue;
    }
    if (condition?.action === "return") {
      instance.status = "returned";
      instance.completedAt = new Date();
      instance.currentApprovers = [];
      instance.history.push({
        event: "returned",
        stepId: String(step._id),
        stepName: step.name,
        actor,
        message: condition.message || "Returned by a workflow condition.",
      });
      await instance.save();
      await syncCase(
        instance,
        definition,
        request,
        definition.actions.returnedStatus,
        actor,
        condition.message || "Request returned by a workflow condition.",
      );
      return;
    }
    if (condition?.action === "reject") {
      instance.status = "rejected";
      instance.completedAt = new Date();
      instance.currentApprovers = [];
      instance.history.push({
        event: "rejected",
        stepId: String(step._id),
        stepName: step.name,
        actor,
        message: condition.message || "Rejected by a workflow condition.",
      });
      await instance.save();
      await syncCase(
        instance,
        definition,
        request,
        definition.actions.rejectedStatus,
        actor,
        condition.message || "Request rejected by a workflow condition.",
      );
      return;
    }

    const approvers = await resolveStepApprovers(
      definition,
      step,
      request.requesterUser,
    );
    if (!approvers.length) {
      throw new Error(`No active approver is available for step "${step.name}".`);
    }
    instance.currentApprovers = approvers.map((user) => user._id);
    instance.parallelApprovals = [];
    instance.requestSnapshot.request.currentStep = step.name;
    instance.markModified("requestSnapshot");
    instance.history.push({
      event: "started",
      stepId: String(step._id),
      stepName: step.name,
      actor,
      message: `Approval requested from ${step.name}.`,
    });
    await instance.save();
    request.status = "IN_REVIEW";
    request.assignedUser = instance.currentApprovers[0];
    request.workflowInstance = instance._id;
    request.steps.push({
      actorUser: actor || request.requesterUser,
      status: "IN_REVIEW",
      note: `Routed to ${step.name}.`,
      actedAt: new Date(),
    });
    await request.save();
    if (definition.notifications.approvers) {
      await createNotifications(
        approvers,
        "Approval required",
        `${request.caseNumber}: ${request.subject} requires your approval at ${step.name}.`,
        `workflow:${instance._id}:step:${step._id}`,
      );
    }
    if (definition.notifications.requesterStatusChanges) {
      await createNotifications(
        [{ _id: request.requesterUser }],
        "Request under review",
        `${request.caseNumber}: your request is awaiting ${step.name}.`,
        `workflow:${instance._id}:requester:${step._id}`,
      );
    }
    return;
  }

  instance.status = "completed";
  instance.completedAt = new Date();
  instance.currentApprovers = [];
  instance.history.push({
    event: "completed",
    actor,
    message: "All approval steps are complete.",
  });
  await instance.save();
  await syncCase(
    instance,
    definition,
    request,
    definition.actions.approvedStatus,
    actor,
    "All workflow approvals completed.",
  );
}

export async function startCaseWorkflow(request) {
  const existing = await WorkflowInstance.findOne({
    requestType: "workflow_case",
    request: request._id,
  });
  if (existing) return existing;

  const definitions = await WorkflowDefinition.find({
    status: "published",
    triggerEvent: "case.created",
  }).sort({ updatedAt: -1 });
  const requester = await User.findById(request.requesterUser).select("roles activeRole");
  const requesterRoles = getUserRoles(requester);
  const definition = definitions.find((item) => {
    const matchesType =
      item.requestTypes.includes("*") ||
      item.requestTypes.includes(String(request.type).toUpperCase());
    const matchesDepartment =
      item.department === "Any" || item.department === request.department;
    const matchesUserType =
      item.applicableUserTypes.length === 0 ||
      item.applicableUserTypes.some((role) => requesterRoles.includes(role));
    return matchesType && matchesDepartment && matchesUserType;
  });
  if (!definition) return null;

  const requestSnapshot = {
    request: {
      type: request.type,
      subject: request.subject,
      description: request.description,
      department: request.department,
      priority: request.priority,
      data: request.workflowData || {},
    },
    requester: { roles: requesterRoles },
  };
  const instance = await WorkflowInstance.create({
    workflow: definition._id,
    requestType: "workflow_case",
    request: request._id,
    requester: request.requesterUser,
    approvalMode: definition.approvalMode,
    requestSnapshot,
    history: [{
      event: "started",
      message: `Workflow "${definition.name}" started for ${request.caseNumber}.`,
    }],
  });
  const firstCondition = applicableCondition(
    definition,
    "before_start",
    null,
    requestSnapshot,
  );
  if (firstCondition?.action === "return" || firstCondition?.action === "reject") {
    instance.currentStepIndex = definition.steps.length;
    instance.status = firstCondition.action === "return" ? "returned" : "rejected";
    instance.completedAt = new Date();
    instance.history.push({
      event: firstCondition.action === "return" ? "returned" : "rejected",
      message: firstCondition.message || `Request ${firstCondition.action}ed by a workflow condition.`,
    });
    await instance.save();
    await syncCase(
      instance,
      definition,
      request,
      firstCondition.action === "return"
        ? definition.actions.returnedStatus
        : definition.actions.rejectedStatus,
      null,
      firstCondition.message || `Request ${firstCondition.action}ed by a workflow condition.`,
    );
    return instance;
  }
  await enterNextStep(instance, definition, request);
  return instance;
}

export async function decideWorkflowInstance(instance, actor, decision, note = "") {
  const definition = await WorkflowDefinition.findById(instance.workflow);
  const request = await WorkflowCase.findById(instance.request);
  if (!definition || !request) {
    throw Object.assign(new Error("Workflow request could not be found."), { status: 404 });
  }
  if (instance.status !== "in_progress") {
    throw Object.assign(new Error("This workflow instance is no longer active."), { status: 409 });
  }
  const actorId = String(actor._id || actor.id);
  if (!instance.currentApprovers.some((userId) => String(userId) === actorId)) {
    throw Object.assign(new Error("This approval is not assigned to your account."), { status: 403 });
  }
  if (!["approve", "reject", "return"].includes(decision)) {
    throw Object.assign(new Error("Choose approve, reject or return."), { status: 400 });
  }

  const step = definition.steps[instance.currentStepIndex];
  if (!step) {
    throw Object.assign(new Error("The current workflow step is invalid."), { status: 409 });
  }
  const event = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "returned";
  instance.history.push({
    event,
    stepId: String(step._id),
    stepName: step.name,
    actor: actorId,
    message: String(note || `Request ${decision}d.`).slice(0, 500),
  });

  if (decision === "reject" || decision === "return") {
    instance.status = decision === "reject" ? "rejected" : "returned";
    instance.completedAt = new Date();
    instance.currentApprovers = [];
    instance.parallelApprovals = [];
    await instance.save();
    const nextStatus =
      decision === "reject"
        ? definition.actions.rejectedStatus
        : definition.actions.returnedStatus;
    await syncCase(instance, definition, request, nextStatus, actorId, note || `Request ${decision}d.`);
    return instance;
  }

  instance.currentApprovers = instance.currentApprovers.filter(
    (userId) => String(userId) !== actorId,
  );
  instance.parallelApprovals.push(actorId);
  if (instance.currentApprovers.length) {
    await instance.save();
    return instance;
  }
  instance.currentStepIndex += 1;
  await instance.save();
  await enterNextStep(instance, definition, request, actorId);
  return instance;
}

export async function testWorkflowConditions(definition, sampleRequest) {
  const errors = validateWorkflowDefinition(definition);
  let stepIndex = 0;
  const events = [];
  const startCondition = applicableCondition(
    definition,
    "before_start",
    null,
    sampleRequest,
  );
  if (startCondition) {
    events.push({ action: startCondition.action, message: startCondition.message });
    if (startCondition.action !== "skip_step") {
      return { valid: errors.length === 0, errors, result: startCondition.action, events };
    }
  }

  while (stepIndex < definition.steps.length) {
    const step = definition.steps[stepIndex];
    const condition = applicableCondition(
      definition,
      "before_step",
      step._id || step.id,
      sampleRequest,
    );
    if (condition?.action === "skip_step") {
      events.push({ step: step.name, action: "skip_step", message: condition.message });
      stepIndex += 1;
      continue;
    }
    if (condition) {
      events.push({ step: step.name, action: condition.action, message: condition.message });
      return { valid: errors.length === 0, errors, result: condition.action, events };
    }
    events.push({ step: step.name, action: "approval_required" });
    stepIndex += 1;
  }
  if (stepIndex === definition.steps.length) events.push({ action: "complete" });
  return {
    valid: errors.length === 0,
    errors,
    result: events.at(-1)?.step || events.at(-1)?.action,
    events,
  };
}

export function userCanViewWorkflowInstance(instance, user) {
  const userId = String(user._id || user.id);
  const requesterId = String(instance.requester?._id || instance.requester);
  return (
    requesterId === userId ||
    instance.currentApprovers.some((approver) => String(approver._id || approver) === userId) ||
    instance.history.some((entry) => String(entry.actor?._id || entry.actor || "") === userId)
  );
}
