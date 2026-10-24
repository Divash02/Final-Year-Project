# CollegeOS — Backend

## Stack
- **Runtime:** Node.js 20+ (ESM, `"type": "module"`)
- **Framework:** Express 4
- **Database:** MongoDB via Mongoose 9
- **Auth:** JWT (`jsonwebtoken`), bcryptjs, custom session store
- **File upload:** Multer 2 (multipart, magic-byte validation)
- **Validation:** Manual in handlers (no Joi/Zod)
- **Testing:** Node native test runner (`node --test`)

## Project Structure
```
backend/
├── src/
│   ├── server.js              # Entry: starts HTTP + academic scheduler
│   ├── app.js                 # Express app, middleware, route registration
│   ├── config/
│   │   └── database.js        # Mongoose connection (retry logic)
│   ├── db.js                  # Persistence helpers, bootstrap, auth utils
│   ├── middleware/
│   │   └── auth.js            # requireAuth, requireRole, requirePermission, requireStudentScope, requireOwnStudent
│   ├── models/                # 38 Mongoose models (one per collection)
│   ├── permissions/
│   │   └── catalog.js         # Role→permission map (authoritative)
│   ├── routes/                # 22 domain route modules
│   ├── services/
│   │   ├── lms/               # LMS-specific services
│   │   ├── accessControl.js   # Audience resolution, teaching scope
│   │   ├── academicClock.js   # Academic period resolution
│   │   ├── documentMeta.js    # File metadata extraction (slides, pages)
│   │   ├── examWorkflowService.js # Exam result workflow
│   │   ├── fileStorage.js     # Upload policy, magic-byte validation
│   │   ├── gradingService.js  # Grade computation, GPA/CGPA
│   │   ├── institutionalEmail.js # Email generation
│   │   ├── myTimetable.js     # Personal timetable queries
│   │   ├── nepaliDateHelper.js # BS/AD conversion helpers
│   │   ├── passwordPolicy.js  # Password validation
│   │   ├── similarityService.js # Plagiarism/AI detection
│   │   ├── studentProvisioning.js # Student account creation
│   │   ├── timetableChanges.js # Timetable change workflow
│   │   └── timetableConflicts.js # Conflict detection
│   └── utils/
│       └── apiError.js        # Structured error responses
├── tests/                     # Integration tests (real MongoDB)
│   ├── api.test.js            # Full API suite
│   ├── facultyCourseWorkspace.test.js
│   ├── facultyMyTimetable.test.js
│   ├── lms.test.js
│   └── myCourses.test.js
└── uploads/                   # Private file storage
    ├── academic-calendar/
    ├── academic-calendar-documents/
    ├── assignment-submission/
    ├── avatars/
    └── learning-material/
```

## Entry Points

### `server.js`
```javascript
import { initializeServerState } from "./db.js";
import { createApp } from "./app.js";
import { startAcademicScheduler, stopAcademicScheduler } from "./services/lms/scheduler.js";

initializeServerState();  // connectDatabase() → seedBaseUsers() → migrateConsolidatedRoles()
const app = createApp();
const server = app.listen(PORT);
startAcademicScheduler();  // Weekly sweep for scheduled materials/quizzes
// SIGINT/SIGTERM → stopAcademicScheduler() → server.close()
```

### `app.js`
- Creates Express app, disables `x-powered-by`
- CORS (default), JSON/urlencoded body parsing (1MB limit)
- Static `/uploads/avatars` (only public assets)
- **Route registration order** (58-82):
  1. `registerHealthRoutes` — `/health`
  2. `registerAuthRoutes` — `/api/auth`
  3. `registerAdministrationRoutes` — `/api/admin`
  4. `registerAcademicsRoutes` — `/api/courses`, `/sections`, etc.
  5. `registerAcademicCalendarRoutes` — `/api/calendar`
  6. `registerLearningMaterialRoutes` — `/api/learning-materials`
  7. `registerAssignmentRoutes` — `/api/assignments`, `/api/submissions`
  8. `registerLmsRoutes` — `/api/lms`
  9. `registerQuizRoutes` — `/api/lms/quizzes`, `/api/lms/attempts`
  10. `registerTimetableRoutes` — `/api/timetable`
  11. `registerMyTimetableRoutes` — `/api/my-timetable`
  12. `registerFileRoutes` — `/api/files`
  13. `registerNoticesRoutes` — `/api/notices`
  14. `registerCommunicationRoutes` — `/api/mail`, `/messages`, `/notifications`
  15. `registerWorkflowRoutes` — `/api/workflow`
  16. `registerReportingRoutes` — `/api/reporting`
  17. `registerFinanceRoutes` — `/api/finance`
  18. `registerAdmissionsRoutes` — `/api/admissions`
  19. `registerExaminationRoutes` — `/api/examinations`
  20. `registerProfileRoutes` — `/api/profile`
  21. `registerDepartmentalRoutes` — `/api/departmental`
  22. `registerAttendanceRoutes` — `/api/attendance`
