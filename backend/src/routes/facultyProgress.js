import { requireAuth, requirePermission } from "../middleware/auth.js";
import { getUserRoles } from "../db.js";
import mongoose from "mongoose";
import {
  Student,
  Attendance,
  StudentAssessmentMark,
  Submission,
  Assignment,
  Course,
  Enrollment,
  CourseTeachingAssignment,
  FacultySubjectAssignment,
  AcademicIntervention,
} from "../models/index.js";
import { courseRiskSignals } from "../services/lms/analytics.js";

/**
 * Faculty-facing student progress & at-risk monitoring.
 * Evidence is derived from stored attendance, assessment, assignment/submission,
 * and LMS risk signals. No marks or academic standing are modified.
 */
export function registerFacultyProgressRoutes(app) {
  app.get(
    "/api/faculty/student-progress",
    requireAuth,
    requirePermission(["attendance.view.course", "student.view.assigned", "grade.view.course"]),
    async (req, res) => {
      try {
        const { courseId, sectionCode, semester, academicYear, program, batch, riskLevel } = req.query || {};
        const roles = getUserRoles(req.user);
        const isPrivileged = roles.some((r) =>
          ["super_admin", "dean", "hod", "program_coordinator", "registrar", "exam_officer"].includes(r),
        );

        // Resolve faculty teaching scope unless privileged
        let allowedCourseIds = null;
        if (!isPrivileged && roles.includes("faculty")) {
          const [ta, sa] = await Promise.all([
            CourseTeachingAssignment.find({ facultyUser: req.user._id }).select("course sectionCode").lean(),
            FacultySubjectAssignment.find({ facultyUser: req.user._id, isActive: true }).select("course").lean(),
          ]);
          allowedCourseIds = new Set([
            ...ta.map((r) => String(r.course)),
            ...sa.map((r) => String(r.course)),
          ]);
        }
        if (courseId && allowedCourseIds && !allowedCourseIds.has(String(courseId))) {
          return res.status(403).json({ error: "You are not assigned to this course." });
        }

        // Build student filter from enrollment/course context when provided
        let studentIds = null;
        if (courseId) {
          const enrollFilter = { course: courseId, status: "ENROLLED" };
          if (sectionCode && sectionCode !== "ALL") enrollFilter.sectionCode = String(sectionCode).toUpperCase();
          if (semester) enrollFilter.semester = Number(semester);
          if (academicYear) enrollFilter.academicYear = String(academicYear);
          const enrollments = await Enrollment.find(enrollFilter).select("student").lean();
          studentIds = enrollments.map((e) => e.student);
          if (studentIds.length === 0) {
            // fallback to student collection
            const sf = { status: "ACTIVE" };
            if (sectionCode && sectionCode !== "ALL") sf.section = String(sectionCode).toUpperCase();
            if (semester) sf.semester = Number(semester);
            if (program) sf.program = String(program);
            if (batch) sf.batch = String(batch);
            const fallback = await Student.find(sf).select("_id").lean();
            studentIds = fallback.map((s) => s._id);
          }
        }
        const studentFilter = { status: "ACTIVE" };
        if (studentIds) studentFilter._id = { $in: studentIds };
        if (sectionCode && sectionCode !== "ALL" && !studentIds) studentFilter.section = String(sectionCode).toUpperCase();
        if (semester && !studentIds) studentFilter.semester = Number(semester);
        if (program) studentFilter.program = String(program);
        if (batch) studentFilter.batch = String(batch);
        if (academicYear) studentFilter.academicYear = String(academicYear);

        const students = await Student.find(studentFilter)
          .select("studentId rollNumber firstName lastName program semester section batch attendancePercentage cgpa status user")
          .sort({ rollNumber: 1, studentId: 1 })
          .limit(500)
          .lean();

        const ids = students.map((s) => s._id);
        const userIds = students.map((s) => s.user).filter(Boolean);

          const attMatch = { student: { $in: ids } };
          if (courseId && mongoose.isValidObjectId(courseId)) attMatch.course = new mongoose.Types.ObjectId(String(courseId));
          const [attendanceAgg, marks, submissions, assignmentCount] = await Promise.all([
            Attendance.aggregate([
              { $match: attMatch },
              {
                $group: {
                  _id: "$student",
                  total: { $sum: 1 },
                  present: { $sum: { $cond: [{ $in: ["$status", ["Present", "Late"]] }, 1, 0] } },
                  absent: { $sum: { $cond: [{ $eq: ["$status", "Absent"] }, 1, 0] } },
                  late: { $sum: { $cond: [{ $eq: ["$status", "Late"] }, 1, 0] } },
                  recent: { $push: { date: "$date", status: "$status" } },
                },
              },
            ]),
            StudentAssessmentMark.find({
              student: { $in: ids },
              ...(courseId ? { course: courseId } : {}),
            })
              .select("student percentage grade resultStatus workflowStatus courseCode courseName components updatedAt")
              .lean(),
            Submission.find({ student: { $in: ids } })
              .populate({ path: "assignment", select: "title dueAt course", ...(courseId ? { match: { course: courseId } } : {}) })
              .select("student status isLate submittedAt marks assignment")
              .lean(),
            courseId ? Assignment.countDocuments({ course: courseId, status: { $ne: "ARCHIVED" } }) : Promise.resolve(null),
          ]);

        const attByStudent = new Map(attendanceAgg.map((a) => [String(a._id), a]));
        const marksByStudent = new Map();
        for (const m of marks) {
          const k = String(m.student);
          const list = marksByStudent.get(k) || [];
          list.push(m);
          marksByStudent.set(k, list);
        }
        const subsByStudent = new Map();
        for (const s of submissions) {
          if (courseId && !s.assignment) continue;
          const k = String(s.student);
          const list = subsByStudent.get(k) || [];
          list.push(s);
          subsByStudent.set(k, list);
        }

        let lmsSignals = null;
        if (courseId) {
          try {
            lmsSignals = await courseRiskSignals({
              courseId: String(courseId),
              sectionCodes: sectionCode && sectionCode !== "ALL" ? [String(sectionCode).toUpperCase()] : undefined,
              semester: semester ? Number(semester) : undefined,
            });
          } catch {}
        }

        const rows = students.map((s) => {
          const sid = String(s._id);
          const att = attByStudent.get(sid);
          const attTotal = att?.total || 0;
          const attPct = attTotal ? Math.round((att.present / attTotal) * 10000) / 100 : (typeof s.attendancePercentage === "number" ? s.attendancePercentage : null);
          const absentCount = att?.absent || 0;
          const recent = (att?.recent || [])
            .sort((a, b) => String(b.date).localeCompare(String(a.date)))
            .slice(0, 10)
            .map((r) => ({ date: r.date, status: r.status }));
          const consecutiveAbsences = countRecentConsecutiveAbsences(recent);

          const studentMarks = marksByStudent.get(sid) || [];
          const avgPct = avg(studentMarks.map((m) => m.percentage).filter((v) => v != null));
          const failing = studentMarks.filter((m) => m.resultStatus === "FAIL").length;
          const incomplete = studentMarks.filter((m) => m.resultStatus === "INCOMPLETE" || ["DRAFT", "IN_PROGRESS"].includes(m.workflowStatus)).length;

          const studentSubs = subsByStudent.get(sid) || [];
          const submitted = studentSubs.filter((x) => ["SUBMITTED", "LATE", "GRADED", "RETURNED"].includes(x.status)).length;
          const late = studentSubs.filter((x) => x.isLate).length;
          const missingAssignments = assignmentCount != null ? Math.max(0, assignmentCount - submitted) : null;

          const evidence = [];
          let score = 0;
          if (attPct != null && attPct < 60) { score += 35; evidence.push({ type: "ATTENDANCE", detail: `Attendance ${attPct}% is critically below 75% threshold.`, severity: "HIGH" }); }
          else if (attPct != null && attPct < 75) { score += 20; evidence.push({ type: "ATTENDANCE", detail: `Attendance ${attPct}% is below 75% threshold.`, severity: "MEDIUM" }); }
          if (consecutiveAbsences >= 3) { score += 20; evidence.push({ type: "ABSENCE_PATTERN", detail: `${consecutiveAbsences} recent consecutive absences detected.`, severity: "HIGH" }); }
          if (avgPct != null && avgPct < 40) { score += 30; evidence.push({ type: "PERFORMANCE", detail: `Average assessment performance ${avgPct.toFixed(1)}% indicates failing trajectory.`, severity: "HIGH" }); }
          else if (avgPct != null && avgPct < 55) { score += 15; evidence.push({ type: "PERFORMANCE", detail: `Average assessment performance ${avgPct.toFixed(1)}% is declining/below target.`, severity: "MEDIUM" }); }
          if (failing > 0) { score += Math.min(20, failing * 10); evidence.push({ type: "RESULTS", detail: `${failing} failed assessment record(s).`, severity: "HIGH" }); }
          if (missingAssignments != null && missingAssignments >= 2) { score += 15; evidence.push({ type: "ASSIGNMENTS", detail: `${missingAssignments} assignment(s) not submitted for this course.`, severity: "MEDIUM" }); }
          if (late >= 2) { score += 10; evidence.push({ type: "ASSIGNMENTS", detail: `${late} late submission(s).`, severity: "LOW" }); }

          const level = score >= 50 ? "HIGH" : score >= 25 ? "MEDIUM" : score > 0 ? "LOW" : "NONE";
          return {
            studentId: String(s._id),
            studentCode: s.studentId,
            rollNumber: s.rollNumber || s.studentId,
            name: `${s.firstName || ""} ${s.lastName || ""}`.trim(),
            program: s.program,
            semester: s.semester,
            section: s.section,
            batch: s.batch,
            attendance: { percentage: attPct, totalSessions: attTotal, absent: absentCount, late: att?.late || 0, recent, consecutiveAbsences },
            assessment: { averagePercentage: avgPct, records: studentMarks.length, failing, incomplete, latest: studentMarks[0] ? { courseCode: studentMarks[0].courseCode, percentage: studentMarks[0].percentage, grade: studentMarks[0].grade, resultStatus: studentMarks[0].resultStatus } : null },
            assignments: { submitted, late, missing: missingAssignments, total: assignmentCount },
            risk: { level, score, evidence, recommendedAction: recommendedAction(level, evidence) },
          };
        });

        const filtered = riskLevel && riskLevel !== "ALL" ? rows.filter((r) => r.risk.level === riskLevel) : rows;
        filtered.sort((a, b) => b.risk.score - a.risk.score || (b.attendance.percentage ?? 101) - (a.attendance.percentage ?? 101));

        res.json({
          summary: {
            total: rows.length,
            highRisk: rows.filter((r) => r.risk.level === "HIGH").length,
            mediumRisk: rows.filter((r) => r.risk.level === "MEDIUM").length,
            lowRisk: rows.filter((r) => r.risk.level === "LOW").length,
            averageAttendance: avg(rows.map((r) => r.attendance.percentage).filter((v) => v != null)),
            averageAssessment: avg(rows.map((r) => r.assessment.averagePercentage).filter((v) => v != null)),
          },
          lmsSignals: lmsSignals?.signals || null,
          students: filtered,
        });
      } catch (err) {
        console.error("faculty student-progress error", err);
        res.status(500).json({ error: "Failed to load student progress." });
      }
    },
  );

  // Persisted intervention records (reuses AcademicIntervention model)
  app.get(
    "/api/faculty/student-progress/interventions",
    requireAuth,
    requirePermission(["attendance.view.course", "student.view.assigned", "grade.view.course"]),
    async (req, res) => {
      try {
        const { studentId } = req.query || {};
        const roles = getUserRoles(req.user);
        const privileged = roles.some((r) => ["super_admin", "dean", "hod", "program_coordinator", "registrar", "student_affairs", "counselor"].includes(r));
        const filter = {};
        if (studentId && mongoose.isValidObjectId(studentId)) filter.student = studentId;
        if (!privileged) filter.initiatedBy = req.user._id;
        const records = await AcademicIntervention.find(filter)
          .populate("student", "studentId firstName lastName program semester section")
          .populate("initiatedBy", "firstName lastName")
          .populate("relatedCourse", "code name")
          .sort({ createdAt: -1 })
          .limit(300)
          .lean();
        res.json({ interventions: records.map(serializeIntervention) });
      } catch (err) {
        console.error("interventions list error", err);
        res.status(500).json({ error: "Failed to load interventions." });
      }
    },
  );

  app.post(
    "/api/faculty/student-progress/interventions",
    requireAuth,
    requirePermission(["attendance.view.course", "student.view.assigned", "grade.view.course"]),
    async (req, res) => {
      try {
        const b = req.body || {};
        if (!b.studentId || !mongoose.isValidObjectId(b.studentId)) return res.status(400).json({ error: "Valid studentId is required." });
        if (!b.interventionType || !b.title) return res.status(400).json({ error: "interventionType and title are required." });
        const student = await Student.findById(b.studentId).select("_id").lean();
        if (!student) return res.status(404).json({ error: "Student not found." });
        const intervention = await AcademicIntervention.create({
          student: student._id,
          riskIndicator: b.riskIndicatorId && mongoose.isValidObjectId(b.riskIndicatorId) ? b.riskIndicatorId : null,
          initiatedBy: req.user._id,
          interventionType: b.interventionType,
          title: String(b.title).trim().slice(0, 200),
          description: String(b.description || "").trim().slice(0, 2000),
          status: b.status || "PLANNED",
          priority: b.priority || "MODERATE",
          scheduledAt: b.scheduledAt ? new Date(b.scheduledAt) : null,
          followUpRequired: Boolean(b.followUpRequired),
          followUpDate: b.followUpDate ? new Date(b.followUpDate) : null,
          relatedCourse: b.relatedCourseId && mongoose.isValidObjectId(b.relatedCourseId) ? b.relatedCourseId : null,
          outcomeNotes: String(b.outcomeNotes || "").trim().slice(0, 2000),
          metadata: b.evidence ? { evidence: b.evidence, recommendedAction: b.recommendedAction || null } : {},
        });
        const populated = await AcademicIntervention.findById(intervention._id)
          .populate("student", "studentId firstName lastName program semester section")
          .populate("initiatedBy", "firstName lastName")
          .populate("relatedCourse", "code name")
          .lean();
        res.status(201).json({ intervention: serializeIntervention(populated) });
      } catch (err) {
        console.error("intervention create error", err);
        res.status(500).json({ error: "Failed to create intervention." });
      }
    },
  );

  app.patch(
    "/api/faculty/student-progress/interventions/:id",
    requireAuth,
    requirePermission(["attendance.view.course", "student.view.assigned", "grade.view.course"]),
    async (req, res) => {
      try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid intervention id." });
        const roles = getUserRoles(req.user);
        const privileged = roles.some((r) => ["super_admin", "dean", "hod", "program_coordinator", "registrar", "student_affairs", "counselor"].includes(r));
        const filter = { _id: req.params.id };
        if (!privileged) filter.initiatedBy = req.user._id;
        const intervention = await AcademicIntervention.findOne(filter);
        if (!intervention) return res.status(404).json({ error: "Intervention not found." });
        const b = req.body || {};
        if (b.status) intervention.status = b.status;
        if (b.priority) intervention.priority = b.priority;
        if (b.outcome) intervention.outcome = b.outcome;
        if (b.outcomeNotes != null) intervention.outcomeNotes = String(b.outcomeNotes).trim().slice(0, 2000);
        if (b.description != null) intervention.description = String(b.description).trim().slice(0, 2000);
        if (b.followUpRequired !== undefined) intervention.followUpRequired = Boolean(b.followUpRequired);
        if (b.followUpDate !== undefined) intervention.followUpDate = b.followUpDate ? new Date(b.followUpDate) : null;
        if (b.scheduledAt !== undefined) intervention.scheduledAt = b.scheduledAt ? new Date(b.scheduledAt) : null;
        if (b.status === "IN_PROGRESS" && !intervention.startedAt) intervention.startedAt = new Date();
        if (["COMPLETED", "CANCELLED", "DEFERRED"].includes(b.status)) intervention.completedAt = intervention.completedAt || new Date();
        await intervention.save();
        const populated = await AcademicIntervention.findById(intervention._id)
          .populate("student", "studentId firstName lastName program semester section")
          .populate("initiatedBy", "firstName lastName")
          .populate("relatedCourse", "code name")
          .lean();
        res.json({ intervention: serializeIntervention(populated) });
      } catch (err) {
        console.error("intervention update error", err);
        res.status(500).json({ error: "Failed to update intervention." });
      }
    },
  );
}

