# CollegeOS — Frontend

## Stack
- **Framework:** React 19, TypeScript, Vite 6
- **Styling:** Tailwind CSS 4 (via `@tailwindcss/vite`), CSS variables for design tokens
- **Icons:** Font Awesome 7 (`@fortawesome/react-fontawesome` + `free-solid-svg-icons`)
- **3D:** `@react-three/fiber`, `@react-three/drei`, `three` (landing page campus orbit)
- **QR:** `html5-qrcode` (scanner), `qrcode` (generator)
- **Animation:** `motion` (Framer Motion), `animejs`
- **AI:** `@google/genai` (plagiarism detection)
- **Date:** `nepali-date-converter` + custom `nepaliCalendar.ts`
- **State:** React Context (`CollegeOSContext.tsx`) — no Redux/Zustand
- **Routing:** React Router v6 (in `App.tsx`)

## Project Structure
```
frontend/
├── src/
│   ├── main.tsx                 # Entry, wraps <CollegeOSProvider>
│   ├── App.tsx                  # Routes, layout, auth guards
│   ├── index.css                # Tailwind imports + global styles
│   ├── context/
│   │   └── CollegeOSContext.tsx # Global state, auth, master data, UI actions
│   ├── services/
│   │   ├── apiClient.ts         # fetch wrapper + ApiError
│   │   ├── lmsApi.ts            # 100+ typed LMS API functions
│   │   └── uploadClient.ts      # Shared upload with progress
│   ├── components/
│   │   ├── ui/                  # 25+ primitives (Button, Card, Modal, Table, etc.)
│   │   ├── layout/              # Sidebar, Header, Layout wrapper
│   │   ├── auth/                # LoginScreen, AccountActivationView
│   │   ├── calendar/            # Calendar components
│   │   ├── common/              # Shared domain components
│   │   ├── lms/                 # LMS sub-components (assignments, materials, quizzes, planner)
│   │   ├── mail/                # Mail/Message components
│   │   ├── modules/             # 24 workspace views (one per module)
│   │   ├── shared/              # Cross-module components (StudentDetailDrawer, etc.)
│   │   └── shared/upload/       # Upload components (DragDrop, Progress)
│   ├── hooks/                   # Custom React hooks
│   ├── lib/                     # Utilities
│   │   ├── nepaliCalendar.ts    # BS/AD conversion, formatting
│   │   ├── lmsFormat.ts         # LMS display helpers (deadlines, marks, percentages)
│   │   ├── passwordPolicy.ts    # Client-side password validation
│   │   ├── institutionTime.ts   # Academic period helpers
│   │   ├── mockData.ts          # Legacy mock data (phased out)
│   │   ├── theme.ts             # Design token exports
│   │   ├── navigation.ts        # Role-based sidebar navigation (standard sections)
│   │   └── navigation.test.ts   # Navigation configuration unit tests
│   └── types/
│       ├── index.ts             # Core domain types (User, Student, Course, etc.)
│       └── lms.ts               # LMS-specific types (CourseWeek, Quiz, Material, etc.)
├── public/
│   └── assets/                  # Static assets
├── dist/                        # Production build (gitignored)
├── vite.config.ts
├── tsconfig.json
└── index.html
```

## Key Architecture Decisions

### 1. Single Global Context (`CollegeOSContext.tsx`)
- Holds **session + routing + API-fetched master data only**: students, courses, sections (from `loadMasterData()`), plus hand-off hints (`activeCourseId`, `activeAttendanceSessionId`) and the receipt/payment modals
- **Auth handlers:** `login`, `logout`, `changePassword`, `setCurrentRole`, `loadMasterData`
- **No local record mutators.** Every persistent write goes through the
  backend API (domain services such as `attendanceApi`, `lmsApi`,
  `codingApi`, `apiRequest`); the context never fabricates attendance,
  finance, assignment, library or notification records
- **Browser storage retained:** `collegeos_token` (session credential,
  documented in `AUTHENTICATION.md`), `collegeos_calendar` (UI
  preference), and `useFormDraft` keys (unsaved editing drafts)

### 2. Sidebar Navigation (`lib/navigation.ts`, `components/common/Sidebar.tsx`)
- **Five standard sections**, defined once and reused by every role
  portal: **Core Academic Management**, **People & Enrolment**,
  **Administration & Governance**, **Communication & Engagement**,
  **Account & Personal** (bilingual EN/NE headings)
