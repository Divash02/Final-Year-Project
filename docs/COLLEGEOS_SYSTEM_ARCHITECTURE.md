# COLLEGEOS System Architecture Audit

**Audit phase:** Phase 1 (Discovery) — complete  
**Deliverable:** System Architecture  
**Audit type:** Audit-only (no source code modified)  
**Repository:** `collegeos-multi-tenant-education-operating-system`  
**Date:** 2026-11-04  

---

## 1. Executive Summary

CollegeOS is a multi-tenant education operating system delivering ERP, SIS, and LMS capabilities through a single-page web application backed by a modular Express monolith. The frontend is a React 19 SPA (Vite 6) and the backend is an Express server running on port 4000 with the frontend on port 3000. Persistence is documented as MongoDB via Mongoose 9, though undocumented SQLite `.db` files exist alongside the MongoDB deployment.

The architecture follows a modular monolith pattern with route-per-module organization under `backend/src/routes/` and an explicit 12-role RBAC catalog under `backend/src/permissions/catalog.js`. Auth uses JWT (HS256) plus MongoDB session tokens, bcrypt cost 10, with per-role session timeout policy.

**Overall maturity:** Functional prototype / early production. Core modules (auth, academics, LMS, finance, attendance, timetable, library) are wired end-to-end, but security hardening (CSRF, rate limiting durability, secret management, CORS scoping) is incomplete.

---

## 2. Deployment Topology

| Layer | Technology | Port | Notes |
|---|---|---|---|
| Client | React 19 + Vite 6 | 3000 | SPA, single npm install shared |
| API Gateway / App | Express | 4000 | Modular monolith, all routes under one server |
| Auth | JWT (HS256) + MongoDB Session collection | — | Token hash SHA-256, bcrypt cost 10 |
| Primary data store | MongoDB + Mongoose 9 | — | Documented |
| Undocumented store | SQLite `.db` files | — | `database/data/collegeos.db`, `database/backups/collegeos-pre-refactor.db` |
| Real-time | Socket.io | — | WebSocket fallback polling |
| Email | Nodemailer | — | Forgot-password returns 501 (not delivered) |
| File storage | multer (local disk) | — | `UPLOAD_ROOT`, forbidden extension list |

No containerization (Dockerfile, docker-compose), CI configuration, or Kubernetes manifests were observed in the repository root.

---

## 3. Backend Architecture

### 3.1 Entry & Boot Sequence

```
package.json start script
  └─ backend/src/server.js        (Express app + listen on 4000)
       ├─ backend/src/app.js       (middleware stack, route mounting)
       │   ├─ CORS (cors(), no options — open)
       │   ├─ helmet / compression / morgan
       │   ├─ express.json, express.urlencoded
       │   ├─ multer file upload middleware
       │   ├─ auth middleware (requireAuth, requirePermission, requireRole)
       │   └─ route mount (30+ route files under /api/*)
       └─ backend/src/db.js         (Mongoose connect, JWT sign/verify,
                                       bcrypt helpers, bootstrap admin)
```

### 3.2 Configuration Layers

| File | Purpose | Key Concern |
|---|---|---|
| `backend/src/config/database.js` | Mongoose connection with retry logic | Connection resilience |
| `backend/src/config/sessionSecurity.js` | Per-role session timeout policy | Timeout by role |
| `backend/src/db.js` | DB connection, JWT sign/verify, bcrypt, bootstrap | **Hardcoded JWT_SECRET fallback**; bootstrap admin password in `.env` |
| `.env` (committed) | Environment secrets | **Real secrets committed to repo** (JWT_SECRET, bootstrap password `Nepal@123`) |

### 3.3 Middleware Stack

- `backend/src/middleware/auth.js` — `requireAuth`, `requirePermission`, `requireRole`; session failure codes
- `backend/src/utils/apiError.js` — `ApiError` class, `route()` async wrapper (try/catch → next(err))
- `backend/src/utils/validate.js` — shared field validation helpers (`requireString`, `optionalString`, `requireEnum`, etc.)

---

## 4. Frontend Architecture

### 4.1 Entry & Routing

```
index.html
  └─ frontend/src/main.tsx         (Vite entry, ReactDOM root)
       ├─ frontend/src/App.tsx     (RouterProvider, protected/public route split)
       ├─ frontend/src/CollegeOSContext.tsx (auth/session/tenancy context)
       ├─ frontend/src/lib/appRoutes.ts  (routeToView mapping)
       └─ frontend/src/lib/navigation.ts (NavItem / NavSection config)
```

### 4.2 Services Layer

