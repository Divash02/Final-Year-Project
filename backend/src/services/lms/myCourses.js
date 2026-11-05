import {
  Assignment,
  Course,
  CourseTeachingAssignment,
  CourseWeek,
  Enrollment,
  InstitutionSetting,
  LearningMaterial,
  Quiz,
  QuizAttempt,
  Student,
  Submission,
  Attendance,
  User,
} from "../../models/index.js";
import { getUserRoles } from "../../db.js";
import { hasPermission } from "../../permissions/catalog.js";

/**
 * The current academic period.
 *
 * In Progress / Past / Future cannot be answered by comparing dates alone: the
 * institution decides which semester it is in, and that is institutional
 * configuration rather than something to infer from a clock. So the period is read
 * from `InstitutionSetting` when the academic office has published it, and only
 * then. When it has not, the period is derived from the caller's own real records
 * and flagged as derived, so the interface can say where the answer came from
 * instead of presenting an assumption as fact.
 */

const ACADEMIC_YEAR_KEY = "institution.academicYear";
const CURRENT_SEMESTER_KEY = "institution.currentSemester";

const DEFAULT_ACADEMIC_YEAR =
  process.env.COLLEGEOS_DEFAULT_ACADEMIC_YEAR || "2025/2026";

/** Parses "2025/2026" or "2025-2026" into a comparable start year. */
function academicYearStart(value) {
  const match = /^(\d{4})/.exec(String(value || "").trim());
  return match ? Number(match[1]) : null;
}

/**
 * Resolves the period the caller is being viewed against.
 *
 * @param {{ studentSemester?: number|null }} context
 * @returns {Promise<{ academicYear: string, semester: number|null,
 *   basis: "INSTITUTION" | "RECORDS", configured: boolean, note: string|null }>}
 */
export async function resolveAcademicPeriod({ studentSemester = null, records = [] } = {}) {
  const [yearSetting, semesterSetting] = await Promise.all([
    InstitutionSetting.findOne({ settingKey: ACADEMIC_YEAR_KEY }).lean(),
    InstitutionSetting.findOne({ settingKey: CURRENT_SEMESTER_KEY }).lean(),
  ]);

  const configuredYear = String(yearSetting?.settingValue || "").trim();
  const configuredSemesterRaw = semesterSetting?.settingValue;
  const configuredSemester = Number(configuredSemesterRaw || "");
  const hasConfiguredSemester = Number.isFinite(configuredSemester) && configuredSemester > 0;

  if (configuredYear && hasConfiguredSemester) {
    return {
      academicYear: configuredYear,
      semester: configuredSemester,
      basis: "INSTITUTION",
      configured: true,
      note: null,
    };
  }

  if (configuredYear && !hasConfiguredSemester) {
    const derivedSemester =
      Number.isFinite(studentSemester) && studentSemester > 0
        ? studentSemester
        : mostRecentSemester(records);
    const derivedFromRecords = records && records.length > 0;
    if (Number.isFinite(derivedSemester) && derivedSemester > 0) {
      return {
        academicYear: configuredYear,
        semester: derivedSemester,
        basis: derivedFromRecords ? "RECORDS" : "INSTITUTION",
        configured: derivedFromRecords ? false : true,
        note: derivedFromRecords
          ? "Current semester not published by the academic office; showing your enrolled/recorded semester."
          : null,
      };
    }
    return {
      academicYear: configuredYear,
      semester: null,
      basis: "INSTITUTION",
      configured: true,
      note: null,
    };
  }

  // Not published: fall back to the most recent period the caller's own records
  // actually contain, so the tabs still reflect real enrolments and assignments.
  // Other students' and cohorts' records in the same database must not shift the
  // caller's period.
  const derivedYearFromRecords = mostRecentAcademicYear(records);
  const derivedYear = derivedYearFromRecords || configuredYear || DEFAULT_ACADEMIC_YEAR;
  const derivedSemesterFromRecords = mostRecentSemester(records);
  const derivedSemester = Number.isFinite(studentSemester) && studentSemester > 0 ? studentSemester : derivedSemesterFromRecords;

  const derivedFromRecords = (records && records.length > 0) || (Number.isFinite(studentSemester) && studentSemester > 0);
  
  // If student has a clear authoritative semester assignment and records confirm consistent period,
  // don't show alarming warning about unpublished semester
  let note = null;
  if (derivedFromRecords) {
    const allRecordsConsistent = records && records.length > 0 && 
      records.every(r => {
        const rSem = Number(r.semester);
        const rYear = r.academicYear;
        return (!Number.isFinite(rSem) || rSem === derivedSemester) && 
               (!rYear || !derivedYearFromRecords || rYear === derivedYearFromRecords || rYear === derivedYear);
      });
    const studentSemesterMatches = Number.isFinite(studentSemester) && studentSemester > 0 && 
      (!Number.isFinite(derivedSemesterFromRecords) || derivedSemesterFromRecords === studentSemester);
    
    if (studentSemesterMatches && records && records.length > 0 && allRecordsConsistent) {
      // Valid enrollment context established from authoritative records - no alarming warning
      note = null;
    } else {
      note = "The academic office has not published the current semester, so this list is grouped by the periods found in your own records.";
    }
  } else {
    note = "The academic office has not published the current semester.";
  }
  
  return {
    academicYear: derivedYear,
    semester: Number.isFinite(derivedSemester) && derivedSemester > 0 ? derivedSemester : null,
    basis: "RECORDS",
    configured: false,
    note,
  };
}

