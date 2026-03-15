# Harmony Alpha Deployment Guide

Step-by-step guide to deploying the alpha stack: Portal (CF Workers) + Web Client (CF Pages).

**What you'll create:**

- `portal.harmony.buzz` — Harmony Portal (CF Worker + D1 + KV + R2)
- `app.harmony.buzz` — Harmony Web Client (CF Pages, static SPA)
- DNS records on `harmony.buzz`

**Prerequisites:**

- A Cloudflare account (free plan works for alpha)
- `harmony.buzz` domain added to your Cloudflare account (or whichever domain you're using)
- Node.js 22 installed
- Discord Developer Application (for OAuth)

---

## Part 1: Cloudflare Account & Domain Setup

### 1.1 Add your domain to Cloudflare

If `harmony.buzz` isn't already on Cloudflare:

1. Go to https://dash.cloudflare.com
2. Click **"Add a site"** → enter `harmony.buzz`
3. Select the **Free** plan
4. Cloudflare gives you two nameservers (e.g. `adam.ns.cloudflare.com`, `bella.ns.cloudflare.com`)
5. Go to your domain registrar and **replace the existing nameservers** with the Cloudflare ones
6. Wait for propagation (usually 5–30 minutes, can take up to 24h)
7. Cloudflare dashboard will show the domain as **Active** once propagation completes

### 1.2 Install Wrangler CLI

```bash
npm install -g wrangler
```

### 1.3 Authenticate Wrangler

```bash
wrangler login
```

This opens a browser window → click **Allow** → Wrangler stores an OAuth token locally.

Verify:

```bash
wrangler whoami
```

---

## Part 2: Create Cloudflare Resources

### 2.1 Create D1 Database

```bash
wrangler d1 create harmony-portal
```

Output will include:

```
✅ Successfully created DB 'harmony-portal'

database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Save the `database_id`** — you'll need it for `wrangler.toml`.

### 2.2 Create KV Namespace

```bash
wrangler kv namespace create KV
```

Output:

```
✅ Successfully created KV namespace "harmony-portal-KV"

id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

**Save the `id`.**

### 2.3 Create R2 Bucket

```bash
wrangler r2 bucket create harmony-portal-exports
```

### 2.4 Initialize D1 Schema

The schema file is at `packages/portal-worker/src/d1-schema.ts`. Extract the SQL and apply it:

```bash
cd ~/Desktop/harmony

# Create a schema.sql file from the TypeScript source
node -e "
const fs = require('fs');
const src = fs.readFileSync('packages/portal-worker/src/d1-schema.ts', 'utf8');
const match = src.match(/export const SCHEMA_SQL = \`([\s\S]*?)\`/);
if (match) fs.writeFileSync('/tmp/harmony-portal-schema.sql', match[1]);
else { console.error('Could not extract schema'); process.exit(1); }
"

# Apply to D1
wrangler d1 execute harmony-portal --file=/tmp/harmony-portal-schema.sql
```

Verify:

```bash
wrangler d1 execute harmony-portal --command="SELECT name FROM sqlite_master WHERE type='table'"
```

You should see: `identity_links`, `invites`, `directory`, `export_metadata`.

---

## Part 3: Discord OAuth App

1. Go to https://discord.com/developers/applications
2. Click **"New Application"** → name it `Harmony`
3. Go to **OAuth2** tab
4. Copy the **Client ID** and **Client Secret**
5. Add a redirect URI: `https://portal.harmony.buzz/api/oauth/discord/callback`
6. Save

You'll set these as secrets in Part 4.

---

## Part 4: Deploy Portal (CF Worker)

### 4.1 Update wrangler.toml

Edit `packages/portal-worker/wrangler.toml`:

```toml
name = "harmony-portal"
main = "src/worker.ts"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

[vars]
ALLOWED_ORIGINS = "https://app.harmony.buzz,https://portal.harmony.buzz"

[[d1_databases]]
binding = "DB"
database_name = "harmony-portal"
database_id = "<YOUR_D1_DATABASE_ID>"

[[r2_buckets]]
binding = "EXPORTS"
bucket_name = "harmony-portal-exports"

[[kv_namespaces]]
binding = "KV"
id = "<YOUR_KV_NAMESPACE_ID>"
```

**Key changes from the template:**

- `main` → `src/worker.ts` (the CF Workers entry point — we'll create this)
- Bindings match what the code expects: `DB`, `EXPORTS`, `KV`
- Remove the `MEDIA`, `SESSIONS`, `RELAY` bindings (mismatches from the template)
- Remove the dev/staging/production env blocks (not needed yet)

### 4.2 Set Secrets

```bash
cd ~/Desktop/harmony/packages/portal-worker

wrangler secret put DISCORD_CLIENT_ID
# paste your Discord client ID, press Enter

wrangler secret put DISCORD_CLIENT_SECRET
# paste your Discord client secret, press Enter

wrangler secret put DISCORD_REDIRECT_URI
# paste: https://portal.harmony.buzz/api/oauth/discord/callback
```

### 4.3 Deploy

```bash
cd ~/Desktop/harmony/packages/portal-worker
wrangler deploy
```

If it complains about the entry point, see **Part 6: Troubleshooting**.

### 4.4 Add Custom Domain

1. Go to Cloudflare dashboard → **Workers & Pages** → `harmony-portal`
2. Click **Settings** → **Triggers** → **Custom Domains**
3. Add `portal.harmony.buzz`
4. Cloudflare auto-creates DNS records and provisions SSL

Verify:

```bash
curl https://portal.harmony.buzz/health
```

Should return: `{"status":"ok"}`

---

## Part 5: Deploy Web Client (CF Pages)

### 5.1 Build the SPA

```bash
cd ~/Desktop/harmony/packages/ui-app

# Set portal URL at build time
VITE_PORTAL_URL=https://portal.harmony.buzz pnpm build
```

Output goes to `packages/ui-app/dist/`.

### 5.2 Option A: Deploy via Wrangler (Direct Upload)

```bash
wrangler pages deploy packages/ui-app/dist --project-name=harmony-app
```

First time, Wrangler will create the Pages project.

### 5.3 Option B: Deploy via CF Dashboard (Git Integration)

1. Go to Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages**
2. Connect your GitHub repo (`HexaField/harmony`)
3. Configure:
   - **Build command:** `cd packages/ui-app && VITE_PORTAL_URL=https://portal.harmony.buzz pnpm build`
   - **Build output directory:** `packages/ui-app/dist`
   - **Root directory:** `/` (monorepo root so pnpm workspace resolves)
4. Deploy

Option A is simpler for now. Option B gives you auto-deploy on push.

### 5.4 Add Custom Domain

1. Go to Cloudflare dashboard → **Workers & Pages** → `harmony-app`
2. Click **Custom domains** → **Set up a custom domain**
3. Enter `app.harmony.buzz`
4. Cloudflare provisions DNS + SSL automatically

Verify:

```bash
curl -I https://app.harmony.buzz
```

Should return `200 OK` with your SPA's `index.html`.

---

## Part 6: DNS Summary

After setup, your Cloudflare DNS for `harmony.buzz` should have:

| Type  | Name   | Content               | Proxy |
| ----- | ------ | --------------------- | ----- |
| CNAME | portal | (auto — Worker route) | ✅    |
| CNAME | app    | (auto — Pages)        | ✅    |

Both are auto-created when you add custom domains in Parts 4.4 and 5.4.

Optionally, add an A/CNAME record for `harmony.buzz` itself pointing to a landing page (could be another CF Pages project, or a redirect rule to `app.harmony.buzz`).

---

## Part 7: Verify the Full Stack

### Health check

```bash
curl https://portal.harmony.buzz/health
# → {"status":"ok"}
```

### OAuth flow

1. Open `https://app.harmony.buzz` in a browser
2. Create an identity (happens client-side)
3. In settings or onboarding, click "Link Discord"
4. Should redirect to Discord OAuth → back to portal callback → back to app

### Invite flow

1. From a self-hosted server, create a community
2. Create an invite (once invite UI is wired)
3. Share `https://portal.harmony.buzz/invite/<code>` with a friend
4. Friend opens it → resolves to the server endpoint → connects via `app.harmony.buzz`

---

## Part 8: Self-Hosted Server (For Community Hosts)

The web client connects to self-hosted Harmony servers. Community hosts need to run one:

### Docker (recommended)

```bash
# Create a directory for your server
mkdir harmony-server && cd harmony-server

# Create config
cat > harmony.config.yaml << 'EOF'
host: 0.0.0.0
port: 4000
healthPort: 4001
backup:
  enabled: true
  intervalHours: 168
  retainCount: 4
EOF

# Create docker-compose.yml
cat > docker-compose.yml << 'EOF'
services:
  harmony:
    image: ghcr.io/hexafield/harmony-server:latest
    ports:
      - "4000:4000"
      - "4001:4001"
    volumes:
      - harmony-data:/var/harmony/data
      - ./harmony.config.yaml:/etc/harmony/config.yaml:ro
    environment:
      - HARMONY_CONFIG=/etc/harmony/config.yaml
      - JWT_SECRET=<GENERATE_A_RANDOM_SECRET>
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:4001/health"]
      interval: 30s
      timeout: 5s

volumes:
  harmony-data:
EOF

# Start
docker compose up -d
```

### Standalone (no Docker)

```bash
cd ~/Desktop/harmony
NODE_ENV=production JWT_SECRET=<secret> node --import tsx packages/server-runtime/bin/harmony-server.js
```

Server listens on `0.0.0.0:4000` (WebSocket) and `localhost:4001` (health).

### Exposing to the internet

Community hosts need their server reachable. Options:

- **Tailscale** — easiest, no port forwarding needed, share the Tailscale IP
- **Reverse proxy** (nginx/Caddy) — for a public domain with SSL
- **Port forwarding** — router config, dynamic DNS

---

## Checklist

- [ ] Domain `harmony.buzz` active on Cloudflare
- [ ] D1 database created + schema applied
- [ ] KV namespace created
- [ ] R2 bucket created
- [ ] Discord OAuth app created (client ID + secret + redirect URI)
- [ ] `wrangler.toml` updated with real IDs
- [ ] Secrets set (`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`)
- [ ] Portal deployed to CF Workers
- [ ] `portal.harmony.buzz` custom domain added
- [ ] Portal health check returns `{"status":"ok"}`
- [ ] Web client built with `VITE_PORTAL_URL=https://portal.harmony.buzz`
- [ ] Web client deployed to CF Pages
- [ ] `app.harmony.buzz` custom domain added
- [ ] Web client loads in browser
- [ ] OAuth flow works end-to-end
- [ ] At least one self-hosted server running and reachable

---

## Known Issues to Fix Before Deploy

1. **Portal worker needs a `fetch` entry point** — `src/index.ts` only re-exports types/functions. Need a `src/worker.ts` that implements the CF Workers `fetch()` handler wrapping `handleRequest()`. I (Hex) will create this.

2. **Binding name mismatches in wrangler.toml template** — template had `MEDIA`/`SESSIONS`/`RELAY` but code expects `DB`/`EXPORTS`/`KV`. Fixed in the config above.

3. **`DISCORD_REDIRECT_URI` env var** — code uses `env.DISCORD_REDIRECT_URI` but it's not in the `PortalWorkerEnv` type as a var (it's a secret). Works fine, just a type issue.

4. **Web client `VITE_PORTAL_URL`** — needs to be wired into all portal API calls (onboarding, settings, invite resolution). Some may still use hardcoded `http://localhost:3000`.

5. **Docker image not published** — `ghcr.io/hexafield/harmony-server:latest` doesn't exist yet. Need to build and push, or use the Dockerfile directly.
