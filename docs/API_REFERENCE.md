# CollegeOS — API Reference

## Base URL
- Development: `http://localhost:4000/api`
- Production: Configured via `VITE_API_BASE_URL`
- All endpoints prefixed with `/api`

## Authentication
- **Bearer token** in `Authorization` header
- Token issued by `POST /api/auth/login` (8h expiry)
- Session validated against MongoDB `Session` collection (SHA-256 token hash)
- Invalid/expired/revoked token → `401 { error: "Invalid or expired session." }`

## Error Format
All errors return structured JSON:
```json
{
  "error": "Human-readable message",
  "code": "ERROR_CODE",
  "details": [{ "field": "fieldName", "message": "Validation detail" }]
}
```
Common HTTP status codes:
- `400` — Bad request (validation)
- `401` — Unauthenticated / invalid session
- `403` — Forbidden (insufficient permissions / account status)
- `404` — Not found
- `422` — Unprocessable (business rule violation)
- `429` — Rate limited
- `500` — Server error (logged, opaque reference returned)
- `501` — Not implemented (forgot-password)

## Route Modules (Registration Order)

| Module | File | Base Path | Auth |
|--------|------|-----------|------|
| Health | `health.js` | `/health` | None |
| Authentication | `auth.js` | `/auth` | Mixed |
| Administration | `administration.js` | `/admin` | `requireAuth` + `accounts.manage` |
| Academics | `academics.js` | `/courses`, `/sections`, `/programs`, `/departments`, `/enrollments`, `/teaching-assignments` | `requireAuth` + permissions |
| Academic Calendar | `calendar.js` | `/calendar/events`, `/calendar/documents` | `requireAuth` + permissions |
| Learning Materials | `materials.js` | `/learning-materials` | `requireAuth` + permissions |
| Assignments | `assignments.js` | `/assignments`, `/submissions` | `requireAuth` + permissions |
| LMS (Planner) | `lms.js` | `/lms/courses`, `/lms/weeks`, `/lms/materials`, `/lms/templates`, `/lms/questions`, `/lms/announcements` | `requireAuth` + `lms.view` + object-level |
| Quizzes | `quizzes.js` | `/lms/quizzes`, `/lms/attempts` | `requireAuth` + `lms.quiz.manage` / `lms.grade.manage` |
| Timetable (Admin) | `timetable.js` | `/timetable` | `requireAuth` + `timetable.manage` |
| My Timetable | `myTimetable.js` | `/my-timetable` | `requireAuth` + `timetable.view` |
| Files | `files.js` | `/files` | `requireAuth` + entitlement |
| Notices | `notices.js` | `/notices` | `requireAuth` + permissions |
| Communication | `communication.js` | `/mail`, `/messages`, `/notifications` | `requireAuth` + permissions |
| Workflow | `workflow.js` | `/workflow` | `requireAuth` + permissions |
| Reporting | `reporting.js` | `/reporting` | `requireAuth` + `analytics.view` / `audit.view` |
| Finance | `finance.js` | `/finance` | `requireAuth` + finance permissions |
| Admissions | `admissions.js` | `/admissions` | `requireAuth` + admissions permissions |
| Examinations | `examinations.js` | `/examinations` | `requireAuth` + exam permissions |
| Profile | `profile.js` | `/profile` | `requireAuth` |
| Departmental | `departmental.js` | `/departmental` | `requireAuth` + departmental permissions |
| Attendance | `attendance.js` | `/attendance` | `requireAuth` + attendance permissions |
| Coding Lab | `coding.js` | `/coding` | `requireAuth` + `student`/`faculty` role + `coding.lab.view` |

## Key Endpoints by Domain

### Authentication (`/api/auth`)
| Method | Path | Permissions | Description |
|--------|------|-------------|-------------|
| `POST` | `/login` | None | Login, returns `{ token, user, mustChangePassword }` |
| `GET` | `/me` | `requireAuth` | Current user + active role + permissions |
| `POST` | `/change-password` | `requireAuth` | Change password, revokes all sessions |
| `POST` | `/logout` | `requireAuth` | Revoke current session |
| `POST` | `/forgot-password` | None | Returns `501` |
| `POST` | `/reset-password` | None | Accepts valid reset token |
| `POST` | `/active-role` | `requireAuth` | Switch active role |
| `GET` | `/roles` | `requireAuth` | List assignable roles |

