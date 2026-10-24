# CollegeOS — Documentation Maintenance

## Purpose
This document defines **when** and **how** each documentation file must be updated to stay synchronized with the codebase. It establishes single authoritative sources and prevents drift.

## Authoritative Source Mapping

| Subject | Authoritative Document | Code Reference |
|---------|------------------------|----------------|
| AI agent instructions | `AGENTS.md` | — |
| Compact AI context | `docs/AI_CONTEXT.md` | — |
| Project entry point | `README.md` | `package.json`, `docs/ARCHITECTURE.md` |
| System architecture | `docs/ARCHITECTURE.md` | `backend/src/app.js`, `backend/src/server.js` |
| Directory structure | `docs/DIRECTORY_STRUCTURE.md` | Actual filesystem |
| Authentication | `docs/AUTHENTICATION.md` | `backend/src/routes/auth.js`, `backend/src/middleware/auth.js`, `backend/src/db.js` |
| Authorization/RBAC | `docs/AUTHORIZATION_AND_RBAC.md` | `backend/src/permissions/catalog.js`, `backend/src/middleware/auth.js`, `backend/src/services/accessControl.js` |
| Database/Models | `docs/DATABASE.md` | `backend/src/models/*.js`, `backend/src/db.js`, `backend/src/config/database.js` |
| API Reference | `docs/API_REFERENCE.md` | `backend/src/routes/*.js`, `api/contracts/*.md` |
| Frontend | `docs/FRONTEND.md` | `frontend/src/**/*.tsx`, `frontend/vite.config.ts` |
| Backend | `docs/BACKEND.md` | `backend/src/**/*.js` |
| Modules | `docs/MODULES.md` | `backend/src/routes/*.js`, `frontend/src/components/modules/*.tsx` |
| Configuration | `docs/CONFIGURATION.md` | `.env.example`, `backend/src/config/database.js`, `backend/src/db.js`, `package.json` |
| Development | `docs/DEVELOPMENT.md` | `scripts/dev.js`, `scripts/seed-demo.js`, `package.json` |
| Testing | `docs/TESTING.md` | `backend/tests/*.test.js`, `frontend/src/lib/*.test.ts` |
| Deployment | `docs/DEPLOYMENT.md` | `scripts/dev.js`, `backend/src/server.js`, `frontend/vite.config.ts` |
| Security | `docs/SECURITY.md` | `backend/src/middleware/auth.js`, `backend/src/services/fileStorage.js`, `backend/src/db.js` |
| Troubleshooting | `docs/TROUBLESHOOTING.md` | Common issues from development |
| Design system | `docs/DESIGN.md` | `frontend/src/index.css`, `frontend/src/lib/theme.ts` |

## Update Triggers

### When Modifying Code, Update:

| Code Change | Documents to Update |
|-------------|---------------------|
| Auth flow (login, session, password, roles) | `docs/AUTHENTICATION.md`, `docs/AUTHORIZATION_AND_RBAC.md`, `AGENTS.md` (if commands change) |
| Permission added/removed/changed | `docs/AUTHORIZATION_AND_RBAC.md`, `docs/MODULES.md` (affected modules) |
| New API endpoint or changed contract | `docs/API_REFERENCE.md`, relevant `api/contracts/*.md` |
| Model schema changed (fields, indexes, relationships) | `docs/DATABASE.md`, `docs/MODULES.md` (affected modules) |
| New route module added | `docs/ARCHITECTURE.md`, `docs/BACKEND.md`, `docs/MODULES.md`, `docs/API_REFERENCE.md` |
| New frontend workspace/module | `docs/FRONTEND.md`, `docs/MODULES.md`, `docs/DIRECTORY_STRUCTURE.md` |
| Environment variable added/removed | `docs/CONFIGURATION.md`, `.env.example`, `README.md` |
| Package script added/changed | `docs/DEVELOPMENT.md`, `README.md`, `package.json` |
| Test added/changed | `docs/TESTING.md` |
| Deployment process changed | `docs/DEPLOYMENT.md`, `docs/CONFIGURATION.md` |
| Security boundary changed | `docs/SECURITY.md`, `docs/AUTHENTICATION.md`, `docs/AUTHORIZATION_AND_RBAC.md` |
| Directory structure changed | `docs/DIRECTORY_STRUCTURE.md`, `AGENTS.md` |
| Design tokens changed | `docs/DESIGN.md`, `frontend/src/lib/theme.ts` |

### When Documentation Changes, Verify:
- All internal Markdown links resolve
- Code references (file paths, line numbers) are accurate
- Commands match `package.json` scripts
- Environment variable names match code
- Role/permission names match `catalog.js`
- Model names match `backend/src/models/index.js`
- Route paths match `backend/src/app.js` registration

