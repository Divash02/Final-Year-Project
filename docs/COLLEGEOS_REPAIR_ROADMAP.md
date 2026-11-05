# COLLEGEOS Repair Roadmap

**Audit phase:** Phase 6 (Remediation Planning) — complete  
**Deliverable:** Repair Roadmap  
**Audit type:** Audit-only (no source code modified)  
**Repository:** `collegeos-multi-tenant-education-operating-system`  
**Date:** 2026-11-04  

---

## 1. Executive Summary

This roadmap sequences remediation of the 22 defects logged in the COLLEGEOS_DEFECT_REGISTER.md across three waves. Wave 1 addresses P0/P1 security-critical items that block any production release. Wave 2 addresses P2 functional and hardening items. Wave 3 addresses P3 code-quality, documentation, and testing items.

All remediations are targeted fixes within the existing modular monolith; no architectural redesign is required.

Estimated total effort: ~6–8 developer-weeks across 3 waves.

---

## 2. Prioritization Principles

1. **Security before function:** P0/P1 security defects take precedence over P2/P3 functional items.
2. **Blockers first:** Committed secrets and hardcoded JWT fallback block all other release work.
3. **Minimal blast radius:** Each fix touches the fewest files possible; no broad refactors.
4. **Verify after fix:** Each remediation includes a verification step (test, config check, or grep).

---

## 3. Wave 1 — P0/P1 Security Blockers (Before Any Release)

**Estimated effort:** ~2 developer-weeks  
**Goal:** Eliminate active compromise risk; make the system releasable.

### 3.1 D-001 / D-002 — Remove Committed Secrets & Hardcoded JWT Fallback
**Severity:** P0  
**Files:** `.env`, `backend/src/db.js`, `.gitignore`  
**Steps:**
1. Rotate `JWT_SECRET` and `COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD` (generate new strong values)
2. Remove `.env` from version control (`git rm --cached .env`); add `.env` and `.env.local` to `.gitignore`
3. Provide `.env.example` with placeholder values only
4. In `backend/src/db.js`, remove the hardcoded `JWT_SECRET` fallback string; require `process.env.JWT_SECRET` at startup (fail fast with clear error if missing)
5. Verify: `grep -rn "collegeos-super-secure" backend/src/` returns no matches; `.env` not tracked by git

### 3.2 D-006 — Implement Forgot-Password Email Delivery
**Severity:** P1  
**Files:** `backend/src/routes/auth.js`, Nodemailer config  
**Steps:**
1. Replace the 501 response with real Nodemailer delivery of a password-reset link
2. Issue time-bound (e.g., 15 min), single-use reset tokens stored in MongoDB
3. Add reset-password endpoint that validates token and allows password update
4. Rate-limit reset requests per email (prevent enumeration/abuse)
5. Verify: forgot-password returns 200 with email sent; reset token flow end-to-end works

### 3.3 D-005 — Add CSRF Protection
**Severity:** P1  
**Files:** `backend/src/app.js` (middleware), state-changing routes  
**Steps:**
1. Add CSRF middleware (e.g., `csurf` or double-submit cookie pattern)
2. Apply to state-changing endpoints: login, password change, enrollment, payment, grade submission
3. Frontend: include CSRF token header on mutating requests via `apiClient.ts`
4. Verify: state-changing request without CSRF token returns 403

### 3.4 D-004 — Scope CORS
**Severity:** P1  
**Files:** `backend/src/app.js` CORS middleware  
**Steps:**
1. Replace `cors()` (open) with `cors({ origin: [allowed origins] })`
2. Allowed origins: production frontend URL + `http://localhost:3000` (dev)
3. Verify: request from disallowed origin is blocked; allowed origin succeeds

### 3.5 D-003 — Durable Rate Limiting
**Severity:** P1  
**Files:** `backend/src/` rate-limit implementation  
**Steps:**
1. Replace in-memory rate limiter with durable store (Redis preferred, or MongoDB-backed)
2. Per-IP and per-account windows for login and password-reset endpoints
3. Survives server restart
4. Verify: rate limit persists across restart; blocked IP/account returns 429

