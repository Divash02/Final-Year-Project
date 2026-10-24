# CollegeOS — Security

## Authentication & Authorization Boundaries

### Server-Side Enforcement (Authoritative)
- **All authorization decisions made in backend** — middleware + route handlers
- **Frontend checks are UI convenience only** — never trusted
- **Middleware chain:** `requireAuth` → `requirePermission`/`requireRole`/`requireStudentScope`
- **Object-level checks:** `accessControl.js` re-derives scope from `req.user` on every request

### Client-Side (Non-Authoritative)
- `CollegeOSContext` caches `user.permissions` for conditional rendering
- Route guards redirect unauthenticated users to `/login`
- Role switch calls `POST /api/auth/active-role` — validated server-side

## Token & Session Security

### JWT
- **Algorithm:** HS256
- **Secret:** `JWT_SECRET` (env var, 32+ chars for production)
- **Expiry:** 8 hours
- **Payload:** `{ userId, jti, iat, exp }`
- **No sensitive data in token** — user re-fetched from DB on each request

### Session Store (MongoDB `Session` collection)
- **Token stored as SHA-256 hash** — `hashToken(token)`
- **Fields:** `user`, `tokenHash`, `expiresAt`, `revokedAt`
- **Validation:** `getSessionByToken` checks `revokedAt: null` and `expiresAt > now`
- **Revocation:** On logout, password change, admin action

### Password Security
- **Hash:** bcrypt cost 10 (`hashPassword` in `db.js`)
- **Policy:** Enforced on change (`passwordPolicy.js`)
  - Minimum length (configurable, default 8)
  - Uppercase, lowercase, number, special character required
  - No common patterns, no username/email substrings
- **Bootstrap admin:** Created with `mustChangePassword: true`, `passwordStatus: "TEMPORARY"`
- **First login:** Forces `/account/activate` flow
- **Reset tokens:** SHA-256 hashed, 1h expiry, single-use (`PasswordResetToken` collection)

## Data Protection

### At Rest
- **MongoDB:** Enable encryption at rest (production)
- **Passwords:** bcrypt hash only — never stored/plaintext
- **Reset tokens:** SHA-256 hash only
- **Session tokens:** SHA-256 hash only
- **Files:** Stored in `backend/uploads/` — no encryption (local disk)

### In Transit
- **HTTPS required in production** — terminate at reverse proxy
- **All API calls:** `Authorization: Bearer <token>` over TLS
- **File downloads:** Served via `/api/files/:id` with entitlement check (not direct URLs)

### In Logs
- **No secrets in logs** — `utils/apiError.js` redacts stack traces for 5xx
- **Audit logs:** Reference IDs only, no raw PII
- **Console output:** Sanitized (no tokens, passwords, hashes)

## Input Validation & Sanitization

### API Inputs
- **No validation library** — manual checks in each handler
- **Body size limit:** 1MB (Express `express.json({ limit: "1mb" })`)
- **File uploads:** Magic-byte validation (`fileStorage.js`) — rejects executable content regardless of extension
- **ObjectIDs:** Validated via `mongoose.Types.ObjectId.isValid()`
- **Enumerations:** Checked against allowed values (e.g., `ATTENDANCE_STATUSES`)

### Output Encoding
- **JSON responses:** `res.json()` — auto-escaped
- **File downloads:** `Content-Disposition: inline` + `X-Content-Type-Options: nosniff`
- **No HTML rendering** — SPA serves static `index.html`

## File Upload Security

### Validation Pipeline (`fileStorage.js`)
1. **Multer** → memory storage
2. **Magic bytes** → determine real content family
3. **Policy check** → per-module allowed families + max size
4. **Checksum** → SHA-256 for deduplication (`StoredFile.checksum` unique index)
5. **Write to disk** → `backend/uploads/<module>/`

### Module Policies
| Module | Allowed Families | Max Size |
|--------|------------------|----------|
| `avatar` | image | 5MB |
| `learning_material` | PDF, Office, image, archive, video, audio | 100MB |
| `assignment_submission` | All except executable | 50MB |
| `calendar_attachment` | PDF, Office, image | 20MB |

### Serving Files
- **Only avatars** served statically (`/uploads/avatars/`)
- **All other files** → `/api/files/:id` with entitlement check:
  - Student → own submissions + own avatar
  - Faculty → own uploads + student submissions for taught courses
  - Admin → all

## Known Security Limitations

| Limitation | Severity | Mitigation |
|------------|----------|------------|
| **Tenant isolation incomplete** | High | Do not deploy as multi-institution service |
| **Forgot-password no email** | Medium | Admin manual reset via `/api/admin/users/:id/reset-password` |
| **Local file storage** | Medium | Single-node only; plan S3 migration |
| **In-memory login rate limit** | Low | 5 attempts/15min per (email, IP); resets on server restart |
| **No CSP headers** | Low | Add via nginx; tune for Vite/React |
| **No request signing/integrity** | Low | Internal APIs only; add if exposed |
| **No audit log immutability** | Medium | MongoDB oplog + backup; consider append-only collection |
| **No secrets rotation automation** | Medium | Manual `JWT_SECRET` rotation invalidates all sessions |

## Secure Development Practices

### Code Review Checklist
- [ ] New routes use `requireAuth` + appropriate permission middleware
- [ ] No `req.body.id` used for authorization — always `req.user`
- [ ] File uploads go through `fileStorage.js` policies
- [ ] Passwords never logged, returned, or compared in plaintext
- [ ] Audit log written for state changes (`logAudit()` in `db.js`)
- [ ] Error messages don't leak system info (use `apiError.js`)
- [ ] New permissions added to `catalog.js` with role grants

### Dependency Management
```bash
# Audit
npm audit

# Update (review breaking changes first)
npm update
```

### Secrets in CI/CD
- Never hardcode in pipeline YAML
- Use platform secret injection (GitHub Secrets, GitLab CI Variables, etc.)
- Rotate `JWT_SECRET` periodically — plan for session invalidation

## Incident Response

### Compromised Token
1. User logs out → `POST /api/auth/logout` (revokes session)
2. Or admin: `POST /api/admin/users/:id/revoke-sessions` (not implemented — use `revokeUserSessions(userId)` in `db.js`)
3. Rotate `JWT_SECRET` → invalidates **all** sessions

### Compromised Password
1. Admin generates temporary password: `POST /api/admin/users/:id/reset-password`
2. User activates via `/account/activate`

### Data Breach
1. Check `AuditLog` for unauthorized access patterns
2. Review `Session` collection for anomalous tokens
3. Rotate `JWT_SECRET`
4. Force password reset for affected accounts
5. Notify stakeholders per institutional policy

## Compliance Notes
- **No GDPR/PDPA automation** — manual data export/deletion via admin
- **Audit trail** — `AuditLog` collection captures all state changes
- **Data retention** — No automated purge; implement per policy
- **Encryption** — At-rest (MongoDB), in-transit (TLS), application-level (bcrypt/SHA-256)

## Related Files
| File | Purpose |
|------|---------|
| `backend/src/middleware/auth.js` | Auth middleware |
| `backend/src/permissions/catalog.js` | Permission definitions |
| `backend/src/services/accessControl.js` | Object-level authorization |
| `backend/src/services/fileStorage.js` | File upload validation |
| `backend/src/services/passwordPolicy.js` | Password validation |
| `backend/src/db.js` | Token/session/password utilities |
| `backend/src/utils/apiError.js` | Safe error responses |
| `frontend/src/services/apiClient.ts` | Client auth handling |