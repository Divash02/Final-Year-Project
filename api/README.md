# API Contracts

`api/` contains contract documentation only. `backend/src/routes/` is the sole authoritative HTTP API implementation; no routes or business logic are duplicated here.

All endpoints use the `/api` prefix. Authentication uses bearer tokens issued by the backend. Role, student ownership, and session validation remain server-side responsibilities.

Current implemented route domains include health, authentication, administration/account provisioning, student/academic records, attendance, assignments, mail and direct messages (under `communication.js`), notices, workflow cases, audit logging (no dedicated route — written via `logAudit` in `backend/src/db.js`), reporting and analytics (under `reporting.js`), finance, admissions, examinations, calendar, materials, timetable, files, profile and departmental. Exact limitations and current endpoint behavior are recorded in [contracts/auth.md](contracts/auth.md), [contracts/my-courses.md](contracts/my-courses.md), [contracts/faculty-course-workspace.md](contracts/faculty-course-workspace.md) and [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).

Contracts should be added here when they are needed by more than one consumer or to make a backend change reviewable. Do not create a second API server or hand-maintained duplicate runtime types.

| Contract | Implementation |
|---|---|
| [contracts/auth.md](contracts/auth.md) | `backend/src/routes/auth.js` |
| [contracts/my-courses.md](contracts/my-courses.md) | `backend/src/routes/academics.js`, `backend/src/services/lms/myCourses.js` |
| [contracts/faculty-course-workspace.md](contracts/faculty-course-workspace.md) | `backend/src/routes/lms.js`, `backend/src/routes/quizzes.js`, `backend/src/routes/assignments.js`, `backend/src/services/lms/lmsAccess.js` |