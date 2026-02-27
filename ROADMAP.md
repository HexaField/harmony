# Harmony — Roadmap & Feature Status

_Single source of truth. Merged from FEATURES.md, TODO.md, and beta-release-todo.md._ _Updated 2026-02-27 22:35 AEDT._

---

## Codebase Snapshot

| Metric             | Value                                 |
| ------------------ | ------------------------------------- |
| Packages           | 36                                    |
| Estimated LOC      | ~32,000+                              |
| Vitest passing     | 2,364                                 |
| Vitest skipped     | 10                                    |
| Vitest todo        | 114                                   |
| Playwright passing | 13 (Discord integration)              |
| Test matrix        | 128 ✅ / 0 ❌ / 3 ⚠️ / 16 ⊘           |
| TypeScript errors  | 0                                     |
| Oxlint warnings    | 7 (SolidJS `let ref` false positives) |
| Vulnerabilities    | 0                                     |
| UI bundle size     | 349 KB                                |
| Docker image       | 739 MB                                |
| Android APK        | 3.7 MB (unsigned)                     |

---

## Deployment Targets

| Target           | Description                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------- |
| **Electron**     | Desktop app — embedded `server-runtime` in main process, `ui-app` in BrowserWindow renderer |
| **Local Server** | Self-hosted `server-runtime` daemon (SQLite-backed), Docker distribution                    |
| **Web UI**       | Browser SPA — same `ui-app` build, connects to cloud or self-hosted server                  |
| **Portal**       | `portal-worker` on Cloudflare (D1, R2, KV) — identity, directory, invite, OAuth             |
| **Cloud Server** | `cloud-worker` — Durable Objects (one per community), DO SQLite, Hibernatable WS            |
| **Mobile**       | Capacitor (Android) + PWA — same `ui-app` build                                             |

> **Important:** Electron, Web UI, and Mobile all share the same SolidJS `ui-app` renderer. All UI features (message views, DMs, threads, search, voice controls, migration wizard, etc.) are available across all three. The columns below mark features as ➖ only where the feature genuinely does not apply to that target (e.g. PWA service worker doesn't apply to Electron, file-based config doesn't apply to browser).

---

## Feature Matrix

### Legend

| Symbol | Meaning                                           |
| ------ | ------------------------------------------------- |
| ✅     | Fully implemented and tested                      |
| 🔧     | Implemented, not fully wired or tested            |
| 📋     | Stub/interface only — code exists, not functional |
| ❌     | Not implemented                                   |
| ➖     | Not applicable to this target                     |

### Identity & Authentication

| Feature                                              | Lib | Server | UI  | Portal | Cloud | Mobile-specific |
| ---------------------------------------------------- | --- | ------ | --- | ------ | ----- | --------------- |
| DID:key creation + resolution                        | ✅  | ✅     | ✅  | ✅     | ✅    | ✅              |
| DID:web / DID:plc support                            | ❌  | ❌     | ❌  | ❌     | ❌    | ❌              |
| Identity persistence (config file — Electron/server) | ✅  | ✅     | ➖  | ➖     | ➖    | ➖              |
| Identity persistence (localStorage — browser/mobile) | ➖  | ➖     | ✅  | ➖     | ➖    | ✅              |
| Mnemonic backup (BIP-39) + recovery                  | ✅  | ✅     | ✅  | ➖     | ➖    | ✅              |
| Social recovery (guardian setup + flow)              | 🔧  | ➖     | ✅  | ➖     | ✅    | ✅              |
| VP-based authentication (handshake)                  | ✅  | ✅     | ✅  | ➖     | ✅    | ✅              |
| Biometric lock                                       | ➖  | ➖     | ➖  | ➖     | ➖    | ✅              |
| Discord OAuth linking                                | ➖  | ➖     | ✅  | ✅     | ✅    | 🔧              |
| Display name + profile                               | ✅  | ✅     | ✅  | ✅     | ✅    | ✅              |
| Pseudonym generation (deterministic)                 | ✅  | ✅     | ✅  | ➖     | ➖    | ✅              |

### Verifiable Credentials