## Validation Checks

### Automated (Run Before Claiming Completion)
```bash
# 1. TypeScript compilation (catches type drift)
npm run lint

# 2. All tests pass (catches behavioral drift)
npm run test

# 3. Build succeeds
npm run build
```

### Manual (Perform After Documentation Changes)
1. **Link check:** Verify all relative links in `.md` files resolve to existing files
2. **Command check:** Run each documented command to confirm it works
3. **Env var check:** Grep codebase for each documented env var
4. **Route check:** Compare documented endpoints with `backend/src/app.js` registration
5. **Role check:** Compare documented roles with `catalog.js` `CORE_ROLES`
6. **Model check:** Compare documented models with `backend/src/models/index.js` exports

### Recommended Tooling (Lightweight)
```bash
# Check for broken relative links in docs/
# (Requires Node; run from repo root)
node -e "
const fs = require('fs');
const path = require('path');
function checkLinks(dir) {
  for (const file of fs.readdirSync(dir)) {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) checkLinks(full);
    else if (file.endsWith('.md')) {
      const content = fs.readFileSync(full, 'utf8');
      const links = content.match(/\[([^\]]+)\]\(([^)]+)\)/g) || [];
      for (const link of links) {
        const match = link.match(/\(([^)]+)\)/);
        if (match && !match[1].startsWith('http') && !match[1].startsWith('#')) {
          const target = path.resolve(path.dirname(full), match[1]);
          if (!fs.existsSync(target)) console.log('BROKEN:', full, '->', match[1]);
        }
      }
    }
  }
}
checkLinks('docs');
"
```

## Documentation Style Rules

1. **Single source of truth** — Never duplicate content; link to authoritative doc
2. **Implementation-first** — Document what code *does*, not what it *should* do
3. **Classification** — Mark features: **Implemented**, **Partial**, **Planned**, **Unverified**
4. **No secrets** — Never include real credentials, tokens, or production values
5. **File paths** — Use absolute paths from repo root (e.g., `backend/src/routes/auth.js`)
6. **Line numbers** — Include when referencing specific code sections
7. **Tables over prose** — For structured data (permissions, endpoints, models)
8. **Mermaid diagrams** — For architecture/flow (render in GitHub/GitLab)

## Review Cadence

| Trigger | Review Scope |
|---------|--------------|
| Every PR | Changed files' authoritative docs |
| Monthly | Full `docs/` index (`docs/README.md`) for stale links |
| Release | All docs for version accuracy |
| Major refactor | `AGENTS.md`, `docs/AI_CONTEXT.md`, `docs/ARCHITECTURE.md` |

## Archival Policy

### Do Not Archive
- Application source code (`backend/`, `frontend/`, `scripts/`, `api/`)
- Package manifests (`package.json`, `package-lock.json`)
- Environment files (`.env`, `.env.example`)
- Active documentation (`docs/*.md`, `AGENTS.md`, `README.md`)

### Archive (Move to `docs/archive/` with date prefix)
- Superseded design docs (old `DESIGN.md` versions)
- Historical audit reports (old `AUDIT_REPORT.md`)
- Retired technical decisions (old `MEMORY.md` entries)
- Completed task lists (old `TASKS.md` versions)

### Delete (After Consolidation)
- Duplicate content merged into authoritative docs
- Obsolete diagnostics (`checkuser.cjs`, `inspect.cjs`, `probe2.tmp.mjs`, `repro*.cjs`, `resetpass.cjs`, `verify.tmp.mjs`)
- Dead code directories (`nextjs-app/`, `database/` — keep `database/README.md` as notice)

## Current Documentation Debt (As of 2026-10-10)

| Document | Issue | Priority |
|----------|-------|----------|
| `docs/DESIGN.md` | Only covers colors/typography; missing component specs | Low |
| `docs/MEMORY.md` | Very brief; could capture more architectural decisions | Low |
| `docs/PRD.md` | Aspirational; many features not implemented | Medium (mark clearly) |
| `docs/RULES.md` | Overlaps with `AGENTS.md` security rules | Medium (consolidate) |
| `docs/TASKS.md` | Status markers need verification against code | High |
| `api/contracts/` | Only 3 contracts; most endpoints undocumented | High |
| `database/README.md` | Documents retired SQLite; needs MongoDB focus | High |

## Related Files
| File | Purpose |
|------|---------|
| `AGENTS.md` | AI agent instructions (includes update requirements) |
| `docs/AI_CONTEXT.md` | Compact knowledge base |
| `docs/README.md` | Documentation index |
| `.gitignore` | Excludes build artifacts, `.env`, `.mongodb-data/` |