### Administration (`/api/admin`)
| Method | Path | Permissions | Description |
|--------|------|-------------|-------------|
| `GET` | `/users` | `accounts.manage` | List users with pagination |
| `POST` | `/users` | `accounts.manage` | Create user (returns temporary password) |
| `PATCH` | `/users/:id` | `accounts.manage` | Update user (roles, status, etc.) |
| `DELETE` | `/users/:id` | `accounts.delete` | Permanently delete user account (super_admin only) |
| `GET` | `/users/:id` | `accounts.manage` | Get user details |
| `POST` | `/users/:id/reset-password` | `accounts.manage` | Generate temporary password |
| `POST` | `/users/:id/activate` | `accounts.manage` | Activate account |
| `GET` | `/roles` | `roles.manage` | List roles with permissions |
 
 **`DELETE /api/admin/users/:id` — Permanently Delete User Account**
 
 **Permissions:** `accounts.delete` (super_admin only)
 
 **Description:** Permanently removes a user account and all authentication credentials from the database. This is not a soft delete — the user document is physically removed.
 
 **Authorization Rules:**
 - Only `super_admin` role can invoke this endpoint
 - Self-deletion is rejected (403)
 - Deletion of the last active `super_admin` is rejected (403)
 - All other roles receive 403
 - Unauthenticated requests receive 401
 
 **Deletion Process:**
 1. Verify target user exists
 2. Verify actor has `accounts.delete` permission
 3. Prevent self-deletion
 4. Prevent deletion of last active super_admin
 5. Delete User document
 6. Delete associated Student/Staff profiles
 7. Revoke all active sessions (invalidate JWT tokens)
 8. Delete password reset tokens
 9. Audit log the deletion (`ACCOUNT_DELETED` action)
 
 **Related Data Handling:**
 - Student/Staff profiles: permanently deleted
 - Sessions: all revoked (tokens invalidated)
 - Password reset tokens: deleted
 - Academic records (attendance, exams, grades): preserved per institutional policy
 - Finance records (invoices, payments): preserved per institutional policy
 - Messages, notices, files: handled per existing privacy/retention policies
 
 **Success Response (200):**
 ```json
 {
   "success": true,
   "message": "Account permanently deleted.",
   "deletedUser": {
     "id": "user_id",
     "email": "user@college.edu.np",
     "name": "Full Name",
     "roles": ["student"]
   }
 }
 ```
 
 **Error Responses:**
 - `401` — Unauthenticated
 - `403` — Insufficient permissions / self-deletion / last super_admin
 - `404` — User not found
 - `500` — Server error
 
 ### Academics (`/api`)
| Method | Path | Permissions | Description |
|--------|------|-------------|-------------|
| `GET` | `/courses` | `courses.view` | List courses (paginated, filterable) |
| `POST` | `/courses` | `courses.create` | Create course |
| `GET` | `/courses/:id` | `courses.view` | Get course |
| `PATCH` | `/courses/:id` | `courses.manage` | Update course |
| `DELETE` | `/courses/:id` | `courses.manage` | Archive course |
| `GET` | `/sections` | `sections.manage` | List sections |
| `POST` | `/sections` | `sections.manage` | Create section |
| `GET` | `/programs` | `courses.view` | List programs |
| `POST` | `/programs` | `courses.manage` | Create program |
| `GET` | `/departments` | `courses.view` | List departments |
| `POST` | `/departments` | `courses.manage` | Create department |
| `GET` | `/enrollments` | `courses.view` | List enrollments |
| `POST` | `/enrollments` | `academics.teaching.assign` | Enroll student |
| `GET` | `/teaching-assignments` | `academics.teaching.assign` | List teaching assignments |
| `POST` | `/teaching-assignments` | `academics.teaching.assign` | Assign faculty |

### My Courses (`/api`)
| Method | Path | Permissions | Description |
|--------|------|-------------|-------------|
| `GET` | `/my-courses` | `courses.view` | Current user's courses (inProgress/past/future) |

