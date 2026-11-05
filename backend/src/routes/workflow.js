import { getUserRoles, logAudit } from "../db.js";
import {
  Department,
  Notification,
  Student,
  User,
  WorkflowCase,
  WorkflowDefinition,
  WorkflowInstance,
} from "../models/index.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { hasPermission, CORE_ROLES } from "../permissions/catalog.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  decideWorkflowInstance,
  startCaseWorkflow,
  testWorkflowConditions,
  userCanViewWorkflowInstance,
  validateWorkflowAssignments,
} from "../services/workflowEngine.js";

const APPROVER_ROLES = CORE_ROLES.filter(
  (role) => !["student", "parent"].includes(role),
);

function workflowPayload(body = {}) {
  return {
    name: String(body.name || "").trim(),
    description: String(body.description || "").trim(),
    category: String(body.category || "").trim(),
    department: String(body.department || "").trim(),
    triggerEvent: body.triggerEvent || "case.created",
    requestTypes: Array.isArray(body.requestTypes)
      ? [...new Set(body.requestTypes.map((value) => String(value).trim().toUpperCase()).filter(Boolean))]
      : [],
    applicableUserTypes: Array.isArray(body.applicableUserTypes)
      ? [...new Set(body.applicableUserTypes.filter((role) => CORE_ROLES.includes(role)))]
      : [],
    approvalMode: body.approvalMode === "parallel" ? "parallel" : "sequential",
    steps: Array.isArray(body.steps)
      ? body.steps.map((step) => ({
          ...(step._id ? { _id: step._id } : {}),
          name: String(step.name || "").trim(),
          assigneeType: step.assigneeType,
          role: step.assigneeType === "role" ? step.role : null,
          user: step.assigneeType === "user" ? step.user : null,
        }))
      : [],
    conditions: Array.isArray(body.conditions)
      ? body.conditions.map((condition) => ({
          stage: condition.stage,
          stepId: condition.stepId || null,
          field: String(condition.field || "").trim(),
          operator: condition.operator,
          value:
            condition.value === "true"
              ? true
              : condition.value === "false"
                ? false
                : typeof condition.value === "string" && condition.value.trim() !== "" && Number.isFinite(Number(condition.value))
                  ? Number(condition.value)
                  : condition.value ?? null,
          action: condition.action,
          message: String(condition.message || "").trim(),
        }))
      : [],
    notifications: {
      approvers: body.notifications?.approvers !== false,
      requesterStatusChanges: body.notifications?.requesterStatusChanges !== false,
      pendingReminders: body.notifications?.pendingReminders === true,
      reminderHours: Math.max(1, Math.min(720, Number(body.notifications?.reminderHours) || 24)),
    },
    actions: {
      approvedStatus: body.actions?.approvedStatus === "COMPLETED" ? "COMPLETED" : "APPROVED",
      rejectedStatus: "REJECTED",
      returnedStatus: "MORE_INFO",
    },
  };
}

function serializeDefinition(definition, executionCount = 0) {
  const value = definition.toObject ? definition.toObject() : definition;
  return {
    ...value,
    id: String(value._id),
    executionCount,
    steps: (value.steps || []).map((step) => ({
      ...step,
      id: String(step._id),
      user: step.user ? String(step.user._id || step.user) : null,
    })),
  };
}

function serializeInstance(instance) {
  const value = instance.toObject ? instance.toObject() : instance;
  const workflow = value.workflow || {};
  const requester = value.requester || {};
  const request = value.request || {};
  const currentStep = workflow.steps?.[value.currentStepIndex];
  return {
    ...value,
    id: String(value._id),
    workflow: {
      id: String(workflow._id || workflow),
      name: workflow.name || "Workflow",
      category: workflow.category || "",
      steps: workflow.steps || [],
    },
    requester: {
      id: String(requester._id || requester),
      name: [requester.firstName, requester.lastName].filter(Boolean).join(" "),
    },
    request: {
      id: String(request._id || request),
      caseNumber: request.caseNumber || "",
      type: request.type || "",
      subject: request.subject || "",
      status: request.status || "",
    },
    currentStep: currentStep?.name || (value.status === "completed" ? "Completed" : ""),
    currentApprovers: (value.currentApprovers || []).map((user) => String(user._id || user)),
    currentApproverNames: (value.currentApprovers || [])
      .map((user) => [user.firstName, user.lastName].filter(Boolean).join(" "))
      .filter(Boolean),
    history: (value.history || []).map((entry) => ({
      ...entry,
      actorName: entry.actor?.firstName
        ? [entry.actor.firstName, entry.actor.lastName].filter(Boolean).join(" ")
        : "",
    })),
  };
}