/** Most recent academic year found in the caller's own records. */
function mostRecentAcademicYear(records) {
  const years = records
    .map((row) => row.academicYear)
    .filter(Boolean)
    .map((year) => ({ year, start: academicYearStart(year) }))
    .filter((entry) => entry.start !== null);
  if (!years.length) return null;
  years.sort((a, b) => b.start - a.start);
  return years[0].year;
}

/** Most recent semester found in the caller's own records. */
function mostRecentSemester(records) {
  const semesters = records
    .map((row) => Number(row.semester))
    .filter((value) => Number.isFinite(value) && value > 0);
  return semesters.length ? Math.max(...semesters) : null;
}

/**
 * Classifies one period-bearing record against the current period.
 *
 * Returns the bucket and, importantly, *why* — a course whose semester was never
 * recorded is reported as undated rather than silently treated as current.
 */
export function classifyPeriod(record, period) {
  const recordYear = academicYearStart(record.academicYear);
  const periodYear = academicYearStart(period.academicYear);

  if (recordYear !== null && periodYear !== null && recordYear !== periodYear) {
    return {
      bucket: recordYear > periodYear ? "future" : "past",
      basis: "ACADEMIC_YEAR",
    };
  }

  const recordSemester = Number(record.semester);
  if (!Number.isFinite(recordSemester) || recordSemester <= 0) {
    return { bucket: "undated", basis: "UNDATED" };
  }
  if (period.semester === null) {
    return { bucket: "undated", basis: "UNKNOWN_PERIOD" };
  }
  if (recordSemester === Number(period.semester)) {
    return { bucket: "current", basis: "SEMESTER" };
  }
  return {
    bucket: recordSemester > Number(period.semester) ? "future" : "past",
    basis: "SEMESTER",
  };
}

/**
 * Builds the My Courses read model for the signed-in account.
 *
 * One function serves every role, and the shape it returns is identical for all
 * of them. What differs is which real records the cards are built from:
 *
 *  - a student reaches a course only through an `Enrollment` row;
 *  - a teacher only through a `CourseTeachingAssignment` row;
 *  - an academic administrator sees the catalogue for oversight, with no claim to
 *    be enrolled in or teaching anything.
 *
 * Every number on a card is counted from a document that exists. Where the
 * institution retained nothing, the field is `null` and the interface says so
 * instead of substituting a default.
 */
