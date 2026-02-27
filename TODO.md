# Harmony — Remaining Work

_Updated 2026-02-27. Canonical source for code-level work. Strategy/deployment in `membranes/harmony/plans/beta-release-todo.md`._

---

## ~~MVP Blockers (Batch 1)~~ ✅ All Done (2026-02-26)

- ~~Docker Compose~~ ✅ — Dockerfile, docker-compose.yml, .env.example, harmony.config.example.yaml
- ~~Electron Packaging~~ ✅ — electron-builder.yml, macOS/Windows/Linux targets
- ~~Ban Enforcement~~ ✅ — Server-side ban list, ban/unban handlers, 6 new tests
- ~~PWA Icons~~ ✅ — Purple hexagon SVG, manifest + favicon
- ~~GUIDE.md Audit~~ ✅ — Threads/export marked "Coming soon", voice/docker/downloads caveated

## ~~E2EE~~ ✅ All Done (2026-02-26)

- ~~Server-side MLS key exchange~~ ✅ — Group creation, key package exchange, auto member addition, 11 integration tests
- ~~Always-on E2EE~~ ✅ — Removed `enableE2EE()` toggle, MLS + DM providers auto-created in every client
- ~~DM encryption~~ ✅ — X25519 key exchange, XChaCha20-Poly1305, auto-negotiated on first DM, 6 integration tests

## ~~Threads~~ ✅ Done (2026-02-26)

## ~~Social Recovery~~ ✅ Done (2026-02-26)

## ~~Mobile~~ ✅ Done (2026-02-26)

## ~~Pre-Launch (Batch 2)~~ ✅ All Done (2026-02-26)

- ~~ZCAP Verification~~ ✅ — real chain verification, capability store, DID resolution
- ~~Media Upload & File Sharing~~ ✅ — server handlers, client methods, UI components
- ~~Role Management~~ ✅ — CRUD, admin enforcement, permission system, events
- ~~Channel Pins~~ ✅ — protocol, server, client, 50-pin limit
- ~~Voice, Video & Screen Sharing~~ ✅ — protocol, server, client, E2EE bridge, UI

---

## ~~Tech Debt Batch~~ ✅ Done (2026-02-27)

- ~~TypeScript errors~~ ✅ — resolved all ~4525 errors across monorepo, `pnpm run check` passes (0 errors, 128 warnings)
- ~~Dockerfile cleanup~~ ✅ — deleted `Dockerfile.ui` and `Dockerfile.bot` (only `Dockerfile.server` ships)
- ~~CI prep~~ ✅ — disabled with `if: false`, ready to re-enable; Playwright refs noted for removal
- ~~Skip→Todo conversion~~ ✅ — 25 tests converted from `.skip()` to `.todo()` with descriptive reasons across wire-up, credentials, media, voice, cloud-worker
- ~~Post-launch labelling~~ ✅ — federation & bot-api tests marked "(post-launch)"
- ~~Docs~~ ✅ — RUNBOOK.md (361 LOC), MIGRATION-STRATEGY.md (290 LOC), FEATURES.md updated

## ~~Full-Text Search~~ ✅ Done (2026-02-27)

Search integration fully wired across client, server, and UI (commit `2425add`):

- ~~Wire `ClientSearchIndex` into client~~ ✅ — indexes messages after E2EE decrypt on receive
- ~~Wire `MetadataIndex` into server~~ ✅ — replaced brute-force `string.includes()` in `MessageStore.search()`
- ~~`search.query` handler~~ ✅ — server returns metadata results, client merges with FTS
- ~~Persist `ClientSearchIndex`~~ ✅ — serialization/deserialization support added to client-index.ts
- ~~Wire `SearchOverlay` UI~~ ✅ — store.tsx updated with search integration
- ~~E2EE constraint~~ ✅ — server searches metadata only, full-text is client-side

Tests: 39 passing (up from 35), 4 todo remaining (UI integration tests needing SolidJS context).

---

## Launch Requirements (Code Work)

### 2. Discord Migration — ~~Manual Verification~~ ✅ Verified (2026-02-27)

Playwright tests pass against real Discord server. Bot API, OAuth, migration E2E all verified.

- [x] Manual end-to-end: run `migration-bot` against a real Discord server ✅
- [x] Verify channel/message/role/member mapping completeness ✅
- [x] Import to Harmony server via REST endpoint ✅ (port+1 health/API server)
- [x] Media attachment migration ✅ — attachment download, embed transforms, thread fetching, reaction user lists
- [x] Migration data transforms ✅ — embeds (url/title/desc/thumbnail as RDF), stickers (3 quads each), threads (active+archived auto-merged), reactions (per-user via API)

Files:

