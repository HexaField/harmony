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

---

## Pre-Launch — Required (Batch 2)

### 🚩 ZCAP Verification (CRITICAL)

**Current state:** `verifyZCAPProof()` in server only checks JSON shape — does NOT verify cryptographic chain. Comment on line 1560: "In a full implementation, we'd fetch the capability chain and verify."

This means anyone sending a message with the right `proof` structure passes authorization. Undermines the entire security model.

- [ ] Implement real ZCAP chain verification in `verifyZCAPProof()`
  - Walk the delegation chain from invocation → parent → ... → root
  - Verify each signature cryptographically using `ZCAPService.verify()`
  - Enforce attenuation — child can't exceed parent's `allowedAction` or `scope`
  - Check expiry on time-limited capabilities
- [ ] Evaluate caveats during verification (type exists but is never checked)
- [ ] Reject messages that fail ZCAP verification (currently all pass)
- [ ] Integration tests: valid chain passes, broken chain rejected, expired capability rejected, over-scoped delegation rejected

### Media Upload & File Sharing

**Current state:** Protocol defines `media.upload.request` / `media.upload.complete` message types. `media-client.ts` (220 LOC), `media-storage.ts` (114 LOC), `thumbnail.ts`, `checksum.ts` all exist. `AttachmentRef` type on messages. **Server has no handler** — these messages are silently dropped.

- [ ] Server: add `media.upload.request` handler — generate signed upload URL or accept inline upload
- [ ] Server: add `media.upload.complete` handler — store metadata, broadcast to channel
- [ ] Server: serve uploaded files (or proxy to storage backend)
- [ ] Client: wire `mediaClient.upload()` into message composition
- [ ] UI: file picker button in message input
- [ ] UI: attachment preview in messages (images inline, other files as download links)
- [ ] UI: drag-and-drop file upload
- [ ] UI: upload progress indicator
- [ ] Image paste from clipboard
- [ ] File size limits + type validation
- [ ] Tests: upload flow, download, size rejection, inline image rendering

### Role Management

**Current state:** `RoleManagerView.tsx` exists in UI. Protocol defines `role.created` / `role.updated` / `role.deleted` events. **Server has no `role.create` / `role.update` / `role.delete` handlers.** Members have a `roles: string[]` but only `'admin'` is ever set.

- [ ] Server: `role.create` handler — create role with name, color, permissions set
- [ ] Server: `role.update` handler — modify role properties
- [ ] Server: `role.delete` handler — remove role, strip from members
- [ ] Server: `role.assign` / `role.remove` handlers — add/remove role on a member
- [ ] Server: persist roles in community state (in-memory map + quads)
- [ ] Server: permission checks — role-based channel access (read/write/manage per channel per role)
- [ ] Client: role management methods on HarmonyClient
- [ ] UI: wire RoleManagerView to real server calls (currently may be stub)
- [ ] UI: role badges on member list
- [ ] UI: channel permission overrides per role
- [ ] Issue corresponding ZCAP when role is assigned (role → capabilities mapping)
- [ ] Tests: create role, assign to member, verify permissions enforced, delete role

### Pins

**Current state:** Not implemented anywhere — no server handler, no client method, no UI.

- [ ] Protocol: add `channel.pin` / `channel.unpin` message types
- [ ] Server: pin handler — store pinned message IDs per channel (max 50?)
- [ ] Server: `channel.pins.list` handler — return pinned messages
- [ ] Server: broadcast `channel.message.pinned` / `channel.message.unpinned` events
- [ ] Client: `pinMessage()` / `unpinMessage()` / `getPinnedMessages()` methods
- [ ] UI: pin button on message hover/context menu
- [ ] UI: pinned messages panel (icon in channel header → slide-out list)
- [ ] UI: "X pinned a message" system message in chat
- [ ] Tests: pin, unpin, list, max pin limit

### Voice & Video

**Current state:** Library exists (520 LOC, LiveKit adapter), `VoiceControlBar` view, `e2ee-bridge.ts` (31 LOC), store wiring. 4 skipped voice tests.

- [ ] Document LiveKit setup in GUIDE.md (server URL, API key/secret)
- [ ] Server: voice channel state tracking (who's in which voice channel)
- [ ] Server: voice token generation (LiveKit JWT)
- [ ] Test voice join/leave/mute flow end-to-end
- [ ] Screen sharing — add to LiveKit adapter, UI button + stream display
- [ ] Video — camera toggle, video grid layout in voice channel
- [ ] E2EE bridge for voice (wire e2ee-bridge.ts into voice sessions)
- [ ] UI: voice channel indicators (show connected users, speaking indicator)
- [ ] UI: video grid / screen share viewer
- [ ] Un-skip voice tests + add new tests for screen share, video

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

## Plan v1 Gap Summary

Features from `harmony-plan-v1.md` not in codebase or future plans above:

| Feature                         | Plan Section      | Status            |
| ------------------------------- | ----------------- | ----------------- |
| ZCAP chain verification         | Core Architecture | **🚩 Pre-launch** |
| Media upload                    | Phase 3 parity    | **🚩 Pre-launch** |
| Role CRUD + permissions         | Core Architecture | **🚩 Pre-launch** |
| Pins                            | Phase 3 parity    | **🚩 Pre-launch** |
| Voice/Video/Screen share        | Phase 3 parity    | **🚩 Pre-launch** |
| Multi-level ZCAP delegation     | Core Architecture | Post-launch       |
| ZCAP caveats (time/rate limits) | Core Architecture | Post-launch       |
| VC key binding + re-keying      | Core Architecture | Post-launch       |
| VC admission policies           | Core Architecture | Post-launch       |
| Cross-community trust           | Core Architecture | Post-launch       |
| User-to-user delegation         | Core Architecture | Post-launch       |
| Rich embeds rendering           | Phase 3 parity    | Post-launch       |
| Revenue tiers                   | Revenue Model     | Post-launch       |
| Custom domains                  | Revenue Model     | Post-launch       |
| SSO / enterprise                | Revenue Model     | Post-launch       |
| GDPR member opt-out             | Migration         | Post-launch       |
| Privacy notice template         | Migration         | Post-launch       |
| Personal data export            | Migration         | Post-launch       |
| `did:web` / `did:plc`           | Identity Layer    | Post-launch       |
| VC portfolio UI                 | Core Architecture | Post-launch       |
| Bot per-channel scoping         | Core Architecture | Post-launch       |

---

## Stats Snapshot (2026-02-26)

- **Tests:** 2253 passing, 68 skipped, 90 files
- **Packages:** 36
- **UI:** 23 views, 16 component directories, ~10,000 LOC
- **Client:** ~1980 LOC
- **Server:** ~1800 LOC
- **Total estimated LOC:** ~28,000+