export async function buildMyCourses(user) {
  const userId = user?._id || user?.id;
  const roles = getUserRoles(user);
  const isStudentRole = roles.includes("student") || roles.includes("parent");

  const student = await Student.findOne({ user: userId })
    .select("_id studentId semester section program batch academicYear")
    .lean();

  const overseesCatalogue = hasPermission(roles, "courses.manage");
  const teaches = isStudentRole && overseesCatalogue ? false : true;

  const enrolments = student
    ? await Enrollment.find({ student: student._id }).lean()
    : [];
  const teaching = teaches
    ? await CourseTeachingAssignment.find({ facultyUser: userId }).lean()
    : [];

  const period = await resolveAcademicPeriod({
    studentSemester: student?.semester ?? null,
    // Group the period by the caller's own records: a student's enrolments, a
    // teacher's teaching assignments, nothing for a pure catalogue viewer.
    records: isStudentRole ? enrolments : teaching,
  });

  const catalogue =
    overseesCatalogue && !student && !teaching.length
      ? await Course.find({ status: { $ne: "ARCHIVED" } })
          .select("code name program semester academicYear credits status department")
          .sort({ code: 1 })
          .lean()
      : [];

  /** @type {Map<string, any>} */
  const cards = new Map();

  const addCard = (key, seed) => {
    const existing = cards.get(key);
    if (existing) {
      if (seed.sectionCode && !existing.sectionCodes.includes(seed.sectionCode)) {
        existing.sectionCodes.push(seed.sectionCode);
      }
      if (!existing.relation) existing.relation = seed.relation;
      return existing;
    }
    const created = {
      courseId: seed.courseId,
      relation: seed.relation,
      status: seed.status ?? null,
      semester: seed.semester ?? null,
      academicYear: seed.academicYear ?? null,
      sectionCodes: seed.sectionCode ? [seed.sectionCode] : [],
      weeks: [],
    };
    cards.set(key, created);
    return created;
  };

  for (const row of enrolments) {
    const key = `E:${String(row.course)}:${row.semester ?? "?"}:${row.academicYear ?? "?"}`;
    const card = addCard(key, {
      courseId: String(row.course),
      relation: "ENROLLED",
      status: row.status,
      semester: row.semester,
      academicYear: row.academicYear,
      sectionCode: row.sectionCode || null,
    });
    card.enrollmentStatus = row.status;
  }

  for (const row of teaching) {
    const key = `T:${String(row.course)}:${row.semester ?? "?"}:${row.academicYear ?? "?"}`;
    const card = addCard(key, {
      courseId: String(row.course),
      relation: card_key_relation(cards, row),
      status: null,
      semester: row.semester,
      academicYear: row.academicYear,
      sectionCode: row.sectionCode || null,
    });
    if (!card.teaching) card.teaching = true;
    card.enrollmentStatus = card.enrollmentStatus ?? null;
  }

  for (const course of catalogue) {
    const key = `A:${String(course._id)}`;
    addCard(key, {
      courseId: String(course._id),
      relation: "OVERSIGHT",
      status: course.status,
      semester: course.semester,
      academicYear: course.academicYear,
    });
  }

  const courseIds = Array.from(cards.values()).map((card) => card.courseId);
  const courseDocs = courseIds.length
    ? await Course.find({ _id: { $in: courseIds } })
        .select(
          "code name program programCode department semester academicYear credits status description courseType",
        )
        .lean()
    : [];
  const courseById = new Map(courseDocs.map((row) => [String(row._id), row]));

  const buckets = { inProgress: [], past: [], future: [] };
  const now = new Date();

  for (const card of cards.values()) {
    const course = courseById.get(card.courseId);
    if (!course) continue;
    // Exclude archived or inactive courses from student course lists.
    if (String(course.status || "").toUpperCase() !== "ACTIVE") {
      continue;
    }

    const classified =
      card.relation === "OVERSIGHT"
        ? { bucket: "current", basis: "OVERSIGHT" }
        : classifyPeriod(card, period);

    const metrics = await buildCourseMetrics({
      card,
      student,
      now,
    });

    const payload = {
      courseId: card.courseId,
      code: course.code,
      name: course.name,
      description: course.description || "",
      department: course.department || null,
      program: course.program || course.programCode || null,
      credits: course.credits ?? null,
      courseType: course.courseType || "CORE",
      semester: card.semester ?? course.semester ?? null,
      academicYear: card.academicYear || course.academicYear || null,
      courseStatus: course.status || "ACTIVE",
      relation: card.relation,
      enrollmentStatus: card.enrollmentStatus ?? null,
      sectionCodes: card.sectionCodes,
      period: {
        bucket: classified.bucket,
        basis: classified.basis,
        undated: classified.bucket === "undated",
      },
      faculty: await resolveFacultyForCourse(card),
      metrics,
    };

    if (classified.bucket === "future") buckets.future.push(payload);
    else if (classified.bucket === "past") buckets.past.push(payload);
    else buckets.inProgress.push(payload);
  }

  const sortCards = (a, b) =>
    String(a.code).localeCompare(String(b.code), undefined, { numeric: true });

  buckets.inProgress.sort(sortCards);
  buckets.past.sort(sortCards);
  buckets.future.sort(sortCards);

  return {
    period: {
      academicYear: period.academicYear,
      semester: period.semester,
      basis: period.basis,
      configured: period.configured,
      note: period.note,
    },
    counts: {
      inProgress: buckets.inProgress.length,
      past: buckets.past.length,
      future: buckets.future.length,
    },
    courses: buckets,
    serverTime: now.toISOString(),
  };
}

