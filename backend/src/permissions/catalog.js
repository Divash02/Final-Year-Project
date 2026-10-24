export const CORE_ROLES = [
  "student",
  "parent",
  "faculty",
  "program_coordinator",
  "hod",
  "registrar",
  "exam_officer",
  "finance_officer",
  "campus_admin",
  "dean",
  "super_admin",
];

/**
 * Roles that were folded into `super_admin` because they performed the same
 * administrative responsibilities. The map exists purely so accounts created
 * before the consolidation keep their access while their stored role strings
 * are migrated.
 */
export const LEGACY_ROLE_ALIASES = {
  institution_admin: "super_admin",
};

/**
 * Normalises a role list, replacing consolidated legacy roles with their
 * surviving equivalent. Applied wherever roles are read so authorization never
 * depends on a migration having already run.
 */
export function normalizeRoles(roles) {
  const list = Array.isArray(roles)
    ? roles
    : roles?.roles || (roles?.activeRole ? [roles.activeRole] : []);
  const normalized = [];
  for (const role of list) {
    if (typeof role !== "string" || !role) continue;
    const replacement = LEGACY_ROLE_ALIASES[role] || role;
    if (!normalized.includes(replacement)) normalized.push(replacement);
  }
  return normalized.length > 0 ? normalized : ["student"];
}

