# CollegeOS — Modules

This document inventories every functional module, its purpose, authorized roles, implementation status, key source paths, dependencies, and known gaps.

## Module Inventory

| # | Module | Purpose | Authorized Roles | Backend Routes | Frontend Workspace | Status |
|---|--------|---------|------------------|----------------|-------------------|--------|
| 1 | Authentication | Login, session, password rotation, role switching | All | `auth.js` | `LoginScreen`, `AccountActivationView` | ✅ Implemented |
| 2 | User Management | Provision users, assign roles, manage account status | `super_admin` | `administration.js` | `UserManagementView` | ✅ Implemented |
| 3 | Academics (Courses) | Course catalog, sections, programs, departments, enrollments, teaching assignments | `registrar`, `dean`, `hod`, `program_coordinator`, `super_admin` (manage); `faculty`, `student` (view) | `academics.js` | `MyCoursesView`, `LmsWorkspace` | ✅ Implemented |
| 4 | LMS — Weekly Planner | Weekly course plan: objectives, materials, assignments, quizzes, announcements | `faculty`, `hod`, `program_coordinator`, `dean`, `registrar`, `super_admin` (manage); `student` (view) | `lms.js` | `FacultyLmsWorkspace`, `StudentLmsWorkspace` | ✅ Implemented |
| 5 | LMS — Materials | Course material library (upload, version, release, audience) | `faculty`, `hod`, `program_coordinator`, `dean`, `registrar`, `super_admin` (create/manage); `student` (view) | `materials.js`, `lms.js` | `FacultyLmsWorkspace` (Materials tab), `StudentLmsWorkspace` | ✅ Implemented |
| 6 | LMS — Quizzes | Quiz authoring, question bank, attempts, auto/manual grading, integrity events | `faculty`, `hod`, `program_coordinator`, `dean`, `registrar`, `super_admin` (manage); `student` (attempt) | `quizzes.js` | `FacultyLmsWorkspace` (Quizzes tab), `StudentLmsWorkspace` | ✅ Implemented |
| 7 | LMS — Gradebook | Course/weekly progress, engagement, risk signals | `faculty`, `hod`, `program_coordinator`, `dean`, `registrar`, `super_admin` | `lms.js` | `FacultyLmsWorkspace` (Analytics tab) | ✅ Implemented |
| 8 | Assignments | Assignment creation, submission, similarity check, grading | `faculty`, `hod`, `program_coordinator`, `super_admin` (create/grade); `student` (submit) | `assignments.js` | `FacultyLmsWorkspace` (Assignments tab), `StudentLmsWorkspace` | ✅ Implemented |
| 9 | Attendance | Session creation, QR check-in, manual marking, corrections, exam eligibility | `faculty`, `super_admin` (create/mark); `hod`, `dean`, `registrar` (review/approve); `student` (QR check-in, view own) | `attendance.js` | `AttendanceWorkspaceView`, `StudentAttendanceCard` | ✅ Implemented |
| 10 | Timetable | Institution timetable management (admin), personal timetable (faculty/student) | `super_admin`, `dean`, `hod`, `registrar` (manage); `faculty`, `student` (view) | `timetable.js`, `myTimetable.js` | `TimetableWorkspaceView`, `FacultyMyTimetableView`, `StudentTimetableView` | ✅ Implemented |
| 11 | Examinations | Exam scheduling, room/invigilator assignment, marks entry, verification, publication, transcripts, venue registry + automatic seating allocation | `exam_officer`, `super_admin` (manage, incl. seating); `faculty` (marks entry); `registrar`, `hod`, `dean` (verify); `student` (view results, view own published seat) | `examinations.js`, `examSeating.js` | `ExaminationWorkspaceView` (incl. Seating Plan tab → `ExamSeatingWorkspace`) | ✅ Implemented |
| 12 | Finance | Invoice generation, payment recording, verification, refunds, fee balance | `finance_officer`, `super_admin` (manage); `student` (view own, pay) | `finance.js` | `FinanceWorkspaceView` | ✅ Implemented |
| 13 | Admissions | Application submission, review, decision | `registrar`, `super_admin` (manage); applicants (submit) | `admissions.js` | `AdmissionsWorkspaceView` | ✅ Implemented |
| 14 | Academic Calendar | Events and documents with audience targeting | `super_admin`, `dean`, `hod`, `registrar`, `program_coordinator` (manage); all roles (view) | `calendar.js` | `AcademicCalendarView`, `AcademicCalendarDocumentsView` | ⚠️ Partial (API complete, UI shows timetable/exams) |
| 15 | Notices | Institutional notices with audience targeting | `super_admin`, `hod`, `program_coordinator`, `registrar`, `exam_officer`, `finance_officer`, `dean` (publish); all (view) | `notices.js` | `NoticesView` | ✅ Implemented |
| 16 | Communication | Institutional mail (BCC), direct messages, notifications | All roles (scope varies) | `communication.js` | `CollegeMailView`, `MessagesView` | ✅ Implemented |
| 17 | Workflow | Case/request management (leaves, fee adjustments, documents) | All (create); `super_admin`, `campus_admin`, `dean`, `hod`, `program_coordinator`, `registrar`, `exam_officer`, `finance_officer`, `faculty` (manage) | `workflow.js` | `WorkflowWorkspaceView` | ✅ Implemented |
| 18 | Reporting/Analytics | Institution analytics, audit logs | `super_admin`, `campus_admin`, `dean`, `hod`, `program_coordinator`, `registrar`, `finance_officer`, `exam_officer` | `reporting.js` | `AnalyticsWorkspaceView` | ✅ Implemented |
| 19 | Profile | User profile, avatar upload | All (self); `registrar`, `super_admin` (official) | `profile.js` | `AccountProfileView` | ✅ Implemented |
| 20 | Departmental | Department-level admin (courses, faculty, students) | `hod`, `dean`, `super_admin` | `departmental.js` | (Admin only, no dedicated view) | ✅ Implemented |
| 21 | Files/Uploads | File upload, storage, entitlement-checked download | All (scope varies) | `files.js` | Shared upload components | ✅ Implemented |
| 22 | Library | Book catalog, circulation, overdue fines | `super_admin`, `faculty`, `student`, `parent` (view) | — | `FacilitiesLibraryView` | ⚠️ Partial (view only, no circulation logic) |
| 23 | Next-Gen Intelligence | Timeline, case engine, life events, dependency engine, graduation simulator, next-action engine, anomaly radar, universal search | `super_admin`, `dean`, `registrar`, `hod` | — | `NextGenSuiteView` | ❌ Placeholder |
| 24 | Online Coding Lab | Browser compiler (Judge0), HTML/CSS/JS playground with sandboxed preview, project persistence, teacher sharing, coding assignments and submissions with grading | `student`, `faculty` only | `coding.js` | `CodingLabWorkspace` (compiler + playground) | ✅ Implemented |