| Feature | Lib | Server | UI | Notes |
| --- | --- | --- | --- | --- |
| VC issuance (membership credentials) | ✅ | ✅ | ➖ | `VCService.issue()` — 62 tests |
| VC verification (signature check) | ✅ | ✅ | ➖ | `VCService.verify()` |
| VC revocation (revocation store) | ✅ | 🔧 | ➖ | `MemoryRevocationStore` works; needs persistent store (SQLite/DO) |
| Credential type registry | 📋 | ➖ | 📋 | `CredentialTypeRegistry` class (145 LOC) — not wired to server |
| Custom credential types per community | ❌ | ❌ | ❌ | Admin defines required VC types; registry + server + UI needed |
| VC portfolio UI | ➖ | ➖ | 📋 | `CredentialPortfolio.tsx`, `CredentialDetail.tsx` exist — not wired |
| Issue credential UI | ➖ | ➖ | 📋 | `IssueCredential.tsx` exists — not wired |
| Credential type editor UI | ➖ | ➖ | 📋 | `CredentialTypeEditor.tsx` exists — not wired |
| Reputation engine | 📋 | ➖ | 📋 | `ReputationEngine` class (178 LOC), `ReputationCard.tsx` — not wired |
| Cross-community trust | 📋 | ➖ | ➖ | `CrossCommunityService` class (32 LOC) — stub |
| VC-based admission policies | ❌ | ❌ | ❌ | Gate `community.join` on required VCs |
| E2EE key binding in VCs | ❌ | ❌ | ❌ | Embed X25519 public key in membership VC |

### ZCAP (Authorization Capabilities)

| Feature | Lib | Server | UI | Notes |
| --- | --- | --- | --- | --- |
| Root capability creation | ✅ | ✅ | ➖ | `ZCAPService.createRoot()` |
| Single-level delegation (admin → member) | ✅ | ✅ | ➖ | `ZCAPService.delegate()` |
| Chain verification (cryptographic) | ✅ | ✅ | ➖ | `ZCAPService.verifyInvocation()` |
| Action scope checking | ✅ | ✅ | ➖ | Enforced server-side for all mutations |
| Revocation checking | ✅ | ✅ | ➖ | Revoked parent invalidates child |
| Multi-level delegation chains | ❌ | ❌ | ❌ | Admin → Mod → Temp-Mod; recursive verification |
| Time-limited capabilities | ❌ | ❌ | ❌ | `Caveat` interface has `expires` field — not enforced |
| Rate-limited capabilities (caveats) | ❌ | ❌ | ❌ | Counter storage + enforcement |
| User-to-user delegation | ❌ | ❌ | ❌ | Members delegate to other members without admin |
| AI agent ZCAPs | ❌ | ❌ | ❌ | Agent DIDs + constrained scope templates |
| Delegation manager UI | ➖ | ➖ | 📋 | `DelegationManager.tsx` exists — not wired |

### Messaging

| Feature                        | Lib | Server | UI  |
| ------------------------------ | --- | ------ | --- | ---------------------------------------------------------- |
| Send / edit / delete           | ✅  | ✅     | ✅  |
| Typing indicators              | ✅  | ✅     | ✅  |
| Reactions (add/remove)         | ✅  | ✅     | ✅  |
| Message history (sync.request) | ✅  | ✅     | ✅  |
| Lamport clock ordering (CRDT)  | ✅  | ✅     | ✅  |
| Reply-to (message references)  | ✅  | ✅     | ✅  |
| Message context menu           | ➖  | ➖     | ✅  |
| Virtual scrolling              | ➖  | ➖     | ✅  |
| Link previews (OpenGraph)      | 📋  | 📋     | 📋  | `link-preview.ts` (116 LOC) fetches OG tags — not rendered |
| Rich embeds rendering          | ❌  | ❌     | ❌  |
| Code block syntax highlighting | ❌  | ❌     | ❌  |

### Direct Messages

| Feature                      | Lib | Server | UI  |
| ---------------------------- | --- | ------ | --- |
| DM send / edit / delete      | ✅  | ✅     | ✅  |
| DM typing indicator          | ✅  | ✅     | ✅  |
| DM key exchange (X25519)     | ✅  | ✅     | ➖  |
| DM E2EE (XChaCha20-Poly1305) | ✅  | ✅     | ➖  |
| DM list view                 | ➖  | ➖     | ✅  |
| DM conversation view         | ➖  | ➖     | ✅  |
| New DM modal                 | ➖  | ➖     | ✅  |
| DM unread count              | ➖  | ➖     | 🔧  |

### Threads

| Feature               | Lib | Server | UI  |
| --------------------- | --- | ------ | --- |
| Thread create / send  | ✅  | ✅     | ✅  |
| Thread side panel     | ➖  | ➖     | ✅  |
| Reply count on parent | ➖  | ➖     | ✅  |

### Communities & Channels

