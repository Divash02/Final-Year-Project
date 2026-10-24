import {
  Timetable,
  Course,
  User,
  Student,
  Section,
  Room,
  Enrollment,
} from "../models/index.js";
import { logAudit, getUserRoles } from "../db.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { route, notFound, forbidden, conflict, validationError } from "../utils/apiError.js";
import {
  requireString,
  optionalString,
  optionalEnum,
  toInt,
  requireIsoDate,
  optionalTime,
  requireObjectId,
} from "../utils/validate.js";
import { hasPermission } from "../permissions/catalog.js";
import {
  detectSessionConflicts,
  hasAnyConflict,
  describeConflicts,
  startTimetableSession,
  dayIndexFromName,
  toMinutes,
} from "../services/timetableConflicts.js";
import {
  recordTimetableChange,
  notifyTimetableConflict,
} from "../services/timetableChanges.js";

const SESSION_TYPES = [
  "REGULAR_CLASS",
  "LAB",
  "TUTORIAL",
  "EXAM",
  "WORKSHOP",
  "SEMINAR",
  "OTHER",
];
const SESSION_STATUSES = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

const DEFAULT_ACADEMIC_YEAR =
  process.env.COLLEGEOS_DEFAULT_ACADEMIC_YEAR || "2025/2026";

/**
 * Timetable & Sessions.
 *
 * The timetable is a real record set, not a static grid. A session is validated
 * against teacher, room and cohort conflicts on the server, has a lifecycle
 * (scheduled → in progress → completed, or cancelled), and a teacher starting a
 * class links it to the attendance architecture instead of creating a second,
 * disconnected class record.
 */
