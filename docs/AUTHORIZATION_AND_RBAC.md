# CollegeOS — Authorization & RBAC

## Role Hierarchy

12 core roles (ascending privilege):

```
student < parent < faculty < program_coordinator < hod < registrar < exam_officer < finance_officer < campus_admin < dean < super_admin
```

**Legacy aliases** (migrated on boot): `institution_admin` → `super_admin`

Defined in: `backend/src/permissions/catalog.js` — `CORE_ROLES` array

## Permission Catalog (Authoritative Source)

`backend/src/permissions/catalog.js` exports:
- `CORE_ROLES` — ordered role list
- `LEGACY_ROLE_ALIASES` — consolidated role mappings
- `normalizeRoles(roles)` — replaces legacy roles, deduplicates
- `getPermissionsForRoles(roles)` → `string[]` — all permissions for role set
- `hasPermission(roles, permission)` → `boolean`
- `can(user, resource, action)` → `boolean` — coarse check
- `roleGrants` — **500+ line object** mapping permission → allowed roles

### Permission Categories

| Category | Example Permissions |
|----------|---------------------|
| Dashboard | `dashboard.view` |
| Accounts & RBAC | `accounts.manage`, `accounts.delete`, `roles.manage` |
| Students Directory | `students.directory.view`, `student.view.own`, `student.view.assigned`, `student.view.program`, `student.view.department`, `student.view.institution`, `student.update.profile`, `student.update.official` |
| Courses & Curriculum | `courses.view`, `courses.create`, `courses.manage`, `academics.teaching.assign`, `sections.manage` |
| Academic Calendar | `calendar.view`, `calendar.manage` |
| Learning Materials | `materials.view`, `materials.create`, `materials.manage` |
| Timetable | `timetable.view`, `timetable.manage`, `timetable.override` |
| Examinations | `exam.view`, `exam.create`, `exam.edit`, `exam.publish`, `exam.manageResults`, `exam.verifyResults`, `exam.publishResults`, `exam.results.submit`, `exam.results.finalize`, `exam.results.revoke`, `exam.results.correct`, `exam.results.view.own`, `exam.results.marksheet`, `exam.manageSeating` (exam_officer, super_admin), `exam.seating.view.own` (student) |
| Attendance | `attendance.view`, `attendance.view.own`, `attendance.view.course`, `attendance.view.department`, `attendance.view.institution`, `attendance.view.examEligibility`, `attendance.create`, `attendance.session.create`, `attendance.edit`, `attendance.session.close`, `attendance.manual_mark`, `attendance.qr.checkin`, `attendance.reviewCorrection`, `attendance.approveCorrection` |
| Grades & Assessment | `grade.view.own`, `grade.view.course`, `grade.enter`, `grade.submit`, `grade.review`, `grade.verify`, `grade.publishOfficialRecord` |
| Assignments | `assignments.view`, `assignments.create`, `assignments.update`, `assignments.delete`, `assignments.grade` |
| LMS | `lms.view`, `lms.content.manage`, `lms.quiz.manage`, `lms.grade.manage`, `lms.analytics.view`, `lms.template.manage`, `lms.courses.oversight` |
| Finance | `finance.fee.view`, `finance.invoice.view`, `finance.invoice.create`, `finance.invoice.update`, `finance.invoice.delete`, `finance.payment.record`, `finance.payment.verify`, `finance.refund.create`, `finance.report.view` |
| Admissions | `admissions.application.view`, `admissions.application.create`, `admissions.application.update`, `admissions.application.decide` |
| Notices | `notices.publish`, `notices.view` |
| Communication | `mail.view`, `messages.view` |
| Workflow | `workflow.view`, `workflow.create`, `workflow.manage` |
| Documents & Library | `documents.view`, `library.view` |
| Coding Lab | `coding.lab.view`, `coding.projects.manage` (student, faculty); `coding.assignments.manage` (faculty) |
| Analytics & Audit | `analytics.view`, `audit.view` |
| Profile | `profile.update.self` |

## Middleware Enforcement (`backend/src/middleware/auth.js`)

| Middleware | Purpose |
|------------|---------|
| `requireAuth` | Validates JWT + session + account status + password rotation |
| `requireRole(roles)` | Checks if user has any of the required roles |
| `requirePermission(perms)` | Checks if user's roles grant any of the permissions |
| `requireStudentScope(param)` | Allows access to own student record, or registrar/super_admin |
| `requireOwnStudent` | Allows access to own user ID, or faculty/registrar/super_admin |

**Usage in routes:**
```javascript
app.get("/api/protected", requireAuth, requirePermission("courses.manage"), handler);
app.get("/api/student/:id", requireAuth, requireStudentScope("id"), handler);
```

## Object-Level Authorization (`backend/src/services/accessControl.js`)

**Critical rule:** Request body/path identifiers are **never trusted**. Every helper re-derives scope from session user.

### Teaching Scope
```javascript
// True if user teaches course (optionally section/semester)
// Curriculum admins (courses.manage, academics.teaching.assign) bypass
await isTeachingAuthorized(user, { courseId, sectionCode, semester });
```

### Authorized Sections for Course
```javascript
// Returns section codes user may post to
// Curriculum admins → all sections in semester
// Faculty → only their assigned sections
await listAuthorisedSectionsForCourse(user, courseId, semester);
```

### Teaching Scopes (for form selectors)
```javascript
// All course/section/semester assignments for faculty user
await listTeachingScopes(user);
// Returns: [{ assignmentId, courseId, courseCode, courseName, sectionCode, semester, academicYear, program, courseStatus }]
```