| Feature                                     | Lib | Server | UI  |
| ------------------------------------------- | --- | ------ | --- |
| Community create / join / leave / list      | ✅  | ✅     | ✅  |
| Community settings                          | ➖  | ✅     | ✅  |
| Channel CRUD (text/voice/announcement)      | ✅  | ✅     | ✅  |
| Channel settings modal                      | ➖  | ➖     | ✅  |
| Channel sidebar                             | ➖  | ➖     | ✅  |
| Channel pins (pin/unpin/list, 50-pin limit) | ✅  | ✅     | ✅  |
| Server list bar (multi-community)           | ➖  | ➖     | ✅  |
| Member sidebar (with presence)              | ➖  | ➖     | ✅  |
| Join via invite code                        | ✅  | ✅     | ✅  |
| Create community modal                      | ➖  | ➖     | ✅  |
| Create channel modal                        | ➖  | ➖     | ✅  |
| Empty state view                            | ➖  | ➖     | ✅  |
| Ban / unban / kick                          | ✅  | ✅     | ✅  |

### Presence

| Feature                            | Lib | Server | UI  |
| ---------------------------------- | --- | ------ | --- |
| Presence (online/idle/dnd/offline) | ✅  | ✅     | ✅  |
| Custom status text                 | ✅  | ✅     | ✅  |
| Broadcast to community             | ✅  | ✅     | ✅  |

### Roles & Permissions

| Feature                     | Lib | Server | UI  |
| --------------------------- | --- | ------ | --- |
| Role CRUD + assign/remove   | ✅  | ✅     | ✅  |
| Permission-gated operations | ✅  | ✅     | ✅  |
| Admin-only enforcement      | ✅  | ✅     | ✅  |
| Role event broadcast        | ✅  | ✅     | ✅  |
| Role manager UI             | ➖  | ➖     | 🔧  |

### Voice & Video

| Feature                                 | Lib | Server | UI  | Notes                          |
| --------------------------------------- | --- | ------ | --- | ------------------------------ |
| Voice join/leave + WebRTC signalling    | ✅  | ✅     | ✅  |                                |
| Mute/unmute + speaking indicators       | ✅  | ✅     | ✅  |                                |
| Video enable/disable                    | ✅  | ✅     | ✅  |                                |
| Screen sharing                          | ✅  | ✅     | ✅  | Not on mobile                  |
| Video grid (adaptive layout)            | ➖  | ➖     | ✅  |                                |
| Screen share view                       | ➖  | ➖     | ✅  |                                |
| Voice control bar                       | ➖  | ➖     | ✅  |                                |
| Voice channel panel                     | ➖  | ➖     | ✅  |                                |
| Voice PiP                               | ➖  | ➖     | ✅  |                                |
| SFUAdapter interface (pluggable)        | ✅  | ✅     | ➖  |                                |
| Mediasoup adapter (self-hosted SFU)     | ✅  | ✅     | ➖  | In-process, no separate binary |
| Cloudflare Realtime adapter (cloud)     | ✅  | ➖     | ➖  | Cloud-only                     |
| VoiceRoomDO (cloud coordination)        | ➖  | ➖     | ➖  | Cloud Worker DO                |
| E2EE bridge (Insertable Streams + HKDF) | ✅  | ➖     | ✅  |                                |
| Voice token exchange                    | ✅  | ✅     | ✅  |                                |

### E2EE (End-to-End Encryption)

| Feature                                     | Lib | Server | UI  |
| ------------------------------------------- | --- | ------ | --- |
| MLS group creation + key package exchange   | ✅  | ✅     | ✅  |
| MLS welcome/commit messages                 | ✅  | ✅     | ✅  |
| MLS auto member addition                    | ✅  | ✅     | ✅  |
| Always-on MLS (no toggle)                   | ✅  | ✅     | ✅  |
| DM encryption (XChaCha20-Poly1305 + X25519) | ✅  | ✅     | ✅  |
| E2EE re-keying on member revocation         | ❌  | ❌     | ❌  |

### Media & Files

| Feature                                                      | Lib | Server | UI  |
| ------------------------------------------------------------ | --- | ------ | --- |
| Media upload (MIME validation, 10MB limit, membership check) | ✅  | ✅     | ✅  |
| Media delete                                                 | ✅  | ✅     | ✅  |
| `uploadMediaToServer()` + `sendMessageWithAttachments()`     | ✅  | ✅     | ✅  |
| Attachment display (inline images + download)                | ➖  | ➖     | ✅  |
| File upload UI (preview chips)                               | ➖  | ➖     | ✅  |
| Image gallery                                                | ➖  | ➖     | ✅  |
| Link preview (OpenGraph)                                     | 📋  | 📋     | 📋  |
| Thumbnail generation                                         | 📋  | 📋     | 📋  |
| File checksum verification                                   | 📋  | 📋     | 📋  |
| Media storage (file-based / R2)                              | ✅  | ✅     | ➖  |