/** A record is taught and enrolled only when it is genuinely both. */
function card_key_relation(cards, row) {
  const existing = cards.get(`E:${String(row.course)}:${row.semester ?? "?"}:${row.academicYear ?? "?"}`);
  return existing ? "ENROLLED_AND_TEACHING" : "TEACHING";
}

async function resolveFacultyForCourse(card) {
  if (card.relation === "OVERSIGHT") return [];
  const rows = await CourseTeachingAssignment.find({
    course: card.courseId,
    semester: card.semester ?? undefined,
  })
    .select("facultyUser")
    .lean();
  const ids = Array.from(
    new Set(
      rows
        .map((row) => String(row.facultyUser || ""))
        .filter((id) => /^[0-9a-f]{24}$/i.test(id)),
    ),
  );
  if (!ids.length) return [];
  const users = await User.find({ _id: { $in: ids } })
    .select("firstName middleName lastName")
    .lean();
  return users.map((entry) => ({
    id: String(entry._id),
    name: [entry.firstName, entry.middleName, entry.lastName].filter(Boolean).join(" "),
  }));
}

/**
 * Counts everything a course card is allowed to claim, from the documents that
 * hold it. Nothing here is estimated, and a count with no backing rows is null
 * rather than zero so an unrecorded course cannot look like an empty one.
 */
