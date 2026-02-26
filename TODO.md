# Harmony — Remaining Work

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

- ~~Server handles thread.create and thread.send~~ ✅ — In-memory thread storage
- ~~Thread view in UI~~ ✅ — Side panel, start thread on messages, reply count indicators
- ~~Thread notification/unread tracking~~ ✅ — Reply counts on parent messages
- 13 new tests (6 integration + 7 UI)

## ~~Social Recovery~~ ✅ Done (2026-02-26)

- ~~GET /recovery/pending/:approverDID endpoint~~ ✅
- ~~Settings UI: recovery setup form, status display, pending approval list~~ ✅
- ~~Onboarding: mnemonic/social recovery tab switcher, full initiate→approve→complete flow~~ ✅
- 10 new tests (4 cloud + 6 UI)

## ~~Mobile~~ ✅ Done (2026-02-26)

- ~~Capacitor project setup~~ ✅ — capacitor.config.ts, Android build working, MOBILE.md
- ~~Native implementations~~ ✅ — push, biometric, share, platform, background-sync (Capacitor + InMemory fallbacks)
- ~~PWA service worker~~ ✅ — cache, push, background sync
- ~~Mobile-responsive UI~~ ✅ — hamburger menu, drawers, safe-area insets, touch targets
- ~~Store integration~~ ✅ — mobileApp + biometricEnabled signals
- 15 new tests (10 Capacitor + 5 responsive)

## ~~Pre-Launch (Batch 2)~~ ✅ All Done (2026-02-26)

### ~~ZCAP Verification~~ ✅ (was CRITICAL)

- ~~Real chain verification~~ ✅ — `verifyZCAPProof()` now uses `ZCAPService.verifyInvocation()`: walks delegation chains, verifies cryptographic signatures, checks action scope, checks revocation
- ~~Capability store~~ ✅ — `Map<string, Capability>` tracks root + delegated capabilities, auto-stored on community creation
- ~~DID resolution~~ ✅ — `resolveDID()` constructs DID documents from `did:key` for signature verification
- ~~Backward compatible~~ ✅ — messages without proof still pass (handshake/sync)
- 7 integration tests (valid chains, invalid proofs, scope violations)

### ~~Media Upload & File Sharing~~ ✅

- ~~Server handlers~~ ✅ — `media.upload.request` + `media.delete`, in-memory storage, MIME validation, 10MB limit, membership checks
- ~~Client methods~~ ✅ — `uploadMediaToServer()`, `sendMessageWithAttachments()`
- ~~UI components~~ ✅ — `AttachmentDisplay` (inline images + download links), `FileUpload` (preview chips)
- 19 tests (6 integration + 13 unit)

### ~~Role Management~~ ✅

- ~~Server handlers~~ ✅ — `role.create`, `role.update`, `role.delete`, `role.assign`, `role.remove`
- ~~Admin enforcement~~ ✅ — all role operations admin-only
- ~~Permission system~~ ✅ — `hasPermission()` helper for role-based access control
- ~~Events~~ ✅ — broadcasts `role.created/updated/deleted`, `community.member.updated`
- 7 integration tests

### ~~Channel Pins~~ ✅

- ~~Protocol types~~ ✅ — `channel.pin`, `channel.unpin`, `channel.pins.list` (C2S) + response events (S2C)
- ~~Server handlers~~ ✅ — 50-pin limit per channel, permission-gated
- ~~Client methods~~ ✅ — `pinMessage()`, `unpinMessage()`, `getPinnedMessages()`
- 6 integration tests

### ~~Voice, Video & Screen Sharing~~ ✅

- ~~Protocol~~ ✅ — 6 new message types (mute, unmute, video, screen, token, token.response)
- ~~Server~~ ✅ — voice room participant state tracking, handlers for all voice operations, state broadcast
- ~~Voice client~~ ✅ — `enableVideo()`, `disableVideo()`, `startScreenShare()`, `stopScreenShare()` with injectable `MediaDeviceProvider`
- ~~E2EE bridge~~ ✅ — `createEncodedTransform()` for WebRTC Insertable Streams
- ~~UI~~ ✅ — `VideoGrid` (adaptive layout), `VoiceChannelPanel` (participant indicators), `ScreenShareView`, updated `VoiceControlBar` with video/screen share toggles
- ~~GUIDE.md~~ ✅ — LiveKit self-hosting documentation
- 10 tests (5 unit + 5 integration)

---

## Post-Launch

### Federation

Protocol + `FederationManager` exist (319 LOC) but servers can't discover or relay to each other.

- [ ] Server-to-server WebSocket connection
- [ ] Peer discovery mechanism
- [ ] Cross-server message relay
- [ ] Trust model decisions (allow-list? open?)
- [ ] Federation ZCAPs — instance-to-instance capability delegation
- [ ] Skipped test: `integration.spec.ts:363`

### Multi-Level ZCAP Delegation

Single-level delegation works (admin → member). Plan specifies deep chains.

- [ ] Admin → Mod → Temp-Mod delegation chains
- [ ] Attenuation enforcement at each level
- [ ] Time-limited capabilities (expiry)
- [ ] Rate-limited capabilities (caveats)
- [ ] User-to-user delegation ("holiday mod")
- [ ] AI agent ZCAPs (scoped agent authorization)

