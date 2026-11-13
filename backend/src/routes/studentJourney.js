import { requireAuth, requirePermission } from "../middleware/auth.js";
import { getUserRoles } from "../db.js";
import { Student, WorkflowCase, WorkflowDefinition, WorkflowInstance, AcademicCalendarEvent } from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const JOURNEY_STAGES = [
  { key: "admission", label: "Admission & Enrolment", order: 1, department: "Registrar", icon: "user-plus" },
  { key: "semester_registration", label: "Semester Registration", order: 2, department: "Registrar", icon: "calendar-check" },
  { key: "course_registration", label: "Course Registration", order: 3, department: "Academic", icon: "book-open" },
  { key: "exam_eligibility", label: "Examination Eligibility", order: 4, department: "Examination", icon: "file-lines" },
  { key: "internship_approval", label: "Internship Approval", order: 5, department: "Internship Coordinator", icon: "briefcase" },
  { key: "academic_appeals", label: "Academic Appeals", order: 6, department: "Registrar", icon: "scale-balanced" },
  { key: "scholarship_application", label: "Scholarship Applications", order: 7, department: "Finance", icon: "hand-holding-dollar" },
  { key: "certificate_application", label: "Certificate Applications", order: 8, department: "Registrar", icon: "certificate" },
  { key: "graduation_clearance", label: "Graduation Clearance", order: 9, department: "Registrar", icon: "graduation-cap" },
  { key: "convocation_registration", label: "Convocation Registration", order: 10, department: "Registrar", icon: "award" },
];