### Audience Resolution
```javascript
// Builds MongoDB $or query for audience visibility
// Staff see all; students see ALL + SPECIFIC matching their cohort
buildAudienceVisibilityQuery(context);

// In-memory check for single record
audienceMatchesStudent(audience, context);
```

### Scoped Audience for Content Creation
```javascript
// Resolves audience from request body, falls back to caller's teaching cohort
// Throws if explicit audience is empty SPECIFIC
// Throws if no cohort can be derived (course has no sections)
resolveScopedAudience(body, { course, sectionCodes, semester, batch });
```

### Targeted Student Lists
```javascript
// Returns students matching course/section/semester/batch/program filters
// Used for assignment/material audience preview
await listTargetedStudents({ courseId, sectionCodes, semester, batchYears, programCodes });
```

### Staff Check
```javascript
// True if user has any staff role (not student/parent)
isStaffUser(user);
```

### Curriculum Management Check
```javascript
// True if user has courses.manage permission
canManageCurriculum(user);
```

### Institutional Publishing Check
```javascript
// True if user can publish institution-wide targeted content
canPublishTargetedContent(user);
```

## Frontend Permission Usage

- **API responses** include `user.permissions` array from `getPermissionsForRoles([activeRole])`
- **CollegeOSContext** stores `currentUser.permissions`
- **UI guards** check `permissions.includes("perm.name")` for conditional rendering
- **Never** authoritative — server re-validates on every write

## Route-Level Permission Mapping (Examples)

| Route Module | Key Permissions Used |
|--------------|---------------------|
| `auth.js` | None (public login), `requireAuth` for protected |
| `administration.js` | `accounts.manage`, `accounts.delete`, `roles.manage` |
| `academics.js` | `courses.view`, `courses.create`, `courses.manage`, `sections.manage`, `academics.teaching.assign` |
| `calendar.js` | `calendar.view`, `calendar.manage` |
| `materials.js` | `materials.view`, `materials.create`, `materials.manage` |
| `assignments.js` | `assignments.view`, `assignments.create`, `assignments.grade` |
| `lms.js` | `lms.view`, `lms.content.manage`, `lms.quiz.manage`, `lms.grade.manage` |
| `quizzes.js` | `lms.view`, `lms.quiz.manage`, `lms.grade.manage` |
| `timetable.js` | `timetable.view`, `timetable.manage`, `timetable.override` |
| `attendance.js` | `attendance.view`, `attendance.create`, `attendance.session.create`, `attendance.edit`, `attendance.qr.checkin` |
| `examinations.js` | `exam.view`, `exam.create`, `exam.manageResults`, `exam.publishResults` |
| `examSeating.js` | `exam.manageSeating` (manage), `exam.seating.view.own` (student read), `exam.view` (venue listing) |
| `finance.js` | `finance.invoice.view`, `finance.invoice.create`, `finance.payment.record` |
| `admissions.js` | `admissions.application.view`, `admissions.application.decide` |
| `reporting.js` | `analytics.view`, `audit.view` |
| `coding.js` | `coding.lab.view` (session), `coding.projects.manage` / `coding.assignments.manage` (faculty writes) |

## Attendance-Specific Scope (`backend/src/routes/attendance.js`)

```javascript
const STAFF_ATTENDANCE_ROLES = new Set([
  "super_admin", "campus_admin", "dean", "hod", "registrar", "exam_officer"
]);

// resolveDeliveryScope(user) returns:
// - { mode: "institution", roles } for staff roles above
// - { mode: "assigned", roles, assignments: CourseTeachingAssignment[] } for faculty

// checkDeliveryScope(scope, { courseId, sectionCodes }) enforces:
// - Institution mode: any course/section
// - Assigned mode: only user's assigned course+section combinations
```

## Testing Authorization

Integration tests in `backend/tests/` exercise:
- Positive cases: authorized roles can perform actions
- Negative cases: unauthorized roles receive 403
- Object-level: faculty cannot access other teachers' courses/sections
- Scope narrowing: unnamed sections default to caller's sections, not whole course

## Account Deletion Authorization

**Permission:** `accounts.delete` — granted only to `super_admin`

**Endpoint:** `DELETE /api/admin/users/:id`

**Authorization Rules:**
1. Only `super_admin` role can permanently delete user accounts
2. Self-deletion is prevented (403)
3. Deletion of the last active `super_admin` is prevented (403)
4. All other roles (including `registrar`, `dean`, `campus_admin`, etc.) receive 403
5. Unauthenticated requests receive 401

**Deletion Process:**
1. Verify target user exists
2. Verify actor has `accounts.delete` permission
3. Prevent self-deletion
4. Prevent deletion of last active super_admin
5. Delete User document
6. Delete associated Student/Staff profiles
7. Revoke all active sessions (invalidate JWT tokens)
8. Delete password reset tokens
9. Audit log the deletion with `ACCOUNT_DELETED` action

**Related Data Handling:**
- Student/Staff profiles: permanently deleted
- Sessions: all revoked (tokens invalidated)
- Password reset tokens: deleted
- Academic records (attendance, exams, grades): preserved per institutional policy
- Finance records (invoices, payments): preserved per institutional policy
- Messages, notices, files: handled per existing privacy/retention policies

## Related Files

| File | Purpose |
|------|---------|
| `backend/src/permissions/catalog.js` | Authoritative role→permission map |
| `backend/src/middleware/auth.js` | Middleware enforcement |
| `backend/src/services/accessControl.js` | Object-level authorization |
| `backend/src/routes/*.js` | Route-level permission usage |
| `backend/tests/*.test.js` | Authorization test cases |
| `frontend/src/context/CollegeOSContext.tsx` | Frontend permission cache |
| `api/contracts/*.md` | Documented auth requirements per endpoint |