### VC Enhancements

- [ ] E2EE key binding in membership VCs (VC carries encryption public key)
- [ ] E2EE re-keying on member revocation/ban
- [ ] VC-based admission policies (communities gate on credential requirements)
- [ ] Cross-community trust networks
- [ ] Rich VC portfolio UI (user's credential portfolio display)
- [ ] Custom credential types per community

### Community Export/Import

GUIDE.md references `harmony community export` and `.hbundle` format.

- [ ] Define .hbundle format (encrypted archive of quads + media)
- [ ] CLI `community export` command
- [ ] CLI `community import` command
- [ ] Desktop UI for export/import

### Friend Finding — Polish

Search endpoint added, basic UI exists (155 LOC). Incomplete flows.

- [ ] QR code display for sharing Harmony ID
- [ ] Contact list persistence in localStorage
- [ ] "Add friend by DID" — paste DID flow
- [ ] Visual verification of FriendFinderView end-to-end

### Rich Embeds

`link-preview.ts` exists (116 LOC) — fetches OpenGraph/meta tags.

- [ ] Render link previews inline in messages (title, description, image, favicon)
- [ ] YouTube/Twitter/etc. special embed rendering
- [ ] Code block syntax highlighting

### Revenue / Cloud Tiers

Plan specifies Free/Pro/Enterprise tiers. Not blocking launch but needed for sustainability.

- [ ] Billing integration (Stripe or similar)
- [ ] Feature gating per tier (storage limits, history depth, custom domains)
- [ ] Custom domain support for Pro tier
- [ ] SSO / enterprise features
- [ ] Admin dashboard for cloud instance management

### Migration Hardening

- [ ] GDPR: filter departed members from migration export (opt-out)
- [ ] Privacy notice template for admins running migration
- [ ] Individual "my data" personal export (GDPR data portability)

### DID Method Expansion

Currently `did:key` only. Plan says "support any and all."

- [ ] `did:web` support
- [ ] `did:plc` support
- [ ] Method-agnostic resolver architecture

---

## Polish & Quality

### Skipped Tests (62 remaining)

Mostly infrastructure-dependent. Categorised:

- **Discord OAuth dependent** (2) — cloud.spec.ts:178, 182
- **Workers runtime dependent** (4) — cloud-worker.spec.ts:277, 282, 286, 290
- **Federation** (1) — integration.spec.ts:363
- **Discord bot token** (1) — migration-e2e.spec.ts:12
- **Full OAuth flow** (3) — migration-e2e.spec.ts:108, 208, 243
- **Bot API advanced** (5) — bot-api.spec.ts:657, 704, 774, 778, 784
- **ZCAP/governance edge cases** (3) — credentials.spec.ts:132, 137; governance.spec.ts:109, 325
- **UI feature stubs** (~43) — spread across dm, file-upload, channel-perms, voice, roles, wire-up, voice-activity

### Error Handling

- [ ] Network offline indicator in UI
- [ ] Graceful reconnection feedback (not just silent reconnect)
- [ ] Server connection drop mid-message — what happens?

### Onboarding

- [ ] Test web-only path end-to-end in real browser (not just unit tests)
- [ ] Verify mnemonic backup flow visually
- [ ] Test "Recover existing identity" flow visually

### Loading States

Addressed in POLISH.md pass — worth visual re-verification after all recent changes.

---

## Plan v1 Gap Summary

| Feature                         | Plan Section      | Status      |
| ------------------------------- | ----------------- | ----------- |
| ~~ZCAP chain verification~~     | Core Architecture | ✅ Done     |
| ~~Media upload~~                | Phase 3 parity    | ✅ Done     |
| ~~Role CRUD + permissions~~     | Core Architecture | ✅ Done     |
| ~~Pins~~                        | Phase 3 parity    | ✅ Done     |
| ~~Voice/Video/Screen share~~    | Phase 3 parity    | ✅ Done     |
| Multi-level ZCAP delegation     | Core Architecture | Post-launch |
| ZCAP caveats (time/rate limits) | Core Architecture | Post-launch |
| VC key binding + re-keying      | Core Architecture | Post-launch |
| VC admission policies           | Core Architecture | Post-launch |
| Cross-community trust           | Core Architecture | Post-launch |
| User-to-user delegation         | Core Architecture | Post-launch |
| Rich embeds rendering           | Phase 3 parity    | Post-launch |
| Revenue tiers                   | Revenue Model     | Post-launch |
| Custom domains                  | Revenue Model     | Post-launch |
| SSO / enterprise                | Revenue Model     | Post-launch |
| GDPR member opt-out             | Migration         | Post-launch |
| Privacy notice template         | Migration         | Post-launch |
| Personal data export            | Migration         | Post-launch |
| `did:web` / `did:plc`           | Identity Layer    | Post-launch |
| VC portfolio UI                 | Core Architecture | Post-launch |
| Bot per-channel scoping         | Core Architecture | Post-launch |

---

## Stats Snapshot (2026-02-26)

- **Tests:** 2275 passing, 62 skipped, 95 files
- **Packages:** 36
- **UI:** 23 views, 16 component directories, ~10,000 LOC
- **Server:** ~2764 LOC
- **Client:** ~2100 LOC
- **Total estimated LOC:** ~32,000+
