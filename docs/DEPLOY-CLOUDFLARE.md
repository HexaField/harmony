# Deploying Harmony Beta to Cloudflare

Complete guide to deploying Harmony on a fresh Cloudflare organization.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Cloudflare Edge                       │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  CF Pages     │  │  CF Worker    │  │  CF Realtime │  │
│  │  (UI static)  │  │  (cloud-     │  │  SFU (voice/ │  │
│  │               │  │   worker)    │  │   video)     │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                  │          │
│         │          ┌──────┴───────┐          │          │
│         │          │ Durable      │          │          │
│         │          │ Objects      │          │          │
│         │          │ (per-community│          │          │
│         │          │  SQLite)     │          │          │
│         │          └──────┬───────┘          │          │
│         │                 │                  │          │
│  ┌──────┴─────────────────┴──────────────────┴───────┐  │
│  │                    R2 (media)                      │  │
│  └────────────────────────────────────────────────────┘  │
│                                                         │
│  ┌────────────────────────────────────────────────────┐  │
│  │                D1 (portal metadata)                 │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘

Portal runs separately (CF Worker with nodejs_compat, or VPS).
Self-hosted server is optional — users can run their own.
```

## Prerequisites

- **Cloudflare account** on a **paid plan** ($5/mo Workers Paid, or $25/mo for Workers Standard — required for Durable Objects and Realtime SFU)
- **Domain name** — either buy via CF Registrar or add existing domain to CF DNS
- **Node.js 22+** and **pnpm** installed locally
- **Wrangler CLI**: `npm i -g wrangler`
- **Git clone**: `git clone https://github.com/HexaField/harmony.git && cd harmony && pnpm install`

## Step-by-Step Deployment

---

### 1. Cloudflare Account Setup

```bash
# Login to Cloudflare via Wrangler
wrangler login

# Verify authentication
wrangler whoami
```

If creating a **new CF organization** (not personal account):

1. Go to https://dash.cloudflare.com → Create Organization
2. Add a payment method (credit card required for Workers Paid)
3. In Wrangler, specify the account: `wrangler --account-id YOUR_ACCOUNT_ID`

**Tip**: Find your Account ID at https://dash.cloudflare.com → Overview → right sidebar.

---

### 2. Domain Setup

**Option A: Buy via CF Registrar** (simplest)

```
Dashboard → Domain Registration → Register Domain → search "harmony.chat" (or whatever)
```

**Option B: Existing domain**

```
Dashboard → Websites → Add Site → enter domain → update nameservers at registrar
```

Wait for DNS to propagate (usually <5 minutes for CF Registrar, up to 24h for external).

---

### 3. Create Cloudflare Resources

```bash
cd packages/cloud-worker

# Create D1 databases
wrangler d1 create harmony-instances-dev
wrangler d1 create harmony-instances

# Note the database_id from each — you'll need them below

# Create R2 buckets
wrangler r2 bucket create harmony-media-dev
wrangler r2 bucket create harmony-media

# Create KV namespaces (for rate limiting / caching if needed)
wrangler kv namespace create RATE_LIMITS
wrangler kv namespace create RATE_LIMITS --preview
```

---

### 4. Create CF Realtime SFU App

This provides managed WebRTC SFU for voice/video.

```bash
# Via API (Wrangler doesn't have a direct command yet)
curl -X POST "https://rtc.live.cloudflare.com/v1/apps/new" \
  -H "Authorization: Bearer $(wrangler config get oauth-token 2>/dev/null || echo 'USE_API_TOKEN')" \
  -H "Content-Type: application/json" \
  -d '{"name": "harmony-voice"}'
```

**Alternative: Dashboard**

1. Go to https://dash.cloudflare.com → Calls (in sidebar)
2. Create a new Calls application
3. Copy the **App ID** and **App Secret/Token**

If Calls isn't visible, you may need to enable it:

- Workers & Pages → Plans → ensure you're on Workers Paid or Standard
- Or visit https://dash.cloudflare.com/?to=/:account/calls directly

---

### 5. Update `wrangler.toml`

Edit `packages/cloud-worker/wrangler.toml`:

```toml
name = "harmony-cloud"
main = "src/index.ts"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

[vars]
CALLS_APP_ID = ""        # Set via secrets, not here
CALLS_APP_SECRET = ""    # Set via secrets, not here

[durable_objects]
bindings = [
  { name = "COMMUNITY", class_name = "CommunityDurableObject" }
]

[[migrations]]
tag = "v1"
new_sqlite_classes = ["CommunityDurableObject"]

# ── Production ───────────────────────────────────────

[env.production]
name = "harmony-cloud"
routes = [
  { pattern = "api.yourdomain.com/*", zone_name = "yourdomain.com" }
]

[env.production.vars]
CALLS_APP_ID = ""
CALLS_APP_SECRET = ""

[[env.production.d1_databases]]
binding = "DB"
database_name = "harmony-instances"
database_id = "PASTE_YOUR_D1_DATABASE_ID_HERE"

[[env.production.r2_buckets]]
binding = "MEDIA"
bucket_name = "harmony-media"
```

Replace:

- `yourdomain.com` with your actual domain
- `PASTE_YOUR_D1_DATABASE_ID_HERE` with the D1 ID from step 3

---

### 6. Set Secrets

Secrets are encrypted and never visible in config files or dashboard.

```bash
cd packages/cloud-worker

# CF Realtime SFU credentials
wrangler secret put CALLS_APP_ID --env production
# Paste your Calls App ID

wrangler secret put CALLS_APP_SECRET --env production
# Paste your Calls App Secret/Token
```

---

### 7. Deploy Cloud Worker

```bash
cd packages/cloud-worker

# Deploy to production
wrangler deploy --env production

# Verify
curl https://api.yourdomain.com/health
# Should return 404 (expected — it's a WebSocket/DO worker, not HTTP)
```

**Test WebSocket connectivity:**

```bash
# Quick test with wscat
npx wscat -c wss://api.yourdomain.com/ws/test-community
# Should connect and await auth message
```

---

### 8. Deploy UI to Cloudflare Pages

```bash
cd packages/ui-app

# Build the static UI
pnpm build

# Create a Pages project
wrangler pages project create harmony-app

# Deploy
wrangler pages deploy dist --project-name harmony-app
```

**Set up custom domain:**

1. Dashboard → Workers & Pages → harmony-app → Custom Domains
2. Add `app.yourdomain.com`
3. CF auto-creates the DNS record + SSL cert

**Environment variables for Pages** (if the UI needs to know the API URL):

```bash
# In Dashboard → Pages → harmony-app → Settings → Environment Variables
# Add: VITE_API_URL = https://api.yourdomain.com
# Then rebuild
```

Or create `packages/ui-app/.env.production`:

```
VITE_API_URL=https://api.yourdomain.com
VITE_WS_URL=wss://api.yourdomain.com
```

---

### 9. Deploy Portal

The Portal is an Express server that handles identity, OAuth, migration, and discovery. Two options:

#### Option A: CF Worker with `nodejs_compat` (recommended)

The Portal uses `better-sqlite3` which **cannot run in CF Workers**. You'd need to refactor storage to use D1. For beta, Option B is simpler.

#### Option B: VPS / Fly.io (simpler for beta)

```bash
cd packages/portal

# Build Docker image
docker build -t harmony-portal -f Dockerfile ../..

# Run locally to test
docker run -p 3000:3000 \
  -e CORS_ORIGINS="https://app.yourdomain.com" \
  -e PORT=3000 \
  harmony-portal

# Deploy to Fly.io (Sydney region)
fly launch --name harmony-portal --region syd --internal-port 3000
fly secrets set CORS_ORIGINS="https://app.yourdomain.com"
fly deploy
```

**Note**: Fix the Dockerfile CMD — it currently references `packages/cloud/dist/server.js` but should be:

```dockerfile
CMD ["node", "--import", "tsx", "packages/portal/src/server.ts"]
```

Or build with esbuild first and use the compiled output.

**DNS**: Add a CNAME record `portal.yourdomain.com → harmony-portal.fly.dev`

---

### 10. Configure DNS Records

In CF Dashboard → DNS → Records:

| Type  | Name     | Content                     | Proxy      |
| ----- | -------- | --------------------------- | ---------- |
| CNAME | `app`    | `harmony-app.pages.dev`     | Proxied ✅ |
| CNAME | `api`    | _(handled by Worker route)_ | Proxied ✅ |
| CNAME | `portal` | `harmony-portal.fly.dev`    | Proxied ✅ |

The Worker route (`api.yourdomain.com/*`) in wrangler.toml handles API traffic.

---

### 11. OAuth Setup (Optional — for Discord Migration)

#### Discord

1. https://discord.com/developers/applications → New Application
2. Add redirect URL: `https://portal.yourdomain.com/api/oauth/discord/callback`
3. Note Client ID + Client Secret
4. Set as Portal env vars: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`

#### GitHub (optional)

1. https://github.com/settings/developers → New OAuth App
2. Callback: `https://portal.yourdomain.com/api/oauth/github/callback`
3. Set: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`

#### Google (optional)

1. https://console.cloud.google.com → APIs & Services → Credentials
2. Callback: `https://portal.yourdomain.com/api/oauth/google/callback`
3. Set: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

---

### 12. Stripe Setup (Optional — for billing)

1. https://dashboard.stripe.com → get publishable + secret keys
2. Create products/prices for your tiers
3. Set as Portal env vars: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
4. Add webhook endpoint: `https://portal.yourdomain.com/api/billing/webhook`

---

## Post-Deployment Verification

### Quick Smoke Test

```bash
DOMAIN="yourdomain.com"

# 1. UI loads
curl -s "https://app.$DOMAIN" | head -1
# Should return HTML

# 2. Worker responds to WebSocket
npx wscat -c "wss://api.$DOMAIN/ws/smoke-test" -x '{"type":"ping"}'
# Should connect

# 3. Portal health
curl -s "https://portal.$DOMAIN/health"
# Should return {"status":"ok"}

# 4. Create identity via Portal
curl -s -X POST "https://portal.$DOMAIN/api/identity/create" \
  -H "Content-Type: application/json" \
  -d '{"displayName":"TestUser"}'
# Should return identity with DID
```

