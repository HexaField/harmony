# Harmony — Testing & Deployment Runbook

_Living document. Update as procedures change._

---

## 1. Local Development

### Prerequisites

- Node.js 22+ (24 recommended)
- pnpm 10+
- Docker Desktop (for container testing)

### First Time Setup

```bash
git clone <repo> && cd harmony
pnpm install
cp .env.example .env          # edit with your values
```

### Daily Workflow

```bash
# Run tests (fast — ~6s)
npx vitest run

# Run tests in watch mode
npx vitest

# Start dev server (port 9999, health on 10000)
node --import tsx packages/server-runtime/bin/harmony-server.js --port 9999

# Start UI dev server (port 5174)
cd packages/ui-app && pnpm dev

# Type check (after TS fixes are complete)
pnpm run check

# Build (verifies ui-app Vite build)
pnpm run build
```

### Native Module Issues

If `better-sqlite3` fails with `NODE_MODULE_VERSION` mismatch:

```bash
cd node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3
npm rebuild
```

---

## 2. Testing Procedures

### 2.1 Automated Test Suite

**Full suite** — run before any commit to main:

```bash
npx vitest run
```

Expected: 2336+ passing, 62 skipped, 0 failures.

**Voice package specifically:**

```bash
npx vitest run --reporter=verbose packages/voice
```

**Single package:**

```bash
npx vitest run packages/<package-name>
```

### 2.2 Docker Smoke Test

Run this before any deployment:

```bash
# Build images
docker build -f packages/docker/Dockerfile.server -t harmony-server:local .
docker build -f packages/docker/Dockerfile.ui -t harmony-ui:local .

# Start server
docker run --rm -d --name harmony-smoke \
  -p 4000:4000 -p 4001:4001 \
  -v harmony-smoke-data:/var/harmony/data \
  harmony-server:local

# Wait for healthy
sleep 3

# Verify health
curl -sf http://localhost:4001/health || echo "FAIL: health check"

# Verify WebSocket accepts connections
node -e "
const ws = new (require('ws'))('ws://localhost:4000');
ws.on('open', () => { console.log('WS: connected'); ws.close(); process.exit(0); });
ws.on('error', e => { console.error('WS: FAIL', e.message); process.exit(1); });
setTimeout(() => { console.error('WS: timeout'); process.exit(1); }, 5000);
"

# Cleanup
docker stop harmony-smoke
docker volume rm harmony-smoke-data
```

### 2.3 Docker Compose Full Stack

```bash
# Copy config
cp harmony.config.example.yaml harmony.config.yaml

# Start everything
docker compose up -d

# Wait for healthy
docker compose ps  # all should show "healthy" or "running"

# Verify
curl -sf http://localhost:4001/health
open http://localhost:8080  # UI should load

# Test: create identity, create community, send message, reload, verify persistence

# Teardown
docker compose down -v  # -v removes volumes (clean state)
```

### 2.4 Manual Verification Checklist

Run through before each environment promotion (dev → staging → prod):

| #   | Test                                                 | Pass? |
| --- | ---------------------------------------------------- | ----- |
| 1   | Open UI → onboarding screen shown                    |       |
| 2   | Create identity → mnemonic displayed (12 words)      |       |
| 3   | Complete onboarding → main app with empty state      |       |
| 4   | Create community → appears in server list            |       |
| 5   | Send message in #general → appears immediately       |       |
| 6   | Reload page → still logged in, messages persist      |       |
| 7   | Open second browser/tab → create second identity     |       |
| 8   | Second user joins community → appears in member list |       |
| 9   | Messages appear in real-time for both users          |       |
| 10  | Typing indicator works between users                 |       |
| 11  | Edit message → updated for other user                |       |
| 12  | Delete message → removed for other user              |       |
| 13  | Create/rename/delete channel                         |       |
| 14  | Voice channel join (if mic available)                |       |
| 15  | Server restart → data persists, clients reconnect    |       |

### 2.5 Load / Soak Test (Pre-Production)

```bash
# Sustained connection test — 50 concurrent WebSocket connections for 5 minutes
node -e "
const WebSocket = require('ws');
const N = 50;
const conns = [];
for (let i = 0; i < N; i++) {
  const ws = new WebSocket('ws://TARGET:4000');
  ws.on('open', () => conns.push(ws));
  ws.on('error', e => console.error('conn', i, e.message));
}
setTimeout(() => {
  console.log(conns.length + '/' + N + ' connections alive after 5m');
  conns.forEach(ws => ws.close());
  process.exit(conns.length === N ? 0 : 1);
}, 300000);
"
```

---

## 3. Deployment Procedures

### 3.1 Environment Overview

| Environment    | Purpose                                   | URL                    | Deploy Trigger                |
| -------------- | ----------------------------------------- | ---------------------- | ----------------------------- |
| **Dev**        | Integration testing, feature verification | `dev.harmony.chat`     | Manual push                   |
| **Staging**    | Pre-production validation, manual QA      | `staging.harmony.chat` | Merge to `main`               |
| **Production** | Live users                                | `harmony.chat`         | Manual promotion from staging |

