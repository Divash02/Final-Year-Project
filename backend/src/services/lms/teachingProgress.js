import {
  AttendanceSession,
  LearningMaterial,
  TeachingProgress,
  Timetable,
} from "../../models/index.js";
import { validationError } from "../../utils/apiError.js";

/**
 * Teaching progress.
 *
 * One rule governs this whole service: CollegeOS may only report what a teacher
 * explicitly told it. Opening a deck increments a view counter; that is not
 * teaching. So every position in this module originates from a teacher-confirmed
 * record, and the read model is careful to label the two apart:
 *
 *  - "Opened" — a passive access fact, from the material's own view counters.
 *  - "Taught through slide 12" — a declared teaching position, from these records.
 *
 * The "where was I" answer is therefore only ever as good as the teacher's last
 * confirmation, and the interface says so rather than implying the system is
 * tracking the class.
 */

/** Validates and normalises one teaching-position declaration. */
export function readTeachingProgressPayload(body = {}, { totalUnits = null, unitLabel = "slide" } = {}) {
  const fromUnit = requireUnit(body.fromUnit, "Starting slide/page", 1);
  const toUnit = requireUnit(body.toUnit, "Ending slide/page", 1);
  if (toUnit < fromUnit) {
    throw validationError("The ending position cannot be before the starting position.", [
      { field: "toUnit", message: "Enter an ending position at or after the start." },
    ]);
  }

  const knownTotal = Number(totalUnits);
  const declaredTotal = body.totalUnits === undefined || body.totalUnits === null || body.totalUnits === ""
    ? null
    : requireUnit(body.totalUnits, "Total slides/pages", 1);

  const resolvedTotal = declaredTotal ?? (Number.isFinite(knownTotal) && knownTotal > 0 ? knownTotal : null);

  if (resolvedTotal && toUnit > resolvedTotal) {
    throw validationError(
      `The ending position (${toUnit}) is beyond the end of the document (${resolvedTotal}).`,
      [{ field: "toUnit", message: `This document has ${resolvedTotal} units.` }],
    );
  }

  const nextStartUnit =
    body.nextStartUnit === undefined || body.nextStartUnit === null || body.nextStartUnit === ""
      ? null
      : requireUnit(body.nextStartUnit, "Next starting point", 1);

  return {
    fromUnit,
    toUnit,
    totalUnits: resolvedTotal,
    unitLabel: body.unitLabel && ["slide", "page", "section"].includes(body.unitLabel)
      ? body.unitLabel
      : unitLabel,
    nextStartUnit,
    topic: body.topic === undefined ? undefined : String(body.topic || "").trim().slice(0, 500),
    notes: body.notes === undefined ? undefined : String(body.notes || "").trim().slice(0, 4000),
    sessionName: body.sessionName === undefined
      ? undefined
      : String(body.sessionName || "").trim().slice(0, 120),
    sessionStartTime: body.sessionStartTime || null,
    sessionEndTime: body.sessionEndTime || null,
    classType: body.classType ? String(body.classType).slice(0, 40) : null,
    sectionCodes: normaliseSectionCodes(body.sectionCodes),
    taughtOn: normaliseDate(body.taughtOn),
    timetableSessionId: body.timetableSessionId || null,
    attendanceSessionId: body.attendanceSessionId || null,
    weekId: body.weekId || null,
  };
}

/**
 * Resolves a timetable class session into the teaching context it already holds.
 *
 * This is what stops double entry: the teacher picks today's class from the
 * timetable once, and the course, section, week, time window and attendance
 * session all come from that existing record rather than being typed again.
 */
export async function resolveClassSession(timetableSessionId) {
  if (!timetableSessionId) return null;
  const session = await Timetable.findById(timetableSessionId)
    .populate("course", "code name")
    .populate("facultyUser", "_id firstName lastName")
    .populate("attendanceSession", "_id status date startTime endTime");
  if (!session) return null;

  return {
    courseId: String(session.course?._id || session.course),
    /** Whose class this is. A teaching record must not be filed under someone else's. */
    facultyUserId: String(session.facultyUser?._id || session.facultyUser || ""),
    semester: session.semester ?? null,
    sectionCode: session.sectionCode,
    sectionCodes: [session.sectionCode],
    date: session.date,
    startTime: session.startTime,
    endTime: session.endTime,
    sessionName: session.sessionType
      ? `${session.sessionType} · ${session.sectionCode}`
      : session.sectionCode,
    attendanceSessionId: session.attendanceSession
      ? String(session.attendanceSession._id)
      : null,
  };
}

