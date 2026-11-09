import {
  Student,
  Course,
  CourseTeachingAssignment,
  Enrollment,
} from "../models/index.js";
import { getUserRoles } from "../db.js";
import { hasPermission } from "../permissions/catalog.js";
import { isEmptySpecificTarget, normalizeAudienceInput } from "../models/Audience.js";
import { validationError } from "../utils/apiError.js";

/**
 * Institutional audience + object-level authorisation.
 *
 * Two rules drive everything in this module:
 *
 * 1. Visibility of a targeted record is decided here, on the server, from the
 *    authenticated user and their real enrolment cohort. The browser never
 *    decides who may read a calendar event, a learning material or an
 *    assignment; hiding a card in React is presentation only.
 * 2. Identifiers arriving in a request body or path are never trusted. Every
 *    helper here re-derives the actor's own student, teaching scopes and
 *    permissions from the session user.
 */

/** Roles that operate the institution rather than study in it. */
export const STAFF_ROLES = [
  "faculty",
  "program_coordinator",
  "hod",
  "dean",
  "registrar",
  "exam_officer",
  "finance_officer",
  "campus_admin",
  "super_admin",
  "staff",
];

/** True when the account is institutional staff (not a student/parent account). */
export function isStaffUser(user) {
  const roles = getUserRoles(user);
  return roles.some((role) => STAFF_ROLES.includes(role));
}

/**
 * Resolves the actor's audience context from the session user.
 *
 * A student context carries the real enrolment cohort (programme, batch,
 * semester, section) read from the `Student` record, which is the single
 * student identity shared by admissions, attendance, assignments, exams,
 * finance and analytics.
 */
export async function getAudienceContext(user) {
  const roles = getUserRoles(user);
  const userId = user?._id || user?.id;
  const isStaff = isStaffUser(user);
  const student = isStaff
    ? null
    : await Student.findOne({ user: userId }).select(
        "studentId program batch semester section status",
      );

  return {
    userId: userId ? String(userId) : null,
    roles,
    isStaff,
    student: student
      ? {
          id: student._id.toString(),
          studentId: student.studentId,
          program: student.program ? String(student.program).toUpperCase() : null,
          batch: student.batch || null,
          semester: Number.isFinite(student.semester) ? student.semester : null,
          section: student.section ? String(student.section).toUpperCase() : null,
          status: student.status,
        }
      : null,
  };
}

/**
 * Mongo filter selecting the targeted documents an audience context may read.
 *
 * Dimension semantics (mirrored by `audienceMatchesStudent`): a dimension with
 * no values imposes no constraint, so "BSc IT 2025 Semester 4, all sections" is
 * reachable by a matching student even though `sectionCodes` is empty. Each
 * dimension therefore matches when it is absent, empty, or equal to the actor's
 * own value.
 */
export function buildAudienceVisibilityQuery(context) {
  if (context.isStaff) {
    // Staff see every targeted record; only an explicit staff-only audience
    // excludes a student, so it is included here as well.
    return {};
  }

  const or = [{ "audience.targetType": "ALL" }];
  const specific = { "audience.targetType": "SPECIFIC" };

  or.push({ ...specific, "audience.target.userIds": context.userId });
  or.push({ ...specific, "audience.target.roleIds": { $in: context.roles } });

  const student = context.student;
  if (student) {
    const dimensionMatches = (path, value) => ({
      $or: [
        { [path]: value },
        { [path]: { $size: 0 } },
        { [path]: { $exists: false } },
      ],
    });

    const cohort = [];
    if (student.program) {
      cohort.push(dimensionMatches("audience.target.programCodes", student.program));
    }
    if (student.batch) {
      cohort.push(dimensionMatches("audience.target.batchYears", student.batch));
    }
    if (Number.isFinite(student.semester)) {
      cohort.push(dimensionMatches("audience.target.semesters", student.semester));
    }
    cohort.push({
      $or: [
        { "audience.target.allSections": true },
        { "audience.target.sectionCodes": { $size: 0 } },
        { "audience.target.sectionCodes": { $exists: false } },
        ...(student.section
          ? [{ "audience.target.sectionCodes": student.section }]
          : []),
      ],
    });

    or.push({ $and: [{ ...specific }, ...cohort] });
  }

  return { $or: or };
}

