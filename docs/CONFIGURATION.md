# CollegeOS — Configuration

## Environment Variables

### Root `.env` (Loaded by both backend and dev orchestrator)
```bash
# Public browser API origin. The dev script sets this automatically.
VITE_API_BASE_URL="http://localhost:4000/api"

# Backend configuration. Replace secrets in the deployment environment.
PORT=4000
MONGODB_URI="mongodb://127.0.0.1:27017/collegeos"
JWT_SECRET="replace-with-a-random-secret"
COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD=""
INSTITUTION_EMAIL_DOMAIN="techspire.edu.np"
```

### Variable Reference

| Variable | Scope | Required | Default | Description |
|----------|-------|----------|---------|-------------|
| `VITE_API_BASE_URL` | Frontend | Dev only | Auto-set by `dev.js` | API origin for browser requests |
| `PORT` | Backend | No | 4000 | HTTP server port |
| `MONGODB_URI` | Backend | Yes | `mongodb://127.0.0.1:27017/collegeos` | MongoDB connection string |
| `JWT_SECRET` | Backend | Yes | Dev default | HS256 signing secret (32+ chars for prod) |
| `COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD` | Backend | Yes | `Nepal@123` | Initial Super Admin password |
| `INSTITUTION_EMAIL_DOMAIN` | Backend | No | `techspire.edu.np` | Email domain for institutional accounts |
| `COLLEGEOS_TEST_DB` | Test | No | `collegeos_test` | Test database name |
| `COLLEGEOS_TEST_MONGO_HOST` | Test | No | `127.0.0.1:27017` | Test MongoDB host |
| `COLLEGEOS_DEMO_PASSWORD` | Seed | No | `Nepal@123` | Demo fixture password |
| `COLLEGEOS_DEFAULT_ACADEMIC_YEAR` | Test/Seed | No | `2025/2026` | Default academic year |
| `JUDGE0_BASE_URL` | Backend | No | empty | Online Coding Lab execution provider origin (e.g. `http://127.0.0.1:2358` for self-hosted Judge0 CE). Empty = lab runs are disabled with honest UI messaging |
| `JUDGE0_API_KEY` | Backend | No | empty | RapidAPI key for hosted Judge0 |
| `JUDGE0_HOST` | Backend | No | `judge0.p.rapidapi.com` | RapidAPI host header |
| `JUDGE0_LANGUAGE_ID_MAP` | Backend | No | `{}` | JSON `{ slug: judge0LanguageId }` overrides |
| `CODING_CPU_TIME_LIMIT` | Backend | No | `5` | Coding Lab CPU seconds per run |
| `CODING_MEMORY_LIMIT_KB` | Backend | No | `262144` | Coding Lab memory cap per run (256 MiB) |
| `CODING_RATE_LIMIT_PER_MINUTE` | Backend | No | `40` | Coding Lab executions per user per minute (per process) |

## Configuration Files

### `backend/src/config/database.js`
```javascript
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/collegeos";
// Retry logic: 5 attempts, 3s delay
// strictQuery: false
```

### `backend/src/db.js`
```javascript
const JWT_SECRET = process.env.JWT_SECRET || "collegeos-super-secure-production-jwt-token-secret-key-2026";
const BOOTSTRAP_ADMIN_PASSWORD = process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD || "Nepal@123";

export function getInstitutionEmailDomain() {
  return String(process.env.INSTITUTION_EMAIL_DOMAIN || "techspire.edu.np").trim().toLowerCase();
}
```

### `frontend/vite.config.ts`
```typescript
export default defineConfig(() => ({
  envDir: path.resolve(__dirname, ".."),  // Reads root .env
  // ...
}));
```

### `scripts/dev.js`
- Reads root `.env` via `dotenv/config`
- Auto-starts `mongod` if not running on `127.0.0.1:27017`
- Finds available ports for API (4000) and Vite (3000)
- Passes `VITE_API_BASE_URL` to Vite process env

## Secrets Handling

### ❌ Never Expose Via `VITE_*`
- `VITE_*` variables are embedded in the browser bundle
- `JWT_SECRET`, `COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD`, mail credentials, storage keys → **backend only**

### ✅ Safe for `VITE_*`
- `VITE_API_BASE_URL` — public API origin
- Feature flags, UI configuration, public endpoints

### Bootstrap Super Admin
- Created **once** by `seedBaseUsers()` on first boot
- Email: `admin@<INSTITUTION_EMAIL_DOMAIN>`
- Password: `COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD`
- **Changing the env var does NOT reset an existing account**
- Must change password on first login (`mustChangePassword: true`)

## Database Configuration