## Status Legend
- ✅ **Implemented** — Backend routes + frontend workspace functional, tested
- ⚠️ **Partial** — Backend complete, frontend incomplete or vice versa; or known missing features
- ❌ **Not Implemented** — Planned but no code exists

## Detailed Module Notes

### 1. Authentication
- **Backend:** `backend/src/routes/auth.js` — 7 endpoints
- **Frontend:** `frontend/src/components/auth/LoginScreen.tsx`, `AccountActivationView.tsx`
- **Context:** `CollegeOSContext.tsx` — `login`, `logout`, `changePassword`, `setCurrentRole`
- **Gaps:** Forgot-password returns `501`; no email delivery; no SSO/OAuth

### 2. User Management
- **Backend:** `backend/src/routes/administration.js` — CRUD for users, role assignment, status toggle
- **Frontend:** `frontend/src/components/modules/UserManagementView.tsx`
- **Permissions:** `accounts.manage`, `roles.manage` (super_admin only)
- **Bootstrap:** Super Admin created by `seedBaseUsers()` in `db.js`

### 3. Academics
- **Backend:** `backend/src/routes/academics.js` — Courses, sections, programs, departments, enrollments, teaching assignments
- **Frontend:** `MyCoursesView` (index), `LmsWorkspace` (course workspace)
- **Key models:** `Course`, `Section`, `Program`, `Department`, `Enrollment`, `CourseTeachingAssignment`
- **Permissions:** `courses.view`, `courses.create`, `courses.manage`, `sections.manage`, `academics.teaching.assign`

### 4. LMS — Weekly Planner
- **Backend:** `backend/src/routes/lms.js` — Weeks, objectives, announcements, course overview, teaching progress
- **Frontend:** `FacultyLmsWorkspace` (6 tabs: Planner, Materials, Assignments, Quizzes, Announcements, Analytics), `StudentLmsWorkspace`
- **Key services:** `accessControl.js` (`isTeachingAuthorized`, `listAuthorisedSectionsForCourse`, `resolveScopedAudience`)
- **Teaching progress:** `TeachingProgress` model — teacher-declared position, never inferred from views

### 5. LMS — Materials
- **Backend:** `backend/src/routes/materials.js` (course library), `lms.js` (week materials)
- **Frontend:** Materials tab in both workspaces
- **Upload:** Multipart, magic-byte validated, 5 formats accepted (PDF, PPT, PPTX, DOC, DOCX) — server accepts more
- **Versioning:** New upload = new row with incremented `version`, `supersedes` previous
- **Status flow:** `DRAFT` → `SCHEDULED` (requires `releaseAt`) → `PUBLISHED` / `HIDDEN` / `ARCHIVED`
- **Audience:** Defaults to caller's teaching sections; curriculum admins can target institution-wide