### LMS — Course Workspace (`/api/lms`)
| Method | Path | Permissions | Description |
|--------|------|-------------|-------------|
| `GET` | `/courses` | `lms.view` | Courses user teaches/studies (split by role) |
| `GET` | `/courses/:id/overview` | `lms.view` | Course overview + access verdict |
| `GET` | `/courses/:id/activity` | `lms.view` | Course activity feed |
| `GET` | `/courses/:id/weeks` | `lms.view` | Course weeks |
| `POST` | `/courses/:id/weeks` | `lms.content.manage` | Create week |
| `GET` | `/weeks/:id` | `lms.view` | Week detail (objectives, materials, assignments, quizzes) |
| `PATCH` | `/weeks/:id` | `lms.content.manage` | Update week |
| `POST` | `/weeks/:id/publish` | `lms.content.manage` | Publish week |
| `POST` | `/weeks/:id/duplicate` | `lms.content.manage` | Duplicate week |
| `POST` | `/weeks/:id/objectives` | `lms.content.manage` | Add objectives |
| `DELETE` | `/objectives/:id` | `lms.content.manage` | Remove objective |
| `POST` | `/weeks/:id/materials` | `lms.content.manage` | Upload material (multipart) |
| `PATCH` | `/materials/:id` | `lms.content.manage` | Update material metadata |
| `POST` | `/materials/:id/status` | `lms.content.manage` | Change material status |
| `GET` | `/materials/:id/teaching-progress` | `lms.view` + `canManage` | Teaching progress + history |
| `POST` | `/materials/:id/teaching-progress` | `lms.content.manage` | Record teaching session |
| `GET` | `/courses/:id/teaching-history` | `lms.view` + `canManage` | Course teaching history |
| `GET` | `/courses/:id/quizzes` | `lms.view` | Course quizzes + access verdict |
| `POST` | `/courses/:id/quizzes` | `lms.quiz.manage` | Create quiz |
| `GET` | `/quizzes/:id` | `lms.view` | Quiz detail (teacher/student payload) |
| `POST` | `/quizzes/:id/questions` | `lms.quiz.manage` | Add question |
| `DELETE` | `/quizzes/:id/questions/:qid` | `lms.quiz.manage` | Remove question |
| `POST` | `/quizzes/:id/status` | `lms.quiz.manage` | Set quiz status |
| `POST` | `/quizzes/:id/release-results` | `lms.quiz.manage` | Release results (MANUAL policy) |
| `DELETE` | `/quizzes/:id` | `lms.quiz.manage` | Archive/delete quiz |
| `PATCH` | `/quizzes/:id` | `lms.quiz.manage` | Update quiz config |
| `GET` | `/quizzes/:id/attempt` | `lms.view` | Attempt availability |
| `POST` | `/quizzes/:id/attempts` | `lms.view` | Start/resume attempt |
| `PUT` | `/attempts/:id/answers` | `lms.view` | Autosave answers |
| `POST` | `/attempts/:id/integrity` | `lms.view` | Record integrity event |
| `POST` | `/attempts/:id/submit` | `lms.view` | Submit attempt |
| `GET` | `/attempts/:id/result` | `lms.view` | Student result |
| `GET` | `/quizzes/:id/attempts` | `lms.grade.manage` | Attempt roster |
| `GET` | `/attempts/:id/grading` | `lms.grade.manage` | Grading sheet |
| `POST` | `/attempts/:id/grade` | `lms.grade.manage` | Grade attempt |
| `GET` | `/courses/:id/grades` | `lms.grade.manage` | Gradebook |
| `GET` | `/courses/:id/progress` | `lms.view` | Course progress |
| `GET` | `/courses/:id/weekly-progress` | `lms.view` | Weekly progress |
| `GET` | `/courses/:id/analytics` | `lms.analytics.view` | Engagement |
| `GET` | `/courses/:id/risk-signals` | `lms.analytics.view` | Risk signals |
| `GET` | `/courses/:id/announcements` | `lms.view` | Announcements |
| `POST` | `/courses/:id/announcements` | `lms.content.manage` | Create announcement |
| `DELETE` | `/announcements/:id` | `lms.content.manage` | Delete announcement |
| `GET` | `/templates` | `lms.template.manage` | Course templates |
| `POST` | `/templates/:id/apply` | `lms.template.manage` | Apply template |
| `GET` | `/questions` | `lms.content.manage` | Question bank |
| `POST` | `/questions` | `lms.content.manage` | Create bank question |
| `DELETE` | `/questions/:id` | `lms.content.manage` | Delete bank question |