/**
 * Records one teaching session against one material version.
 *
 * `lastTaught` is a convenience read of the most recent declaration, stored as its
 * own column so the "where was I" answer is a single indexed lookup rather than a
 * sort over the whole history. It is written from the teacher's own record and is
 * never advanced by opening the file.
 */
export async function recordTeachingProgress({ material, actor, payload }) {
  const unitLabel = payload.unitLabel || material.documentMeta?.unitLabel || "slide";
  const knownTotal = payload.totalUnits ?? material.documentMeta?.unitCount ?? null;

  const record = await TeachingProgress.create({
    course: material.course,
    material: material._id,
    materialVersion: material.version || 1,
    sectionCode: payload.sectionCodes[0] || null,
    sectionCodes: payload.sectionCodes.length
      ? payload.sectionCodes
      : material.sectionCodes || [],
    facultyUser: actor._id || actor.id,
    taughtOn: payload.taughtOn,
    sessionStartTime: payload.sessionStartTime || null,
    sessionEndTime: payload.sessionEndTime || null,
    sessionName: payload.sessionName || "",
    classType: payload.classType || null,
    fromUnit: payload.fromUnit,
    toUnit: payload.toUnit,
    totalUnits: knownTotal,
    unitLabel,
    topic: payload.topic || "",
    notes: payload.notes || "",
    nextStartUnit:
      payload.nextStartUnit ?? (knownTotal && payload.toUnit < knownTotal ? payload.toUnit + 1 : null),
    week: payload.weekId || material.week || null,
    timetableSession: payload.timetableSessionId || null,
    attendanceSession: payload.attendanceSessionId || null,
  });

  // Keep the material's own "last taught" marker in step with the newest record.
  const update = {
    $set: {
      lastTaughtAt: record.taughtOn,
      lastTaughtFromUnit: record.fromUnit,
      lastTaughtToUnit: record.toUnit,
    },
  };
  if (record.topic) update.$set.lastTaughtTopic = record.topic;
  if (record.notes) update.$set.lastTaughtNotes = record.notes;
  await LearningMaterial.updateOne({ _id: material._id }, update);

  return record;
}

/**
 * The teaching position for one material, with its full history.
 *
 * `progress` is null unless the document length is actually known — a bar drawn
 * against a guess would be worse than no bar, because it looks authoritative.
 */
export async function buildTeachingProgress(materialId, { limit = 30 } = {}) {
  const material = await LearningMaterial.findById(materialId)
    .populate("course", "code name")
    .populate("week", "weekNumber title")
    .lean();
  if (!material) return null;

  const records = await TeachingProgress.find({ material: material._id })
    .populate("facultyUser", "firstName middleName lastName")
    .sort({ taughtOn: -1, createdAt: -1 })
    .limit(Math.min(Math.max(Number(limit) || 30, 1), 100))
    .lean();

  const latest = records[0] || null;
  const totalUnits = latest?.totalUnits ?? material.documentMeta?.unitCount ?? null;
  const unitLabel = latest?.unitLabel || material.documentMeta?.unitLabel || "slide";

  return {
    material: {
      id: String(material._id),
      title: material.title,
      version: material.version || 1,
      weekNumber: material.week?.weekNumber ?? null,
      weekTitle: material.week?.title ?? null,
      courseId: String(material.course?._id || material.course),
      courseCode: material.course?.code || null,
      fileName: material.file?.originalName || null,
      documentMeta: material.documentMeta || null,
      /** Passive access facts, kept explicitly separate from teaching. */
      opened: {
        firstViewedAt: material.firstViewedAt || null,
        viewCount: material.viewCount || 0,
        downloadCount: material.downloadCount || 0,
      },
    },
    documentLength: {
      known: Boolean(totalUnits && totalUnits > 0),
      totalUnits: totalUnits || null,
      unitLabel,
    },
    position: latest
      ? {
          fromUnit: latest.fromUnit,
          toUnit: latest.toUnit,
          topic: latest.topic || "",
          notes: latest.notes || "",
          taughtOn: latest.taughtOn,
          sectionCode: latest.sectionCode || null,
          sessionName: latest.sessionName || "",
          startTime: latest.sessionStartTime || null,
          endTime: latest.sessionEndTime || null,
          recordedBy: latest.facultyUser
            ? [
                latest.facultyUser.firstName,
                latest.facultyUser.middleName,
                latest.facultyUser.lastName,
              ]
                .filter(Boolean)
                .join(" ")
            : null,
          recordedAt: latest.createdAt,
          nextStartUnit:
            latest.nextStartUnit ??
            (totalUnits && latest.toUnit < totalUnits ? latest.toUnit + 1 : null),
          percentage:
            totalUnits && totalUnits > 0
              ? Math.min(100, Math.round((latest.toUnit / totalUnits) * 1000) / 10)
              : null,
        }
      : null,
    records: records.map(serialiseRecord),
    recordCount: records.length,
  };
}