export function registerStudentJourneyRoutes(app) {
  app.get(
    "/api/student-journey/timeline",
    requireAuth,
    requirePermission("studentJourney.view"),
    async (req, res) => {
      try {
        const roles = getUserRoles(req.user);
        const isStudent = roles.includes("student");

        let studentId = req.query.studentId;
        if (isStudent) {
          const student = await Student.findOne({ user: req.user._id || req.user.id });
          if (!student) return res.status(404).json({ error: "Student profile not found." });
          studentId = student._id;
        }
        if (!studentId) return res.status(400).json({ error: "Student ID required." });

        const student = await Student.findById(studentId).populate("user").lean();
        if (!student) return res.status(404).json({ error: "Student not found." });

        const cases = await WorkflowCase.find({ student: studentId })
          .populate("workflowInstance")
          .sort({ createdAt: 1 })
          .lean();

        const casesByType = {};
        for (const c of cases) {
          const typeKey = String(c.type).toLowerCase();
          if (!casesByType[typeKey]) casesByType[typeKey] = [];
          casesByType[typeKey].push(c);
        }

        const timeline = JOURNEY_STAGES.map((stage) => {
          const relevantCases = casesByType[stage.key] || [];
          const latestCase = relevantCases[relevantCases.length - 1];
          const status = latestCase?.status || "NOT_STARTED";
          const completed = ["APPROVED", "COMPLETED"].includes(status);
          const inProgress = ["SUBMITTED", "IN_REVIEW", "MORE_INFO"].includes(status);
          const rejected = ["REJECTED", "CANCELLED"].includes(status);

          let currentCase = null;
          if (latestCase) {
            currentCase = {
              id: String(latestCase._id),
              caseNumber: latestCase.caseNumber,
              subject: latestCase.subject,
              status: latestCase.status,
              priority: latestCase.priority,
              createdAt: latestCase.createdAt,
              updatedAt: latestCase.updatedAt,
              workflowInstance: latestCase.workflowInstance
                ? {
                    id: String(latestCase.workflowInstance._id),
                    status: latestCase.workflowInstance.status,
                    currentStep: latestCase.workflowInstance.currentStepIndex,
                  }
                : null,
            };
          }

          let nextAction = null;
          if (inProgress && currentCase?.workflowInstance) {
            nextAction = {
              label: `Awaiting ${currentCase.workflowInstance.currentStep || "review"}`,
              url: `/requests/${latestCase._id}`,
            };
          } else if (!completed && !inProgress) {
            nextAction = {
              label: "Submit request",
              url: `/requests/create?type=${stage.key.toUpperCase()}`,
            };
          }

          return {
            ...stage,
            key: stage.key,
            status: completed ? "COMPLETED" : inProgress ? "IN_PROGRESS" : rejected ? "REJECTED" : "PENDING",
            completed,
            inProgress,
            rejected,
            currentCase,
            nextAction,
            estimatedProcessingDays: stage.key === "graduation_clearance" ? 14 : 7,
            requiredDocuments: getRequiredDocuments(stage.key),
            history: relevantCases.map((c) => ({
              id: String(c._id),
              caseNumber: c.caseNumber,
              status: c.status,
              createdAt: c.createdAt,
              resolvedAt: c.resolvedAt,
              steps: c.steps || [],
            })),
          };
        });

        const completedCount = timeline.filter((s) => s.completed).length;
        const inProgressCount = timeline.filter((s) => s.inProgress).length;
        const pendingCount = timeline.filter((s) => s.status === "PENDING").length;

        res.json({
          student: {
            id: String(student._id),
            studentId: student.studentId,
            fullName: `${student.firstName} ${student.lastName}`,
            program: student.program,
            semester: student.semester,
            department: student.department,
            status: student.status,
          },
          timeline,
          summary: {
            totalStages: timeline.length,
            completedCount,
            inProgressCount,
            pendingCount,
            progressPercentage: Math.round((completedCount / timeline.length) * 100),
          },
        });
      } catch (err) {
        console.error("Student journey timeline error:", err);
        res.status(500).json({ error: "Failed to load student journey." });
      }
    }
  );

  app.get(
    "/api/student-journey/stages/:stageKey",
    requireAuth,
    requirePermission("studentJourney.view"),
    async (req, res) => {
      try {
        const roles = getUserRoles(req.user);
        const isStudent = roles.includes("student");

        let studentId = req.query.studentId;
        if (isStudent) {
          const student = await Student.findOne({ user: req.user._id || req.user.id });
          if (!student) return res.status(404).json({ error: "Student profile not found." });
          studentId = student._id;
        }
        if (!studentId) return res.status(400).json({ error: "Student ID required." });

        const stageKey = req.params.stageKey;
        const stageDef = JOURNEY_STAGES.find((s) => s.key === stageKey);
        if (!stageDef) return res.status(404).json({ error: "Invalid stage." });

        const cases = await WorkflowCase.find({ student: studentId, type: stageKey.toUpperCase() })
          .populate("workflowInstance")
          .sort({ createdAt: -1 })
          .lean();

        const workflowDefs = await WorkflowDefinition.find({
          status: "published",
          requestTypes: { $in: ["*", stageKey.toUpperCase()] },
        }).lean();

        res.json({
          stage: { ...stageDef, key: stageKey },
          cases: cases.map((c) => ({
            id: String(c._id),
            caseNumber: c.caseNumber,
            subject: c.subject,
            description: c.description,
            status: c.status,
            priority: c.priority,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
            resolvedAt: c.resolvedAt,
            workflowInstance: c.workflowInstance
              ? {
                  id: String(c.workflowInstance._id),
                  status: c.workflowInstance.status,
                  currentStepIndex: c.workflowInstance.currentStepIndex,
                }
              : null,
            steps: c.steps || [],
          })),
          availableWorkflows: workflowDefs.map((w) => ({
            id: String(w._id),
            name: w.name,
            category: w.category,
            department: w.department,
            steps: w.steps.map((s) => ({ name: s.name, assigneeType: s.assigneeType, role: s.role })),
          })),
        });
      } catch (err) {
        console.error("Student journey stage error:", err);
        res.status(500).json({ error: "Failed to load stage details." });
      }
    }
  );

  app.post(
    "/api/student-journey/stages/:stageKey/initiate",
    requireAuth,
    requirePermission("workflow.create"),
    async (req, res) => {
      try {
        const roles = getUserRoles(req.user);
        const isStudent = roles.includes("student");

        let studentId = req.body.studentId;
        if (isStudent) {
          const student = await Student.findOne({ user: req.user._id || req.user.id });
          if (!student) return res.status(404).json({ error: "Student profile not found." });
          studentId = student._id;
        }
        if (!studentId) return res.status(400).json({ error: "Student ID required." });

        const stageKey = req.params.stageKey;
        const stageDef = JOURNEY_STAGES.find((s) => s.key === stageKey);
        if (!stageDef) return res.status(404).json({ error: "Invalid stage." });

        const { subject, description, priority = "NORMAL", workflowData = {} } = req.body || {};
        if (!subject) return res.status(400).json({ error: "Subject is required." });

        const count = await WorkflowCase.countDocuments();
        const caseNumber = `CASE-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

        const newCase = await WorkflowCase.create({
          caseNumber,
          type: stageKey.toUpperCase(),
          subject: String(subject).trim(),
          description: String(description || "").trim(),
          department: stageDef.department,
          priority: String(priority).toUpperCase(),
          requesterUser: req.user._id || req.user.id,
          student: studentId,
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
          const { startCaseWorkflow } = await import("../services/workflowEngine.js");
          workflowInstance = await startCaseWorkflow(newCase);
        } catch (error) {
          await WorkflowInstance.deleteMany({ request: newCase._id });
          await newCase.deleteOne();
          throw error;
        }

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
        console.error("Initiate journey stage error:", err);
        res.status(500).json({ error: "Failed to initiate stage request." });
      }
    }
  );

  // GET /api/student-journey/stages - Get all stages summary for a student
  app.get(
    "/api/student-journey/stages",
    requireAuth,
    requirePermission("studentJourney.view"),
    async (req, res) => {
      try {
        const roles = getUserRoles(req.user);
        const isStudent = roles.includes("student");

        let studentId = req.query.studentId;
        if (isStudent) {
          const student = await Student.findOne({ user: req.user._id || req.user.id });
          if (!student) return res.status(404).json({ error: "Student profile not found." });
          studentId = student._id;
        }
        if (!studentId) return res.status(400).json({ error: "Student ID required." });

        const student = await Student.findById(studentId).populate("user").lean();
        if (!student) return res.status(404).json({ error: "Student not found." });

        const cases = await WorkflowCase.find({ student: studentId })
          .populate("workflowInstance")
          .sort({ createdAt: 1 })
          .lean();

        const casesByType = {};
        for (const c of cases) {
          const typeKey = String(c.type).toLowerCase();
          if (!casesByType[typeKey]) casesByType[typeKey] = [];
          casesByType[typeKey].push(c);
        }

        const stages = JOURNEY_STAGES.map((stage) => {
          const relevantCases = casesByType[stage.key] || [];
          const latestCase = relevantCases[relevantCases.length - 1];
          const status = latestCase?.status || "NOT_STARTED";
          const completed = ["APPROVED", "COMPLETED"].includes(status);
          const inProgress = ["SUBMITTED", "IN_REVIEW", "MORE_INFO"].includes(status);
          const rejected = ["REJECTED", "CANCELLED"].includes(status);

          let currentCase = null;
          if (latestCase) {
            currentCase = {
              id: String(latestCase._id),
              caseNumber: latestCase.caseNumber,
              subject: latestCase.subject,
              status: latestCase.status,
              priority: latestCase.priority,
              createdAt: latestCase.createdAt,
              updatedAt: latestCase.updatedAt,
              workflowInstance: latestCase.workflowInstance
                ? {
                    id: String(latestCase.workflowInstance._id),
                    status: latestCase.workflowInstance.status,
                    currentStep: latestCase.workflowInstance.currentStepIndex,
                  }
                : null,
            };
          }

          let nextAction = null;
          if (inProgress && currentCase?.workflowInstance) {
            nextAction = {
              label: `Awaiting ${currentCase.workflowInstance.currentStep || "review"}`,
              url: `/requests/${latestCase._id}`,
            };
          } else if (!completed && !inProgress) {
            nextAction = {
              label: "Submit request",
              url: `/requests/create?type=${stage.key.toUpperCase()}`,
            };
          }

          return {
            ...stage,
            key: stage.key,
            status: completed ? "COMPLETED" : inProgress ? "IN_PROGRESS" : rejected ? "REJECTED" : "PENDING",
            completed,
            inProgress,
            rejected,
            currentCase,
            nextAction,
            estimatedProcessingDays: stage.key === "graduation_clearance" ? 14 : 7,
            requiredDocuments: getRequiredDocuments(stage.key),
            history: relevantCases.map((c) => ({
              id: String(c._id),
              caseNumber: c.caseNumber,
              status: c.status,
              createdAt: c.createdAt,
              resolvedAt: c.resolvedAt,
              steps: c.steps || [],
            })),
          };
        });

        res.json({ stages });
      } catch (err) {
        console.error("Student journey stages error:", err);
        res.status(500).json({ error: "Failed to load student stages." });
      }
    }
  );

  // GET /api/student-journey/workflow-templates - Get available workflow templates
  app.get(
    "/api/student-journey/workflow-templates",
    requireAuth,
    requirePermission("studentJourney.view"),
    async (req, res) => {
      try {
        const templates = await WorkflowDefinition.find({ status: "published" })
          .sort({ createdAt: -1 })
          .lean();

        res.json({
          templates: templates.map((w) => ({
            id: String(w._id),
            name: w.name,
            description: w.description,
            category: w.category,
            department: w.department,
            steps: w.steps.map((s) => ({
              stepOrder: s.stepOrder,
              name: s.name,
              description: s.description,
              responsibleRole: s.role,
              slaHours: s.slaHours || 0,
              formFields: s.formFields || [],
            })),
            isActive: w.status === "published",
          })),
        });
      } catch (err) {
        console.error("Workflow templates error:", err);
        res.status(500).json({ error: "Failed to load workflow templates." });
      }
    }
  );

  // POST /api/student-journey/initiate-workflow - Initiate a workflow for a student
  app.post(
    "/api/student-journey/initiate-workflow",
    requireAuth,
    requirePermission("workflow.create"),
    async (req, res) => {
      try {
        const { templateId, studentId, subject, description, priority = "NORMAL", workflowData = {} } = req.body || {};
        if (!templateId || !studentId || !subject) {
          return res.status(400).json({ error: "templateId, studentId, and subject are required." });
        }

        const template = await WorkflowDefinition.findById(templateId);
        if (!template) return res.status(404).json({ error: "Workflow template not found." });

        const student = await Student.findById(studentId);
        if (!student) return res.status(404).json({ error: "Student not found." });

        const count = await WorkflowCase.countDocuments();
        const caseNumber = `CASE-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

        const newCase = await WorkflowCase.create({
          caseNumber,
          type: template.requestTypes?.[0] || "GENERAL",
          subject: String(subject).trim(),
          description: String(description || "").trim(),
          department: template.department,
          priority: String(priority).toUpperCase(),
          requesterUser: req.user._id || req.user.id,
          student: studentId,
          workflowData,
          status: "SUBMITTED",
          steps: [
            {
              actorUser: req.user._id || req.user.id,
              status: "SUBMITTED",
              note: "Case created via workflow template.",
              actedAt: new Date(),
            },
          ],
        });

        let workflowInstance;
        try {
          const { startCaseWorkflow } = await import("../services/workflowEngine.js");
          workflowInstance = await startCaseWorkflow(newCase);
        } catch (error) {
          await WorkflowInstance.deleteMany({ request: newCase._id });
          await newCase.deleteOne();
          throw error;
        }

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
        console.error("Initiate workflow error:", err);
        res.status(500).json({ error: "Failed to initiate workflow." });
      }
    }
  );
}

function getRequiredDocuments(stageKey) {
  const docsMap = {
    admission: ["Admission letter", "Academic transcripts", "Identity documents"],
    semester_registration: ["Fee clearance", "Previous semester results"],
    course_registration: ["Course selection form", "Prerequisite verification"],
    exam_eligibility: ["Attendance certificate", "Assignment completion proof"],
    internship_approval: ["Offer letter", "Company NOC", "Supervisor details", "Insurance proof"],
    academic_appeals: ["Appeal letter", "Supporting evidence", "Previous decisions"],
    scholarship_application: ["Application form", "Income certificate", "Academic records"],
    certificate_application: ["Application form", "Identity proof", "Fee receipt"],
    graduation_clearance: ["No dues certificate (Finance)", "No dues certificate (Library)", "Exam clearance", "Academic transcript"],
    convocation_registration: ["Graduation clearance", "Gown measurement", "Guest count"],
  };
  return docsMap[stageKey] || [];
}