---

## 4. Wave 2 — P2 Functional & Hardening (Within 2 Sprints)

**Estimated effort:** ~3 developer-weeks  
**Goal:** Close functional gaps and harden remaining controls.

### 4.1 D-007 — Clarify or Remove SQLite `.db` Files
**Severity:** P2  
**Files:** `database/data/collegeos.db`, `database/backups/collegeos-pre-refactor.db`, `docs/DATABASE.md`  
**Steps:**
1. Inspect `.db` files to determine schema and purpose (read-only; do not modify)
2. If active: document in `docs/DATABASE.md` and wire into config; if orphaned backups: remove or archive with documentation
3. Verify: docs explain each `.db` file or files are removed

### 4.2 D-016 — exam_officer vs finance_officer Role Boundary
**Severity:** P2  
**Files:** `backend/src/services/accessControl.js`, `backend/src/permissions/catalog.js`  
**Steps:**
1. Add explicit deny policy: exam_officer cannot read finance invoices/payments; finance_officer cannot read exam grades/seating
2. Add unit tests for role-boundary enforcement
3. Verify: cross-role access returns 403

### 4.3 D-014 — File Upload Hardening
**Severity:** P2  
**Files:** `backend/src/services/fileStorage.js`  
**Steps:**
1. Add virus/malware scanning (ClamAV or equivalent) on upload
2. Add MIME-type validation in addition to extension blocklist
3. Plan migration to cloud storage with signed URLs (design only in this wave)
4. Verify: blocked file types rejected; scanned files quarantined on match

### 4.4 D-015 — Nodemailer Password-Reset Email
**Severity:** P2 (related to D-006)  
**Files:** `backend/src/routes/auth.js`  
**Steps:**
1. Ensure Nodemailer transport is configured with real SMTP credentials (env-based, not committed)
2. Verify: reset email delivered to test inbox

### 4.5 D-013 — Session Failure Code Handling
**Severity:** P2  
**Files:** `backend/src/middleware/auth.js`, `frontend/src/services/apiClient.ts`  
**Steps:**
1. Audit all session failure codes are handled consistently backend → frontend
2. Verify: expired/invalid session returns consistent code; frontend redirects to login

### 4.6 D-022 — Audit Logging for Sensitive Actions
**Severity:** P2  
**Files:** route handlers for grades, payments, enrollment, exams  
**Steps:**
1. Add audit-log entries (actor, action, target object, tenant, timestamp) for sensitive mutations
2. Verify: grade change/payment/enrollment produces audit record

---

## 5. Wave 3 — P3 Code Quality, Documentation & Testing (Next Release)

**Estimated effort:** ~1–2 developer-weeks  
**Goal:** Improve maintainability and test coverage.

### 5.1 D-009 — Remove Dead-Code `.bak` Files
**Severity:** P3  
**Files:** `backend/src/routes/administration.js.bak`, `frontend/src/components/pages/LearningWorkspaceView.tsx.bak`, `frontend/src/components/pages/UserManagementView.tsx.bak`  
**Steps:**
1. Confirm `.bak` files are superseded by active versions (diff against active files)
2. Remove `.bak` files
3. Verify: build/tests pass after removal

### 5.2 D-010 — Investigate `frontend/src/components/s/`
**Severity:** P3  
**Files:** `frontend/src/components/s/`  
**Steps:**
1. Determine purpose of single-letter directory
2. Document purpose or remove/rename
3. Verify: no build breakage

### 5.3 D-011 — Add OpenAPI/Swagger Spec
**Severity:** P2→P3  
**Files:** `api/contracts/`  
**Steps:**
1. Generate OpenAPI spec from route definitions (or hand-author)
2. Expand `api/contracts/` coverage beyond the 4 existing contracts (notices, my-courses, faculty-course-workspace, auth)
3. Verify: spec validates; key routes documented

