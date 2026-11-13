import { requireAuth, requirePermission } from "../middleware/auth.js";
import { getUserRoles } from "../db.js";
import mongoose from "mongoose";
import { Student, User, GraduationApplication, Notification, Course, Grade } from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const GRADUATION_STATUSES = [
  "ELIGIBILITY_CHECK",
  "APPLICATION_SUBMITTED",
  "ACADEMIC_CLEARANCE_PENDING",
  "ACADEMIC_CLEARANCE_APPROVED",
  "ACADEMIC_CLEARANCE_REJECTED",
  "FINANCE_CLEARANCE_PENDING",
  "FINANCE_CLEARANCE_APPROVED",
  "FINANCE_CLEARANCE_REJECTED",
  "LIBRARY_CLEARANCE_PENDING",
  "LIBRARY_CLEARANCE_APPROVED",
  "LIBRARY_CLEARANCE_REJECTED",
  "HOSTEL_CLEARANCE_PENDING",
  "HOSTEL_CLEARANCE_APPROVED",
  "HOSTEL_CLEARANCE_REJECTED",
  "LAB_CLEARANCE_PENDING",
  "LAB_CLEARANCE_APPROVED",
  "LAB_CLEARANCE_REJECTED",
  "ALL_CLEARANCES_APPROVED",
  "GRADUATION_APPROVED",
  "CERTIFICATE_GENERATED",
  "CONVOCATION_REGISTERED",
  "CONVOCATION_ATTENDED",
  "COMPLETED",
  "REJECTED",
  "WITHDRAWN",
];

const CLEARANCE_TYPES = [
  "ACADEMIC",
  "FINANCE",
  "LIBRARY",
  "HOSTEL",
  "LAB",
];

const CLEARANCE_STATUSES = ["PENDING", "APPROVED", "REJECTED"];

