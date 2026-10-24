# CollegeOS — Authentication

## Overview
CollegeOS uses **JWT-based stateless authentication** with server-side session validation. Tokens are issued on login, stored in a `Session` collection (hashed), and validated on every protected request.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/login` | Validate credentials, create session, return JWT |
| `GET` | `/api/auth/me` | Hydrate session, return user + active role + permissions |
| `POST` | `/api/auth/change-password` | Change password, revoke all sessions, issue new token |
| `POST` | `/api/auth/logout` | Revoke current session |
| `POST` | `/api/auth/forgot-password` | Returns `501` — no email delivery configured |
| `POST` | `/api/auth/reset-password` | Accepts valid reset token (not issued) |
| `POST` | `/api/auth/active-role` | Switch active role (must be assigned) |
| `GET` | `/api/roles` | List assignable roles with labels |

## Login Flow

```
1. POST /api/auth/login { email, password }
2. Backend:
   - Rate-limits by (email, IP) — 5 failures in 15 min → lock
   - Finds user by email or collegeEmail (supports legacy domains)
   - Verifies bcrypt password hash
   - Checks accountStatus ∉ [SUSPENDED, DISABLED, ARCHIVED]
   - Checks credentialExpiresAt not expired
   - Updates firstLoginAt, lastLoginAt
   - Creates Session record (tokenHash, expiresAt = +8h)
   - Signs JWT: { userId, jti } with JWT_SECRET (8h expiry)
3. Response: { token, user: { ..., activeRole, permissions, mustChangePassword } }
4. Frontend stores token in localStorage.collegeos_token
5. Subsequent requests: Authorization: Bearer <token>
```

## Session Validation (`backend/src/middleware/auth.js:requireAuth`)

```javascript
1. Extract Bearer token from Authorization header
2. verifyToken(token) → { userId, jti, iat, exp }
3. getSessionByToken(token) → Session record (checks revokedAt, expiresAt)
4. getUserById(userId) → User document
5. Verify session.user === user._id
6. Check accountStatus ∉ [SUSPENDED, DISABLED, ARCHIVED]
7. Check mustChangePassword → 403 { code: "PASSWORD_CHANGE_REQUIRED" } (except /auth/me, /auth/change-password, /auth/logout)
8. Check credentialExpiresAt not expired → 401 "Temporary credential expired"
9. Attach req.user, req.session, req.token → next()
```

## Password Management

### Bootstrap Super Admin
- Provisioned once by `seedBaseUsers()` in `backend/src/db.js`
- Email: `admin@<INSTITUTION_EMAIL_DOMAIN>`
- Password: `COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD` (default `Nepal@123`)
- Created with: `mustChangePassword: true`, `accountStatus: "PASSIVE"`, `passwordStatus: "TEMPORARY"`
- **Changing the env var does NOT reset an existing account**

### First Login / Account Activation
1. User logs in with temporary credentials
2. Response includes `mustChangePassword: true`
3. Frontend redirects to `/account/activate`
4. `POST /api/auth/change-password` with `currentPassword`, `newPassword`, `confirmPassword`
5. Backend:
   - Validates current password
   - Enforces password policy (`passwordPolicy.js`)
   - Hashes new password, sets `mustChangePassword: false`, `credentialExpiresAt: null`, `passwordStatus: "PERMANENT"`, `accountStatus: "ACTIVE"`
   - Revokes ALL user sessions, creates new session + token
   - Logs `PASSWORD_CHANGED` + `ACCOUNT_ACTIVATED` audit events

### Password Policy (`backend/src/services/passwordPolicy.js`)
- Minimum length (configurable, default 8)
- Requires: uppercase, lowercase, number, special character
- No common patterns, no username/email substrings
- Frontend mirror: `frontend/src/lib/passwordPolicy.ts`

### Forgot / Reset Password
- `POST /api/auth/forgot-password` → returns `501` with message to contact admin
- `POST /api/auth/reset-password` → accepts valid token from `PasswordResetToken` collection
- **No email delivery configured** — tokens are created/stored but never issued to users
- `createPasswordResetToken(userId)` in `db.js` generates 32-byte hex token, stores SHA-256 hash, 1h expiry

## Role Switching
- `POST /api/auth/active-role` { role }
- Validates requested role ∈ user's assigned roles
- Updates `User.activeRole`, returns new permissions from `catalog.js`
- Frontend: `setCurrentRole()` in `CollegeOSContext.tsx`

## Token & Session Details

| Property | Value |
|----------|-------|
| JWT algorithm | HS256 (jsonwebtoken) |
| JWT secret | `JWT_SECRET` env var |
| JWT expiry | 8 hours |
| Session store | MongoDB `Session` collection |
| Session token storage | SHA-256 hash of JWT |
| Session expiry | 8 hours (matches JWT) |
| Revocation | `revokedAt` timestamp on logout/password change |
| Login rate limit | 5 failures / 15 min per (email, IP) — in-memory Map |

## Frontend Auth Handlers (`frontend/src/context/CollegeOSContext.tsx`)

- `login(email, password)` → calls `/auth/login`, stores token, hydrates user, loads master data
- `logout()` → calls `/auth/logout`, clears token, resets state
- `changePassword(current, new)` → calls `/auth/change-password`, updates token + user
- `setCurrentRole(role)` → calls `/auth/active-role`, updates context
- `loadMasterData()` → fetches courses, students, sections for context cache
- Session restore on mount: reads `localStorage.collegeos_token`, calls `/auth/me`

## Security Rules

- **Never** create tokens, validate passwords, or grant roles in frontend
- **Always** enforce authorization server-side; client checks are UI convenience only
- **Never** trust identifiers from request body/path — re-derive scope from session user
- `VITE_*` variables are public — never put secrets there
- `JWT_SECRET`, `COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD` → backend `.env` only

## Related Files

| File | Purpose |
|------|---------|
| `backend/src/routes/auth.js` | Route handlers |
| `backend/src/middleware/auth.js` | `requireAuth`, `requireRole`, `requirePermission`, `requireStudentScope` |
| `backend/src/db.js` | `hashPassword`, `verifyPassword`, `signToken`, `verifyToken`, `createSession`, `getSessionByToken`, `revokeSession`, `seedBaseUsers`, `createPasswordResetToken`, `getPasswordResetToken` |
| `backend/src/models/User.js` | User schema |
| `backend/src/models/Session.js` | Session schema |
| `backend/src/models/PasswordResetToken.js` | Reset token schema |
| `backend/src/services/passwordPolicy.js` | Policy validation |
| `backend/src/permissions/catalog.js` | Role→permission map |
| `frontend/src/context/CollegeOSContext.tsx` | Auth state + handlers |
| `frontend/src/services/apiClient.ts` | API client with auth header |
| `api/contracts/auth.md` | HTTP contract documentation |