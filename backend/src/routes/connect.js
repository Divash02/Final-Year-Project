import { requireAuth, requirePermission } from "../middleware/auth.js";
import { route, forbidden, notFound, badRequest, validationError, conflict } from "../utils/apiError.js";
import {
  requireString,
  optionalString,
  optionalEnum,
  requireObjectId,
  toInt,
} from "../utils/validate.js";
import { logAudit } from "../db.js";
import {
  VirtualSession,
  VIRTUAL_SESSION_TYPES,
  VIRTUAL_SESSION_STATUSES,
  ClassroomBoard,
  Course,
} from "../models/index.js";
import {
  canCreateClass,
  canCreateMeeting,
  canManageConnectAdmin,
  canViewSession,
  sanitizeSessionForUser,
  listVisibleSessions,
  normalizeClassTarget,
  resolveClassParticipants,
  validateMeetingInvitees,
  issueCredential,
  isMeetingHostOrAdmin,
  notifyConnectClassCreated,
  notifyMeetingInvitees,
  isStudentOnly,
  resolveConnectParticipantRole,
  authorizeConnectJoin,
  listAssignedTeachersForCourse,
  validateAssignedTeacherForClass,
  searchConnectCourses,
  resolveCourseIdentityForConnect,
  resolveCourseOfferingsForConnect,
  resolveConnectClassSections,
  setAdmissionPolicy,
  requestAdmission,
  decideAdmission,
  getWaitingRoomRequests,
  expireCredentials,
  isAdmissionManaged,
  decryptCredentialPassword,
} from "../services/connectService.js";
import {
  assertLiveKitConfigured,
  createLiveKitAccessToken,
  buildConnectRoomName,
  getLiveKitConfig,
  getLiveKitPublicConfig,
} from "../services/connectLiveKitService.js";

/**
 * CollegeOS Connect routes (Phase 1 foundation).
 * All authorization and session-type isolation enforced server-side.
 */