### Learning Materials — Course Library (`/api/learning-materials`)
| Method | Path | Permissions | Description |
|--------|------|-------------|-------------|
| `GET` | `/learning-materials` | `materials.view` | Course materials (search, filter, paginate) |
| `POST` | `/learning-materials` | `materials.create` | Upload material (multipart) |
| `GET` | `/learning-materials/:id` | `materials.view` | Material detail + canManage |
| `PATCH` | `/learning-materials/:id` | `materials.manage` | Update material |
| `POST` | `/learning-materials/:id/file` | `materials.manage` | Replace file (new revision) |
| `POST` | `/learning-materials/:id/status` | `materials.manage` | Change status |
| `DELETE` | `/learning-materials/:id` | `materials.manage` | Delete material |

### Assignments (`/api/assignments`, `/api/submissions`)
| Method | Path | Permissions | Description |
|--------|------|-------------|-------------|
| `GET` | `/assignments` | `assignments.view` | List assignments (filterable) |
| `POST` | `/assignments` | `assignments.create` | Create assignment |
| `GET` | `/assignments/:id` | `assignments.view` | Assignment detail + roster |
| `PATCH` | `/assignments/:id` | `assignments.update` | Update assignment |
| `DELETE` | `/assignments/:id` | `assignments.delete` | Archive assignment |
| `POST` | `/assignments/:id/submissions` | `assignments.view` (student) | Submit assignment (multipart) |
| `GET` | `/submissions/mine` | `assignments.view` (student) | Student's submissions |
| `GET` | `/submissions/:id` | `assignments.grade` | Submission detail |
| `POST` | `/submissions/:id/grade` | `assignments.grade` | Grade submission |
| `GET` | `/files/:id/download` | Entitlement check | Download submission file |

### Timetable (`/api/timetable`, `/api/my-timetable`)
| Method | Path | Permissions | Description |
|--------|------|-------------|-------------|
| `GET` | `/timetable` | `timetable.view` | Timetable slots (filterable) |
| `POST` | `/timetable` | `timetable.manage` | Create slot |
| `PATCH` | `/timetable/:id` | `timetable.manage` | Update slot |
| `DELETE` | `/timetable/:id` | `timetable.manage` | Archive slot |
| `POST` | `/timetable/check-conflicts` | `timetable.manage` | Check conflicts |
| `POST` | `/timetable/resolve-conflicts` | `timetable.override` | Force create with conflicts |
| `GET` | `/my-timetable` | `timetable.view` | Personal timetable (faculty/student) |
| `GET` | `/my-timetable/faculty` | `timetable.view` | Faculty teaching schedule |
| `GET` | `/my-timetable/student` | `timetable.view` | Student class schedule |

### Files (`/api/files`)
| Method | Path | Permissions | Description |
|--------|------|-------------|-------------|
| `POST` | `/files` | `requireAuth` | Upload file (multipart) |
| `GET` | `/files/:id` | `requireAuth` + entitlement | Download/stream file |
| `DELETE` | `/files/:id` | `requireAuth` + ownership | Delete file |
| `GET` | `/files/:id/info` | `requireAuth` + entitlement | File metadata |

**Entitlement rules:** Student → own submissions/avatars/notice attachments addressed to them; Faculty → own uploads + student submissions for courses they teach + own notice attachments; Admin → all. Stored-file modules include `notice_attachment` (served inline for preview, bytes via `/api/files/:id`).

### Notices (`/api/notices`)
Rich-text notices with a draft/publish/archive lifecycle and file attachments.
The body is stored twice: `content` (plain text, legacy clients) and
`contentHtml` (sanitized rich HTML — strict allow-list on write, re-sanitized
on render). Drafts are invisible to every reader except the author and notice
managers.

| Method | Path | Permissions | Description |
|--------|------|-------------|-------------|
| `GET` | `/notices` | `notices.view` | List notices (audience-filtered, published only) |
| `GET` | `/notices/:id` | `notices.view` | Notice detail (draft visible to author/managers) |
| `POST` | `/notices` | `notices.publish` | Create notice; `status: "DRAFT"` saves a draft, `PUBLISHED` publishes immediately |
| `PATCH` | `/notices/:id` | author or `notices.publish` | Edit title/body/audience/metadata |
| `POST` | `/notices/:id/publish` | `notices.publish` | Publish draft (idempotent); resolves audience to students and sends LMS notifications |
| `POST` | `/notices/:id/archive` | `notices.publish` | Withdraw notice from all views |
| `POST` | `/notices/:id/restore` | `notices.publish` | Restore archived notice to published |
| `POST` | `/notices/upload` | `notices.publish` | Stage attachment multipart upload → `{ files: [{ fileId, originalName, mimeType, sizeBytes }] }` |
| `POST` | `/notices/:id/attachments` | author or `notices.publish` | Attach staged file ids (`{ fileIds: [] }`); uploader or manager only |
| `DELETE` | `/notices/:id/attachments/:fileId` | author or `notices.publish` | Remove attachment reference |
| `GET` | `/notices/exam/:examId` | `notices.view` | Notices linked to an exam |

