import { getAnalyticsSummary, getUserRoles } from "../db.js";
import {
  User,
  Student,
  Assignment,
  Attendance,
  Invoice,
  AuditLog,
  Enrollment,
  Exam,
} from "../models/index.js";
import { requireAuth, requirePermission, requireRole } from "../middleware/auth.js";
import { hasPermission } from "../permissions/catalog.js";
import { calculateExamCountdown, convertToNepaliDate } from "../services/nepaliDateHelper.js";

export function registerReportingRoutes(app) {
  app.get("/api/dashboard/summary", requireAuth, async (req, res) => {
    try {
      const roles = getUserRoles(req.user);
      const currentUserId = req.user._id || req.user.id;
      const now = new Date();

      if (roles.includes("student")) {
        const student = await Student.findOne({ user: currentUserId });
        let totalAssignments = 0;
        let totalAttendanceSessions = 0;
        let totalInvoices = 0;
        let outstandingBalance = 0;
        let upcomingExams = [];

        if (student) {
          const enrollments = await Enrollment.find({ student: student._id });
          const courseIds = enrollments.map((e) => e.course);

          totalAssignments = await Assignment.countDocuments({
            $or: [{ course: { $in: courseIds } }, { sectionCode: student.section }],
          });

          totalAttendanceSessions = await Attendance.countDocuments({
            student: student._id,
          });

          const invoices = await Invoice.find({ student: student._id, status: { $ne: "VOID" } });
          totalInvoices = invoices.length;
          outstandingBalance = invoices.reduce(
            (acc, inv) => acc + Math.max(0, inv.totalAmount - inv.paidAmount),
            0
          );

          // Find published exams for this student
          const rawExams = await Exam.find({
            status: { $in: ["PUBLISHED", "RESCHEDULED", "IN_PROGRESS"] },
            $or: [
              { "candidateSnapshot.studentUser": currentUserId },
              { "candidateSnapshot.student": student._id },
              { candidateScope: "SEMESTER_WIDE", program: student.program, semester: student.semester },
              { candidateScope: "PROGRAM_WIDE", program: student.program },
            ],
          })
            .populate("course")
            .sort({ startDateTime: 1, examDate: 1 });

          upcomingExams = rawExams.map((x) => {
            const countdown = calculateExamCountdown(
              x.startDateTime || `${x.examDate}T${x.startTime}:00+05:45`,
              x.endDateTime || `${x.examDate}T${x.endTime}:00+05:45`,
              x.status,
              now
            );
            return {
              id: x._id.toString(),
              title: x.title,
              courseCode: x.course?.code || "CS101",
              courseName: x.course?.name || "Course",
              program: x.program,
              semester: x.semester,
              examDate: x.examDate,
              nepaliDate: x.nepaliDate || convertToNepaliDate(x.examDate).formatted,
              startTime: x.startTime,
              endTime: x.endTime,
              room: x.room,
              status: x.status,
              countdown,
            };
          });
        }

        return res.json({
          scope: "self",
          summary: {
            totalAssignments,
            totalAttendanceSessions,
            totalInvoices,
            outstandingBalance,
            upcomingExamsCount: upcomingExams.length,
            upcomingExams,
          },
        });
      }

      if (roles.includes("faculty")) {
        const [assignments, sessions, rawExams] = await Promise.all([
          Assignment.countDocuments({ facultyUser: currentUserId }),
          Attendance.distinct("date", { markedBy: currentUserId }),
          Exam.find({
            status: { $in: ["PUBLISHED", "RESCHEDULED", "IN_PROGRESS"] },
            $or: [
              { assignedFaculty: currentUserId },
              { "invigilators.user": currentUserId },
            ],
          })
            .populate("course")
            .sort({ startDateTime: 1, examDate: 1 }),
        ]);

        const upcomingExams = rawExams.map((x) => {
          const isAssigned = (x.assignedFaculty || []).some(
            (id) => id.toString() === currentUserId.toString()
          );
          const invigEntry = (x.invigilators || []).find(
            (inv) => inv.user?.toString() === currentUserId.toString()
          );

          let facultyRole = "Course Faculty";
          if (isAssigned && invigEntry) facultyRole = "Course Faculty & Invigilator";
          else if (invigEntry) facultyRole = "Invigilator";

          const countdown = calculateExamCountdown(
            x.startDateTime || `${x.examDate}T${x.startTime}:00+05:45`,
            x.endDateTime || `${x.examDate}T${x.endTime}:00+05:45`,
            x.status,
            now
          );

          return {
            id: x._id.toString(),
            title: x.title,
            courseCode: x.course?.code || "CS101",
            courseName: x.course?.name || "Course",
            examDate: x.examDate,
            nepaliDate: x.nepaliDate || convertToNepaliDate(x.examDate).formatted,
            startTime: x.startTime,
            endTime: x.endTime,
            room: invigEntry?.room || x.room,
            candidateCount: x.candidateCount,
            facultyRole,
            countdown,
          };
        });

        return res.json({
          scope: "teaching_assignments",
          summary: {
            totalAssignments: assignments,
            totalAttendanceSessions: sessions.length,
            upcomingExamsCount: upcomingExams.length,
            upcomingExams,
          },
        });
      }

      if (roles.includes("exam_officer")) {
        const todayStr = new Date().toISOString().split("T")[0];
        const [
          totalExaminations,
          publishedExaminations,
          todayExams,
          pendingResultsExams,
        ] = await Promise.all([
          Exam.countDocuments(),
          Exam.countDocuments({ status: "PUBLISHED" }),
          Exam.countDocuments({ examDate: todayStr, status: { $ne: "CANCELLED" } }),
          Exam.countDocuments({ resultsStatus: { $in: ["DRAFT", "UNDER_EVALUATION"] }, status: "PUBLISHED" }),
        ]);

        return res.json({
          scope: "examinations",
          summary: {
            totalExaminations,
            publishedExaminations,
            todayExams,
            pendingResultsExams,
          },
        });
      }

      if (hasPermission(roles, "analytics.view")) {
        const summary = await getAnalyticsSummary();
        const totalExaminations = await Exam.countDocuments();
        const publishedExaminations = await Exam.countDocuments({ status: "PUBLISHED" });
        return res.json({
          summary: {
            ...summary,
            totalExaminations,
            publishedExaminations,
          },
          scope: "institution",
        });
      }

      res.json({ scope: "self", summary: {} });
    } catch (err) {
      console.error("Dashboard summary error:", err);
      res.status(500).json({ error: "Failed to load dashboard summary." });
    }
  });

  app.get(
    "/api/audit",
    requireAuth,
    requirePermission(["audit.view", "accounts.manage"]),
    async (req, res) => {
      try {
        const { module: queryModule } = req.query || {};
        const filter = queryModule ? { module: queryModule } : {};
        const rows = await AuditLog.find(filter)
          .populate("user", "firstName lastName email")
          .sort({ createdAt: -1 })
          .limit(100);
        res.json({ audit: rows });
      } catch (err) {
        res.status(500).json({ error: "Failed to load audit logs." });
      }
    }
  );

  app.get(
    "/api/analytics/summary",
    requireAuth,
    requirePermission("analytics.view"),
    async (req, res) => {
      try {
        const summary = await getAnalyticsSummary();
        res.json(summary);
      } catch (err) {
        res.status(500).json({ error: "Failed to load analytics summary." });
      }
    }
  );

  app.get("/api/health/db", requireAuth, async (req, res) => {
    try {
      const totalUsers = await User.countDocuments();
      res.json({ users: totalUsers, status: "connected" });
    } catch {
      res.status(500).json({ status: "disconnected" });
    }
  });
}
