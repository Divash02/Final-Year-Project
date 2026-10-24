import { Enrollment, Student, TeachingProgress, Timetable } from "../models/index.js";
import { getUserRoles } from "../db.js";
import { hasPermission } from "../permissions/catalog.js";
import { notifyOnce } from "./lms/notifier.js";
import { detectSessionConflicts, hasAnyConflict, dayIndexFromName, toMinutes } from "./timetableConflicts.js";
import {
  listTimetableResolvers,
  describeActor,
  TIMETABLE_ACTION_URL,
  TIMETABLE_NOTIFICATION_CATEGORY,
} from "./timetableChanges.js";
import { getInstitutionTimeZone } from "./academicClock.js";

/**
 * My Timetable — the personal teaching/read schedule.
 *
 * The timetable used to be reachable only as a management grid and an attendance
 * entry form. This read model makes it a first-class daily surface: today, the
 * week, the month, the classes the caller actually owns, and the conflicts that
 * exist in the published timetable.
 *
 * Everything is derived from the same `Timetable` documents the registrar and the
 * conflict engine already use, so nothing here can drift from the official
 * schedule. No class is invented to fill a gap: an empty day reports that no
 * timetable has been published for the period.
 */

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Institution-local ISO date (`YYYY-MM-DD`) for an instant. */
export async function institutionDate(at = new Date()) {
  const zone = await getInstitutionTimeZone();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Institution-local weekday index (0 = Sunday) for an ISO date. */
function dayIndexForIsoDate(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.getUTCDay();
}

/** Institution-local weekday name for an ISO date. */
export function dayNameForIsoDate(isoDate) {
  const index = dayIndexForIsoDate(isoDate);
  return index === null ? null : DAY_NAMES[index];
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Monday-first week containing `isoDate`. */
function startOfWeek(isoDate) {
  const index = dayIndexForIsoDate(isoDate);
  if (index === null) return isoDate;
  const offset = index === 0 ? -6 : 1 - index;
  return addDays(isoDate, offset);
}

/** First and last ISO dates of the month containing `isoDate`. */
function monthBounds(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

/**
 * Builds the personal timetable.
 *
 * A teacher sees the sessions they deliver. A student sees the sessions their own
 * cohort is scheduled into — resolved from their real enrolment section, never
 * from a request parameter, so a student cannot read another section's schedule by
 * changing a query string.
 */
export async function buildMyTimetable(user, { view = "today", anchor = null } = {}) {
  const userId = user?._id || user?.id;
  const roles = getUserRoles(user);
  const timezone = await getInstitutionTimeZone();
  const today = anchor || (await institutionDate());
  const requestedView = ["today", "day", "week", "month"].includes(view) ? view : "today";

  const filter = { archivedAt: null, status: { $ne: "CANCELLED" } };

  /**
   * Students only ever read sessions whose lifecycle is `PUBLISHED`. Draft,
   * under-review and approved-but-unpublished sessions are invisible to them,
   * so an admin can keep building a schedule without a student seeing the
   * half-built version. Staff keep their existing scope: a teacher sees their
   * own sessions regardless of state, because they are the one delivering them.
   */
  let perspective = "TEACHER";
  const student = await Student.findOne({ user: userId })
    .select("_id program batch semester section")
    .lean();

  if (student && !roles.some((role) => ["faculty", "hod", "program_coordinator", "dean", "registrar", "super_admin", "campus_admin", "exam_officer"].includes(role))) {
    perspective = "STUDENT";
    filter.lifecycleState = "PUBLISHED";
    const enrolments = await Enrollment.find({
      student: student._id,
      status: "ENROLLED",
    })
      .select("course sectionCode semester")
      .lean();
    if (!enrolments.length) {
      return emptyTimetable({ timezone, today, view: requestedView, perspective });
    }
    filter.$or = enrolments.map((row) => ({
      course: row.course,
      sectionCode: row.sectionCode,
      semester: row.semester,
    }));
  } else {
    filter.facultyUser = userId;
  }

  const sessions = await Timetable.find(filter)
    .populate("course", "code name program semester credits")
    .populate("facultyUser", "firstName middleName lastName")
    .populate("attendanceSession", "status openedAt closedAt topic")
    .sort({ scheduledDay: 1, startTime: 1 })
    .lean();

  const decorated = await decorateSessions(sessions, { studentId: student?._id || null });
  const conflicts = await findConflicts(decorated);

  return buildView({
    decorated,
    conflicts,
    timezone,
    today,
    view: requestedView,
    perspective,
  });
}
function emptyTimetable({ timezone, today, view, perspective }) {
  return {
    timezone,
    today,
    view,
    perspective,
    days: [],
    entries: [],
    conflicts: { teacher: [], room: [], cohort: [], total: 0 },
    conflictCount: 0,
    published: false,
    changes: [],
  };
}

async function decorateSessions(sessions, { studentId }) {
  const courseIds = Array.from(
    new Set(sessions.map((row) => String(row.course?._id || row.course || ""))),
  ).filter(Boolean);

  const enrolments = courseIds.length
    ? await Enrollment.find({
        course: { $in: courseIds },
        status: "ENROLLED",
        ...(studentId ? { student: studentId } : {}),
      })
      .select("course sectionCode semester")
      .lean()
    : [];

  const counts = new Map();
  for (const row of enrolments) {
    const key = `${String(row.course)}|${row.sectionCode}|${row.semester}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  /**
   * What was actually taught in each of these classes.
   *
   * Joined on `TeachingProgress.timetableSession` — the same key a teacher picks in
   * the recording form — so a class carries the sessions declared against it rather
   * than a course-wide total that would include the other cohorts' classes. An empty
   * list means nothing was recorded for that class, which is a fact about the record
   * and not a claim that the class did not happen.
   */
  const progressBySession = await loadTeachingProgressBySession(
    sessions.map((row) => row._id),
  );

  return sessions.map((session) => {
    const teacher =
      session.facultyUser && typeof session.facultyUser === "object"
        ? session.facultyUser
        : null;
    const attendance =
      session.attendanceSession && typeof session.attendanceSession === "object"
        ? session.attendanceSession
        : null;
    const studentCount =
      counts.get(
        `${String(session.course?._id || session.course)}|${session.sectionCode}|${session.semester}`,
      ) || 0;

    return {
      id: String(session._id),
      courseId: String(session.course?._id || session.course || ""),
      courseCode: session.course?.code || null,
      courseName: session.course?.name || null,
      program: session.program || session.course?.program || null,
      semester: session.semester ?? null,
      sectionCode: session.sectionCode,
      batch: session.batch || null,
      academicYear: session.academicYear || null,
      room: session.room || null,
      building: session.building || null,
      scheduledDay: session.scheduledDay,
      dayIndex: dayIndexFromName(session.scheduledDay),
      date: session.date || null,
      startTime: session.startTime,
      endTime: session.endTime,
      sessionType: session.sessionType || "REGULAR_CLASS",
      status: session.status || "SCHEDULED",
      lifecycleState: session.lifecycleState || "DRAFT",
      version: session.version || 1,
      publishedAt: session.publishedAt || null,
      effectiveFrom: session.effectiveFrom || null,
      effectiveTo: session.effectiveTo || null,
      notes: session.notes || "",
      facultyUserId: String(teacher?._id || session.facultyUser || ""),
      facultyName: teacher
        ? [teacher.firstName, teacher.middleName, teacher.lastName].filter(Boolean).join(" ")
        : null,
      studentCount,
      attendanceSessionId: attendance ? String(attendance._id) : null,
      attendanceStatus: attendance?.status || null,
      attendanceRecorded: Boolean(attendance),
      classTopic: attendance?.topic || null,
      teaching: teachingSummary(progressBySession.get(String(session._id))),
      changes: Array.isArray(session.changes) ? session.changes : [],
      createdAt: session.createdAt || null,
      updatedAt: session.updatedAt || null,
    };
  });
}

/**
 * Teaching sessions declared against each timetable class, keyed by session id.
 *
 * A class can be taught from more than one material, so this is a list per class
 * rather than a single position. Ordered newest first, matching the order a teacher
 * reads a session log in.
 */
async function loadTeachingProgressBySession(sessionIds) {
  const ids = (sessionIds || []).filter(Boolean);
  if (!ids.length) return new Map();

  const records = await TeachingProgress.find({ timetableSession: { $in: ids } })
    .populate("material", "title version")
    .sort({ taughtOn: -1, createdAt: -1 })
    .lean();

  const grouped = new Map();
  for (const record of records) {
    const key = String(record.timetableSession);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({
      id: String(record._id),
      taughtOn: record.taughtOn,
      materialId: String(record.material),
      materialTitle:
        record.material && typeof record.material === "object" ? record.material.title : null,
      materialVersion: record.materialVersion || 1,
      fromUnit: record.fromUnit,
      toUnit: record.toUnit,
      totalUnits: record.totalUnits ?? null,
      unitLabel: record.unitLabel || "slide",
      topic: record.topic || "",
      nextStartUnit: record.nextStartUnit ?? null,
      sectionCode: record.sectionCode || null,
      sessionName: record.sessionName || "",
    });
  }
  return grouped;
}

/** The "nothing has been declared for this class" shape, so the field is never absent. */
function emptyTeachingSummary() {
  return { recordCount: 0, materialsTouched: 0, lastTaughtOn: null, records: [] };
}

/**
 * Declared teaching summarised for one class: how many records were
 * made, how many distinct materials they touched, the latest session
 * taught, and the records themselves, newest first.
 */
function teachingSummary(records) {
  const list = Array.isArray(records) ? records : [];
  if (!list.length) return emptyTeachingSummary();
  return {
    recordCount: list.length,
    materialsTouched: new Set(
      list.map((row) => row.materialId).filter(Boolean),
    ).size,
    lastTaughtOn: list[0].taughtOn || null,
    records: list,
  };
}

/**
 * Detects conflicts inside the returned schedule itself.
 *
 * The write path already refuses to double-book without an explicit override, so
 * this finds the sessions that were saved with one, or that became a conflict when
 * a related record later changed. They are surfaced, never hidden, because a
 * teacher who cannot see the clash will teach into it.
 */
async function findConflicts(entries) {
  const result = { teacher: [], room: [], cohort: [] };

  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const left = entries[i];
      const right = entries[j];

      const sameDay =
        left.date && right.date
          ? left.date === right.date
          : dayIndexFromName(left.scheduledDay) === dayIndexFromName(right.scheduledDay);
      if (!sameDay) continue;

      if (
        toMinutes(left.startTime) === null ||
        toMinutes(right.startTime) === null ||
        !overlaps(left, right)
      ) {
        continue;
      }

      const shared = {
        id: `${left.id}|${right.id}`,
        first: summarise(left),
        second: summarise(right),
        day: left.scheduledDay,
      };

      if (left.facultyUserId && left.facultyUserId === right.facultyUserId) {
        result.teacher.push({ ...shared, type: "TEACHER_CONFLICT" });
      }
      if (
        left.room &&
        right.room &&
        left.room.trim().toLowerCase() === right.room.trim().toLowerCase()
      ) {
        result.room.push({ ...shared, type: "ROOM_CONFLICT" });
      }
      if (
        String(left.sectionCode).toUpperCase() === String(right.sectionCode).toUpperCase() &&
        Number(left.semester) === Number(right.semester)
      ) {
        result.cohort.push({ ...shared, type: "SECTION_CONFLICT" });
      }
    }
  }

  return result;
}

function overlaps(left, right) {
  const aStart = toMinutes(left.startTime);
  const aEnd = toMinutes(left.endTime);
  const bStart = toMinutes(right.startTime);
  const bEnd = toMinutes(right.endTime);
  if ([aStart, aEnd, bStart, bEnd].some((value) => value === null)) return false;
  return aStart < bEnd && aEnd > bStart;
}

function summarise(entry) {
  return {
    id: entry.id,
    courseCode: entry.courseCode,
    courseName: entry.courseName,
    sectionCode: entry.sectionCode,
    startTime: entry.startTime,
    endTime: entry.endTime,
    room: entry.room,
    building: entry.building,
    facultyName: entry.facultyName,
    sessionType: entry.sessionType,
  };
}

function buildView({ decorated, conflicts, timezone, today, view, perspective }) {
  const conflictCount =
    conflicts.teacher.length + conflicts.room.length + conflicts.cohort.length;

  let window;
  if (view === "today" || view === "day") {
    window = { start: today, end: today };
  } else if (view === "week") {
    window = { start: startOfWeek(today), end: addDays(startOfWeek(today), 6) };
  } else {
    const bounds = monthBounds(today);
    window = { start: bounds.start, end: bounds.end };
  }

  /**
   * Dated sessions take precedence. A recurring weekly slot is resolved
   * to its occurrence inside the displayed period — the Monday of a week
   * view, the first Monday of a month view — so a class stays on the
   * grid for the whole period it is scheduled in, instead of jumping to
   * a future week the moment its weekday has passed.
   */
  const entryDate = (entry) => {
    if (entry.date) return entry.date;
    const target = dayIndexFromName(entry.scheduledDay);
    const startDay = dayIndexForIsoDate(window.start);
    if (target === null || startDay === null) {
      return nextOccurrence(entry.scheduledDay, today);
    }
    return addDays(window.start, (target - startDay + 7) % 7);
  };

  const all = decorated
    .map((entry) => ({ ...entry, occurrenceDate: entryDate(entry) }))
    .sort(
      (a, b) =>
        String(a.occurrenceDate).localeCompare(String(b.occurrenceDate)) ||
        String(a.startTime).localeCompare(String(b.startTime)),
    );

  const entries = all.filter(
    (entry) =>
      String(entry.occurrenceDate) >= window.start &&
      String(entry.occurrenceDate) <= window.end,
  );

  const days = [];
  if (view === "week") {
    for (let offset = 0; offset < 7; offset += 1) {
      const date = addDays(window.start, offset);
      const name = dayNameForIsoDate(date);
      days.push({
        date,
        dayName: name,
        isToday: date === today,
        entries: entries.filter((entry) => entry.occurrenceDate === date),
      });
    }
  } else if (view === "month") {
    for (const entry of entries) {
      let day = days.find((row) => row.date === entry.occurrenceDate);
      if (!day) {
        day = {
          date: entry.occurrenceDate,
          dayName: dayNameForIsoDate(entry.occurrenceDate),
          isToday: entry.occurrenceDate === today,
          entries: [],
        };
        days.push(day);
      }
      day.entries.push(entry);
    }
    days.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  } else {
    days.push({
      date: today,
      dayName: dayNameForIsoDate(today),
      isToday: true,
      entries,
    });
  }

  const changes = decorated
    .flatMap((entry) =>
      (entry.changes || []).map((change) => ({
        ...change,
        sessionId: entry.id,
        courseCode: entry.courseCode,
        courseName: entry.courseName,
        sectionCode: entry.sectionCode,
        startTime: entry.startTime,
        endTime: entry.endTime,
        room: entry.room,
      })),
    )
    .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime())
    .slice(0, 40);

  return {
    timezone,
    today,
    view,
    perspective,
    window,
    days,
    entries,
    conflicts: {
      teacher: conflicts.teacher,
      room: conflicts.room,
      cohort: conflicts.cohort,
      total: conflictCount,
    },
    conflictCount,
    published: decorated.length > 0,
    changes,
  };
}

/** Next calendar date, on or after `from`, that falls on `dayName`. */
function nextOccurrence(dayName, from) {
  const target = dayIndexFromName(dayName);
  if (target === null) return from;
  const current = dayIndexForIsoDate(from);
  if (current === null) return from;
  const delta = (target - current + 7) % 7;
  return addDays(from, delta);
}

/**
 * Files a conflict report against the timetable administrators.
 *
 * A teacher can see a clash and can escalate it; only a role that holds
 * `timetable.manage` can resolve it. The report is stored as a notification rather
 * than a bespoke queue, so it appears in the same place the recipient already
 * looks, and it names the exact sessions involved.
 */
export async function reportTimetableConflict(user, { sessionId, otherSessionId, note }) {
  const session = await Timetable.findById(sessionId)
    .populate("course", "code name")
    .populate("facultyUser", "firstName middleName lastName");
  if (!session) return null;

  const other = otherSessionId
    ? await Timetable.findById(otherSessionId)
        .populate("course", "code name")
    : null;

  const admins = await listTimetableResolvers();

  const teacherName = describeActor(
    session.facultyUser && typeof session.facultyUser === "object" ? session.facultyUser : null,
  );

  const body = [
    `${teacherName} reported a timetable conflict.`,
    session.course?.code
      ? `${session.course.code} · ${session.course.name} · section ${session.sectionCode} · ${session.scheduledDay} ${session.startTime}–${session.endTime}${session.room ? ` · ${session.room}` : ""}`
      : `Section ${session.sectionCode} · ${session.scheduledDay} ${session.startTime}–${session.endTime}`,
    other?.course
      ? `Overlaps ${other.course.code} · ${other.course.name} · section ${other.sectionCode} · ${other.startTime}–${other.endTime}${other.room ? ` · ${other.room}` : ""}`
      : null,
    note ? `Teacher note: ${note}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const created = [];
  for (const admin of admins) {
    created.push(
      await notifyOnce({
        userId: admin._id,
        title: "Timetable conflict reported",
        message: body,
        category: TIMETABLE_NOTIFICATION_CATEGORY,
        actionUrl: TIMETABLE_ACTION_URL,
        idempotencyKey: `timetable_conflict_${session._id}_${other?._id || "none"}_${admin._id}`,
        metadata: {
          sessionId: String(session._id),
          otherSessionId: other ? String(other._id) : null,
          reportedBy: String(user?._id || user?.id || ""),
        },
      }),
    );
  }

  return { recipients: admins.length, sessionId: String(session._id) };
}

export { detectSessionConflicts, hasAnyConflict };