export function registerTimetableRoutes(app) {
  app.get(
    "/api/timetable",
    requireAuth,
    route(async (req, res) => {
      const filter = {};

      const academicYear = optionalString(req.query.academicYear, "Academic year", { max: 20 });
      if (academicYear) filter.academicYear = academicYear;
      const program = optionalString(req.query.program, "Programme", { max: 40 });
      if (program) filter.program = program.toUpperCase();
      const batch = optionalString(req.query.batch, "Batch", { max: 20 });
      if (batch) filter.batch = batch;
      const semester = req.query.semester ? toInt(req.query.semester, "Semester", { min: 1, max: 12 }) : null;
      if (semester) filter.semester = semester;
      const section = optionalString(req.query.section, "Section", { max: 10 });
      if (section) filter.sectionCode = section.toUpperCase();
      const courseId = optionalString(req.query.courseId, "Course", { max: 40 });
      if (courseId) filter.course = requireObjectId(courseId, "Course");
      const room = optionalString(req.query.room, "Room", { max: 80 });
      if (room) filter.room = new RegExp(`^${escapeRegExp(room)}$`, "i");
      const teacherId = optionalString(req.query.teacherId, "Teacher", { max: 40 });
      if (teacherId) filter.facultyUser = requireObjectId(teacherId, "Teacher");
      const day = optionalString(req.query.day, "Day", { max: 20 });
      if (day) filter.scheduledDay = normaliseDay(day);
      const from = optionalString(req.query.from, "From date", { max: 10 });
      const to = optionalString(req.query.to, "To date", { max: 10 });
      if (from) filter.date = { ...(filter.date || {}), $gte: requireIsoDate(from, "From date") };
      if (to) filter.date = { ...(filter.date || {}), $lte: requireIsoDate(to, "To date") };
      if (String(req.query.includeArchived || "") !== "true") filter.archivedAt = null;

      // Scope from the session user: a student only ever sees their own
      // cohort's timetable, a teacher their own sessions unless they ask for
      // the whole institution view they are entitled to.
      const scope = String(req.query.scope || "auto").toLowerCase();
      const roles = getUserRoles(req.user);
      const canSeeInstitution = roles.some((role) =>
        ["super_admin", "dean", "hod", "registrar", "program_coordinator", "campus_admin", "exam_officer"].includes(role),
      );

      if (!canSeeInstitution || scope === "mine") {
        if (roles.includes("student") || roles.includes("parent")) {
          const student = await Student.findOne({ user: req.user._id || req.user.id })
            .select("program batch semester section");
          if (!student) {
            res.json({ timetable: [] });
            return;
          }
          filter.program = filter.program || (student.program || undefined);
          filter.batch = filter.batch || (student.batch || undefined);
          filter.semester = filter.semester || student.semester;
          filter.sectionCode = filter.sectionCode || (student.section || undefined);
        } else if (scope === "mine") {
          filter.facultyUser = req.user._id || req.user.id;
        }
      }

      const sessions = await Timetable.find(filter)
        .populate("course", "code name")
        .populate("facultyUser", "firstName lastName")
        .populate("attendanceSession", "status openedAt closedAt")
        .sort({ scheduledDay: 1, startTime: 1 })
        .limit(500)
        .lean();

      res.json({ timetable: sessions.map(serialiseSession) });
    }),
  );

  /** Filter options, from real records only. */
  app.get(
    "/api/timetable/filters",
    requireAuth,
    route(async (req, res) => {
      const [courses, sections, rooms, teachers, years] = await Promise.all([
        Course.find({ status: "ACTIVE" }).select("code name program semester").sort({ code: 1 }).lean(),
        Section.find().select("code program semester batch").sort({ code: 1 }).lean(),
        Room.find({ isActive: { $ne: false } }).select("building roomNumber name capacity").sort({ building: 1, roomNumber: 1 }).lean(),
        User.find({ roles: { $in: ["faculty", "hod", "program_coordinator"] } })
          .select("firstName lastName")
          .sort({ firstName: 1 })
          .lean(),
        Timetable.distinct("academicYear"),
      ]);

      res.json({
        filters: {
          academicYears: years.filter(Boolean).sort().reverse(),
          programs: Array.from(new Set(sections.map((row) => row.program).filter(Boolean))).sort(),
          batchYears: Array.from(new Set(sections.map((row) => row.batch).filter(Boolean))).sort(),
          semesters: Array.from(new Set(sections.map((row) => row.semester).filter(Boolean))).sort((a, b) => a - b),
          sectionCodes: Array.from(new Set(sections.map((row) => row.code))).sort(),
          sessionTypes: SESSION_TYPES,
          statuses: SESSION_STATUSES,
          days: [
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
          ],
          courses: courses.map((course) => ({
            id: String(course._id),
            code: course.code,
            name: course.name,
          })),
          rooms: rooms.map((room) => ({
            label: `${room.building} · ${room.roomNumber}`,
            name: room.name,
            capacity: room.capacity,
          })),
          teachers: teachers.map((teacher) => ({
            id: String(teacher._id),
            name: `${teacher.firstName || ""} ${teacher.lastName || ""}`.trim(),
          })),
          defaultAcademicYear: DEFAULT_ACADEMIC_YEAR,
        },
      });
    }),
  );

  /**
   * Pre-flight conflict check used by the form to warn before saving.
   * The same detection runs again on write, so this is a convenience, not the
   * enforcement point.
   */
  app.post(
    "/api/timetable/check-conflicts",
    requireAuth,
    requirePermission("timetable.manage"),
    route(async (req, res) => {
      const candidate = readSessionPayload(req.body || {});
      const conflicts = await detectSessionConflicts(candidate, {
        excludeId: req.body?.id ? requireObjectId(req.body.id, "Session") : null,
      });
      res.json({
        conflicts,
        hasConflicts: hasAnyConflict(conflicts),
        message: hasAnyConflict(conflicts) ? describeConflicts(conflicts) : null,
      });
    }),
  );

  app.get(
    "/api/timetable/:id",
    requireAuth,
    requirePermission("timetable.manage"),
    route(async (req, res) => {
      const session = await loadSession(req.params.id);
      res.json({ session: serialiseSession(session) });
    }),
  );

  app.post(
    "/api/timetable",
    requireAuth,
    requirePermission("timetable.manage"),
    route(async (req, res) => {
      const payload = readSessionPayload(req.body || {});
      await assertTeacherExists(payload.facultyUser);
      await assertSectionExists(payload);

      const conflicts = await detectSessionConflicts(payload);
      if (hasAnyConflict(conflicts) && !mayOverride(req)) {
        throw conflict(describeConflicts(conflicts), { conflicts });
      }

      const session = await Timetable.create({
        ...payload,
        createdBy: req.user._id || req.user.id,
      });

      await logAudit({
        userId: req.user._id || req.user.id,
        action: conflicts && hasAnyConflict(conflicts)
          ? "TIMETABLE_SESSION_CREATED_WITH_OVERRIDE"
          : "TIMETABLE_SESSION_CREATED",
        module: "timetable",
        resource: "timetable_session",
        resourceId: session._id.toString(),
        newValue: {
          course: String(session.course),
          sectionCode: session.sectionCode,
          scheduledDay: session.scheduledDay,
          startTime: session.startTime,
          endTime: session.endTime,
          room: session.room,
        },
        details: `Timetable session created: ${session.sectionCode}, ${session.scheduledDay} ${session.startTime}–${session.endTime}.`,
        metadata: { conflicts },
      });

      if (hasAnyConflict(conflicts) && mayOverride(req)) {
        // The override that let this session in is exactly the case
        // where a teacher needs to know: they will walk into a room
        // that is already occupied, or teach a class that is already
        // booked, without having asked for it.
        const clashing = [].concat(
          conflicts.teacher,
          conflicts.room,
          conflicts.cohort,
        );
        await notifyTimetableConflict({
          session,
          conflicts: clashing,
          otherSessionId: clashing[0]?.id || null,
        });
      }

      res.status(201).json({ session: serialiseSession(session.toObject()) });
    }),
  );

  app.patch(
    "/api/timetable/:id",
    requireAuth,
    route(async (req, res) => {
      const session = await loadSession(req.params.id);

      /**
       * The academic office manages the timetable; the teacher who
       * holds a class may adjust that class itself. The change trail
       * records who made the edit either way, and a teacher is never
       * notified about their own change.
       */
      const actorId = String(req.user._id || req.user.id);
      const ownerId = String(session.facultyUser?._id || session.facultyUser || "");
      const canManage = hasPermission(getUserRoles(req.user), "timetable.manage");
      if (ownerId !== actorId && !canManage) {
        throw forbidden(
          "Only the assigned teacher or the academic office can change this class.",
        );
      }

      // `loadSession` populates course and facultyUser; the write path
      // needs the raw ids, never the populated documents.
      const rawCourseId = String(session.course?._id || session.course || "");
      const rawFacultyId = String(session.facultyUser?._id || session.facultyUser || "");

      const before = {
        scheduledDay: session.scheduledDay,
        date: session.date || null,
        startTime: session.startTime,
        endTime: session.endTime,
        room: session.room,
        building: session.building,
        sectionCode: session.sectionCode,
        status: session.status,
        facultyUser: rawFacultyId,
        sessionType: session.sessionType,
        notes: session.notes || "",
      };

      const merged = readSessionPayload({
        scheduledDay: session.scheduledDay,
        date: session.date || undefined,
        startTime: session.startTime,
        endTime: session.endTime,
        room: session.room,
        building: session.building,
        facultyUser: rawFacultyId,
        course: rawCourseId,
        sectionCode: session.sectionCode,
        semester: session.semester,
        batch: session.batch || undefined,
        academicYear: session.academicYear,
        program: session.program || undefined,
        sessionType: session.sessionType,
        notes: session.notes,
        ...req.body,
      });

      await assertTeacherExists(merged.facultyUser);
      await assertSectionExists(merged);

      const conflicts = await detectSessionConflicts(merged, { excludeId: session._id });
      if (hasAnyConflict(conflicts) && !mayOverride(req)) {
        throw conflict(describeConflicts(conflicts), { conflicts });
      }

      Object.assign(session, merged, { updatedBy: req.user._id || req.user.id });
      await session.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "TIMETABLE_SESSION_UPDATED",
        module: "timetable",
        resource: "timetable_session",
        resourceId: session._id.toString(),
        oldValue: before,
        newValue: {
          scheduledDay: session.scheduledDay,
          startTime: session.startTime,
          endTime: session.endTime,
          room: session.room,
          sectionCode: session.sectionCode,
        },
        details: `Timetable session updated for section ${session.sectionCode}.`,
        metadata: { conflicts },
      });

      const updated = await loadSession(String(session._id));

      /**
       * Record the change, then tell the teacher.
       *
       * This runs after the save and after the audit row, so the trail can only ever
       * describe a change the schedule actually made. A class that was rescheduled
       * with an override may now clash, and the teacher holding it is the person who
       * walks into that room — so they are told about the clash too, rather than
       * discovering it on the day.
       */
      const announcement = await recordTimetableChange({
        session: updated,
        before,
        actor: req.user,
        reason: optionalString(req.body?.reason, "Reason", { max: 500 }) || "",
      });

      if (hasAnyConflict(conflicts) && mayOverride(req)) {
        // The override that let this save through is exactly the case where a teacher
        // needs to know: they will walk into a room that is already occupied, or teach
        // a class that is already booked, without having asked for it.
        const clashing = [].concat(conflicts.teacher, conflicts.room, conflicts.cohort);
        const alerted = await notifyTimetableConflict({
          session: updated,
          conflicts: clashing,
          otherSessionId: clashing[0]?.id || null,
        });
        if (alerted) announcement.notified.push("conflict");
      }

      res.json({
        session: serialiseSession(updated),
        changes: announcement.changes || [],
        notified: announcement.notified,
      });
    }),
  );

  /** Cancels a session, keeping it in the record for institutional history. */
  app.post(
    "/api/timetable/:id/cancel",
    requireAuth,
    requirePermission("timetable.manage"),
    route(async (req, res) => {
      const session = await loadSession(req.params.id);
      // `loadSession` populates facultyUser; the change trail needs the
      // raw id so the previous holder is a real account, not a document.
      const rawFacultyId = String(session.facultyUser?._id || session.facultyUser || "");
      const before = {
        status: session.status,
        scheduledDay: session.scheduledDay,
        date: session.date || null,
        startTime: session.startTime,
        endTime: session.endTime,
        room: session.room,
        building: session.building,
        sectionCode: session.sectionCode,
        facultyUser: rawFacultyId,
        sessionType: session.sessionType,
        notes: session.notes || "",
      };
      session.status = "CANCELLED";
      session.cancellationReason =
        optionalString(req.body?.reason, "Cancellation reason", { max: 500 }) || null;
      session.cancelledAt = new Date();
      session.cancelledBy = req.user._id || req.user.id;
      session.updatedBy = req.user._id || req.user.id;
      await session.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "TIMETABLE_SESSION_CANCELLED",
        module: "timetable",
        resource: "timetable_session",
        resourceId: session._id.toString(),
        oldValue: { status: before.status },
        newValue: { status: "CANCELLED", reason: session.cancellationReason },
        details: `Timetable session cancelled: ${session.sectionCode}, ${session.scheduledDay} ${session.startTime}.`,
      });

      const updated = await loadSession(String(session._id));

      // A cancelled class is the change most likely to make a teacher's plan wrong,
      // so it carries the reason in the trail as well as in the notification body.
      const announcement = await recordTimetableChange({
        session: updated,
        before,
        actor: req.user,
        reason: session.cancellationReason || "",
        extraFields: session.cancellationReason
          ? [
              {
                field: "cancellationReason",
                label: "Cancellation reason",
                from: null,
                to: session.cancellationReason,
              },
            ]
          : [],
      });

      res.json({
        success: true,
        session: serialiseSession(updated),
        changes: announcement.changes || [],
        notified: announcement.notified,
      });
    }),
  );

  /**
   * Starts the class: the session becomes in progress and is connected to an
   * attendance session for the same course, section, date and time, so the
   * teacher can take attendance for this exact class.
   */
  app.post(
    "/api/timetable/:id/start",
    requireAuth,
    requirePermission("attendance.session.create"),
    route(async (req, res) => {
      const session = await loadSession(req.params.id);
      const roles = getUserRoles(req.user);
      const isOwner = String(session.facultyUser?._id || session.facultyUser) ===
        String(req.user._id || req.user.id);
      const canManage = roles.some((role) => ["super_admin", "dean", "hod", "registrar"].includes(role));
      if (!isOwner && !canManage) {
        throw forbidden("Only the assigned teacher can start this class session.");
      }
      if (session.status === "CANCELLED") {
        throw conflict("A cancelled session cannot be started.");
      }

      const attendanceSession = await startTimetableSession(session, req.user._id || req.user.id);

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "TIMETABLE_SESSION_STARTED",
        module: "timetable",
        resource: "timetable_session",
        resourceId: session._id.toString(),
        details: `Class session started and linked to attendance session ${attendanceSession._id}.`,
      });

      const updated = await loadSession(String(session._id));
      res.json({ session: serialiseSession(updated), attendanceSessionId: String(attendanceSession._id) });
    }),
  );

  app.post(
    "/api/timetable/:id/complete",
    requireAuth,
    requirePermission("attendance.session.close"),
    route(async (req, res) => {
      const session = await loadSession(req.params.id);
      const roles = getUserRoles(req.user);
      const isOwner = String(session.facultyUser?._id || session.facultyUser) ===
        String(req.user._id || req.user.id);
      const canManage = roles.some((role) => ["super_admin", "dean", "hod", "registrar"].includes(role));
      if (!isOwner && !canManage) {
        throw forbidden("Only the assigned teacher can complete this class session.");
      }

      session.status = "COMPLETED";
      session.updatedBy = req.user._id || req.user.id;
      await session.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "TIMETABLE_SESSION_COMPLETED",
        module: "timetable",
        resource: "timetable_session",
        resourceId: session._id.toString(),
        details: `Class session marked completed: ${session.sectionCode}, ${session.scheduledDay} ${session.startTime}.`,
      });

      const updated = await loadSession(String(session._id));
      res.json({ success: true, session: serialiseSession(updated) });
    }),
  );

  app.delete(
    "/api/timetable/:id",
    requireAuth,
    requirePermission("timetable.manage"),
    route(async (req, res) => {
      const session = await loadSession(req.params.id);
      session.archivedAt = new Date();
      session.archivedBy = req.user._id || req.user.id;
      session.updatedBy = req.user._id || req.user.id;
      await session.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "TIMETABLE_SESSION_ARCHIVED",
        module: "timetable",
        resource: "timetable_session",
        resourceId: session._id.toString(),
        details: `Timetable session archived: ${session.sectionCode}, ${session.scheduledDay} ${session.startTime}.`,
      });

      res.json({ success: true, session: serialiseSession(session) });
    }),
  );