Faculty without `notices.publish` may publish only to a `SPECIFIC` audience
(never `ALL`); students cannot publish. Attachment bytes stream through
`GET /api/files/:id?download=true` with the `notice_attachment` entitlement check.

### Communication (`/api`)
| Method | Path | Permissions | Description |
|--------|------|-------------|-------------|
| `GET` | `/mail/recipients/suggest?q=...` | `mail.view` | Search eligible institutional contacts for To/Cc/Bcc autocomplete |
| `GET` | `/mail` | `mail.view` | List mail (sent/received) |
| `POST` | `/mail` | `mail.view` | Send mail with To/Cc/Bcc recipients |
| `GET` | `/messages` | `messages.view` | List direct messages |
| `POST` | `/messages` | `messages.view` | Send message |
| `PATCH` | `/messages/:id/read` | `messages.view` | Mark read |
| `GET` | `/notifications` | `requireAuth` | User notifications |
| `PATCH` | `/notifications/:id/read` | `requireAuth` | Mark notification read |

### Workflow requests and automation (`/api`)
| Method | Path | Permissions | Description |
|--------|------|-------------|-------------|
| `GET` | `/cases` | `workflow.view` | List request cases (requesters see their own; staff see the permitted queue) |
| `POST` | `/cases` | `workflow.create` | Submit a case. Starts the matching published `case.created` workflow, if one is configured; optional `workflowData` supplies request fields for server-side conditions |
| `PATCH` | `/cases/:id/status` | `workflow.manage` | Update a case not currently controlled by an active workflow instance |
| `GET` | `/workflows` | `workflow.view` | List persisted definitions; supports `status` and `templates` filters and returns execution counts |
| `GET` | `/workflows/options` | `workflow.manage` | Load valid approver roles/users, departments, categories and request types |
| `POST` | `/workflows` | `workflow.manage` | Save a workflow definition as a draft |
| `PUT` | `/workflows/:id` | `workflow.manage` | Edit a draft or paused definition |
| `POST` | `/workflows/validate` | `workflow.manage` | Validate required fields, approver assignments and conditions |
| `POST` | `/workflows/test` | `workflow.manage` | Evaluate conditions against supplied sample request data without creating an instance |
| `POST` | `/workflows/:id/publish` | `workflow.manage` | Publish only after server-side validation succeeds |
| `PATCH` | `/workflows/:id/status` | `workflow.manage` | Pause or archive a definition |
| `PATCH` | `/workflows/:id/template` | `workflow.manage` | Save an unpublished definition as a reusable template |
| `POST` | `/workflows/:id/clone` | `workflow.manage` | Create a draft from a template or published definition |
| `GET` | `/workflow-instances?status=in_progress` | `workflow.view` | List running instances visible to the caller, with database-backed status counts |
| `GET` | `/workflow-instances/:id` | `workflow.view` | Inspect an instance and its execution history; managers, requesters, assigned approvers and prior actors are scoped server-side |
| `POST` | `/workflow-instances/:id/decision` | Assigned approver | Approve, reject or return an assigned active request; updates the linked case, sends configured notifications and records history |

Definitions and instances are separate MongoDB records. A matching request starts one instance per request; the same published definition is reused for later requests. Sequential role steps select an active eligible approver, while parallel role steps require every active user assigned to that role to approve before advancing. Conditions are evaluated by the backend at workflow start or before the configured step. In-app approval and status notifications use the CollegeOS notification store; pending reminders are sent by the server workflow scheduler.

### Finance (`/api`)
Actual paths live under the `/api` root (not `/api/finance`). Finance
staff see every record; other authenticated callers only see the
records that belong to their own student account.