### Search

| Feature | Lib | Server | UI | Notes |
| --- | --- | --- | --- | --- |
| Tokenizer + inverted index + query parser | ✅ | ✅ | ➖ | 39 tests |
| Snippet extraction | ✅ | ✅ | ➖ |  |
| Metadata index (server-side) | ✅ | ✅ | ➖ | Server searches metadata only (E2EE constraint) |
| Client-side FTS indexing | ✅ | ➖ | ✅ | Indexes after decrypt |
| Search overlay + result navigation + highlights | ➖ | ➖ | ✅ |  |
| Search bar + advanced filters | ➖ | ➖ | 📋 |  |

### Moderation

| Feature                                                     | Lib | Server | UI  |
| ----------------------------------------------------------- | --- | ------ | --- |
| Ban list enforcement + ban/unban/kick handlers              | ✅  | ✅     | ✅  |
| Slow mode / rate limit / account age / raid detection rules | 📋  | 📋     | 📋  |
| VC requirement rules                                        | 📋  | 📋     | 📋  |

### Governance

| Feature | Lib | Server | UI | Notes |
| --- | --- | --- | --- | --- |
| Governance engine (proposals, quorum, execution) | 📋 | 📋 | ➖ | ~900 LOC skeleton |
| Constitution (rules/constraints) | 📋 | 📋 | 📋 | `ConstitutionView.tsx` stub |
| Proposal CRUD + voting | 📋 | 📋 | 📋 | `ProposalList.tsx`, `ProposalDetail.tsx`, `CreateProposal.tsx` stubs |
| Delegation manager | 📋 | 📋 | 📋 | `DelegationManager.tsx` stub |
| Agent auth manager | 📋 | 📋 | 📋 |  |
| Audit log | 📋 | 📋 | 📋 |  |

### Bot API

| Feature                                                 | Lib | Server | UI  | Notes                 |
| ------------------------------------------------------- | --- | ------ | --- | --------------------- |
| Bot host (lifecycle) + context + event dispatch         | 🔧  | 🔧     | ➖  | Not production-tested |
| Webhooks (inbound/outbound)                             | 🔧  | 🔧     | ➖  |                       |
| ZCAP-based bot auth                                     | 📋  | 📋     | ➖  |                       |
| Sandbox (isolated execution)                            | 📋  | 📋     | ➖  |                       |
| Bot directory / install / settings / webhook manager UI | ➖  | ➖     | 📋  | 4 component stubs     |
| Per-channel bot scoping                                 | ❌  | ❌     | ❌  |                       |

### Federation

| Feature                                 | Lib | Server | Notes                          |
| --------------------------------------- | --- | ------ | ------------------------------ |
| FederationManager class                 | 📋  | 📋     | 319 LOC, types + event emitter |
| Server-to-server WebSocket              | ❌  | ❌     |                                |
| Peer discovery                          | ❌  | ❌     |                                |
| Cross-server message relay              | ❌  | ❌     |                                |
| Federation ZCAPs (instance-to-instance) | ❌  | ❌     |                                |

### Social Features

| Feature                  | Lib | Server | UI  |
| ------------------------ | --- | ------ | --- |
| Friend finder view       | ➖  | 🔧     | 🔧  |
| QR code sharing          | ❌  | ❌     | ❌  |
| Contact list persistence | ❌  | ❌     | ❌  |
| Add friend by DID        | ❌  | ❌     | ❌  |
| Data claim view          | ➖  | ➖     | 🔧  |

### Discord Migration

| Feature                                  | Lib | Server | UI  |
| ---------------------------------------- | --- | ------ | --- |
| Discord export parser + transform to RDF | ✅  | ✅     | ➖  |
| Encrypted export bundles                 | ✅  | ✅     | ➖  |
| User data transform                      | ✅  | ✅     | ➖  |
| Embed transform (url/title/desc/thumb)   | ✅  | ✅     | ➖  |
| Sticker transform                        | ✅  | ✅     | ➖  |
| Thread fetching (active + archived)      | ✅  | ✅     | ➖  |
| Reaction user resolution (per-emoji)     | ✅  | ✅     | ➖  |
| Attachment download (Discord CDN)        | ✅  | ✅     | ➖  |
| Migration bot                            | ✅  | ✅     | ➖  |
| Migration endpoint (REST API)            | ➖  | ✅     | ➖  |
| Migration wizard UI                      | ➖  | ➖     | ✅  |
| Migration dedup                          | ➖  | ➖     | ✅  |
| GDPR member opt-out                      | ❌  | ❌     | ❌  |
| Privacy notice template                  | ❌  | ❌     | ❌  |
| Personal data export (GDPR portability)  | ❌  | ❌     | ❌  |

