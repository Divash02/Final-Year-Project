import { requireAuth, requirePermission } from "../middleware/auth.js";
import { getUserRoles } from "../db.js";
import mongoose from "mongoose";
import {
  ClassSubstitution,
  LeaveRequest,
  Timetable,
  User,
  Notification,
} from "../models/index.js";
import { createAndEmitNotification } from "../services/notificationService.js";

function privileged(roles) {
  return roles.some((r) => ["super_admin", "dean", "hod", "program_coordinator", "registrar", "academic_admin", "hr", "hr_officer"].includes(r));
}

export function registerLeaveSubstitutionRoutes(app) {
  app.get(
    "/api/faculty/leave-substitution",
    requireAuth,
    requirePermission(["attendance.session.create", "lms.view", "timetable.view"]),
    async (req, res) => {
      try {
        const roles = getUserRoles(req.user);
        const filter = privileged(roles) ? {} : { requesterFacultyUser: req.user._id };
        const [leaves, substitutions, mySessions, facultyOptionsRaw] = await Promise.all([
          LeaveRequest.find(privileged(roles) ? {} : { employee: req.user._id }).sort({ createdAt: -1 }).limit(100).lean(),
          ClassSubstitution.find(filter)
            .populate("replacementFacultyUser", "firstName lastName email")
            .populate("requesterFacultyUser", "firstName lastName email")
            .sort({ createdAt: -1 })
            .limit(150)
            .lean(),
          Timetable.find({ facultyUser: req.user._id, status: { $ne: "CANCELLED" } })
            .populate("course", "code name")
            .select("date scheduledDay startTime endTime sectionCode room sessionType course status")
            .sort({ date: 1, startTime: 1 })
            .limit(120)
            .lean(),
          User.find({ $or: [{ roles: "faculty" }, { role: "faculty" }] }).select("firstName lastName email").limit(300).lean().catch(() => []),
        ]);
        res.json({
          leaves: leaves.map((l) => ({ id: String(l._id), leaveType: l.leaveType, startDate: l.startDate, endDate: l.endDate, reason: l.reason, status: l.status, comments: l.comments || null, createdAt: l.createdAt })),
          substitutions: substitutions.map(serializeSub),
          mySessions: mySessions.map((s) => ({ id: String(s._id), date: s.date || null, day: s.scheduledDay, startTime: s.startTime, endTime: s.endTime, sectionCode: s.sectionCode, room: s.room || null, sessionType: s.sessionType || null, course: s.course ? { id: String(s.course._id || s.course), code: s.course.code, name: s.course.name } : null })),
          facultyOptions: facultyOptionsRaw.map((u) => ({ id: String(u._id), name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "Faculty", email: u.email || "" })),
        });
      } catch (err) {
        console.error("leave-substitution list error", err);
        res.status(500).json({ error: "Failed to load leave/substitution data." });
      }
    },
  );

  app.post(
    "/api/faculty/leave-substitution/leave",
    requireAuth,
    requirePermission(["attendance.session.create", "lms.view"]),
    async (req, res) => {
      try {
        const b = req.body || {};
        if (!b.leaveType || !b.startDate || !b.endDate || !b.reason) return res.status(400).json({ error: "leaveType, startDate, endDate, and reason are required." });
        const leave = await LeaveRequest.create({
          employee: req.user._id,
          leaveType: String(b.leaveType).toLowerCase(),
          startDate: new Date(b.startDate),
          endDate: new Date(b.endDate),
          reason: String(b.reason).trim(),
          status: "pending",
        });
        res.status(201).json({ leave: { id: String(leave._id), leaveType: leave.leaveType, startDate: leave.startDate, endDate: leave.endDate, reason: leave.reason, status: leave.status } });
      } catch (err) {
        console.error("leave create error", err);
        res.status(500).json({ error: "Failed to submit leave request." });
      }
    },
  );

  app.post(
    "/api/faculty/leave-substitution",
    requireAuth,
    requirePermission(["attendance.session.create", "lms.view"]),
    async (req, res) => {
      try {
        const b = req.body || {};
        const roles = getUserRoles(req.user);
        const requester = req.user;
        const affectedSessionIds = Array.isArray(b.affectedSessionIds) ? b.affectedSessionIds.filter((id) => mongoose.isValidObjectId(id)) : [];
        const sessions = affectedSessionIds.length ? await Timetable.find({ _id: { $in: affectedSessionIds } }).populate("course", "code name").lean() : [];
        if (affectedSessionIds.length && sessions.length !== affectedSessionIds.length) return res.status(400).json({ error: "One or more affected timetable sessions were not found." });
        // Conflict check: replacement faculty cannot have overlapping timetable sessions on same date/time
        let replacementAvailability = "PENDING_CHECK";
        let replacement = null;
        if (b.replacementFacultyUserId && mongoose.isValidObjectId(b.replacementFacultyUserId)) {
          replacement = await User.findById(b.replacementFacultyUserId).select("firstName lastName email").lean();
          const conflicts = await Timetable.find({
            facultyUser: b.replacementFacultyUserId,
            status: { $ne: "CANCELLED" },
            $or: sessions.map((s) => ({
              ...(s.date ? { date: s.date } : { scheduledDay: s.scheduledDay }),
              startTime: { $lt: s.endTime || "23:59" },
              endTime: { $gt: s.startTime || "00:00" },
            })),
          }).select("_id").limit(1).lean();
          replacementAvailability = conflicts.length ? "CONFLICT" : "AVAILABLE";
        }
        const sub = await ClassSubstitution.create({
          leaveRequest: b.leaveRequestId && mongoose.isValidObjectId(b.leaveRequestId) ? b.leaveRequestId : null,
          requesterFacultyUser: requester._id,
          requesterName: [requester.firstName, requester.lastName].filter(Boolean).join(" ") || requester.email || "Faculty",
          requesterDepartment: requester.department || "",
          replacementFacultyUser: replacement?._id || null,
          replacementName: replacement ? [replacement.firstName, replacement.lastName].filter(Boolean).join(" ") : (b.replacementName || ""),
          replacementAvailability,
          affectedSessions: sessions.map((s) => ({
            timetable: s._id,
            course: s.course?._id || s.course || null,
            courseCode: s.course?.code || "",
            courseName: s.course?.name || "",
            sectionCode: s.sectionCode || "",
            scheduledDay: s.scheduledDay || "",
            scheduledDate: s.date ? new Date(s.date) : null,
            startTime: s.startTime || "",
            endTime: s.endTime || "",
            sessionType: s.sessionType || "",
            room: s.room || "",
            substitutionStatus: "PENDING",
          })),
          affectedSessionCount: sessions.length,
          leaveDates: { startDate: b.startDate ? new Date(b.startDate) : null, endDate: b.endDate ? new Date(b.endDate) : null },
          leaveReason: String(b.reason || "").trim(),
          status: "PENDING_HOD",
        });
        const populated = await ClassSubstitution.findById(sub._id).populate("replacementFacultyUser", "firstName lastName email").lean();
        res.status(201).json({ substitution: serializeSub(populated), replacementAvailability });
      } catch (err) {
        console.error("substitution create error", err);
        res.status(500).json({ error: "Failed to create substitution request." });
      }
    },
  );

  app.patch(
    "/api/faculty/leave-substitution/:id/review",
    requireAuth,
    requirePermission(["attendance.session.create", "timetable.manage", "lms.view"]),
    async (req, res) => {
      try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid id." });
        const roles = getUserRoles(req.user);
        const b = req.body || {};
        const sub = await ClassSubstitution.findById(req.params.id);
        if (!sub) return res.status(404).json({ error: "Substitution request not found." });
        const isAdmin = privileged(roles);
        if (!isAdmin && String(sub.requesterFacultyUser) !== String(req.user._id) && !roles.includes("hod")) {
          return res.status(403).json({ error: "Not authorized to review this substitution." });
        }
        if (b.action === "hod_approve" && (roles.includes("hod") || isAdmin)) {
          sub.hodApprovalStatus = "APPROVED"; sub.hodApproverUser = req.user._id; sub.hodApprovalNotes = String(b.notes || "").trim(); sub.hodApprovedAt = new Date(); sub.status = "PENDING_ACADEMIC_ADMIN";
        } else if (b.action === "hod_reject" && (roles.includes("hod") || isAdmin)) {
          sub.hodApprovalStatus = "REJECTED"; sub.hodApprovalNotes = String(b.notes || "").trim(); sub.status = "REJECTED";
        } else if (b.action === "academic_coordinate" && (roles.includes("academic_admin") || roles.includes("registrar") || isAdmin)) {
          sub.academicAdminStatus = "COORDINATED"; sub.academicAdminUser = req.user._id; sub.academicAdminNotes = String(b.notes || "").trim(); sub.academicAdminApprovedAt = new Date(); sub.status = "APPROVED"; sub.timetableUpdated = Boolean(b.timetableUpdated);
          sub.studentsNotified = false;
          // notify replacement/requester and affected students (best-effort, no automatic timetable mutation)
          for (const uid of [sub.requesterFacultyUser, sub.replacementFacultyUser].filter(Boolean)) {
            await createAndEmitNotification({ user: uid, title: "Class substitution coordinated", message: `Substitution request has been ${sub.status.toLowerCase()}.`, category: "ACADEMIC", priority: "normal", actionUrl: "leave_substitution", senderType: "system" }).catch(() => {});
          }
        } else if (b.action === "cancel" && String(sub.requesterFacultyUser) === String(req.user._id)) {
          sub.status = "CANCELLED";
        } else {
          return res.status(400).json({ error: "Unsupported review action or insufficient role." });
        }
        sub.updatedAt = new Date();
        await sub.save();
        res.json({ substitution: serializeSub(sub.toObject()) });
      } catch (err) {
        console.error("substitution review error", err);
        res.status(500).json({ error: "Failed to review substitution request." });
      }
    },
  );
}

function serializeSub(s) {
  if (!s) return null;
  const rep = s.replacementFacultyUser && typeof s.replacementFacultyUser === "object" ? s.replacementFacultyUser : null;
  return {
    id: String(s._id),
    leaveRequestId: s.leaveRequest ? String(s.leaveRequest) : null,
    requesterName: s.requesterName,
    replacementName: rep ? [rep.firstName, rep.lastName].filter(Boolean).join(" ") : s.replacementName || "",
    replacementAvailability: s.replacementAvailability,
    affectedSessions: s.affectedSessions || [],
    affectedSessionCount: s.affectedSessionCount || 0,
    leaveDates: s.leaveDates || null,
    leaveReason: s.leaveReason || "",
    status: s.status,
    hodApprovalStatus: s.hodApprovalStatus,
    hodApprovalNotes: s.hodApprovalNotes || "",
    academicAdminStatus: s.academicAdminStatus,
    academicAdminNotes: s.academicAdminNotes || "",
    timetableUpdated: Boolean(s.timetableUpdated),
    studentsNotified: Boolean(s.studentsNotified),
    createdAt: s.createdAt,
  };
}
