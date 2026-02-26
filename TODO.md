# Harmony — Remaining Work

## MVP Blockers

These are needed before launch because the GUIDE.md promises them or they're table-stakes for real usage.

### Docker Compose

No Dockerfile or docker-compose.yml exists yet. GUIDE.md documents full Docker deployment flow.

- [ ] Dockerfile for server + web UI
- [ ] docker-compose.yml with `with-bot` profile
- [ ] .env.example + harmony.config.example.yaml
- [ ] Test: `docker compose up -d` → community accessible

### Electron Packaging

Dev scripts work but no distributable builds. GUIDE.md promises .dmg, .exe, .AppImage downloads.

- [ ] Add electron-builder or electron-forge config
- [ ] Build targets: macOS (.dmg), Windows (.exe), Linux (.AppImage, .deb)
- [ ] Code signing (can defer, but needed for macOS Gatekeeper)
- [ ] Auto-update mechanism (can defer)

### Ban Enforcement

Moderation module exists (368 LOC) but server accepts any valid VP — no ban list check at connection level.

- [ ] Server checks ban list on connection and message send
- [ ] Banned user gets disconnected with reason
- [ ] Skipped test: `integration.spec.ts:426`

### PWA Icons

Manifest exists but `"icons": []` — broken PWA install experience.

- [ ] Generate icon set (192x192, 512x512 minimum)
- [ ] Add to manifest.json
- [ ] Favicon for browser tab

### GUIDE.md Audit

Guide references features not yet working. Either implement or mark as coming soon.

- [ ] Threads — mentioned in day-to-day usage ("Start a thread by right-clicking a message")
- [ ] Voice/video — full section on joining voice channels
- [ ] Docker deployment — full section but no Docker files exist
- [ ] Desktop downloads — references .dmg/.exe/.AppImage that don't exist yet
- [ ] Community export (`harmony community export` / `.hbundle` format) — referenced but not implemented

---

## Post-Launch — Wiring Gaps

Features where the library/backend exists but isn't connected end-to-end.

### E2EE Server-Side Key Exchange

MLS library works (54 tests), client has `enableE2EE()`, but server doesn't coordinate MLS group membership.

- [ ] Server handles `mls.keypackage.upload` messages
- [ ] Server manages MLS group state per channel
- [ ] Welcome messages sent to new members joining encrypted channels
- [ ] UI toggle for E2EE per channel/community
- [ ] Skipped test: `integration.spec.ts:289`, `user-journeys.spec.ts:715`

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

### Skipped Tests (71 total)

Mostly infrastructure-dependent. Categorise and track:

- **Discord OAuth dependent** (2) — cloud.spec.ts:178, 182
- **Workers runtime dependent** (4) — cloud-worker.spec.ts:277, 282, 286, 290
- **E2EE key exchange** (2) — integration.spec.ts:289, user-journeys.spec.ts:715
- **Federation** (1) — integration.spec.ts:363
- **Ban enforcement** (1) — integration.spec.ts:426
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

- **Tests:** 2187 passing, 71 skipped, 82 files
- **Packages:** 36
- **UI:** 22 views, 15 component directories, 9667 LOC
- **Client:** 1934 LOC
- **Server:** 1682 LOC
- **Total estimated LOC:** ~25,000+
