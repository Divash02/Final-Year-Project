# CollegeOS — Development Workflow

## Prerequisites
- Node.js 20+
- npm
- MongoDB (auto-started by `npm run dev` on Windows)

## Quick Start
```bash
npm install
npm run dev
```
- Starts `mongod` (if not running on 127.0.0.1:27017)
- Starts API on port 4000 (or next available)
- Starts Vite frontend on port 3000 (or next available)
- Opens Vite URL in terminal

## Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Full stack (API + Vite + auto-mongod) |
| `npm run dev:client` | Vite only (requires running API) |
| `npm run dev:server` | Backend with `--watch` restart |
| `npm run server` | Backend only |
| `npm run seed:demo` | Create missing demo fixtures |
| `npm run seed:demo:reset` | Drop + recreate demo fixtures |
| `npm run lint` | TypeScript type check (`tsc --noEmit`) |
| `npm run build` | Production frontend build |
| `npm run preview` | Preview production build |
| `npm run clean` | Remove `dist/` and `frontend/dist/` |

## Project Structure (Recap)
```
CollegeOS/
├── backend/src/          # Express API
├── frontend/src/         # React + Vite
├── scripts/              # Dev orchestration, seeds
├── api/contracts/        # HTTP contracts
└── docs/                 # Documentation
```

## Git Workflow
- **Main branch:** `main`
- **Feature branches:** `feature/<short-description>`
- **Commit messages:** Conventional (e.g., `feat: add QR attendance check-in`)
- **No direct commits to main** — use PRs
- **Before PR:** `npm run lint && npm run test`

## Coding Conventions

### Backend (Node ESM)
- **Imports:** Named exports, `.js` extensions required
- **Error handling:** Throw errors; central handler in `app.js` formats response
- **Authorization:** Always use middleware + `accessControl.js` services
- **Never trust** `req.body`/`req.params` IDs — re-derive from `req.user`
- **Async/await** — no `.then()` chains
- **Validation:** Manual in handlers (no Joi/Zod)

### Frontend (React + TypeScript)
- **Components:** Functional, TypeScript, `React.FC<Props>`
- **State:** `CollegeOSContext` for global; `useState`/`useReducer` for local
- **API calls:** `apiRequest` from `apiClient.ts` or `lmsApi.ts` functions
- **Types:** Domain types in `types/index.ts`, LMS types in `types/lms.ts`
- **Styling:** Tailwind utility classes, CSS variables for design tokens
- **Icons:** Font Awesome solid only (`faIconName` from `@fortawesome/free-solid-svg-icons`)

### Database (Mongoose)
- **One model per file** in `backend/src/models/`
- **Indexes** declared in schema
- **Virtuals** for computed fields (e.g., `User.name`)
- **No migrations** — schema changes are additive; use `db.js` helpers for data transforms

## Debugging

### Backend Logs
- `console.log` / `console.error` in route handlers and services
- Structured errors via `utils/apiError.js` — known errors keep safe message; unknown errors logged with full stack
- Audit logs in `AuditLog` collection (`logAudit()` in `db.js`)

### Frontend Logs
- Browser DevTools Console
- React DevTools for component tree
- Network tab for API requests (check `Authorization` header)

### Database Inspection
```bash
# MongoDB shell
mongosh mongodb://127.0.0.1:27017/collegeos

# Read-only probe
node scripts/probe-db.mjs
```

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| `ECONNREFUSED` MongoDB | `mongod` not running | `npm run dev` auto-starts; or start `mongod` manually |
| `401 Invalid session` | Token expired/revoked | Login again; check `localStorage.collegeos_token` |
| `403 PASSWORD_CHANGE_REQUIRED` | First login / temp password | Complete `/account/activate` flow |
| `403 Access denied` | Missing permission | Check `catalog.js` for role grants |
| Port in use | Previous process not killed | `dev.js` auto-picks next port; or kill process |
| TypeScript errors | Type drift | `npm run lint` shows exact errors |

## Seeding Data

### Bootstrap (Automatic)
- `seedBaseUsers()` in `db.js` runs on every server start
- Creates **only** Super Admin if not exists
- No other data fabricated

### Test Database
```bash
npm run test:api
```
- Creates `collegeos_test` database
- Drops before and after run
- Seeds: Admin, Registrar, 2 Teachers, Program Coordinator, 2 Courses, Sections

## Adding a New Feature

1. **Read** `AGENTS.md` → `docs/AI_CONTEXT.md` → relevant `docs/*.md`
2. **Identify** task category → inspect initial files from lookup table
3. **Backend first:**
   - Add model(s) if new data
   - Add permissions to `catalog.js`
   - Create route module in `backend/src/routes/`
   - Register in `app.js`
   - Write integration tests in `backend/tests/`
4. **Frontend:**
   - Add types to `types/` if needed
   - Add API functions to `lmsApi.ts` or `apiClient.ts`
   - Create workspace component in `components/modules/`
    - Add route in `App.tsx`, nav item in `lib/navigation.ts` (role section)
5. **Verify:** `npm run lint && npm run test`
6. **Document:** Update relevant `docs/*.md`

## Testing Strategy

### Backend Integration Tests (`npm run test:api`)
- **Real MongoDB** on ephemeral port
- **Full Express app** — no mocks
- **Covers:** Auth, accounts, academics, calendar, materials, assignments, quizzes, timetable, files, attendance, exams, finance, workflow, notices
- **Negative cases:** Every permission rule tested for 403/404

### Frontend Unit Tests
| Suite | File | Run |
|-------|------|-----|
| Nepali calendar | `frontend/src/lib/nepaliCalendar.test.ts` | `npm run test:calendar` |
| LMS formatting | `frontend/src/lib/lmsFormat.test.ts` | `npm run test:lms-format` |
| Password policy | `frontend/src/lib/passwordPolicy.test.ts` | `npm run test:policy` |
| Rich-text sanitization | `frontend/src/lib/sanitizeHtml.test.ts` | `npm run test:sanitize` |
| Rich-text sanitizer | `frontend/src/lib/sanitizeHtml.test.ts` | `npm run test:sanitize` |

### Type Checking
```bash
npm run lint  # tsc --noEmit -p frontend/tsconfig.json
```

## Performance Tips

- **API calls:** Use `Promise.all` for parallel fetches (see `loadMasterData`)
- **Large lists:** `DataTable` virtualizes rows; paginate backend (`?page=1&limit=20`)
- **File uploads:** `uploadClient.ts` streams with progress; magic-byte validation server-side
- **Memory:** `NODE_OPTIONS="--max-old-space-size=4096"` for dev

## Useful Scripts

### `scripts/probe-db.mjs`
Read-only database inspection — counts, sample documents per collection.

### `backend/tests/api.test.js`
Integration test suite — run with `npm run test:api`.

## IDE Setup

### VS Code Extensions (Recommended)
- TypeScript and JavaScript Language Features (built-in)
- Tailwind CSS IntelliSense
- ESLint
- Prettier
- MongoDB for VS Code

### Settings
```json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  }
}
```

## Related Files
| File | Purpose |
|------|---------|
| `AGENTS.md` | AI agent instructions |
| `docs/AI_CONTEXT.md` | Compact knowledge base |
| `scripts/dev.js` | Dev orchestration |
| `backend/tests/api.test.js` | Integration tests |
| `frontend/src/lib/*.test.ts` | Unit tests |