/**
   * Publish lifecycle actions.
   *
   * A timetable session is created as a Draft and only becomes visible to
   * students once it is Published. The publish endpoint runs the conflict
   * engine again so a schedule cannot be published while it still double-books
   * a teacher, a room or a cohort.
   */
  app.post(
    "/api/timetable/:id/publish",
    requireAuth,
    requirePermission("timetable.manage"),
    route(async (req, res) => {
      const session = await loadSession(req.params.id);
      if (session.lifecycleState === "PUBLISHED") {
        throw conflict("This timetable session is already published.");
      }
      if (session.archivedAt) {
        throw conflict("An archived timetable session cannot be published.");
      }

      const candidate = serialiseSession(session);
      const conflicts = await detectSessionConflicts(candidate, { excludeId: session._id });
      if (hasAnyConflict(conflicts) && !mayOverride(req)) {
        throw conflict(describeConflicts(conflicts), { conflicts });
      }

      const reason = optionalString(req.body?.reason, "Reason", { max: 500 }) || null;
      session.lifecycleState = "PUBLISHED";
      session.publishedAt = new Date();
      session.publishedBy = req.user._id || req.user.id;
      session.publishReason = reason;
      if (!session.effectiveFrom) session.effectiveFrom = session.date || null;
      session.updatedBy = req.user._id || req.user.id;
      await session.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "TIMETABLE_SESSION_PUBLISHED",
        module: "timetable",
        resource: "timetable_session",
        resourceId: session._id.toString(),
        oldValue: { lifecycleState: "DRAFT" },
        newValue: { lifecycleState: "PUBLISHED", publishedAt: session.publishedAt, reason },
        details: `Timetable session published: ${session.sectionCode}, ${session.scheduledDay} ${session.startTime}–${session.endTime}.`,
      });

      const updated = await loadSession(String(session._id));
      res.json({ session: serialiseSession(updated) });
    }),
  );

  app.post(
    "/api/timetable/:id/unpublish",
    requireAuth,
    requirePermission("timetable.manage"),
    route(async (req, res) => {
      const session = await loadSession(req.params.id);
      if (session.lifecycleState !== "PUBLISHED") {
        throw conflict("This timetable session is not published.");
      }
      session.lifecycleState = "APPROVED";
      session.publishedAt = null;
      session.publishedBy = null;
      session.updatedBy = req.user._id || req.user.id;
      await session.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "TIMETABLE_SESSION_UNPUBLISHED",
        module: "timetable",
        resource: "timetable_session",
        resourceId: session._id.toString(),
        details: `Timetable session unpublished: ${session.sectionCode}, ${session.scheduledDay} ${session.startTime}–${session.endTime}.`,
      });

      const updated = await loadSession(String(session._id));
      res.json({ session: serialiseSession(updated) });
    }),
  );

  /**
   * Versioning. A published schedule is replaced rather than deleted: the old
   * version stays in the record for audit and historical timetables, and the
   * new version becomes the one students see once it is published.
   */
  app.post(
    "/api/timetable/:id/version",
    requireAuth,
    requirePermission("timetable.manage"),
    route(async (req, res) => {
      const session = await loadSession(req.params.id);
      const wasPublished = session.lifecycleState === "PUBLISHED";

      const merged = readSessionPayload({
        scheduledDay: session.scheduledDay,
        date: session.date || undefined,
        startTime: session.startTime,
        endTime: session.endTime,
        room: session.room,
        building: session.building,
        facultyUser: String(session.facultyUser?._id || session.facultyUser || ""),
        course: String(session.course?._id || session.course || ""),
        sectionCode: session.sectionCode,
        semester: session.semester,
        batch: session.batch || undefined,
        academicYear: session.academicYear,
        program: session.program || undefined,
        sessionType: session.sessionType,
        notes: session.notes,
        ...req.body,
      });

      await assertTeacherExists(merged.facultyUser);
      await assertSectionExists(merged);

      const conflicts = await detectSessionConflicts(merged, { excludeId: session._id });
      if (hasAnyConflict(conflicts) && !mayOverride(req)) {
        throw conflict(describeConflicts(conflicts), { conflicts });
      }

      const previousVersion = session.version || 1;
      session.version = previousVersion + 1;
      Object.assign(session, merged, { updatedBy: req.user._id || req.user.id });
      if (wasPublished) session.lifecycleState = "APPROVED";
      session.effectiveFrom = optionalString(req.body?.effectiveFrom, "Effective from", { max: 10 }) || session.effectiveFrom;
      session.effectiveTo = optionalString(req.body?.effectiveTo, "Effective to", { max: 10 }) || session.effectiveTo;
      session.publishReason = optionalString(req.body?.reason, "Reason", { max: 500 }) || session.publishReason;
      await session.save();

      await logAudit({
        userId: req.user._id || req.user.id,
        action: "TIMETABLE_SESSION_VERSIONED",
        module: "timetable",
        resource: "timetable_session",
        resourceId: session._id.toString(),
        oldValue: { version: previousVersion },
        newValue: { version: session.version, lifecycleState: session.lifecycleState },
        details: `Timetable session versioned ${previousVersion} → ${session.version} for section ${session.sectionCode}.`,
      });

      const updated = await loadSession(String(session._id));
      res.json({ session: serialiseSession(updated), previousVersion });
    }),
  );

  /**
   * Students of a session's cohort, used to show who a session affects and to
   * give teachers the class list for the session.
   */
  app.get(
    "/api/timetable/:id/cohort",
    requireAuth,
    route(async (req, res) => {
      const session = await loadSession(req.params.id);
      const enrolments = await Enrollment.find({
        course: session.course?._id || session.course,
        sectionCode: session.sectionCode,
        semester: session.semester,
        status: "ENROLLED",
      })
        .select("student")
        .lean();

      const students = await Student.find({
        _id: { $in: enrolments.map((row) => row.student) },
      })
        .select("studentId firstName lastName section")
        .sort({ studentId: 1 })
        .lean();

      res.json({
        cohort: students.map((student) => ({
          studentId: student.studentId,
          name: `${student.firstName} ${student.lastName}`.trim(),
          section: student.section,
        })),
      });
    }),
  );
}

