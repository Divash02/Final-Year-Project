# CollegeOS — Deployment

## Overview
CollegeOS is a **single-node deployment** (one Express server + one MongoDB + static frontend). No container orchestration, no microservices. This document covers production deployment considerations.

## Architecture in Production

```
┌─────────────────────────────────────┐
│         Reverse Proxy (nginx)        │
│  HTTPS termination, static files    │
└──────────────┬──────────────────────┘
               │
    ┌──────────┴──────────┐
    ▼                     ▼
┌─────────┐         ┌──────────┐
│ Express │         │  MongoDB │
│  API    │◄────────►│ (replica │
│ :4000   │         │   set)   │
└─────────┘         └──────────┘
    │
    ▼
┌─────────────┐
│ backend/    │
│ uploads/    │
└─────────────┘
```

## Pre-Deployment Checklist

### 1. Environment Variables (Production)
```bash
# Required
MONGODB_URI="mongodb://user:pass@host1,host2,host3/collegeos?replicaSet=rs0&authSource=admin"
JWT_SECRET="$(openssl rand -base64 32)"           # 32+ char random
COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD="$(openssl rand -base64 24)"
INSTITUTION_EMAIL_DOMAIN="yourcollege.edu.np"

# Optional
PORT=4000
NODE_ENV=production
```

### 2. Secrets Management
- **Never** commit `.env` — use deployment platform secrets
- `JWT_SECRET` — rotate periodically; invalidates all sessions
- `COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD` — only used on **first boot**; changing later has no effect
- Store in: AWS Secrets Manager, Azure Key Vault, HashiCorp Vault, or platform env vars

### 3. MongoDB
- **Replica set required** for production
- Connection string with `replicaSet=` and `authSource=admin`
- Enable TLS: `mongodb://...&tls=true`
- Create indexes: run `initializeServerState()` once (idempotent)

### 4. File Storage
- **Current:** Local disk at `backend/uploads/`
- **Production requirement:** Migrate to S3-compatible storage
- **Blockers:** `fileStorage.js` and `files.js` assume local paths
- **Workaround:** Mount network volume at `backend/uploads/` with backup strategy

### 5. Reverse Proxy (nginx Example)
```nginx
server {
    listen 443 ssl http2;
    server_name collegeos.yourcollege.edu.np;

    ssl_certificate /etc/ssl/certs/collegeos.crt;
    ssl_certificate_key /etc/ssl/private/collegeos.key;

    # Frontend static files
    location / {
        root /var/www/collegeos/frontend/dist;
        try_files $uri $uri/ /index.html;
        add_header X-Frame-Options "SAMEORIGIN";
        add_header X-Content-Type-Options "nosniff";
    }

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
    }

    # Avatar images (public)
    location /uploads/avatars/ {
        alias /var/www/collegeos/backend/uploads/avatars/;
        expires 1h;
        add_header X-Content-Type-Options "nosniff";
        add_header Content-Disposition "inline";
    }
}
```

### 6. Process Management
```bash
# systemd service example
[Unit]
Description=CollegeOS Backend
After=network.target mongod.service

[Service]
Type=simple
User=collegeos
WorkingDirectory=/opt/collegeos
EnvironmentFile=/opt/collegeos/.env
ExecStart=/usr/bin/node --max-old-space-size=4096 backend/src/server.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

## Build & Deploy Steps

### 1. Frontend Build
```bash
npm run build
# Output: frontend/dist/
# Deploy to: nginx root (/var/www/collegeos/frontend/dist)
```

### 2. Backend Deploy
```bash
# On server
cd /opt/collegeos
npm ci --production  # Or copy node_modules from build machine
# Ensure .env is in place
systemctl start collegeos
```

### 3. Database Initialization
```bash
# First deploy only
node backend/src/server.js  # Runs initializeServerState() → seedBaseUsers()
# Verify Super Admin created in logs
# Then restart via systemd
```

### 4. Health Check
```bash
curl -f https://collegeos.yourcollege.edu.np/health
# Expected: { "status": "ok" }
```

## Scaling Considerations

### Current Limitations (Single-Node)
| Component | Limitation | Mitigation |
|-----------|------------|------------|
| Express | Single process | PM2 cluster mode or multiple nodes behind proxy |
| Session store | MongoDB (shared) | Works multi-node if shared MongoDB |
| File uploads | Local disk | **Must migrate to S3** for multi-node |
| Login rate limit | In-memory Map | Use Redis-backed store |
| Academic scheduler | Runs in each process | Use single scheduler (leader election) or external cron |

### Multi-Node Readiness
- **Sessions:** Stored in MongoDB → works across nodes
- **Scheduler:** `lms/scheduler.js` runs in each process → **duplicate executions**; needs leader election or external cron
- **Rate limiting:** In-memory → **use Redis** (`ioredis` + `rate-limiter-flexible`)
- **File storage:** Local → **must use S3** (`@aws-sdk/s3-client`)

## Backup & Recovery

### MongoDB
```bash
# Backup (replica set secondary)
mongodump --uri="mongodb://secondary:27017/collegeos" --out=/backup/$(date +%F)