### Development
- Local `mongod` auto-started by `scripts/dev.js`
- Data directory: `.mongodb-data/` (gitignored)
- URI: `mongodb://127.0.0.1:27017/collegeos`

### Test
- Ephemeral database: `collegeos_test` (configurable)
- Dropped before and after `npm run test:api`
- URI: `mongodb://<COLLEGEOS_TEST_MONGO_HOST>/<COLLEGEOS_TEST_DB>`

### Production
- Use replica set URI: `mongodb://user:pass@host1,host2,host3/db?replicaSet=rs0`
- Enable auth, TLS, connection pooling

## Frontend Build Configuration

### `frontend/vite.config.ts`
- Plugins: `@vitejs/plugin-react`, `@tailwindcss/vite`
- `envDir: ".."` — reads root `.env`
- Alias: `@/*` → `./src/*`
- Optimized deps: `react`, `react-dom`, `three`, `@react-three/fiber`, `@react-three/drei`, `@fortawesome/react-fontawesome`, `@fortawesome/free-solid-svg-icons`
- HMR: Disabled when `DISABLE_HMR=true` (AI Studio compatibility)

### `frontend/tsconfig.json`
- Target: `ES2022`
- Module: `ESNext`, `moduleResolution: "bundler"`
- JSX: `react-jsx`
- Strict: `noEmit`, `isolatedModules`
- Paths: `@/*` → `./*`

## Package Scripts (`package.json`)

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `node --max-old-space-size=4096 scripts/dev.js` | Start API + Vite (auto-mongod) |
| `dev:client` | `vite frontend --config frontend/vite.config.ts --port=3000 --host=0.0.0.0` | Vite only |
| `server` | `node backend/src/server.js` | Backend only |
| `dev:server` | `node --watch backend/src/server.js` | Backend with watch |
| `seed:demo` | `node scripts/seed-demo.js` | Create demo fixtures |
| `seed:demo:reset` | `node scripts/seed-demo.js --reset` | Drop + recreate fixtures |
| `test` | `npm run test:api && npm run test:calendar && npm run test:lms-format && npm run test:policy && npm run test:sanitize` | All tests |
| `test:api` | `node --test backend/tests/*.test.js` | Backend integration |
| `test:calendar` | `tsx --test frontend/src/lib/nepaliCalendar.test.ts` | Calendar unit |
| `test:lms-format` | `tsx --test frontend/src/lib/lmsFormat.test.ts` | LMS format unit |
| `test:policy` | `tsx --test frontend/src/lib/passwordPolicy.test.ts` | Password policy unit |
| `test:sanitize` | `tsx --test frontend/src/lib/sanitizeHtml.test.ts` | Rich-text sanitizer unit |
| `build` | `vite build frontend --config frontend/vite.config.ts` | Production build |
| `preview` | `vite preview frontend --config frontend/vite.config.ts` | Preview build |
| `clean` | `node -e "for (const path of ['dist','frontend/dist']) require('node:fs').rmSync(path,{recursive:true,force:true})"` | Remove artifacts |
| `lint` | `tsc --noEmit -p frontend/tsconfig.json` | Type check |

## Deployment Configuration

### Required for Production
```bash
# Strong secrets
JWT_SECRET="$(openssl rand -base64 32)"
COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD="$(openssl rand -base64 24)"

# MongoDB replica set
MONGODB_URI="mongodb://user:pass@host1,host2,host3/collegeos?replicaSet=rs0&authSource=admin"

# Real domain
INSTITUTION_EMAIL_DOMAIN="yourcollege.edu.np"

# Reverse proxy (nginx/Caddy) terminates HTTPS
# Frontend served as static files or via Vite preview
```

### Not Yet Supported
- **Object storage abstraction** — files stored locally in `backend/uploads/`
- **Email delivery** — forgot-password returns `501`
- **Rate limiting** — login uses in-memory Map (not distributed)
- **Structured logging** — console only
- **Health checks beyond `/health`** — basic endpoint only

## Configuration Validation

No formal validation library. Checks performed at runtime:
- `database.js` — throws if MongoDB connection fails after retries
- `server.js` — throws if `initializeServerState()` fails
- `auth.js` — validates password policy on change
- `passwordPolicy.js` — enforces minimum requirements

## Related Files
| File | Purpose |
|------|---------|
| `.env.example` | Template |
| `.env` | Local overrides (gitignored) |
| `backend/src/config/database.js` | DB connection |
| `backend/src/db.js` | Auth/secrets config |
| `frontend/vite.config.ts` | Vite config |
| `scripts/dev.js` | Dev orchestration |
| `package.json` | Scripts |