function mayOverride(req) {
  if (req.body?.override !== true && req.body?.override !== "true") return false;
  return hasPermission(getUserRoles(req.user), "timetable.override");
}

async function loadSession(identifier) {
  const session = await Timetable.findById(requireObjectId(identifier, "Session"))
    .populate("course", "code name")
    .populate("facultyUser", "firstName lastName roles")
    .populate("attendanceSession", "status openedAt closedAt")
    .populate("roomRef", "building roomNumber name");
  if (!session) throw notFound("Timetable session not found.");
  return session;
}

async function assertTeacherExists(facultyUserId) {
  const teacher = await User.findById(facultyUserId).select("_id roles");
  if (!teacher) throw notFound("Teacher not found.");
  const roles = teacher.roles || [];
  if (!roles.some((role) => ["faculty", "hod", "program_coordinator", "dean", "super_admin"].includes(role))) {
    throw validationError("The selected account does not teach classes.", [
      { field: "facultyUser", message: "Choose a teaching account." },
    ]);
  }
}

/**
 * A section must exist for the cohort being scheduled, so a timetable entry can
 * never point at a cohort the student directory has never heard of.
 */
async function assertSectionExists(payload) {
  const section = await Section.findOne({
    code: payload.sectionCode,
    semester: payload.semester,
    ...(payload.program ? { program: payload.program } : {}),
  }).select("_id");
  if (!section) {
    throw validationError(
      `Section ${payload.sectionCode} does not exist for semester ${payload.semester}. Create the section first so students can be enrolled in it.`,
      [{ field: "sectionCode", message: "Unknown section for this semester." }],
    );
  }
}

