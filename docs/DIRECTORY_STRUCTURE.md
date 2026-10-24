# CollegeOS — Directory Structure

## Root

```
CollegeOS/
├── AGENTS.md                    # AI agent instructions (read first)
├── README.md                    # Human project entry point
├── package.json                 # Single npm package (frontend + backend)
├── package-lock.json
├── .env                         # Local environment (gitignored)
├── .env.example                 # Environment template
├── .gitignore
├── AUDIT_REPORT.md              # Historical audit (pre-cleanup)
├── api/                         # API contract documentation (markdown only)
│   ├── README.md
│   └── contracts/
│       ├── auth.md
│       ├── faculty-course-workspace.md
│       └── my-courses.md
├── backend/                     # Express modular monolith
│   ├── src/
│   │   ├── server.js            # Entry point, starts HTTP + scheduler
│   │   ├── app.js               # Middleware + route registration (22 modules)
│   │   ├── config/
│   │   │   └── database.js      # Mongoose connection
│   │   ├── db.js                # Persistence helpers, bootstrap, auth utils
│   │   ├── middleware/
│   │   │   └── auth.js          # Auth, role, permission, student-scope middleware
│   │   ├── models/              # One Mongoose model per collection (49 files + index.js)
│   │   ├── permissions/
│   │   │   └── catalog.js       # Role→permission map (authoritative)
│   │   ├── routes/              # Domain route modules (23 files)
│   │   ├── services/            # Business logic
│   │   │   ├── lms/             # LMS-specific services
│   │   │   ├── accessControl.js
│   │   │   ├── academicClock.js
│   │   │   ├── codeExecution.js
│   │   │   ├── documentMeta.js
│   │   │   ├── examWorkflowService.js
│   │   │   ├── fileStorage.js
│   │   │   ├── gradingService.js
│   │   │   ├── institutionalEmail.js
│   │   │   ├── myTimetable.js
│   │   │   ├── nepaliDateHelper.js
│   │   │   ├── passwordPolicy.js
│   │   │   ├── similarityService.js
│   │   │   ├── studentProvisioning.js
│   │   │   ├── timetableChanges.js
│   │   │   └── timetableConflicts.js
│   │   └── utils/
│   │       └── apiError.js
│   ├── tests/                   # Integration tests (real MongoDB)
│   │   ├── api.test.js
│   │   ├── facultyCourseWorkspace.test.js
│   │   ├── facultyMyTimetable.test.js
│   │   ├── lms.test.js
│   │   └── myCourses.test.js
│   └── uploads/                 # Private file storage (served via /api/files/:id)
│       ├── academic-calendar/
│       ├── academic-calendar-documents/
│       ├── assignment-submission/
│       ├── avatars/
│       └── learning-material/
├── database/                    # RETIRED SQLite artifacts (do not use)
│   ├── README.md
│   ├── backups/
│   ├── data/
│   ├── migrations/
│   └── schema/
├── docs/                        # Technical documentation
│   ├── README.md                # Documentation index
│   ├── AI_CONTEXT.md            # Compact knowledge base for AI agents
│   ├── ARCHITECTURE.md
│   ├── DIRECTORY_STRUCTURE.md
│   ├── AUTHENTICATION.md
│   ├── AUTHORIZATION_AND_RBAC.md
│   ├── DATABASE.md
│   ├── API_REFERENCE.md
│   ├── FRONTEND.md
│   ├── BACKEND.md
│   ├── MODULES.md
│   ├── CONFIGURATION.md
│   ├── DEVELOPMENT.md
│   ├── TESTING.md
│   ├── DEPLOYMENT.md
│   ├── SECURITY.md
│   ├── TROUBLESHOOTING.md
│   ├── DOCUMENTATION_MAINTENANCE.md
│   ├── DESIGN.md                # Design tokens (colors, typography, components)
│   ├── MEMORY.md                # Architectural decisions log
│   ├── PRD.md                   # Product requirements (aspirational)
│   ├── RULES.md                 # Operational & architectural rules
│   ├── TASKS.md                 # Development roadmap with status
│   └── testing/                 # Testing screenshots/artifacts
├── frontend/                    # Vite + React 19 + TypeScript
│   ├── src/
│   │   ├── main.tsx             # App entry (wraps CollegeOSProvider)
│   │   ├── App.tsx              # Root component, routing
│   │   ├── index.css            # Tailwind imports + global styles
│   │   ├── context/
│   │   │   └── CollegeOSContext.tsx  # Global state + auth handlers
│   │   ├── services/
│   │   │   ├── apiClient.ts     # Typed API client (fetch wrapper)
│   │   │   ├── lmsApi.ts        # LMS API wrapper (100+ functions)
│   │   │   └── uploadClient.ts  # Shared upload with progress
│   │   ├── components/
│   │   │   ├── ui/              # Shared primitives (Button, Card, Modal, etc.)
│   │   │   ├── layout/          # Sidebar, Header, Layout wrapper
│   │   │   ├── auth/            # Login, account activation
│   │   │   ├── calendar/        # Calendar components
│   │   │   ├── common/          # Shared domain components
│   │   │   ├── lms/             # LMS sub-components
│   │   │   ├── mail/            # Mail/Message components
│   │   │   ├── modules/         # Workspace views (24 files)
│   │   │   ├── shared/          # Cross-module shared components
│   │   │   └── shared/upload/   # Upload components
│   │   ├── hooks/               # Custom React hooks
│   │   ├── lib/                 # Utilities
│   │   │   ├── nepaliCalendar.ts
│   │   │   ├── lmsFormat.ts
│   │   │   ├── passwordPolicy.ts
│   │   │   ├── institutionTime.ts
│   │   │   ├── mockData.ts      # Legacy mock data (being phased out)
│   │   │   ├── theme.ts
│   │   │   └── navigation.ts
│   │   └── types/               # TypeScript definitions
│   │       ├── index.ts         # Core domain types
│   │       └── lms.ts           # LMS-specific types
│   ├── public/
│   │   └── assets/
│   ├── dist/                    # Production build output (gitignored)
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── index.html
├── scripts/                     # Dev orchestration, demo seed, admin utils
│   ├── dev.js                   # Starts mongod + API + Vite
│   ├── seed-demo.js             # Opt-in demo fixtures (dev only)
│   ├── probe-db.mjs             # Read-only DB probe
│   └── admin/                   # Admin utilities (empty)
└── .mongodb-data/               # Local MongoDB data directory (gitignored)
```

