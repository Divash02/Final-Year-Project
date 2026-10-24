# CollegeOS — Online Coding Lab

The Coding Lab gives students and teachers a browser-based coding
environment inside CollegeOS: a general-purpose compiler backed by an
isolated execution provider, an HTML/CSS/JavaScript playground with a
sandboxed preview, persistent projects, teacher-to-student sharing, and
coding assignments with submissions and grading.

**Authorized roles:** `student` and `faculty` only. Every endpoint is
gated by `requireRole(["student", "faculty"])` + the
`coding.lab.view` permission — administrative and departmental roles
cannot reach the lab regardless of what the frontend shows.

**Authoritative source:** this document. Backend:
`backend/src/routes/coding.js`, `backend/src/services/codeExecution.js`.
Frontend: `frontend/src/components/modules/coding/`.

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│ Frontend (React 19, lazy-loaded chunk)                     │
│  CodingLabWorkspace  (tabs: Projects / Assignments /       │
│                       Submissions[teacher])                │
│   ├─ CompilerWorkspace  — multi-file editor + run + save   │
│   ├─ PlaygroundWorkspace — html/css/js + iframe preview    │
│   ├─ ProjectListPane / AssignmentDialog / ShareDialog      │
│   └─ SubmissionsPanel (submit, review, grade)              │
│  CodeEditor (transparent textarea over syntax highlight)   │
│  syntax.ts (tokenizer) · zipUtil.ts (export) ·             │
│  execution.ts (submit + poll)                              │
└───────────────────────────┬────────────────────────────────┘
                            │ HTTPS (Bearer session token)
┌───────────────────────────▼────────────────────────────────┐
│ Express routes (coding.js)                                 │
│  /api/coding/languages|execute|executions/:id              │
│  /api/coding/projects[...]  ·  /api/coding/shares/:id      │
│  /api/coding/shared  ·  /api/coding/courses[...]           │
│  /api/coding/assignments[...]  ·  /api/coding/submissions/:id│
└───────────────────────────┬────────────────────────────────┘
                            │
        ┌───────────────────┴───────────────────┐
        ▼                                       ▼
  MongoDB (5 collections)              Judge0 CE (HTTPS)
  CodingProject, CodingShare,          /languages, /submissions
  CodingAssignment, CodingSubmission,  — untrusted code NEVER
  CodingExecution (TTL 24h)            runs on the CollegeOS
                                       server process