/** Validates and normalises a timetable session payload. */
export function readSessionPayload(body) {
  const startTime = optionalTime(body.startTime, "Start time") || requireString(body.startTime, "Start time", { max: 5 });
  const endTime = optionalTime(body.endTime, "End time") || requireString(body.endTime, "End time", { max: 5 });
  if (toMinutes(endTime) <= toMinutes(startTime)) {
    throw validationError("The end time must be after the start time.", [
      { field: "endTime", message: "Choose a later end time." },
    ]);
  }

  const date = body.date ? requireIsoDate(body.date, "Date") : null;
  const scheduledDay = body.scheduledDay
    ? normaliseDay(body.scheduledDay)
    : dayFromIsoDate(date);
  if (!scheduledDay) {
    throw validationError("Choose the weekday this session runs on.", [
      { field: "scheduledDay", message: "A weekday is required." },
    ]);
  }

  return {
    course: requireObjectId(body.course, "Course"),
    facultyUser: requireObjectId(body.facultyUser, "Teacher"),
    program: optionalString(body.program, "Programme", { max: 40 })?.toUpperCase() || null,
    batch: optionalString(body.batch, "Batch", { max: 20 }),
    semester: toInt(body.semester, "Semester", { min: 1, max: 12 }),
    sectionCode: requireString(body.sectionCode, "Section", { max: 10 }).toUpperCase(),
    room: optionalString(body.room, "Room", { max: 80 }),
    building: optionalString(body.building, "Building", { max: 80 }),
    date,
    scheduledDay,
    academicYear:
      optionalString(body.academicYear, "Academic year", { max: 20 }) || DEFAULT_ACADEMIC_YEAR,
    startTime,
    endTime,
    sessionType: optionalEnum(body.sessionType, "Session type", SESSION_TYPES, { upper: true }) || "REGULAR_CLASS",
    notes: optionalString(body.notes, "Notes", { max: 1000 }) || "",
  };
}

