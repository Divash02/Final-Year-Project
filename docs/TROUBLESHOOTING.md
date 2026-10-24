# CollegeOS — Troubleshooting

## Quick Diagnosis

| Symptom | Likely Cause | First Check |
|---------|--------------|-------------|
| `ECONNREFUSED` on API | MongoDB not running | `npm run dev` auto-starts; or `mongod` manually |
| `401 Invalid session` | Token expired/revoked | Clear `localStorage.collegeos_token`, re-login |
| `403 PASSWORD_CHANGE_REQUIRED` | First login / temp password | Complete `/account/activate` |
| `403 Access denied` | Missing permission | Check `catalog.js` role grants |
| `404` on finance / admissions / exams writes | `departmental.js` 501 guards shadowed real routes | See "Departmental route shadowing" below |
| Empty dashboard after login | `DashboardWorkspaceView` referenced undefined state | `npm run lint` must pass |
| Admissions list blank | Frontend read snake_case fields from camelCase API | See "Field-name mismatch" below |
| Port 4000/3000 in use | Previous process alive | `dev.js` auto-picks next port |
| White screen / React error | Build/type error | `npm run lint`, check console |
| File upload fails | Magic-byte mismatch | File type not in module policy |
| QR attendance fails | Token expired | QR TTL = 30s; regenerate |
| Test failures | Test DB not clean | `npm run test:api` drops DB automatically |

## Backend Issues

### MongoDB Connection Failed
```bash
# Check if mongod running
mongosh --eval "db.runCommand({ping:1})"

# Windows: check service
sc query MongoDB

# Manual start
mongod --dbpath .mongodb-data --port 27017 --bind_ip 127.0.0.1
```
**Logs:** `scripts/dev.js` output shows "MongoDB ready." or warning.

### Server Won't Start
```bash
# Check port
netstat -ano | findstr :4000

# Kill process
taskkill /PID <pid> /F

# Or let dev.js pick another port (auto)
npm run dev
```

### JWT Secret Mismatch
- **Symptom:** `401 Invalid or expired session` on valid token
- **Cause:** `JWT_SECRET` changed between restarts
- **Fix:** Use consistent `JWT_SECRET` in `.env`; rotating invalidates all sessions

### Bootstrap Admin Not Created
- **Check logs:** "Initial Super Admin created: admin@..."
- **Cause:** Admin already exists (check `User` collection)
- **Note:** Changing `COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD` does NOT reset existing account

### Password Reset Not Working
- **Symptom:** `501` on `/api/auth/forgot-password`
- **Cause:** No email delivery configured (intentional)
- **Workaround:** Admin generates temp password via `POST /api/admin/users/:id/reset-password`

### Departmental route shadowing

`backend/src/routes/departmental.js` previously re-registered `/api/invoices`,
`/api/admissions/applications`, `/api/exams` and their nested paths with a 501
stub. Express matches the first registered handler, so every finance,
admissions and examinations write operation returned
`404 This CollegeOS endpoint does not exist.` even for an authorised caller.

The owning route modules (`finance.js`, `admissions.js`, `examinations.js`)
implement the real handlers, so `departmental.js` now registers nothing. The
module is kept as a placeholder for genuinely unimplemented departmental write
workflows.

### Field-name mismatch

Some workspace views declared local interfaces using snake_case field names
(`applicant_name`, `created_at`, `invoice_number`, `balance_due`, `student_id`,
`first_name`, `account_status`, ...) while the API serialises camelCase
(`applicantName`, `createdAt`, `invoiceNumber`, `balanceDue`, `studentId`,
`firstName`, `status`, ...). The views read fields that were never present, so
lists rendered empty. Align the interface to the API contract.

## Frontend Issues

### TypeScript Errors (`npm run lint`)
```bash
# Run type check
npm run lint

# Common fixes:
# - Add missing types to types/index.ts or types/lms.ts
# - Fix API response type mismatches (check lmsApi.ts)
# - Remove `any` usage
```

