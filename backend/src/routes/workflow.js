import { getUserRoles, logAudit } from "../db.js";
import { WorkflowCase, Student } from "../models/index.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";

export function registerWorkflowRoutes(app) {
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
      const { type, subject, description, department = "Registrar", priority = "NORMAL" } = req.body || {};
      if (!type || !subject) {
        return res.status(400).json({ error: "Case type and subject are required." });
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
