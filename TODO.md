# Harmony — Remaining Work

## ~~MVP Blockers~~ ✅ All Done (2026-02-26)

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

---

## Pre-Launch — Required

### Voice & Video

Library exists (520 LOC, LiveKit adapter), VoiceControlBar view, store wiring. Requires external LiveKit.

- [ ] Document LiveKit setup in GUIDE.md
- [ ] Test voice join/leave/mute flow end-to-end
- [ ] Screen sharing
- [ ] E2EE bridge for voice (e2ee-bridge.ts exists, 31 LOC)
- [ ] Skipped tests: `voice.spec.ts` (4 skipped)

### Mobile

Scaffold exists (biometric.ts, push.ts, share-target.ts, background-sync.ts, platform.ts) — all stubs.

- [ ] Capacitor or native wrapper
- [ ] Push notifications
- [ ] Biometric unlock for identity
- [ ] Share target for invite links
- [ ] Background sync for offline messages

---

## Post-Launch

### Federation

Protocol + `FederationManager` exist (319 LOC) but servers can't discover or relay to each other.

- [ ] Server-to-server WebSocket connection
- [ ] Peer discovery mechanism
- [ ] Cross-server message relay
- [ ] Trust model decisions (allow-list? open?)
- [ ] Skipped test: `integration.spec.ts:363`

### Rate Limiting Wiring

Moderation module has rate limiting logic. Verify it's actually called in the server message handler.

- [ ] Confirm rate limit check on `channel.send`
- [ ] Confirm rate limit response sent to client
- [ ] UI feedback when rate limited

### Friend Finding — Polish

Search endpoint added, basic UI exists (155 LOC). Incomplete flows.

- [ ] QR code display for sharing Harmony ID
- [ ] Contact list persistence in localStorage
- [ ] "Add friend by DID" — paste DID flow
- [ ] Visual verification of FriendFinderView end-to-end

### Community Export/Import

GUIDE.md references `harmony community export` and `.hbundle` format for moving communities between servers.

- [ ] Define .hbundle format (encrypted archive of quads + media)
- [ ] CLI `community export` command
- [ ] CLI `community import` command
- [ ] Desktop UI for export/import

---

## Polish & Quality

### Skipped Tests (68 remaining)

Mostly infrastructure-dependent. Categorised:

- **Discord OAuth dependent** (2) — cloud.spec.ts:178, 182
- **Workers runtime dependent** (4) — cloud-worker.spec.ts:277, 282, 286, 290
- **Federation** (1) — integration.spec.ts:363
- **Discord bot token** (1) — migration-e2e.spec.ts:12
- **Full OAuth flow** (3) — migration-e2e.spec.ts:108, 208, 243
- **Bot API advanced** (5) — bot-api.spec.ts:657, 704, 774, 778, 784
- **ZCAP/governance edge cases** (3) — credentials.spec.ts:132, 137; governance.spec.ts:109, 325
- **UI feature stubs** (~49) — spread across dm, file-upload, channel-perms, voice, roles, wire-up, voice-activity

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

## Stats Snapshot (2026-02-26)

- **Tests:** 2235 passing, 68 skipped, 88 files
- **Packages:** 36
- **UI:** 23 views, 15 component directories, ~10,000 LOC
- **Client:** ~1980 LOC
- **Server:** ~1800 LOC
- **Total estimated LOC:** ~27,000+
