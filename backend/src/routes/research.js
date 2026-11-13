import { requireAuth, requirePermission } from "../middleware/auth.js";
import { getUserRoles } from "../db.js";
import mongoose from "mongoose";
import { Student, User, ResearchProject, ResearchMilestone, ResearchMeeting, Course } from "../models/index.js";

export function registerResearchRoutes(app) {
  app.get(
    "/api/research/projects",
    requireAuth,
    requirePermission("research.view"),
    async (req, res) => {
      try {
        const roles = getUserRoles(req.user);
        const isStudent = roles.includes("student");
        const isFaculty = roles.includes("faculty");
        const isHod = roles.includes("hod") || roles.includes("program_coordinator");
        const isRegistrar = roles.includes("registrar");
        const isDean = roles.includes("dean");
        const isSuperAdmin = roles.includes("super_admin");

        const filter = {};
        if (isStudent) {
          const student = await Student.findOne({ user: req.user._id || req.user.id });
          if (!student) return res.status(404).json({ error: "Student profile not found." });
          filter.student = student._id;
        } else if (isFaculty && !isHod && !isRegistrar && !isDean && !isSuperAdmin) {
          filter.$or = [{ primarySupervisor: req.user._id || req.user.id }, { coSupervisor: req.user._id || req.user.id }];
        } else if (isHod && !isRegistrar && !isDean && !isSuperAdmin) {
          filter.hod = req.user._id || req.user.id;
        }

        if (req.query.status) filter.status = req.query.status;
        if (req.query.academicYear) filter.academicYear = req.query.academicYear;
        if (req.query.semester) filter.semester = Number(req.query.semester);
        if (req.query.course) filter.course = req.query.course;

        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
        const skip = (page - 1) * limit;

        const [projects, total] = await Promise.all([
          ResearchProject.find(filter)
            .populate("student", "studentId firstName lastName program semester")
            .populate("primarySupervisor", "firstName lastName")
            .populate("coSupervisor", "firstName lastName")
            .populate("hod", "firstName lastName")
            .populate("course", "code name")
            .populate("externalExaminer", "firstName lastName")
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
          ResearchProject.countDocuments(filter),
        ]);

        res.json({
          projects: projects.map((p) => ({
            ...p,
            id: String(p._id),
            student: p.student
              ? { id: String(p.student._id), studentId: p.student.studentId, fullName: `${p.student.firstName} ${p.student.lastName}`, program: p.student.program, semester: p.student.semester }
              : null,
            primarySupervisor: p.primarySupervisor
              ? { id: String(p.primarySupervisor._id), name: `${p.primarySupervisor.firstName} ${p.primarySupervisor.lastName}` }
              : null,
            coSupervisor: p.coSupervisor
              ? { id: String(p.coSupervisor._id), name: `${p.coSupervisor.firstName} ${p.coSupervisor.lastName}` }
              : null,
            hod: p.hod
              ? { id: String(p.hod._id), name: `${p.hod.firstName} ${p.hod.lastName}` }
              : null,
            course: p.course
              ? { id: String(p.course._id), code: p.course.code, name: p.course.name }
              : null,
            externalExaminer: p.externalExaminer
              ? { id: String(p.externalExaminer._id), name: `${p.externalExaminer.firstName} ${p.externalExaminer.lastName}` }
              : null,
          })),
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
      } catch (err) {
        console.error("Research projects error:", err);
        res.status(500).json({ error: "Failed to load research projects." });
      }
    }
  );

  app.get(
    "/api/research/projects/:id",
    requireAuth,
    requirePermission("research.view"),
    async (req, res) => {
      try {
        const project = await ResearchProject.findById(req.params.id)
          .populate("student", "studentId firstName lastName program semester user")
          .populate("primarySupervisor", "firstName lastName email")
          .populate("coSupervisor", "firstName lastName email")
          .populate("hod", "firstName lastName email")
          .populate("course", "code name")
          .populate("externalExaminer", "firstName lastName email")
          .lean();

        if (!project) return res.status(404).json({ error: "Project not found." });

        const roles = getUserRoles(req.user);
        const isStudent = roles.includes("student");
        if (isStudent) {
          const student = await Student.findOne({ user: req.user._id || req.user.id });
          if (!student || String(project.student._id) !== String(student._id)) {
            return res.status(403).json({ error: "Access denied." });
          }
        }

        const [milestones, meetings] = await Promise.all([
          ResearchMilestone.find({ project: project._id })
            .populate("supervisorReviewedBy", "firstName lastName")
            .populate("hodReviewedBy", "firstName lastName")
            .sort({ order: 1 })
            .lean(),
          ResearchMeeting.find({ project: project._id })
            .populate("attendees.user", "firstName lastName")
            .sort({ scheduledAt: -1 })
            .lean(),
        ]);

        res.json({
          project: {
            ...project,
            id: String(project._id),
            student: project.student
              ? { id: String(project.student._id), studentId: project.student.studentId, fullName: `${project.student.firstName} ${project.student.lastName}`, program: project.student.program, semester: project.student.semester }
              : null,
            primarySupervisor: project.primarySupervisor
              ? { id: String(project.primarySupervisor._id), name: `${project.primarySupervisor.firstName} ${project.primarySupervisor.lastName}`, email: project.primarySupervisor.email }
              : null,
            coSupervisor: project.coSupervisor
              ? { id: String(project.coSupervisor._id), name: `${project.coSupervisor.firstName} ${project.coSupervisor.lastName}`, email: project.coSupervisor.email }
              : null,
            hod: project.hod
              ? { id: String(project.hod._id), name: `${project.hod.firstName} ${project.hod.lastName}`, email: project.hod.email }
              : null,
            course: project.course
              ? { id: String(project.course._id), code: project.course.code, name: project.course.name }
              : null,
            externalExaminer: project.externalExaminer
              ? { id: String(project.externalExaminer._id), name: `${project.externalExaminer.firstName} ${project.externalExaminer.lastName}`, email: project.externalExaminer.email }
              : null,
          },
          milestones: milestones.map((m) => ({
            ...m,
            id: String(m._id),
            project: String(m.project),
            supervisorReviewedBy: m.supervisorReviewedBy
              ? { id: String(m.supervisorReviewedBy._id), name: `${m.supervisorReviewedBy.firstName} ${m.supervisorReviewedBy.lastName}` }
              : null,
            hodReviewedBy: m.hodReviewedBy
              ? { id: String(m.hodReviewedBy._id), name: `${m.hodReviewedBy.firstName} ${m.hodReviewedBy.lastName}` }
              : null,
          })),
          meetings: meetings.map((m) => ({
            ...m,
            id: String(m._id),
            project: String(m.project),
            attendees: (m.attendees || []).map((a) => ({
              ...a,
              user: a.user ? { id: String(a.user._id), name: `${a.user.firstName} ${a.user.lastName}` } : null,
            })),
          })),
        });
      } catch (err) {
        console.error("Research project detail error:", err);
        res.status(500).json({ error: "Failed to load project." });
      }
    }
  );

  app.post(
    "/api/research/projects",
    requireAuth,
    requirePermission("research.manage"),
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

        const student = await Student.findById(studentId);
        if (!student) return res.status(404).json({ error: "Student not found." });

        const project = await ResearchProject.create({
          ...req.body,
          student: studentId,
          primarySupervisor: req.body.primarySupervisor || null,
          coSupervisor: req.body.coSupervisor || null,
          hod: req.body.hod || null,
          status: "PROPOSAL_DRAFT",
        });

        res.status(201).json({ success: true, project: { ...project.toObject(), id: String(project._id) } });
      } catch (err) {
        console.error("Create research project error:", err);
        res.status(500).json({ error: "Failed to create project." });
      }
    }
  );

  app.patch(
    "/api/research/projects/:id/submit-proposal",
    requireAuth,
    requirePermission("research.manage"),
    async (req, res) => {
      try {
        const project = await ResearchProject.findById(req.params.id);
        if (!project) return res.status(404).json({ error: "Project not found." });

        const roles = getUserRoles(req.user);
        const isStudent = roles.includes("student");
        if (isStudent) {
          const student = await Student.findOne({ user: req.user._id || req.user.id });
          if (!student || String(project.student) !== String(student._id)) {
            return res.status(403).json({ error: "Access denied." });
          }
        }

        if (!["PROPOSAL_DRAFT", "PROPOSAL_REVISION_REQUIRED"].includes(project.status)) {
          return res.status(409).json({ error: "Proposal cannot be submitted in current state." });
        }

        project.status = "PROPOSAL_SUBMITTED";
        project.proposalSubmittedAt = new Date();
        await project.save();

        res.json({ success: true, project });
      } catch (err) {
        res.status(500).json({ error: "Failed to submit proposal." });
      }
    }
  );

  app.patch(
    "/api/research/projects/:id/review-proposal",
    requireAuth,
    requirePermission("research.manage"),
    async (req, res) => {
      try {
        const project = await ResearchProject.findById(req.params.id);
        if (!project) return res.status(404).json({ error: "Project not found." });

        const { status, feedback } = req.body || {};
        if (!["PROPOSAL_UNDER_REVIEW", "PROPOSAL_REVISION_REQUIRED", "PROPOSAL_APPROVED", "PROPOSAL_REJECTED"].includes(status)) {
          return res.status(400).json({ error: "Invalid status." });
        }

        project.status = status;
        if (feedback) project.reviewFeedback = String(feedback).trim().slice(0, 4000);
        if (status === "PROPOSAL_APPROVED") {
          project.proposalApprovedAt = new Date();
          project.proposalApprovedBy = req.user._id || req.user.id;
        }
        await project.save();

        res.json({ success: true, project });
      } catch (err) {
        res.status(500).json({ error: "Failed to review proposal." });
      }
    }
  );

  app.post(
    "/api/research/projects/:id/milestones",
    requireAuth,
    requirePermission("research.manage"),
    async (req, res) => {
      try {
        const project = await ResearchProject.findById(req.params.id);
        if (!project) return res.status(404).json({ error: "Project not found." });

        const maxOrder = await ResearchMilestone.findOne({ project: project._id }).sort({ order: -1 }).select("order").lean();
        const nextOrder = (maxOrder?.order || 0) + 1;

        const milestone = await ResearchMilestone.create({
          ...req.body,
          project: project._id,
          order: nextOrder,
          status: "NOT_STARTED",
        });

        if (project.status === "PROPOSAL_APPROVED" && project.status !== "IN_PROGRESS") {
          project.status = "IN_PROGRESS";
          project.startedAt = new Date();
          await project.save();
        }

        res.status(201).json({ success: true, milestone: { ...milestone.toObject(), id: String(milestone._id) } });
      } catch (err) {
        res.status(500).json({ error: "Failed to create milestone." });
      }
    }
  );

  app.patch(
    "/api/research/milestones/:id",
    requireAuth,
    requirePermission("research.manage"),
    async (req, res) => {
      try {
        const milestone = await ResearchMilestone.findById(req.params.id);
        if (!milestone) return res.status(404).json({ error: "Milestone not found." });

        const updates = req.body || {};
        const allowedFields = [
          "title",
          "description",
          "plannedStartDate",
          "plannedEndDate",
          "actualStartDate",
          "actualEndDate",
          "status",
          "deliverables",
          "supervisorFeedback",
          "hodFeedback",
        ];
        for (const field of allowedFields) {
          if (updates[field] !== undefined) {
            if (field === "plannedStartDate" || field === "plannedEndDate" || field === "actualStartDate" || field === "actualEndDate") {
              milestone[field] = updates[field] ? new Date(updates[field]) : null;
            } else if (field === "deliverables") {
              milestone.deliverables = updates[field];
            } else {
              milestone[field] = updates[field];
            }
          }
        }

        if (updates.status === "SUBMITTED") {
          milestone.supervisorReviewedBy = req.user._id || req.user.id;
          milestone.supervisorReviewedAt = new Date();
        }
        if (updates.status === "APPROVED") {
          milestone.hodReviewedBy = req.user._id || req.user.id;
          milestone.hodReviewedAt = new Date();
        }

        await milestone.save();

        const allMilestones = await ResearchMilestone.find({ project: milestone.project });
        const allApproved = allMilestones.every((m) => m.status === "APPROVED" || m.status === "COMPLETED");
        if (allApproved && allMilestones.length > 0) {
          const project = await ResearchProject.findById(milestone.project);
          if (project && project.status === "IN_PROGRESS") {
            project.status = "MILESTONE_REVIEW";
            await project.save();
          }
        }

        res.json({ success: true, milestone });
      } catch (err) {
        res.status(500).json({ error: "Failed to update milestone." });
      }
    }
  );

  app.post(
    "/api/research/projects/:id/meetings",
    requireAuth,
    requirePermission("research.manage"),
    async (req, res) => {
      try {
        const project = await ResearchProject.findById(req.params.id);
        if (!project) return res.status(404).json({ error: "Project not found." });

        const meeting = await ResearchMeeting.create({
          ...req.body,
          project: project._id,
          attendees: (req.body.attendees || []).map((a) => ({
            ...a,
            attended: false,
          })),
          status: "SCHEDULED",
        });

        res.status(201).json({ success: true, meeting: { ...meeting.toObject(), id: String(meeting._id) } });
      } catch (err) {
        res.status(500).json({ error: "Failed to create meeting." });
      }
    }
  );

  app.patch(
    "/api/research/meetings/:id",
    requireAuth,
    requirePermission("research.manage"),
    async (req, res) => {
      try {
        const meeting = await ResearchMeeting.findById(req.params.id);
        if (!meeting) return res.status(404).json({ error: "Meeting not found." });

        const updates = req.body || {};
        const allowedFields = ["scheduledAt", "durationMinutes", "meetingType", "title", "agenda", "notes", "actionItems", "status", "recordingUrl"];
        for (const field of allowedFields) {
          if (updates[field] !== undefined) {
            if (field === "scheduledAt") meeting[field] = new Date(updates[field]);
            else meeting[field] = updates[field];
          }
        }
        if (updates.attendees) {
          meeting.attendees = updates.attendees;
        }
        await meeting.save();

        res.json({ success: true, meeting });
      } catch (err) {
        res.status(500).json({ error: "Failed to update meeting." });
      }
    }
  );

  app.post(
    "/api/research/projects/:id/submit-final-report",
    requireAuth,
    requirePermission("research.manage"),
    async (req, res) => {
      try {
        const project = await ResearchProject.findById(req.params.id);
        if (!project) return res.status(404).json({ error: "Project not found." });

        const roles = getUserRoles(req.user);
        const isStudent = roles.includes("student");
        if (isStudent) {
          const student = await Student.findOne({ user: req.user._id || req.user.id });
          if (!student || String(project.student) !== String(student._id)) {
            return res.status(403).json({ error: "Access denied." });
          }
        }

        if (!["IN_PROGRESS", "MILESTONE_REVIEW", "FINAL_REPORT_DRAFT", "FINAL_REPORT_REVISION_REQUIRED"].includes(project.status)) {
          return res.status(409).json({ error: "Final report cannot be submitted in current state." });
        }

        project.status = "FINAL_REPORT_SUBMITTED";
        project.finalReportSubmittedAt = new Date();
        await project.save();

        res.json({ success: true, project });
      } catch (err) {
        res.status(500).json({ error: "Failed to submit final report." });
      }
    }
  );

  app.patch(
    "/api/research/projects/:id/review-final-report",
    requireAuth,
    requirePermission("research.manage"),
    async (req, res) => {
      try {
        const project = await ResearchProject.findById(req.params.id);
        if (!project) return res.status(404).json({ error: "Project not found." });

        const { status, feedback, externalExaminerId, defenseDate } = req.body || {};
        if (!["FINAL_REPORT_UNDER_REVIEW", "FINAL_REPORT_REVISION_REQUIRED", "COMPLETED"].includes(status)) {
          return res.status(400).json({ error: "Invalid status." });
        }

        project.status = status;
        if (feedback) project.reviewFeedback = String(feedback).trim().slice(0, 4000);
        if (externalExaminerId) project.externalExaminer = externalExaminerId;
        if (defenseDate) project.defenseDate = new Date(defenseDate);

        if (status === "COMPLETED") {
          project.finalReportApprovedAt = new Date();
          project.actualCompletionDate = new Date();
        }
        await project.save();

        res.json({ success: true, project });
      } catch (err) {
        res.status(500).json({ error: "Failed to review final report." });
      }
    }
  );

  app.patch(
    "/api/research/projects/:id/defense-result",
    requireAuth,
    requirePermission("research.manage"),
    async (req, res) => {
      try {
        const project = await ResearchProject.findById(req.params.id);
        if (!project) return res.status(404).json({ error: "Project not found." });

        const { defenseResult, finalGrade, finalGradePoints } = req.body || {};
        if (!["PASSED", "PASSED_WITH_REVISIONS", "REVISIONS_REQUIRED", "FAILED"].includes(defenseResult)) {
          return res.status(400).json({ error: "Invalid defense result." });
        }

        project.defenseResult = defenseResult;
        if (finalGrade) project.finalGrade = finalGrade;
        if (finalGradePoints !== undefined) project.finalGradePoints = finalGradePoints;

        if (["PASSED", "PASSED_WITH_REVISIONS"].includes(defenseResult)) {
          project.status = "COMPLETED";
          project.actualCompletionDate = new Date();
        }
        await project.save();

        res.json({ success: true, project });
      } catch (err) {
        res.status(500).json({ error: "Failed to record defense result." });
      }
    }
  );

  app.get(
    "/api/research/summary",
    requireAuth,
    requirePermission("research.view"),
    async (req, res) => {
      try {
        const roles = getUserRoles(req.user);
        const isStudent = roles.includes("student");

        let match = {};
        if (isStudent) {
          const student = await Student.findOne({ user: req.user._id || req.user.id });
          if (!student) return res.status(404).json({ error: "Student profile not found." });
          match.student = student._id;
        }
        if (req.query.academicYear) match.academicYear = req.query.academicYear;
        if (req.query.semester) match.semester = Number(req.query.semester);

        const [total, byStatus] = await Promise.all([
          ResearchProject.countDocuments(match),
          ResearchProject.aggregate([{ $match: match }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
        ]);

        res.json({
          totalProjects: total,
          byStatus: byStatus.reduce((acc, item) => ({ ...acc, [item._id]: item.count }), {}),
        });
      } catch (err) {
        console.error("Research summary error:", err);
        res.status(500).json({ error: "Failed to load research summary." });
      }
    }
  );
}