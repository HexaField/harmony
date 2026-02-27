# Environment Variables Reference

## Deployment Targets

### Self-Hosted (Docker)

Configured via `harmony.config.yaml` or environment variables.

| Variable                | Required    | Default   | Description                              |
| ----------------------- | ----------- | --------- | ---------------------------------------- |
| `HARMONY_PORT`          | No          | `4000`    | WebSocket server port                    |
| `HARMONY_HOST`          | No          | `0.0.0.0` | Bind address                             |
| `HARMONY_DATA_DIR`      | No          | `./data`  | SQLite + media storage directory         |
| `HARMONY_ADMIN_DID`     | Recommended | —         | DID of the server admin (gets root ZCAP) |
| `DISCORD_CLIENT_ID`     | No          | —         | For Discord OAuth linking (optional)     |
| `DISCORD_CLIENT_SECRET` | No          | —         | For Discord OAuth linking (optional)     |
| `DISCORD_REDIRECT_URI`  | No          | —         | OAuth callback URL                       |

### Cloud Workers (Cloudflare)

Configured via `wrangler secret put <NAME>` or CF dashboard.

#### Portal Worker

| Variable/Binding        | Type   | Description                           |
| ----------------------- | ------ | ------------------------------------- |
| `DB`                    | D1     | User directory, sessions, OAuth state |
| `MEDIA`                 | R2     | Portal-level media (avatars, etc.)    |
| `SESSIONS`              | KV     | Session tokens                        |
| `DISCORD_CLIENT_ID`     | Secret | Discord OAuth app ID                  |
| `DISCORD_CLIENT_SECRET` | Secret | Discord OAuth app secret              |
| `DISCORD_REDIRECT_URI`  | Secret | OAuth callback URL                    |

#### Cloud Worker

| Variable/Binding        | Type   | Description                    |
| ----------------------- | ------ | ------------------------------ |
| `COMMUNITY`             | DO     | CommunityDurableObject binding |
| `DB`                    | D1     | Instance registry              |
| `MEDIA`                 | R2     | Community media storage        |
| `STRIPE_SECRET_KEY`     | Secret | Stripe API key (for billing)   |
| `STRIPE_WEBHOOK_SECRET` | Secret | Stripe webhook verification    |

### Client Apps (Electron / Capacitor / PWA)

Configured at build time via Vite `.env` files.

| Variable                  | Description                                                     |
| ------------------------- | --------------------------------------------------------------- |
| `VITE_DEFAULT_SERVER_URL` | Default WebSocket server URL (e.g., `wss://cloud.harmony.chat`) |
| `VITE_PORTAL_URL`         | Portal URL for OAuth, directory, invites                        |
| `VITE_CLOUD_API_URL`      | Cloud API URL for provisioning                                  |

## Secrets Management

**Local dev:** `.env.test` (gitignored) **CI:** GitHub Actions secrets (Settings → Secrets → Actions) **Cloud Workers:** `wrangler secret put <NAME> --env <env>`

### Required Secrets per Environment

| Secret                  | Dev       | Staging   | Production |
| ----------------------- | --------- | --------- | ---------- |
| `DISCORD_CLIENT_ID`     | ✅        | ✅        | ✅         |
| `DISCORD_CLIENT_SECRET` | ✅        | ✅        | ✅         |
| `STRIPE_SECRET_KEY`     | ✅ (test) | ✅ (test) | ✅ (live)  |
| `STRIPE_WEBHOOK_SECRET` | ✅        | ✅        | ✅         |
| `CF_API_TOKEN`          | CI only   | CI only   | CI only    |

## Setup Commands

```bash
# Create CF resources for dev
wrangler d1 create harmony-instances-dev
wrangler d1 create harmony-portal-dev
wrangler r2 bucket create harmony-media-dev
wrangler r2 bucket create harmony-portal-media-dev
wrangler kv namespace create SESSIONS --env dev

# Set secrets for dev
wrangler secret put DISCORD_CLIENT_ID --env dev
wrangler secret put DISCORD_CLIENT_SECRET --env dev
wrangler secret put STRIPE_SECRET_KEY --env dev

# Deploy to dev
wrangler deploy --env dev -c packages/cloud-worker/wrangler.toml
wrangler deploy --env dev -c packages/portal-worker/wrangler.toml
```