# Restore
mongorestore --uri="mongodb://primary:27017/collegeos" /backup/2026-10-10/collegeos
```

### File Uploads
```bash
# Sync to object storage
aws s3 sync backend/uploads/ s3://collegeos-uploads/ --delete

# Or rsync to backup server
rsync -avz backend/uploads/ backup-server:/backup/collegeos-uploads/
```

## Monitoring

### Key Metrics
- **API latency** — p50, p95, p99 per endpoint
- **Error rate** — 5xx / total requests
- **MongoDB** — connections, query latency, replication lag
- **Disk** — `backend/uploads/` growth
- **Memory** — Node heap (max 4GB via `--max-old-space-size`)

### Log Aggregation
- Structured JSON logs (add `pino` or `winston`)
- Ship to: Loki, Datadog, CloudWatch, Elastic
- **Audit logs** in `AuditLog` collection — query via `/api/reporting/audit`

## Security Hardening

### Headers (nginx)
```nginx
add_header X-Frame-Options "SAMEORIGIN";
add_header X-Content-Type-Options "nosniff";
add_header Referrer-Policy "strict-origin-when-cross-origin";
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()";
# CSP requires tuning for Vite/React
```

### Rate Limiting (nginx)
```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=100r/s;
limit_req zone=api burst=200 nodelay;
```

### MongoDB
- Enable authentication
- Restrict network access (VPC/security groups)
- Enable encryption at rest
- Regular key rotation

## Rollback Procedure

### Frontend
```bash
# Keep previous build
mv /var/www/collegeos/frontend/dist /var/www/collegeos/frontend/dist.$(date +%s)
# Deploy new
cp -r frontend/dist /var/www/collegeos/frontend/
# Rollback
mv /var/www/collegeos/frontend/dist /var/www/collegeos/frontend/dist.failed
mv /var/www/collegeos/frontend/dist.20261010120000 /var/www/collegeos/frontend/dist
```

### Backend
```bash
# Blue-green or rolling restart
systemctl reload collegeos  # Graceful restart
# Or deploy to new directory, swap symlink, restart
```

### Database
- **Schema changes are additive only** — no destructive migrations
- Rollback = deploy previous code version (compatible with current schema)

## Known Deployment Gaps

| Gap | Impact | Workaround |
|-----|--------|------------|
| No S3 storage | Multi-node impossible | Single node + network volume |
| No email delivery | Forgot-password broken | Admin manual reset |
| In-memory rate limit | Not distributed | Single node OK; multi-node needs Redis |
| Scheduler per-process | Duplicate scheduled jobs | Single node OK; multi-node needs leader election |
| No structured logging | Hard to debug in prod | Add pino/winston + log shipper |
| No health check dependencies | `/health` doesn't check MongoDB | Add `/health/ready` endpoint |

## Related Files
| File | Purpose |
|------|---------|
| `scripts/dev.js` | Dev orchestration (reference) |
| `backend/src/server.js` | Entry point |
| `backend/src/config/database.js` | MongoDB config |
| `backend/src/services/lms/scheduler.js` | Academic scheduler |
| `backend/src/services/fileStorage.js` | File storage (local only) |
| `nginx.conf` | Reverse proxy (example above) |