## Key File Categories

### Backend Route Modules (`backend/src/routes/`)
| File | Domain |
|------|--------|
| `auth.js` | Login, session, password change, role switching |
| `administration.js` | User provisioning, role assignment, account status |
| `academics.js` | Courses, sections, programs, enrollments, teaching assignments |
| `calendar.js` | Academic calendar events and documents |
| `materials.js` | Learning materials (course library) |
| `assignments.js` | Assignments, submissions, grading |
| `lms.js` | Weekly planner, weeks, objectives, announcements |
| `quizzes.js` | Quiz authoring, attempts, marking |
| `timetable.js` | Timetable management (admin) |
| `myTimetable.js` | Personal timetable (faculty/student) |
| `files.js` | File upload, download, entitlement checks |
| `notices.js` | Institutional notices |
| `communication.js` | Mail, messages, notifications |
| `workflow.js` | Case/request management |
| `reporting.js` | Analytics, dashboards |
| `finance.js` | Invoices, payments, fee management |
| `admissions.js` | Admission applications |
| `examinations.js` | Exams, results, grading workflows |
| `profile.js` | User profile, avatar |
| `departmental.js` | Department-level admin |
| `attendance.js` | Attendance sessions, marking, QR, corrections |
| `coding.js` | Online Coding Lab: projects, shares, assignments, submissions, execution |
| `health.js` | Health check endpoint |

### Backend Models (`backend/src/models/`)
| Model | Purpose |
|-------|---------|
| `User.js` | Authentication, roles, password, status |
| `Student.js` | Student profile, enrollment linkage |
| `Staff.js` | Faculty/staff employment details |
| `Department.js` | Academic departments |
| `Program.js` | Academic programs (BCA, BBS, etc.) |
| `Section.js` | Class sections (A1, A2, etc.) |
| `Course.js` | Course catalog |
| `Enrollment.js` | Student ↔ CourseSection |
| `CourseTeachingAssignment.js` | Faculty ↔ CourseSection |
| `Attendance.js` | Individual attendance records |
| `AttendanceSession.js` | Class sessions with QR tokens |
| `Assignment.js` | Assignment definitions |
| `Submission.js` | Student submissions |
| `LearningMaterial.js` | Course materials (files) |
| `CourseWeek.js` | Weekly planner weeks |
| `LearningObjective.js` | Week objectives |
| `Quiz.js` / `QuizQuestion.js` / `QuizAttempt.js` | Quiz system |
| `CourseAnnouncement.js` | LMS announcements |
| `CourseTemplate.js` | Reusable course structures |
| `TeachingProgress.js` | Faculty teaching position records |
| `Grade.js` | Exam/course grades |
| `Timetable.js` | Timetable slots |
| `Exam.js` / `ExamResult.js` | Examination system |
| `Invoice.js` / `Payment.js` | Finance |
| `WorkflowCase.js` | Case/request management |
| `Document.js` | Document registry |
| `Notice.js` | Notices |
| `Message.js` / `Mail.js` / `Notification.js` | Communication |
| `AuditLog.js` | Audit trail |
| `InstitutionSetting.js` | Institution config |
| `Session.js` | JWT session store |
| `PasswordResetToken.js` | Password reset tokens |
| `Room.js` | Physical rooms |
| `AcademicCalendarEvent.js` / `AcademicCalendarDocument.js` | Calendar |
| `AdmissionApplication.js` | Admissions |
| `StoredFile.js` | File metadata |
| `Audience.js` | Audience targeting model |
| `CodingProject.js` / `CodingShare.js` | Coding Lab projects and sharing |
| `CodingAssignment.js` / `CodingSubmission.js` | Coding Lab assignments and submissions |
| `CodingExecution.js` | Coding Lab execution audit records (TTL 24h) |

