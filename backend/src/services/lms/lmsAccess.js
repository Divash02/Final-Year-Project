import {
  Course,
  CourseTeachingAssignment,
  Enrollment,
  Student,
} from "../../models/index.js";
import { getUserRoles } from "../../db.js";
import { hasPermission } from "../../permissions/catalog.js";
import { forbidden, notFound } from "../../utils/apiError.js";
import { requireObjectId } from "../../utils/validate.js";

/**
 * Course-level authorisation for the LMS.
 *
 * Two questions are answered here, and only ever from the session user:
 *
 *  1. May this account *teach* the course (and which sections)? Owners are the
 *     `CourseTeachingAssignment` records created by academic administration;
 *     curriculum staff are authorised institution-wide.
 *  2. May this account *study* the course? A student reaches a course only
 *     through a real `Enrollment` row for the course, never through a body or
 *     query parameter.
 *
 * Everything else in the LMS — weeks, materials, quizzes, attempts, grades —
 * inherits the decision made here, so the browser can never widen access by
 * hiding a control.
 */

/** Roles that administer curriculum institution-wide. */
export function hasCurriculumScope(user) {
  return hasPermission(getUserRoles(user), "courses.manage");
}

/** Teaching assignments of the signed-in teacher for one course. */
export async function listTeachingScopesForCourse(user, courseId) {
  const userId = user?._id || user?.id;
  if (!userId) return [];
  const rows = await CourseTeachingAssignment.find({ facultyUser: userId })
    .select("course sectionCode semester academicYear")
    .lean();
  return rows
    .filter((row) => String(row.course) === String(courseId))
    .map((row) => ({
      sectionCode: row.sectionCode,
      semester: row.semester,
      academicYear: row.academicYear,
    }));
}

/**
 * Resolves how the caller relates to a course.
 *
 * Returns `{ role: "manager" | "teacher" | "student" | "none", course, sections }`
 * where `sections` is the set of section codes the caller may deliver to.
 */
export async function resolveCourseScope(user, courseId, { semester } = {}) {
  const id = requireObjectId(courseId, "Course");
  const course = await Course.findById(id).lean();
  if (!course) throw notFound("Course not found.");

  if (hasCurriculumScope(user)) {
    return { role: "manager", course, sections: null };
  }

  const roles = getUserRoles(user);
  if (roles.includes("faculty") || roles.includes("staff")) {
    const scopes = await listTeachingScopesForCourse(user, id);
    const matching = semester
      ? scopes.filter((scope) => Number(scope.semester) === Number(semester))
      : scopes;
    if (matching.length) {
      return {
        role: "teacher",
        course,
        sections: matching.map((scope) => scope.sectionCode),
      };
    }
    // A teacher with no assignment for this course may still be an academic
    // administrator who only holds department-level rights; fall through to the
    // student check, which will simply report no enrolment.
  }

  const student = await Student.findOne({ user: user?._id || user?.id }).select("_id");
  if (student) {
    const enrolled = await Enrollment.findOne({
      student: student._id,
      course: id,
      status: "ENROLLED",
      ...(semester ? { semester: Number(semester) } : {}),
    }).select("sectionCode semester");
    if (enrolled) {
      return {
        role: "student",
        course,
        sections: [enrolled.sectionCode],
        student,
        enrollment: enrolled,
      };
    }
  }

  return { role: "none", course, sections: [] };
}

/**
 * Asserts the caller may create or change course content.
 *
 * A teacher may only act on a course they are assigned to teach, and a section
 * they post to must be one of their own — the same rule the attendance and
 * assignment modules already enforce.
 */
export async function assertCanManageCourse(
  user,
  courseId,
  { sectionCodes, semester } = {},
) {
  const scope = await resolveCourseScope(user, courseId, { semester });
  if (scope.role === "manager" || scope.role === "teacher") {
    if (scope.role === "teacher" && scope.sections?.length) {
      const requested = (sectionCodes || [])
        .map((code) => String(code).trim().toUpperCase())
        .filter(Boolean);
      const outside = requested.filter((code) => !scope.sections.includes(code));
      if (outside.length) {
        throw forbidden(
          `You are assigned to teach section${scope.sections.length > 1 ? "s" : ""} ${scope.sections.join(", ")}, not ${outside.join(", ")}.`,
        );
      }
    }
    return scope;
  }
  throw forbidden(
    "You are not authorised to manage learning content for this course.",
  );
}