- 404 handler for `/api/*` → structured error
- Central error boundary → `toErrorResponse()` from `utils/apiError.js`

## Middleware Chain (`middleware/auth.js`)

```javascript
requireAuth → (req.user, req.session, req.token)
requireRole(["role1", "role2"]) → 403 if no match
requirePermission(["perm1", "perm2"]) → 403 if no grant
requireStudentScope("id") → 404 if not own/registrar/super_admin
requireOwnStudent → 403 if not own/faculty/registrar/super_admin
```

**Password rotation enforcement:** If `user.mustChangePassword` and path not in `[/auth/me, /auth/change-password, /auth/logout]` → `403 { code: "PASSWORD_CHANGE_REQUIRED" }`

## Route Module Pattern

Each `routes/<domain>.js` exports `register<Domain>Routes(app)`:

```javascript
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { Model } from "../models/index.js";
import { serviceFunction } from "../services/service.js";

export function register<Domain>Routes(app) {
  app.get("/api/endpoint", requireAuth, requirePermission("perm"), async (req, res) => {
    try {
      // 1. Derive scope from req.user (never trust req.body IDs)
      // 2. Call service / query models
      // 3. Return structured JSON
    } catch (err) {
      // Let central error handler process
      throw err;
    }
  });
}
```

**Key principle:** No validation library — manual checks in handler. Object-level authorization via `accessControl.js` services.

## Services

| Service | Purpose |
|---------|---------|
| `accessControl.js` | Audience visibility, teaching scope, student targeting |
| `academicClock.js` | Current academic year/semester resolution |
| `documentMeta.js` | Extract page/slide count from PDF/PPTX/DOCX |
| `examWorkflowService.js` | Exam result verification, publication, revocation |
| `fileStorage.js` | Multer config, magic-byte validation, storage paths |
| `gradingService.js` | GPA/CGPA computation, grade scaling |
| `institutionalEmail.js` | Generate `@techspire.edu.np` emails |
| `myTimetable.js` | Personal timetable queries |
| `nepaliDateHelper.js` | BS/AD conversion for backend |
| `passwordPolicy.js` | Password strength validation |
| `similarityService.js` | Plagiarism detection (Google GenAI) |
| `studentProvisioning.js` | Create student + user + enrollment atomically |
| `timetableChanges.js` | Timetable change requests + approval |
| `timetableConflicts.js` | Teacher/room/cohort conflict detection |
| `lms/scheduler.js` | Weekly sweep: publish scheduled weeks/materials/quizzes |

## Error Handling (`utils/apiError.js`)

```javascript
export function toErrorResponse(error, { logContext }) {
  // Known errors (validation, auth, not found) → safe message + status
  // Unknown errors → logged server-side, returns { error: "Internal server error", code: "INTERNAL", ref: "<uuid>" }
  // Stack traces never sent to client
}
```

## Database (`db.js`)

Key exports:
- `hashPassword`, `verifyPassword` — bcrypt (cost 10)
- `signToken`, `verifyToken` — JWT (HS256, 8h, `JWT_SECRET`)
- `createSession`, `getSessionByToken`, `revokeSession`, `revokeUserSessions` — Session collection
- `getUserByEmail`, `getUserById`, `getUserRoles`, `userToPublic` — User queries
- `logAudit`, `recordInstitutionEvent` — AuditLog writes
- `createPasswordResetToken`, `getPasswordResetToken`, `invalidatePasswordResetTokens` — Reset flow
- `seedBaseUsers` — Bootstrap Super Admin
- `migrateConsolidatedRoles` — Legacy role migration
- `initializeServerState` — Boot sequence
- `getAnalyticsSummary` — Institution-wide stats for dashboard

## Permissions (`permissions/catalog.js`)