export function registerGraduationRoutes(app) {
  app.get(
    "/api/graduation/applications",
    requireAuth,
    requirePermission("graduation.view"),
    async (req, res) => {
      try {
        const roles = getUserRoles(req.user);
        const isStudent = roles.includes("student");
        const isRegistrar = roles.includes("registrar");
        const isDean = roles.includes("dean");
        const isSuperAdmin = roles.includes("super_admin");
        const isExamOfficer = roles.includes("exam_officer");
        const isFinanceOfficer = roles.includes("finance_officer");

        const filter = {};
        if (isStudent) {
          const student = await Student.findOne({ user: req.user._id || req.user.id });
          if (!student) return res.status(404).json({ error: "Student profile not found." });
          filter.student = student._id;
        } else if (req.query.student) {
          filter.student = req.query.student;
        }

        if (req.query.status) filter.status = req.query.status;
        if (req.query.academicYear) filter.academicYear = req.query.academicYear;
        if (req.query.graduationCycle) filter.graduationCycle = req.query.graduationCycle;
        if (req.query.program) filter.program = req.query.program;

        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
        const skip = (page - 1) * limit;

        const [applications, total] = await Promise.all([
          GraduationApplication.find(filter)
            .populate("student", "studentId firstName lastName program semester")
            .populate("initiatedBy", "firstName lastName")
            .populate("reviewedBy", "firstName lastName")
            .populate("clearances.approvedBy", "firstName lastName")
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
          GraduationApplication.countDocuments(filter),
        ]);

        res.json({
          applications: applications.map((app) => ({
            ...app,
            id: String(app._id),
            student: app.student
              ? { id: String(app.student._id), studentId: app.student.studentId, fullName: `${app.student.firstName} ${app.student.lastName}`, program: app.student.program, semester: app.student.semester }
              : null,
            initiatedBy: app.initiatedBy
              ? { id: String(app.initiatedBy._id), name: `${app.initiatedBy.firstName} ${app.initiatedBy.lastName}` }
              : null,
            reviewedBy: app.reviewedBy
              ? { id: String(app.reviewedBy._id), name: `${app.reviewedBy.firstName} ${app.reviewedBy.lastName}` }
              : null,
            clearances: (app.clearances || []).map((c) => ({
              ...c,
              approvedBy: c.approvedBy
                ? { id: String(c.approvedBy._id), name: `${c.approvedBy.firstName} ${c.approvedBy.lastName}` }
                : null,
            })),
          })),
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
      } catch (err) {
        console.error("Graduation applications error:", err);
        res.status(500).json({ error: "Failed to load graduation applications." });
      }
    }
  );

  app.get(
    "/api/graduation/applications/:id",
    requireAuth,
    requirePermission("graduation.view"),
    async (req, res) => {
      try {
        const application = await GraduationApplication.findById(req.params.id)
          .populate("student", "studentId firstName lastName program semester user")
          .populate("initiatedBy", "firstName lastName email")
          .populate("reviewedBy", "firstName lastName email")
          .populate("clearances.approvedBy", "firstName lastName")
          .populate("certificate.issuedBy", "firstName lastName")
          .populate("convocation.verifiedBy", "firstName lastName")
          .lean();

        if (!application) return res.status(404).json({ error: "Graduation application not found." });

        const roles = getUserRoles(req.user);
        const isStudent = roles.includes("student");
        if (isStudent) {
          const student = await Student.findOne({ user: req.user._id || req.user.id });
          if (!student || String(application.student._id) !== String(student._id)) {
            return res.status(403).json({ error: "Access denied." });
          }
        }

        res.json({
          application: {
            ...application,
            id: String(application._id),
            student: application.student
              ? { id: String(application.student._id), studentId: application.student.studentId, fullName: `${application.student.firstName} ${application.student.lastName}`, program: application.student.program, semester: application.student.semester }
              : null,
            initiatedBy: application.initiatedBy
              ? { id: String(application.initiatedBy._id), name: `${application.initiatedBy.firstName} ${application.initiatedBy.lastName}`, email: application.initiatedBy.email }
              : null,
            reviewedBy: application.reviewedBy
              ? { id: String(application.reviewedBy._id), name: `${application.reviewedBy.firstName} ${application.reviewedBy.lastName}`, email: application.reviewedBy.email }
              : null,
            clearances: (application.clearances || []).map((c) => ({
              ...c,
              approvedBy: c.approvedBy
                ? { id: String(c.approvedBy._id), name: `${c.approvedBy.firstName} ${c.approvedBy.lastName}` }
                : null,
            })),
            certificate: application.certificate
              ? {
                  ...application.certificate,
                  issuedBy: application.certificate.issuedBy
                    ? { id: String(application.certificate.issuedBy._id), name: `${application.certificate.issuedBy.firstName} ${application.certificate.issuedBy.lastName}` }
                    : null,
                }
              : null,
            convocation: application.convocation
              ? {
                  ...application.convocation,
                  verifiedBy: application.convocation.verifiedBy
                    ? { id: String(application.convocation.verifiedBy._id), name: `${application.convocation.verifiedBy.firstName} ${application.convocation.verifiedBy.lastName}` }
                    : null,
                }
              : null,
          },
        });
      } catch (err) {
        console.error("Graduation application detail error:", err);
        res.status(500).json({ error: "Failed to load application." });
      }
    }
  );

  app.post(
    "/api/graduation/check-eligibility",
    requireAuth,
    requirePermission("graduation.view"),
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

        const student = await Student.findById(studentId).populate("program");
        if (!student) return res.status(404).json({ error: "Student not found." });

        const existingApp = await GraduationApplication.findOne({
          student: studentId,
          status: { $nin: ["REJECTED", "WITHDRAWN", "COMPLETED"] },
        });
        if (existingApp) {
          return res.status(409).json({ error: "Active graduation application already exists.", applicationId: existingApp._id });
        }

        const completedCourses = await Grade.aggregate([
          { $match: { student: student._id, status: "PUBLISHED" } },
          { $group: { _id: "$course", creditsEarned: { $sum: "$credits" }, grade: { $first: "$grade" } } },
        ]);

        const totalCredits = completedCourses.reduce((sum, c) => sum + (c.creditsEarned || 0), 0);
        const requiredCredits = student.program?.requiredCredits || 120;
        const minCGPA = student.program?.minCGPA || 2.0;

        const grades = completedCourses.map((c) => c.grade).filter(Boolean);
        const gradePoints = { "A+": 4.0, "A": 4.0, "A-": 3.7, "B+": 3.3, "B": 3.0, "B-": 2.7, "C+": 2.3, "C": 2.0, "C-": 1.7, "D": 1.0, "F": 0.0 };
        const cgpa = grades.length > 0
          ? grades.reduce((sum, g) => sum + (gradePoints[g] || 0), 0) / grades.length
          : 0;

        const academicEligible = totalCredits >= requiredCredits && cgpa >= minCGPA;

        const pendingClearances = CLEARANCE_TYPES.map((type) => ({
          clearanceType: type,
          status: "PENDING",
          remarks: "",
          documents: [],
        }));

        res.json({
          eligible: academicEligible,
          student: {
            id: String(student._id),
            studentId: student.studentId,
            fullName: `${student.firstName} ${student.lastName}`,
            program: student.program?.name || student.program,
            semester: student.semester,
            academicYear: student.academicYear,
          },
          academicCheck: {
            totalCreditsEarned: totalCredits,
            requiredCredits,
            cgpa: Number(cgpa.toFixed(2)),
            minCGPARequired: minCGPA,
            creditsMet: totalCredits >= requiredCredits,
            cgpaMet: cgpa >= minCGPA,
          },
          pendingClearances,
          nextSteps: academicEligible
            ? ["Submit graduation application", "Complete clearance processes"]
            : ["Complete remaining credits", "Improve CGPA", "Consult academic advisor"],
        });
      } catch (err) {
        console.error("Eligibility check error:", err);
        res.status(500).json({ error: "Failed to check eligibility." });
      }
    }
  );

  app.post(
    "/api/graduation/applications",
    requireAuth,
    requirePermission("graduation.apply"),
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

        const existingApp = await GraduationApplication.findOne({
          student: studentId,
          status: { $nin: ["REJECTED", "WITHDRAWN", "COMPLETED"] },
        });
        if (existingApp) {
          return res.status(409).json({ error: "Active graduation application already exists." });
        }

        const count = await GraduationApplication.countDocuments();
        const applicationNumber = `GRAD-${new Date().getFullYear()}-${String(count + 1).padStart(6, "0")}`;

        const application = await GraduationApplication.create({
          applicationNumber,
          student: studentId,
          studentId: student.studentId,
          studentName: `${student.firstName} ${student.lastName}`,
          program: student.program,
          academicYear: student.academicYear,
          semester: student.semester,
          graduationCycle: req.body.graduationCycle || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
          initiatedBy: req.user._id || req.user.id,
          status: "APPLICATION_SUBMITTED",
          submittedAt: new Date(),
          clearances: CLEARANCE_TYPES.map((type) => ({
            clearanceType: type,
            status: "PENDING",
            remarks: "",
            documents: [],
          })),
        });

        const clearanceRoles = {
          ACADEMIC: ["exam_officer", "hod", "program_coordinator"],
          FINANCE: ["finance_officer"],
          LIBRARY: ["librarian"],
          HOSTEL: ["hostel_warden"],
          LAB: ["lab_incharge", "hod"],
        };

        const { createNotifications } = await import("../services/workflowEngine.js");
        for (const clearance of application.clearances) {
          const rolesForClearance = clearanceRoles[clearance.clearanceType] || [];
          const approvers = await User.find({
            roles: { $in: rolesForClearance },
            isActive: { $ne: false },
          }).select("_id").lean();

          if (approvers.length > 0) {
            await createNotifications(
              approvers.map((u) => ({ _id: u._id })),
              "Graduation Clearance Required",
              `${application.applicationNumber}: ${application.studentName} requires ${clearance.clearanceType.toLowerCase()} clearance.`,
              `graduation:${application._id}:clearance_${clearance.clearanceType.toLowerCase()}`,
              { actionUrl: `/graduation/applications/${application._id}`, relatedEntityType: "GraduationApplication", relatedEntityId: application._id }
            );
          }
        }

        res.status(201).json({ success: true, application: { ...application.toObject(), id: String(application._id) } });
      } catch (err) {
        console.error("Create graduation application error:", err);
        res.status(500).json({ error: "Failed to create application." });
      }
    }
  );

  app.patch(
    "/api/graduation/applications/:id/clearance",
    requireAuth,
    requirePermission("graduation.manage_clearance"),
    async (req, res) => {
      try {
        const application = await GraduationApplication.findById(req.params.id);
        if (!application) return res.status(404).json({ error: "Application not found." });

        const { clearanceType, status, remarks, documents } = req.body || {};
        if (!clearanceType || !CLEARANCE_TYPES.includes(clearanceType)) {
          return res.status(400).json({ error: "Valid clearance type required." });
        }
        if (!CLEARANCE_STATUSES.includes(status)) {
          return res.status(400).json({ error: "Invalid clearance status." });
        }

        const clearance = application.clearances.find((c) => c.clearanceType === clearanceType);
        if (!clearance) {
          return res.status(404).json({ error: "Clearance not found." });
        }
        if (clearance.status !== "PENDING") {
          return res.status(409).json({ error: "Clearance already processed." });
        }

        clearance.status = status;
        clearance.remarks = String(remarks || "").trim().slice(0, 1000);
        clearance.approvedBy = req.user._id || req.user.id;
        clearance.approvedAt = new Date();
        if (documents) clearance.documents = documents;

        await application.save();

        const allApproved = application.clearances.every((c) => c.status === "APPROVED");
        if (allApproved) {
          application.status = "ALL_CLEARANCES_APPROVED";
          await application.save();

          const { createNotifications } = await import("../services/workflowEngine.js");
          await createNotifications(
            [{ _id: application.student }],
            "All Clearances Approved",
            `All clearances for your graduation application ${application.applicationNumber} have been approved.`,
            `graduation:${application._id}:all_approved`,
            { actionUrl: `/graduation/applications/${application._id}`, relatedEntityType: "GraduationApplication", relatedEntityId: application._id }
          );
        }

        res.json({ success: true, application });
      } catch (err) {
        res.status(500).json({ error: "Failed to update clearance." });
      }
    }
  );

  app.patch(
    "/api/graduation/applications/:id/final-approval",
    requireAuth,
    requirePermission("graduation.approve"),
    async (req, res) => {
      try {
        const application = await GraduationApplication.findById(req.params.id);
        if (!application) return res.status(404).json({ error: "Application not found." });

        const { status, remarks } = req.body || {};
        if (!["GRADUATION_APPROVED", "REJECTED"].includes(status)) {
          return res.status(400).json({ error: "Invalid status." });
        }
        if (application.status !== "ALL_CLEARANCES_APPROVED") {
          return res.status(409).json({ error: "All clearances must be approved first." });
        }

        application.status = status;
        application.reviewedBy = req.user._id || req.user.id;
        application.reviewedAt = new Date();
        application.reviewRemarks = String(remarks || "").trim().slice(0, 2000);

        if (status === "GRADUATION_APPROVED") {
          application.approvedAt = new Date();
        }
        await application.save();

        const { createNotifications } = await import("../services/workflowEngine.js");
        await createNotifications(
          [{ _id: application.student }],
          status === "GRADUATION_APPROVED" ? "Graduation Approved" : "Graduation Application Rejected",
          `Your graduation application ${application.applicationNumber} has been ${status === "GRADUATION_APPROVED" ? "approved" : "rejected"}.`,
          `graduation:${application._id}:${status.toLowerCase()}`,
          { actionUrl: `/graduation/applications/${application._id}`, relatedEntityType: "GraduationApplication", relatedEntityId: application._id }
        );

        res.json({ success: true, application });
      } catch (err) {
        res.status(500).json({ error: "Failed to process final approval." });
      }
    }
  );

  app.patch(
    "/api/graduation/applications/:id/certificate",
    requireAuth,
    requirePermission("graduation.manage_certificate"),
    async (req, res) => {
      try {
        const application = await GraduationApplication.findById(req.params.id);
        if (!application) return res.status(404).json({ error: "Application not found." });

        if (application.status !== "GRADUATION_APPROVED") {
          return res.status(409).json({ error: "Graduation must be approved before generating certificate." });
        }

        const { certificateNumber, issuedAt, certificateUrl, qrCodeData } = req.body || {};
        if (!certificateNumber || !issuedAt) {
          return res.status(400).json({ error: "Certificate number and issue date required." });
        }

        application.certificate = {
          certificateNumber,
          issuedAt: new Date(issuedAt),
          issuedBy: req.user._id || req.user.id,
          certificateUrl: certificateUrl || "",
          qrCodeData: qrCodeData || `${process.env.FRONTEND_URL}/verify/certificate/${certificateNumber}`,
          isVerified: true,
        };
        application.status = "CERTIFICATE_GENERATED";
        await application.save();

        res.json({ success: true, application });
      } catch (err) {
        res.status(500).json({ error: "Failed to generate certificate." });
      }
    }
  );

  app.patch(
    "/api/graduation/applications/:id/convocation",
    requireAuth,
    requirePermission("graduation.manage_convocation"),
    async (req, res) => {
      try {
        const application = await GraduationApplication.findById(req.params.id);
        if (!application) return res.status(404).json({ error: "Application not found." });

        const { action, ...data } = req.body || {};

        if (action === "register") {
          if (!["CERTIFICATE_GENERATED", "CONVOCATION_REGISTERED"].includes(application.status)) {
            return res.status(409).json({ error: "Certificate must be generated before convocation registration." });
          }
          application.convocation = {
            registered: true,
            registeredAt: new Date(),
            ceremonyDate: data.ceremonyDate ? new Date(data.ceremonyDate) : null,
            venue: data.venue || "",
            guestCount: data.guestCount || 0,
            regaliaSize: data.regaliaSize || "",
            specialRequests: data.specialRequests || "",
            attended: false,
            verifiedBy: null,
            verifiedAt: null,
          };
          application.status = "CONVOCATION_REGISTERED";
        } else if (action === "attend") {
          if (application.status !== "CONVOCATION_REGISTERED") {
            return res.status(409).json({ error: "Must be registered for convocation first." });
          }
          application.convocation.attended = true;
          application.convocation.verifiedBy = req.user._id || req.user.id;
          application.convocation.verifiedAt = new Date();
          application.status = "CONVOCATION_ATTENDED";
        } else if (action === "complete") {
          if (!["CONVOCATION_ATTENDED", "CONVOCATION_REGISTERED"].includes(application.status)) {
            return res.status(409).json({ error: "Convocation must be attended or registered." });
          }
          application.status = "COMPLETED";
          application.completedAt = new Date();
        } else {
          return res.status(400).json({ error: "Invalid action. Use: register, attend, or complete" });
        }

        await application.save();

        res.json({ success: true, application });
      } catch (err) {
        res.status(500).json({ error: "Failed to process convocation." });
      }
    }
  );

  app.get(
    "/api/graduation/eligibility/:studentId",
    requireAuth,
    requirePermission("graduation.view"),
    async (req, res) => {
      try {
        const student = await Student.findById(req.params.studentId).populate("program");
        if (!student) return res.status(404).json({ error: "Student not found." });

        const roles = getUserRoles(req.user);
        const isStudent = roles.includes("student");
        if (isStudent) {
          const currentStudent = await Student.findOne({ user: req.user._id || req.user.id });
          if (!currentStudent || String(currentStudent._id) !== String(student._id)) {
            return res.status(403).json({ error: "Access denied." });
          }
        }

        const completedCourses = await Grade.aggregate([
          { $match: { student: student._id, status: "PUBLISHED" } },
          { $group: { _id: "$course", creditsEarned: { $sum: "$credits" }, grade: { $first: "$grade" } } },
        ]);

        const totalCredits = completedCourses.reduce((sum, c) => sum + (c.creditsEarned || 0), 0);
        const requiredCredits = student.program?.requiredCredits || 120;
        const minCGPA = student.program?.minCGPA || 2.0;

        const grades = completedCourses.map((c) => c.grade).filter(Boolean);
        const gradePoints = { "A+": 4.0, "A": 4.0, "A-": 3.7, "B+": 3.3, "B": 3.0, "B-": 2.7, "C+": 2.3, "C": 2.0, "C-": 1.7, "D": 1.0, "F": 0.0 };
        const cgpa = grades.length > 0
          ? grades.reduce((sum, g) => sum + (gradePoints[g] || 0), 0) / grades.length
          : 0;

        const application = await GraduationApplication.findOne({ student: student._id }).sort({ createdAt: -1 });

        res.json({
          student: {
            id: String(student._id),
            studentId: student.studentId,
            fullName: `${student.firstName} ${student.lastName}`,
            program: student.program?.name || student.program,
            semester: student.semester,
            academicYear: student.academicYear,
          },
          academicCheck: {
            totalCreditsEarned: totalCredits,
            requiredCredits,
            cgpa: Number(cgpa.toFixed(2)),
            minCGPARequired: minCGPA,
            creditsMet: totalCredits >= requiredCredits,
            cgpaMet: cgpa >= minCGPA,
            eligible: totalCredits >= requiredCredits && cgpa >= minCGPA,
          },
          existingApplication: application
            ? {
                id: String(application._id),
                applicationNumber: application.applicationNumber,
                status: application.status,
                submittedAt: application.submittedAt,
              }
            : null,
        });
      } catch (err) {
        console.error("Eligibility check error:", err);
        res.status(500).json({ error: "Failed to check eligibility." });
      }
    }
  );

  app.get(
    "/api/graduation/summary",
    requireAuth,
    requirePermission("graduation.view"),
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
        if (req.query.graduationCycle) match.graduationCycle = req.query.graduationCycle;

        const [total, byStatus] = await Promise.all([
          GraduationApplication.countDocuments(match),
          GraduationApplication.aggregate([{ $match: match }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
        ]);

        const clearanceStats = await GraduationApplication.aggregate([
          { $match: match },
          { $unwind: "$clearances" },
          { $group: { _id: { type: "$clearances.clearanceType", status: "$clearances.status" }, count: { $sum: 1 } } },
        ]);

        res.json({
          totalApplications: total,
          byStatus: byStatus.reduce((acc, item) => ({ ...acc, [item._id]: item.count }), {}),
          clearanceStats: clearanceStats.reduce((acc, item) => {
            const key = `${item._id.type}_${item._id.status}`;
            acc[key] = item.count;
            return acc;
          }, {}),
        });
      } catch (err) {
        console.error("Graduation summary error:", err);
        res.status(500).json({ error: "Failed to load graduation summary." });
      }
    }
  );
}