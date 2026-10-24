# CollegeOS — AI Context (Compact Knowledge Base)

## What CollegeOS Is
A React/Vite institutional workspace backed by one Express modular monolith and one MongoDB database. **Not production-ready as a multi-institution service** — tenant scoping is incomplete.

## Verified Technology Stack
- **Frontend:** React 19, TypeScript, Vite 6, Tailwind CSS 4, Font Awesome 7
- **Backend:** Express 4 (ESM), Mongoose 9, MongoDB, JWT auth, bcryptjs
- **Testing:** Node native test runner (`node --test`), `tsx` for frontend unit tests
- **Dev orchestration:** `scripts/dev.js` auto-starts `mongod` on Windows

## High-Level Architecture
```
Browser → Vite React SPA (frontend/) → /api → Express (backend/src/)
                                              → Mongoose models (backend/src/models/)
                                              → MongoDB (collegeos)
                                              → /api/files/:id serves backend/uploads/
```

## Actual Entry Points
- **Backend:** `backend/src/server.js` → `createApp()` in `backend/src/app.js` registers 22 route modules
- **Frontend:** `frontend/src/main.tsx` (not shown) wraps app in `CollegeOSProvider` from `CollegeOSContext.tsx`

## Authentication & Session Lifecycle
- `POST /api/auth/login` → issues JWT (8h), stores hashed token in `Session` collection
- `GET /api/auth/me` → hydrates session, returns user + active role + permissions
- `POST /api/auth/change-password` → revokes all sessions, issues new token
- `POST /api/auth/active-role` → switches active role (must be assigned)
- **Password rotation:** bootstrap admin created with `mustChangePassword: true`, accountStatus `PASSIVE`; first login forces `/account/activate`
- **Forgot-password:** returns `501` — token stored but not delivered

## Role-Based Access Control
- **12 core roles** (hierarchical): `student`, `parent`, `faculty`, `program_coordinator`, `hod`, `registrar`, `exam_officer`, `finance_officer`, `campus_admin`, `dean`, `super_admin`
- **Authoritative map:** `backend/src/permissions/catalog.js` → `roleGrants` (500+ lines)
- **Middleware:** `requireAuth`, `requireRole`, `requirePermission`, `requireStudentScope` in `backend/src/middleware/auth.js`
- **Object-level checks:** `accessControl.js` (`isTeachingAuthorized`, `listAuthorisedSectionsForCourse`, `resolveScopedAudience`)

## Major Modules & Implementation Status
| Module | Backend Routes | Frontend Workspace | Status |
|--------|----------------|-------------------|--------|
| Authentication | `auth.js` | `LoginScreen`, `AccountActivationView` | Implemented |
| User Management | `administration.js` | `UserManagementView` | Implemented |
| Academics (Courses/Sections) | `academics.js` | `MyCoursesView`, `LmsWorkspace` | Implemented |
| LMS (Planner/Materials/Quizzes) | `lms.js`, `quizzes.js`, `assignments.js` | `FacultyLmsWorkspace`, `StudentLmsWorkspace` | Implemented |
| Attendance | `attendance.js` | `AttendanceWorkspaceView` | Implemented |
| Examinations | `examinations.js`, `examSeating.js` | `ExaminationWorkspaceView` (incl. `exam/ExamSeatingWorkspace`) | Implemented |
| Finance | `finance.js` | `FinanceWorkspaceView` | Implemented |
| Timetable | `timetable.js`, `myTimetable.js` | `TimetableWorkspaceView`, `FacultyMyTimetableView` | Implemented |
| Notices | `notices.js` | `NoticesView` | Implemented (rich-text editor, attachments, draft/publish/archive lifecycle) |
| Communication | `communication.js` | `CollegeMailView`, `MessagesView` | Implemented |
| Workflow | `workflow.js` | `WorkflowWorkspaceView` | Implemented |
| Academic Calendar | `calendar.js` | `AcademicCalendarView` | Partial (API complete, workspace shows timetable/exams) |
| Admissions | `admissions.js` | `AdmissionsWorkspaceView` | Implemented |
| Reporting | `reporting.js` | `AnalyticsWorkspaceView` | Implemented |
| Profile | `profile.js` | `AccountProfileView` | Implemented |
| Departmental | `departmental.js` | (Admin only) | Implemented |
| Files/Uploads | `files.js` | Shared upload + inline document viewer components (`shared/viewer/`) | Implemented |
| Coding Lab | `coding.js` | `CodingLabWorkspace` (compiler + playground) | Implemented (student/faculty only) |

## API & Database Conventions
- All endpoints under `/api` prefix
- Bearer token auth; session validated against `Session` collection
- Mongoose models in `backend/src/models/` (one per collection)
- Audience targeting via `Audience` model (program, batch, semester, section, roles, userIds)
- File uploads: multipart, magic-byte validated, served via `/api/files/:id` with entitlement check (incl. `notice_attachment`)
- Rich text: stored as sanitized `contentHtml` + plain `content`; sanitized server-side (`backend/src/utils/sanitizeHtml.js`) and client-side (`frontend/src/lib/sanitizeHtml.ts`)