/**
 * In-memory equivalent of `buildAudienceVisibilityQuery`, used for single-record
 * checks (`GET /api/materials/:id`) so a direct id request is authorised by the
 * same rules as a list query.
 */
export function audienceMatchesStudent(audience, context) {
  if (!audience || audience.targetType === "ALL") return true;
  if (audience.targetType === "STAFF") return Boolean(context.isStaff);

  const target = audience.target || {};
  const userIds = (target.userIds || []).map(String);
  const roleIds = target.roleIds || [];
  if (context.userId && userIds.includes(context.userId)) return true;
  if (roleIds.some((role) => context.roles.includes(role))) return true;

  const student = context.student;
  if (!student) return false;
  if (isEmptySpecificTarget(target)) return true;

  const programCodes = (target.programCodes || []).map((code) =>
    String(code).toUpperCase(),
  );
  if (programCodes.length && (!student.program || !programCodes.includes(student.program))) {
    return false;
  }

  const batchYears = target.batchYears || [];
  if (batchYears.length && !batchYears.includes(student.batch)) return false;

  const semesters = target.semesters || [];
  if (semesters.length && !semesters.includes(student.semester)) return false;

  const sectionCodes = (target.sectionCodes || []).map((code) =>
    String(code).toUpperCase(),
  );
  if (sectionCodes.length) {
    if (!student.section || !sectionCodes.includes(student.section)) return false;
  } else if (target.allSections === false && !student.section) {
    return false;
  }

  return true;
}

/** True when the actor may author targeted content for the whole institution. */
export function canPublishTargetedContent(user) {
  const roles = getUserRoles(user);
  return (
    hasPermission(roles, "calendar.manage") ||
    hasPermission(roles, "materials.manage") ||
    hasPermission(roles, "courses.manage")
  );
}

/** True when the actor may manage the curriculum (create, edit, archive courses). */
export function canManageCurriculum(user) {
  return hasPermission(getUserRoles(user), "courses.manage");
}

/**
 * Resolves the audience of course-scoped content (learning materials,
 * assignments) from the request, falling back to the cohort the content is
 * actually addressed to.
 *
 * Without this fallback a teacher posting to section A1 of Semester 4 produced
 * an audience of `ALL`, which published a Section 4 handout to every student in
 * the institution. An explicit `audience.targetType` in the request still wins,
 * so publishing institution-wide stays a deliberate choice.
 */
export function resolveScopedAudience(body, { course, sectionCodes, semester, batch } = {}) {
  const explicit = body?.audience;
  if (explicit && typeof explicit === "object" && explicit.targetType) {
    const audience = normalizeAudienceInput(explicit);
    if (audience.targetType === "SPECIFIC" && isEmptySpecificTarget(audience.target)) {
      throw validationError(
        "Choose who this is for: all students, or a specific programme, batch, semester and section.",
        [{ field: "audience", message: "Select an audience." }],
      );
    }
    return audience;
  }

  const codes = (sectionCodes || []).map((code) => String(code).trim().toUpperCase()).filter(Boolean);
  const target = {};
  if (course?.program) target.programCodes = [String(course.program).trim().toUpperCase()];
  if (batch || course?.batch) target.batchYears = [String(batch || course.batch)];
  if (semester) target.semesters = [Number(semester)];
  if (codes.length) target.sectionCodes = codes;

  const audience = normalizeAudienceInput({ targetType: "SPECIFIC", target });
  if (isEmptySpecificTarget(audience.target)) {
    throw validationError(
      "This course has no cohort to address. Choose the sections, semester or programme it is for.",
      [{ field: "audience", message: "Select an audience for this content." }],
    );
  }
  return audience;
}