function normaliseDay(value) {
  const text = String(value || "").trim();
  const matched = text.toLowerCase();
  const canonical = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ].find((day) => day.toLowerCase() === matched);
  if (!canonical) {
    throw validationError("Choose a valid weekday.", [
      { field: "scheduledDay", message: "Sunday to Saturday." },
    ]);
  }
  return canonical;
}

function dayFromIsoDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ][date.getUTCDay()];
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function serialiseSession(session) {
  const course = session.course && typeof session.course === "object" ? session.course : null;
  const teacher = session.facultyUser && typeof session.facultyUser === "object"
    ? session.facultyUser
    : null;
  const attendance = session.attendanceSession && typeof session.attendanceSession === "object"
    ? session.attendanceSession
    : null;

  return {
    id: String(session._id),
    _id: String(session._id),
    courseId: String(course?._id || session.course || ""),
    courseCode: course?.code || null,
    courseName: course?.name || null,
    facultyUserId: String(teacher?._id || session.facultyUser || ""),
    facultyName: teacher
      ? `${teacher.firstName || ""} ${teacher.lastName || ""}`.trim()
      : null,
    program: session.program || null,
    batch: session.batch || null,
    semester: session.semester ?? null,
    sectionCode: session.sectionCode,
    room: session.room || null,
    building: session.building || null,
    date: session.date || null,
    scheduledDay: session.scheduledDay,
    dayIndex: dayIndexFromName(session.scheduledDay),
    academicYear: session.academicYear,
    startTime: session.startTime,
    endTime: session.endTime,
    sessionType: session.sessionType,
    status: session.status,
    lifecycleState: session.lifecycleState || "DRAFT",
    version: session.version || 1,
    publishedAt: session.publishedAt || null,
    publishedBy: session.publishedBy ? String(session.publishedBy) : null,
    approvedAt: session.approvedAt || null,
    effectiveFrom: session.effectiveFrom || null,
    effectiveTo: session.effectiveTo || null,
    publishReason: session.publishReason || null,
    notes: session.notes || "",
    attendanceSessionId: attendance ? String(attendance._id) : null,
    attendanceStatus: attendance?.status || null,
    archived: Boolean(session.archivedAt),
    createdAt: session.createdAt || null,
    updatedAt: session.updatedAt || null,
  };
}

export { serialiseSession };