### Notifications

| Feature               | Lib | Server | UI  |
| --------------------- | --- | ------ | --- |
| Notification center   | ➖  | ➖     | 📋  |
| Notification settings | ➖  | ➖     | 📋  |
| Notification item     | ➖  | ➖     | 📋  |

### Internationalisation

| Feature                | Status |
| ---------------------- | ------ |
| String table (i18n)    | ✅     |
| Multi-language support | 📋     |

### Mobile-Specific

| Feature                                  | Status |
| ---------------------------------------- | ------ |
| Capacitor project (Android)              | ✅     |
| Push notifications (native)              | ✅     |
| Biometric authentication                 | ✅     |
| Native share target                      | ✅     |
| Background sync                          | ✅     |
| PWA service worker (cache/push/sync)     | ✅     |
| Mobile-responsive UI (hamburger/drawers) | ✅     |
| Safe-area insets                         | ✅     |
| Touch targets (44px minimum)             | ✅     |

### Cloud & Portal Infrastructure

| Feature                                      | Status | Target |
| -------------------------------------------- | ------ | ------ |
| Community Durable Object (one per community) | ✅     | Cloud  |
| DO SQLite storage                            | ✅     | Cloud  |
| Hibernatable WebSockets                      | ✅     | Cloud  |
| Community provisioning                       | ✅     | Cloud  |
| Portal identity store (D1)                   | ✅     | Portal |
| Portal community directory                   | ✅     | Portal |
| Portal invite resolver                       | ✅     | Portal |
| Portal OAuth handler                         | ✅     | Portal |
| Portal rate limiter (KV)                     | ✅     | Portal |
| Portal relay (WebSocket proxy)               | ✅     | Portal |
| Portal export store (R2)                     | ✅     | Portal |
| Portal reconciliation                        | ✅     | Portal |

### Infrastructure & Deployment

| Feature                                      | Status | Target              |
| -------------------------------------------- | ------ | ------------------- |
| Electron packaging (mac/win/linux)           | ✅     | Electron            |
| Docker Compose (server + UI)                 | ✅     | Self-hosted         |
| Dockerfile (server)                          | ✅     | Self-hosted         |
| Health check endpoint (port+1)               | ✅     | Server              |
| Config file (harmony.config.yaml)            | ✅     | Electron/Server     |
| Config persistence (deep merge)              | ✅     | Electron/Server     |
| SQLite quad store                            | ✅     | Server              |
| In-memory quad store                         | ✅     | Client              |
| DO quad store                                | ✅     | Cloud               |
| Rate limiting (server-side)                  | ✅     | Server/Portal/Cloud |
| WebSocket reconnection (exponential backoff) | ✅     | Client              |
| Message queue (offline buffering)            | ✅     | Client              |
| PWA manifest + icons                         | ✅     | Web/Mobile          |

### CLI

| Feature                        | Status |
| ------------------------------ | ------ |
| Identity create                | ✅     |
| Community create / join / list | ✅     |
| Channel create / send          | ✅     |
| Migration import               | ✅     |
| Portal service integration     | ✅     |
| Community export (.hbundle)    | ❌     |
| Community import (.hbundle)    | ❌     |

### CRDT

| Feature                         | Status |
| ------------------------------- | ------ |
| Lamport clock (tick/merge)      | ✅     |
| CRDT log (ordered message log)  | ✅     |
| CRDT operations (insert/delete) | ✅     |

### Revenue / Cloud Tiers

| Feature                      | Status |
| ---------------------------- | ------ |
| Billing integration (Stripe) | ❌     |
| Feature gating per tier      | ❌     |
| Custom domains (Pro)         | ❌     |
| SSO / enterprise features    | ❌     |
| Admin dashboard              | ❌     |

---

## Dry-Run & CI/CD

| Script / Workflow               | Checks            | Status                               |
| ------------------------------- | ----------------- | ------------------------------------ |
| `scripts/dry-run-server.mjs`    | 11                | ✅ All passing                       |
| `scripts/dry-run-cloud.mjs`     | 18                | ✅ All passing                       |
| `scripts/dry-run-migration.mjs` | 23                | ✅ All passing                       |
| `scripts/smoke-test.mjs`        | —                 | Post-deploy health/WS/auth/migration |
| `.github/workflows/ci.yml`      | PR tests          | `if: false` — enable when deploying  |
| `.github/workflows/deploy.yml`  | Branch deploys    | `if: false` — enable when deploying  |
| `.github/workflows/release.yml` | Release artifacts | `if: false` — enable when deploying  |