async function buildCourseMetrics({ card, student, now }) {
  const sectionCodes = card.sectionCodes.length ? card.sectionCodes : null;

  const [assignments, quizzes, materials, weeks] = await Promise.all([
    Assignment.find({
      course: card.courseId,
      status: { $ne: "ARCHIVED" },
      ...(card.semester ? { semester: card.semester } : {}),
      ...(sectionCodes ? { sectionCodes: { $in: sectionCodes } } : {}),
    })
      .select("_id dueAt status maxMarks")
      .lean(),
    Quiz.find({
      course: card.courseId,
      ...(card.semester ? { semester: card.semester } : {}),
      archivedAt: null,
    })
      .select("_id openAt closeAt status maxMarks")
      .lean(),
    LearningMaterial.find({
      course: card.courseId,
      status: "PUBLISHED",
      archivedAt: null,
      ...(card.semester ? { semester: card.semester } : {}),
    })
      .select("_id createdAt updatedAt")
      .lean(),
    CourseWeek.find({ course: card.courseId, status: { $ne: "ARCHIVED" } })
      .select("weekNumber title status publishedAt")
      .sort({ weekNumber: 1 })
      .lean(),
  ]);

  const assignmentIds = assignments.map((row) => String(row._id));

  const [submissions, attempts, attendance] = await Promise.all([
    student && assignmentIds.length
      ? Submission.find({
          student: student._id,
          assignment: { $in: assignmentIds },
        })
          .select("assignment status submittedAt gradedAt createdAt updatedAt")
          .lean()
      : Promise.resolve([]),
    student
      ? QuizAttempt.find({
          student: student._id,
          course: card.courseId,
        })
          .select("quiz status submittedAt gradedAt createdAt updatedAt awardedMarks")
          .lean()
      : Promise.resolve([]),
    student
      ? Attendance.find({
          student: student._id,
          course: card.courseId,
          ...(sectionCodes ? { section: { $in: sectionCodes } } : {}),
        })
          .select("status date createdAt")
          .lean()
      : Promise.resolve([]),
  ]);

  const attendanceMetric = summariseAttendance(attendance);
  const assignmentMetric = summariseAssignments(assignments, submissions, now);
  const quizMetric = summariseQuizzes(quizzes, attempts, now);
  const progressMetric = summariseProgress({
    assignments,
    submissions,
    quizzes,
    attempts,
  });

  const deadlines = [
    ...assignments
      .filter((row) => row.dueAt && new Date(row.dueAt) >= now && row.status === "OPEN")
      .map((row) => ({
        kind: "ASSIGNMENT",
        title: row._id ? String(row._id) : null,
        at: row.dueAt,
      })),
    ...quizzes
      .filter((row) => row.openAt && new Date(row.openAt) >= now)
      .map((row) => ({ kind: "QUIZ", title: String(row._id), at: row.openAt })),
  ]
    .sort((a, b) => new Date(a.at) - new Date(b.at));

  const lastActivityAt = latestTimestamp([
    ...submissions.flatMap((row) => [row.submittedAt, row.gradedAt, row.updatedAt]),
    ...attempts.flatMap((row) => [row.submittedAt, row.gradedAt, row.updatedAt]),
    ...materials.flatMap((row) => [row.updatedAt, row.createdAt]),
    ...attendance.map((row) => row.createdAt),
  ]);

  return {
    attendance: attendanceMetric,
    assignments: assignmentMetric,
    quizzes: quizMetric,
    materials: {
      total: materials.length,
      available: materials.length > 0,
    },
    weeks: {
      total: weeks.length,
      published: weeks.filter((week) => week.status === "PUBLISHED").length,
      list: weeks.map((week) => ({
        id: String(week._id),
        weekNumber: week.weekNumber,
        title: week.title,
        status: week.status,
        publishedAt: week.publishedAt || null,
      })),
    },
    progress: progressMetric,
    upcomingDeadline: deadlines.length
      ? {
          kind: deadlines[0].kind,
          at: deadlines[0].at,
          assignmentId: deadlines[0].kind === "ASSIGNMENT" ? deadlines[0].title : null,
          quizId: deadlines[0].kind === "QUIZ" ? deadlines[0].title : null,
        }
      : null,
    lastActivityAt,
  };
}

