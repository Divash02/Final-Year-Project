import { requireAuth, requirePermission } from "../middleware/auth.js";
import { getUserRoles } from "../db.js";
import mongoose from "mongoose";
import {
  Student,
  User,
  InternshipCompany,
  InternshipSupervisor,
  InternshipApplication,
  InternshipProgressReport,
  InternshipEvaluation,
} from "../models/index.js";

export function registerInternshipRoutes(app) {
  app.get(
    "/api/internship/companies",
    requireAuth,
    requirePermission("internship.view"),
    async (req, res) => {
      try {
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
        const skip = (page - 1) * limit;

        const filter = {};
        if (req.query.search) {
          filter.$or = [
            { name: { $regex: req.query.search, $options: "i" } },
            { industry: { $regex: req.query.search, $options: "i" } },
            { city: { $regex: req.query.search, $options: "i" } },
          ];
        }
        if (req.query.isVerified !== undefined) filter.isVerified = req.query.isVerified === "true";

        const [companies, total] = await Promise.all([
          InternshipCompany.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
          InternshipCompany.countDocuments(filter),
        ]);

        res.json({
          companies: companies.map((c) => ({
            ...c,
            id: String(c._id),
            verifiedBy: c.verifiedBy
              ? { id: String(c.verifiedBy), name: "" }
              : null,
          })),
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
      } catch (err) {
        console.error("Internship companies error:", err);
        res.status(500).json({ error: "Failed to load internship companies." });
      }
    }
  );

  app.post(
    "/api/internship/companies",
    requireAuth,
    requirePermission("internship.manage"),
    async (req, res) => {
      try {
        const company = await InternshipCompany.create(req.body);
        res.status(201).json({ success: true, company: { ...company.toObject(), id: String(company._id) } });
      } catch (err) {
        console.error("Create internship company error:", err);
        res.status(500).json({ error: "Failed to create internship company." });
      }
    }
  );

  app.patch(
    "/api/internship/companies/:id/verify",
    requireAuth,
    requirePermission("internship.manage"),
    async (req, res) => {
      try {
        const company = await InternshipCompany.findByIdAndUpdate(
          req.params.id,
          { isVerified: true, verifiedBy: req.user._id || req.user.id, verifiedAt: new Date() },
          { new: true }
        );
        if (!company) return res.status(404).json({ error: "Company not found." });
        res.json({ success: true, company });
      } catch (err) {
        res.status(500).json({ error: "Failed to verify company." });
      }
    }
  );

  app.get(
    "/api/internship/supervisors",
    requireAuth,
    requirePermission("internship.view"),
    async (req, res) => {
      try {
        const filter = {};
        if (req.query.company) filter.company = req.query.company;

        const supervisors = await InternshipSupervisor.find(filter)
          .populate("company", "name")
          .sort({ createdAt: -1 })
          .lean();

        res.json({
          supervisors: supervisors.map((s) => ({
            ...s,
            id: String(s._id),
            company: s.company ? { id: String(s.company._id), name: s.company.name } : null,
          })),
        });
      } catch (err) {
        console.error("Internship supervisors error:", err);
        res.status(500).json({ error: "Failed to load supervisors." });
      }
    }
  );

  app.post(
    "/api/internship/supervisors",
    requireAuth,
    requirePermission("internship.manage"),
    async (req, res) => {
      try {
        const supervisor = await InternshipSupervisor.create(req.body);
        res.status(201).json({ success: true, supervisor: { ...supervisor.toObject(), id: String(supervisor._id) } });
      } catch (err) {
        res.status(500).json({ error: "Failed to create supervisor." });
      }
    }
  );

  app.get(
    "/api/internship/applications",
    requireAuth,
    requirePermission("internship.view"),
    async (req, res) => {
      try {
        const roles = getUserRoles(req.user);
        const isStudent = roles.includes("student");
        const isFaculty = roles.includes("faculty");
        const isCoordinator = roles.includes("hod") || roles.includes("program_coordinator") || roles.includes("registrar");

        const filter = {};
        if (isStudent) {
          const student = await Student.findOne({ user: req.user._id || req.user.id });
          if (!student) return res.status(404).json({ error: "Student profile not found." });
          filter.student = student._id;
        } else if (isFaculty && !isCoordinator) {
          filter.academicSupervisor = req.user._id || req.user.id;
        }

        if (req.query.status) filter.status = req.query.status;
        if (req.query.academicYear) filter.academicYear = req.query.academicYear;
        if (req.query.semester) filter.semester = Number(req.query.semester);

        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
        const skip = (page - 1) * limit;

        const [applications, total] = await Promise.all([
          InternshipApplication.find(filter)
            .populate("student", "studentId firstName lastName program semester department")
            .populate("academicSupervisor", "firstName lastName")
            .populate("coordinator", "firstName lastName")
            .populate("company", "name industry city")
            .populate("industrySupervisor", "firstName lastName email designation")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
          InternshipApplication.countDocuments(filter),
        ]);

        res.json({
          applications: applications.map((app) => ({
            ...app,
            id: String(app._id),
            student: app.student
              ? { id: String(app.student._id), studentId: app.student.studentId, fullName: `${app.student.firstName} ${app.student.lastName}`, program: app.student.program, semester: app.student.semester, department: app.student.department }
              : null,
            academicSupervisor: app.academicSupervisor
              ? { id: String(app.academicSupervisor._id), name: `${app.academicSupervisor.firstName} ${app.academicSupervisor.lastName}` }
              : null,
            coordinator: app.coordinator
              ? { id: String(app.coordinator._id), name: `${app.coordinator.firstName} ${app.coordinator.lastName}` }
              : null,
            company: app.company
              ? { id: String(app.company._id), name: app.company.name, industry: app.company.industry, city: app.company.city }
              : null,
            industrySupervisor: app.industrySupervisor
              ? { id: String(app.industrySupervisor._id), name: `${app.industrySupervisor.firstName} ${app.industrySupervisor.lastName}`, email: app.industrySupervisor.email, designation: app.industrySupervisor.designation }
              : null,
          })),
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
      } catch (err) {
        console.error("Internship applications error:", err);
        res.status(500).json({ error: "Failed to load internship applications." });
      }
    }
  );

  app.get(
    "/api/internship/applications/:id",
    requireAuth,
    requirePermission("internship.view"),
    async (req, res) => {
      try {
        const app = await InternshipApplication.findById(req.params.id)
          .populate("student", "studentId firstName lastName program semester department user")
          .populate("academicSupervisor", "firstName lastName email")
          .populate("coordinator", "firstName lastName email")
          .populate("company", "name industry address city country website contactPerson contactEmail contactPhone")
          .populate("industrySupervisor", "firstName lastName email phone designation department")
          .lean();

        if (!app) return res.status(404).json({ error: "Application not found." });

        const roles = getUserRoles(req.user);
        const isStudent = roles.includes("student");
        if (isStudent) {
          const student = await Student.findOne({ user: req.user._id || req.user.id });
          if (!student || String(app.student._id) !== String(student._id)) {
            return res.status(403).json({ error: "Access denied." });
          }
        }

        const progressReports = await InternshipProgressReport.find({ application: app._id })
          .populate("reviewedBy", "firstName lastName")
          .sort({ weekNumber: 1 })
          .lean();

        const evaluations = await InternshipEvaluation.find({ application: app._id })
          .populate("evaluatedBy", "firstName lastName")
          .sort({ createdAt: -1 })
          .lean();

        res.json({
          application: {
            ...app,
            id: String(app._id),
            student: app.student
              ? { id: String(app.student._id), studentId: app.student.studentId, fullName: `${app.student.firstName} ${app.student.lastName}`, program: app.student.program, semester: app.student.semester, department: app.student.department }
              : null,
            academicSupervisor: app.academicSupervisor
              ? { id: String(app.academicSupervisor._id), name: `${app.academicSupervisor.firstName} ${app.academicSupervisor.lastName}`, email: app.academicSupervisor.email }
              : null,
            coordinator: app.coordinator
              ? { id: String(app.coordinator._id), name: `${app.coordinator.firstName} ${app.coordinator.lastName}`, email: app.coordinator.email }
              : null,
            company: app.company
              ? { id: String(app.company._id), name: app.company.name, industry: app.company.industry, address: app.company.address, city: app.company.city, country: app.company.country, website: app.company.website, contactPerson: app.company.contactPerson, contactEmail: app.company.contactEmail, contactPhone: app.company.contactPhone }
              : null,
            industrySupervisor: app.industrySupervisor
              ? { id: String(app.industrySupervisor._id), name: `${app.industrySupervisor.firstName} ${app.industrySupervisor.lastName}`, email: app.industrySupervisor.email, phone: app.industrySupervisor.phone, designation: app.industrySupervisor.designation, department: app.industrySupervisor.department }
              : null,
          },
          progressReports: progressReports.map((r) => ({
            ...r,
            id: String(r._id),
            reviewedBy: r.reviewedBy
              ? { id: String(r.reviewedBy._id), name: `${r.reviewedBy.firstName} ${r.reviewedBy.lastName}` }
              : null,
          })),
          evaluations: evaluations.map((e) => ({
            ...e,
            id: String(e._id),
            evaluatedBy: e.evaluatedBy
              ? { id: String(e.evaluatedBy._id), name: `${e.evaluatedBy.firstName} ${e.evaluatedBy.lastName}` }
              : null,
          })),
        });
      } catch (err) {
        console.error("Internship application detail error:", err);
        res.status(500).json({ error: "Failed to load application." });
      }
    }
  );

  app.post(
    "/api/internship/applications",
    requireAuth,
    requirePermission("internship.manage"),
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

        const application = await InternshipApplication.create({
          ...req.body,
          student: studentId,
          status: "DRAFT",
        });

        res.status(201).json({ success: true, application: { ...application.toObject(), id: String(application._id) } });
      } catch (err) {
        console.error("Create internship application error:", err);
        res.status(500).json({ error: "Failed to create application." });
      }
    }
  );

  app.patch(
    "/api/internship/applications/:id/submit",
    requireAuth,
    requirePermission("internship.manage"),
    async (req, res) => {
      try {
        const app = await InternshipApplication.findById(req.params.id);
        if (!app) return res.status(404).json({ error: "Application not found." });

        const roles = getUserRoles(req.user);
        const isStudent = roles.includes("student");
        if (isStudent) {
          const student = await Student.findOne({ user: req.user._id || req.user.id });
          if (!student || String(app.student) !== String(student._id)) {
            return res.status(403).json({ error: "Access denied." });
          }
        }

        if (app.status !== "DRAFT") {
          return res.status(409).json({ error: "Only draft applications can be submitted." });
        }

        app.status = "SUBMITTED";
        app.submittedAt = new Date();
        await app.save();

        res.json({ success: true, application: app });
      } catch (err) {
        res.status(500).json({ error: "Failed to submit application." });
      }
    }
  );

  app.patch(
    "/api/internship/applications/:id/review",
    requireAuth,
    requirePermission("internship.manage"),
    async (req, res) => {
      try {
        const app = await InternshipApplication.findById(req.params.id);
        if (!app) return res.status(404).json({ error: "Application not found." });

        const { status, reviewNotes, rejectionReason, academicSupervisorId, coordinatorId } = req.body || {};
        if (!["UNDER_REVIEW", "APPROVED", "REJECTED"].includes(status)) {
          return res.status(400).json({ error: "Invalid status." });
        }

        app.status = status;
        app.reviewedBy = req.user._id || req.user.id;
        app.reviewedAt = new Date();
        if (reviewNotes) app.reviewNotes = String(reviewNotes).trim().slice(0, 1000);
        if (status === "REJECTED" && rejectionReason) app.rejectionReason = String(rejectionReason).trim().slice(0, 1000);
        if (academicSupervisorId) app.academicSupervisor = academicSupervisorId;
        if (coordinatorId) app.coordinator = coordinatorId;
        if (status === "APPROVED") app.status = "ACTIVE";

        await app.save();

        res.json({ success: true, application: app });
      } catch (err) {
        res.status(500).json({ error: "Failed to review application." });
      }
    }
  );

  app.post(
    "/api/internship/applications/:id/progress-reports",
    requireAuth,
    requirePermission("internship.manage"),
    async (req, res) => {
      try {
        const app = await InternshipApplication.findById(req.params.id);
        if (!app) return res.status(404).json({ error: "Application not found." });

        const roles = getUserRoles(req.user);
        const isStudent = roles.includes("student");
        if (isStudent) {
          const student = await Student.findOne({ user: req.user._id || req.user.id });
          if (!student || String(app.student) !== String(student._id)) {
            return res.status(403).json({ error: "Access denied." });
          }
        }

        const existing = await InternshipProgressReport.findOne({ application: app._id, weekNumber: req.body.weekNumber });
        if (existing) return res.status(409).json({ error: "Progress report for this week already exists." });

        const report = await InternshipProgressReport.create({
          ...req.body,
          application: app._id,
          student: app.student,
          status: "SUBMITTED",
        });

        res.status(201).json({ success: true, report: { ...report.toObject(), id: String(report._id) } });
      } catch (err) {
        console.error("Create progress report error:", err);
        res.status(500).json({ error: "Failed to create progress report." });
      }
    }
  );

  app.patch(
    "/api/internship/progress-reports/:id/review",
    requireAuth,
    requirePermission("internship.manage"),
    async (req, res) => {
      try {
        const report = await InternshipProgressReport.findById(req.params.id);
        if (!report) return res.status(404).json({ error: "Progress report not found." });

        const { status, supervisorFeedback, academicSupervisorFeedback } = req.body || {};
        if (!["REVIEWED", "NEEDS_REVISION"].includes(status)) {
          return res.status(400).json({ error: "Invalid status." });
        }

        report.status = status;
        report.reviewedBy = req.user._id || req.user.id;
        report.reviewedAt = new Date();
        if (supervisorFeedback) report.supervisorFeedback = String(supervisorFeedback).trim().slice(0, 2000);
        if (academicSupervisorFeedback) report.academicSupervisorFeedback = String(academicSupervisorFeedback).trim().slice(0, 2000);
        await report.save();

        res.json({ success: true, report });
      } catch (err) {
        res.status(500).json({ error: "Failed to review progress report." });
      }
    }
  );

  app.post(
    "/api/internship/applications/:id/evaluations",
    requireAuth,
    requirePermission("internship.manage"),
    async (req, res) => {
      try {
        const app = await InternshipApplication.findById(req.params.id);
        if (!app) return res.status(404).json({ error: "Application not found." });

        const evaluation = await InternshipEvaluation.create({
          ...req.body,
          application: app._id,
          student: app.student,
          evaluatedBy: req.user._id || req.user.id,
        });

        res.status(201).json({ success: true, evaluation: { ...evaluation.toObject(), id: String(evaluation._id) } });
      } catch (err) {
        res.status(500).json({ error: "Failed to create evaluation." });
      }
    }
  );

  app.get(
    "/api/internship/summary",
    requireAuth,
    requirePermission("internship.view"),
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

        const [total, byStatus, activeCount] = await Promise.all([
          InternshipApplication.countDocuments(match),
          InternshipApplication.aggregate([{ $match: match }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
          InternshipApplication.countDocuments({ ...match, status: "ACTIVE" }),
        ]);

        res.json({
          totalApplications: total,
          byStatus: byStatus.reduce((acc, item) => ({ ...acc, [item._id]: item.count }), {}),
          activeCount,
        });
      } catch (err) {
        console.error("Internship summary error:", err);
        res.status(500).json({ error: "Failed to load internship summary." });
      }
    }
  );
}