- `packages/migration-bot/` — Discord API integration
- `packages/migration/` — export parser, data transform, encryption
- `packages/ui-app/src/migration-client.ts` — UI client
- `packages/server-runtime/src/migration-endpoint.ts` — server endpoint

### 3. Security Hardening ✅ Done (2026-02-27)

- [x] Message size limits on WebSocket ✅ — maxPayload 1MB, server rejects oversized messages
- [x] Input validation: malformed messages ✅ — server rejects missing type, unknown types
- [x] Input validation: all WS handlers ✅ — validateRequiredStrings on all handlers, string length limits
- [x] Input validation: REST endpoints ✅ — OAuth redirect_uri validation, crypto-secure state tokens
- [x] Rate limiting implementation ✅ — per-connection, tested under load
- [x] ZCAP privilege escalation tests ✅ — revoked parent invalidates child capability
- [x] Media upload path traversal ✅ — filename sanitization, content-type validation
- [x] `pnpm audit` ✅ — 0 vulnerabilities (9 fixed via overrides)
- [x] Cloud Worker DO isolation ✅ — communityId validated against DO ID on every operation
- [x] Port conflict fix ✅ — server tests use port 0 (auto-assign)

### 4. Wrangler Configs — ~~Structure~~ ✅ / Resource IDs (needs Josh)

- [x] Added `[env.dev]`, `[env.staging]`, `[env.production]` sections to cloud-worker wrangler.toml ✅
- [x] Created `packages/portal-worker/wrangler.toml` with env sections ✅
- [ ] Replace `REPLACE_WITH_*` placeholders with real CF resource IDs (needs `wrangler d1 create`, etc.)
- [ ] Secrets management: `wrangler secret put` for DISCORD_CLIENT_ID, Stripe keys, etc.

### 5. Environment Config ✅ Done (2026-02-27)

- [x] Created `.env.dev.example`, `.env.staging.example`, `.env.production.example` ✅
- [x] Created `docs/ENVIRONMENT.md` — comprehensive env var reference with setup commands ✅

### 6. CI Pipeline ✅ Done (2026-02-27)

- [x] Re-enabled GitHub Actions — main job active, Playwright job ready (needs secrets)
- [x] Node updated to 24 for native module compatibility
- [x] Playwright separated into own job with Discord secrets from CI

### 7. Billing Integration

- [ ] Stripe usage-based billing for cloud communities
- [ ] Plan exists at workspace `membranes/harmony/plans/billing-plan.md`
- [ ] Feature gating per tier (storage limits, history depth)

### 8. ~~Build System & Cleanup~~ ✅ Mostly Done

- [x] Deleted `packages/docker/Dockerfile.ui` and `packages/docker/Dockerfile.bot` ✅
- [ ] Consider pre-compilation for server packages in Docker image (faster cold start)
- [ ] Packages consumed as TS source via `tsx` — only `ui-app` has a real Vite build

### 9. Electron & Capacitor Build Pipelines

- [ ] Electron: macOS notarization, Windows Authenticode signing, auto-update
- [ ] Capacitor: Android APK signing (currently 3.7MB unsigned), iOS provisioning

### 10. Error Handling & Polish

- [ ] Network offline indicator in UI
- [ ] Graceful reconnection feedback (not just silent reconnect)
- [ ] Server connection drop mid-message — define behavior

---

## Post-Launch

### Federation

Protocol + `FederationManager` exist (319 LOC) but servers can't discover or relay to each other.

- [ ] Server-to-server WebSocket connection
- [ ] Peer discovery mechanism
- [ ] Cross-server message relay
- [ ] Trust model decisions (allow-list? open?)
- [ ] Federation ZCAPs — instance-to-instance capability delegation

### Bot API

`@harmony/bot-api` package exists. All skipped tests marked "(post-launch)".

- [ ] Per-channel scoping
- [ ] Automatic restart with backoff
- [ ] Inbound webhook rate limiting
- [ ] ZCAP epoch re-verification

### Multi-Level ZCAP Delegation

Single-level delegation works (admin → member). Plan specifies deep chains.

- [ ] Admin → Mod → Temp-Mod delegation chains
- [ ] Attenuation enforcement at each level
- [ ] Time-limited capabilities (expiry)
- [ ] Rate-limited capabilities (caveats)
- [ ] User-to-user delegation ("holiday mod")
- [ ] AI agent ZCAPs (scoped agent authorization)

### VC Enhancements

- [ ] E2EE key binding in membership VCs
- [ ] E2EE re-keying on member revocation/ban
- [ ] VC-based admission policies (gate on credential requirements)
- [ ] Cross-community trust networks
- [x] Rich VC portfolio UI — tests implemented 2026-02-27
- [ ] Custom credential types per community