```

### Execution safety

- Student code is **never** executed with `child_process`, `eval`, or
  `vm` on the CollegeOS server. It is dispatched over HTTPS to an
  isolated provider (Judge0 CE by default).
- Provider credentials (`JUDGE0_API_KEY`) are server-side environment
  variables and are never returned to the browser.
- When no provider URL is configured, the lab honestly reports
  `configured: false` and runs fail with a clear 403 — output is never
  fabricated.
- Per-user in-process rate limit (default 40 runs/minute), 512 KiB
  source cap, 64 KiB stdin cap, 20 files / 900 KiB per project.
- Outputs are clamped to 64 KiB per stream before storage.

### Playground preview isolation

The HTML/CSS/JS preview renders in an iframe with
`sandbox="allow-scripts"` and **without** `allow-same-origin`, so
preview scripts cannot read the parent page, its cookies, or the
CollegeOS API session. Console output and uncaught errors are captured
via `postMessage` with a per-run secret.

## Endpoints

All under `/api/coding`, all requiring a session with `student` or
`faculty` role and the `coding.lab.view` permission.

| Method | Path | Who | Purpose |
|--------|------|-----|---------|
| GET | `/languages` | student, faculty | Language catalogue; `configured` flag reflects provider state |
| POST | `/execute` | student, faculty | Submit source for isolated execution → `202 { executionId, status: "QUEUED" }` |
| GET | `/executions/:id` | owner only | Poll execution state and output |
| GET | `/projects` | student, faculty | Own projects (`?shared=true` adds shares visible to the student) |
| POST | `/projects` | student, faculty | Create project (auto-creates `main.<ext>` or the three playground files); optional `assignmentId` links a working copy |
| GET | `/projects/:id` | owner / shared student | Read project (404 hides private existence) |
| PATCH | `/projects/:id` | owner only | Update title, description, files, language, course |
| DELETE | `/projects/:id` | owner only | Soft-delete; revokes its shares |
| POST | `/projects/:id/duplicate` | owner / COPY-granted student | Open as a copy (`copiedFrom` records the source) |
| POST | `/projects/:id/share` | faculty (owner) | Share with COURSE / SECTION / STUDENTS; `permission` VIEW or COPY |
| GET | `/projects/:id/shares` | faculty (owner) | List shares |
| DELETE | `/shares/:id` | faculty (owner) | Revoke a share |
| GET | `/shared` | student, faculty | "Shared with me" (student) / "shared by me" (faculty) |
| GET | `/courses` | student, faculty | Enrolments (student) or teaching scopes (faculty) |
| GET | `/courses/:courseId/students` | authorized teacher / own cohort | Roster for the share dialog |
| POST | `/assignments` | faculty (course teacher) | Create assignment |
| GET | `/assignments` | student, faculty | Assignments visible to the caller |
| GET | `/assignments/:id` | enrolled student / authorized teacher | Read assignment |
| PATCH | `/assignments/:id` | creator only | Edit / close assignment |
| POST | `/assignments/:id/submissions` | enrolled student | Submit or update (upsert, `version` increments) |
| GET | `/assignments/:id/submissions` | creator / authorized teacher; student sees own | Submission list |
| PATCH | `/submissions/:id` | creator / authorized teacher | Grade: `marks` (≤ `maxMarks`), `feedback` → status GRADED |

## Data model

Five collections (see `docs/DATABASE.md` for full schemas):

- **CodingProject** — embedded `files[]` (name, content, language,
  isMain), `ownerUser`, `ownerRole` (student/faculty), `projectType`
  (COMPILER/PLAYGROUND), `visibility` (PRIVATE/SHARED), `course`,
  `sectionCode`, `assignment`, `copiedFrom`, soft `deletedAt`.
- **CodingShare** — `project`, `sharedBy`, `shareType`
  (COURSE/SECTION/STUDENTS), `course`, `sectionCode`, `studentUsers[]`,
  `permission` (VIEW/COPY), `expiresAt`, `revokedAt`.
- **CodingAssignment** — `facultyUser`, `course`, `sectionCodes[]`,
  `allowedLanguages[]`, `starterFiles[]`, `exampleInput/Output`,
  `testCases[]` (hidden cases never leave the server), `dueAt`,
  `maxMarks`, `status` (DRAFT/OPEN/CLOSED), `opensAt`.
- **CodingSubmission** — unique on `{assignment, studentUser}`;
  `language`, `files[]`, `status` (SUBMITTED/GRADED), `isLate`,
  `version` (monotonic), `lastExecution` snapshot, `marks`,
  `feedback`, `gradedBy/At`.
- **CodingExecution** — audit record per run: `user`, `project`,
  `languageId`, `providerSubmissionId`, `status`
  (QUEUED/PROCESSING/ACCEPTED/FAILED/TIMEOUT/PROVIDER_ERROR),
  `stdout`/`stderr`/`compileOutput` (capped), `exitCode`,
  `durationMs`, `memoryKb`; TTL index deletes after 24 hours.

## Configuration

All variables are backend-only (never `VITE_*`):

| Variable | Default | Purpose |
|----------|---------|---------|
| `JUDGE0_BASE_URL` | empty | Execution provider origin, e.g. `http://127.0.0.1:2358` (self-hosted CE) or `https://ce.judge0.com`. Empty = execution disabled with honest UI messaging |
| `JUDGE0_API_KEY` | empty | RapidAPI key when using the hosted service |
| `JUDGE0_HOST` | `judge0.p.rapidapi.com` | RapidAPI host header |
| `JUDGE0_LANGUAGE_ID_MAP` | `{}` | JSON `{ slug: judge0Id }` overrides |
| `CODING_CPU_TIME_LIMIT` | `5` | Seconds per run (when the provider honours it) |
| `CODING_MEMORY_LIMIT_KB` | `262144` | 256 MiB per run |
| `CODING_RATE_LIMIT_PER_MINUTE` | `40` | In-process per-user run limit |

Languages (provider ids for stock Judge0 CE): python, java, c, c++,
javascript, typescript, c#, php, go, rust, ruby, kotlin, swift, sql.
HTML and CSS are playground-only and run in the browser preview, never
on the provider. The provider's own `/languages` response is the source
of truth for availability.

## Frontend routes

- `/student/coding-lab` — student lab (Projects, Assignments, shared work)
- `/teacher/coding-lab` — teacher lab (Projects, Assignments, Submissions/grading)
- Deep links: `/student/coding-lab/projects/:id` opens a project;
  `/teacher/coding-lab/assignments/:id` is reserved for assignment focus.

The lab is code-split into its own chunk (`CodingLabWorkspace`) and
registered in the sidebar for both roles with the `coding.lab.view`
permission gate.

## Testing

- `backend/tests/coding.test.js` — 29 integration tests against real
  MongoDB: role gating, project CRUD and ownership isolation, file
  validation, execution validation and the disabled-provider contract,
  share scoping (course/section/students), copy vs view permissions,
  revocation, assignment visibility, submission upsert/versioning,
  late flags, grading bounds, and assignment-linked project creation.
- `frontend/src/components/modules/coding/syntax.test.ts` — tokenizer
  unit tests (7 grammars).
- `frontend/src/components/modules/coding/zipUtil.test.ts` — CRC-32
  checksums, ZIP structure, filename sanitisation.

## Known limits

- The rate limiter is per backend process; a multi-instance deployment
  needs a shared store (e.g. Redis) for exact enforcement.
- Execution results are polled, not pushed; the frontend polls at
  ~1.2 s intervals while a run is pending.
- Multi-tenant isolation is incomplete project-wide (see AGENTS.md);
  the lab additionally scopes sharing to real enrolment and teaching
  records, but do not deploy as a multi-institution service.