---

## Security Audit

| #   | Item                                                          | Status |
| --- | ------------------------------------------------------------- | ------ |
| 1   | Auth flow (DID, VP verification, session management)          | ✅     |
| 2   | ZCAP chain verification (fuzz, attenuation, revoked parent)   | ✅     |
| 3   | E2EE (MLS review, key derivation, frame encryption, 54 tests) | ✅     |
| 4   | Input validation (all WS handlers, all REST endpoints)        | ✅     |
| 5   | Rate limiting under load                                      | ✅     |
| 6   | WebSocket security (origin, auth timeout, message size)       | ✅     |
| 7   | ZCAP privilege escalation (forge/elevate attempts)            | ✅     |
| 8   | Media upload (path traversal, content-type, size limits)      | ✅     |
| 9   | Cloud Worker DO isolation (communityId vs DO ID)              | ✅     |
| 10  | Dependency audit (`pnpm audit`, native modules)               | ✅     |
| 11  | Penetration test (OWASP ZAP + custom WS fuzzer)               | ⬜     |
| 12  | Remediation (fix critical/high findings)                      | ⬜     |

---

## Completed Work

Everything below is done and committed.

### 2026-02-26

- Core architecture: 36 packages, SolidJS UI (23 views)
- Cloud Worker: Durable Objects, Hibernatable WebSockets, DO SQLite, D1 registry, R2 media
- E2EE always-on: MLS + X25519/XChaCha20-Poly1305, DM encryption, server zero-knowledge
- All 16 bugs from live matrix fixed
- Threads, ZCAP verification, roles, pins, media upload, voice/video stubs
- Mobile: Capacitor setup, PWA service worker, Android APK (3.7MB)
- Full Migration Wizard UI + verified E2E against real Discord server
- 14 migration integration tests; all section 15 items upgraded
- Fixed: DM encryption, voice sidebar, search highlights/navigation, client-side search, incognito
- Server handlers: `search.query`, `channel.history`, `media.upload.complete` broadcast

### 2026-02-27

- Voice infrastructure: mediasoup self-hosted SFU + CF Realtime cloud SFU (8 architecture steps)
- Billing plan created at `membranes/harmony/plans/billing-plan.md`
- Test matrix verification: 128 ✅ / 0 ❌ / 3 ⚠️ / 16 ⊘
- ADAM convergence roadmap: `membranes/harmony/plans/harmony-adam-convergence.md`
- ADAM spec proposal: `membranes/adam/proposals/adam-zcap-vc-spec.md`
- Tech debt: TS 0 errors (was ~4525), skip→todo conversions, lint cleanup (131→7 warnings)
- Full-text search wired: ClientSearchIndex, MetadataIndex, `search.query` handler, UI store, 39 tests
- Discord Playwright tests: 13 passing, Discord OAuth vitest unskipped
- `pnpm audit` — 9 vulnerabilities fixed via overrides (0 remaining)
- Wrangler configs with dev/staging/prod env sections (placeholder IDs)
- Environment config templates + `docs/ENVIRONMENT.md`
- Server validation order fix: ban → ZCAP → membership
- `docs/BACKUP-STRATEGY.md`
- Sticker support in Discord migration transform
- Input validation overhaul: type validation, parse error responses, unknown type errors
- Validation helpers: `sendError`, `validateRequiredStrings`, `validateStringLength`, `validateMembership`, `sanitizeFilename`
- Security audit items 1–10 all ✅
- Media attachment migration: Discord API threads, reactions, attachments; embed → RDF quads
- RUNBOOK.md (361 LOC), MIGRATION-STRATEGY.md (290 LOC)
- FEATURES.md updated: 192→197 features
- Deployment dry-run scripts: server (11/11), cloud (18/18), migration (23/23)
- CI/CD workflows: ci.yml, deploy.yml, release.yml (all `if: false`)
- Smoke test script

---

## Road to Beta

### Pre-Dev Requirements (must complete before first deployment)