/** Attendance counts only recorded marks; no marks means no percentage. */
function summariseAttendance(records) {
  if (!records.length) {
    return { percentage: null, present: 0, absent: 0, late: 0, excused: 0, total: 0, recorded: false };
  }
  const tally = { Present: 0, Absent: 0, Late: 0, Excused: 0, Bunk: 0 };
  for (const row of records) {
    if (tally[row.status] === undefined) tally[row.status] = 0;
    tally[row.status] += 1;
  }
  const counted = tally.Present + tally.Late + tally.Excused;
  const denominator = counted + tally.Absent + tally.Bunk;
  return {
    percentage: denominator > 0 ? Math.round((counted / denominator) * 1000) / 10 : null,
    present: tally.Present,
    absent: tally.Absent,
    late: tally.Late,
    excused: tally.Excused,
    total: records.length,
    recorded: true,
  };
}

function summariseAssignments(assignments, submissions, now) {
  if (!assignments.length) {
    return { total: 0, submitted: 0, graded: 0, pending: 0, overdue: 0, available: false };
  }
  const byAssignment = new Map(submissions.map((row) => [String(row.assignment), row]));
  let submitted = 0;
  let overdue = 0;

  for (const assignment of assignments) {
    const submission = byAssignment.get(String(assignment._id));
    if (submission && submission.status !== "DRAFT") submitted += 1;
    if (
      assignment.status === "OPEN" &&
      assignment.dueAt &&
      new Date(assignment.dueAt) < now &&
      (!submission || submission.status === "DRAFT")
    ) {
      overdue += 1;
    }
  }

  // A grade only exists once a marker recorded it, so "graded" is counted from the
  // submission's own grading timestamp rather than inferred from its status.
  const graded = submissions.filter((row) => row.gradedAt).length;

  return {
    total: assignments.length,
    submitted,
    graded,
    pending: assignments.length - submitted,
    overdue,
    available: true,
  };
}

function summariseQuizzes(quizzes, attempts, now) {
  if (!quizzes.length) {
    return { total: 0, open: 0, attempted: 0, pendingManual: 0, available: false };
  }
  const quizIds = new Set(quizzes.map((row) => String(row._id)));
  const relevant = attempts.filter((row) => quizIds.has(String(row.quiz)));
  const open = quizzes.filter(
    (row) =>
      row.openAt &&
      new Date(row.openAt) <= now &&
      (!row.closeAt || new Date(row.closeAt) >= now),
  );
  return {
    total: quizzes.length,
    open: open.length,
    attempted: relevant.filter((row) => row.status !== "IN_PROGRESS").length,
    pendingManual: relevant.filter(
      (row) => row.status !== "IN_PROGRESS" && typeof row.awardedMarks !== "number",
    ).length,
    available: true,
  };
}

/**
 * Course progress, only when it can actually be counted.
 *
 * The denominator is work the cohort can demonstrably complete: published
 * assignments plus graded quizzes. When a course has no such work at all there is
 * nothing to divide, so progress is reported as unavailable rather than as 0% or
 * an invented figure.
 */
function summariseProgress({ assignments, submissions, quizzes, attempts }) {
  const trackable = assignments.length + quizzes.length;
  if (trackable === 0) {
    return { available: false, percentage: null, completed: 0, total: 0, reason: "NO_TRACKABLE_WORK" };
  }

  const submittedAssignments = new Set(
    submissions
      .filter((row) => row.status !== "DRAFT")
      .map((row) => String(row.assignment)),
  ).size;
  const completedQuizzes = new Set(
    attempts
      .filter((row) => row.status === "GRADED" || row.status === "SUBMITTED")
      .map((row) => String(row.quiz)),
  ).size;

  const completed = Math.min(submittedAssignments, assignments.length) + Math.min(completedQuizzes, quizzes.length);

  return {
    available: true,
    percentage: Math.round((completed / trackable) * 1000) / 10,
    completed,
    total: trackable,
    basis: "SUBMITTED_ASSIGNMENTS_AND_COMPLETED_QUIZZES",
  };
}

function latestTimestamp(values) {
  let latest = null;
  for (const value of values) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (Number.isFinite(time) && (latest === null || time > latest)) latest = time;
  }
  return latest === null ? null : new Date(latest).toISOString();
}