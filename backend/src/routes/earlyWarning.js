import { requireAuth, requirePermission } from "../middleware/auth.js";
import { getUserRoles } from "../db.js";
import { AcademicRiskIndicator, AcademicIntervention, Student, User } from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export function registerEarlyWarningRoutes(app) {
  app.get(
    "/api/early-warning/indicators",
    requireAuth,
    requirePermission("earlyWarning.view"),
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
          filter.$or = [
            { "recommendedInterventions.assignedTo": req.user._id || req.user.id },
            { status: "ACTIVE" },
          ];
        }

        if (req.query.department) filter.department = req.query.department;
        if (req.query.program) filter.program = req.query.program;
        if (req.query.semester) filter.semester = Number(req.query.semester);
        if (req.query.status) filter.status = req.query.status;
        if (req.query.priority) filter.priority = req.query.priority;

        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
        const skip = (page - 1) * limit;

        const [indicators, total] = await Promise.all([
          AcademicRiskIndicator.find(filter)
            .populate("student", "studentId firstName lastName program semester department")
            .populate("reviewedBy", "firstName lastName")
            .populate("escalatedTo", "firstName lastName")
            .populate("recommendedInterventions.assignedTo", "firstName lastName")
            .sort({ priority: -1, riskScore: -1, lastCalculatedAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
          AcademicRiskIndicator.countDocuments(filter),
        ]);

        res.json({
          indicators: indicators.map((ind) => ({
            ...ind,
            id: String(ind._id),
            student: ind.student
              ? {
                  id: String(ind.student._id),
                  studentId: ind.student.studentId,
                  fullName: `${ind.student.firstName} ${ind.student.lastName}`,
                  program: ind.student.program,
                  semester: ind.student.semester,
                  department: ind.student.department,
                }
              : null,
            reviewedBy: ind.reviewedBy
              ? { id: String(ind.reviewedBy._id), name: `${ind.reviewedBy.firstName} ${ind.reviewedBy.lastName}` }
              : null,
            escalatedTo: ind.escalatedTo
              ? { id: String(ind.escalatedTo._id), name: `${ind.escalatedTo.firstName} ${ind.escalatedTo.lastName}` }
              : null,
            recommendedInterventions: (ind.recommendedInterventions || []).map((ri) => ({
              ...ri,
              assignedTo: ri.assignedTo
                ? { id: String(ri.assignedTo._id), name: `${ri.assignedTo.firstName} ${ri.assignedTo.lastName}` }
                : null,
            })),
          })),
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
      } catch (err) {
        console.error("Early warning indicators error:", err);
        res.status(500).json({ error: "Failed to load early warning indicators." });
      }
    }
  );

  app.get(
    "/api/early-warning/indicators/:id",
    requireAuth,
    requirePermission("earlyWarning.view"),
    async (req, res) => {
      try {
        const indicator = await AcademicRiskIndicator.findById(req.params.id)
          .populate("student", "studentId firstName lastName program semester department user")
          .populate("reviewedBy", "firstName lastName")
          .populate("escalatedTo", "firstName lastName")
          .populate("recommendedInterventions.assignedTo", "firstName lastName")
          .lean();

        if (!indicator) return res.status(404).json({ error: "Risk indicator not found." });

        const roles = getUserRoles(req.user);
        const isStudent = roles.includes("student");
        if (isStudent) {
          const student = await Student.findOne({ user: req.user._id || req.user.id });
          if (!student || String(indicator.student._id) !== String(student._id)) {
            return res.status(403).json({ error: "Access denied." });
          }
        }

        const interventions = await AcademicIntervention.find({ riskIndicator: indicator._id })
          .populate("initiatedBy", "firstName lastName")
          .sort({ createdAt: -1 })
          .lean();

        res.json({
          indicator: {
            ...indicator,
            id: String(indicator._id),
            student: indicator.student
              ? {
                  id: String(indicator.student._id),
                  studentId: indicator.student.studentId,
                  fullName: `${indicator.student.firstName} ${indicator.student.lastName}`,
                  program: indicator.student.program,
                  semester: indicator.student.semester,
                  department: indicator.student.department,
                }
              : null,
            reviewedBy: indicator.reviewedBy
              ? { id: String(indicator.reviewedBy._id), name: `${indicator.reviewedBy.firstName} ${indicator.reviewedBy.lastName}` }
              : null,
            escalatedTo: indicator.escalatedTo
              ? { id: String(indicator.escalatedTo._id), name: `${indicator.escalatedTo.firstName} ${indicator.escalatedTo.lastName}` }
              : null,
            recommendedInterventions: (indicator.recommendedInterventions || []).map((ri) => ({
              ...ri,
              assignedTo: ri.assignedTo
                ? { id: String(ri.assignedTo._id), name: `${ri.assignedTo.firstName} ${ri.assignedTo.lastName}` }
                : null,
            })),
          },
          interventions: interventions.map((int) => ({
            ...int,
            id: String(int._id),
            initiatedBy: int.initiatedBy
              ? { id: String(int.initiatedBy._id), name: `${int.initiatedBy.firstName} ${int.initiatedBy.lastName}` }
              : null,
          })),
        });
      } catch (err) {
        console.error("Early warning indicator detail error:", err);
        res.status(500).json({ error: "Failed to load risk indicator." });
      }
    }
  );

app.post(
    "/api/early-warning/indicators",
    requireAuth,
    requirePermission("earlyWarning.manage"),
    async (req, res) => {
      try {
        const indicator = await AcademicRiskIndicator.findById(req.params.id);
        if (!indicator) return res.status(404).json({ error: "Risk indicator not found." });

        const { status, note, escalatedTo } = req.body || {};
        if (status) indicator.status = status;
        if (note != null) indicator.reviewNote = String(note).trim().slice(0, 1000);
        indicator.reviewedBy = req.user._id || req.user.id;
        indicator.reviewedAt = new Date();
        if (escalatedTo && status === "ESCALATED") {
          indicator.escalatedTo = escalatedTo;
          indicator.escalatedAt = new Date();
        }
        await indicator.save();

        res.json({ success: true, indicator });
      } catch (err) {
        console.error("Review risk indicator error:", err);
        res.status(500).json({ error: "Failed to review risk indicator." });
      }
    }
  );

app.post(
    "/api/early-warning/indicators/:id/interventions",
    requireAuth,
    requirePermission("earlyWarning.manage"),
    async (req, res) => {
      try {
        const {
          studentId,
          riskIndicatorId,
          interventionType,
          title,
          description,
          priority = "MODERATE",
          scheduledAt,
          relatedCourseId,
        } = req.body || {};

        if (!studentId || !interventionType || !title) {
          return res.status(400).json({ error: "Student, intervention type, and title are required." });
        }

        const student = await Student.findById(studentId);
        if (!student) return res.status(404).json({ error: "Student not found." });

        const intervention = await AcademicIntervention.create({
          student: studentId,
          riskIndicator: riskIndicatorId || null,
          initiatedBy: req.user._id || req.user.id,
          interventionType,
          title: String(title).trim(),
          description: String(description || "").trim(),
          priority,
          scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
          relatedCourse: relatedCourseId || null,
          status: "PLANNED",
        });

        if (riskIndicatorId) {
          await AcademicRiskIndicator.findByIdAndUpdate(riskIndicatorId, {
            $push: {
              recommendedInterventions: {
                intervention: title,
                priority,
                assignedTo: req.user._id || req.user.id,
                status: "IN_PROGRESS",
              },
            },
          });
        }

        res.status(201).json({ success: true, intervention });
      } catch (err) {
        console.error("Create intervention error:", err);
        res.status(500).json({ error: "Failed to create intervention." });
      }
    }
  );

  app.patch(
    "/api/early-warning/interventions/:id",
    requireAuth,
    requirePermission("earlyWarning.manage"),
    async (req, res) => {
      try {
        const intervention = await AcademicIntervention.findById(req.params.id);
        if (!intervention) return res.status(404).json({ error: "Intervention not found." });

        const updates = req.body || {};
        const allowedFields = [
          "status",
          "priority",
          "title",
          "description",
          "scheduledAt",
          "startedAt",
          "completedAt",
          "outcome",
          "outcomeNotes",
          "followUpRequired",
          "followUpDate",
        ];
        for (const field of allowedFields) {
          if (updates[field] !== undefined) {
            if (field === "scheduledAt" || field === "startedAt" || field === "completedAt" || field === "followUpDate") {
              intervention[field] = updates[field] ? new Date(updates[field]) : null;
            } else {
              intervention[field] = updates[field];
            }
          }
        }
        await intervention.save();

        if (intervention.riskIndicator && intervention.status === "COMPLETED") {
          await AcademicRiskIndicator.findByIdAndUpdate(intervention.riskIndicator, {
            $set: { "recommendedInterventions.$[elem].status": "COMPLETED", "recommendedInterventions.$[elem].completedAt": new Date() },
          }, { arrayFilters: [{ "elem.intervention": intervention.title }] });
        }

        res.json({ success: true, intervention });
      } catch (err) {
        console.error("Update intervention error:", err);
        res.status(500).json({ error: "Failed to update intervention." });
      }
    }
  );

app.get(
    "/api/early-warning/interventions/:id",
    requireAuth,
    requirePermission("earlyWarning.view"),
    async (req, res) => {
      try {
        const roles = getUserRoles(req.user);
        const isStudent = roles.includes("student");
        const isFaculty = roles.includes("faculty");

        const filter = {};
        if (isStudent) {
          const student = await Student.findOne({ user: req.user._id || req.user.id });
          if (!student) return res.status(404).json({ error: "Student profile not found." });
          filter.student = student._id;
        } else if (isFaculty && !roles.includes("hod") && !roles.includes("program_coordinator")) {
          filter.initiatedBy = req.user._id || req.user.id;
        }

        if (req.query.student) filter.student = req.query.student;
        if (req.query.status) filter.status = req.query.status;
        if (req.query.interventionType) filter.interventionType = req.query.interventionType;

        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
        const skip = (page - 1) * limit;

        const [interventions, total] = await Promise.all([
          AcademicIntervention.find(filter)
            .populate("student", "studentId firstName lastName program semester")
            .populate("initiatedBy", "firstName lastName")
            .populate("riskIndicator", "riskScore priority")
            .populate("relatedCourse", "code name")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
          AcademicIntervention.countDocuments(filter),
        ]);

        res.json({
          interventions: interventions.map((int) => ({
            ...int,
            id: String(int._id),
            student: int.student
              ? { id: String(int.student._id), studentId: int.student.studentId, fullName: `${int.student.firstName} ${int.student.lastName}`, program: int.student.program, semester: int.student.semester }
              : null,
            initiatedBy: int.initiatedBy
              ? { id: String(int.initiatedBy._id), name: `${int.initiatedBy.firstName} ${int.initiatedBy.lastName}` }
              : null,
            riskIndicator: int.riskIndicator
              ? { id: String(int.riskIndicator._id), riskScore: int.riskIndicator.riskScore, priority: int.riskIndicator.priority }
              : null,
            relatedCourse: int.relatedCourse
              ? { id: String(int.relatedCourse._id), code: int.relatedCourse.code, name: int.relatedCourse.name }
              : null,
          })),
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
      } catch (err) {
        console.error("List interventions error:", err);
        res.status(500).json({ error: "Failed to load interventions." });
      }
    }
  );

  // GET /api/early-warning/interventions - List all interventions
  app.get(
    "/api/early-warning/interventions",
    requireAuth,
    requirePermission("earlyWarning.view"),
    async (req, res) => {
      try {
        const roles = getUserRoles(req.user);
        const isStudent = roles.includes("student");
        const isFaculty = roles.includes("faculty");

        const filter = {};
        if (isStudent) {
          const student = await Student.findOne({ user: req.user._id || req.user.id });
          if (!student) return res.status(404).json({ error: "Student profile not found." });
          filter.student = student._id;
        } else if (isFaculty && !roles.includes("hod") && !roles.includes("program_coordinator")) {
          filter.initiatedBy = req.user._id || req.user.id;
        }

        if (req.query.student) filter.student = req.query.student;
        if (req.query.status) filter.status = req.query.status;
        if (req.query.interventionType) filter.interventionType = req.query.interventionType;

        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
        const skip = (page - 1) * limit;

        const [interventions, total] = await Promise.all([
          AcademicIntervention.find(filter)
            .populate("student", "studentId firstName lastName program semester")
            .populate("initiatedBy", "firstName lastName")
            .populate("riskIndicator", "riskScore priority")
            .populate("relatedCourse", "code name")
            .populate("assignedTo", "firstName lastName")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
          AcademicIntervention.countDocuments(filter),
        ]);

        res.json({
          interventions: interventions.map((i) => ({
            ...i,
            id: String(i._id),
            student: i.student
              ? { id: String(i.student._id), studentId: i.student.studentId, fullName: `${i.student.firstName} ${i.student.lastName}`, program: i.student.program, semester: i.student.semester }
              : null,
            initiatedBy: i.initiatedBy ? { id: String(i.initiatedBy._id), fullName: `${i.initiatedBy.firstName} ${i.initiatedBy.lastName}` } : null,
            riskIndicator: i.riskIndicator ? { id: String(i.riskIndicator._id), riskScore: i.riskIndicator.riskScore, priority: i.riskIndicator.priority } : null,
            relatedCourse: i.relatedCourse ? { id: String(i.relatedCourse._id), code: i.relatedCourse.code, name: i.relatedCourse.name } : null,
            assignedTo: i.assignedTo ? { id: String(i.assignedTo._id), fullName: `${i.assignedTo.firstName} ${i.assignedTo.lastName}` } : null,
          })),
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
      } catch (err) {
        console.error("List interventions error:", err);
        res.status(500).json({ error: "Failed to load interventions." });
      }
    }
  );

  // POST /api/early-warning/interventions - Create intervention (generic)
  app.post(
    "/api/early-warning/interventions",
    requireAuth,
    requirePermission("earlyWarning.manage"),
    async (req, res) => {
      try {
        const {
          studentId,
          riskIndicatorId,
          interventionType,
          title,
          description,
          priority = "MODERATE",
          scheduledAt,
          relatedCourseId,
          assignedToId,
        } = req.body || {};

        if (!studentId || !interventionType || !title) {
          return res.status(400).json({ error: "Student, intervention type, and title are required." });
        }

        const student = await Student.findById(studentId);
        if (!student) return res.status(404).json({ error: "Student not found." });

        const intervention = await AcademicIntervention.create({
          student: studentId,
          riskIndicator: riskIndicatorId || null,
          interventionType,
          title,
          description,
          priority,
          scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
          relatedCourse: relatedCourseId || null,
          assignedTo: assignedToId || null,
          initiatedBy: req.user._id || req.user.id,
          status: "PLANNED",
        });

        // If linked to a risk indicator, add to recommendedInterventions
        if (riskIndicatorId) {
          await AcademicRiskIndicator.findByIdAndUpdate(riskIndicatorId, {
            $push: { recommendedInterventions: { intervention: intervention._id, assignedTo: assignedToId || req.user._id || req.user.id, status: "PENDING" } },
          });
        }

        const populatedIntervention = await AcademicIntervention.findById(intervention._id)
          .populate("student", "studentId firstName lastName program semester")
          .populate("initiatedBy", "firstName lastName")
          .populate("riskIndicator", "riskScore priority")
          .populate("relatedCourse", "code name")
          .populate("assignedTo", "firstName lastName")
          .lean();

        res.status(201).json({
          success: true,
          intervention: {
            ...populatedIntervention,
            id: String(populatedIntervention._id),
            student: populatedIntervention.student
              ? { id: String(populatedIntervention.student._id), studentId: populatedIntervention.student.studentId, fullName: `${populatedIntervention.student.firstName} ${populatedIntervention.student.lastName}`, program: populatedIntervention.student.program, semester: populatedIntervention.student.semester }
              : null,
            initiatedBy: populatedIntervention.initiatedBy ? { id: String(populatedIntervention.initiatedBy._id), fullName: `${populatedIntervention.initiatedBy.firstName} ${populatedIntervention.initiatedBy.lastName}` } : null,
            riskIndicator: populatedIntervention.riskIndicator ? { id: String(populatedIntervention.riskIndicator._id), riskScore: populatedIntervention.riskIndicator.riskScore, priority: populatedIntervention.riskIndicator.priority } : null,
            relatedCourse: populatedIntervention.relatedCourse ? { id: String(populatedIntervention.relatedCourse._id), code: populatedIntervention.relatedCourse.code, name: populatedIntervention.relatedCourse.name } : null,
            assignedTo: populatedIntervention.assignedTo ? { id: String(populatedIntervention.assignedTo._id), fullName: `${populatedIntervention.assignedTo.firstName} ${populatedIntervention.assignedTo.lastName}` } : null,
          },
        });
      } catch (err) {
        console.error("Create intervention error:", err);
        res.status(500).json({ error: "Failed to create intervention." });
      }
    }
  );

  app.post(
    "/api/early-warning/calculate",
    requireAuth,
    requirePermission("earlyWarning.manage"),
    asyncHandler(async (req, res) => {
      const { department, program, semester, academicYear, thresholdAttendance = 75 } = req.body || {};

      const filter = {};
      if (department) filter.department = department;
      if (program) filter.program = program;
      if (semester) filter.semester = Number(semester);
      if (academicYear) filter.academicYear = academicYear;

      const students = await Student.find(filter).limit(500).lean();
      let created = 0;
      let updated = 0;

      for (const s of students) {
        const factors = [];
        let riskScore = 0;

        const attPct = typeof s.attendancePercentage === "number" ? s.attendancePercentage : 100;
        if (attPct < 60) {
          riskScore += 40;
          factors.push({
            factor: "CRITICAL_ATTENDANCE_DEFICIT",
            description: `Current attendance is ${attPct}%, well below the institutional 75% examination threshold.`,
            severity: "HIGH",
            sourceRecord: { collectionName: "Student", recordId: s._id, label: `${s.firstName} ${s.lastName} (${s.studentId})` },
          });
        } else if (attPct < thresholdAttendance) {
          riskScore += 25;
          factors.push({
            factor: "ATTENDANCE_WARNING",
            description: `Attendance (${attPct}%) is below configured threshold (${thresholdAttendance}%).`,
            severity: "MODERATE",
            sourceRecord: { collectionName: "Student", recordId: s._id, label: `${s.firstName} ${s.lastName} (${s.studentId})` },
          });
        }

        const { Submission, ExamResult, Assignment } = await import("../models/index.js");
        const submissions = await Submission.find({ student: s._id }).limit(20).lean();
        const lateOrMissing = submissions.filter((sub) => sub.status === "LATE" || sub.status === "RESUBMITTED");
        if (lateOrMissing.length >= 2) {
          riskScore += 20;
          factors.push({
            factor: "REPEATED_LATE_SUBMISSIONS",
            description: `${lateOrMissing.length} assignment(s) submitted late or flagged for revision.`,
            severity: "MODERATE",
            sourceRecord: { collectionName: "Submission", recordId: lateOrMissing[0]?._id, label: "Late submissions" },
          });
        }

        const examResults = await ExamResult.find({ student: s._id }).limit(10).lean();
        const failingResults = examResults.filter((r) => r.status === "FAILED" || (r.percentage && r.percentage < 40));
        if (failingResults.length > 0) {
          riskScore += 35;
          factors.push({
            factor: "ACADEMIC_EXAM_DEFICIT",
            description: `Failed ${failingResults.length} course assessment module(s).`,
            severity: "HIGH",
            sourceRecord: { collectionName: "ExamResult", recordId: failingResults[0]?._id, label: "Failed exams" },
          });
        }

        let priority = "LOW";
        if (riskScore >= 50) priority = "HIGH";
        else if (riskScore >= 25) priority = "MODERATE";

        const recommendedInterventions = [];
        if (priority === "HIGH") recommendedInterventions.push({ intervention: "Schedule Academic Advisor Consultation", priority: "HIGH", status: "PENDING" });
        else if (priority === "MODERATE") recommendedInterventions.push({ intervention: "Peer Tutoring Support", priority: "MODERATE", status: "PENDING" });
        if (attPct < thresholdAttendance) recommendedInterventions.push({ intervention: "Issue Attendance Remediation Notice", priority: priority === "HIGH" ? "HIGH" : "MODERATE", status: "PENDING" });
        if (failingResults.length > 0) recommendedInterventions.push({ intervention: "Offer Course Subject Remedial Sessions", priority: "HIGH", status: "PENDING" });

        const existing = await AcademicRiskIndicator.findOne({ student: s._id });
        if (existing) {
          existing.riskScore = riskScore;
          existing.priority = priority;
          existing.contributingFactors = factors.map((f) => ({ ...f, detectedAt: new Date() }));
          existing.recommendedInterventions = recommendedInterventions;
          existing.lastCalculatedAt = new Date();
          if (existing.status === "RESOLVED" && riskScore > 0) existing.status = "ACTIVE";
          await existing.save();
          updated++;
        } else if (riskScore > 0 || factors.length > 0) {
          await AcademicRiskIndicator.create({
            student: s._id,
            department: s.department,
            program: s.program,
            semester: s.semester,
            academicYear: s.academicYear,
            riskScore,
            priority,
            contributingFactors: factors.map((f) => ({ ...f, detectedAt: new Date() })),
            recommendedInterventions,
            status: riskScore > 0 ? "ACTIVE" : "MONITORING",
            lastCalculatedAt: new Date(),
          });
          created++;
        }
      }

      res.json({ success: true, studentsEvaluated: students.length, indicatorsCreated: created, indicatorsUpdated: updated });
    })
  );

  app.get(
    "/api/early-warning/summary",
    requireAuth,
    requirePermission("earlyWarning.view"),
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
        if (req.query.department) match.department = req.query.department;
        if (req.query.program) match.program = req.query.program;
        if (req.query.semester) match.semester = Number(req.query.semester);

        const pipeline = [
          { $match: match },
          {
            $group: {
              _id: "$priority",
              count: { $sum: 1 },
              avgRiskScore: { $avg: "$riskScore" },
            },
          },
        ];
        const priorityStats = await AcademicRiskIndicator.aggregate(pipeline);

        const statusPipeline = [
          { $match: match },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ];
        const statusStats = await AcademicRiskIndicator.aggregate(statusPipeline);

        const totalStudents = isStudent ? 1 : await Student.countDocuments(
          isStudent ? {} : { department: req.query.department, program: req.query.program, semester: req.query.semester }
        );

        res.json({
          totalStudents,
          priorityBreakdown: priorityStats.reduce((acc, item) => ({ ...acc, [item._id]: item.count }), {}),
          statusBreakdown: statusStats.reduce((acc, item) => ({ ...acc, [item._id]: item.count }), {}),
          flaggedCount: await AcademicRiskIndicator.countDocuments({ ...match, priority: { $in: ["MODERATE", "HIGH"] } }),
        });
      } catch (err) {
        console.error("Early warning summary error:", err);
        res.status(500).json({ error: "Failed to load early warning summary." });
      }
    }
  );
}