export function registerConnectRoutes(app) {
  app.get(
    "/api/connect/sessions",
    requireAuth,
    route(async (req, res) => {
      const type = optionalEnum(req.query.type, "Type", VIRTUAL_SESSION_TYPES, { upper: true });
      const status = optionalEnum(req.query.status, "Status", VIRTUAL_SESSION_STATUSES, { upper: true });
      // Students can never query meetings; service enforces, but reject explicitly.
      if (isStudentOnly(req.user) && type === "ONLINE_MEETING") {
        return res.json({ sessions: [] });
      }
      const sessions = await listVisibleSessions(req.user, { type, status });
      res.json({ sessions });
    }),
  );

  // Course search for Step 1 (name/code) — real curriculum records only.
  app.get(
    "/api/connect/courses/search",
    requireAuth,
    requirePermission("connect.class.create"),
    route(async (req, res) => {
      if (!canCreateClass(req.user)) throw forbidden("You cannot create online classes.");
      const courses = await searchConnectCourses({
        q: optionalString(req.query.q, "Query", { max: 120 }),
        courseName: optionalString(req.query.courseName, "Course name", { max: 200 }),
        courseCode: optionalString(req.query.courseCode, "Course code", { max: 60 }),
        limit: req.query.limit,
      });
      res.json({ courses });
    }),
  );

  // Validate Step 1 identity (name+code must identify same valid curriculum course).
  app.post(
    "/api/connect/courses/resolve-identity",
    requireAuth,
    requirePermission("connect.class.create"),
    route(async (req, res) => {
      if (!canCreateClass(req.user)) throw forbidden("You cannot create online classes.");
      const body = req.body || {};
      const result = await resolveCourseIdentityForConnect({
        courseName: body.courseName,
        courseCode: body.courseCode,
      });
      res.json(result);
    }),
  );

  // Resolve valid academic offering(s) for selected course identity/ID (Step 2 auto-derive).
  app.post(
    "/api/connect/courses/offerings",
    requireAuth,
    requirePermission("connect.class.create"),
    route(async (req, res) => {
      if (!canCreateClass(req.user)) throw forbidden("You cannot create online classes.");
      const body = req.body || {};
      const result = await resolveCourseOfferingsForConnect(body.courseId, {
        courseName: body.courseName,
        courseCode: body.courseCode,
      });
      res.json(result);
    }),
  );

  // Courses/subjects for ONLINE_CLASS Step 2 — filtered from real curriculum records.
  app.get(
    "/api/connect/courses",
    requireAuth,
    requirePermission("connect.class.create"),
    route(async (req, res) => {
      if (!canCreateClass(req.user)) throw forbidden("You cannot create online classes.");
      const target = normalizeClassTarget({
        programCodes: req.query.program ? [req.query.program] : req.query.programCodes,
        semesters: req.query.semester ? [req.query.semester] : req.query.semesters,
        academicYears: req.query.academicYear ? [req.query.academicYear] : req.query.academicYears,
        batches: req.query.batch ? [req.query.batch] : req.query.batches,
        sectionCodes: req.query.section ? [req.query.section] : req.query.sectionCodes,
      });
      const filter = { status: "ACTIVE" };
      if (target.programCodes.length) {
        filter.$or = [
          { program: { $in: target.programCodes } },
          { programCode: { $in: target.programCodes } },
        ];
      }
      if (target.semesters.length) filter.semester = { $in: target.semesters };
      if (target.academicYears.length) filter.academicYear = { $in: target.academicYears };
      const courses = await Course.find(filter)
        .select("_id code name department program programCode semester academicYear courseType status")
        .sort({ semester: 1, code: 1, name: 1 })
        .limit(300)
        .lean();
      res.json({
        courses: courses.map((c) => ({
          id: String(c._id),
          code: c.code,
          name: c.name,
          department: c.department || null,
          program: c.program || c.programCode || null,
          semester: c.semester ?? null,
          academicYear: c.academicYear || null,
          courseType: c.courseType || null,
        })),
      });
    }),
  );

  // Valid sections for a course offering (Step 2) — real enrollment/allocation records.
  app.post(
    "/api/connect/classes/sections",
    requireAuth,
    requirePermission("connect.class.create"),
    route(async (req, res) => {
      if (!canCreateClass(req.user)) throw forbidden("You cannot create online classes.");
      const body = req.body || {};
      const result = await resolveConnectClassSections({
        courseId: body.courseId,
        program: body.program,
        academicYear: body.academicYear,
        semester: body.semester,
        batch: body.batch,
      });
      res.json(result);
    }),
  );

  // Assigned teachers for a selected course — from real allocation records only.
  app.get(
    "/api/connect/courses/:courseId/teachers",
    requireAuth,
    requirePermission("connect.class.create"),
    route(async (req, res) => {
      if (!canCreateClass(req.user)) throw forbidden("You cannot create online classes.");
      const target = normalizeClassTarget({
        programCodes: req.query.program ? [req.query.program] : req.query.programCodes,
        semesters: req.query.semester ? [req.query.semester] : req.query.semesters,
        academicYears: req.query.academicYear ? [req.query.academicYear] : req.query.academicYears,
        batches: req.query.batch ? [req.query.batch] : req.query.batches,
        sectionCodes: req.query.section ? [req.query.section] : req.query.sectionCodes,
      });
      const result = await listAssignedTeachersForCourse(req.params.courseId, target);
      res.json(result);
    }),
  );

  app.get(
    "/api/connect/sessions/:id",
    requireAuth,
    route(async (req, res) => {
      const session = await VirtualSession.findById(requireObjectId(req.params.id, "Session"))
        .populate("course", "code name department program semester academicYear")
        .populate("assignedTeacher", "firstName middleName lastName collegeEmail email");
      if (!session) throw notFound("Session not found.");
      if (!canViewSession(session, req.user)) {
        // Hide existence for meetings from students/unauthorized.
        throw notFound("Session not found.");
      }
      res.json({ session: sanitizeSessionForUser(session, req.user, { includeSecrets: canManageConnectAdmin(req.user) }) });
    }),
  );

  app.post(
    "/api/connect/classes",
    requireAuth,
    requirePermission("connect.class.create"),
    route(async (req, res) => {
      if (!canCreateClass(req.user)) throw forbidden("You cannot create online classes.");
      const body = req.body || {};
      const title = requireString(body.title, "Title", { max: 200 });
      const courseId = requireObjectId(body.courseId || body.course || body.classTarget?.course, "Course/Subject");
      const assignedTeacherId = requireObjectId(body.assignedTeacherId || body.assignedTeacher, "Assigned teacher");
      const targetBody = { ...(body.classTarget || body) };
      if (body.allSections === true || targetBody.allSections === true) targetBody.sectionCodes = [];
      const { resolvedStudents, resolvedStudentUsers, classTarget } = await resolveClassParticipants(targetBody);

      // Force target course to match explicit selection; validate teacher allocation server-side.
      classTarget.course = classTarget.course ? classTarget.course : (await import("mongoose")).default.Types.ObjectId.createFromHexString(courseId);
      const { course, teacher } = await validateAssignedTeacherForClass({
        courseId,
        assignedTeacherId,
        classTarget,
      });

      const studentCred = await issueCredential("student");
      const teacherCred = await issueCredential("teacher");
      if (studentCred.plain.sessionId16 === teacherCred.plain.sessionId16) {
        const retry = await issueCredential("teacher");
        teacherCred.plain = retry.plain;
        teacherCred.stored = retry.stored;
      }

      const session = await VirtualSession.create({
        title,
        description: optionalString(body.description, "Description", { max: 4000 }) || "",
        sessionType: "ONLINE_CLASS",
        status: "SCHEDULED",
        scheduledDate: optionalString(body.scheduledDate || body.date, "Date", { max: 20 }),
        startTime: optionalString(body.startTime, "Start time", { max: 10 }),
        endTime: optionalString(body.endTime, "End time", { max: 10 }),
        durationMinutes: body.durationMinutes ? toInt(body.durationMinutes, "Duration", { min: 1, max: 1440 }) : null,
        createdBy: req.user._id || req.user.id,
        host: teacher._id, // selected assigned teacher is the class host
        assignedTeacher: teacher._id,
        course: course._id,
        coHosts: Array.isArray(body.coHosts) ? body.coHosts.map((id) => requireObjectId(id, "Co-host")) : [],
        classTarget,
        resolvedStudents,
        resolvedStudentUsers,
        studentCredential: studentCred.stored,
        teacherCredential: teacherCred.stored,
        audit: [{
          action: "CLASS_CREATED",
          actor: req.user._id || req.user.id,
          details: {
            target: classTarget,
            count: resolvedStudentUsers.length,
            courseId: String(course._id),
            assignedTeacherId: String(teacher._id),
          },
        }],
      });

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "CONNECT_CLASS_CREATED",
        module: "connect",
        resource: "virtual_session",
        resourceId: String(session._id),
        details: `Online class "${title}" created for ${resolvedStudentUsers.length} students. Host: ${[teacher.firstName, teacher.lastName].filter(Boolean).join(" ")}.`,
        metadata: { sessionType: "ONLINE_CLASS", count: resolvedStudentUsers.length, courseId: String(course._id), assignedTeacherId: String(teacher._id) },
      });

      notifyConnectClassCreated(session, { teacher, course, classTarget, actor: req.user }).catch((err) => {
        console.error("Connect class notification dispatch failed:", err?.message || err);
      });

      // Re-read with populated refs for response (assignment persists and is visible immediately).
      const saved = await VirtualSession.findById(session._id)
        .populate("course", "code name department program semester academicYear")
        .populate("assignedTeacher", "firstName middleName lastName collegeEmail email")
        .lean();

      res.status(201).json({
        session: sanitizeSessionForUser(saved || session, req.user, { includeSecrets: true }),
        // Plaintext session credentials returned once to authorized creator (not teacher account password).
        issuedCredentials: {
          student: { sessionId16: studentCred.plain.sessionId16, password: studentCred.plain.password },
          teacher: { sessionId16: teacherCred.plain.sessionId16, password: teacherCred.plain.password },
        },
      });
    }),
  );

  app.post(
    "/api/connect/meetings",
    requireAuth,
    requirePermission("connect.meeting.create"),
    route(async (req, res) => {
      if (!canCreateMeeting(req.user)) throw forbidden("You cannot create institutional meetings.");
      if (isStudentOnly(req.user)) throw forbidden("Students cannot create meetings.");
      const body = req.body || {};
      const title = requireString(body.title, "Title", { max: 200 });
      const invitedUsers = await validateMeetingInvitees(body.invitedUserIds || body.invitees || []);
      const meetingCred = await issueCredential("meeting");

      const session = await VirtualSession.create({
        title,
        description: optionalString(body.description, "Description", { max: 4000 }) || "",
        sessionType: "ONLINE_MEETING",
        status: "SCHEDULED",
        scheduledDate: optionalString(body.scheduledDate || body.date, "Date", { max: 20 }),
        startTime: optionalString(body.startTime, "Start time", { max: 10 }),
        endTime: optionalString(body.endTime, "End time", { max: 10 }),
        durationMinutes: body.durationMinutes ? toInt(body.durationMinutes, "Duration", { min: 1, max: 1440 }) : null,
        createdBy: req.user._id || req.user.id,
        host: req.user._id || req.user.id,
        coHosts: Array.isArray(body.coHosts) ? body.coHosts.map((id) => requireObjectId(id, "Co-host")) : [],
        invitedUsers,
        meetingCredential: meetingCred.stored,
        audit: [{ action: "MEETING_CREATED", actor: req.user._id || req.user.id, details: { invited: invitedUsers.length } }],
      });

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "CONNECT_MEETING_CREATED",
        module: "connect",
        resource: "virtual_session",
        resourceId: String(session._id),
        details: `Institutional meeting "${title}" created with ${invitedUsers.length} invitees.`,
        metadata: { sessionType: "ONLINE_MEETING", invited: invitedUsers.length },
      });

      notifyMeetingInvitees(session, req.user).catch(() => {});

      res.status(201).json({
        session: sanitizeSessionForUser(session, req.user, { includeSecrets: true }),
        issuedCredentials: {
          meeting: { sessionId16: meetingCred.plain.sessionId16, password: meetingCred.plain.password },
        },
      });
    }),
  );

  // Participant preview (admin/authorized staff): resolve without creating. Paginated, server-resolved.
  app.post(
    "/api/connect/classes/resolve",
    requireAuth,
    requirePermission("connect.class.create"),
    route(async (req, res) => {
      const body = req.body || {};
      const classTarget = normalizeClassTarget(body.classTarget || body);
      // Accept explicit course selection for resolution when provided.
      if (!classTarget.course && (body.courseId || body.course)) {
        classTarget.course = (await import("mongoose")).default.Types.ObjectId.createFromHexString(
          requireObjectId(body.courseId || body.course, "Course/Subject"),
        );
      }
      // "All Sections" means no section filter (explicit) — normalizeClassTarget keeps [] when absent; honor allSections flag.
      if (body.allSections === true || body.classTarget?.allSections === true) {
        classTarget.sectionCodes = [];
      }
      const page = Math.max(1, toInt(body.page, "Page", { min: 1, max: 10000, fallback: 1 }));
      const limit = Math.max(1, Math.min(200, toInt(body.limit, "Limit", { min: 1, max: 200, fallback: 50 })));
      const { students, classTarget: resolvedTarget } = await resolveClassParticipants(classTarget);
      const start = (page - 1) * limit;
      const slice = students.slice(start, start + limit);
      // include institutional email from linked User when present (best-effort)
      const userIds = slice.map((s) => s.user).filter(Boolean);
      const { User } = await import("../models/index.js");
      const users = userIds.length
        ? await User.find({ _id: { $in: userIds } }).select("_id email collegeEmail").lean()
        : [];
      const emailByUser = new Map(users.map((u) => [String(u._id), String(u.collegeEmail || u.email || "")]));
      res.json({
        target: resolvedTarget,
        count: students.length,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(students.length / limit)),
        students: slice.map((s) => ({
          id: String(s._id),
          studentId: s.studentId || null,
          enrollmentId: s.studentId || String(s._id),
          name: `${s.firstName || ""} ${s.lastName || ""}`.trim(),
          email: emailByUser.get(String(s.user)) || null,
          program: s.program || s.programCode || null,
          batch: s.batch || null,
          semester: s.semester ?? null,
          section: s.section || null,
        })),
      });
    }),
  );

  // Staff directory for meeting invites (authorized staff only; never students).
  app.get(
    "/api/connect/staff",
    requireAuth,
    requirePermission("connect.meeting.create"),
    route(async (req, res) => {
      if (isStudentOnly(req.user)) return res.json({ users: [] });
      const q = optionalString(req.query.q, "Query", { max: 100 });
      const filter = { isActive: { $ne: false } };
      if (q) filter.$or = [{ firstName: new RegExp(q, "i") }, { lastName: new RegExp(q, "i") }, { email: new RegExp(q, "i") }, { collegeEmail: new RegExp(q, "i") }];
      const users = await (await import("../models/index.js")).User.find(filter)
        .select("_id firstName lastName email collegeEmail roles activeRole")
        .limit(100)
        .lean();
      const staff = users.filter((u) => {
        const roles = (u.roles || []).length ? u.roles : [u.activeRole];
        return !roles.every((r) => r === "student");
      });
      res.json({
        users: staff.map((u) => ({
          id: String(u._id),
          name: `${u.firstName || ""} ${u.lastName || ""}`.trim(),
          email: u.collegeEmail || u.email,
          roles: u.roles || [],
        })),
      });
    }),
  );

  // Regenerate credentials (authorized host/admin only). Plaintext returned once.
  app.post(
    "/api/connect/sessions/:id/credentials/regenerate",
    requireAuth,
    route(async (req, res) => {
      const session = await VirtualSession.findById(requireObjectId(req.params.id, "Session"));
      if (!session) throw notFound("Session not found.");
      if (!canViewSession(session, req.user)) throw notFound("Session not found.");
      // Credential regeneration is an explicitly authorized administrative action,
      // not an everyday host/teacher operation. Credentials persist until an admin
      // resets them or the class is ended/cancelled.
      if (!canManageConnectAdmin(req.user)) throw forbidden("Only an administrator may reset session credentials.");

      const issued = {};
      if (session.sessionType === "ONLINE_CLASS") {
        const studentCred = await issueCredential("student");
        const teacherCred = await issueCredential("teacher");
        session.studentCredential = studentCred.stored;
        session.teacherCredential = teacherCred.stored;
        issued.student = { sessionId16: studentCred.plain.sessionId16, password: studentCred.plain.password };
        issued.teacher = { sessionId16: teacherCred.plain.sessionId16, password: teacherCred.plain.password };
      } else {
        const meetingCred = await issueCredential("meeting");
        session.meetingCredential = meetingCred.stored;
        issued.meeting = { sessionId16: meetingCred.plain.sessionId16, password: meetingCred.plain.password };
      }
      session.audit.push({ action: "CREDENTIALS_REGENERATED", actor: req.user._id || req.user.id });
      await session.save();
      await logAudit({ userId: req.user._id || req.user.id, action: "CONNECT_CREDENTIALS_REGENERATED", module: "connect", resource: "virtual_session", resourceId: String(session._id) });
      res.json({ success: true, issuedCredentials: issued });
    }),
  );

  // Admin-only: retrieve stored credentials (encrypted passwords decryptable server-side).
  // Never regenerate — returns the same valid credentials until reset/revocation.
  app.get(
    "/api/connect/sessions/:id/credentials",
    requireAuth,
    route(async (req, res) => {
      if (!canManageConnectAdmin(req.user)) throw forbidden("Only an administrator may view session credentials.");
      const session = await VirtualSession.findById(requireObjectId(req.params.id, "Session"));
      if (!session) throw notFound("Session not found.");
      if (!canViewSession(session, req.user)) throw notFound("Session not found.");

      const decrypt = (cred) => {
        if (!cred) return null;
        const password = decryptCredentialPassword(cred.encryptedPassword || null);
        return {
          sessionId16: cred.sessionId16,
          password: password || null,
          issuedAt: cred.issuedAt,
          revokedAt: cred.revokedAt,
          active: !cred.revokedAt,
        };
      };

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "CONNECT_CREDENTIALS_VIEWED",
        module: "connect",
        resource: "virtual_session",
        resourceId: String(session._id),
        details: `Administrator viewed classroom access credentials for session ${session.title}.`,
      });

      res.json({
        success: true,
        credentials: {
          student: session.studentCredential ? decrypt(session.studentCredential) : null,
          teacher: session.teacherCredential ? decrypt(session.teacherCredential) : null,
          meeting: session.meetingCredential ? decrypt(session.meetingCredential) : null,
        },
      });
    }),
  );

  // Phase 2: runtime status / config (no secrets).
  app.get(
    "/api/connect/config",
    requireAuth,
    route(async (req, res) => {
      const lk = getLiveKitPublicConfig();
      res.json({
        realtime: { socketPath: "/socket.io", namespace: "/connect" },
        livekit: lk,
      });
    }),
  );

  function ensureConnectRoom(session) {
    if (!session.roomKey) session.roomKey = buildConnectRoomName(session);
    if (!session.mediaProvider) session.mediaProvider = "livekit";
    return session.roomKey;
  }

  // Join: verifies CollegeOS identity + enrollment/invitation + session credential (as applicable).
  app.post(
    "/api/connect/sessions/:id/join",
    requireAuth,
    route(async (req, res) => {
      const session = await VirtualSession.findById(requireObjectId(req.params.id, "Session"));
      const role = authorizeConnectJoin(session, req.user, req.body || {}, { ip: req.ip });

      ensureConnectRoom(session);
      session.audit.push({
        action: "PARTICIPANT_JOIN_REQUESTED",
        actor: req.user._id || req.user.id,
        details: { role, sessionType: session.sessionType },
      });
      if (session.sessionType === "ONLINE_CLASS" && role === "STUDENT") {
        // Minimal join tracking (detailed attendance integration is Phase 3).
        session.attendance = session.attendance || [];
        const uid = String(req.user._id || req.user.id);
        if (!session.attendance.some((a) => String(a.user) === uid && !a.leftAt)) {
          session.attendance.push({ user: req.user._id || req.user.id, joinedAt: new Date(), status: "PRESENT" });
        }
      }
      if (session.sessionType === "ONLINE_MEETING") {
        const uid = String(req.user._id || req.user.id);
        const invite = (session.invitedUsers || []).find((r) => String(r.user) === uid);
        if (invite) { invite.status = "JOINED"; invite.joinedAt = invite.joinedAt || new Date(); }
      }
      await session.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "CONNECT_SESSION_JOINED",
        module: "connect",
        resource: "virtual_session",
        resourceId: String(session._id),
        metadata: { sessionType: session.sessionType, role },
      });

      res.json({
        success: true,
        role,
        session: sanitizeSessionForUser(session, req.user),
        room: { key: session.roomKey, provider: "livekit" },
      });
    }),
  );

  // LiveKit access token — strict authorization enforced before token issuance.
  app.post(
    "/api/connect/sessions/:id/livekit/token",
    requireAuth,
    route(async (req, res) => {
      const session = await VirtualSession.findById(requireObjectId(req.params.id, "Session"));
      const role = authorizeConnectJoin(session, req.user, req.body || {}, { ip: req.ip });
      ensureConnectRoom(session);
      await session.save();

      // Token issuance uses env config; never exposes secret. Will 503 if unconfigured.
      const grant = await createLiveKitAccessToken({ session, user: req.user, role, ttlSeconds: 3600 });

      session.audit.push({
        action: "LIVEKIT_TOKEN_ISSUED",
        actor: req.user._id || req.user.id,
        details: { role, roomName: grant.roomName, expiresInSeconds: grant.expiresInSeconds },
      });
      await session.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "CONNECT_LIVEKIT_TOKEN_ISSUED",
        module: "connect",
        resource: "virtual_session",
        resourceId: String(session._id),
        metadata: { sessionType: session.sessionType, role, roomName: grant.roomName },
      });

      res.json({ success: true, livekit: grant });
    }),
  );

  // Phase 3: collaborative whiteboard state (persisted).
  app.get(
    "/api/connect/sessions/:id/board",
    requireAuth,
    route(async (req, res) => {
      const session = await VirtualSession.findById(requireObjectId(req.params.id, "Session"));
      if (!session) throw notFound("Session not found.");
      if (!canViewSession(session, req.user)) throw notFound("Session not found.");
      let board = await ClassroomBoard.findOne({ session: session._id });
      if (!board) {
        board = await ClassroomBoard.create({ session: session._id, createdBy: req.user._id || req.user.id });
      }
      res.json({ board });
    }),
  );

  app.post(
    "/api/connect/sessions/:id/board/stroke",
    requireAuth,
    route(async (req, res) => {
      const session = await VirtualSession.findById(requireObjectId(req.params.id, "Session"));
      if (!session) throw notFound("Session not found.");
      if (!canViewSession(session, req.user)) throw notFound("Session not found.");
      const board = await ClassroomBoard.findOne({ session: session._id });
      if (!board) throw notFound("Board not found.");
      const role = resolveConnectParticipantRole(session, req.user);
      const canDraw = isMeetingHostOrAdmin(session, req.user) || board.drawingPermission === "all" || role === "TEACHER";
      if (!canDraw) throw forbidden("Drawing not permitted.");
      const page = Number.isInteger(req.body?.page) ? req.body.page : board.currentPage;
      const stroke = req.body?.stroke;
      if (!stroke?.id) throw badRequest("Stroke is required.");
      const target = board.pages.find((p) => p.index === page) || board.pages[0];
      target.strokes.push({ ...stroke, by: req.user._id || req.user.id });
      await board.save();
      res.json({ success: true });
    }),
  );

  app.post(
    "/api/connect/sessions/:id/board/clear",
    requireAuth,
    route(async (req, res) => {
      const session = await VirtualSession.findById(requireObjectId(req.params.id, "Session"));
      if (!session) throw notFound("Session not found.");
      if (!canViewSession(session, req.user)) throw notFound("Session not found.");
      if (!isMeetingHostOrAdmin(session, req.user)) throw forbidden("Not authorized to clear the board.");
      const page = Number.isInteger(req.body?.page) ? req.body.page : null;
      const board = await ClassroomBoard.findOne({ session: session._id });
      if (!board) throw notFound("Board not found.");
      if (page === null) board.pages.forEach((p) => { p.strokes = []; });
      else { const t = board.pages.find((p) => p.index === page); if (t) t.strokes = []; }
      await board.save();
      res.json({ success: true });
    }),
  );

  app.post(
    "/api/connect/sessions/:id/board/page",
    requireAuth,
    route(async (req, res) => {
      const session = await VirtualSession.findById(requireObjectId(req.params.id, "Session"));
      if (!session) throw notFound("Session not found.");
      if (!canViewSession(session, req.user)) throw notFound("Session not found.");
      if (!isMeetingHostOrAdmin(session, req.user)) throw forbidden("Not authorized to manage pages.");
      const board = await ClassroomBoard.findOne({ session: session._id });
      if (!board) throw notFound("Board not found.");
      const action = req.body?.action;
      if (action === "add") {
        const nextIndex = board.pages.length;
        board.pages.push({ index: nextIndex, strokes: [] });
        board.currentPage = nextIndex;
      } else if (action === "set") {
        board.currentPage = Math.max(0, Math.min(board.pages.length - 1, Number(req.body?.page) || 0));
      }
      await board.save();
      res.json({ success: true, currentPage: board.currentPage, pageCount: board.pages.length });
    }),
  );

  app.post(
    "/api/connect/sessions/:id/board/permission",
    requireAuth,
    route(async (req, res) => {
      const session = await VirtualSession.findById(requireObjectId(req.params.id, "Session"));
      if (!session) throw notFound("Session not found.");
      if (!canViewSession(session, req.user)) throw notFound("Session not found.");
      if (!isMeetingHostOrAdmin(session, req.user)) throw forbidden("Not authorized.");
      const board = await ClassroomBoard.findOne({ session: session._id });
      if (!board) throw notFound("Board not found.");
      const perm = req.body?.permission === "all" ? "all" : "teacher";
      board.drawingPermission = perm;
      await board.save();
      res.json({ success: true, permission: perm });
    }),
  );

  // Phase 3: presentation navigation state (metadata only; rendering client-side).
  app.post(
    "/api/connect/sessions/:id/presentation",
    requireAuth,
    route(async (req, res) => {
      const session = await VirtualSession.findById(requireObjectId(req.params.id, "Session"));
      if (!session) throw notFound("Session not found.");
      if (!canViewSession(session, req.user)) throw notFound("Session not found.");
      if (!isMeetingHostOrAdmin(session, req.user)) throw forbidden("Not authorized.");
      session.metadata = session.metadata || {};
      session.metadata.presentation = {
        fileId: req.body?.fileId || null,
        currentPage: Number(req.body?.page) || 1,
        totalPages: Number(req.body?.totalPages) || 1,
        updatedAt: new Date().toISOString(),
      };
      await session.save();
      res.json({ success: true, presentation: session.metadata.presentation });
    }),
  );

  app.post(
    "/api/connect/sessions/:id/board/undo",
    requireAuth,
    route(async (req, res) => {
      const session = await VirtualSession.findById(requireObjectId(req.params.id, "Session"));
      if (!session) throw notFound("Session not found.");
      if (!canViewSession(session, req.user)) throw notFound("Session not found.");
      if (!isMeetingHostOrAdmin(session, req.user)) throw forbidden("Not authorized.");
      const board = await ClassroomBoard.findOne({ session: session._id });
      if (!board) throw notFound("Board not found.");
      const page = Number.isInteger(req.body?.page) ? req.body.page : board.currentPage;
      const opId = req.body?.opId;
      const target = board.pages.find((p) => p.index === page);
      if (target && opId) target.strokes = target.strokes.filter((s) => s.id !== opId);
      await board.save();
      res.json({ success: true });
    }),
  );

  app.post(
    "/api/connect/sessions/:id/leave",
    requireAuth,
    route(async (req, res) => {
      const session = await VirtualSession.findById(requireObjectId(req.params.id, "Session"));
      if (!session) throw notFound("Session not found.");
      if (!canViewSession(session, req.user)) throw notFound("Session not found.");
      const uid = String(req.user._id || req.user.id);
      if (session.sessionType === "ONLINE_CLASS") {
        const row = (session.attendance || []).find((a) => String(a.user) === uid && !a.leftAt);
        if (row) {
          row.leftAt = new Date();
          if (row.joinedAt) row.durationSeconds = Math.max(0, Math.floor((row.leftAt - row.joinedAt) / 1000));
        }
      }
      session.audit.push({ action: "PARTICIPANT_LEFT", actor: req.user._id || req.user.id });
      await session.save();
      await logAudit({ userId: req.user._id || req.user.id, action: "CONNECT_SESSION_LEFT", module: "connect", resource: "virtual_session", resourceId: String(session._id) });
      res.json({ success: true });
    }),
  );

  app.post(
    "/api/connect/sessions/:id/start",
    requireAuth,
    route(async (req, res) => {
      const session = await VirtualSession.findById(requireObjectId(req.params.id, "Session"));
      if (!session) throw notFound("Session not found.");
      if (!canViewSession(session, req.user)) throw notFound("Session not found.");
      if (!isMeetingHostOrAdmin(session, req.user)) throw forbidden("Not authorized to start this session.");
      if (session.status === "LIVE") return res.json({ success: true, session: sanitizeSessionForUser(session, req.user) });
      if (["CANCELLED", "EXPIRED", "COMPLETED", "ENDED"].includes(session.status)) throw conflict("Session cannot be started.");
      ensureConnectRoom(session);
      session.status = "LIVE";
      session.startedAt = session.startedAt || new Date();
      session.actualStartTime = session.actualStartTime || new Date();
      session.audit.push({ action: "SESSION_STARTED", actor: req.user._id || req.user.id });
      await session.save();
      await logAudit({ userId: req.user._id || req.user.id, action: "CONNECT_SESSION_STARTED", module: "connect", resource: "virtual_session", resourceId: String(session._id) });
      try {
        req.app.get("io")?.of("/connect").to(`connect:session:${session._id}`).emit("connect:session:started", {
          sessionId: String(session._id),
          startedAt: session.startedAt,
          by: String(req.user._id || req.user.id),
          at: new Date().toISOString(),
        });
      } catch {}
      res.json({ success: true, session: sanitizeSessionForUser(session, req.user) });
    }),
  );

  app.post(
    "/api/connect/sessions/:id/end",
    requireAuth,
    route(async (req, res) => {
      const session = await VirtualSession.findById(requireObjectId(req.params.id, "Session"));
      if (!session) throw notFound("Session not found.");
      if (!canViewSession(session, req.user)) throw notFound("Session not found.");
      if (!isMeetingHostOrAdmin(session, req.user)) throw forbidden("Not authorized to end this session.");
      const endedAlready = session.status === "COMPLETED" || session.status === "ENDED";
      if (endedAlready) return res.json({ success: true, session: sanitizeSessionForUser(session, req.user), alreadyEnded: true });
      const actualEndTime = new Date();
      session.status = "COMPLETED";
      session.endedAt = actualEndTime;
      session.actualEndTime = actualEndTime;
      if (session.startedAt && session.actualStartTime) {
        session.wasEndedEarly = session.scheduledDate && session.endTime
          ? actualEndTime.getTime() < new Date(`${session.scheduledDate}T${session.endTime}:00`).getTime()
          : false;
      }
      session.endedBy = req.user._id || req.user.id;
      session.terminationReason = req.body?.terminationReason || "ended_by_host";
      // Expire all credentials so the Meeting ID / Password can no longer be used.
      await expireCredentials(session);
      // Close the waiting room: reject every pending admission request.
      for (const request of session.waitingRoomRequests || []) {
        if (String(request.status) === "pending") {
          request.status = "rejected";
          request.decidedAt = session.endedAt;
          request.decidedBy = req.user._id || req.user.id;
        }
      }
      for (const row of session.attendance || []) {
        if (!row.leftAt && row.joinedAt) {
          row.leftAt = session.endedAt;
          row.durationSeconds = Math.max(0, Math.floor((row.leftAt - row.joinedAt) / 1000));
        }
      }
      session.audit.push({ action: "SESSION_ENDED", actor: req.user._id || req.user.id });
      await session.save();
      await logAudit({ userId: req.user._id || req.user.id, action: "CONNECT_SESSION_ENDED", module: "connect", resource: "virtual_session", resourceId: String(session._id) });
      try {
        req.app.get("io")?.of("/connect").to(`connect:session:${session._id}`).emit("connect:session:ended", {
          sessionId: String(session._id),
          endedAt: session.endedAt,
          by: String(req.user._id || req.user.id),
          at: new Date().toISOString(),
        });
      } catch {}
      res.json({ success: true, session: sanitizeSessionForUser(session, req.user), credentialsExpired: true, waitingRoomClosed: true });
    }),
  );

  // Teacher/host configures the student admission policy for an assigned class.
  app.post(
    "/api/connect/sessions/:id/admission-policy",
    requireAuth,
    route(async (req, res) => {
      const session = await VirtualSession.findById(requireObjectId(req.params.id, "Session"));
      if (!session) throw notFound("Session not found.");
      if (!canViewSession(session, req.user)) throw notFound("Session not found.");
      const result = await setAdmissionPolicy(session, req.user, req.body?.policy);
      res.json({ success: true, ...result });
    }),
  );

  // Student requests admission when teacher approval is required.
  app.post(
    "/api/connect/sessions/:id/admission-request",
    requireAuth,
    route(async (req, res) => {
      const session = await VirtualSession.findById(requireObjectId(req.params.id, "Session"));
      if (!session) throw notFound("Session not found.");
      if (!canViewSession(session, req.user)) throw notFound("Session not found.");
      const request = await requestAdmission(session, req.user);
      res.json({ success: true, request });
    }),
  );

  // Teacher/host views pending and decided waiting-room requests.
  app.get(
    "/api/connect/sessions/:id/waiting-room",
    requireAuth,
    route(async (req, res) => {
      const session = await VirtualSession.findById(requireObjectId(req.params.id, "Session"));
      if (!session) throw notFound("Session not found.");
      if (!canViewSession(session, req.user)) throw notFound("Session not found.");
      const result = getWaitingRoomRequests(session, req.user);
      res.json({ success: true, ...result });
    }),
  );

  // Teacher/host approves a waiting-room admission request.
  app.post(
    "/api/connect/sessions/:id/waiting-room/:requestId/approve",
    requireAuth,
    route(async (req, res) => {
      const session = await VirtualSession.findById(requireObjectId(req.params.id, "Session"));
      if (!session) throw notFound("Session not found.");
      if (!canViewSession(session, req.user)) throw notFound("Session not found.");
      const request = await decideAdmission(session, req.params.requestId, req.user, "approve");
      res.json({ success: true, request });
    }),
  );

  // Teacher/host rejects a waiting-room admission request.
  app.post(
    "/api/connect/sessions/:id/waiting-room/:requestId/reject",
    requireAuth,
    route(async (req, res) => {
      const session = await VirtualSession.findById(requireObjectId(req.params.id, "Session"));
      if (!session) throw notFound("Session not found.");
      if (!canViewSession(session, req.user)) throw notFound("Session not found.");
      const request = await decideAdmission(session, req.params.requestId, req.user, "reject");
      res.json({ success: true, request });
    }),
  );

  // Administrator explicitly cancels / revokes a session and invalidates credentials.
  app.post(
    "/api/connect/sessions/:id/cancel",
    requireAuth,
    route(async (req, res) => {
      const session = await VirtualSession.findById(requireObjectId(req.params.id, "Session"));
      if (!session) throw notFound("Session not found.");
      if (!canViewSession(session, req.user)) throw notFound("Session not found.");
      if (!canManageConnectAdmin(req.user)) throw forbidden("Only an administrator may cancel or revoke a session.");
      if (["CANCELLED", "COMPLETED", "EXPIRED"].includes(session.status)) {
        return res.json({ success: true, session: sanitizeSessionForUser(session, req.user), alreadyTerminal: true });
      }
      session.status = "CANCELLED";
      session.endedAt = session.endedAt || new Date();
      await expireCredentials(session);
      for (const request of session.waitingRoomRequests || []) {
        if (String(request.status) === "pending") {
          request.status = "rejected";
          request.decidedAt = session.endedAt;
          request.decidedBy = req.user._id || req.user.id;
        }
      }
      session.audit.push({ action: "SESSION_CANCELLED", actor: req.user._id || req.user.id });
      await session.save();
      await logAudit({ userId: req.user._id || req.user.id, action: "CONNECT_SESSION_CANCELLED", module: "connect", resource: "virtual_session", resourceId: String(session._id) });
      res.json({ success: true, session: sanitizeSessionForUser(session, req.user), credentialsExpired: true, waitingRoomClosed: true });
    }),
  );

  // Mark a never-started session as Expired (admin action). Sessions already started
  // cannot expire; this is a safety boundary, not an automatic scheduler.
  app.post(
    "/api/connect/sessions/:id/expire",
    requireAuth,
    route(async (req, res) => {
      const session = await VirtualSession.findById(requireObjectId(req.params.id, "Session"));
      if (!session) throw notFound("Session not found.");
      if (!canViewSession(session, req.user)) throw notFound("Session not found.");
      if (!canManageConnectAdmin(req.user)) throw forbidden("Only an administrator may expire a session.");
      if (session.status === "LIVE" || session.status === "COMPLETED") {
        return res.json({ success: true, session: sanitizeSessionForUser(session, req.user), alreadyTerminal: true });
      }
      if (["CANCELLED", "EXPIRED"].includes(session.status)) {
        return res.json({ success: true, session: sanitizeSessionForUser(session, req.user), alreadyTerminal: true });
      }
      const now = new Date();
      const scheduledEndMs = session.scheduledDate && session.endTime
        ? Date.parse(`${session.scheduledDate}T${session.endTime}:00`)
        : null;
      if (scheduledEndMs && now.getTime() < scheduledEndMs) {
        throw conflict("Cannot expire a session before its scheduled end time.");
      }
      session.status = "EXPIRED";
      session.endedAt = now;
      session.actualEndTime = now;
      session.endedBy = req.user._id || req.user.id;
      session.terminationReason = "expired_never_started";
      await expireCredentials(session);
      for (const request of session.waitingRoomRequests || []) {
        if (String(request.status) === "pending") {
          request.status = "rejected";
          request.decidedAt = now;
          request.decidedBy = req.user._id || req.user.id;
        }
      }
      session.audit.push({ action: "SESSION_EXPIRED", actor: req.user._id || req.user.id });
      await session.save();
      await logAudit({ userId: req.user._id || req.user.id, action: "CONNECT_SESSION_EXPIRED", module: "connect", resource: "virtual_session", resourceId: String(session._id) });
      try {
        req.app.get("io")?.of("/connect").to(`connect:session:${session._id}`).emit("connect:session:expired", {
          sessionId: String(session._id),
          expiredAt: now,
          by: String(req.user._id || req.user.id),
          at: now.toISOString(),
        });
      } catch {}
      res.json({ success: true, session: sanitizeSessionForUser(session, req.user), credentialsExpired: true });
    }),
  );
}
