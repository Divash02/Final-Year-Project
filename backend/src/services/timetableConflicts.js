import { Timetable, AttendanceSession } from "../models/index.js";

/**
 * Timetable conflict detection.
 *
 * Runs on the server for every create and update, because a double-booked
 * teacher, room or cohort is an academic record error that a browser cannot be
 * trusted to prevent. Three conflict classes are checked:
 *
 * - Teacher: the same teacher in two places at once.
 * - Room: the same room hosting two sessions at once.
 * - Cohort: the same programme/batch/semester/section scheduled twice at once,
 *   which is the case a frontend "does the grid cell look full" check misses.
 *
 * Each conflict names the blocking session so the administrator can resolve it,
 * and an explicit, permission-gated override is possible for genuine cases
 * (a split group, an authorised room swap).
 */

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function dayIndexFromName(value) {
  const index = DAY_NAMES.indexOf(String(value || "").trim().toLowerCase());
  return index === -1 ? null : index;
}

export function dayNameFromIndex(index) {
  return DAY_NAMES[Number(index) % 7];
}

/** Minutes since midnight for an `HH:mm` wall-clock string. */
export function toMinutes(value) {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(value || "").trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function windowsOverlap(startA, endA, startB, endB) {
  if ([startA, endA, startB, endB].some((value) => value === null)) return false;
  return startA < endB && endA > startB;
}

/**
 * Two sessions can collide when they fall on the same calendar slot.
 *
 * A dated session only collides with sessions on that same date; a recurring
 * weekly slot collides with other recurring slots on the same weekday, and with
 * dated sessions on dates falling on that weekday.
 */
function sameDateScope(candidate, existing) {
  if (candidate.date && existing.date) return candidate.date === existing.date;
  const candidateDay = candidate.date
    ? dayIndexFromName(dayNameForDate(candidate.date))
    : dayIndexFromName(candidate.scheduledDay);
  const existingDay = existing.date
    ? dayIndexFromName(dayNameForDate(existing.date))
    : dayIndexFromName(existing.scheduledDay);
  return candidateDay !== null && candidateDay === existingDay;
}

function dayNameForDate(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return DAY_NAMES[date.getUTCDay()];
}

/**
 * Finds every blocking session for a candidate timetable entry.
 *
 * `excludeId` keeps an edited session from conflicting with itself.
 */
export async function detectSessionConflicts(candidate, { excludeId = null } = {}) {
  const start = toMinutes(candidate.startTime);
  const end = toMinutes(candidate.endTime);
  const conflicts = { teacher: [], room: [], cohort: [] };

  if (start === null || end === null || end <= start) return conflicts;

  const query = {
    _id: excludeId ? { $ne: excludeId } : { $ne: null },
    status: { $ne: "CANCELLED" },
    archivedAt: null,
  };
  if (candidate.date) query.date = candidate.date;
  else query.scheduledDay = candidate.scheduledDay;

  const candidates = await Timetable.find(query).lean();

  for (const existing of candidates) {
    if (!windowsOverlap(start, end, toMinutes(existing.startTime), toMinutes(existing.endTime))) {
      continue;
    }
    if (!sameDateScope(candidate, existing)) continue;

    if (
      String(existing.facultyUser) === String(candidate.facultyUser) &&
      conflicts.teacher.length < 5
    ) {
      conflicts.teacher.push(describe(existing));
    }
    const sameRoom =
      candidate.room &&
      existing.room &&
      candidate.room.trim().toLowerCase() === existing.room.trim().toLowerCase();
    if (sameRoom && conflicts.room.length < 5) {
      conflicts.room.push(describe(existing));
    }
    const sameCohort =
      String(existing.sectionCode).toUpperCase() === String(candidate.sectionCode).toUpperCase() &&
      Number(existing.semester) === Number(candidate.semester) &&
      (!candidate.batch || !existing.batch || candidate.batch === existing.batch);
    if (sameCohort && conflicts.cohort.length < 5) {
      conflicts.cohort.push(describe(existing));
    }
  }

  return conflicts;
}

export function hasAnyConflict(conflicts) {
  return Boolean(
    conflicts.teacher.length || conflicts.room.length || conflicts.cohort.length,
  );
}

/** Human-readable conflict summary returned to the administrator. */
export function describeConflicts(conflicts) {
  const messages = [];
  if (conflicts.teacher.length) {
    messages.push(
      `The teacher is already booked ${describeList(conflicts.teacher)}.`,
    );
  }
  if (conflicts.room.length) {
    messages.push(`The room is already allocated ${describeList(conflicts.room)}.`);
  }
  if (conflicts.cohort.length) {
    messages.push(
      `This cohort already has a session ${describeList(conflicts.cohort)}.`,
    );
  }
  return messages.join(" ");
}

function describeList(entries) {
  return entries
    .map((entry) => `for ${entry.scheduledDay} ${entry.startTime}–${entry.endTime} (${entry.label})`)
    .join(", ");
}

function describe(session) {
  return {
    id: String(session._id),
    scheduledDay: session.scheduledDay,
    date: session.date || null,
    startTime: session.startTime,
    endTime: session.endTime,
    room: session.room || null,
    sectionCode: session.sectionCode,
    label: `${session.sessionType || "REGULAR_CLASS"} · section ${session.sectionCode}`,
  };
}

/**
 * Starts a class session by linking it to the attendance architecture.
 *
 * The attendance session is created for the same course, section, date and time
 * window, then attached to the timetable session, so attendance, the timetable
 * and the course stay one connected academic record rather than three.
 */
export async function startTimetableSession(timetableSession, actorUserId) {
  const classDate = timetableSession.date || new Date().toISOString().slice(0, 10);

  // Timetable session types map onto the register's class types so a
  // class started from the timetable and a register opened from the
  // attendance workspace resolve to the same session — one class,
  // one register, regardless of which surface opened it.
  const classType =
    timetableSession.sessionType === "LAB"
      ? "Practical"
      : timetableSession.sessionType === "TUTORIAL"
        ? "Tutorial"
        : "Lecture";

  const existing = await AttendanceSession.findOne({
    course: timetableSession.course,
    facultyUser: timetableSession.facultyUser,
    date: classDate,
    classType,
    status: "OPEN",
  });

  if (existing) {
    // Widen the open register to this class's section so the
    // teacher records every section of the class in one place.
    if (!existing.sectionCodes.includes(timetableSession.sectionCode)) {
      existing.sectionCodes = [...existing.sectionCodes, timetableSession.sectionCode];
      if (!existing.sectionCode) existing.sectionCode = timetableSession.sectionCode;
      if (timetableSession.startTime) existing.startTime = timetableSession.startTime;
      if (timetableSession.endTime) existing.endTime = timetableSession.endTime;
      await existing.save();
    }
    timetableSession.attendanceSession = existing._id;
    timetableSession.status = "IN_PROGRESS";
    await timetableSession.save();
    return existing;
  }

  const attendanceSession = await AttendanceSession.create({
    course: timetableSession.course,
    facultyUser: timetableSession.facultyUser,
    sectionCode: timetableSession.sectionCode,
    sectionCodes: [timetableSession.sectionCode],
    academicYear: timetableSession.academicYear,
    batches: timetableSession.batch ? [timetableSession.batch] : [],
    semester: timetableSession.semester,
    classType,
    date: classDate,
    startTime: timetableSession.startTime,
    endTime: timetableSession.endTime,
    sessionName: classType,
    status: "OPEN",
    openedAt: new Date(),
    createdBy: actorUserId,
  });

  timetableSession.attendanceSession = attendanceSession._id;
  timetableSession.status = "IN_PROGRESS";
  await timetableSession.save();

  return attendanceSession;
}