| Method | Path | Permissions | Description |
|--------|------|-------------|-------------|
| `GET` | `/finance/students` | `finance.invoice.create` | Search students for billing |
| `GET` | `/invoices` | `finance.invoice.view` | List invoices (own for students) |
| `POST` | `/invoices` | `finance.invoice.create` | Create invoice. Body: `{ studentId, title, amount, dueDate, category? }`; amount must be a positive number |
| `POST` | `/invoices/:id/amend` | `finance.invoice.update` | Amend an unpaid issued invoice. Body may include `title`, `description`, `category`, `amount`, `dueDate`, and a required `changeNote`; the prior version is retained and audited |
| `POST` | `/invoices/:id/void` | `finance.invoice.update` | Void an unpaid invoice. Body: `{ reason }`; voided records remain visible historically but are no longer payable |
| `GET` | `/payments` | `finance.invoice.view` | List payments (own for students) |
| `POST` | `/payments` | `finance.payment.record` | Record payment. Body: `{ invoiceId, amount, method, transactionId? }`; amount must be positive and no greater than the invoice's outstanding balance; `method` must be `esewa`, `khalti`, `connectips`, `cash`, `bank_transfer` or `stripe`. The invoice is reconciled and the student's fee balance reduced in the same operation; the response carries the persisted payment record |

Payments reconcile immediately on record — there is no separate
verification step, so no `/payments/:id/verify` endpoint exists.
Issued invoices and receipts are projected from the Finance records in My
Documents; they are not separately editable copies. Active enrolments,
published examination results, and audience-authorized published academic
calendar documents are projected in the same way. Source changes are reflected
on the next request.
Students can preview and download linked financial documents as HTML, and
invoice amendment history is available in the linked document's version list.

### My Documents (`/api/documents`)
| Method | Path | Permissions | Description |
|--------|------|-------------|-------------|
| `GET` | `/documents` | `requireAuth` | Lists documents the caller can access and source-linked student financial, academic, and published examination records |
| `GET` | `/documents/:id` | `requireAuth` | Returns an uploaded document or an authorized linked source record |
| `GET` | `/documents/:id/versions` | `requireAuth` | Returns uploaded document history or finance invoice amendment history |
| `GET` | `/documents/linked/:type/:id` | `requireAuth` | Previews/downloads an authorized invoice, receipt, or published exam result; use `?download=true` for a download |
| `POST` | `/documents` | `requireAuth`; `documents.publish` for a student target | Uploads a document; authorized departments may set `studentId` and `approvalStatus` so approved records become available to that student |

Linked financial records resolve against the authenticated student's account.
Unpublished/revoked exam results and unapproved student-targeted uploads are
not listed or readable by students. Finance/Billing remains the source of
invoice, payment, and balance data.

### Admissions (`/api/admissions`)
| Method | Path | Permissions | Description |
|--------|------|-------------|-------------|
| `GET` | `/admissions` | `admissions.application.view` | List applications |
| `POST` | `/admissions` | `admissions.application.create` | Submit application |
| `GET` | `/admissions/:id` | `admissions.application.view` | Application detail |
| `PATCH` | `/admissions/:id` | `admissions.application.update` | Update application |
| `POST` | `/admissions/:id/decide` | `admissions.application.decide` | Approve/reject |

### Examinations (`/api/examinations`)
| Method | Path | Permissions | Description |
|--------|------|-------------|-------------|
| `GET` | `/examinations` | `exam.view` | List exams |
| `POST` | `/examinations` | `exam.create` | Create exam |
| `GET` | `/examinations/:id` | `exam.view` | Exam detail |
| `PATCH` | `/examinations/:id` | `exam.edit` | Update exam |
| `POST` | `/examinations/:id/publish` | `exam.publish` | Publish exam |
| `POST` | `/examinations/:id/reschedule` | `exam.reschedule` | Reschedule |
| `POST` | `/examinations/:id/cancel` | `exam.cancel` | Cancel exam |
| `GET` | `/examinations/:id/candidates` | `exam.manageCandidates` | List candidates |
| `POST` | `/examinations/:id/candidates` | `exam.manageCandidates` | Add candidate |
| `GET` | `/examinations/:id/rooms` | `exam.manageRooms` | Room assignments |
| `POST` | `/examinations/:id/rooms` | `exam.manageRooms` | Assign room |
| `GET` | `/examinations/:id/invigilators` | `exam.manageInvigilators` | Invigilators |
| `POST` | `/examinations/:id/invigilators` | `exam.manageInvigilators` | Assign invigilator |
| `GET` | `/examinations/:id/attendance` | `exam.manageAttendance` | Exam attendance |
| `POST` | `/examinations/:id/results` | `exam.manageResults` | Submit marks |
| `POST` | `/examinations/:id/results/finalize` | `exam.results.finalize` | Finalize results |
| `POST` | `/examinations/:id/results/publish` | `exam.publishResults` | Publish results |

