import { requireAuth, requirePermission } from "../middleware/auth.js";
import { getUserRoles } from "../db.js";
import mongoose from "mongoose";
import {
  AdvisingSession,
  Student,
  Course,
  User,
} from "../models/index.js";
import { createAndEmitNotification } from "../services/notificationService.js";

function canManageAll(roles) {
  return roles.some((r) => ["super_admin", "dean", "hod", "program_coordinator", "registrar", "student_affairs", "counselor"].includes(r));
}

export function registerStudentAdvisingRoutes(app) {
  app.get(
    "/api/faculty/advising",
    requireAuth,
    requirePermission(["student.view.assigned", "workflow.view", "lms.view"]),
    async (req, res) => {
      try {
        const { status, studentId, from, to } = req.query || {};
        const roles = getUserRoles(req.user);
        const filter = {};
        if (!canManageAll(roles)) filter.facultyUser = req.user._id;
        if (status) filter.status = String(status).toUpperCase();
        if (studentId && mongoose.isValidObjectId(studentId)) filter.student = studentId;
        if (from || to) {
          filter.scheduledDate = {};
          if (from) filter.scheduledDate.$gte = new Date(String(from));
          if (to) filter.scheduledDate.$lte = new Date(String(to));
        }
        const [sessions, students] = await Promise.all([
          AdvisingSession.find(filter)
            .populate("student", "studentId firstName lastName program semester section batch")
            .populate("studentUser", "firstName lastName email")
            .populate("relatedCourse", "code name")
            .sort({ scheduledDate: -1, createdAt: -1 })
            .limit(200)
            .lean(),
          canManageAll(roles)
            ? Student.find({ status: "ACTIVE" }).select("studentId firstName lastName program semester section batch user").sort({ rollNumber: 1 }).limit(300).lean()
            : Student.find({ status: "ACTIVE" }).select("studentId firstName lastName program semester section batch user").sort({ rollNumber: 1 }).limit(300).lean(),
        ]);
        res.json({
          sessions: sessions.map(serializeSession),
          students: students.map((s) => ({ id: String(s._id), userId: s.user ? String(s.user) : null, studentCode: s.studentId, name: `${s.firstName || ""} ${s.lastName || ""}`.trim(), program: s.program, semester: s.semester, section: s.section, batch: s.batch })),
        });
      } catch (err) {
        console.error("advising list error", err);
        res.status(500).json({ error: "Failed to load advising records." });
      }
    },
  );

  app.post(
    "/api/faculty/advising",
    requireAuth,
    requirePermission(["student.view.assigned", "workflow.manage", "lms.view"]),
    async (req, res) => {
      try {
        const roles = getUserRoles(req.user);
        const b = req.body || {};
        if (!b.studentId || !mongoose.isValidObjectId(b.studentId)) return res.status(400).json({ error: "Valid studentId is required." });
        if (!b.title || !String(b.title).trim()) return res.status(400).json({ error: "Title is required." });
        if (!b.scheduledDate) return res.status(400).json({ error: "Scheduled date is required." });
        const student = await Student.findById(b.studentId).select("user studentId firstName lastName").lean();
        if (!student) return res.status(404).json({ error: "Student not found." });
        const facultyUser = canManageAll(roles) && b.facultyUserId && mongoose.isValidObjectId(b.facultyUserId) ? b.facultyUserId : req.user._id;
        const session = await AdvisingSession.create({
          student: student._id,
          studentUser: student.user,
          facultyUser,
          consultationType: b.consultationType || "ACADEMIC_ADVISING",
          title: String(b.title).trim().slice(0, 200),
          description: String(b.description || "").trim().slice(0, 4000),
          scheduledDate: new Date(b.scheduledDate),
          scheduledTime: String(b.scheduledTime || "").trim(),
          durationMinutes: Math.min(180, Math.max(15, Number(b.durationMinutes) || 30)),
          mode: b.mode || "IN_PERSON",
          location: String(b.location || "").trim(),
          status: b.status || "SCHEDULED",
          isPrivate: b.isPrivate !== false,
          studentConcerns: Array.isArray(b.studentConcerns) ? b.studentConcerns.map((x) => String(x).trim()).filter(Boolean) : [],
          facultyNotes: String(b.facultyNotes || "").trim().slice(0, 4000),
          actionItems: normalizeActionItems(b.actionItems),
          followUpDate: b.followUpDate ? new Date(b.followUpDate) : null,
          referredTo: String(b.referredTo || "").trim(),
          relatedCourse: b.relatedCourseId && mongoose.isValidObjectId(b.relatedCourseId) ? b.relatedCourseId : null,
          academicYear: String(b.academicYear || "").trim(),
          semester: b.semester != null ? Number(b.semester) : null,
        });
        if (student.user) {
          await createAndEmitNotification({
            user: student.user,
            title: "Advising session scheduled",
            message: `A consultation "${session.title}" has been scheduled.`,
            category: "ACADEMIC",
            priority: "normal",
            actionUrl: "student_advising",
            sender: req.user._id,
            senderType: "user",
            relatedEntityType: "AdvisingSession",
            relatedEntityId: String(session._id),
          }).catch(() => {});
        }
        const populated = await AdvisingSession.findById(session._id).populate("student", "studentId firstName lastName program semester section batch").populate("relatedCourse", "code name").lean();
        res.status(201).json({ session: serializeSession(populated) });
      } catch (err) {
        console.error("advising create error", err);
        res.status(500).json({ error: "Failed to create advising session." });
      }
    },
  );

  app.patch(
    "/api/faculty/advising/:id",
    requireAuth,
    requirePermission(["student.view.assigned", "workflow.manage", "lms.view"]),
    async (req, res) => {
      try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid session id." });
        const roles = getUserRoles(req.user);
        const filter = { _id: req.params.id };
        if (!canManageAll(roles)) filter.facultyUser = req.user._id;
        const session = await AdvisingSession.findOne(filter);
        if (!session) return res.status(404).json({ error: "Advising session not found." });
        const b = req.body || {};
        if (b.status) session.status = String(b.status).toUpperCase();
        if (b.title != null) session.title = String(b.title).trim().slice(0, 200);
        if (b.description != null) session.description = String(b.description).trim().slice(0, 4000);
        if (b.scheduledDate) session.scheduledDate = new Date(b.scheduledDate);
        if (b.scheduledTime != null) session.scheduledTime = String(b.scheduledTime).trim();
        if (b.facultyNotes != null) session.facultyNotes = String(b.facultyNotes).trim().slice(0, 4000);
        if (b.studentConcerns != null) session.studentConcerns = Array.isArray(b.studentConcerns) ? b.studentConcerns.map((x) => String(x).trim()).filter(Boolean) : session.studentConcerns;
        if (b.actionItems != null) session.actionItems = normalizeActionItems(b.actionItems);
        if (b.followUpDate !== undefined) session.followUpDate = b.followUpDate ? new Date(b.followUpDate) : null;
        if (b.referredTo != null) session.referredTo = String(b.referredTo).trim();
        if (b.mode != null) session.mode = b.mode;
        if (b.location != null) session.location = String(b.location).trim();
        session.updatedAt = new Date();
        await session.save();
        const populated = await AdvisingSession.findById(session._id).populate("student", "studentId firstName lastName program semester section batch").populate("relatedCourse", "code name").lean();
        res.json({ session: serializeSession(populated) });
      } catch (err) {
        console.error("advising update error", err);
        res.status(500).json({ error: "Failed to update advising session." });
      }
    },
  );
}

