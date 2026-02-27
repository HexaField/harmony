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

## Launch Requirements (Code Work)

### 1. Full-Text Search — Wire Integration

`@harmony/search` package exists (541 LOC, 35 passing tests): tokenizer, query parser, client-side inverted index, server metadata index, snippet extraction. The core search engine works. Remaining work is **integration wiring**.

Separately, `MessageStore.search()` in the server does brute-force `string.includes()` — this should be replaced by the search package's metadata index.

- [ ] Wire `ClientSearchIndex` into client message receive pipeline (index after E2EE decrypt)
- [ ] Wire `MetadataIndex` into server `MessageStore` (replace brute-force search)
- [ ] Implement `search.query` handler to merge server metadata results with client FTS results
- [ ] Persist `ClientSearchIndex` to localStorage/IndexedDB (survive page reload)
- [ ] Wire `SearchOverlay` UI component to `@harmony/search` (currently not connected)
- [ ] Handle E2EE constraint: server can only search metadata (author, channel, timestamp); full-text is client-side only

Files:

- `packages/search/src/client-index.ts` — client-side inverted index (217 LOC)
- `packages/search/src/metadata-index.ts` — server-side metadata index (142 LOC)
- `packages/search/src/tokenizer.ts` — text tokenizer (116 LOC)
- `packages/search/src/query-parser.ts` — query parser (24 LOC)
- `packages/search/src/snippet.ts` — result snippet extraction (35 LOC)
- `packages/ui-app/src/components/Search/index.ts` — UI overlay component
- `packages/server/src/index.ts:204-258` — brute-force MessageStore.search() to replace

### 2. Discord Migration — Manual Verification

Full pipeline exists and is mostly/completely working. Code may be complete — needs manual verification.

- [ ] Manual end-to-end: run `migration-bot` against a real Discord server
- [ ] Verify channel/message/role/member mapping completeness
- [ ] Verify media attachment migration
- [ ] Confirm UI flow in browser (migration-client → server endpoint → community creation)
- [ ] Migration data transforms: emoji, sticker, thread handling (3 todo tests in `migration.spec.ts`)

Files:

- `packages/migration-bot/` — Discord API integration
- `packages/migration/` — export parser, data transform, encryption
- `packages/ui-app/src/migration-client.ts` — UI client
- `packages/server-runtime/src/migration-endpoint.ts` — server endpoint

### 3. Security Hardening (code-level)

- [ ] Input validation audit: all WS message handlers in `packages/server/src/index.ts`
- [ ] Input validation: all REST endpoints in `packages/portal/src/routes/`
- [ ] Message size limits on WebSocket (currently unbounded?)
- [ ] Rate limiting implementation — verify it works under sustained load (1 flaky test: `server.spec.ts > Rate Limiting`)
- [ ] ZCAP privilege escalation tests — craft delegations with widened scope
- [ ] Media upload: verify no path traversal, content-type spoofing (R2 storage)
- [ ] `pnpm audit` — check for known CVEs in dependencies
- [ ] Cloud Worker DO isolation — verify no cross-community data access

### 4. Wrangler Configs — Real Resource IDs

- [ ] `packages/cloud-worker/wrangler.toml` — `database_id = "placeholder"` needs real CF D1 ID
- [ ] Add `[env.dev]`, `[env.staging]`, `[env.production]` sections to cloud-worker wrangler.toml
- [ ] `packages/portal-worker/` — real D1/R2/KV bindings for dev/staging/prod
- [ ] Secrets management: VP signing keys, DISCORD_CLIENT_ID, etc.

### 5. Environment Config

- [ ] Create `.env.dev`, `.env.staging`, `.env.production` (currently only `.env.example`)
- [ ] Document required env vars per deployment target (cloud vs self-hosted)

### 6. CI Pipeline

- [ ] Re-enable GitHub Actions (`if: false` currently)
- [ ] Update CI Node version from 22 to 24 (native modules: mediasoup, better-sqlite3)
- [ ] Remove Playwright references if not needed for unit/integration tests

### 7. Billing Integration

- [ ] Stripe usage-based billing for cloud communities
- [ ] Plan exists at workspace `membranes/harmony/plans/billing-plan.md`
- [ ] Feature gating per tier (storage limits, history depth)

### 8. Build System & Cleanup

- [ ] Delete `packages/docker/Dockerfile.ui` and `packages/docker/Dockerfile.bot` (not shipping)
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

## Skipped & Todo Tests (37 skip + 88 todo = 125 total)

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

### Infrastructure-dependent — need real credentials (24)

| Package                            | Count   | What                                    |
| ---------------------------------- | ------- | --------------------------------------- |
| integration-tests/feature-coverage | 14 skip | Entire file skipped (meta-test)         |
| cloud                              | 2 skip  | Discord OAuth (needs DISCORD_CLIENT_ID) |
| portal                             | 2 skip  | Discord OAuth (needs real credentials)  |
| migration-e2e                      | 4 skip  | Bot token + OAuth flow                  |
| migration-bot                      | 2 skip  | Discord API credentials                 |

### Needs real environment (15)

| Package | Count       | What                                                                                |
| ------- | ----------- | ----------------------------------------------------------------------------------- |
| voice   | 9 skip/todo | SFU integration (3), ZCAP revocation, presence, LiveKit webhooks/reconnect, PiP (2) |
| e2ee    | 3 todo      | MLS re-keying on member revocation                                                  |
| docker  | 3 todo      | Container-specific tests                                                            |

### Search integration (8 todo)

| Package | Count  | What                                                          |
| ------- | ------ | ------------------------------------------------------------- |
| search  | 8 todo | Client indexing + server merge (4), search UI integration (4) |

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

| Package        | Count  | What                              |
| -------------- | ------ | --------------------------------- |
| protocol       | 4 todo | Future message types              |
| server-runtime | 1 skip | Import messages edge case         |
| migration      | 3 todo | Emoji, sticker, thread transforms |
| cloud-worker   | 4 todo | DO integration (miniflare)        |

---

## Stats Snapshot (2026-02-27)

- **Tests:** 2332 passing, 37 skipped, 88 todo, 1 flaky failure
- **Packages:** 36
- **Total estimated LOC:** ~32,000+