/** Throws 404 when the caller may not even see the course exists. */
export async function assertCourseVisible(user, courseId, options = {}) {
  const scope = await resolveCourseScope(user, courseId, options);
  if (scope.role === "none") throw notFound("Course not found.");
  return scope;
}

export function canManageCourseContent(scope) {
  return scope?.role === "manager" || scope?.role === "teacher";
}

/** Enrolled, active students of a course — the roster every LMS view uses. */
export async function listEnrolledStudents({
  courseId,
  sectionCodes,
  semester,
  academicYear,
} = {}) {
  const filter = { status: "ENROLLED" };
  if (courseId) filter.course = String(courseId);
  if (semester) filter.semester = Number(semester);
  if (academicYear) filter.academicYear = academicYear;
  if (sectionCodes?.length) {
    filter.sectionCode = {
      $in: sectionCodes.map((code) => String(code).trim().toUpperCase()),
    };
  }

  const enrolments = await Enrollment.find(filter)
    .select("student sectionCode semester academicYear")
    .lean();
  if (!enrolments.length) return [];

  const students = await Student.find({
    _id: { $in: enrolments.map((row) => row.student) },
    status: "ACTIVE",
  })
    .select("studentId firstName lastName program batch semester section user")
    .sort({ studentId: 1 })
    .lean();

  const byStudent = new Map(
    enrolments.map((row) => [String(row.student), row.sectionCode]),
  );

  return students.map((student) => ({
    id: String(student._id),
    studentId: student.studentId,
    name: `${student.firstName || ""} ${student.lastName || ""}`.trim(),
    program: student.program,
    batch: student.batch,
    semester: student.semester,
    section: student.section,
    enrolledSection: byStudent.get(String(student._id)) || null,
    userId: student.user ? String(student.user) : null,
  }));
}

/** Distinct academic years and terms a course has been delivered in. */
export async function listCourseTerms(courseId) {
  const [teaching, enrolment] = await Promise.all([
    CourseTeachingAssignment.distinct("academicYear", { course: String(courseId) }),
    Enrollment.distinct("academicYear", { course: String(courseId) }),
  ]);
  return Array.from(new Set([...teaching, ...enrolment].filter(Boolean))).sort();
}

/**
 * Courses the caller may open, split by relationship.
 *
 * Backed by the real `CourseTeachingAssignment` and `Enrollment` records rather
 * than by role naming, so the course list on the LMS home screen is derived
 * from the same authority the rest of the module enforces.
 */
export async function listTeachingCourses(user) {
  const userId = user?._id || user?.id;
  if (!userId) return [];

  if (hasCurriculumScope(user)) {
    const courses = await Course.find({ status: { $ne: "ARCHIVED" } })
      .select("_id")
      .lean();
    return courses.map((course) => ({
      courseId: String(course._id),
      sectionCodes: null,
      semesters: [],
      role: "manager",
    }));
  }

  const rows = await CourseTeachingAssignment.find({ facultyUser: userId })
    .select("course sectionCode semester")
    .lean();
  const byCourse = new Map();
  for (const row of rows) {
    const key = String(row.course);
    const entry = byCourse.get(key) || {
      courseId: key,
      sectionCodes: [],
      semesters: [],
      role: "teacher",
    };
    if (row.sectionCode) entry.sectionCodes.push(row.sectionCode);
    if (row.semester) entry.semesters.push(row.semester);
    byCourse.set(key, entry);
  }
  return Array.from(byCourse.values());
}

/** Courses the caller is enrolled in, with the section they study. */
export async function listEnrolledCourses(user) {
  const userId = user?._id || user?.id;
  if (!userId) return [];
  const student = await Student.findOne({ user: userId }).select("_id");
  if (!student) return [];
  const rows = await Enrollment.find({ student: student._id, status: "ENROLLED" })
    .select("course sectionCode semester")
    .lean();
  return rows.map((row) => ({
    courseId: String(row.course),
    sectionCode: row.sectionCode || null,
    semester: row.semester ?? null,
  }));
}