/** Course-level teaching history, ordered newest first. */
export async function buildCourseTeachingHistory(courseId, { sectionCodes = null, limit = 60 } = {}) {
  const records = await TeachingProgress.find({
    course: courseId,
    ...(sectionCodes?.length ? { sectionCodes: { $in: sectionCodes } } : {}),
  })
    .populate("material", "title version week")
    .populate("facultyUser", "firstName middleName lastName")
    .sort({ taughtOn: -1, createdAt: -1 })
    .limit(Math.min(Math.max(Number(limit) || 60, 1), 200))
    .lean();

  const next = records.reduce((furthest, row) => {
    const value = Number(row.nextStartUnit);
    if (!Number.isFinite(value)) return furthest;
    return furthest === null ? value : Math.max(furthest, value);
  }, null);

  return {
    records: records.map((row) => ({
      ...serialiseRecord(row),
      materialTitle: row.material?.title || null,
      materialVersion: row.material?.version || row.materialVersion || 1,
      weekNumber: row.material?.week?.weekNumber ?? null,
      facultyName: row.facultyUser
        ? [row.facultyUser.firstName, row.facultyUser.middleName, row.facultyUser.lastName]
            .filter(Boolean)
            .join(" ")
        : null,
    })),
    total: records.length,
    nextUnit: next,
    unitLabel: records[0]?.unitLabel || "slide",
  };
}

function serialiseRecord(row) {
  return {
    id: String(row._id),
    taughtOn: row.taughtOn,
    fromUnit: row.fromUnit,
    toUnit: row.toUnit,
    totalUnits: row.totalUnits ?? null,
    unitLabel: row.unitLabel || "slide",
    topic: row.topic || "",
    notes: row.notes || "",
    nextStartUnit: row.nextStartUnit ?? null,
    sectionCode: row.sectionCode || null,
    sessionName: row.sessionName || "",
    startTime: row.sessionStartTime || null,
    endTime: row.sessionEndTime || null,
    classType: row.classType || null,
    materialId: String(row.material),
    materialVersion: row.materialVersion || 1,
    timetableSessionId: row.timetableSession ? String(row.timetableSession) : null,
    attendanceSessionId: row.attendanceSession ? String(row.attendanceSession) : null,
    recordedAt: row.createdAt,
  };
}

function requireUnit(value, label, min) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min) {
    throw validationError(`${label} must be a whole number of at least ${min}.`, [
      { field: label.startsWith("Total") ? "totalUnits" : label.startsWith("Next") ? "nextStartUnit" : "toUnit", message: "Enter a valid position." },
    ]);
  }
  return parsed;
}

function normaliseSectionCodes(value) {
  if (value === undefined || value === null || value === "") return [];
  const list = Array.isArray(value) ? value : String(value).split(",");
  return Array.from(
    new Set(
      list
        .map((entry) => String(entry ?? "").trim().toUpperCase())
        .filter(Boolean),
    ),
  );
}

function normaliseDate(value) {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    throw validationError("The teaching date must be a valid date.", [
      { field: "taughtOn", message: "Choose the date this class was taught." },
    ]);
  }
  return parsed.toISOString().slice(0, 10);
}

/**
 * Marks the attendance session for a teaching record, so a class is described once.
 *
 * The topic captured here is the same field the attendance register already shows,
 * so a teacher does not restate "what we covered" in two places.
 */
export async function attachTopicToAttendanceSession(attendanceSessionId, topic) {
  if (!attendanceSessionId || !topic) return;
  await AttendanceSession.updateOne(
    { _id: attendanceSessionId, topic: { $in: ["", null] } },
    { $set: { topic: String(topic).slice(0, 500) } },
  );
}