### White Screen / Module Not Found
```bash
# Clear cache, reinstall
npm run clean
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### API Calls Failing (CORS)
- **Dev:** `dev.js` passes `VITE_API_BASE_URL` to Vite; API has `cors()` middleware
- **Prod:** nginx proxy handles CORS; ensure `proxy_set_header` correct

### Real-Time Features Not Working
- **Socket.io** imported but not fully wired
- **Check:** `socket.io` + `socket.io-client` in `package.json`
- **Current:** Only basic connection; no event handlers for notifications/mail

### Design Tokens Not Applied
- **Check:** `index.css` imports Tailwind + CSS variables
- **Variables:** Defined in `lib/theme.ts` and `DESIGN.md`
- **Build:** `npm run build` regenerates CSS

## Database Issues

### Duplicate Key Errors
- **User email:** Unique index — use different email
- **Student studentId:** Unique — check `Student` collection
- **Enrollment:** Compound unique (student + course + semester + sectionCode)
- **Attendance:** Compound unique (session + student)
- **Session tokenHash:** Unique — token collision (extremely rare)

### Missing Data in UI
- **Cause:** `loadMasterData()` failed or not called
- **Check:** Network tab for `/api/courses`, `/api/students`, `/api/sections`
- **Fix:** Call `loadMasterData()` after login; modules show empty states gracefully

### Test Database Pollution
```bash
# Tests drop DB before/after, but if interrupted:
mongosh mongodb://127.0.0.1:27017/collegeos_test --eval "db.dropDatabase()"
```

## Module-Specific Issues

### Attendance
| Issue | Cause | Fix |
|-------|-------|-----|
| QR not generating | Session not created | `POST /api/attendance/sessions` with valid course/section |
| QR check-in fails | Token expired (30s) | Regenerate session; check clock sync |
| Student not in roster | Not enrolled in section | Check `Enrollment` for student + course + sectionCode |
| Correction not saving | Insufficient permission | `attendance.reviewCorrection` (HoD/Dean) or `attendance.approveCorrection` (HoD/Registrar) |

### LMS (Planner/Materials/Quizzes)
| Issue | Cause | Fix |
|-------|-------|-----|
| Material not visible to students | Status not `PUBLISHED` or `releaseAt` future | `POST /api/lms/materials/:id/status` with `PUBLISHED`; ensure `releaseAt` null or past |
| Quiz results not releasing | Policy `MANUAL` + not released | `POST /api/lms/quizzes/:id/release-results` |
| Teaching progress not saving | Not `canManageMaterial` | Check `CourseTeachingAssignment` for faculty + course + section |
| Week not publishing | `releaseAt` future | `PATCH /api/lms/weeks/:id` with `releaseAt: null` then publish |

### Assignments
| Issue | Cause | Fix |
|-------|-------|-----|
| Submission not allowed | Past `dueAt` or not `OPEN` | Check assignment status + `opensAt`/`dueAt` |
| Similarity check failing | File type not supported | PDF, DOC, DOCX, TXT only for similarity |
| Grading not persisting | `marks: null` vs `0` | `null` = return for revision; `0` = zero marks |

### Examinations
| Issue | Cause | Fix |
|-------|-------|-----|
| Results not publishing | Workflow not finalized | `exam.results.finalize` → `exam.publishResults` |
| Marks entry not saving | Wrong workflow status | Must be `SUBMITTED` or `VERIFIED` |
| Candidate missing | Not added to exam | `POST /api/examinations/:id/candidates` |

### Finance
| Issue | Cause | Fix |
|-------|-------|-----|
| Payment not reflecting | Frontend simulation only | Real gateway integration needed |
| Invoice balance wrong | `paidAmount` not updated | Check `Payment` records linked to invoice |

## Logs & Debugging

### Backend Logs
```bash
# Development (dev.js output)
npm run dev

# Production (systemd)
journalctl -u collegeos -f

# Key log lines:
# "MongoDB connected successfully"
# "CollegeOS backend running on http://localhost:4000"
# "Initial Super Admin created: ..."
# "Role consolidation applied to N account(s): ..."
# "MongoDB ready." (from dev.js)
```

### Frontend Logs
- **Browser Console:** React errors, API failures, `ApiError` details
- **Network Tab:** Check `Authorization` header, response status, error body
- **React DevTools:** Component state, context values

### Audit Logs (Database)
```javascript
// MongoDB shell
use collegeos
db.auditlogs.find({ action: "LOGIN_FAILED" }).sort({ timestamp: -1 }).limit(10)
db.auditlogs.find({ userId: ObjectId("...") }).sort({ timestamp: -1 })
```

## Performance Issues

### Slow API Responses
- **Check:** MongoDB indexes (`db.collection.getIndexes()`)
- **Common:** Missing compound indexes on query filters
- **Fix:** Add indexes in model schema

### High Memory Usage
- **Dev:** `--max-old-space-size=4096` in `package.json` scripts
- **Prod:** Monitor heap; add `--max-old-space-size=2048` if needed
- **Leak:** Check for unclosed MongoDB connections, event listeners

### Large File Uploads Timeout
- **Proxy:** Increase `proxy_read_timeout` in nginx (default 60s)
- **Express:** Body limit 1MB (JSON); multipart handled by Multer (no default limit)

## Development Environment Issues

### Windows-Specific
| Issue | Fix |
|-------|-----|
| `mongod` not found | Install MongoDB Community Server; add to PATH |
| Path too long | Enable long paths: `git config --system core.longpaths true` |
| Symlink errors | Run terminal as Administrator |
| `dev.js` mongod spawn fails | Check `C:\Program Files\MongoDB\Server\*\bin\mongod.exe` exists |

### Node Version
```bash
# Required: Node 20+
node --version

# Switch with nvm
nvm use 20
```

## Getting Help

### Internal Resources
1. **`docs/AI_CONTEXT.md`** — Compact knowledge base
2. **`docs/ARCHITECTURE.md`** — System boundaries
3. **`api/contracts/*.md`** — HTTP contracts
4. **`backend/tests/api.test.js`** — Working examples of API usage

### Debug Commands
```bash
# Probe database
node scripts/probe-db.mjs

# Seed demo data
npm run seed:demo

# Reset demo data
npm run seed:demo:reset

# Type check only
npm run lint

# Single test suite
npm run test:calendar
```

### Escalation Path
1. Check this document
2. Search `docs/` for relevant technical doc
3. Inspect source files from `AGENTS.md` lookup table
4. Run tests to isolate regression
5. Check Git history for recent changes

## Related Files
| File | Purpose |
|------|---------|
| `scripts/dev.js` | Dev orchestration (auto-mongod, port selection) |
| `scripts/probe-db.mjs` | Read-only DB inspection |
| `backend/src/utils/apiError.js` | Error formatting |
| `backend/src/middleware/auth.js` | Auth error codes |
| `docs/SECURITY.md` | Security limitations |
| `docs/DEPLOYMENT.md` | Production considerations |