function avg(values) {
  if (!values || values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
}
function countRecentConsecutiveAbsences(recent) {
  let c = 0;
  for (const r of recent) {
    if (r.status === "Absent") c++; else break;
  }
  return c;
}
function recommendedAction(level, evidence) {
  if (level === "HIGH") return "Schedule advising/intervention, review attendance and assessment evidence, and coordinate with HoD/Student Support if needed.";
  if (level === "MEDIUM") return "Monitor closely, follow up on missing work or attendance, and record an advising note if pattern continues.";
  if (level === "LOW") return "Continue monitoring; no immediate intervention required.";
  return "No risk indicators detected from available records.";
}

function serializeIntervention(i) {
  if (!i) return null;
  const student = i.student && typeof i.student === "object" ? i.student : null;
  const initiatedBy = i.initiatedBy && typeof i.initiatedBy === "object" ? i.initiatedBy : null;
  const course = i.relatedCourse && typeof i.relatedCourse === "object" ? i.relatedCourse : null;
  return {
    id: String(i._id),
    studentId: student ? String(student._id) : String(i.student),
    studentCode: student?.studentId || null,
    studentName: student ? `${student.firstName || ""} ${student.lastName || ""}`.trim() : null,
    initiatedBy: initiatedBy ? `${initiatedBy.firstName || ""} ${initiatedBy.lastName || ""}`.trim() : null,
    interventionType: i.interventionType,
    title: i.title,
    description: i.description || "",
    status: i.status,
    priority: i.priority,
    outcome: i.outcome,
    outcomeNotes: i.outcomeNotes || "",
    followUpRequired: Boolean(i.followUpRequired),
    followUpDate: i.followUpDate || null,
    scheduledAt: i.scheduledAt || null,
    startedAt: i.startedAt || null,
    completedAt: i.completedAt || null,
    relatedCourse: course ? { id: String(course._id), code: course.code, name: course.name } : null,
    metadata: i.metadata || {},
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  };
}