### 6. LMS — Quizzes
- **Backend:** `backend/src/routes/quizzes.js` — Quiz CRUD, questions, attempts, grading, insights
- **Frontend:** Quizzes tab, `QuizAttemptRunner`, `QuizGradingPanel`
- **Question types:** MCQ, MRQ, TRUE_FALSE, SHORT_ANSWER, ESSAY, CODE, FILE_UPLOAD
- **Grading:** Auto for objective types; manual for subjective; `resultReleasePolicy` (IMMEDIATE/MANUAL/SCHEDULED)
- **Integrity events:** `TAB_HIDDEN`, `TAB_VISIBLE`, `RECONNECTED`, `AUTOSAVE_FAILED`, `PAUSE` — logged, not verdicts

### 7. Assignments
- **Backend:** `backend/src/routes/assignments.js` — Assignments, submissions, similarity
- **Frontend:** Assignments tab, submission drawer, grading panel
- **Similarity:** Google GenAI integration (`similarityService.js`)
- **Audience:** Resolved from teaching scope (same as materials)

### 8. Attendance
- **Backend:** `backend/src/routes/attendance.js` — Sessions, QR tokens, marking, corrections
- **Frontend:** `AttendanceWorkspaceView`, `StudentAttendanceCard`, QR scanner
- **Scope:** `resolveDeliveryScope` — faculty see assigned sections; admins see all
- **QR:** 30-second rotating token, HMAC-signed
- **Corrections:** Student requests → faculty/HoD reviews → HoD/Registrar approves

### 9. Timetable
- **Backend:** `timetable.js` (admin CRUD, conflict check), `myTimetable.js` (personal view)
- **Frontend:** `TimetableWorkspaceView` (grid), `FacultyMyTimetableView`, `StudentTimetableView`
- **Conflicts:** Teacher, room, cohort — `timetable.override` permission to force
- **Scope:** `scope=mine` query restricts to session user's classes

### 10. Examinations
- **Backend:** `backend/src/routes/examinations.js` — Exams, candidates, rooms, invigilators, attendance, results workflow
- **Seating:** `backend/src/routes/examSeating.js` + `examSeatingService.js` — venue registry, automatic sequential cross-room allocation (2-seat benches), deterministic shuffle, room changes, conflict detection, scheduled publication (swept by `lms/scheduler.js`)
- **Frontend:** `ExaminationWorkspaceView` (Seating Plan tab → `exam/ExamSeatingWorkspace`)
- **Workflow:** `examWorkflowService.js` — submit → verify → publish → revoke/correct
- **Grades:** `gradingService.js` — GPA/CGPA computation
- **Transcripts:** `Document` model accepts `TRANSCRIPT` type; **no PDF generator**

### 11. Finance
- **Backend:** `backend/src/routes/finance.js` — Invoices, payments, fee items, balance
- **Frontend:** `FinanceWorkspaceView`
- **Gateways:** eSewa, Khalti, Stripe, connectIPS, Cash — **simulated in frontend**, no real integration
- **Receipts:** NPR amount in words (Nepali), receipt number

### 12. Admissions
- **Backend:** `backend/src/routes/admissions.js` — Applications, documents, status workflow
- **Frontend:** `AdmissionsWorkspaceView`
- **Student provisioning:** `studentProvisioning.js` creates User + Student + Enrollment atomically on approval

### 13. Academic Calendar
- **Backend:** `backend/src/routes/calendar.js` — Events, documents, audience targeting
- **Frontend:** `AcademicCalendarView` — **currently renders timetable/exam data, not calendar events**
- **Documents:** `AcademicCalendarDocument` with lifecycle (DRAFT/PUBLISHED/ARCHIVED)
- **Inline viewing:** `AcademicCalendarDocumentsView` previews published files in-browser (`shared/viewer/DocumentPreview` — PDF via pdfjs-dist, images, honest fallback + authorized download for Office types)

### 14. Notices
- **Backend:** `backend/src/routes/notices.js` — Rich-text notices with audience (roles, programs, sections), draft/publish/archive lifecycle, attachments, exam linking
- **Frontend:** `NoticesView` — Tiptap rich editor (`notices/RichTextEditor`), drag-drop attachments (`notices/NoticeAttachments`), inline viewer modal (`shared/viewer/DocumentViewerModal`), student reading pane with sanitized HTML render
- **Permissions:** `notices.publish` for specific roles; faculty without it may publish to SPECIFIC audiences only
- **Sanitization:** `contentHtml` stripped to a strict allow-list server-side (`utils/sanitizeHtml.js`), re-sanitized client-side (`lib/sanitizeHtml.ts`) before `innerHTML`