- `getNavSectionsForRole(role)` returns the role's full configuration;
  `getVisibleNavSectionsForRole(role, permissions)` filters items
  against the session user's granted permissions and drops sections
  left empty, so no heading renders without at least one accessible page
- Sections are collapsible (`aria-expanded`/`aria-controls`), the
  section containing the active route stays expanded, and truncated
  labels carry native `title` tooltips
- **UI convenience only** — every route re-authorizes the session
  server-side (`middleware/auth.js`, `permissions/catalog.js`);
  hiding a nav entry never grants or revokes access

### 3. API Client (`apiClient.ts`)
- `apiFetch(route, options)` — adds Bearer token from `localStorage`, handles FormData
- `apiRequest<T>(route, options)` — returns typed data or throws `ApiError` with status
- `resolveAssetUrl(path)` — converts `/uploads/...` to full URL
- `ApiError` class — carries HTTP status for UI error handling

### 4. LMS API Wrapper (`lmsApi.ts`)
- **100+ functions**, one per endpoint
- **Zero logic** — pure mapping to `apiRequest`
- Types imported from `../types/lms`
- Re-exports format helpers from `../lib/lmsFormat`

### 5. Module Workspaces (`components/modules/`)
Each workspace is a **page-level component** for a domain:
- `DashboardWorkspaceView` — landing dashboard
- `UserManagementView` — admin user provisioning
- `MyCoursesView` — course index (inProgress/past/future)
- `LmsWorkspace` → `FacultyLmsWorkspace` / `StudentLmsWorkspace` — weekly planner
- `AttendanceWorkspaceView` — attendance marking, QR, corrections
- `TimetableWorkspaceView` / `FacultyMyTimetableView` / `StudentTimetableView` — timetables
- `ExaminationWorkspaceView` — exam scheduling, results
- `FinanceWorkspaceView` — invoices, payments
- `AcademicCalendarView` — calendar (currently shows timetable/exams)
- `AcademicCalendarDocumentsView` — calendar documents with inline viewer
- `AdmissionsWorkspaceView` — admission applications
- `NoticesView` — notices (rich-text editor, attachments, draft/publish lifecycle)
- `CollegeMailView` / `MessagesView` — communication
- `WorkflowWorkspaceView` — case management
- `AnalyticsWorkspaceView` — reporting
- `AccountProfileView` — user profile
- `StudentDirectoryWorkspaceView` — student directory
- `FacilitiesLibraryView` — library (view only)
- `NextGenSuiteView` — intelligence placeholder

### 6. Design System (`lib/theme.ts`, `index.css`, `DESIGN.md`)
- **Colors:** CSS variables (`--color-primary`, `--color-bg-main`, etc.)
- **Typography:** Inter, scale from `text-xl` (page title) to `text-[11px]` (metadata)
- **Components:** 8px radius, subtle shadows, white cards, teal primary (`#0F766E`)
- **Icons:** Font Awesome solid only — no emojis
- **Responsive:** Mobile drawer (hamburger), table overflow wrapping

### Shared viewer (`components/shared/viewer/`)
- `DocumentPreview` — dispatches by content family: PDF → `PdfViewer` (pdfjs-dist, page nav/zoom/print/fullscreen), images → `ImageViewer` (zoom/fullscreen), Office/other → honest fallback with authorized download
- `DocumentViewerModal` — modal wrapper used by Notices and the calendar
- Byte fetches go through authenticated `/api/files/:id`; rich text renders through `lib/sanitizeHtml.ts` (`sanitizeRichHtml`)

## State Management Patterns

### Local-First, API-Sync
Most modules **start with context state** (from `mockData.ts` or `loadMasterData()`) and mutate locally. API calls are **fire-and-forget** or optimistically update context. This is a known gap — migration to server-authoritative state is in progress.

### Auth State
- `isAuthenticated`, `currentUser`, `mustChangePassword`, `loginTransition`
- Restored on mount via `localStorage.collegeos_token` + `GET /api/auth/me`
- Role switching via `POST /api/auth/active-role` → updates context permissions

### Master Data Loading
```typescript
loadMasterData(): Promise<void> {
  // Fetches /courses, /students, /sections in parallel
  // Updates context: courses, students, sections
  // Non-fatal — modules show empty states on failure
}
```

### Active Selection State
- `activeCourseId` — set by `MyCoursesView` → `LmsWorkspace` opens it
- `activeAttendanceSessionId` — set by `FacultyMyTimetableView` → `AttendanceWorkspaceView` seeds it
- **Hint only** — target module still fetches + authorizes independently