### Examination Seating (`/api/exams/venues`, `/api/exams/seating`)
| Method | Path | Permissions | Description |
|--------|------|-------------|-------------|
| `GET` | `/exams/venues` | `exam.view` | Venue registry (lazy-seeds defaults) |
| `POST` | `/exams/venues/seed` | `exam.manageSeating` | Seed default venue registry |
| `PATCH` | `/exams/venues/:id` | `exam.manageSeating` | Update venue capacity/status |
| `POST` | `/exams/venues` | `exam.manageSeating` | Register new venue |
| `DELETE` | `/exams/venues/:id` | `exam.manageSeating` | Deactivate venue |
| `GET` | `/exams/seating` | `exam.manageSeating` | List seating plans |
| `GET` | `/exams/seating/eligible` | `exam.manageSeating` | Preview eligible candidates |
| `POST` | `/exams/seating` | `exam.manageSeating` | Create/generate plan |
| `GET` | `/exams/seating/:id` | `exam.manageSeating` | Plan detail + assignments |
| `POST` | `/exams/seating/:id/generate` | `exam.manageSeating` | (Re)generate allocation |
| `POST` | `/exams/seating/:id/regenerate` | `exam.manageSeating` | Regenerate (keeps SCHEDULED) |
| `POST` | `/exams/seating/:id/shuffle` | `exam.manageSeating` | Deterministic shuffle |
| `POST` | `/exams/seating/:id/reset` | `exam.manageSeating` | Reset to alphabetical |
| `POST` | `/exams/seating/:id/room-change` | `exam.manageSeating` | Move students between rooms |
| `POST` | `/exams/seating/:id/publish` | `exam.manageSeating` | Publish (validates capacity + conflicts) |
| `POST` | `/exams/seating/:id/schedule` | `exam.manageSeating` | Schedule auto-publication |
| `POST` | `/exams/seating/:id/cancel` | `exam.manageSeating` | Cancel plan |
| `GET` | `/exams/seating/:id/conflicts` | `exam.manageSeating` | Room double-booking conflicts |
| `POST` | `/exams/seating/run-scheduled-publication` | `exam.manageSeating` | Sweep trigger (scheduler calls it) |
| `GET` | `/student/exams/my-seating` | `exam.seating.view.own` (student) | My published seat assignments |
| `GET` | `/student/exams/:examId/my-seating` | `exam.seating.view.own` (student) | My seat for one exam |

### Attendance (`/api/attendance`)
| Method | Path | Permissions | Description |
|--------|------|-------------|-------------|
| `GET` | `/attendance/sessions` | `attendance.view` | List sessions |
| `POST` | `/attendance/sessions` | `attendance.session.create` | Create session (generates QR) |
| `GET` | `/attendance/sessions/:id` | `attendance.view` | Session detail + records |
| `PATCH` | `/attendance/sessions/:id` | `attendance.session.close` | Close session |
| `POST` | `/attendance/sessions/:id/mark` | `attendance.manual_mark` | Manual mark |
| `POST` | `/attendance/qr/checkin` | `attendance.qr.checkin` | Student QR check-in |
| `GET` | `/attendance/student/:id` | `attendance.view.own` / `requireStudentScope` | Student attendance |
| `POST` | `/attendance/corrections` | `attendance.reviewCorrection` | Request correction |
| `PATCH` | `/attendance/corrections/:id` | `attendance.approveCorrection` | Approve correction |
| `GET` | `/attendance/report` | `attendance.view.examEligibility` | Exam eligibility report |

### Profile (`/api/profile`)
| Method | Path | Permissions | Description |
|--------|------|-------------|-------------|
| `GET` | `/profile` | `requireAuth` | Current user profile |
| `PATCH` | `/profile` | `profile.update.self` | Update profile |
| `POST` | `/profile/avatar` | `profile.update.self` | Upload avatar |