### Community Export/Import

- [ ] Define .hbundle format (encrypted archive of quads + media)
- [ ] CLI `community export` / `community import` commands
- [ ] Desktop UI for export/import

### Friend Finding — Polish

- [ ] QR code display for sharing Harmony ID
- [ ] Contact list persistence in localStorage
- [ ] "Add friend by DID" — paste DID flow

### Rich Embeds

`link-preview.ts` exists (116 LOC) — fetches OpenGraph/meta tags.

- [ ] Render link previews inline in messages
- [ ] YouTube/Twitter/etc. special embed rendering
- [ ] Code block syntax highlighting

### Revenue / Cloud Tiers (beyond basic billing)

- [ ] Custom domain support for Pro tier
- [ ] SSO / enterprise features
- [ ] Admin dashboard for cloud instance management

### Migration Hardening

- [ ] GDPR: filter departed members from migration export
- [ ] Privacy notice template for admins
- [ ] Individual "my data" personal export (GDPR data portability)

### DID Method Expansion

- [ ] `did:web` support
- [ ] `did:plc` support
- [ ] Method-agnostic resolver architecture

---

## Skipped & Todo Tests (31 skip + 88 todo = 119 total)

### Post-launch — not blocking beta (29)

| Package    | Count  | What                                                           |
| ---------- | ------ | -------------------------------------------------------------- |
| federation | 4 todo | Networking (post-launch)                                       |
| bot-api    | 8 todo | Channel scoping, restart, rate limit, ZCAP epoch (post-launch) |
| zcap       | 4 todo | Rate-limited, user-to-user, AI agent, time windows             |
| vc         | 5 todo | Admission policies (3), E2EE key binding (2)                   |
| did        | 3 todo | did:web, did:plc, plugin interface                             |
| cli        | 3 todo | .hbundle export/import/preserve                                |
| governance | 2 todo | Constitutional amendments, quorum                              |

### Infrastructure-dependent — need real credentials (17)

| Package                            | Count   | What                                                    |
| ---------------------------------- | ------- | ------------------------------------------------------- |
| integration-tests/feature-coverage | 14 skip | Entire file skipped (meta-test)                         |
| cloud                              | 2 skip  | Discord OAuth (vitest still skipped, Playwright covers) |
| portal                             | 2 skip  | Discord OAuth (vitest still skipped, Playwright covers) |
| migration-e2e                      | 3 skip  | Discord bot token + OAuth (vitest needs env setup)      |
| migration-bot                      | 0 skip  | Real Discord token tests now pass ✅                    |

### Needs real environment (15)

| Package | Count       | What                                                                                |
| ------- | ----------- | ----------------------------------------------------------------------------------- |
| voice   | 9 skip/todo | SFU integration (3), ZCAP revocation, presence, LiveKit webhooks/reconnect, PiP (2) |
| e2ee    | 3 todo      | MLS re-keying on member revocation                                                  |
| docker  | 3 todo      | Container-specific tests                                                            |

### Search (4 todo)

| Package | Count  | What                                               |
| ------- | ------ | -------------------------------------------------- |
| search  | 4 todo | UI integration tests (need SolidJS render context) |

### UI feature stubs (~20)

| Package        | Count | What                                                        |
| -------------- | ----- | ----------------------------------------------------------- |
| wire-up        | 6     | CreateChannelModal (SolidJS context), reactions (WS mock)   |
| dm             | 5     | DM UI wiring                                                |
| media          | 8     | Integration (4) + gallery/lightbox (2) + download/proxy (2) |
| credentials    | 5     | Portfolio UI components                                     |
| channel-perms  | 3     | Permission UI tests                                         |
| roles          | 3     | Role UI tests                                               |
| voice (ui-app) | 3     | Voice UI tests                                              |
| voice-activity | 3     | Voice activity UI tests                                     |

### Other (4)

| Package        | Count  | What                                                         |
| -------------- | ------ | ------------------------------------------------------------ |
| protocol       | 4 todo | Future message types                                         |
| server-runtime | 1 skip | Import messages edge case                                    |
| migration      | 3 todo | GDPR: opt-out, privacy notice, portable export (post-launch) |
| cloud-worker   | 4 todo | DO integration (miniflare)                                   |

---

## Stats Snapshot (2026-02-27 19:00)

- **Tests:** 2364 passing, 31 skipped, 93 todo, 0 failures
- **Playwright:** 13 passing, 0 skipped (Discord integration)
- **Packages:** 36
- **Total estimated LOC:** ~32,000+
- **Search:** 39 passing, fully integrated
- **TypeScript:** 0 errors, 128 warnings
- **Vulnerabilities:** 0 (`pnpm audit` clean)
