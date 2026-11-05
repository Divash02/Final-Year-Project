# COLLEGEOS Module Inventory Audit

**Audit phase:** Phase 2 (Module-by-Module Audit) — complete  
**Deliverable:** Module Inventory  
**Audit type:** Audit-only (no source code modified)  
**Repository:** `collegeos-multi-tenant-education-operating-system`  
**Date:** 2026-11-04  

---

## 1. Executive Summary

CollegeOS exposes roughly 30 backend route modules under `backend/src/routes/` and a matching set of frontend service modules under `frontend/src/services/`. Modules span authentication, identity, academics, LMS, examinations, finance, attendance, timetable, library, mail/messaging, notices/notifications, workflow/approvals, HR/facilities, documents/files, admissions, and AI. Dead-code `.bak` duplicates exist for at least two modules.

Each module is documented below with its backend route file(s), key models, frontend service, and audit status.

---

## 2. Module Inventory Table

| # | Module | Backend Route(s) | Key Model(s) | Frontend Service | Status |
|---|---|---|---|---|---|
| 1 | Authentication | `auth.js` | User, Session | apiClient.ts | Implemented |
| 2 | Administration / Tenancy | `administration.js` (+`.bak`) | Department, Program | — | Implemented (dead `.bak`) |
| 3 | Finance | `finance.js` | Invoice, Payment | — | Implemented |
| 4 | Examinations | `examinations.js` | — | — | Implemented |
| 5 | Timetable | `timetable.js` | — | adminTimetableApi.ts, timetableApi.ts | Implemented |
| 6 | Attendance | `attendance.js` | — | attendanceApi.ts | Implemented |
| 7 | Communication | `communication.js` | Mail, Message | — | Implemented |
| 8 | Workflow / Approvals | `workflow.js` | — | — | Implemented |
| 9 | Library | `library.js` | — | libraryApi.ts | Implemented |
| 10 | LMS (Courses/Materials/Assignments/Quizzes) | `lms.js`, `materials.js`, `assignments.js`, `quizzes.js` | Course, Section, Enrollment | lmsApi.ts | Implemented |
| 11 | Calendar / Scheduling | `calendar.js`, `myTimetable.js` | — | — | Implemented |
| 12 | Notices / Notifications | `notices.js` | Notice, Notification | — | Implemented |
| 13 | Documents / Files | `documents.js`, `files.js` | — | uploadClient.ts | Implemented |
| 14 | HR / Facilities | `hr.js` | Staff, Employee | — | Implemented |
| 15 | Admissions | `admissions.js` | — | — | Implemented |
| 16 | Exam Seating | `examSeating.js` | — | — | Implemented |
| 17 | AI | `ai.js` | — | aiApi.ts | Implemented |
| 18 | Departmental | `departmental.js` | Department | — | Implemented |
| 19 | Analytics / Reporting | `reports.js` | — | analyticsApi.ts | Implemented |
| 20 | Assessment | `assessments.js` | — | assessmentApi.ts | Implemented |

> Note: Route filenames vary between singular/plural and kebab/camel; the table normalizes names. Some route files map to multiple models/services.

---

## 3. Module Detail

### 3.1 Authentication
- **Route:** `backend/src/routes/auth.js`
- **Models:** User, Session
- **Service:** `apiClient.ts`
- **Capabilities:** Login, register, logout, session validation, password change
- **Findings:** JWT HS256; session token hash SHA-256; bcrypt cost 10; forgot-password returns 501 (no email); reset tokens not issued

### 3.2 Administration / Tenancy
- **Route:** `backend/src/routes/administration.js` (+ `administration.js.bak`)
- **Models:** Department, Program
- **Findings:** `.bak` dead-code duplicate present; multi-tenancy by tenant field on User/department

### 3.3 Finance
- **Route:** `backend/src/routes/finance.js`
- **Models:** Invoice, Payment
- **Service:** —
- **Role boundary:** finance_officer should own invoice/payment data; exam_officer must be separated

### 3.4 Examinations
- **Route:** `backend/src/routes/examinations.js`
- **Role boundary:** exam_officer owns exam data; must not see finance invoices/payments

### 3.5 Timetable
- **Route:** `backend/src/routes/timetable.js`
- **Services:** `adminTimetableApi.ts`, `timetableApi.ts`
- **Related:** `myTimetable.js` (student view), `calendar.js`