### Frontend Module Workspaces (`frontend/src/components/modules/`)
| File | Purpose |
|------|---------|
| `DashboardWorkspaceView.tsx` | Main dashboard |
| `UserManagementView.tsx` | User provisioning, roles |
| `MyCoursesView.tsx` | Course index (inProgress/past/future) |
| `LmsWorkspace.tsx` | LMS entry → Faculty/Student workspace |
| `FacultyLmsWorkspace.tsx` | Teacher planner, materials, quizzes |
| `StudentLmsWorkspace.tsx` | Student course view |
| `AttendanceWorkspaceView.tsx` | Attendance marking, QR, corrections |
| `TimetableWorkspaceView.tsx` | Timetable management |
| `FacultyMyTimetableView.tsx` | Personal faculty timetable |
| `StudentTimetableView.tsx` | Student timetable |
| `ExaminationWorkspaceView.tsx` | Exam scheduling, results |
| `FinanceWorkspaceView.tsx` | Invoices, payments |
| `AcademicCalendarView.tsx` | Calendar events (shows timetable/exams) |
| `AcademicCalendarDocumentsView.tsx` | Calendar documents |
| `AdmissionsWorkspaceView.tsx` | Admission applications |
| `NoticesView.tsx` | Notices |
| `CollegeMailView.tsx` | Institutional mail |
| `MessagesView.tsx` | Direct messages |
| `WorkflowWorkspaceView.tsx` | Case management |
| `AnalyticsWorkspaceView.tsx` | Reporting |
| `AccountProfileView.tsx` | User profile |
| `StudentDirectoryWorkspaceView.tsx` | Student directory |
| `FacilitiesLibraryView.tsx` | Library (view only) |
| `NextGenSuiteView.tsx` | Intelligence features (placeholder) |

#### Coding Lab (`frontend/src/components/modules/coding/`)
| File | Purpose |
|------|---------|
| `CodingLabWorkspace.tsx` | Lab shell: tabs (Projects / Assignments / Submissions), routing, toasts |
| `CompilerWorkspace.tsx` | Multi-file compiler: editor tabs, run, save, download/upload, submit |
| `PlaygroundWorkspace.tsx` | HTML/CSS/JS playground: run, preview, ZIP export |
| `CodeEditor.tsx` | Syntax-highlighting editor (transparent textarea over highlighted pre) |
| `OutputPanel.tsx` | Execution console: stdout/stderr/compile output, stdin, metrics |
| `PlaygroundPreview.tsx` | Sandboxed iframe preview with console/error capture |
| `ProjectListPane.tsx` | Project cards, new/save-as, delete, duplicate, share entry |
| `AssignmentDialog.tsx` | Assignment create/edit form |
| `ShareDialog.tsx` | Share modal: audience, permission, expiry, revoke |
| `SubmissionsPanel.tsx` | Submission list, detail, grading form |
| `codingTypes.ts` | TypeScript interfaces |
| `codingApi.ts` | Typed API client for the lab |
| `execution.ts` | Run + poll execution |
| `languageRegistry.ts` | Language metadata and starter templates |
| `syntax.ts` | Syntax tokenizer (per-grammar regex families) |
| `zipUtil.ts` | ZIP writer (STORE), CRC-32, filename sanitisation |

### Frontend UI Primitives (`frontend/src/components/ui/`)
`Alert`, `Avatar`, `Badge`, `Button`, `Card`, `Checkbox`, `DataTable`, `Dropdown`, `EmptyState`, `FormField`, `Icon`, `Input`, `Modal`, `Pagination`, `Progress`, `RadioGroup`, `Select`, `Spinner`, `Switch`, `Tabs`, `Table`, `Tag`, `Textarea`, `Tooltip`

## Files That Must Not Be Used As Reference

- `database/` — RETIRED SQLite artifacts; actual persistence is MongoDB/Mongoose
- `frontend/src/lib/mockData.ts` — Legacy mock data; modules now fetch from API
- `nextjs-app/` — Dead standalone Next.js app (should be removed)
- Root diagnostic scripts (`checkuser.cjs`, `inspect.cjs`, `probe2.tmp.mjs`, `repro*.cjs`, `resetpass.cjs`, `verify.tmp.mjs`) — Moved/deleted per audit