function normalizeActionItems(items) {
  if (!Array.isArray(items)) return [];
  return items.filter((i) => i && i.description).map((i) => ({
    description: String(i.description).trim().slice(0, 500),
    assignedTo: String(i.assignedTo || "").trim(),
    dueDate: i.dueDate ? new Date(i.dueDate) : null,
    completed: Boolean(i.completed),
    completedAt: i.completed ? (i.completedAt ? new Date(i.completedAt) : new Date()) : null,
  }));
}
function serializeSession(s) {
  if (!s) return null;
  const st = s.student && typeof s.student === "object" ? s.student : null;
  const course = s.relatedCourse && typeof s.relatedCourse === "object" ? s.relatedCourse : null;
  return {
    id: String(s._id),
    studentId: s.student ? String(s.student._id || s.student) : null,
    studentCode: st?.studentId || null,
    studentName: st ? `${st.firstName || ""} ${st.lastName || ""}`.trim() : null,
    studentProgram: st?.program || null,
    studentSection: st?.section || null,
    consultationType: s.consultationType,
    title: s.title,
    description: s.description || "",
    scheduledDate: s.scheduledDate,
    scheduledTime: s.scheduledTime || "",
    durationMinutes: s.durationMinutes,
    mode: s.mode,
    location: s.location || "",
    status: s.status,
    isPrivate: s.isPrivate !== false,
    studentConcerns: s.studentConcerns || [],
    facultyNotes: s.facultyNotes || "",
    actionItems: s.actionItems || [],
    followUpDate: s.followUpDate || null,
    referredTo: s.referredTo || "",
    relatedCourse: course ? { id: String(course._id), code: course.code, name: course.name } : null,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt || null,
  };
}
