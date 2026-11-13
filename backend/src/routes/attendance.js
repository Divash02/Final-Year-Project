import { createHash, randomBytes } from "node:crypto";
import { getUserRoles, logAudit } from "../db.js";
import {
  Student,
  Course,
  Section,
  Enrollment,
  CourseTeachingAssignment,
  FacultySubjectAssignment,
  Attendance,
  AttendanceSession,
  ATTENDANCE_STATUSES,
  ATTENDING_STATUSES,
  CLASS_TYPES,
} from "../models/index.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { getInstitutionTimeZone } from "../services/academicClock.js";

/**
 * Roles that may deliver or administer attendance institution-wide. Everyone
 * else must hold a course teaching assignment for the course/section they act
 * on. Students never appear here: they have no attendance-write permission.
 */
const STAFF_ATTENDANCE_ROLES = new Set([
  "super_admin",
  "campus_admin",
  "dean",
  "hod",
  "registrar",
  "exam_officer",
]);

const QR_TOKEN_TTL_MS = 30 * 1000;
const MIN_CORRECTION_REASON = 8;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function normalizeStatus(value) {
  const candidate = String(value || "").trim();
  const match = ATTENDANCE_STATUSES.find(
    (status) => status.toLowerCase() === candidate.toLowerCase(),
  );
  // P/A/L/B are the register's fast keys; the full words are accepted too.
  const shortCodes = { p: "Present", a: "Absent", l: "Late", b: "Bunk", e: "Excused" };
  if (!match && shortCodes[candidate.toLowerCase()]) {
    return shortCodes[candidate.toLowerCase()];
  }
  return match || null;
}

function normalizeSectionCodes(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(",");
  const codes = raw
    .map((code) => String(code).trim().toUpperCase())
    .filter((code) => code && code !== "ALL");
  return [...new Set(codes)];
}

