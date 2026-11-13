import { requireAuth, requirePermission } from "../middleware/auth.js";
import { getUserRoles } from "../db.js";
import mongoose from "mongoose";
import { AnomalyAlert, Student, StudentAssessmentMark, Attendance, Submission } from "../models/index.js";

function canReview(roles) {
  return roles.some((r) => ["super_admin", "dean", "hod", "program_coordinator", "registrar", "exam_officer", "student_affairs", "counselor", "faculty"].includes(r));
}

export function registerFacultyAlertsRoutes(app) {
  app.get(
    "/api/faculty/alerts",
    requireAuth,
    requirePermission(["student.view.assigned", "attendance.view.course", "grade.view.course", "lms.view"]),
    async (req, res) => {
      try {
        const roles = getUserRoles(req.user);
        const privileged = roles.some((r) => ["super_admin", "dean", "hod", "program_coordinator", "registrar", "exam_officer"].includes(r));
        const { status, module, severity, limit = 100 } = req.query || {};
        const filter = { module: { $in: ["attendance", "examinations", "cases", "workflow"] } };
        if (!privileged) filter["affectedRecord.recordId"] = { $exists: true }; // faculty-scoped best-effort; privileged see all in academic modules
        if (status) filter.status = String(status).toUpperCase();
        if (module) filter.module = String(module);
        if (severity) filter.severity = String(severity).toUpperCase();
        const alerts = await AnomalyAlert.find(filter).sort({ severity: -1, createdAt: -1 }).limit(Math.min(300, Number(limit) || 100)).lean();
        res.json({ alerts: alerts.map(serialize) });
      } catch (err) {
        console.error("faculty alerts list error", err);
        res.status(500).json({ error: "Failed to load alerts." });
      }
    },
  );

  app.post(
    "/api/faculty/alerts/generate",
    requireAuth,
    requirePermission(["student.view.assigned", "attendance.view.course", "grade.view.course"]),
    async (req, res) => {
      try {
        const roles = getUserRoles(req.user);
        if (!canReview(roles)) return res.status(403).json({ error: "Not authorized." });
        const { studentId, courseId, academicYear } = req.body || {};
        let studentFilter = { status: "ACTIVE" };
        if (studentId && mongoose.isValidObjectId(studentId)) studentFilter._id = studentId;
        const students = await Student.find(studentFilter).select("_id studentId firstName lastName program semester section").limit(studentId ? 1 : 60).lean();
        const created = [];
        for (const s of students) {
          const [att, marks, subs] = await Promise.all([
            Attendance.find({ student: s._id, ...(courseId ? { course: courseId } : {}) }).select("status date").sort({ date: -1 }).limit(60).lean(),
            StudentAssessmentMark.find({ student: s._id, ...(courseId ? { course: courseId } : {}) }).select("percentage grade resultStatus courseCode").lean(),
            Submission.find({ student: s._id }).populate({ path: "assignment", select: "course", ...(courseId ? { match: { course: courseId } } : {}) }).select("status isLate submittedAt assignment").lean(),
          ]);
          const relevantSubs = subs.filter((x) => x.assignment);
          const total = att.length; const absent = att.filter((a) => a.status === "Absent").length;
          const attPct = total ? Math.round(((total - absent) / total) * 1000) / 10 : null;
          let consec = 0; for (const a of att) { if (a.status === "Absent") consec++; else break; }
          const avgPct = marks.length ? Math.round((marks.reduce((sum, m) => sum + (Number(m.percentage) || 0), 0) / marks.length) * 10) / 10 : null;
          const missing = relevantSubs.filter((x) => !x.submittedAt && x.status !== "GRADED").length;
          const late = relevantSubs.filter((x) => x.isLate).length;
          const evidence = [];
          if (attPct != null && attPct < 75) evidence.push({ key: "attendance_pct", label: "Attendance %", value: attPct, threshold: 75, detail: `Attendance ${attPct}% below 75% (${absent}/${total} absent).`, severity: attPct < 60 ? "HIGH" : "MEDIUM" });
          if (consec >= 3) evidence.push({ key: "consecutive_absences", label: "Consecutive absences", value: consec, threshold: 3, detail: `${consec} consecutive absences in recent records.`, severity: consec >= 5 ? "HIGH" : "MEDIUM" });
          if (avgPct != null && avgPct < 50) evidence.push({ key: "avg_assessment", label: "Avg assessment %", value: avgPct, threshold: 50, detail: `Average assessment ${avgPct}% indicates failing trend.`, severity: "HIGH" });
          if (missing > 0) evidence.push({ key: "missing_assignments", label: "Missing assignments", value: missing, threshold: 1, detail: `${missing} assignment(s) missing/not submitted.`, severity: missing >= 3 ? "HIGH" : "MEDIUM" });
          if (late >= 2) evidence.push({ key: "late_submissions", label: "Late submissions", value: late, threshold: 2, detail: `${late} late submission(s).`, severity: "LOW" });
          if (evidence.length === 0) continue;
          const sev = evidence.some((e) => e.severity === "HIGH") ? "HIGH" : evidence.some((e) => e.severity === "MEDIUM") ? "MEDIUM" : "LOW";
          const recommendedAction = sev === "HIGH"
            ? "Schedule advising/intervention, review evidence with student, and coordinate support if needed."
            : "Monitor and record follow-up; consider advising if pattern persists.";
          const recordId = String(s._id);
          const existing = await AnomalyAlert.findOne({ event: "FACULTY_STUDENT_PROGRESS_RISK", "affectedRecord.recordId": recordId, status: { $nin: ["RESOLVED", "FALSE_POSITIVE"] } }).lean();
          if (existing) continue;
          const alert = await AnomalyAlert.create({
            event: "FACULTY_STUDENT_PROGRESS_RISK",
            module: "attendance",
            affectedRecord: { collectionName: "Student", recordId, identifier: s.studentId, label: `${s.firstName || ""} ${s.lastName || ""}`.trim() || s.studentId },
            reason: evidence.map((e) => e.detail).join(" "),
            severity: sev,
            evidence: evidence.map((e) => ({ key: e.key, label: e.label, value: e.value, threshold: e.threshold ?? null })),
            detectionType: "RULE_BASED",
            recommendedInvestigation: recommendedAction,
            status: "OPEN",
          });
          created.push(serialize(alert.toObject()));
        }
        res.json({ generated: created.length, alerts: created });
      } catch (err) {
        console.error("faculty alerts generate error", err);
        res.status(500).json({ error: "Failed to generate alerts." });
      }
    },
  );

  app.patch(
    "/api/faculty/alerts/:id/review",
    requireAuth,
    requirePermission(["student.view.assigned", "attendance.view.course", "grade.view.course"]),
    async (req, res) => {
      try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid alert id." });
        const roles = getUserRoles(req.user);
        if (!canReview(roles)) return res.status(403).json({ error: "Not authorized." });
        const alert = await AnomalyAlert.findById(req.params.id);
        if (!alert) return res.status(404).json({ error: "Alert not found." });
        const b = req.body || {};
        const note = String(b.note || b.resolutionNotes || "").trim().slice(0, 1000);
        const status = b.status ? String(b.status).toUpperCase() : alert.status;
        if (["OPEN", "ACKNOWLEDGED", "INVESTIGATING", "RESOLVED", "FALSE_POSITIVE"].includes(status)) alert.status = status;
        if (status === "ACKNOWLEDGED" || status === "INVESTIGATING") { alert.acknowledgedBy = req.user._id; alert.acknowledgedAt = alert.acknowledgedAt || new Date(); }
        if (status === "RESOLVED" || status === "FALSE_POSITIVE") { alert.resolvedBy = req.user._id; alert.resolvedAt = new Date(); }
        if (note) alert.resolutionNotes = [alert.resolutionNotes, note].filter(Boolean).join("\n").slice(0, 4000);
        await alert.save();
        res.json({ alert: serialize(alert.toObject()) });
      } catch (err) {
        console.error("faculty alert review error", err);
        res.status(500).json({ error: "Failed to update alert." });
      }
    },
  );
}

function serialize(a) {
  return {
    id: String(a._id),
    module: a.module,
    event: a.event,
    severity: a.severity,
    status: a.status,
    reason: a.reason || "",
    evidence: a.evidence || [],
    recommendedInvestigation: a.recommendedInvestigation || "",
    detectionType: a.detectionType || "RULE_BASED",
    resolutionNotes: a.resolutionNotes || "",
    affectedRecord: a.affectedRecord || null,
    acknowledgedAt: a.acknowledgedAt || null,
    resolvedAt: a.resolvedAt || null,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}