export function registerWorkflowRoutes(app) {
  app.get(
    "/api/workflows/options",
    requireAuth,
    requirePermission("workflow.manage"),
    async (req, res) => {
      try {
        const [users, departments] = await Promise.all([
          User.find({
            roles: { $in: APPROVER_ROLES },
            isActive: { $ne: false },
            $or: [{ accountStatus: "ACTIVE" }, { accountStatus: { $exists: false } }],
          })
            .select("firstName lastName email roles")
            .sort({ firstName: 1, lastName: 1 })
            .limit(500),
          Department.find().select("name").sort({ name: 1 }),
        ]);
        res.json({
          roles: APPROVER_ROLES,
          users: users.map((user) => ({
            id: String(user._id),
            name: `${user.firstName} ${user.lastName}`.trim(),
            email: user.email,
            roles: user.roles,
          })),
          categories: [
            "Leave Approval",
            "Document Request",
            "Fee Approval",
            "Academic",
            "Administrative",
          ],
          userTypes: CORE_ROLES,
          requestTypes: [...new Set([
            "*",
            "GENERAL",
            "LEAVE",
            "DOCUMENT_REQUEST",
            "FEE_APPROVAL",
            "ACADEMIC",
            "ADMINISTRATIVE",
            ...(await WorkflowCase.distinct("type")),
          ])],
          departments: ["Any", ...new Set(departments.map((item) => item.name).filter(Boolean))],
        });
      } catch (error) {
        res.status(500).json({ error: "Failed to load workflow configuration options." });
      }
    },
  );

  app.get(
    "/api/workflows",
    requireAuth,
    requirePermission("workflow.view"),
    async (req, res) => {
      try {
        const { status, templates } = req.query;
        const filter = {};
        if (status && ["draft", "published", "paused", "archived", "template"].includes(String(status))) {
          filter.status = String(status);
        }
        if (templates === "true") filter.isTemplate = true;
        else if (templates === "false") filter.isTemplate = false;
        const definitions = await WorkflowDefinition.find(filter).sort({ updatedAt: -1 }).limit(200);
        const counts = await WorkflowInstance.aggregate([
          { $group: { _id: "$workflow", count: { $sum: 1 } } },
        ]);
        const countById = new Map(counts.map((row) => [String(row._id), row.count]));
        res.json({
          workflows: definitions.map((item) =>
            serializeDefinition(item, countById.get(String(item._id)) || 0),
          ),
        });
      } catch (error) {
        res.status(500).json({ error: "Failed to load workflows." });
      }
    },
  );

  app.post(
    "/api/workflows",
    requireAuth,
    requirePermission("workflow.manage"),
    async (req, res) => {
      try {
        const payload = workflowPayload(req.body);
        const actorId = req.user._id || req.user.id;
        const workflow = await WorkflowDefinition.create({
          ...payload,
          createdBy: actorId,
          updatedBy: actorId,
        });
        await logAudit({
          userId: actorId,
          action: "WORKFLOW_CREATED",
          module: "workflow",
          resource: "workflow_definition",
          resourceId: String(workflow._id),
          details: `Workflow draft created: ${workflow.name}.`,
        });
        res.status(201).json({ workflow: serializeDefinition(workflow) });
      } catch (error) {
        if (error.name === "ValidationError") {
          return res.status(400).json({ error: "Workflow configuration is invalid." });
        }
        res.status(500).json({ error: "Failed to save workflow." });
      }
    },
  );

  app.post(
    "/api/workflows/validate",
    requireAuth,
    requirePermission("workflow.manage"),
    asyncHandler(async (req, res) => {
      const errors = await validateWorkflowAssignments(workflowPayload(req.body));
      res.json({ valid: errors.length === 0, errors });
    }),
  );

  app.post(
    "/api/workflows/test",
    requireAuth,
    requirePermission("workflow.manage"),
    asyncHandler(async (req, res) => {
      const workflow = workflowPayload(req.body);
      const errors = await validateWorkflowAssignments(workflow);
      const result = await testWorkflowConditions(workflow, req.body.sampleRequest || {});
      res.json({
        valid: errors.length === 0,
        errors,
        result: result.result,
        events: result.events,
      });
    }),
  );

  app.post(
    "/api/workflows/:id/clone",
    requireAuth,
    requirePermission("workflow.manage"),
    async (req, res) => {
      try {
        const source = await WorkflowDefinition.findById(req.params.id);
        if (!source || (!source.isTemplate && source.status !== "published")) {
          return res.status(404).json({ error: "Workflow template not found." });
        }
        const stepIdMap = new Map(
          source.steps.map((step) => [
            String(step._id),
            new WorkflowDefinition().steps.create(step)._id.toString(),
          ]),
        );
        const copy = await WorkflowDefinition.create({
          ...source.toObject(),
          _id: undefined,
          name: `${source.name} copy`,
          status: "draft",
          isTemplate: false,
          publishedAt: null,
          createdBy: req.user._id || req.user.id,
          updatedBy: req.user._id || req.user.id,
          steps: source.steps.map((step) => ({
            name: step.name,
            assigneeType: step.assigneeType,
            role: step.role,
            user: step.user,
            _id: stepIdMap.get(String(step._id)),
          })),
          conditions: source.conditions.map((condition) => ({
            ...condition.toObject(),
            stepId: stepIdMap.get(String(condition.stepId)) || condition.stepId,
          })),
        });
        res.status(201).json({ workflow: serializeDefinition(copy) });
      } catch (error) {
        res.status(500).json({ error: "Failed to create a workflow from this template." });
      }
    },
  );

  app.put(
    "/api/workflows/:id",
    requireAuth,
    requirePermission("workflow.manage"),
    async (req, res) => {
      try {
        const workflow = await WorkflowDefinition.findById(req.params.id);
        if (!workflow) return res.status(404).json({ error: "Workflow not found." });
        if (!["draft", "paused"].includes(workflow.status)) {
          return res.status(409).json({ error: "Pause the workflow before editing it." });
        }
        const payload = workflowPayload(req.body);
        Object.assign(workflow, payload, { updatedBy: req.user._id || req.user.id });
        await workflow.save();
        res.json({ workflow: serializeDefinition(workflow) });
      } catch (error) {
        if (error.name === "ValidationError") {
          return res.status(400).json({ error: "Workflow configuration is invalid." });
        }
        res.status(500).json({ error: "Failed to update workflow." });
      }
    },
  );

  app.post(
    "/api/workflows/:id/publish",
    requireAuth,
    requirePermission("workflow.manage"),
    async (req, res) => {
      try {
        const workflow = await WorkflowDefinition.findById(req.params.id);
        if (!workflow) return res.status(404).json({ error: "Workflow not found." });
        if (workflow.isTemplate) {
          return res.status(409).json({ error: "Create a draft from this template before publishing." });
        }
        const errors = await validateWorkflowAssignments(workflow);
        if (errors.length) return res.status(422).json({ error: "Workflow validation failed.", errors });
        workflow.status = "published";
        workflow.publishedAt = new Date();
        workflow.updatedBy = req.user._id || req.user.id;
        await workflow.save();
        res.json({ workflow: serializeDefinition(workflow) });
      } catch (error) {
        res.status(500).json({ error: "Failed to publish workflow." });
      }
    },
  );

  app.patch(
    "/api/workflows/:id/status",
    requireAuth,
    requirePermission("workflow.manage"),
    asyncHandler(async (req, res) => {
      const status = String(req.body?.status || "");
      if (!["paused", "archived"].includes(status)) {
        return res.status(400).json({ error: "Choose a supported workflow status." });
      }
      const workflow = await WorkflowDefinition.findById(req.params.id);
      if (!workflow) return res.status(404).json({ error: "Workflow not found." });
      if (workflow.status === "archived") {
        return res.status(409).json({ error: "Archived workflows cannot be changed." });
      }
      workflow.status = status;
      workflow.updatedBy = req.user._id || req.user.id;
      await workflow.save();
      res.json({ workflow: serializeDefinition(workflow) });
    }),
  );

  app.patch(
    "/api/workflows/:id/template",
    requireAuth,
    requirePermission("workflow.manage"),
    asyncHandler(async (req, res) => {
      const workflow = await WorkflowDefinition.findById(req.params.id);
      if (!workflow) return res.status(404).json({ error: "Workflow not found." });
      if (workflow.status === "published") {
        return res.status(409).json({ error: "Pause the workflow before saving it as a template." });
      }
      workflow.isTemplate = Boolean(req.body?.isTemplate);
      workflow.status = workflow.isTemplate ? "template" : "draft";
      workflow.updatedBy = req.user._id || req.user.id;
      await workflow.save();
      res.json({ workflow: serializeDefinition(workflow) });
    }),
  );

  app.get(
    "/api/workflow-instances",
    requireAuth,
    requirePermission("workflow.view"),
    async (req, res) => {
      try {
        const canManage = hasPermission(getUserRoles(req.user), "workflow.manage");
        const visibilityFilter = canManage
          ? {}
          : {
              $or: [
                { requester: req.user._id || req.user.id },
                { currentApprovers: req.user._id || req.user.id },
              ],
            };
        const instanceFilter = { ...visibilityFilter };
        if (req.query.status) instanceFilter.status = String(req.query.status);
        const [instances, counts] = await Promise.all([
          WorkflowInstance.find(instanceFilter)
            .populate("workflow")
            .populate("requester", "firstName lastName")
            .populate("request")
            .populate("currentApprovers", "firstName lastName")
            .populate("history.actor", "firstName lastName")
            .sort({ createdAt: -1 })
            .limit(200),
          WorkflowInstance.aggregate([
            { $match: visibilityFilter },
            { $group: { _id: "$status", count: { $sum: 1 } } },
          ]),
        ]);
        const stats = Object.fromEntries(counts.map((row) => [row._id, row.count]));
        res.json({
          instances: instances.map(serializeInstance),
          stats: {
            running: stats.in_progress || 0,
            completed: stats.completed || 0,
            total: Object.values(stats).reduce((sum, value) => sum + value, 0),
          },
        });
      } catch (error) {
        res.status(500).json({ error: "Failed to load workflow instances." });
      }
    },
  );

  app.get(
    "/api/workflow-instances/:id",
    requireAuth,
    requirePermission("workflow.view"),
    async (req, res) => {
      try {
        const instance = await WorkflowInstance.findById(req.params.id)
          .populate("workflow")
          .populate("requester", "firstName lastName")
          .populate("request")
          .populate("currentApprovers", "firstName lastName")
          .populate("history.actor", "firstName lastName");
        if (!instance) return res.status(404).json({ error: "Workflow instance not found." });
        const canManage = hasPermission(getUserRoles(req.user), "workflow.manage");
        if (!canManage && !userCanViewWorkflowInstance(instance, req.user)) {
          return res.status(403).json({ error: "Access denied to this workflow instance." });
        }
        res.json({ instance: serializeInstance(instance) });
      } catch (error) {
        res.status(500).json({ error: "Failed to load workflow instance." });
      }
    },
  );

  app.post(
    "/api/workflow-instances/:id/decision",
    requireAuth,
    async (req, res) => {
      try {
        const instance = await WorkflowInstance.findById(req.params.id);
        if (!instance) return res.status(404).json({ error: "Workflow instance not found." });
        await decideWorkflowInstance(
          instance,
          req.user,
          String(req.body?.decision || ""),
          String(req.body?.note || "").slice(0, 500),
        );
        const updated = await WorkflowInstance.findById(instance._id)
          .populate("workflow")
          .populate("requester", "firstName lastName")
          .populate("request")
          .populate("currentApprovers", "firstName lastName")
          .populate("history.actor", "firstName lastName");
        res.json({ instance: serializeInstance(updated) });
      } catch (error) {
        res.status(error.status || 500).json({
          error: error.status ? error.message : "Workflow decision could not be recorded.",
        });
      }
    },
  );

  app.get("/api/cases", requireAuth, requirePermission("workflow.view"), async (req, res) => {
    try {
      const roles = getUserRoles(req.user);
const isStaff = roles.some((role) =>
        [
          "campus_admin",
          "hod",
          "registrar",
          "faculty",
          "finance_officer",
          "super_admin",
        ].includes(role)
      );

      const filter = isStaff ? {} : { requesterUser: req.user._id || req.user.id };
      const cases = await WorkflowCase.find(filter)
        .populate("requesterUser", "firstName lastName email")
        .sort({ createdAt: -1 })
        .limit(200);

      const formatted = cases.map((c) => ({
        id: c._id.toString(),
        case_id: c.caseNumber,
        type: c.type,
        subject: c.subject,
        description: c.description,
        department: c.department,
        priority: c.priority,
        status: c.status,
        created_at: c.createdAt.toISOString(),
        updated_at: c.updatedAt.toISOString(),
        requester_name: c.requesterUser ? `${c.requesterUser.firstName} ${c.requesterUser.lastName}`.trim() : "User",
      }));

      res.json({ cases: formatted });
    } catch (err) {
      res.status(500).json({ error: "Failed to load workflow cases." });
    }
  });

  app.post("/api/cases", requireAuth, requirePermission("workflow.create"), async (req, res) => {
    try {
      const {
        type,
        subject,
        description,
        department = "Registrar",
        priority = "NORMAL",
        workflowData = {},
      } = req.body || {};
      if (!type || !subject) {
        return res.status(400).json({ error: "Case type and subject are required." });
      }
      if (
        !workflowData ||
        typeof workflowData !== "object" ||
        Array.isArray(workflowData) ||
        JSON.stringify(workflowData).length > 8000
      ) {
        return res.status(400).json({ error: "Request workflow data must be an object under 8 KB." });
      }

      const count = await WorkflowCase.countDocuments();
      const caseNumber = `CASE-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

      const student = await Student.findOne({ user: req.user._id || req.user.id });

      const newCase = await WorkflowCase.create({
        caseNumber,
        type: String(type).toUpperCase(),
        subject: String(subject).trim(),
        description: String(description || "").trim(),
        department,
        priority: String(priority).toUpperCase(),
        requesterUser: req.user._id || req.user.id,
        student: student?._id || null,
        workflowData,
        status: "SUBMITTED",
        steps: [
          {
            actorUser: req.user._id || req.user.id,
            status: "SUBMITTED",
            note: "Case created by requester.",
            actedAt: new Date(),
          },
        ],
      });

      let workflowInstance;
      try {
        workflowInstance = await startCaseWorkflow(newCase);
      } catch (error) {
        await WorkflowInstance.deleteMany({ request: newCase._id });
        await newCase.deleteOne();
        throw error;
      }
      await logAudit({
        userId: req.user._id || req.user.id,
        action: "CASE_CREATED",
        module: "workflow",
        resource: "workflow_case",
        resourceId: newCase._id.toString(),
        details: `Case submitted: ${caseNumber} - ${subject}.`,
      });

      res.status(201).json({
        success: true,
        caseId: newCase._id.toString(),
        case: {
          id: newCase._id.toString(),
          case_id: caseNumber,
          type: newCase.type,
          subject: newCase.subject,
          status: newCase.status,
        },
        workflowInstance: workflowInstance ? String(workflowInstance._id) : null,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to create workflow case." });
    }
  });

  app.patch("/api/cases/:id/status", requireAuth, requirePermission("workflow.manage"), async (req, res) => {
    try {
      const { status, note } = req.body || {};
      const caseDoc = await WorkflowCase.findById(req.params.id);
      if (!caseDoc) return res.status(404).json({ error: "Case not found." });
      if (caseDoc.workflowInstance) {
        const instance = await WorkflowInstance.findById(caseDoc.workflowInstance);
        if (instance?.status === "in_progress") {
          return res.status(409).json({
            error: "This request is controlled by its workflow. Record an approval decision instead.",
          });
        }
      }

      const nextStatus = String(status || caseDoc.status).toUpperCase();
      caseDoc.status = nextStatus;
      caseDoc.steps.push({
        actorUser: req.user._id || req.user.id,
        status: nextStatus,
        note: note || `Status updated to ${nextStatus}`,
        actedAt: new Date(),
      });
      if (["APPROVED", "REJECTED", "COMPLETED", "CANCELLED"].includes(nextStatus)) {
        caseDoc.resolvedAt = new Date();
      }
      await caseDoc.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "CASE_STATUS_UPDATED",
        module: "workflow",
        resource: "workflow_case",
        resourceId: caseDoc._id.toString(),
        details: `Case ${caseDoc.caseNumber} status changed to ${nextStatus}.`,
      });

      res.json({ success: true, case: caseDoc });
    } catch (err) {
      res.status(500).json({ error: "Failed to update case status." });
    }
  });
}