const roleGrants = {
  // Dashboard
  "dashboard.view": [
    "super_admin",
    "campus_admin",
    "dean",
    "hod",
    "program_coordinator",
    "registrar",
    "exam_officer",
    "finance_officer",
    "faculty",
    "student",
    "parent",
  ],

  // Accounts & RBAC
  "accounts.manage": ["super_admin"],
  "accounts.delete": ["super_admin"],
  "roles.manage": ["super_admin"],

  // Students Directory & Records
  "students.directory.view": [
    "super_admin",
    "campus_admin",
    "dean",
    "hod",
    "program_coordinator",
    "registrar",
    "exam_officer",
    "super_admin",
  ],
  "student.view.own": ["student"],
  "student.view.assigned": ["faculty"],
  "student.view.program": ["program_coordinator"],
  "student.view.department": ["hod"],
  "student.view.institution": ["registrar", "super_admin"],
  "student.update.profile": ["student", "registrar", "super_admin"],
  "student.update.official": ["registrar", "super_admin"],

  // Courses & Curriculum
  "courses.view": [
    "super_admin",
    "campus_admin",
    "dean",
    "hod",
    "program_coordinator",
    "registrar",
    "exam_officer",
    "faculty",
    "student",
    "parent",
  ],
  "courses.create": ["dean", "hod", "registrar", "super_admin"],
  "courses.manage": ["dean", "hod", "registrar", "super_admin"],
  "academics.teaching.assign": [
    "super_admin",
    "dean",
    "hod",
    "registrar",
  ],
  "sections.manage": ["super_admin", "dean", "hod", "registrar"],

  // Academic Calendar
  "calendar.view": [
    "super_admin",
    "campus_admin",
    "dean",
    "hod",
    "program_coordinator",
    "registrar",
    "exam_officer",
    "finance_officer",
    "faculty",
    "student",
    "parent",
  ],
  "calendar.manage": [
    "super_admin",
    "dean",
    "hod",
    "registrar",
    "program_coordinator",
  ],

  // Learning Materials (LMS content library)
  "materials.view": [
    "super_admin",
    "campus_admin",
    "dean",
    "hod",
    "program_coordinator",
    "registrar",
    "faculty",
    "student",
    "parent",
  ],
  // Teachers publish materials for the courses they are assigned to teach;
  // curriculum staff may publish for any course.
  "materials.create": [
    "faculty",
    "hod",
    "program_coordinator",
    "dean",
    "registrar",
    "super_admin",
  ],
  "materials.manage": [
    "hod",
    "program_coordinator",
    "dean",
    "registrar",
    "super_admin",
  ],

  // Timetable
  "timetable.view": [
    "super_admin",
    "campus_admin",
    "dean",
    "hod",
    "program_coordinator",
    "registrar",
    "exam_officer",
    "faculty",
    "student",
    "parent",
  ],
  "timetable.manage": [
    "super_admin",
    "dean",
    "hod",
    "program_coordinator",
    "registrar",
  ],
  /**
   * Explicit authority to keep a session that collides on teacher, room or
   * cohort. Held only by roles that can resolve a timetable clash institution-
   * wide, so an ordinary administrator still cannot silently double-book.
   */
  "timetable.override": ["super_admin", "dean", "hod", "registrar"],

  // Examinations — Granular Institutional Workflow Permissions
  "exam.view": [
    "super_admin",
    "dean",
    "hod",
    "program_coordinator",
    "registrar",
    "exam_officer",
    "faculty",
    "student",
  ],
  "exams.view": [
    "super_admin",
    "dean",
    "hod",
    "program_coordinator",
    "registrar",
    "exam_officer",
    "faculty",
    "student",
  ],
  "exam.create": ["exam_officer", "super_admin"],
  "exams.create": ["exam_officer", "super_admin"],
  "exam.edit": ["exam_officer", "super_admin"],
  "exams.update": ["exam_officer", "super_admin"],
  "exam.publish": ["exam_officer", "super_admin"],
  "exam.reschedule": ["exam_officer", "super_admin"],
  "exam.cancel": ["exam_officer", "super_admin"],
  "exam.manageCandidates": ["exam_officer", "super_admin"],
  "exam.manageRooms": ["exam_officer", "campus_admin", "super_admin"],
  "exam.manageInvigilators": ["exam_officer", "super_admin"],
  "exam.manageAttendance": ["exam_officer", "faculty", "super_admin"],
  "exam.manageResults": ["exam_officer", "faculty", "super_admin"],
  "exams.results.modify": ["exam_officer", "faculty", "super_admin"],
  "exam.verifyResults": ["exam_officer", "hod", "registrar", "super_admin"],
  "exam.publishResults": ["exam_officer", "registrar", "super_admin"],
  "exams.results.publish": ["exam_officer", "registrar", "super_admin"],
  "exam.viewAudit": ["exam_officer", "registrar", "super_admin"],
  "exam.results.submit": ["exam_officer", "faculty", "super_admin"],
  "exam.results.finalize": ["exam_officer", "registrar", "super_admin"],
  "exam.results.revoke": ["exam_officer", "registrar", "super_admin"],
  "exam.results.correct": ["exam_officer", "registrar", "super_admin"],
  "exam.results.view.own": ["student"],
  "exam.results.marksheet": ["exam_officer", "registrar", "super_admin", "faculty", "hod", "dean", "program_coordinator"],
  "exam.manageSeating": ["exam_officer", "super_admin"],
  "exam.seating.view.own": ["student"],

  // Attendance
  "attendance.view": [
    "super_admin",
    "campus_admin",
    "dean",
    "hod",
    "program_coordinator",
    "registrar",
    "exam_officer",
    "faculty",
    "student",
    "super_admin",
  ],
  "attendance.view.own": ["student"],
  "attendance.view.course": ["faculty", "hod", "program_coordinator"],
  "attendance.view.department": ["hod", "dean"],
  "attendance.view.institution": ["registrar", "super_admin"],
  "attendance.view.examEligibility": ["exam_officer", "registrar", "super_admin"],
  "attendance.create": ["faculty", "super_admin"],
  "attendance.session.create": ["faculty", "super_admin"],
  "attendance.edit": ["faculty", "super_admin"],
  "attendance.session.close": ["faculty", "super_admin"],
  "attendance.manual_mark": ["faculty", "super_admin"],
  "attendance.qr.checkin": ["student"],
  "attendance.reviewCorrection": ["hod", "dean", "super_admin"],
  "attendance.approveCorrection": ["hod", "registrar", "super_admin"],

  // Grades & Assessment
  "grade.view.own": ["student"],
  "grade.view.course": ["faculty", "hod", "program_coordinator"],
  "grade.enter": ["faculty", "super_admin"],
  "grade.submit": ["faculty", "super_admin"],
  "grade.review": ["hod", "dean", "super_admin"],
  "grade.verify": ["exam_officer", "registrar", "super_admin"],
  "grade.publishOfficialRecord": ["registrar", "super_admin"],

  // Assignments
  "assignments.view": [
    "super_admin",
    "faculty",
    "hod",
    "program_coordinator",
    "dean",
    "registrar",
    "student",
  ],
  "assignments.create": ["faculty", "hod", "program_coordinator", "super_admin"],
  "assignments.update": ["faculty", "hod", "program_coordinator", "super_admin"],
  "assignments.delete": ["faculty", "hod", "program_coordinator", "super_admin"],
  "assignments.grade": ["faculty", "hod", "program_coordinator", "super_admin"],

  // Learning Management System (weekly planner, quizzes, gradebook)
  // `lms.view` is the read gate for the course workspace; object-level rights
  // (do you teach it? are you enrolled?) are enforced in
  // `services/lms/lmsAccess.js`, never in the browser.
  "lms.view": [
    "super_admin",
    "campus_admin",
    "dean",
    "hod",
    "program_coordinator",
    "registrar",
    "exam_officer",
    "faculty",
    "student",
  ],
  /** Build and edit weeks, materials, assignments and announcements. */
  "lms.content.manage": [
    "faculty",
    "hod",
    "program_coordinator",
    "dean",
    "registrar",
    "super_admin",
  ],
  /** Author quizzes and questions, schedule them, publish them. */
  "lms.quiz.manage": [
    "exam_officer",
    "faculty",
    "hod",
    "program_coordinator",
    "dean",
    "registrar",
    "super_admin",
  ],
  /** Mark subjective answers and release results. */
  "lms.grade.manage": [
    "faculty",
    "hod",
    "program_coordinator",
    "dean",
    "registrar",
    "super_admin",
  ],
  /** Course engagement and risk reporting. */
  "lms.analytics.view": [
    "faculty",
    "hod",
    "program_coordinator",
    "dean",
    "registrar",
    "super_admin",
  ],
  /** Save and apply reusable course structures. */
  "lms.template.manage": [
    "faculty",
    "hod",
    "program_coordinator",
    "dean",
    "registrar",
    "super_admin",
  ],
  /** Institution-wide view of every course, used by academic administrators. */
  "lms.courses.oversight": ["super_admin", "dean", "registrar"],

  // Finance & Invoices
  "finance.fee.view": [
    "super_admin",
    "finance_officer",
    "registrar",
    "student",
    "super_admin",
  ],
  "finance.invoice.view": [
    "super_admin",
    "finance_officer",
    "student",
    "super_admin",
  ],
  "finance.invoice.create": ["finance_officer", "super_admin"],
  "finance.invoice.update": ["finance_officer", "super_admin"],
  "finance.invoice.delete": ["finance_officer", "super_admin"],
  "finance.payment.record": ["finance_officer", "super_admin"],
  "finance.payment.verify": ["finance_officer", "super_admin"],
  "finance.refund.create": ["finance_officer", "super_admin"],
  "finance.report.view": ["finance_officer", "super_admin"],

  // Admissions
  "admissions.application.view": [
    "super_admin",
    "registrar",
    "super_admin",
  ],
  "admissions.application.create": ["registrar", "super_admin"],
  "admissions.application.update": ["registrar", "super_admin"],
  "admissions.application.decide": ["registrar", "super_admin"],

  // Notices
  "notices.publish": [
    "super_admin",
    "hod",
    "program_coordinator",
    "registrar",
    "exam_officer",
    "finance_officer",
    "dean",
    "super_admin",
  ],
  "notices.view": [
    "super_admin",
    "campus_admin",
    "dean",
    "hod",
    "program_coordinator",
    "registrar",
    "exam_officer",
    "finance_officer",
    "faculty",
    "student",
    "parent",
    "super_admin",
  ],

  // Communication
  "mail.view": [
    "super_admin",
    "campus_admin",
    "dean",
    "hod",
    "program_coordinator",
    "registrar",
    "exam_officer",
    "finance_officer",
    "faculty",
    "student",
    "parent",
    "super_admin",
  ],
  "messages.view": [
    "super_admin",
    "campus_admin",
    "dean",
    "hod",
    "program_coordinator",
    "registrar",
    "exam_officer",
    "finance_officer",
    "faculty",
    "student",
    "parent",
    "super_admin",
  ],

  // Requests & Workflow
  "workflow.view": [
    "super_admin",
    "campus_admin",
    "dean",
    "hod",
    "program_coordinator",
    "registrar",
    "exam_officer",
    "finance_officer",
    "faculty",
    "student",
    "parent",
    "super_admin",
  ],
  "workflow.create": [
    "super_admin",
    "campus_admin",
    "dean",
    "hod",
    "program_coordinator",
    "registrar",
    "exam_officer",
    "finance_officer",
    "faculty",
    "student",
    "parent",
    "super_admin",
  ],
  "workflow.manage": [
    "super_admin",
    "campus_admin",
    "dean",
    "hod",
    "program_coordinator",
    "registrar",
    "exam_officer",
    "finance_officer",
    "faculty",
    "super_admin",
  ],

  // Documents & Library
  "documents.view": [
    "super_admin",
    "registrar",
    "dean",
    "student",
    "parent",
    "super_admin",
  ],
  "library.view": [
    "super_admin",
    "faculty",
    "student",
    "parent",
    "super_admin",
  ],

  // Analytics & Audit
  "analytics.view": [
    "super_admin",
    "campus_admin",
    "dean",
    "hod",
    "program_coordinator",
    "registrar",
    "finance_officer",
    "exam_officer",
    "super_admin",
  ],
  "audit.view": [
    "super_admin",
    "exam_officer",
    "registrar",
    "finance_officer",
  ],
  "profile.update.self": [
    "super_admin",
    "campus_admin",
    "dean",
    "hod",
    "program_coordinator",
    "registrar",
    "exam_officer",
    "finance_officer",
    "faculty",
    "student",
    "parent",
  ],

  // Online Coding Lab — students and faculty only. No administrative
  // or departmental role is granted access: the lab is a teaching and
  // learning tool, and hiding it from other menus is enforced here,
  // in the API middleware, and in the frontend navigation.
  "coding.lab.view": ["student", "faculty"],
  "coding.projects.manage": ["student", "faculty"],
  "coding.assignments.manage": ["faculty"],

  // Academic Collaboration & Decisions
  "collaboration.class_summaries.view": [
    "super_admin",
    "campus_admin",
    "dean",
    "hod",
    "program_coordinator",
    "registrar",
    "faculty",
    "student",
  ],
  "collaboration.class_summaries.create": [
    "faculty",
    "hod",
    "program_coordinator",
    "dean",
    "registrar",
    "super_admin",
  ],
  "collaboration.class_summaries.publish": [
    "faculty",
    "hod",
    "program_coordinator",
    "dean",
    "registrar",
    "super_admin",
  ],
  "collaboration.class_summaries.manage": [
    "hod",
    "program_coordinator",
    "dean",
    "registrar",
    "super_admin",
  ],

  "collaboration.discussions.view": [
    "super_admin",
    "campus_admin",
    "dean",
    "hod",
    "program_coordinator",
    "registrar",
    "faculty",
    "student",
  ],
  "collaboration.discussions.create": [
    "faculty",
    "hod",
    "program_coordinator",
    "dean",
    "registrar",
    "super_admin",
    "student",
  ],
  "collaboration.discussions.moderate": [
    "faculty",
    "hod",
    "program_coordinator",
    "dean",
    "registrar",
    "super_admin",
  ],
  "collaboration.discussions.manage": [
    "hod",
    "program_coordinator",
    "dean",
    "registrar",
    "super_admin",
  ],

  "collaboration.groups.view": [
    "super_admin",
    "campus_admin",
    "dean",
    "hod",
    "program_coordinator",
    "registrar",
    "faculty",
    "student",
  ],
  "collaboration.groups.create": [
    "faculty",
    "hod",
    "program_coordinator",
    "dean",
    "registrar",
    "super_admin",
  ],
  "collaboration.groups.manage": [
    "faculty",
    "hod",
    "program_coordinator",
    "dean",
    "registrar",
    "super_admin",
  ],
  "collaboration.groups.finalize": [
    "faculty",
    "hod",
    "program_coordinator",
    "dean",
    "registrar",
    "super_admin",
  ],
  "collaboration.group_membership.request": ["student"],
  "collaboration.group_membership.approve": [
    "faculty",
    "hod",
    "program_coordinator",
    "dean",
    "registrar",
    "super_admin",
  ],
  "collaboration.group_membership.assign": [
    "faculty",
    "hod",
    "program_coordinator",
    "dean",
    "registrar",
    "super_admin",
  ],

  "collaboration.proposals.view": [
    "super_admin",
    "campus_admin",
    "dean",
    "hod",
    "program_coordinator",
    "registrar",
    "faculty",
    "student",
  ],
  "collaboration.proposals.create": ["student"],
  "collaboration.proposals.review": [
    "faculty",
    "hod",
    "program_coordinator",
    "dean",
    "registrar",
    "super_admin",
  ],
  "collaboration.proposals.approve": [
    "faculty",
    "hod",
    "program_coordinator",
    "dean",
    "registrar",
    "super_admin",
  ],
  "collaboration.proposals.manage": [
    "hod",
    "program_coordinator",
    "dean",
    "registrar",
    "super_admin",
  ],

  "collaboration.decisions.view": [
    "super_admin",
    "campus_admin",
    "dean",
    "hod",
    "program_coordinator",
    "registrar",
    "faculty",
    "student",
  ],
  "collaboration.decisions.create": [
    "faculty",
    "hod",
    "program_coordinator",
    "dean",
    "registrar",
    "super_admin",
  ],
  "collaboration.decisions.publish": [
    "faculty",
    "hod",
    "program_coordinator",
    "dean",
    "registrar",
    "super_admin",
  ],
  "collaboration.decisions.revise": [
    "faculty",
    "hod",
    "program_coordinator",
    "dean",
    "registrar",
    "super_admin",
  ],
  "collaboration.decisions.manage": [
    "hod",
    "program_coordinator",
    "dean",
    "registrar",
    "super_admin",
  ],

  "collaboration.actions.view": [
    "super_admin",
    "campus_admin",
    "dean",
    "hod",
    "program_coordinator",
    "registrar",
    "faculty",
    "student",
  ],
  "collaboration.actions.manage": [
    "faculty",
    "hod",
    "program_coordinator",
    "dean",
    "registrar",
    "super_admin",
  ],

  "collaboration.acknowledgements.view": [
    "super_admin",
    "campus_admin",
    "dean",
    "hod",
    "program_coordinator",
    "registrar",
    "faculty",
    "student",
  ],
  "collaboration.acknowledgements.manage": [
    "faculty",
    "hod",
    "program_coordinator",
    "dean",
    "registrar",
    "super_admin",
  ],
};

export function getPermissionsForRoles(roles = []) {
  const roleSet = new Set(normalizeRoles(roles));
  return Object.entries(roleGrants)
    .filter(([, allowedRoles]) =>
      allowedRoles.some((role) => roleSet.has(role)),
    )
    .map(([permission]) => permission);
}

export function hasPermission(roles, permission) {
  return getPermissionsForRoles(normalizeRoles(roles)).includes(permission);
}

/**
 * Coarse resource/action check. Object-level ownership (for example "is this
 * teacher assigned to this course/section") is enforced in the route layer,
 * where the target document is available.
 */
export function can(user, resource, action) {
  if (!user) return false;
  return hasPermission(normalizeRoles(user), `${resource}.${action}`);
}