- `CORE_ROLES` — 12 roles in hierarchy
- `LEGACY_ROLE_ALIASES` — `institution_admin` → `super_admin`
- `normalizeRoles(roles)` — Replaces legacy, deduplicates
- `roleGrants` — 500+ line permission → roles[] map
- `getPermissionsForRoles(roles)` → permission[]
- `hasPermission(roles, permission)` → boolean
- `can(user, resource, action)` → boolean (coarse check)

## File Storage (`services/fileStorage.js`)

- **Multer** with memory storage → magic-byte validation → write to `backend/uploads/<module>/`
- **Content families** by magic bytes: PDF, Office (PPTX/DOCX/XLSX), images, archives, video, audio, text
- **Policies** per module (`FILE_POLICIES`):
  - `avatar` — images only, 5MB
  - `learning_material` — PDF, Office, images, archives, video, audio, 100MB
  - `assignment_submission` — all except executables, 50MB
  - `calendar_attachment` — PDF, Office, images, 20MB
- **StoredFile** model tracks: originalName, mimeType, extension, sizeBytes, storagePath, contentFamily, checksum (SHA-256 deduplication)
- **Served via** `/api/files/:id` with entitlement check (not static)

## Academic Scheduler (`services/lms/scheduler.js`)

- Runs every **5 minutes** (`setInterval`)
- **Idempotent** — every read re-derives state from clock
- Actions:
  - Publish weeks where `releaseAt <= now`
  - Publish materials where `releaseAt <= now` and `status === SCHEDULED`
  - Open quizzes where `openAt <= now`
  - Close quizzes where `closeAt <= now`
  - Deliver announcements where `publishAt <= now`
- **Not the only enforcement** — client/server both check timestamps

## Testing

```bash
npm run test:api
```

- **File:** `backend/tests/api.test.js`
- **Runs against:** Real Express app on ephemeral port + dedicated MongoDB (`collegeos_test`)
- **Database:** Dropped before and after each run
- **Coverage:** Auth lifecycle, account provisioning, academics, calendar, materials, assignments, submissions, quizzes, timetable conflicts, file entitlement, attendance, exams, finance, workflow
- **Negative cases:** Every permission rule tested for 403/404
- **Fixtures:** Real PDF/PPTX buffers for upload tests

### Test Utilities (`api.test.js`)
- `api(path, { method, token, body })` — fetch wrapper
- `login(email, password)` → token
- `activate(email, tempPass, newPass)` → token
- `provision(adminToken, userData)` → creates user, activates, returns token
- `createCourse(token, courseData)` → course

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 4000 | HTTP port |
| `MONGODB_URI` | Yes | `mongodb://127.0.0.1:27017/collegeos` | MongoDB connection |
| `JWT_SECRET` | Yes | (dev default) | JWT signing secret |
| `COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD` | Yes | `Nepal@123` | Initial admin password |
| `INSTITUTION_EMAIL_DOMAIN` | No | `techspire.edu.np` | Email domain for accounts |
| `COLLEGEOS_TEST_DB` | Test only | `collegeos_test` | Test database name |
| `COLLEGEOS_TEST_MONGO_HOST` | Test only | `127.0.0.1:27017` | Test MongoDB host |

## Development Workflow

```bash
npm run dev:server      # node --watch backend/src/server.js
npm run server          # node backend/src/server.js
npm run seed:demo       # Create demo fixtures
npm run seed:demo:reset # Drop + recreate fixtures
```

## Production Considerations

- **MongoDB:** Use replica set URI, not localhost
- **JWT_SECRET:** Strong random string (32+ chars)
- **Bootstrap password:** Set before first deploy; changing later has no effect
- **File storage:** Local disk only — plan for S3 migration
- **CORS:** Configure for production domain
- **Rate limiting:** Not implemented (login uses in-memory map)
- **Logging:** Console only — add structured logging for production
- **HTTPS:** Terminate at reverse proxy (nginx/Caddy)

## Related Files
| File | Purpose |
|------|---------|
| `backend/src/server.js` | Entry point |
| `backend/src/app.js` | Route registration |
| `backend/src/config/database.js` | DB connection |
| `backend/src/db.js` | Persistence helpers |
| `backend/src/middleware/auth.js` | Auth middleware |
| `backend/src/permissions/catalog.js` | Permissions |
| `backend/src/routes/*.js` | Route handlers |
| `backend/src/services/*.js` | Business logic |
| `backend/tests/api.test.js` | Integration tests |
| `scripts/dev.js` | Dev orchestration |