| Service | Responsibility |
|---|---|
| `apiClient.ts` | Base URL resolution, session failure codes, `resolveAssetUrl` |
| `adminTimetableApi.ts` | Admin timetable endpoints |
| `aiApi.ts` | AI module endpoints |
| `analyticsApi.ts` | Analytics/reporting endpoints |
| `assessmentApi.ts` | Assessment/grading endpoints |
| `attendanceApi.ts` | Attendance endpoints |
| `libraryApi.ts` | Library endpoints |
| `lmsApi.ts` | LMS (courses, materials, assignments, quizzes) |
| `sessionSecurity.ts` | Client-side session timeout enforcement |
| `timetableApi.ts` | Timetable endpoints |
| `uploadClient.ts` | File upload client |

### 4.3 UI Organization

- `frontend/src/components/pages/` — page-level views (`.bak` dead-code duplicates present)
- `frontend/src/components/s/` — single-letter directory (unclear purpose)
- `frontend/src/lib/` — navigation, routes, appRoutes

---

## 5. Data Layer (Documented)

### 5.1 Mongoose Models (48)

`backend/src/models/` — 48 model files exported from `index.js`. Key models:

| Model | Role |
|---|---|
| `User` | Core identity (email, passwordHash, role, tenant) |
| `Student` | Student profile |
| `Staff` | Staff profile |
| `Employee` | Employee HR profile |
| `Department` | Academic department |
| `Program` | Academic program |
| `Course` | Course catalog |
| `Section` | Course section / offering |
| `Enrollment` | Student-section enrollment |
| `Invoice` | Finance invoice |
| `Payment` | Payment transaction |
| `Mail` | Outbound/inbound mail |
| `Message` | Messaging |
| `Notice` | Bulletin board notice |
| `Notification` | System notification |
| `Session` | Auth session store (tokenHash SHA-256) |

### 5.2 Undocumented Data Stores

Two SQLite `.db` files were found with no documentation:
- `database/data/collegeos.db`
- `database/backups/collegeos-pre-refactor.db`

**Finding:** These are not referenced in docs, config, or code. Purpose and schema unknown. Potential data-loss risk if backups are stale or orphaned.

---

## 6. Authorization & RBAC

### 6.1 Role Catalog (`backend/src/permissions/catalog.js`)

**CORE_ROLES (12):**
student, parent, faculty, program_coordinator, hod, registrar, exam_officer, finance_officer, campus_admin, dean, super_admin

**Legacy alias:** `institution_admin` → `super_admin`

Permission grants defined per role in `roleGrants` map (500+ lines). Object-level authorization handled by `backend/src/services/accessControl.js` with `STAFF_ROLES` and audience resolution.

### 6.2 Access Control Service

`backend/src/services/accessControl.js` — resolves object-level access based on role, ownership, and department/tenant audience.

---

## 7. Real-time & Communication

- **Socket.io** — WebSocket transport with polling fallback; used for live notifications/presence
- **Nodemailer** — email transport configured; forgot-password endpoint returns 501 (email delivery not implemented)
- **Mail / Message / Notice / Notification** models — inbox, bulletin board, system alerts

---

## 8. File Upload

`backend/src/services/fileStorage.js` — multer configuration:
- `UPLOAD_ROOT` — local disk storage root
- `FORBIDDEN_EXTENSIONS` — blocklist of dangerous file types
- `FILE_POLICIES` — per-category size/type limits

No virus scanning, no cloud storage (S3/GCS) integration, no signed URL generation observed.

---

## 9. Observability & Testing

### 9.1 Backend Tests

`backend/tests/` — 12 test files covering routes/services. Test framework appears to be Jest/Supertest-style.

### 9.2 Frontend Lib Tests

`frontend/src/lib/tests/` — unit tests for:
- `nepaliCalendar` — Nepali calendar date utilities
- `lmsFormat` — LMS display formatting
- `passwordPolicy` — password strength validation
- `sanitizeHtml` — HTML sanitization
- `navigation` — route navigation logic
- `sessionTimeoutManager` — client-side session timeout
- `toastPolicy` — toast notification policy

No e2e/Playwright/Cypress tests observed. No load/performance tests observed.

---

## 10. Known Gaps & Observations

| Area | Observation | Severity |
|---|---|---|
| Secret management | `.env` with real JWT_SECRET and bootstrap password committed | P0 |
| JWT_SECRET fallback | Hardcoded fallback in `db.js` | P1 |
| Rate limiting | In-memory only; resets on server restart | P1 |
| CORS | `cors()` with no options (open to all origins) | P1 |
| CSRF | No CSRF protection observed | P1 |
| Forgot password | Returns 501; reset tokens never issued | P2 |
| SQLite `.db` files | Undocumented, purpose unknown | P2 |
| Dead code | `.bak` backup files in routes and components | P3 |
| Containerization | No Dockerfile / docker-compose / CI | P3 |
| e2e tests | No end-to-end test suite | P3 |

---

## 11. Conclusion

CollegeOS is a complete modular monolith education platform with a documented role model and core modules wired end-to-end. The architecture is sound for a monolith at current scale, but requires security hardening (secrets, CORS, CSRF, rate limiting), clarification of the undocumented SQLite stores, removal of dead-code backups, and addition of containerization/e2e testing before production deployment.