### 5.4 D-012 — Standardize Route Naming
**Severity:** P3  
**Files:** `backend/src/routes/`  
**Steps:**
1. Adopt consistent naming convention (kebab-case, plural for collections)
2. Rename inconsistent route files; update mounts in `app.js`
3. Verify: all routes mount correctly; no 404s from stale paths

### 5.5 D-017 — Add e2e Test Suite
**Severity:** P3  
**Files:** new `frontend/tests/e2e/` or `cypress/`  
**Steps:**
1. Add Playwright or Cypress e2e tests for critical paths (login, enrollment, payment, grade view)
2. Verify: e2e suite passes in CI-like environment

### 5.6 D-018 — Add Load/Performance Tests
**Severity:** P3  
**Steps:**
1. Add k6 or artillery load tests for login and high-traffic endpoints
2. Verify: baseline response times under load

### 5.7 D-019 — Route-to-Model Traceability Matrix
**Severity:** P3  
**Files:** `docs/`  
**Steps:**
1. Document which models each route touches
2. Verify: matrix covers all ~30 routes

### 5.8 D-020 — API Versioning
**Severity:** P3  
**Files:** `backend/src/app.js` route mounts  
**Steps:**
1. Add `/api/v1/` prefix to routes
2. Maintain backward-compat shim if needed
3. Verify: versioned routes resolve; unversioned redirects or returns 410

---

## 6. Wave Summary

| Wave | Severity | Defect Count | Est. Effort | Gate |
|---|---|---|---|---|
| Wave 1 | P0/P1 | 5 (D-001, D-002, D-003, D-004, D-005, D-006) | ~2 weeks | Production release blocked until complete |
| Wave 2 | P2 | 8 (D-007, D-013, D-014, D-015, D-016, D-022, +2) | ~3 weeks | Beta release |
| Wave 3 | P3 | 9 (D-009, D-010, D-011, D-012, D-017, D-018, D-019, D-020, D-021) | ~1–2 weeks | General availability |

Total estimated effort: ~6–8 developer-weeks.

---

## 7. Verification Checklist (Per Wave)

- [ ] Wave 1: `grep -rn` confirms no committed secrets; `.env` in `.gitignore`; JWT_SECRET required at startup
- [ ] Wave 1: forgot-password returns 200, reset token flow works end-to-end
- [ ] Wave 1: CSRF returns 403 on mutating request without token
- [ ] Wave 1: CORS blocks disallowed origin; allows known origin
- [ ] Wave 1: rate limit persists across restart; 429 on exceeded
- [ ] Wave 2: `.db` files documented or removed; role-boundary tests pass (exam_officer ↔ finance_officer 403)
- [ ] Wave 2: upload blocks dangerous types; MIME validation present
- [ ] Wave 2: audit records for grade/payment/enrollment mutations
- [ ] Wave 3: `.bak` files removed; build/tests pass
- [ ] Wave 3: OpenAPI spec validates; e2e suite passes; load-test baseline captured

---

## 8. Risks & Dependencies

| Risk | Impact | Mitigation |
|---|---|---|
| Rotating JWT_SECRET invalidates all existing sessions | Users logged out | Coordinate with maintenance window; communicate reset |
| SMTP credentials for Nodemailer not yet available | Forgot-password blocked | Use env-based config; obtain SMTP creds before Wave 1 |
| Redis not available for durable rate limiting | Rate limit reverts to in-memory | Use MongoDB-backed rate limiter as fallback |
| `.bak` files may contain unique logic | Lost functionality | Diff `.bak` against active files before deletion |

---

## 9. Conclusion

The roadmap is sequenced to eliminate active compromise risk first (Wave 1), then close functional and hardening gaps (Wave 2), then improve maintainability and test coverage (Wave 3). All remediations are targeted, minimal-impact fixes within the existing modular monolith. No architectural redesign is required. Completion of Wave 1 is a hard gate for any production release.
