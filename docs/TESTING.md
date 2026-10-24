# CollegeOS — Testing

## Test Organization

| Suite | Location | Command | Runtime |
|-------|----------|---------|---------|
| Backend API Integration | `backend/tests/api.test.js` | `npm run test:api` | Node `--test` |
| Notices | `backend/tests/notices.test.js` | `npm run test:api` | Node `--test` |
| Faculty Course Workspace | `backend/tests/facultyCourseWorkspace.test.js` | `npm run test:api` | Node `--test` |
| Faculty My Timetable | `backend/tests/facultyMyTimetable.test.js` | `npm run test:api` | Node `--test` |
| LMS | `backend/tests/lms.test.js` | `npm run test:api` | Node `--test` |
| My Courses | `backend/tests/myCourses.test.js` | `npm run test:api` | Node `--test` |
| Nepali Calendar | `frontend/src/lib/nepaliCalendar.test.ts` | `npm run test:calendar` | `tsx --test` |
| LMS Formatting | `frontend/src/lib/lmsFormat.test.ts` | `npm run test:lms-format` | `tsx --test` |
| Password Policy | `frontend/src/lib/passwordPolicy.test.ts` | `npm run test:policy` | `tsx --test` |
| Rich Text Sanitizer | `frontend/src/lib/sanitizeHtml.test.ts` | `npm run test:sanitize` | `tsx --test` |
| Type Check | `frontend/tsconfig.json` | `npm run lint` | `tsc --noEmit` |

## Running Tests

```bash
# All suites
npm run test

# Backend only (requires MongoDB)
npm run test:api

# Frontend unit tests
npm run test:calendar
npm run test:lms-format
npm run test:policy
npm run test:sanitize

# Type checking
npm run lint
```

## Backend Integration Tests (`backend/tests/api.test.js`)

### Architecture
- **Real MongoDB** — dedicated `collegeos_test` database
- **Real Express app** — no mocks, full middleware stack
- **Ephemeral port** — `server.listen(0)`
- **Database lifecycle** — `dropDatabase()` before and after suite

### Test Utilities
```javascript
// api(path, { method, token, body }) → { status, data, text, headers }
async function api(path, options)

// login(email, password) → token
async function login(email, password)

// activate(email, tempPass, newPass) → token
async function activate(email, temporaryPassword, newPassword)

// provision(adminToken, userData) → { user, password, token, userId }
async function provision(actorToken, body)

// createCourse(token, courseData) → course
async function createCourse(token, body)
```

### Test Accounts (Created in `before()`)
| Account | Role | Purpose |
|---------|------|---------|
| `admin@collegeos.test` | `super_admin` | Bootstrap, provisioning |
| `registrar` | `registrar` | Academic admin |
| `teacher` | `faculty` | Teaching, LMS, attendance |
| `otherTeacher` | `faculty` | Cross-teacher isolation |
| `coordinator` | `program_coordinator` | Program-level access |

### Coverage Areas
1. **Auth lifecycle** — login, me, change-password, logout, role switching
2. **Account provisioning** — create user, activate, role assignment
3. **Academics** — courses, sections, enrollments, teaching assignments
4. **Calendar** — events, documents, audience visibility
5. **Learning materials** — upload, version, status, audience, teaching progress
6. **Assignments** — create, submit, grade, similarity
7. **Quizzes** — authoring, attempts, auto/manual grading, integrity events
8. **Timetable** — CRUD, conflict detection, override permission
9. **Files** — upload, download, entitlement checks
10. **Attendance** — sessions, QR, marking, corrections, eligibility
11. **Examinations** — scheduling, candidates, rooms, results workflow
12. **Finance** — invoices, payments, verification
13. **Workflow** — cases, status transitions, SLA
14. **Reporting** — analytics, audit logs

### Negative Testing
Every permission rule includes **negative cases**:
- Unauthorized role → `403`
- Wrong scope (teacher accessing other's course) → `403`/`404`
- Invalid state transitions → `422`
- Missing required fields → `400`

### Example Test Pattern
```javascript
test("teacher cannot create material in section they don't teach", async () => {
  const material = await api("/api/lms/weeks/.../materials", {
    method: "POST",
    token: otherTeacherToken,  // not assigned to this section
    body: formData
  });
  assert.equal(material.status, 403);
});
```

## Frontend Unit Tests

### Nepali Calendar (`nepaliCalendar.test.ts`)
- AD ↔ BS conversion at year boundaries
- Kathmandu civil date at UTC midnight
- Display formatting (BS/AD, EN/NE)

### LMS Formatting (`lmsFormat.test.ts`)
- Deadline formatting (relative, absolute)
- Mark/percentage formatting
- Countdown formatting

### Password Policy (`passwordPolicy.test.ts`)
- Minimum length
- Character class requirements
- Common pattern rejection
- Username/email substring rejection

## Type Checking
```bash
npm run lint
```
- Runs `tsc --noEmit -p frontend/tsconfig.json`
- Catches type drift between API responses and TypeScript types
- **Must pass** before PR

## Writing New Tests

### Backend Integration Test
1. Create `backend/tests/<feature>.test.js`
2. Import `test`, `assert` from `node:test`, `node:assert/strict`
3. Use existing `api`, `login`, `provision`, `createCourse` helpers
4. Follow AAA pattern: Arrange (provision), Act (API call), Assert (status + data)
5. Include negative cases
6. Add to `package.json` if new test file (currently all `backend/tests/*.test.js` run)

### Frontend Unit Test
1. Create `frontend/src/lib/<feature>.test.ts`
2. Import `test` from `node:test`, `assert` from `node:assert/strict`
3. Test pure functions only (no React component tests)
4. Run with `tsx --test <file>`

## Continuous Integration
- **No CI configured** — run locally before push
- **Pre-PR checklist:**
  ```bash
  npm run lint
  npm run test
  ```

## Test Data Principles
- **No hardcoded IDs** — use returned IDs from provisioning
- **Real files** — PDF/PPTX buffers with valid magic bytes
- **Isolated** — test database dropped each run
- **Deterministic** — no random data in assertions

## Debugging Failed Tests

### Backend
```bash
# Run single test file
node --test backend/tests/api.test.js

# With inspection
node --inspect-brk --test backend/tests/api.test.js
```
- Check `console.error` output in test (5xx errors logged)
- Verify MongoDB is running on test host/port
- Check `COLLEGEOS_TEST_DB` and `COLLEGEOS_TEST_MONGO_HOST` env vars

### Frontend
```bash
tsx --test frontend/src/lib/nepaliCalendar.test.ts
```
- Pure functions — easy to debug in isolation

## Known Test Gaps
- **No React component tests** — integration coverage via backend tests
- **No E2E tests** — Playwright scripts exist in repo root but not in test suite
- **No load/performance tests**
- **No visual regression tests**

## Related Files
| File | Purpose |
|------|---------|
| `backend/tests/api.test.js` | Main integration suite |
| `backend/tests/facultyCourseWorkspace.test.js` | LMS workspace contract tests |
| `backend/tests/facultyMyTimetable.test.js` | Timetable tests |
| `backend/tests/lms.test.js` | LMS core tests |
| `backend/tests/myCourses.test.js` | My Courses tests |
| `frontend/src/lib/nepaliCalendar.test.ts` | Calendar unit tests |
| `frontend/src/lib/lmsFormat.test.ts` | LMS format tests |
| `frontend/src/lib/passwordPolicy.test.ts` | Password policy tests |
| `package.json` | Test scripts |