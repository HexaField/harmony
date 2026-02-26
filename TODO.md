# Harmony — Remaining Work

## ~~MVP Blockers~~ ✅ All Done (2026-02-26)

- ~~Docker Compose~~ ✅ — Dockerfile, docker-compose.yml, .env.example, harmony.config.example.yaml
- ~~Electron Packaging~~ ✅ — electron-builder.yml, macOS/Windows/Linux targets
- ~~Ban Enforcement~~ ✅ — Server-side ban list, ban/unban handlers, 6 new tests
- ~~PWA Icons~~ ✅ — Purple hexagon SVG, manifest + favicon
- ~~GUIDE.md Audit~~ ✅ — Threads/export marked "Coming soon", voice/docker/downloads caveated

## ~~E2EE Server-Side Key Exchange~~ ✅ Done (2026-02-26)

Wired end-to-end: MLS group creation → key package exchange → auto member addition → encrypted messaging → decryption.

- ~~Server tracks E2EE group metadata~~ ✅
- ~~Server notifies group creators on new member key package upload (`mls.member.joined`)~~ ✅
- ~~Client auto-adds new members to MLS groups~~ ✅
- ~~Client decrypts messages when MLS group exists, plaintext fallback otherwise~~ ✅
- ~~11 new integration tests (e2ee-integration.spec.ts)~~ ✅
- ~~Un-skipped integration.spec.ts:289 + user-journeys.spec.ts:715~~ ✅
- [ ] UI toggle for E2EE per channel/community (deferred — works programmatically via `enableE2EE()`)

---

## Post-Launch — Wiring Gaps

### DM Encryption

`SimplifiedDMProvider` exists but DM send/receive pipeline doesn't use it.

- [ ] Wire DM encryption into client send/receive
- [ ] Key exchange for DM pairs

### Federation

Protocol + `FederationManager` exist (319 LOC) but servers can't discover or relay to each other.

- [ ] Server-to-server WebSocket connection
- [ ] Peer discovery mechanism
- [ ] Cross-server message relay
- [ ] Trust model decisions (allow-list? open?)
- [ ] Skipped test: `integration.spec.ts:363`

### Threads

Protocol types defined (`thread.create`, `thread.send`, `thread.message`, `thread.created`) but no UI or server handler.

- [ ] Server handles thread.create and thread.send
- [ ] Thread view in UI (inline or side panel)
- [ ] Thread notification/unread tracking

### Social Recovery — Approval Flow

Cloud API routes exist, Settings UI has setup, Onboarding has recovery entry point. Missing: UI for a trusted contact to approve someone else's recovery request.

- [ ] Notification when someone requests recovery naming you as trusted contact
- [ ] Approval UI (approve/deny with confirmation)
- [ ] Status tracking (X of N approvals collected)

### Rate Limiting Wiring

Moderation module has rate limiting logic. Verify it's actually called in the server message handler.

- [ ] Confirm rate limit check on `channel.send`
- [ ] Confirm rate limit response sent to client
- [ ] UI feedback when rate limited

---

## Post-Launch — New Features

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

- **Tests:** 2206 passing, 68 skipped, 83 files
- **Packages:** 36
- **UI:** 22 views, 15 component directories, ~9700 LOC
- **Client:** ~1950 LOC
- **Server:** ~1725 LOC
- **Total estimated LOC:** ~26,000+