### 15. Communication
- **Backend:** `backend/src/routes/communication.js` — Mail (BCC enforced), messages, notifications
- **Frontend:** `CollegeMailView`, `MessagesView`
- **Mail:** Sent via `/api/mail`; BCC privacy guaranteed server-side

### 16. Workflow
- **Backend:** `backend/src/routes/workflow.js` — Cases with SLA, history, assignees
- **Frontend:** `WorkflowWorkspaceView`
- **Types:** Leave, fee adjustment, document request, custom

### 17. Reporting
- **Backend:** `backend/src/routes/reporting.js` — Analytics summary, audit logs
- **Frontend:** `AnalyticsWorkspaceView`
- **Analytics:** `getAnalyticsSummary()` in `db.js` — counts from all collections

### 18. Profile
- **Backend:** `backend/src/routes/profile.js` — Profile update, avatar upload
- **Frontend:** `AccountProfileView`
- **Avatar:** Served statically from `/uploads/avatars/`

### 19. Departmental
- **Backend:** `backend/src/routes/departmental.js` — Department-scoped admin
- **Frontend:** No dedicated view (accessed via UserManagement/Admin views)

### 20. Files
- **Backend:** `backend/src/routes/files.js` — Upload, download with entitlement
- **Frontend:** `shared/upload/` components
- **Entitlement:** Student → own submissions/avatars; Faculty → own uploads + student submissions for taught courses; Admin → all

### 21. Library
- **Backend:** No dedicated routes; `library.view` permission exists in catalog
- **Frontend:** `FacilitiesLibraryView` — displays `LibraryItem` and `BorrowRecord` from context (mock data)
- **Gaps:** No circulation logic, no overdue fines, no backend models for books/borrowing

### 22. Next-Gen Intelligence
- **Backend:** None
- **Frontend:** `NextGenSuiteView` — placeholder UI
- **Planned:** Timeline, case engine, life events, dependency engine, graduation simulator, next-action engine, anomaly radar, universal search

### 23. Online Coding Lab
- **Backend:** `backend/src/routes/coding.js` — Projects, shares, assignments, submissions, execution dispatch
- **Service:** `backend/src/services/codeExecution.js` — Judge0 provider client, language registry, rate limiting
- **Frontend:** `frontend/src/components/modules/coding/` — `CodingLabWorkspace`, `CompilerWorkspace`, `PlaygroundWorkspace`, `CodeEditor`, `OutputPanel`, `PlaygroundPreview`, `ProjectListPane`, `AssignmentDialog`, `ShareDialog`, `SubmissionsPanel`
- **Key models:** `CodingProject`, `CodingShare`, `CodingAssignment`, `CodingSubmission`, `CodingExecution`
- **Permissions:** `coding.lab.view`, `coding.projects.manage` (student/faculty), `coding.assignments.manage` (faculty)
- **Routes:** `/student/coding-lab`, `/teacher/coding-lab` (deep links `/student/coding-lab/projects/:id`)
- **Safety:** Untrusted code runs only on the isolated provider (Judge0 CE), never on the server; playground preview iframe is sandboxed without `allow-same-origin`
- **Details:** `docs/CODING_LAB.md`

## Cross-Module Dependencies

| Dependency | Modules Affected |
|------------|------------------|
| `Student` record (cohort) | Attendance, Assignments, Exams, Finance, LMS, Timetable, Admissions, Coding Lab |
| `CourseTeachingAssignment` | LMS, Attendance, Timetable, Assignments, Quizzes, Coding Lab |
| `Enrollment` | Coding Lab (share and assignment scoping) |
| `Audience` model | Calendar, Materials, Assignments, Notices, Communication |
| `Session` collection | All protected routes |
| `AuditLog` | All state-changing operations |
| `StoredFile` | Materials, Assignments, Calendar, Profile, Communication |

## Adding a New Module

1. Create model(s) in `backend/src/models/`
2. Add permission(s) to `backend/src/permissions/catalog.js`
3. Create route module in `backend/src/routes/<module>.js`
4. Register in `backend/src/app.js`
5. Create frontend workspace in `frontend/src/components/modules/<Module>View.tsx`
6. Add route in `frontend/src/App.tsx`
7. Add navigation item to the role section(s) in `frontend/src/lib/navigation.ts`
8. Update `docs/MODULES.md`, `docs/API_REFERENCE.md`, `docs/AUTHORIZATION_AND_RBAC.md`