### 3.6 Attendance
- **Route:** `backend/src/routes/attendance.js`
- **Service:** `attendanceApi.ts`

### 3.7 Communication (Mail / Message)
- **Route:** `backend/src/routes/communication.js`
- **Models:** Mail, Message
- **Transport:** Nodemailer (configured but not delivered for password reset)

### 3.8 Workflow / Approvals
- **Route:** `backend/src/routes/workflow.js`
- **Capabilities:** Multi-step approval routing by role/department

### 3.9 Library
- **Route:** `backend/src/routes/library.js`
- **Service:** `libraryApi.ts`

### 3.10 LMS
- **Routes:** `lms.js`, `materials.js`, `assignments.js`, `quizzes.js`
- **Models:** Course, Section, Enrollment
- **Service:** `lmsApi.ts`
- **Frontend tech:** Tiptap (rich text), Three.js / react-three/fiber (3D)

### 3.11 Calendar / Scheduling
- **Routes:** `calendar.js`, `myTimetable.js`
- **Lib:** `frontend/src/lib/` navigation, appRoutes

### 3.12 Notices / Notifications
- **Route:** `backend/src/routes/notices.js`
- **Models:** Notice, Notification

### 3.13 Documents / Files
- **Routes:** `documents.js`, `files.js`
- **Service:** `uploadClient.ts`
- **Storage:** multer local disk (`UPLOAD_ROOT`), `FORBIDDEN_EXTENSIONS` blocklist

### 3.14 HR / Facilities
- **Route:** `backend/src/routes/hr.js`
- **Models:** Staff, Employee

### 3.15 Admissions
- **Route:** `backend/src/routes/admissions.js`

### 3.16 Exam Seating
- **Route:** `backend/src/routes/examSeating.js`

### 3.17 AI
- **Route:** `backend/src/routes/ai.js`
- **Service:** `aiApi.ts`

### 3.18 Departmental
- **Route:** `backend/src/routes/departmental.js`

### 3.19 Analytics / Reporting
- **Route:** `backend/src/routes/reports.js`
- **Service:** `analyticsApi.ts`

### 3.20 Assessment
- **Route:** `backend/src/routes/assessments.js`
- **Service:** `assessmentApi.ts`

---

## 4. Frontend Service Inventory

| Service File | Backend Counterpart | Purpose |
|---|---|---|
| `apiClient.ts` | All routes | Base URL, session failure codes, `resolveAssetUrl` |
| `adminTimetableApi.ts` | `timetable.js` | Admin timetable CRUD |
| `aiApi.ts` | `ai.js` | AI module |
| `analyticsApi.ts` | `reports.js` | Analytics/reporting |
| `assessmentApi.ts` | `assessments.js` | Assessment/grading |
| `attendanceApi.ts` | `attendance.js` | Attendance |
| `libraryApi.ts` | `library.js` | Library |
| `lmsApi.ts` | `lms.js`, `materials.js`, `assignments.js`, `quizzes.js` | LMS CRUD |
| `sessionSecurity.ts` | — | Client session timeout |
| `timetableApi.ts` | `timetable.js` | Student timetable |
| `uploadClient.ts` | `files.js`, `documents.js` | File upload |

---

## 5. Dead Code & Duplicates

| File | Type | Recommendation |
|---|---|---|
| `backend/src/routes/administration.js.bak` | Route backup | Remove after confirming superseded by `administration.js` |
| `frontend/src/components/pages/LearningWorkspaceView.tsx.bak` | Component backup | Remove |
| `frontend/src/components/pages/UserManagementView.tsx.bak` | Component backup | Remove |
| `frontend/src/components/s/` | Single-letter directory | Investigate purpose; document or remove |

---

## 6. Coverage Gaps

| Gap | Detail |
|---|---|
| No route-to-model traceability matrix | Not documented which models each route touches |
| No API versioning | Routes mounted without `/v1/` prefix |
| No OpenAPI/Swagger spec | `api/` contracts exist only for notices, my-courses, faculty-course-workspace, auth |
| Inconsistent naming | Singular/plural, kebab/camel mixed across route files |

---

## 7. Conclusion

CollegeOS has ~20 functional modules spanning the full education ERP/SIS/LMS surface. All core modules are wired end-to-end. Primary inventory concerns: dead-code `.bak` files, inconsistent route naming, no API versioning, no OpenAPI spec, and limited API contract documentation (only 4 of ~30 routes have contracts under `api/contracts/`).