## Routing (`App.tsx`)
- **Public:** `/` (redirects to login if unauthenticated), `/login`, `/account/activate`
- **Protected:** All module routes under `/` with `RequireAuth` wrapper
- **Communication sub-routes:** `/mail`, `/messages`, `/notices` synced with `activeView` context
- **Mobile:** Hamburger → off-canvas drawer (backdrop blur)

## Component Patterns

### UI Primitives (`components/ui/`)
All components use `className` composition with Tailwind, accept `className` prop for extension. Examples:
```tsx
<Button variant="primary" size="sm" onClick={...}>Label</Button>
<Card className="p-4">Content</Card>
<Modal isOpen={open} onClose={close} title="Title" maxWidth="lg">Content</Modal>
<DataTable columns={cols} data={rows} keyField="id" onRowClick={...} />
<EmptyState icon={faIcon} title="Empty" description="..." action={<Button>Action</Button>} />
```

### Data Display
- **Tables:** `DataTable` with virtualized rows for large datasets
- **Cards:** `Card` with `EmptyState` for zero data
- **Forms:** `FormField` + `Input`/`Select`/`Textarea`/`Switch`/`RadioGroup`/`Checkbox`
- **Feedback:** `Alert` (error/warning/success/info), `Toast` (via `useToast()` from `ToastContainer`)

### File Upload
- `DragDropZone` — drag/drop + click, shows preview
- `UploadQueue` — multiple files, progress bars, retry
- `uploadClient.ts` — `uploadWithProgress(file, endpoint, onProgress)` returns `{ fileId, url }`

## TypeScript Conventions
- **Strict mode** — `tsc --noEmit` passes (`npm run lint`)
- **Types** in `src/types/` — domain types separate from API response types
- **API response types** co-located with `lmsApi.ts` in `types/lms.ts`
- **No `any`** — use `unknown` + type guards
- **Discriminated unions** for status fields (e.g., `MaterialStatus = "DRAFT" | "SCHEDULED" | ...`)

## Testing
| Suite | Command | Scope |
|-------|---------|-------|
| Nepali calendar | `npm run test:calendar` | `lib/nepaliCalendar.test.ts` |
| LMS formatting | `npm run test:lms-format` | `lib/lmsFormat.test.ts` |
| Password policy | `npm run test:policy` | `lib/passwordPolicy.test.ts` |
| Rich-text sanitizer | `npm run test:sanitize` | `lib/sanitizeHtml.test.ts` |
| Type check | `npm run lint` | `tsc --noEmit` |

**No React component tests** — integration tests are backend-only (`npm run test:api`)

## Build & Development
```bash
npm run dev:client      # Vite only (requires running API)
npm run build           # vite build frontend → frontend/dist/
npm run preview         # vite preview frontend/dist
npm run clean           # removes dist/
```

### Vite Config (`vite.config.ts`)
- Plugins: `@vitejs/plugin-react`, `@tailwindcss/vite`
- `envDir: ".."` — reads root `.env`
- Alias: `@/*` → `./src/*`
- Optimized deps: react, three, fontawesome, etc.
- HMR configurable via `DISABLE_HMR` env

## Known Gaps & Migration Status

| Area | Status |
|------|--------|
| Master data | Server-authoritative via `loadMasterData()`; modules fetch their own domain data |
| Mutations | API calls through domain services (`attendanceApi`, `lmsApi`, `codingApi`) |
| Attendance marking | API-driven (`/api/attendance`) |
| Assignment grading | API-driven (`/api/assignments`, LMS endpoints) |
| Finance payments | API-driven (`POST /api/payments`, RBAC + balance validation) |
| Notifications | API-driven (`GET /api/notifications`, `PATCH /api/notifications/:id/read`) |
| Library circulation | No backend yet — workspace reports the gap (see `AI_CONTEXT.md` known defect 4) |

## Related Files
| File | Purpose |
|------|---------|
| `frontend/src/context/CollegeOSContext.tsx` | Global state + auth |
| `frontend/src/services/apiClient.ts` | API transport |
| `frontend/src/services/lmsApi.ts` | LMS endpoints |
| `frontend/src/components/modules/*.tsx` | Workspace views |
| `frontend/src/components/ui/*.tsx` | UI primitives |
| `frontend/src/lib/*.ts` | Utilities |
| `frontend/src/types/*.ts` | Type definitions |
| `frontend/vite.config.ts` | Build config |
| `docs/DESIGN.md` | Design tokens |