### Full Verification

1. Open `https://app.yourdomain.com` in browser
2. Complete onboarding (creates DID + mnemonic)
3. Create a community → should create Durable Object
4. Send a message → should persist in DO SQLite
5. Open in second browser/incognito → join same community
6. Verify bidirectional messaging
7. Test voice channel (if CF Calls provisioned)

---

## Cost Estimates

### Cloudflare (monthly)

| Resource                | Free Tier        | Paid Plan           | Estimate (beta, ~50 users)         |
| ----------------------- | ---------------- | ------------------- | ---------------------------------- |
| Workers requests        | 100K/day         | 10M included        | $0                                 |
| Durable Object requests | —                | $0.15/million       | ~$0.50                             |
| Durable Object storage  | —                | $0.20/GB            | ~$0.10                             |
| Durable Object duration | —                | $12.50/million GB-s | ~$1.00                             |
| D1 reads/writes         | 5M/day           | 25B reads included  | $0                                 |
| R2 storage              | 10GB free        | $0.015/GB           | $0 (under 10GB)                    |
| R2 operations           | 10M Class A free | $4.50/million       | $0                                 |
| CF Pages                | Unlimited        | Unlimited           | $0                                 |
| **CF Realtime SFU**     | **1TB/mo free**  | **$0.05/GB after**  | **$0** (audio only)                |
| **Subtotal**            |                  |                     | **~$5–7/mo** (plan fee + DO usage) |

### Portal (if on Fly.io)

| Resource                | Free Tier       | Estimate                   |
| ----------------------- | --------------- | -------------------------- |
| shared-cpu-1x, 256MB    | 3 free machines | $0                         |
| Persistent volume (1GB) | 3GB free        | $0                         |
| **Subtotal**            |                 | **$0** (fits in free tier) |

### Total Beta Cost: **~$5–7/month**

This assumes audio-only voice and <50 concurrent users. Video would add ~$0.05/GB egress through CF SFU.

---

## Operational Notes

### Monitoring

- **Workers Analytics**: Dashboard → Workers & Pages → harmony-cloud → Analytics
- **DO Metrics**: Dashboard → Workers & Pages → harmony-cloud → Durable Objects
- **R2 Metrics**: Dashboard → R2 → harmony-media → Metrics
- **Logs**: `wrangler tail --env production` for live Worker logs

### Updating

```bash
# Pull latest code
git pull origin main

# Deploy Worker update
cd packages/cloud-worker && wrangler deploy --env production

# Deploy UI update
cd packages/ui-app && pnpm build && wrangler pages deploy dist --project-name harmony-app

# Portal update (Fly.io)
cd packages/portal && fly deploy
```

### Rollback

```bash
# Workers: previous versions auto-retained
wrangler rollback --env production

# Pages: Dashboard → Deployments → click previous → "Rollback to this deployment"
```

### Durable Object Data

DO SQLite data persists across deployments. To inspect:

```bash
# List DOs
wrangler d1 execute harmony-instances --command "SELECT * FROM _cf_DO"

# For individual DO data, you'd need to add an admin endpoint
# or use wrangler tail to observe
```

### Backup Strategy

- **DO SQLite**: No built-in export. Add an admin endpoint that dumps community data.
- **R2**: Use `wrangler r2 object get` or S3-compatible API for backups.
- **D1**: `wrangler d1 export harmony-instances --output backup.sql`

---

## Security Checklist

- [ ] CALLS_APP_SECRET stored as Wrangler secret (not in wrangler.toml)
- [ ] OAuth client secrets stored as env vars, not in code
- [ ] Stripe webhook secret configured
- [ ] CORS_ORIGINS restricted to your actual domains
- [ ] Portal auth middleware enabled (it is by default)
- [ ] CF WAF rules enabled (Dashboard → Security → WAF)
- [ ] Rate limiting configured (already in cloud-worker: 50 msg/10s)
- [ ] R2 bucket is private (no public access unless explicitly enabled)
- [ ] Custom domain SSL/TLS set to "Full (strict)" in CF dashboard

---

## Troubleshooting

### "Durable Objects are not available" error

→ You need Workers Paid plan ($5/mo minimum). Free plan doesn't include DOs.

### WebSocket connection fails

→ Check Worker route matches your domain. `wrangler tail` to see errors.

### "CALLS_APP_ID is empty" in voice

→ Secrets not set. Run `wrangler secret put CALLS_APP_ID --env production` again.

### Portal CORS errors

→ Set `CORS_ORIGINS` env var to include your Pages domain: `https://app.yourdomain.com`

### DO SQLite "no such table" errors

→ Migration not applied. Check `[[migrations]]` in wrangler.toml. Redeploy with `wrangler deploy`.

### Users can't join each other's communities

→ Both clients must connect to the same Worker URL and use the same DO name (community ID). The UI's "Add Server" should point to `wss://api.yourdomain.com`.

### Self-hosted server users want to federate

→ Federation is not implemented for beta. Self-hosted and cloud are separate islands.