### 3.2 Deploy to Dev

```bash
# On dev host (SSH in)
cd /opt/harmony
git pull origin main
docker compose build
docker compose up -d
docker compose ps  # verify healthy

# Smoke test
curl -sf https://dev.harmony.chat/health
```

### 3.3 Deploy to Staging (via CD)

Automated on merge to `main` (once CI is re-enabled):

1. CI runs: install → build → check → test
2. Docker images built and pushed to GHCR
3. Staging host pulls new images and restarts
4. Post-deploy smoke test runs automatically
5. If smoke test fails → auto-rollback to previous image tag

### 3.4 Deploy to Production

Production deploys are **manual promotions** from staging:

```bash
# 1. Verify staging is healthy
curl -sf https://staging.harmony.chat/health

# 2. Tag the release
git tag v0.x.y
git push origin v0.x.y

# 3. On production host
cd /opt/harmony
docker compose pull  # pulls tagged images
docker compose up -d --remove-orphans

# 4. Verify
curl -sf https://harmony.chat/health

# 5. Monitor for 15 minutes — check logs for errors
docker compose logs -f --tail=100
```

### 3.5 Rollback

```bash
# Immediate rollback to previous version
cd /opt/harmony
docker compose down
git checkout v0.x.y-1  # previous tag
docker compose up -d

# Or if using image tags:
docker compose pull  # edit docker-compose.yml to pin previous tag
docker compose up -d
```

### 3.6 Cloud Worker Deploy (Future)

```bash
cd packages/cloud-worker

# Staging
npx wrangler deploy --env staging

# Production
npx wrangler deploy --env production
```

---

## 4. Operational Procedures

### 4.1 Health Checks

Health endpoint is always on `server_port + 1`:

```bash
curl http://localhost:4001/health
# → {"status":"healthy","uptime":12345}
```

### 4.2 Logs

```bash
# Docker Compose
docker compose logs server --tail=100 -f
docker compose logs ui --tail=100 -f

# Direct container
docker logs harmony-server --tail=100 -f
```

### 4.3 Database Backup

SQLite database lives at the configured `storage.database` path (default: `/var/harmony/data/harmony.db`).

```bash
# Online backup (safe while server is running — WAL mode)
sqlite3 /var/harmony/data/harmony.db ".backup /backups/harmony-$(date +%Y%m%d-%H%M%S).db"

# Verify backup
sqlite3 /backups/harmony-*.db "SELECT count(*) FROM quads;"
```

Recommended: cron job every 6 hours + offsite copy.

### 4.4 Server Restart

```bash
# Graceful restart (Docker Compose)
docker compose restart server

# Full restart with fresh state
docker compose down
docker compose up -d
```

### 4.5 Schema Version Check

```bash
sqlite3 /var/harmony/data/harmony.db "SELECT version FROM schema_version;"
```

---

## 5. Troubleshooting

| Symptom | Likely Cause | Fix |
| --- | --- | --- |
| Health check fails | Server crashed or port conflict | Check logs, restart container |
| WS connection refused | Server not listening, firewall, TLS mismatch | Verify port, check `docker compose ps` |
| `NODE_MODULE_VERSION` error | Node version changed, native modules stale | `npm rebuild` in better-sqlite3 dir |
| SQLite "database is locked" | Multiple processes accessing same DB file | Ensure only one server instance per DB |
| Tests fail with 38 SQLite errors | better-sqlite3 needs rebuild | See "Native Module Issues" above |
| UI loads but can't connect | Wrong `VITE_DEFAULT_SERVER_URL` | Check `.env` or container env vars |
| Docker build fails | Missing package.json in Dockerfile COPY | Check `packages/docker/Dockerfile.server` has all deps |

---

## 6. Configuration Reference

### Environment Variables

| Variable                  | Default                 | Description                        |
| ------------------------- | ----------------------- | ---------------------------------- |
| `HARMONY_PORT`            | `4000`                  | Server WebSocket port              |
| `HARMONY_HOST`            | `0.0.0.0`               | Server bind address                |
| `HARMONY_DB_PATH`         | `./harmony.db`          | SQLite database path               |
| `HARMONY_MEDIA_PATH`      | `./media`               | Media storage directory            |
| `HARMONY_CONFIG`          | `./harmony.config.yaml` | Config file path                   |
| `VITE_DEFAULT_SERVER_URL` | `ws://localhost:4000`   | UI default server URL              |
| `VITE_PORTAL_URL`         | `http://localhost:3000` | Portal URL for UI                  |
| `DISCORD_TOKEN`           | —                       | Discord bot token (migration only) |
| `DISCORD_CLIENT_ID`       | —                       | Discord OAuth (cloud only)         |
| `DISCORD_CLIENT_SECRET`   | —                       | Discord OAuth (cloud only)         |

### Config File

See `harmony.config.example.yaml` for full reference. Key sections:

- `server` — host, port
- `storage` — database path, media path
- `moderation` — rate limiting, raid detection
- `voice` — enable/disable, SFU config
- `limits` — max connections, communities, message size