function normalizeBatchCodes(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(",");
  const codes = raw
    .map((batch) => String(batch).trim())
    .filter((batch) => batch && batch !== "ALL");
  return [...new Set(codes)];
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function toCsv(codes) {
  return codes.join(", ");
}

function actorName(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
}

/**
 * Determines what the caller is allowed to deliver attendance for.
 *
 * `assigned`  — a teacher: only the course/section pairs they are assigned to.
 * `institution` — an administrator holding attendance-administration rights:
 *               any course and section, for audit and correction purposes.
 *
 * This is the single gate used by session creation, marking and correction, so
 * a teacher cannot reach another teacher's course by calling the API directly.
 */
async function resolveDeliveryScope(user) {
  const roles = getUserRoles(user);
  const userId = user._id || user.id;
  const isInstitutionScoped = roles.some((role) => STAFF_ATTENDANCE_ROLES.has(role));

  if (isInstitutionScoped) {
    return { mode: "institution", roles, assignments: [] };
  }

  const raw = await FacultySubjectAssignment.find({ facultyUser: userId, isActive: true })
    .populate("course")
    .lean();
  const assignments = await Promise.all(raw.map(async (a) => {
    let sectionCodes = [];
    if (a.course?.program && a.course?.semester) {
      const sections = await Section.find({ program: a.course.program, semester: a.course.semester }).select("code").lean();
      sectionCodes = sections.map((s) => s.code);
    }
    return { ...a, sectionCode: sectionCodes[0] || null, sectionCodes };
  }));

  return {
    mode: "assigned",
    roles,
    assignments: assignments.filter((assignment) => Boolean(assignment.course)),
  };
}

/**
 * Confirms the caller may deliver attendance for this course and section set.
 * Returns `{ allowed, reason }` instead of throwing so routes can answer with a
 * precise message.
 */
function checkDeliveryScope(scope, { courseId, sectionCodes }) {
  if (scope.mode === "institution") return { allowed: true };

  const courseKey = String(courseId);
  const matching = scope.assignments.filter(
    (assignment) =>
      String(assignment.course._id ?? assignment.course) === courseKey ||
      String(assignment.course?.code || "").toUpperCase() ===
        String(courseId).toUpperCase(),
  );

  if (matching.length === 0) {
    return {
      allowed: false,
      reason: "You are not assigned to teach this course.",
    };
  }

  const assignedSections = new Set(
    matching.map((assignment) => String(assignment.sectionCode).toUpperCase()),
  );
  const requested = sectionCodes.length > 0 ? sectionCodes : [...assignedSections];
  const outside = requested.filter((code) => !assignedSections.has(code));

  if (outside.length > 0) {
    return {
      allowed: false,
      reason: `You are not assigned to section ${toCsv(outside)}. Your assigned sections are ${toCsv([...assignedSections])}.`,
    };
  }

  return { allowed: true };
}

async function resolveCourse(courseId) {
  if (!courseId) return null;
  const value = String(courseId).trim();
  if (/^[0-9a-fA-F]{24}$/.test(value)) {
    const byId = await Course.findById(value);
    if (byId) return byId;
  }
  return Course.findOne({ code: value.toUpperCase() });
}

/**
 * Resolves the roster for a set of filters using the existing enrolment and
 * student records — no separate attendance-specific student model.
 *
 * When a course is supplied the roster is driven by `Enrollment` (so only
 * students actually registered for that course appear). Otherwise it falls back
 * to the students registered against the selected sections.
 */
async function resolveRoster({
  courseId,
  sectionCodes,
  batches,
  semester,
  academicYear,
}) {
  let studentDocs = [];

  if (courseId) {
    const enrollmentFilter = { status: "ENROLLED" };
    if (sectionCodes.length > 0) {
      enrollmentFilter.sectionCode = { $in: sectionCodes };
    }
    if (semester) enrollmentFilter.semester = Number(semester);
    if (academicYear) enrollmentFilter.academicYear = academicYear;

    const enrollments = await Enrollment.find(enrollmentFilter).select(
      "student studentUser sectionCode",
    );
    const studentIds = [...new Set(enrollments.map((row) => String(row.student)))];
    if (studentIds.length > 0) {
      studentDocs = await Student.find({
        _id: { $in: studentIds },
        status: "ACTIVE",
      }).populate("user");
    }
  } else {
    const filter = { status: "ACTIVE" };
    if (sectionCodes.length > 0) filter.section = { $in: sectionCodes };
    if (batches.length > 0) filter.batch = { $in: batches };
    studentDocs = await Student.find(filter).populate("user");
  }

  return studentDocs
    .filter((student) => !batches.length || batches.includes(student.batch))
    .sort((a, b) =>
      `${a.section}-${a.studentId}`.localeCompare(`${b.section}-${b.studentId}`),
    );
}

/** Shapes a student for the attendance register, photo resolved from the user. */
function toRosterEntry(student) {
  return {
    studentMongoId: student._id.toString(),
    studentUserId: student.user?._id?.toString() || null,
    studentId: student.studentId,
    rollNumber: student.rollNumber || student.studentId,
    name: `${student.firstName} ${student.lastName}`.trim(),
    firstName: student.firstName,
    lastName: student.lastName,
    section: student.section,
    batch: student.batch,
    program: student.program,
    semester: student.semester,
    // Read from the user record on every request, so a photo saved on the
    // profile is reflected here without copying it into attendance data.
    avatarUrl: student.user?.avatarUrl || student.avatarUrl || null,
  };
}

function summarizeRecords(records) {
  const summary = { Present: 0, Absent: 0, Late: 0, Bunk: 0, Excused: 0, Unmarked: 0 };
  for (const record of records) {
    const status = record.status || "Unmarked";
    if (summary[status] === undefined) summary[status] = 0;
    summary[status] += 1;
  }
  return summary;
}

/**
 * Recomputes the cumulative attendance percentage for the supplied students.
 * Runs as a single aggregation per status rather than per-student queries, and
 * only writes when the stored value actually changes.
 */
async function refreshAttendancePercentages(studentIds) {
  if (studentIds.length === 0) return;

  const counts = await Attendance.aggregate([
    { $match: { student: { $in: studentIds } } },
    { $group: { _id: "$student", total: { $sum: 1 } } },
  ]);
  const attending = await Attendance.aggregate([
    { $match: { student: { $in: studentIds }, status: { $in: ATTENDING_STATUSES } } },
    { $group: { _id: "$student", present: { $sum: 1 } } },
  ]);

  const totalByStudent = new Map(counts.map((row) => [String(row._id), row.total]));
  const presentByStudent = new Map(attending.map((row) => [String(row._id), row.present]));

  await Promise.all(
    studentIds.map((studentId) => {
      const key = String(studentId);
      const total = totalByStudent.get(key) || 0;
      if (total === 0) return Promise.resolve();
      const percentage = Math.round(
        ((presentByStudent.get(key) || 0) / total) * 100,
      );
      return Student.updateOne(
        { _id: studentId, attendancePercentage: { $ne: percentage } },
        { $set: { attendancePercentage: percentage } },
      );
    }),
  );
}

function issueQrToken() {
  return {
    token: randomBytes(24).toString("hex"),
    expiresAt: new Date(Date.now() + QR_TOKEN_TTL_MS),
  };
}

/** Collapses one row per teaching assignment into one row per course. */
function dedupeCourses(courses) {
  const byId = new Map();
  for (const course of courses) {
    if (!course.id) continue;
    const existing = byId.get(course.id);
    if (!existing) {
      byId.set(course.id, { ...course, sectionCodes: [...new Set(course.sectionCodes)] });
      continue;
    }
    existing.sectionCodes = [
      ...new Set([...existing.sectionCodes, ...course.sectionCodes]),
    ];
  }
  return [...byId.values()];
}

function hashToken(token) {
  // Token values are never stored: only this digest is, so a database read
  // cannot be replayed as a check-in.
  return createHash("sha256").update(String(token)).digest("hex");
}

function sessionResponse(session, course, extra = {}) {
  const sections = session.sectionCodes?.length
    ? session.sectionCodes
    : session.sectionCode
      ? [session.sectionCode]
      : [];
  return {
    id: session._id.toString(),
    // `course` may be the populated document (list/detail routes) or the
    // raw ObjectId (create route). Read the id from whichever shape we
    // were handed so callers never receive a stringified document.
    courseId: String(course?._id ?? session.course),
    courseCode: course?.code || "",
    courseName: course?.name || "",
    sectionCodes: sections,
    sectionCode: sections[0] || session.sectionCode || "",
    academicYear: session.academicYear || null,
    batches: session.batches || [],
    semester: session.semester,
    classType: session.classType || "Lecture",
    date: session.date,
    startTime: session.startTime || null,
    endTime: session.endTime || null,
    topic: session.topic || "",
    status: session.status,
    openedAt: session.openedAt,
    closedAt: session.closedAt,
    ...extra,
  };
}

export function registerAttendanceRoutes(app) {
  // ---------------------------------------------------------------------
  // Filter context — every option is derived from live database records.
  // ---------------------------------------------------------------------
  app.get(
    "/api/attendance/context",
    requireAuth,
    requirePermission("attendance.view"),
    async (req, res) => {
      try {
        const scope = await resolveDeliveryScope(req.user);

        const [studentSections, studentBatches, enrolmentSections, enrolmentYears, assignmentYears] =
          await Promise.all([
            Student.distinct("section", { status: "ACTIVE" }),
            Student.distinct("batch", { status: "ACTIVE" }),
            Enrollment.distinct("sectionCode"),
            Enrollment.distinct("academicYear"),
            CourseTeachingAssignment.distinct("academicYear"),
          ]);

        const assignedSections = scope.assignments.map((row) => row.sectionCode);
        const allSections = normalizeSectionCodes([
          ...studentSections,
          ...enrolmentSections,
          ...assignedSections,
        ]);
        const batches = normalizeBatchCodes(studentBatches);
        const academicYears = [
          ...new Set([...enrolmentYears, ...assignmentYears].filter(Boolean)),
        ].sort();

        // A teacher only ever sees the courses and sections they are assigned
        // to; an administrator sees the whole catalogue.
        const sections = scope.mode === "institution" ? allSections : normalizeSectionCodes(assignedSections);

        const courses =
          scope.mode === "institution"
            ? (await Course.find().sort({ code: 1 }).lean()).map((course) => ({
                id: String(course._id),
                code: course.code,
                name: course.name,
                semester: course.semester,
                sectionCodes: [],
              }))
            : dedupeCourses(
                scope.assignments.map((assignment) => ({
                  id: String(assignment.course._id ?? assignment.course),
                  code: assignment.course?.code || "",
                  name: assignment.course?.name || "",
                  semester: assignment.semester,
                  sectionCodes: [assignment.sectionCode],
                })),
              );

        res.json({
          mode: scope.mode,
          courses,
          sections,
          allSections,
          batches,
          academicYears,
          classTypes: CLASS_TYPES,
          statuses: ATTENDANCE_STATUSES,
        });
      } catch (err) {
        console.error("Attendance context error:", err);
        res.status(500).json({ error: "Failed to load attendance filters." });
      }
    },
  );

  // ---------------------------------------------------------------------
  // Roster for the selected filters
  // ---------------------------------------------------------------------
  app.get(
    "/api/attendance/roster",
    requireAuth,
    requirePermission("attendance.view"),
    async (req, res) => {
      try {
        const sectionCodes = normalizeSectionCodes(
          req.query.section || req.query.sectionCodes,
        );
        const batches = normalizeBatchCodes(req.query.batch || req.query.batches);
        const course = await resolveCourse(req.query.courseId);

        const scope = await resolveDeliveryScope(req.user);
        if (course) {
          const permission = checkDeliveryScope(scope, {
            courseId: String(course._id),
            sectionCodes,
          });
          if (!permission.allowed) {
            return res.status(403).json({ error: permission.reason });
          }
        }

        const students = await resolveRoster({
          courseId: course?._id,
          sectionCodes,
          batches,
          semester: req.query.semester,
          academicYear: req.query.academicYear,
        });

        res.json({
          roster: students.map(toRosterEntry),
          count: students.length,
          course: course
            ? { id: String(course._id), code: course.code, name: course.name }
            : null,
        });
      } catch (err) {
        console.error("Attendance roster error:", err);
        res.status(500).json({ error: "Failed to load attendance roster." });
      }
    },
  );

  // ---------------------------------------------------------------------
  // Records. Students only ever receive their own attendance.
  // ---------------------------------------------------------------------
  app.get(
    "/api/attendance",
    requireAuth,
    requirePermission("attendance.view"),
    async (req, res) => {
      try {
        const roles = getUserRoles(req.user);
        const isStudentOnly =
          roles.includes("student") && !roles.some((role) => STAFF_ATTENDANCE_ROLES.has(role));

        if (isStudentOnly) {
          const student = await Student.findOne({ user: req.user._id || req.user.id });
          if (!student) {
            return res.json({ attendance: [] });
          }

          const records = await Attendance.find({ student: student._id })
            .populate("course")
            .sort({ date: -1, createdAt: -1 })
            .limit(200);

          return res.json({
            attendance: records.map((record) => ({
              id: record._id.toString(),
              sessionId: record.attendanceSession ? String(record.attendanceSession) : null,
              studentId: student.studentId,
              studentName: `${student.firstName} ${student.lastName}`.trim(),
              studentAvatar: student.user?.avatarUrl || student.avatarUrl || null,
              date: record.date,
              session: record.session,
              classType: record.classType,
              section: record.section,
              status: record.status,
              courseId: String(record.course),
              courseCode: record.course?.code || "",
              courseName: record.course?.name || "",
              markedAt: record.updatedAt || record.createdAt,
              remarks: record.remarks,
            })),
          });
        }

        const filter = {};
        if (req.query.date) filter.date = String(req.query.date).trim();
        if (req.query.sessionId && /^[0-9a-fA-F]{24}$/.test(String(req.query.sessionId))) {
          filter.attendanceSession = String(req.query.sessionId);
        }
        const sectionCodes = normalizeSectionCodes(req.query.section);
        if (sectionCodes.length > 0) filter.section = { $in: sectionCodes };

        if (req.query.courseId) {
          const course = await resolveCourse(req.query.courseId);
          if (course) filter.course = course._id;
        }

        const records = await Attendance.find(filter)
          .populate("student course markedBy")
          .sort({ date: -1, section: 1 })
          .limit(500);

        res.json({
          attendance: records.map((record) => ({
            id: record._id.toString(),
            sessionId: record.attendanceSession ? String(record.attendanceSession) : null,
            studentId: record.student?.studentId || null,
            studentName: record.student
              ? `${record.student.firstName} ${record.student.lastName}`.trim()
              : null,
            studentMongoId: record.student?._id?.toString() || null,
            studentAvatar: record.student?.user?.avatarUrl || record.student?.avatarUrl || null,
            courseId: String(record.course),
            courseCode: record.course?.code || "",
            courseName: record.course?.name || "",
            section: record.section,
            classType: record.classType,
            date: record.date,
            session: record.session,
            status: record.status,
            markedBy: record.markedBy ? actorName(record.markedBy) : null,
            markedAt: record.updatedAt || record.createdAt,
            remarks: record.remarks,
          })),
        });
      } catch (err) {
        console.error("Fetch attendance error:", err);
        res.status(500).json({ error: "Failed to load attendance records." });
      }
    },
  );

  // ---------------------------------------------------------------------
  // Session lifecycle
  // ---------------------------------------------------------------------
  app.post(
    "/api/attendance/sessions",
    requireAuth,
    requirePermission("attendance.session.create"),
    async (req, res) => {
      try {
        const {
          courseId,
          sectionCodes: requestedSections,
          sectionCode,
          academicYear,
          batch,
          semester,
          classType = "Lecture",
          date,
          startTime,
          endTime,
          topic = "",
        } = req.body || {};

        const course = await resolveCourse(courseId);
        if (!course) {
          return res.status(400).json({ error: "Select a course to record attendance for." });
        }

        const sectionCodes = normalizeSectionCodes(requestedSections || sectionCode);
        if (sectionCodes.length === 0) {
          return res.status(400).json({ error: "Select at least one section." });
        }

        const scope = await resolveDeliveryScope(req.user);
        const permission = checkDeliveryScope(scope, {
          courseId: String(course._id),
          sectionCodes,
        });
        if (!permission.allowed) {
          return res.status(403).json({ error: permission.reason });
        }

        const institutionTimeZone = await getInstitutionTimeZone();
        const classDate = new Intl.DateTimeFormat("en-CA", {
          timeZone: institutionTimeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());

        for (const [label, value] of [
          ["start time", startTime],
          ["end time", endTime],
        ]) {
          if (value && !TIME_PATTERN.test(String(value).trim())) {
            return res.status(400).json({ error: `Enter a valid ${label} as HH:MM.` });
          }
        }

        const normalizedClassType = CLASS_TYPES.includes(classType)
          ? classType
          : CLASS_TYPES[0];

        const actor = req.user._id || req.user.id;

        /**
         * One live register per teacher, course, date and class type.
         *
         * Opening a class that already has an open register returns
         * that register (widened to any newly requested sections)
         * instead of failing, so a teacher never ends up with two
         * registers for the same class and always leaves this call
         * with the correct session id. A different class type is a
         * different class, so it gets its own register.
         */
        const existingOpen = await AttendanceSession.findOne({
          facultyUser: actor,
          course: course._id,
          date: classDate,
          classType: normalizedClassType,
          status: "OPEN",
        });

        if (existingOpen) {
          const mergedSections = [
            ...new Set([...(existingOpen.sectionCodes || []), ...sectionCodes]),
          ];
          existingOpen.sectionCodes = mergedSections;
          if (!existingOpen.sectionCode) {
            existingOpen.sectionCode = mergedSections[0];
          }
          if (startTime) existingOpen.startTime = String(startTime).trim();
          if (endTime) existingOpen.endTime = String(endTime).trim();
          if (topic) {
            existingOpen.topic = String(topic).trim().slice(0, 500);
          }
          if (academicYear && !existingOpen.academicYear) {
            existingOpen.academicYear = String(academicYear).trim();
          }
          if (batch && existingOpen.batches.length === 0) {
            existingOpen.batches = normalizeBatchCodes(batch);
          }
          await existingOpen.save();

          await logAudit({
            userId: actor,
            action: "ATTENDANCE_SESSION_OPENED",
            module: "attendance",
            resource: "attendanceSession",
            resourceId: existingOpen._id.toString(),
            newValue: {
              course: course.code,
              sectionCodes: mergedSections,
              classType: normalizedClassType,
              date: classDate,
              startTime: existingOpen.startTime,
              endTime: existingOpen.endTime,
            },
            details: `Existing open attendance session reused for ${course.code} (${toCsv(mergedSections)}, ${normalizedClassType}) on ${classDate}.`,
          });

          return res.status(200).json({
            success: true,
            alreadyOpen: true,
            sessionId: existingOpen._id.toString(),
            session: sessionResponse(existingOpen, course),
          });
        }

        const session = await AttendanceSession.create({
          course: course._id,
          facultyUser: req.user._id || req.user.id,
          createdBy: req.user._id || req.user.id,
          sectionCode: sectionCodes[0],
          sectionCodes,
          academicYear: academicYear ? String(academicYear).trim() : null,
          batches: normalizeBatchCodes(batch),
          semester: Number(semester) || course.semester || 1,
          classType: normalizedClassType,
          date: classDate,
          startTime: startTime ? String(startTime).trim() : null,
          endTime: endTime ? String(endTime).trim() : null,
          topic: String(topic || "").trim().slice(0, 500),
          sessionName: normalizedClassType,
          status: "OPEN",
          openedAt: new Date(),
        });

        await logAudit({
          userId: req.user._id || req.user.id,
          action: "ATTENDANCE_SESSION_OPENED",
          module: "attendance",
          resource: "attendanceSession",
          resourceId: session._id.toString(),
          newValue: {
            course: course.code,
            sectionCodes,
            classType: normalizedClassType,
            date: classDate,
            startTime: session.startTime,
            endTime: session.endTime,
          },
          details: `Attendance session opened for ${course.code} (${toCsv(sectionCodes)}, ${normalizedClassType}) on ${classDate}.`,
        });

        res.status(201).json({
          success: true,
          sessionId: session._id.toString(),
          session: sessionResponse(session, course),
        });
      } catch (err) {
        console.error("Create attendance session error:", err);
        res.status(500).json({ error: "Failed to start attendance session." });
      }
    },
  );

  /** Session history, scoped to what the caller is allowed to see. */
  app.get(
    "/api/attendance/sessions",
    requireAuth,
    requirePermission("attendance.view"),
    async (req, res) => {
      try {
        const roles = getUserRoles(req.user);
        const scope = await resolveDeliveryScope(req.user);
        const filter = {};

        if (scope.mode === "assigned") {
          filter.facultyUser = req.user._id || req.user.id;
        } else if (String(req.query.mine || "") === "true") {
          filter.facultyUser = req.user._id || req.user.id;
        }

        if (req.query.courseId) {
          const course = await resolveCourse(req.query.courseId);
          if (course) filter.course = course._id;
        }
        const sectionCodes = normalizeSectionCodes(req.query.section);
        if (sectionCodes.length > 0) {
          filter.$or = [
            { sectionCodes: { $in: sectionCodes } },
            { sectionCode: { $in: sectionCodes } },
          ];
        }

        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const sessions = await AttendanceSession.find(filter)
          .populate("course")
          .sort({ date: -1, openedAt: -1 })
          .limit(limit);

        const summaries = await summariseSessions(sessions);

        res.json({
          sessions: sessions.map((session) =>
            sessionResponse(session, session.course, {
              summary: summaries.get(String(session._id)) || null,
              facultyName: scope.mode === "assigned" ? null : undefined,
            }),
          ),
          count: sessions.length,
          canDeliverAllCourses: scope.mode === "institution",
          viewerRole: roles.includes("faculty") ? "faculty" : "administrator",
        });
      } catch (err) {
        console.error("Attendance history error:", err);
        res.status(500).json({ error: "Failed to load attendance history." });
      }
    },
  );

  app.get(
    "/api/attendance/sessions/current",
    requireAuth,
    requirePermission("attendance.view"),
    async (req, res) => {
      try {
        const scope = await resolveDeliveryScope(req.user);
        const filter = { status: "OPEN" };
        if (scope.mode === "assigned") {
          filter.facultyUser = req.user._id || req.user.id;
        }
        const session = await AttendanceSession.findOne(filter).sort({ openedAt: -1 }).populate("course");
        res.json({
          session: session
            ? sessionResponse(session, session.course)
            : null,
        });
      } catch {
        res.json({ session: null });
      }
    },
  );

  /** Session detail: roster with the current mark for each student. */
  app.get(
    "/api/attendance/sessions/:id",
    requireAuth,
    requirePermission("attendance.view"),
    async (req, res) => {
      try {
        const session = await AttendanceSession.findById(req.params.id).populate("course");
        if (!session) return res.status(404).json({ error: "Session not found." });

        const scope = await resolveDeliveryScope(req.user);
        if (scope.mode === "assigned") {
          const ownerId = String(session.facultyUser);
          const viewerId = String(req.user._id || req.user.id);
          if (ownerId !== viewerId) {
            return res.status(403).json({ error: "Access denied." });
          }
        }

        const sectionCodes = session.sectionCodes?.length
          ? session.sectionCodes
          : [session.sectionCode].filter(Boolean);
        const students = await resolveRoster({
          courseId: session.course,
          sectionCodes,
          batches: session.batches || [],
          semester: session.semester,
          academicYear: session.academicYear,
        });

        const records = await Attendance.find({
          attendanceSession: session._id,
        });

        const byStudent = new Map(
          records.map((record) => [String(record.student), record]),
        );

        const roster = students.map((student) => {
          const entry = toRosterEntry(student);
          const record = byStudent.get(entry.studentMongoId);
          return {
            ...entry,
            status: record?.status || null,
            recordId: record?._id?.toString() || null,
            markedAt: record?.updatedAt || null,
            remarks: record?.remarks || "",
            corrections: record?.statusHistory || [],
          };
        });

        const summary = summarizeRecords(roster);
        const markedCount = roster.filter((row) => row.status).length;

        res.json({
          session: sessionResponse(session, session.course, { summary }),
          students: roster,
          summary,
          markedCount,
          totalCount: roster.length,
        });
      } catch (err) {
        console.error("Attendance session detail error:", err);
        res.status(500).json({ error: "Failed to load session details." });
      }
    },
  );

  /**
   * Saves the register for an open session and automatically closes it.
   * Uses a MongoDB transaction to ensure atomicity between saving attendance
   * records and closing the session.
   */
  app.post(
    "/api/attendance/sessions/:id/records",
    requireAuth,
    requirePermission("attendance.manual_mark"),
    async (req, res) => {
      try {
        const session = await AttendanceSession.findById(req.params.id);
        if (!session) return res.status(404).json({ error: "Session not found." });
        if (session.status !== "OPEN") {
          return res.status(409).json({
            error: "This session is closed. Reopen a correction instead of editing the register.",
          });
        }

        const scope = await resolveDeliveryScope(req.user);
        const permission = checkDeliveryScope(scope, {
          courseId: String(session.course),
          sectionCodes: session.sectionCodes?.length
            ? session.sectionCodes
            : [session.sectionCode],
        });
        if (!permission.allowed) {
          return res.status(403).json({ error: permission.reason });
        }

        const submitted = Array.isArray(req.body?.records) ? req.body.records : [];
        if (submitted.length === 0) {
          return res.status(400).json({ error: "No attendance marks were submitted." });
        }

        const sectionCodes = session.sectionCodes?.length
          ? session.sectionCodes
          : [session.sectionCode].filter(Boolean);
        const students = await resolveRoster({
          courseId: session.course,
          sectionCodes,
          batches: session.batches || [],
          semester: session.semester,
          academicYear: session.academicYear,
        });
        const rosterByKey = new Map();
        const rosterByStudentId = new Map();
        for (const student of students) {
          rosterByKey.set(String(student._id), student);
          rosterByStudentId.set(student.studentId, student);
        }

        const actor = req.user._id || req.user.id;
        const now = new Date();
        const operations = [];
        const saved = [];
        const rejected = [];
        const cleared = [];
        const touchedStudents = new Set();

        /**
         * Marks for this class already on file, regardless of which
         * register session recorded them. The register's identity is
         * the student + class columns (the unique index), so the save
         * updates those rows in place and re-points them at this
         * session instead of inserting a conflicting duplicate.
         */
        const existingRecords = await Attendance.find({
          course: session.course,
          date: session.date,
          session: session.sessionName,
          student: { $in: students.map((student) => student._id) },
        }).lean();
        const existingByStudent = new Map(
          existingRecords.map((record) => [String(record.student), record]),
        );

        for (const item of submitted) {
          const key = String(item?.studentId ?? "").trim();
          const entry = rosterByKey.get(key) || rosterByStudentId.get(key);

          if (!entry) {
            rejected.push({
              studentId: key,
              error: "This student is not on the session roster.",
            });
            continue;
          }

          const classIdentity = {
            student: entry._id,
            course: session.course,
            section: entry.section,
            date: session.date,
            session: session.sessionName,
          };

          /**
           * "Unmarked" removes the mark so the stored register matches
           * exactly what the teacher sees on screen. An absent mark is
           * never fabricated as "Present".
           */
          const clearing =
            String(item?.status || "").trim().toLowerCase() === "unmarked" ||
            item?.clear === true;

          if (clearing) {
            operations.push({ deleteOne: { filter: classIdentity } });
            touchedStudents.add(entry._id);
            cleared.push({
              studentId: entry.studentId,
              studentMongoId: String(entry._id),
              studentName: `${entry.firstName} ${entry.lastName}`.trim(),
              section: entry.section,
              status: "Unmarked",
            });
            continue;
          }

          const status = normalizeStatus(item?.status);
          if (!status) {
            rejected.push({
              studentId: key,
              error: `"${item?.status}" is not a valid status. Use P, A, L or B.`,
            });
            continue;
          }

          const previous = existingByStudent.get(String(entry._id));
          const previousStatus = previous?.status || null;
          const reason = String(item?.remarks || "").slice(0, 300);
          const historyEntry = {
            from: previousStatus,
            to: status,
            changedBy: actor,
            changedByName: actorName(req.user),
            reason: reason || "Register saved",
            changedAt: now,
          };

          const update = {
            $set: {
              studentUser: entry.user,
              classType: session.classType,
              attendanceSession: session._id,
              status,
              markedBy: actor,
              remarks: reason,
              updatedAt: now,
            },
          };
          if (previous) {
            // Row already exists: record the change in the trail.
            // ($push and $setOnInsert cannot both touch the same
            // path, so the seed below only runs on insert.)
            if (previousStatus !== status) {
              update.$push = { statusHistory: historyEntry };
            }
          } else {
            update.$setOnInsert = {
              createdAt: now,
              statusHistory: [historyEntry],
            };
          }

          operations.push({
            updateOne: {
              filter: classIdentity,
              update,
              upsert: true,
            },
          });
          touchedStudents.add(entry._id);

          saved.push({
            studentId: entry.studentId,
            studentMongoId: String(entry._id),
            studentName: `${entry.firstName} ${entry.lastName}`.trim(),
            avatarUrl: entry.user?.avatarUrl || entry.avatarUrl || null,
            section: entry.section,
            status,
            remarks: reason,
            previousStatus,
          });
        }

        if (operations.length === 0) {
          return res.status(422).json({
            error: "None of the submitted marks could be saved.",
            rejected,
          });
        }

        // Use a MongoDB transaction to ensure atomicity between saving attendance
        // records and closing the session
        const mongoose = await import("mongoose");
        const dbSession = await mongoose.default.startSession();
        dbSession.startTransaction();
        try {
          await Attendance.bulkWrite(operations, { ordered: false, session: dbSession });
          
          // Close the session within the same transaction
          session.status = "CLOSED";
          session.closedAt = new Date();
          session.qrTokens = [];
          await session.save({ session: dbSession });

          await dbSession.commitTransaction();
        } catch (transactionError) {
          await dbSession.abortTransaction();
          throw transactionError;
        } finally {
          await dbSession.endSession();
        }

        await refreshAttendancePercentages([...touchedStudents]);

        const marked = await Attendance.countDocuments({
          attendanceSession: session._id,
        });

        await logAudit({
          userId: actor,
          action: "ATTENDANCE_REGISTER_SAVED",
          module: "attendance",
          resource: "attendanceSession",
          resourceId: session._id.toString(),
          details: `${saved.length} attendance mark(s) saved and ${cleared.length} cleared for ${session.date}. Session automatically closed.`,
          metadata: { saved: saved.length, cleared: cleared.length, rejected, sessionClosed: true },
        });

        await logAudit({
          userId: actor,
          action: "ATTENDANCE_SESSION_CLOSED",
          module: "attendance",
          resource: "attendanceSession",
          resourceId: session._id.toString(),
          details: `Session automatically closed after saving attendance with ${marked} recorded mark(s).`,
        });

        // Return updated session status
        const course = await session.populate("course");
        res.json({
          success: true,
          savedCount: saved.length,
          clearedCount: cleared.length,
          records: saved,
          clearedRecords: cleared,
          rejected,
          sessionClosed: true,
          session: {
            id: session._id.toString(),
            status: session.status,
            closedAt: session.closedAt,
          },
        });
      } catch (err) {
        console.error("Save attendance register error:", err);
        res.status(500).json({ error: "Failed to save the attendance register." });
      }
    },
  );

  /** Auditable correction of an already-recorded mark. */
  app.patch(
    "/api/attendance/records/:recordId",
    requireAuth,
    requirePermission("attendance.edit"),
    async (req, res) => {
      try {
        const record = await Attendance.findById(req.params.recordId);
        if (!record) return res.status(404).json({ error: "Attendance record not found." });

        const status = normalizeStatus(req.body?.status);
        if (!status) {
          return res.status(422).json({
            error: `"${req.body?.status}" is not a valid status. Use P, A, L or B.`,
          });
        }

        const reason = String(req.body?.reason || "").trim();
        if (reason.length < MIN_CORRECTION_REASON) {
          return res.status(422).json({
            error: `A correction reason of at least ${MIN_CORRECTION_REASON} characters is required.`,
          });
        }

        const scope = await resolveDeliveryScope(req.user);
        const permission = checkDeliveryScope(scope, {
          courseId: String(record.course),
          sectionCodes: [record.section],
        });
        if (!permission.allowed) {
          return res.status(403).json({ error: permission.reason });
        }

        const previousStatus = record.status;
        if (previousStatus === status && !String(req.body?.remarks || record.remarks)) {
          return res.json({ success: true, unchanged: true, status });
        }

        const actor = req.user._id || req.user.id;
        record.status = status;
        record.markedBy = actor;
        if (req.body?.remarks !== undefined) {
          record.remarks = String(req.body.remarks || "").slice(0, 300);
        }
        record.statusHistory.push({
          from: previousStatus,
          to: status,
          changedBy: actor,
          changedByName: actorName(req.user),
          reason,
          changedAt: new Date(),
        });
        await record.save();

        await refreshAttendancePercentages([record.student]);

        await logAudit({
          userId: actor,
          action: "ATTENDANCE_CORRECTED",
          module: "attendance",
          resource: "attendance",
          resourceId: record._id.toString(),
          oldValue: { status: previousStatus },
          newValue: { status },
          details: `Attendance changed from ${previousStatus} to ${status}. Reason: ${reason}`,
          metadata: { changedBy: actorName(req.user), reason, at: new Date() },
        });

        res.json({ success: true, status, previousStatus });
      } catch (err) {
        console.error("Attendance correction error:", err);
        res.status(500).json({ error: "Failed to record the attendance correction." });
      }
    },
  );

  app.post(
    "/api/attendance/sessions/:id/close",
    requireAuth,
    requirePermission("attendance.session.close"),
    async (req, res) => {
      try {
        const session = await AttendanceSession.findById(req.params.id);
        if (!session) return res.status(404).json({ error: "Session not found." });

        const scope = await resolveDeliveryScope(req.user);
        const permission = checkDeliveryScope(scope, {
          courseId: String(session.course),
          sectionCodes: session.sectionCodes?.length
            ? session.sectionCodes
            : [session.sectionCode],
        });
        if (!permission.allowed) {
          return res.status(403).json({ error: permission.reason });
        }

        session.status = "CLOSED";
        session.closedAt = new Date();
        session.qrTokens = [];
        await session.save();

        const marked = await Attendance.countDocuments({
          attendanceSession: session._id,
        });

        await logAudit({
          userId: req.user._id || req.user.id,
          action: "ATTENDANCE_SESSION_CLOSED",
          module: "attendance",
          resource: "attendanceSession",
          resourceId: session._id.toString(),
          details: `Session closed with ${marked} recorded mark(s).`,
        });

        res.json({ success: true, markedCount: marked });
      } catch (err) {
        console.error("Close attendance session error:", err);
        res.status(500).json({ error: "Failed to close the attendance session." });
      }
    },
  );

  // ---------------------------------------------------------------------
  // Short-lived QR check-in (student self-service)
  // ---------------------------------------------------------------------
  app.post(
    "/api/attendance/sessions/:id/qr",
    requireAuth,
    requirePermission("attendance.session.create"),
    async (req, res) => {
      try {
        const session = await AttendanceSession.findById(req.params.id);
        if (!session) return res.status(404).json({ error: "Session not found." });
        if (session.status !== "OPEN") {
          return res.status(409).json({ error: "This session is closed." });
        }

        const scope = await resolveDeliveryScope(req.user);
        const permission = checkDeliveryScope(scope, {
          courseId: String(session.course),
          sectionCodes: session.sectionCodes?.length
            ? session.sectionCodes
            : [session.sectionCode],
        });
        if (!permission.allowed) {
          return res.status(403).json({ error: permission.reason });
        }

        const { token, expiresAt } = issueQrToken();
        session.qrTokens.push({
          tokenHash: hashToken(token),
          expiresAt,
          revokedAt: null,
        });
        // Only the most recent tokens are useful; drop expired history.
        session.qrTokens = session.qrTokens.slice(-5);
        await session.save();

        res.json({
          sessionId: session._id.toString(),
          qrToken: token,
          qrExpiresAt: expiresAt.toISOString(),
          qrTtlSeconds: Math.round(QR_TOKEN_TTL_MS / 1000),
        });
      } catch (err) {
        console.error("Issue attendance QR error:", err);
        res.status(500).json({ error: "Could not issue an attendance code." });
      }
    },
  );

  app.post(
    "/api/attendance/check-in",
    requireAuth,
    requirePermission("attendance.qr.checkin"),
    async (req, res) => {
      try {
        const token = String(req.body?.token || "").trim();
        if (!token) {
          return res.status(400).json({ error: "Scan a valid attendance code." });
        }

        const openSessions = await AttendanceSession.find({ status: "OPEN" }).sort({
          openedAt: -1,
        });

        let session = null;
        let entry = null;
        for (const candidate of openSessions) {
          const match = candidate.qrTokens.find(
            (row) =>
              !row.revokedAt &&
              row.tokenHash === hashToken(token) &&
              row.expiresAt &&
              row.expiresAt.getTime() > Date.now(),
          );
          if (match) {
            session = candidate;
            entry = match;
            break;
          }
        }

        if (!session) {
          return res
            .status(410)
            .json({ error: "That attendance code has expired. Ask your teacher for a new one." });
        }

        const student = await Student.findOne({ user: req.user._id || req.user.id });
        if (!student) {
          return res.status(403).json({ error: "No student record is linked to this account." });
        }

        const sectionCodes = session.sectionCodes?.length
          ? session.sectionCodes
          : [session.sectionCode].filter(Boolean);
        const enrolled = await Enrollment.findOne({
          student: student._id,
          course: session.course,
          sectionCode: { $in: sectionCodes },
          status: "ENROLLED",
        });

        if (!enrolled) {
          return res.status(403).json({
            error: "You are not enrolled in this course section.",
          });
        }

        const now = new Date();
        // Match the class identity (the unique index), not the
        // session reference, so a self check-in updates the
        // student's mark for this class instead of colliding
        // with a row another register already recorded.
        await Attendance.updateOne(
          {
            student: student._id,
            course: session.course,
            section: enrolled.sectionCode,
            date: session.date,
            session: session.sessionName,
          },
          {
            $set: {
              studentUser: student.user,
              classType: session.classType,
              attendanceSession: session._id,
              status: "Present",
              markedBy: session.facultyUser,
              remarks: "Self check-in with attendance code",
              updatedAt: now,
            },
            $setOnInsert: { createdAt: now, statusHistory: [] },
          },
          { upsert: true },
        );

        entry.revokedAt = now;
        session.qrTokens = session.qrTokens.filter(
          (row) => row.tokenHash !== entry.tokenHash || !row.revokedAt,
        );
        await session.save();
        await refreshAttendancePercentages([student._id]);

        await logAudit({
          userId: req.user._id || req.user.id,
          action: "ATTENDANCE_CHECKED_IN",
          module: "attendance",
          resource: "attendanceSession",
          resourceId: session._id.toString(),
          details: `${student.studentId} checked in with an attendance code.`,
        });

        res.json({
          success: true,
          status: "Present",
          session: sessionResponse(session, null),
        });
      } catch (err) {
        console.error("Attendance check-in error:", err);
        res.status(500).json({ error: "Could not record the check-in." });
      }
    },
  );

  // ---------------------------------------------------------------------
  // Legacy single/bulk mark endpoints, retained for existing integrations.
  // They now enforce the same ownership checks as the register.
  // ---------------------------------------------------------------------
  app.post(
    "/api/attendance/batch",
    requireAuth,
    requirePermission("attendance.manual_mark"),
    async (req, res) => {
      try {
        const { date, section, courseId, session = "Lecture 1", records = [] } = req.body || {};

        if (!date || !isValidDate(date) || !Array.isArray(records) || records.length === 0) {
          return res.status(400).json({
            error: "A valid date and a list of attendance records are required.",
          });
        }

        const course = await resolveCourse(courseId);
        if (!course) {
          return res
            .status(400)
            .json({ error: "A valid course is required. Attendance is never recorded against an arbitrary course." });
        }

        const sectionCodes = normalizeSectionCodes(section);
        const scope = await resolveDeliveryScope(req.user);
        const permission = checkDeliveryScope(scope, {
          courseId: String(course._id),
          sectionCodes,
        });
        if (!permission.allowed) {
          return res.status(403).json({ error: permission.reason });
        }

        const studentIds = records.map((row) => String(row.studentId || "").trim());
        const students = await Student.find({
          $or: [
            { studentId: { $in: studentIds } },
            { _id: { $in: studentIds.filter((id) => /^[0-9a-fA-F]{24}$/.test(id)) } },
          ],
        }).populate("user");
        const byKey = new Map();
        students.forEach((student) => {
          byKey.set(student.studentId, student);
          byKey.set(String(student._id), student);
        });

        const actor = req.user._id || req.user.id;
        const now = new Date();
        const operations = [];
        const saved = [];
        const rejected = [];

        for (const item of records) {
          const student = byKey.get(String(item.studentId || "").trim());
          if (!student) {
            rejected.push({ studentId: item.studentId, error: "Student not found." });
            continue;
          }
          if (sectionCodes.length > 0 && !sectionCodes.includes(student.section)) {
            rejected.push({
              studentId: student.studentId,
              error: `Student is in section ${student.section}, which is not part of this request.`,
            });
            continue;
          }

          const status = normalizeStatus(item.status);
          if (!status) {
            rejected.push({
              studentId: student.studentId,
              error: `"${item.status}" is not a valid status. Use P, A, L or B.`,
            });
            continue;
          }

          const targetSection = String(item.section || student.section).toUpperCase();
          operations.push({
            updateOne: {
              filter: {
                student: student._id,
                course: course._id,
                section: targetSection,
                date: String(date).trim(),
                session: String(session).trim(),
              },
              update: {
                $set: {
                  student: student._id,
                  studentUser: student.user,
                  course: course._id,
                  section: targetSection,
                  date: String(date).trim(),
                  session: String(session).trim(),
                  status,
                  markedBy: actor,
                  remarks: String(item.remarks || "").slice(0, 300),
                  updatedAt: now,
                },
              },
              upsert: true,
            },
          });
          saved.push({
            studentId: student.studentId,
            studentName: `${student.firstName} ${student.lastName}`.trim(),
            avatarUrl: student.user?.avatarUrl || student.avatarUrl || null,
            section: targetSection,
            status,
            date: String(date).trim(),
            session: String(session).trim(),
          });
        }

        if (operations.length === 0) {
          return res.status(422).json({
            error: "None of the submitted attendance records could be saved.",
            rejected,
          });
        }

        await Attendance.bulkWrite(operations, { ordered: false });
        await refreshAttendancePercentages(students.map((student) => student._id));

        await logAudit({
          userId: actor,
          action: "ATTENDANCE_BATCH_SAVED",
          module: "attendance",
          resource: "attendance",
          details: `${operations.length} attendance mark(s) saved for ${date}.`,
          metadata: { course: course.code, rejected },
        });

        res.json({
          success: true,
          count: operations.length,
          savedCount: operations.length,
          records: saved,
          rejected,
          message: `Attendance for ${operations.length} student(s) stored.`,
        });
      } catch (err) {
        console.error("Batch attendance save error:", err);
        res.status(500).json({ error: "Failed to persist attendance records." });
      }
    },
  );

  app.post(
    "/api/attendance/mark",
    requireAuth,
    requirePermission("attendance.manual_mark"),
    async (req, res) => {
      try {
        const { studentId, studentUserId, courseId, section, date, session = "Lecture 1", status, reason } =
          req.body || {};

        const course = await resolveCourse(courseId);
        if (!course) {
          return res
            .status(400)
            .json({ error: "A valid course is required. Attendance is never recorded against an arbitrary course." });
        }

        const student = studentId
          ? await Student.findOne({ studentId: String(studentId) })
          : await Student.findOne({ user: studentUserId });
        if (!student) return res.status(404).json({ error: "Student not found." });

        const scope = await resolveDeliveryScope(req.user);
        const permission = checkDeliveryScope(scope, {
          courseId: String(course._id),
          sectionCodes: [String(section || student.section).toUpperCase()],
        });
        if (!permission.allowed) {
          return res.status(403).json({ error: permission.reason });
        }

        const normalized = normalizeStatus(status);
        if (!normalized) {
          return res.status(422).json({
            error: `"${status}" is not a valid status. Use P, A, L or B.`,
          });
        }

        const targetDate = isValidDate(date)
          ? String(date).trim()
          : new Date().toISOString().slice(0, 10);
        const targetSection = String(section || student.section).trim().toUpperCase();
        const targetSession = String(session).trim();

        const existing = await Attendance.findOne({
          student: student._id,
          course: course._id,
          section: targetSection,
          date: targetDate,
          session: targetSession,
        });

        const previousStatus = existing?.status || null;
        const actor = req.user._id || req.user.id;

        if (existing) {
          existing.status = normalized;
          existing.markedBy = actor;
          existing.remarks = String(reason || "").slice(0, 300);
          existing.statusHistory.push({
            from: previousStatus,
            to: normalized,
            changedBy: actor,
            changedByName: actorName(req.user),
            reason: String(reason || "Manual update").slice(0, 300),
            changedAt: new Date(),
          });
          await existing.save();
        } else {
          await Attendance.create({
            student: student._id,
            studentUser: student.user,
            course: course._id,
            section: targetSection,
            date: targetDate,
            session: targetSession,
            status: normalized,
            markedBy: actor,
            remarks: String(reason || "").slice(0, 300),
            statusHistory: [
              {
                from: null,
                to: normalized,
                changedBy: actor,
                changedByName: actorName(req.user),
                reason: String(reason || "Initial mark").slice(0, 300),
                changedAt: new Date(),
              },
            ],
          });
        }

        await refreshAttendancePercentages([student._id]);

        await logAudit({
          userId: actor,
          action: "ATTENDANCE_MARKED",
          module: "attendance",
          resource: "attendance",
          oldValue: { status: previousStatus || "UNMARKED" },
          newValue: { status: normalized },
          details: `Attendance for ${student.firstName} ${student.lastName} (${student.studentId}) set to ${normalized}.`,
          metadata: { reason: reason || "Manual update", changedBy: actorName(req.user) },
        });

        res.json({ success: true, status: normalized, previousStatus });
      } catch (err) {
        console.error("Mark attendance error:", err);
        res.status(500).json({ error: "Failed to mark attendance." });
      }
    },
  );

/**
 * Audit trail for a single attendance record. Returns every status change
 * ever recorded against the mark, newest first, so the workspace can render
 * a readable history without duplicating the correction data.
 */
  app.get(
    "/api/attendance/records/:recordId/history",
    requireAuth,
    requirePermission("attendance.view"),
    async (req, res) => {
      try {
        const record = await Attendance.findById(req.params.recordId);
        if (!record) {
          return res.status(404).json({ error: "Attendance record not found." });
        }

        const scope = await resolveDeliveryScope(req.user);
        const permission = checkDeliveryScope(scope, {
          courseId: String(record.course),
          sectionCodes: [record.section],
        });
        if (!permission.allowed) {
          return res.status(403).json({ error: permission.reason });
        }

        const entries = (record.statusHistory || [])
          .slice()
          .sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt))
          .map((entry) => ({
            from: entry.from || "Unmarked",
            to: entry.to,
            changedByName: entry.changedByName || "staff",
            reason: entry.reason || "",
            changedAt: entry.changedAt ? entry.changedAt.toISOString() : null,
          }));

        res.json({
          recordId: record._id.toString(),
          studentId: record.student?.toString?.() || null,
          currentStatus: record.status,
          history: entries,
        });
      } catch (err) {
        console.error("Attendance history error:", err);
        res.status(500).json({ error: "Failed to load attendance history." });
      }
    },
  );

  /**
   * Per-student attendance summary for the active session. Used by the
   * student detail drawer so the teacher sees an aggregate without re-querying
   * every mark in the institution.
   */
  app.get(
    "/api/attendance/sessions/:id/students/:studentMongoId/summary",
    requireAuth,
    requirePermission("attendance.view"),
    async (req, res) => {
      try {
        const session = await AttendanceSession.findById(req.params.id);
        if (!session) {
          return res.status(404).json({ error: "Session not found." });
        }

        const scope = await resolveDeliveryScope(req.user);
        if (scope.mode === "assigned") {
          const ownerId = String(session.facultyUser);
          const viewerId = String(req.user._id || req.user.id);
          if (ownerId !== viewerId) {
            return res.status(403).json({ error: "Access denied." });
          }
        }

        const student = await Student.findById(req.params.studentMongoId).populate("user");
        if (!student) {
          return res.status(404).json({ error: "Student not found." });
        }

        const sectionCodes = session.sectionCodes?.length
          ? session.sectionCodes
          : [session.sectionCode].filter(Boolean);

        const enrolled = await Enrollment.findOne({
          student: student._id,
          course: session.course,
          sectionCode: { $in: sectionCodes },
          status: "ENROLLED",
        });

        const currentMark = await Attendance.findOne({
          attendanceSession: session._id,
          student: student._id,
        });

        const history = await Attendance.find({ student: student._id })
          .populate("course")
          .sort({ date: -1 })
          .limit(20)
          .lean();

        const total = history.length;
        const attending = history.filter((row) =>
          ATTENDING_STATUSES.includes(row.status),
        ).length;
        const percentage = total ? Math.round((attending / total) * 100) : 0;

        res.json({
          student: {
            studentMongoId: String(student._id),
            studentId: student.studentId,
            name: `${student.firstName} ${student.lastName}`.trim(),
            section: student.section,
            batch: student.batch,
            program: student.program,
            semester: student.semester,
            avatarUrl: student.user?.avatarUrl || student.avatarUrl || null,
            attendancePercentage: percentage,
          },
          currentStatus: currentMark?.status || null,
          recentAttendance: history.map((row) => ({
            date: row.date,
            status: row.status,
            section: row.section,
            classType: row.classType,
            courseCode: row.course?.code || "",
            courseName: row.course?.name || "",
          })),
        });
      } catch (err) {
        console.error("Student summary error:", err);
        res.status(500).json({ error: "Failed to load student summary." });
      }
    },
  );

/** Aggregates per-status counts for a page of sessions in one pass. */
async function summariseSessions(sessions) {
  const sessionIds = sessions.map((session) => session._id);
  if (sessionIds.length === 0) return new Map();

  const rows = await Attendance.aggregate([
    { $match: { attendanceSession: { $in: sessionIds } } },
    { $group: { _id: { session: "$attendanceSession", status: "$status" }, count: { $sum: 1 } } },
  ]);

  const summaries = new Map();
  for (const session of sessions) {
    summaries.set(String(session._id), {
      Present: 0,
      Absent: 0,
      Late: 0,
      Bunk: 0,
      Excused: 0,
      Unmarked: 0,
    });
  }
  for (const row of rows) {
    const key = String(row._id.session);
    const entry = summaries.get(key);
    if (entry && entry[row._id.status] !== undefined) {
      entry[row._id.status] = row.count;
    }
  }
  return summaries;
}


}

