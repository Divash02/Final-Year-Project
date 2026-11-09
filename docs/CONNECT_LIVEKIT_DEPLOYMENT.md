# CollegeOS Connect — LiveKit Deployment (Phase 2)

Phase 2 uses **LiveKit SFU** for real audio/video/screen sharing and **Socket.IO** (integrated into the existing Express HTTP server) for app-level realtime (chat, hand raise, participant status, host control foundations). The backend authorizes **before** issuing LiveKit tokens. **Do not claim real A/V verified until a real LiveKit connection succeeds.**

## Required server environment variables (never commit secrets)

Set these on the backend host (or in a local `.env` that is gitignored):

| Variable | Purpose |
|---|---|
| `LIVEKIT_URL` | LiveKit server URL, e.g. `wss://livekit.example.com` (or `ws://localhost:7880` for local dev). |
| `LIVEKIT_API_KEY` | LiveKit API key (server-side only). |
| `LIVEKIT_API_SECRET` | LiveKit API secret (server-side only). |

Placeholders exist in `.env.example`. If unconfigured, `GET /api/connect/config` reports `livekit.configured=false`, `POST /api/connect/sessions/:id/livekit/token` returns **503**, and the UI shows an honest “infrastructure unavailable / LiveKit not configured” state. **No audio/video is simulated.**

## Fixing “Live video infrastructure is not configured”

### LiveKit Cloud (recommended when Docker is unavailable)
Docker is **not required**. Create/use a LiveKit Cloud project and set server-side env vars (gitignored `.env`; restart backend after changes):
```env
LIVEKIT_URL=wss://<your-project>.livekit.cloud
LIVEKIT_API_KEY=<your-livekit-cloud-api-key>
LIVEKIT_API_SECRET=<your-livekit-cloud-api-secret>
```
The backend supports secure `wss://` URLs. LiveKit Cloud includes TURN/ICE for real-world networks. **Never** put these values in frontend env (`VITE_*`), API responses, logs, or git.

### Local dev (optional, requires Docker)
1. `docker compose -f docker-compose.livekit.yml up -d` (ports `7880/7881/7882`).
2. Set `LIVEKIT_URL=ws://localhost:7880`, `LIVEKIT_API_KEY=devkey`, `LIVEKIT_API_SECRET=secret` (local defaults only; replace for shared/staging/production).
3. Restart backend.

After configuration, `GET /api/connect/config` reports `livekit.configured=true` and returns only safe non-secret diagnostics (`provider`, `host`, `secure/mode`, `missing`/`urlValid` — **never** key/secret). Real camera/mic/screen share still requires runtime verification with actual participants and a reachable LiveKit deployment with TURN/ICE.

## TURN / ICE

For real-world connectivity (NAT/mobile/corporate networks), configure LiveKit with TURN (and appropriate ICE). LiveKit Cloud provides TURN; self-hosted deployments should configure coturn/TURN credentials per LiveKit documentation. TURN configuration is part of the LiveKit deployment, not exposed to the frontend.

## Production

- Use a hardened LiveKit deployment behind TLS (`wss://`).
- Store `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` in a server environment/secret manager only.
- Configure TURN/ICE for participant networks.

## How authorization works (must remain)

- `GET /api/connect/config` reports `livekit.configured` only (no secrets).
- `POST /api/connect/sessions/:id/join` and `POST /api/connect/sessions/:id/livekit/token` both use the shared server authorization (`authorizeConnectJoin`): authenticated CollegeOS identity, exact class cohort/enrollment membership (server-resolved), student session credential for class students, staff invitation/role for meetings, and session status (reject cancelled/expired/ended).
- **ONLINE_MEETING:** students receive **zero** visibility/metadata and are denied (non-disclosing 404) for list/detail/join/token and Socket.IO join/room subscription. Staff invite/role required.
- LiveKit tokens are short-lived with minimum required room grants.

## Socket.IO

- Namespace: `/connect` on the same HTTP server, path `/socket.io`.
- Handshake authenticates the CollegeOS JWT/session. `connect:join` **repeats full session authorization** (including session credentials and student/meeting isolation) and rejects joining by session ID alone. Sensitive events (`chat`, `hand`, `status`, `control`) re-authorize against the server session state and require room membership; invalid status/actions are rejected; basic rate limits apply.

## Verification status

- Backend syntax and frontend TypeScript checks pass for Connect files.
- Pure authorization tests cover the 12 required isolation/auth cases via shared logic. **DB-backed runtime/E2E tests (real MongoDB + users/enrollments) and real LiveKit A/V connection were not executed in this environment** — report separately; do not mark as passed.