| # | Task | Status | Owner | Notes |
| --- | --- | --- | --- | --- |
| 1 | Penetration test | ⬜ | Agent | OWASP ZAP + custom WS fuzzer against running instance |
| 2 | Pen test remediation | ⬜ | Agent | Fix all critical/high findings |
| 3 | Provision CF resources | ⬜ | Josh | `wrangler d1 create`, `wrangler r2 bucket create`, KV/DO namespaces |
| 4 | Fill wrangler placeholder IDs | ⬜ | Josh | Replace `REPLACE_WITH_*` in wrangler.toml files |
| 5 | Register domain | ⬜ | Josh | `harmony.chat` or similar → Cloudflare |
| 6 | Stripe API keys | ⬜ | Josh | Test + live keys |
| 7 | Billing integration | ⬜ | Agent | Wire Stripe into cloud worker per billing plan |
| 8 | Voice E2E test | ⬜ | Manual | Real audio/video between two Electron clients via mediasoup |
| 9 | Electron build pipeline | ⬜ | Josh + Agent | macOS notarization, Windows signing, auto-update |
| 10 | Capacitor build pipeline | ⬜ | Josh + Agent | APK signing, iOS provisioning |
| 11 | Secrets management | ⬜ | Josh | `wrangler secret put` for OAuth, Stripe, etc. |

### Phase 1: Dev Environment

| #   | Task                              | Status |
| --- | --------------------------------- | ------ |
| 1   | Re-enable CI workflow             | ⬜     |
| 2   | Deploy Portal Worker to dev       | ⬜     |
| 3   | Deploy Cloud Worker to dev        | ⬜     |
| 4   | Build dev Electron app (unsigned) | ⬜     |
| 5   | Push Docker server image to GHCR  | ⬜     |
| 6   | Post-deploy smoke test            | ⬜     |

### Phase 2: Manual Verification on Dev

| #   | Task                   | Notes                                                                            |
| --- | ---------------------- | -------------------------------------------------------------------------------- |
| 1   | Full onboarding flow   | Real browser                                                                     |
| 2   | Voice with real media  | Two Electron clients, real mics                                                  |
| 3   | Multi-user real-time   | Two machines, messages + typing + presence                                       |
| 4   | Mobile                 | Capacitor APK on real Android device                                             |
| 5   | Self-hosted Docker     | `docker compose up` → Electron → create community → restart → verify persistence |
| 6   | Migration flow         | Real Discord server → import → verify                                            |
| 7   | E2EE wire verification | Inspect WS frames, confirm encryption                                            |
| 8   | Cloud billing          | Create community, hit free tier limits, verify enforcement                       |

### Phase 3: Staging

| #   | Task                                         | Status |
| --- | -------------------------------------------- | ------ |
| 1   | CD pipeline (merge to main → staging deploy) | ⬜     |
| 2   | Separate staging CF resources                | ⬜     |
| 3   | Automated staging smoke tests                | ⬜     |
| 4   | Monitoring + alerting                        | ⬜     |
| 5   | Load testing                                 | ⬜     |

### Phase 4: Production

| #   | Task                                           | Status |
| --- | ---------------------------------------------- | ------ |
| 1   | Production CF resources                        | ⬜     |
| 2   | Production domain live                         | ⬜     |
| 3   | Electron code signing (macOS + Windows)        | ⬜     |
| 4   | App store submissions (Play Store + App Store) | ⬜     |
| 5   | Docker tagged release on GHCR                  | ⬜     |
| 6   | Self-hosted documentation                      | ⬜     |
| 7   | Security re-audit                              | ⬜     |

---

## Post-Launch

### Priority 1 — Should ship soon after launch

- **Multi-level ZCAP delegation** — Admin → Mod → Temp-Mod chains, attenuation at each level
- **VC-based admission** — Gate `community.join` on required credentials
- **Code block syntax highlighting** — Add `highlight.js` or `shiki` to message renderer
- **Notification system** — Unread badges, mention detection, notification center
- **Rich embeds** — Render link previews inline in messages
- **Contact list persistence** — Friends list storage

### Priority 2 — Important but not urgent

- **Time/rate-limited capabilities** — Enforce expiry and rate caveats on ZCAPs
- **E2EE re-keying on member revocation** — MLS epoch rotation when member leaves/banned
- **E2EE key binding in VCs** — Embed X25519 public key in membership VC
- **User-to-user delegation** — Members delegate capabilities without admin
- **Credential UI wiring** — Wire portfolio/detail/issue/editor/reputation components to live data
- **Custom credential types** — Admin-defined VC types per community

### Priority 3 — Post-stabilization

- **Federation** — Server-to-server WebSocket, peer discovery, cross-server relay, federation ZCAPs
- **Governance** — Wire proposal/voting/constitution engine to server + UI
- **Bot API production** — Per-channel scoping, restart with backoff, ZCAP auth
- **AI agent ZCAPs** — Agent DIDs + constrained scope templates
- **GDPR tooling** — Member opt-out, privacy notices, personal data export
- **DID method expansion** — `did:web`, `did:plc`, plugin architecture
- **Community export/import** — `.hbundle` format, CLI commands, desktop UI
- **Revenue** — Custom domains, SSO, enterprise features, admin dashboard
- **Reputation engine** — Cross-community trust networks, aggregated scores