## Verified Commands
```bash
npm install
npm run dev          # API + Vite (auto-starts mongod)
npm run dev:client   # Vite only
npm run dev:server   # Backend with --watch
npm run server       # Backend only
npm run seed:demo    # Create demo fixtures
npm run seed:demo:reset # Drop + recreate fixtures
npm run test         # All suites
npm run test:api     # Backend integration tests
npm run test:calendar # Nepali calendar tests
npm run test:lms-format # LMS format tests
npm run test:policy  # Password policy tests
npm run test:sanitize # Rich-text sanitizer tests
npm run build        # Production frontend build
npm run preview      # Preview build
npm run clean        # Remove dist/
npm run lint         # tsc --noEmit
```

## Important Security Restrictions
- `VITE_*` = public; never put secrets there
- JWT secret, bootstrap password, mail credentials → backend `.env` only
- Authorization enforced in middleware + route handlers, never in frontend
- Session user re-derived on every request; request body IDs not trusted

## Known Defects / Unfinished Features
1. **Tenant isolation incomplete** — institution-wide scoping not enforced across all collections/queries
2. **Forgot-password** — no email delivery; reset token stored but not issued
3. **Academic Calendar workspace** — renders timetable/exam data instead of calendar events
4. **Library circulation** — `library.view` permission exists but borrowing/fines have no backend model or routes; the Library & Facilities workspace reports the gap instead of simulating writes (proposed: `backend/src/models/LibraryItem.js`, `backend/src/models/LibraryLoan.js`, `backend/src/routes/library.js` registered in `app.js`)
5. **PDF transcript generation** — `Document` model accepts `TRANSCRIPT` type but no generator
6. **Object storage** — local disk only (`backend/uploads/`), no S3 abstraction
7. **Google OAuth / SSO** — not implemented (email/password only)
8. **Biometric/QR attendance hardware** — not integrated

## Links to Detailed Technical Documents
- Architecture: `docs/ARCHITECTURE.md`
- Directory structure: `docs/DIRECTORY_STRUCTURE.md`
- Authentication: `docs/AUTHENTICATION.md`
- Authorization/RBAC: `docs/AUTHORIZATION_AND_RBAC.md`
- Database: `docs/DATABASE.md`
- API reference: `docs/API_REFERENCE.md`
- Frontend: `docs/FRONTEND.md`
- Backend: `docs/BACKEND.md`
- Modules: `docs/MODULES.md`
- Configuration: `docs/CONFIGURATION.md`
- Development: `docs/DEVELOPMENT.md`
- Testing: `docs/TESTING.md`
- Deployment: `docs/DEPLOYMENT.md`
- Security: `docs/SECURITY.md`
- Troubleshooting: `docs/TROUBLESHOOTING.md`
- Documentation maintenance: `docs/DOCUMENTATION_MAINTENANCE.md`

## Task-to-File Lookup Table

| Task Type | Initial Files to Inspect |
|-----------|-------------------------|
| Login / dashboard bug | `backend/src/routes/auth.js`, `backend/src/middleware/auth.js`, `backend/src/db.js` (login, session), `frontend/src/context/CollegeOSContext.tsx`, `frontend/src/services/apiClient.ts` |
| User creation / account status | `backend/src/routes/administration.js`, `backend/src/models/User.js`, `backend/src/models/Student.js`, `backend/src/middleware/auth.js` (requireStudentScope), `frontend/src/components/modules/UserManagementView.tsx` |
| API changes | `backend/src/app.js` (registration), `backend/src/routes/<domain>.js`, `backend/src/services/accessControl.js`, `backend/src/permissions/catalog.js`, `api/contracts/*.md` |
| Database changes | `backend/src/models/<Model>.js`, `backend/src/db.js` (bootstrap, migrations), `backend/src/config/database.js` |
| Frontend UI changes | `frontend/src/components/modules/<Module>View.tsx`, `frontend/src/components/ui/`, `frontend/src/services/lmsApi.ts`, `frontend/src/context/CollegeOSContext.tsx` |
| Attendance changes | `backend/src/routes/attendance.js`, `backend/src/models/Attendance*.js`, `backend/src/services/accessControl.js` (teaching scope), `frontend/src/components/modules/AttendanceWorkspaceView.tsx` |
| Examination changes | `backend/src/routes/examinations.js`, `backend/src/routes/examSeating.js`, `backend/src/models/Exam*.js`, `backend/src/services/gradingService.js`, `backend/src/services/examSeatingService.js`, `backend/src/services/examVenueService.js`, `backend/src/permissions/catalog.js` (exam permissions), `frontend/src/components/modules/exam/ExamSeatingWorkspace.tsx` |
| Finance changes | `backend/src/routes/finance.js`, `backend/src/models/Invoice.js`, `backend/src/models/Payment.js`, `backend/src/permissions/catalog.js` (finance permissions) |
| Coding Lab changes | `backend/src/routes/coding.js`, `backend/src/services/codeExecution.js`, `backend/src/models/Coding*.js`, `frontend/src/components/modules/coding/`, `docs/CODING_LAB.md` |
| Configuration changes | `.env.example`, `backend/src/config/database.js`, `backend/src/db.js` (env usage), `package.json` (scripts) |
| Deployment issues | `scripts/dev.js`, `backend/src/server.js`, `frontend/vite.config.ts`, `.env.example` |
| Documentation changes | Relevant `docs/*.md`, `AGENTS.md`, `docs/AI_CONTEXT.md`, Git diff |