### Reporting (`/api/reporting`)
| Method | Path | Permissions | Description |
|--------|------|-------------|-------------|
| `GET` | `/reporting/analytics` | `analytics.view` | Institution analytics summary |
| `GET` | `/reporting/audit` | `audit.view` | Audit logs (paginated) |

### Online Coding Lab (`/api/coding`) — students and teachers only

Every endpoint requires a session whose role is `student` or
`faculty` plus `coding.lab.view`. Identifiers are re-derived
from the session; private projects and unauthorized assignments
return `404`, never `403`, so their existence stays hidden.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/languages` | Language catalogue + `configured` provider flag |
| `POST` | `/execute` | Run code on the isolated provider → `202 { executionId, status: "QUEUED" }` |
| `GET` | `/executions/:id` | Poll execution output (owner only) |
| `GET` | `/projects` | Own projects; `?shared=true` adds shares visible to the student |
| `POST` | `/projects` | Create project; optional `assignmentId` links a working copy |
| `GET` | `/projects/:id` | Read project (owner or actively shared) |
| `PATCH` | `/projects/:id` | Update project (owner only) |
| `DELETE` | `/projects/:id` | Soft-delete + revoke shares (owner only) |
| `POST` | `/projects/:id/duplicate` | Open as copy (owner, or student with a COPY share) |
| `POST` | `/projects/:id/share` | Share: `{ shareType: COURSE\|SECTION\|STUDENTS, courseId, sectionCode, studentIds, permission: VIEW\|COPY, expiresInDays }` (faculty owner) |
| `GET` | `/projects/:id/shares` | List shares (faculty owner) |
| `DELETE` | `/shares/:id` | Revoke share (faculty owner) |
| `GET` | `/shared` | Shared-with-me (student) / shared-by-me (faculty) |
| `GET` | `/courses` | Enrolments (student) or teaching scopes (faculty) |
| `GET` | `/courses/:courseId/students` | Roster for the share dialog (authorized teacher / own cohort) |
| `POST` | `/assignments` | Create assignment (course teacher) |
| `GET` | `/assignments` | Assignments visible to caller |
| `GET` | `/assignments/:id` | Read assignment (enrolled student / authorized teacher) |
| `PATCH` | `/assignments/:id` | Edit or close (creator only) |
| `POST` | `/assignments/:id/submissions` | Submit/update submission (enrolled student; upsert, `version` increments) |
| `GET` | `/assignments/:id/submissions` | Submission list (creator/authorized teacher; student sees own) |
| `PATCH` | `/submissions/:id` | Grade: `{ marks, feedback }` → status `GRADED` (creator/authorized teacher) |

## Request/Response Conventions

- **Pagination:** `?page=1&limit=20` → response includes `{ data: [], pagination: { page, limit, total, pages } }`
- **Filtering:** Query parameters per endpoint (e.g., `?courseId=...&status=OPEN`)
- **Sorting:** `?sort=field&order=asc|desc` where supported
- **Dates:** ISO 8601 strings (`YYYY-MM-DD` for dates, `YYYY-MM-DDTHH:mm:ssZ` for timestamps)
- **File uploads:** `multipart/form-data` with field name `file` (or `attachment` for calendar)
- **File validation:** Magic-byte checked server-side; accepted types per module policy

## Contract Documentation
Domain-specific contracts in `api/contracts/`:
- `auth.md` — Authentication endpoints
- `my-courses.md` — `GET /api/my-courses`
- `faculty-course-workspace.md` — LMS faculty workspace endpoints

## Testing
- `npm run test:api` — Runs `backend/tests/*.test.js` against ephemeral MongoDB
- Tests cover: auth lifecycle, account provisioning, academics, calendar, materials, assignments, quizzes, timetable, files, attendance, exams, finance, workflow, coding lab
- Negative cases included for every permission rule

## Related Files
| File | Purpose |
|------|---------|
| `backend/src/app.js` | Route registration |
| `backend/src/routes/*.js` | Route handlers |
| `backend/src/middleware/auth.js` | Auth/permission middleware |
| `backend/src/permissions/catalog.js` | Permission definitions |
| `backend/src/services/accessControl.js` | Object-level authorization |
| `api/contracts/*.md` | Domain contracts |
| `frontend/src/services/apiClient.ts` | Typed client |
| `frontend/src/services/lmsApi.ts` | LMS API wrapper |