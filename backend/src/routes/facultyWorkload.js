import { requireAuth, requirePermission } from "../middleware/auth.js";
import { getUserRoles } from "../db.js";
import mongoose from "mongoose";
import {
  CourseTeachingAssignment,
  FacultySubjectAssignment,
  Timetable,
  StudentAssessmentMark,
  TeachingProgress,
  Submission,
  Assignment,
  AdvisingSession,
  User,
  Course,
} from "../models/index.js";

export function registerFacultyWorkloadRoutes(app) {
  app.get(
    "/api/faculty/workload",
    requireAuth,
    requirePermission(["lms.view", "attendance.view.course"]),
    async (req, res) => {
      try {
        const { facultyUserId, academicYear, semester, department } = req.query || {};
        const roles = getUserRoles(req.user);
        const isPrivileged = roles.some((r) => ["super_admin", "dean", "hod", "program_coordinator", "registrar", "principal", "management"].includes(r));
        const isDept = roles.includes("hod") || roles.includes("program_coordinator");
        const targetUserId = isPrivileged && facultyUserId && mongoose.isValidObjectId(facultyUserId) ? facultyUserId : req.user._id;
        if (!isPrivileged && String(targetUserId) !== String(req.user._id)) {
          return res.status(403).json({ error: "You can only view your own workload." });
        }

        const [ta, sa, timetable, marks, teaching, pendingSubs, advising, faculty] = await Promise.all([
          CourseTeachingAssignment.find({ facultyUser: targetUserId }).populate("course", "code name semester academicYear credits").lean(),
          FacultySubjectAssignment.find({ facultyUser: targetUserId, isActive: true }).populate("course", "code name semester academicYear credits").lean(),
          Timetable.find({ facultyUser: targetUserId, status: { $ne: "CANCELLED" } }).populate("course", "code name").lean(),
          StudentAssessmentMark.find({ "enteredBy": targetUserId }).select("course workflowStatus resultStatus totalMarksObtained updatedAt").lean().catch(() => StudentAssessmentMark.find({}).select("course workflowStatus resultStatus totalMarksObtained updatedAt").limit(0).lean()),
          TeachingProgress.find({ facultyUser: targetUserId }).select("course taughtOn").lean(),
          Submission.find({ status: { $in: ["SUBMITTED", "LATE"] } }).populate({ path: "assignment", select: "course title", match: ta.length || sa.length ? { course: { $in: [...ta, ...sa].map((a) => a.course?._id || a.course).filter(Boolean) } } : undefined }).select("assignment status submittedAt").lean(),
          AdvisingSession.countDocuments({ facultyUser: targetUserId }).catch(() => 0),
          User.findById(targetUserId).select("firstName lastName email department").lean(),
        ]);

        const courseMap = new Map();
        for (const a of [...ta, ...sa]) {
          const c = a.course; if (!c) continue;
          const id = String(c._id || c);
          if (!courseMap.has(id)) courseMap.set(id, { id, code: c.code, name: c.name, semester: c.semester ?? null, academicYear: c.academicYear || null, credits: c.credits ?? null, sections: new Set() });
          if (a.sectionCode) courseMap.get(id).sections.add(a.sectionCode);
        }
        const courses = Array.from(courseMap.values()).map((c) => ({ ...c, sections: Array.from(c.sections) }));
        const weeklyHours = timetable.reduce((sum, s) => {
          if (!s.startTime || !s.endTime) return sum;
          const [sh, sm] = String(s.startTime).split(":").map(Number); const [eh, em] = String(s.endTime).split(":").map(Number);
          if ([sh,sm,eh,em].some(Number.isNaN)) return sum;
          return sum + Math.max(0, ((eh*60+em)-(sh*60+sm))/60);
        }, 0);
        const practicalHours = timetable.filter((s) => /lab|practical/i.test(String(s.sessionType || ""))).reduce((sum, s) => {
          const [sh, sm] = String(s.startTime || "0:0").split(":").map(Number); const [eh, em] = String(s.endTime || "0:0").split(":").map(Number);
          return sum + Math.max(0, ((eh*60+em)-(sh*60+sm))/60);
        }, 0);
        const pendingMarking = pendingSubs.filter((s) => s.assignment).length;
        const marksByCourse = new Map();
        for (const m of marks) { const k = String(m.course); const e = marksByCourse.get(k) || { total: 0, draft: 0, submitted: 0 }; e.total++; if (["DRAFT","IN_PROGRESS","RETURNED"].includes(m.workflowStatus)) e.draft++; if (["SUBMITTED","VERIFIED"].includes(m.workflowStatus)) e.submitted++; marksByCourse.set(k, e); }
        const teachingByCourse = new Map();
        for (const t of teaching) { const k = String(t.course); teachingByCourse.set(k, (teachingByCourse.get(k) || 0) + 1); }

        let departmentSummary = null;
        if (isDept || isPrivileged) {
          const deptFilter = department ? { department: String(department) } : (faculty?.department ? { department: faculty.department } : {});
          const deptFaculty = await User.find({ $or: [{ roles: "faculty" }, { role: "faculty" }], ...(deptFilter.department ? { department: deptFilter.department } : {}) }).select("_id firstName lastName department").limit(100).lean().catch(() => []);
          departmentSummary = { count: deptFaculty.length, department: deptFilter.department || null, note: "Departmental workload aggregation is limited to authorized roles and assigned-course/timetable records." };
        }

        res.json({
          faculty: faculty ? { id: String(faculty._id), name: [faculty.firstName, faculty.lastName].filter(Boolean).join(" "), email: faculty.email, department: faculty.department || null } : null,
          scope: { ownOnly: !isPrivileged, privileged: isPrivileged },
          summary: {
            assignedCourses: courses.length,
            assignedSections: Array.from(new Set(courses.flatMap((c) => c.sections))).length,
            weeklyTeachingHours: Math.round(weeklyHours * 10) / 10,
            practicalLabHours: Math.round(practicalHours * 10) / 10,
            timetableSessions: timetable.length,
            teachingRecords: teaching.length,
            pendingMarkingSubmissions: pendingMarking,
            advisingSessions: advising,
          },
          courses: courses.map((c) => ({
            ...c,
            teachingRecords: teachingByCourse.get(c.id) || 0,
            assessment: marksByCourse.get(c.id) || { total: 0, draft: 0, submitted: 0 },
            timetableSessions: timetable.filter((s) => String(s.course?._id || s.course) === c.id).length,
          })),
          timetable: timetable.slice(0, 40).map((s) => ({ id: String(s._id), date: s.date || null, day: s.scheduledDay, startTime: s.startTime, endTime: s.endTime, sectionCode: s.sectionCode, room: s.room || null, sessionType: s.sessionType || null, course: s.course ? { code: s.course.code, name: s.course.name } : null })),
          departmentSummary,
        });
      } catch (err) {
        console.error("faculty workload error", err);
        res.status(500).json({ error: "Failed to load faculty workload." });
      }
    },
  );
}