---

## Skipped & Todo Tests

### Summary: 10 skip, 114 todo

**Skipped (10)** — all require real credentials or running infrastructure:

- Discord OAuth vitest (4) — Playwright covers these
- Migration E2E (4) — needs bot token + OAuth env
- Federation (1) — needs real peer
- Server import edge case (1)

**Todo by category:**

| Category | Count | What |
| --- | --- | --- |
| Post-launch | 29 | Federation (4), bot-api (8), ZCAP advanced (4), VC admission (5), DID methods (3), CLI bundles (3), governance (2) |
| Needs real environment | 12 | Voice SFU/PiP (9), E2EE re-keying (3) |
| Search | 4 | UI integration (SolidJS context) |
| UI stubs | ~20 | Wire-up (6), DM (5), media (8), credentials (5), channel-perms (3), roles (3), voice (6) |
| Cloud Worker | 4 | DO integration (miniflare) |
| Protocol | 4 | Future message types |
| Docker | 3 | Container-specific tests |
| Migration | 3 | GDPR: opt-out, privacy, portable export |
| Feature coverage meta-test | 14 skip | Entire file skipped |

### 3 ⚠️ Items (need real hardware)

- 11.1 — Voice join (real microphone)
- 11.2–11.3 — Voice features (real media)
- 14.1 — Ctrl+K keybinding (real browser)

### 16 ⊘ Items (blocked on unbuilt infrastructure)

Federation, governance, bot API, custom credentials, community export/import, GDPR.

---

## Deployment Architecture

```
                    ┌─────────────────┐
                    │  harmony.chat   │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
        ┌─────┴─────┐ ┌─────┴─────┐ ┌─────┴─────┐
        │  Portal   │ │  Cloud    │ │ Self-Host │
        │  Worker   │ │  Worker   │ │ (Docker)  │
        │  D1/R2/KV │ │  DO/R2   │ │  SQLite   │
        └───────────┘ └───────────┘ └───────────┘
              │              │              │
              └──────────────┼──────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
        ┌─────┴─────┐ ┌─────┴─────┐ ┌─────┴─────┐
        │ Electron  │ │ Capacitor │ │  Browser  │
        │ (desktop) │ │ (mobile)  │ │  (PWA)    │
        └───────────┘ └───────────┘ └───────────┘
```

Cloud: Portal Worker + Cloud Worker on Cloudflare. Clients connect via WSS. Self-hosted: Docker image with embedded server + mediasoup SFU. Clients connect directly. Always free.

---

## Key Files

| File                  | Location                                                                    |
| --------------------- | --------------------------------------------------------------------------- |
| RUNBOOK.md            | `~/Desktop/harmony/RUNBOOK.md`                                              |
| MIGRATION-STRATEGY.md | `~/Desktop/harmony/MIGRATION-STRATEGY.md`                                   |
| Test matrix           | `~/Desktop/harmony/TEST-MATRIX-20260227.md`                                 |
| Voice architecture    | `~/Desktop/harmony/VOICE-CLOUD-ARCHITECTURE.md`                             |
| Backup strategy       | `~/Desktop/harmony/docs/BACKUP-STRATEGY.md`                                 |
| Environment reference | `~/Desktop/harmony/docs/ENVIRONMENT.md`                                     |
| Billing plan          | `~/.openclaw/workspace/membranes/harmony/plans/billing-plan.md`             |
| ADAM convergence      | `~/.openclaw/workspace/membranes/harmony/plans/harmony-adam-convergence.md` |
| ADAM spec proposal    | `~/.openclaw/workspace/membranes/adam/proposals/adam-zcap-vc-spec.md`       |
| Dry-run: server       | `~/Desktop/harmony/scripts/dry-run-server.mjs`                              |
| Dry-run: cloud        | `~/Desktop/harmony/scripts/dry-run-cloud.mjs`                               |
| Dry-run: migration    | `~/Desktop/harmony/scripts/dry-run-migration.mjs`                           |
| Smoke test            | `~/Desktop/harmony/scripts/smoke-test.mjs`                                  |
| CI workflow           | `~/Desktop/harmony/.github/workflows/ci.yml`                                |
| Deploy workflow       | `~/Desktop/harmony/.github/workflows/deploy.yml`                            |
| Release workflow      | `~/Desktop/harmony/.github/workflows/release.yml`                           |