/**
 * True when the account teaches the given course (optionally narrowed to a
 * section).
 *
 * Curriculum administrators are authorised institution-wide, resolved the same
 * way as `listAuthorisedSectionsForCourse` so the two never disagree about who
 * may publish or assign work.
 */
export async function isTeachingAuthorized(user, { courseId, sectionCode, semester } = {}) {
  const roles = getUserRoles(user);
  if (
    canManageCurriculum(user) ||
    hasPermission(roles, "academics.teaching.assign")
  ) {
    return true;
  }
  if (!roles.includes("faculty") && !roles.includes("staff")) return false;

  const userId = user?._id || user?.id;
  if (!userId) return false;

  const query = { facultyUser: userId };
  if (courseId) query.course = String(courseId);
  if (sectionCode) query.sectionCode = String(sectionCode).trim().toUpperCase();
  if (semester) query.semester = Number(semester);

  return (await CourseTeachingAssignment.countDocuments(query)) > 0;
}

/** Teaching scopes of the signed-in teacher, used to populate form selectors. */
export async function listTeachingScopes(user) {
  const userId = user?._id || user?.id;
  if (!userId) return [];
  const assignments = await CourseTeachingAssignment.find({ facultyUser: userId })
    .populate("course", "code name semester academicYear program department status")
    .sort({ academicYear: -1, semester: 1, sectionCode: 1 })
    .lean();
  return assignments.filter((assignment) => assignment.course).map((assignment) => ({
    assignmentId: String(assignment._id),
    courseId: String(assignment.course._id),
    courseCode: assignment.course.code,
    courseName: assignment.course.name,
    sectionCode: assignment.sectionCode,
    semester: assignment.semester,
    academicYear: assignment.academicYear,
    program: assignment.course.program || null,
    courseStatus: assignment.course.status,
  }));
}

/**
 * Section codes a teacher may post to for a course, honouring curriculum
 * administrators who are not tied to a teaching assignment.
 */
export async function listAuthorisedSectionsForCourse(user, courseId, semester) {
  if (canManageCurriculum(user) || hasPermission(getUserRoles(user), "academics.teaching.assign")) {
    const sections = await Course.findById(String(courseId))
      .select("semester")
      .lean();
    const targetSemester = semester || sections?.[0]?.semester || null;
    const query = targetSemester ? { semester: Number(targetSemester) } : {};
    const { Section } = await import("../models/index.js");
    const rows = await Section.find(query).select("code").sort({ code: 1 }).lean();
    return rows.map((row) => row.code);
  }
  const scopes = await listTeachingScopes(user);
  return scopes
    .filter(
      (scope) =>
        scope.courseId === String(courseId) &&
        (!semester || Number(scope.semester) === Number(semester)),
    )
    .map((scope) => scope.sectionCode);
}

/** Students the assignment/material targets, resolved server-side from enrolment. */
export async function listTargetedStudents({ courseId, sectionCodes, semester, batchYears, programCodes }) {
  const query = { status: "ACTIVE" };
  if (courseId) {
    const enrolled = await Enrollment.find({
      course: String(courseId),
      status: "ENROLLED",
      ...(semester ? { semester: Number(semester) } : {}),
      ...(sectionCodes?.length
        ? { sectionCode: { $in: sectionCodes.map((code) => String(code).toUpperCase()) } }
        : {}),
    }).select("student");
    query._id = { $in: enrolled.map((row) => row.student) };
  }
  if (programCodes?.length) query.program = { $in: programCodes.map((code) => String(code).toUpperCase()) };
  if (batchYears?.length) query.batch = { $in: batchYears.map(String) };
  if (semester) query.semester = Number(semester);

  const students = await Student.find(query)
    .select("studentId firstName lastName program batch semester section user")
    .sort({ studentId: 1 })
    .lean();
  return students.map((student) => ({
    id: String(student._id),
    studentId: student.studentId,
    name: `${student.firstName} ${student.lastName}`.trim(),
    program: student.program,
    batch: student.batch,
    semester: student.semester,
    section: student.section,
    userId: student.user ? String(student.user) : null,
  }));
}
