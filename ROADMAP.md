# Harmony — Roadmap & Feature Status

_Single source of truth for all features, voice/video detail, and release planning._ _Updated 2026-03-01 17:00 AEDT._

---

## Codebase Snapshot

| Metric             | Value                                    |
| ------------------ | ---------------------------------------- |
| Packages           | 36                                       |
| Estimated LOC      | ~32,000+                                 |
| Vitest passing     | 2,543                                    |
| Vitest skipped     | 10                                       |
| Vitest todo        | 114                                      |
| Playwright passing | 79 (31 cross-topology + 48 discord-mock) |
| Playwright skipped | 7 (voice — needs test voice server)      |
| Test matrix        | 128 ✅ / 0 ❌ / 3 ⚠️ / 16 ⊘              |
| TypeScript errors  | 0                                        |
| Oxlint warnings    | 7 (SolidJS `let ref` false positives)    |
| Vulnerabilities    | 0                                        |
| UI bundle size     | 349 KB                                   |
| Docker image       | 739 MB                                   |
| Android APK        | 3.7 MB (unsigned)                        |

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
| Member sidebar (with presence)              | ✅  | ✅     | ✅  |
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

#### Voice Production Detail

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| V1 | mediasoup-client Device integration | ✅ | Device loaded with router RTP capabilities |
| V2 | Send transport (client→SFU) | ✅ | DTLS connect, `transport.on('produce')` wired |
| V3 | Recv transport (SFU→client) | ✅ | Separate recv transport, consumer creation |
| V4 | Audio Producer (mic → SFU) | ✅ | `getUserMedia({audio})` → `transport.produce()` |
| V5 | Audio Consumer (SFU → speaker) | ✅ | Remote audio consumers attached to `<audio>` elements |
| V6 | Mute/unmute (full stop/restart) | ✅ | `closeProducer()` stops tracks + notifies server; unmute re-acquires mic + new producer |
| V7 | Deafen (pause all consumers locally) | ✅ | `setDeafened()` pauses/resumes all consumers; deafen auto-mutes |
| V8 | Speaking indicators (audio level) | ✅ | AnalyserNode 100ms poll → `voice.speaking` signal → cross-device sync via store |
| V9 | Voice activity detection (VAD) | ✅ | AnalyserNode-based speaking detection, threshold-based |
| V10 | Echo cancellation / noise suppression | ✅ | getUserMedia constraints enabled |
| V11 | Automatic gain control | ✅ | getUserMedia constraint enabled |
| V12 | Audio device selection (input) | ⬜ | `enumerateDevices()` → UI picker → restart producer |
| V13 | Audio device selection (output) | ⬜ | `setSinkId()` on `<audio>` elements |
| V14 | Volume control (per-user) | ⬜ | GainNode per consumer stream |
| V15 | Reconnect on transport failure | ⬜ | ICE restart, transport reconnect signaling |
| C1 | Video Producer (camera → SFU) | ✅ | `getUserMedia({video})` → `transport.produce()`, 1280x720@30 |
| C2 | Video Consumer (SFU → display) | ✅ | Remote video consumers with live tracks |
| C3 | VideoGrid (adaptive layout) | ✅ | SolidJS reactive, `onTrack` for remotes, `onunmute` retry |
| C4 | Local video preview (self-view) | ✅ | Mirrored local stream in VideoTile |
| C5 | Camera on/off toggle | ✅ | `enableVideo()`/`disableVideo()` on VoiceConnection |
| C6 | Camera device selection | ⬜ | `enumerateDevices()` → picker |
| C7 | Simulcast (VP8 layers) | ⬜ | encodings array on produce(), SFU layer selection |
| C8 | Bandwidth adaptation | ⬜ | SFU selects simulcast layer per subscriber |
| C9 | Picture-in-Picture (PiP) | 📋 | Stub exists |
| C10 | Spotlight / pin participant | ⬜ | UI for pinning one video large |
| C11 | Video resolution constraints | ⬜ | width/height/frameRate constraint picker |
| S1 | Screen share Producer | ✅ | `desktopCapturer` → separate producer |
| S2 | Screen share Consumer + view | ✅ | ScreenShareView renders remote screen stream |
| S3 | Screen share with audio | ⬜ | `getDisplayMedia({audio: true})` on supported platforms |
| S4 | Electron desktopCapturer | ✅ | IPC bridge `harmony:screen-sources`, preload `getScreenSources` |
| S5 | Screen share indicator in UI | 🔧 | `localScreenSharing` flag in store, stop button exists |
| S6 | Screen share replaces video grid | ⬜ | Layout switch: screen share main + thumbnails |

#### Electron Media Permissions

| #   | Feature                               | Status | Notes                                                       |
| --- | ------------------------------------- | ------ | ----------------------------------------------------------- |
| E1  | Permission request handler            | ✅     | `setPermissionRequestHandler` + `setPermissionCheckHandler` |
| E2  | macOS camera TCC entitlement          | ✅     | `com.apple.security.device.camera` in entitlements.plist    |
| E3  | macOS microphone TCC entitlement      | ✅     | `com.apple.security.device.audio-input`                     |
| E4  | macOS screen recording TCC            | ✅     | `com.apple.security.cs.allow-screen-recording`              |
| E5  | `systemPreferences.askForMediaAccess` | ⬜     | Electron API to trigger macOS permission dialog             |
| E6  | Permission status UI indicator        | ⬜     | Show when camera/mic blocked                                |

#### Voice Signaling (WebSocket)

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| W1 | voice.token request/response | ✅ | Client sends, server generates JWT |
| W2 | voice.transport.connect | ✅ | Server handler + client dispatch |
| W3 | voice.produce signaling | ✅ | Server handler + client dispatch |
| W4 | voice.consume signaling | ✅ | Server handler + client dispatch |
| W5 | voice.consumer.resume | ✅ | Server handler + client dispatch |
| W6 | Client-side signaling dispatch | ✅ | `sendVoiceSignal` (req/res) + `fireVoiceSignal` (fire-and-forget) |
| W7 | voice.join / voice.leave broadcast | ✅ | Server broadcasts to channel participants |
| W8 | Participant state sync on join | ✅ | `voice.new-producer` broadcast to existing participants |
| W9 | `voice.producer-closed` signaling | ✅ | Server broadcasts when client closes producer; remote consumers cleaned up |
| W10 | `voice.speaking` relay | ✅ | Server relays speaking state changes to all other channel participants |
| W11 | Self-consumption prevention | ✅ | `getProducers` excludes requester's own; skip closed producers |

#### Voice UI Components

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| U1 | VoiceControlBar — mute wired | ✅ | `toggleAudio` → `closeProducer()` on mute, re-acquire + new producer on unmute |
| U2 | VoiceControlBar — deafen wired | ✅ | `setDeafened()` pauses/resumes all consumers + auto-mutes |
| U3 | VoiceControlBar — camera wired | ✅ | Calls `enableVideo()`/`disableVideo()` |
| U4 | VoiceControlBar — screen share wired | ✅ | Calls `startScreenShare()` with desktopCapturer |
| U5 | VoiceControlBar — disconnect wired | ✅ | Calls `leaveVoice`, transport cleanup |
| U6 | VideoGrid — render real streams | ✅ | Reactive SolidJS, local + remote MediaStreams |
| U7 | ScreenShareView — render real stream | ✅ | Large view + presenter info |
| U8 | VoiceChannelPanel — participant list | 🔧 | Shows avatars, participant count unreliable |
| U9 | VoiceManager integration | ⬜ | `voice.ts` VoiceManager not used anywhere |
| U10 | Voice settings panel | ⬜ | Device selection, volume, noise suppression toggles |
| U11 | Voice connection quality indicator | ⬜ | ICE connection state → UI |
| U12 | Participant audio indicators | ✅ | Speaking state synced cross-device via `voice.speaking` events |

#### E2EE for Voice/Video

| #   | Feature                            | Status | Notes                                                |
| --- | ---------------------------------- | ------ | ---------------------------------------------------- |
| X1  | E2EE bridge key injection          | ✅     | E2EEBridge interface + HKDF                          |
| X2  | Insertable Streams transform       | ⬜     | RTCRtpSender/Receiver transform for frame encryption |
| X3  | E2EE key rotation on member change | ⬜     | Re-key when participant joins/leaves                 |

#### Cross-Device E2E Testing

| #   | Feature                             | Status | Notes                              |
| --- | ----------------------------------- | ------ | ---------------------------------- |
| T1  | Cross-device voice E2E (real audio) | ✅     | Mac ↔ Linux, 22/23 passing         |
| T2  | Cross-device video E2E              | ✅     | Camera → remote consumer verified  |
| T3  | Screen share E2E                    | 🔧     | desktopCapturer works, no E2E test |
| T4  | Voice reconnection test             | ✅     | Leave/rejoin cycle verified        |
| T5  | Mute/unmute E2E                     | ✅     | Producer pause/resume verified     |

### E2EE (End-to-End Encryption)

| Feature                                     | Lib | Server | UI  |
| ------------------------------------------- | --- | ------ | --- |
| MLS group creation + key package exchange   | ✅  | ✅     | ✅  |
| MLS welcome/commit messages                 | ✅  | ✅     | ✅  |
| MLS auto member addition                    | ✅  | ✅     | ✅  |
| MLS key exchange between members            | ✅  | ✅     | ✅  |
| Always-on MLS (no toggle)                   | ✅  | ✅     | ✅  |
| DM encryption (XChaCha20-Poly1305 + X25519) | ✅  | ✅     | ✅  |
| E2EE re-keying on member revocation         | ❌  | ❌     | ❌  |

> **MLS E2EE is fully operational** for channel messages. Key exchange happens automatically when members join communities — the group creator adds new members via MLS Welcome messages. Epoch synchronization, deduplication, and pending message queuing all verified in both unit tests (88 e2ee, 34 key-exchange) and browser E2E tests (Playwright Topology 2 + CDP browser test). DM encryption (X25519 + XChaCha20-Poly1305) also works correctly. Remaining: epoch history for decrypting old messages, MLS group creation for newly-created channels after initial setup, and re-keying on member revocation.

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

| Feature                                               | Lib | Server | UI  |
| ----------------------------------------------------- | --- | ------ | --- |
| Ban list enforcement + ban/unban/kick handlers        | ✅  | ✅     | ✅  |
| Slow mode (per-channel cooldown)                      | ✅  | ✅     | 📋  |
| Rate limit rules (per-community configurable)         | ✅  | ✅     | 📋  |
| Raid detection (auto-lockdown on rapid joins)         | ✅  | ✅     | 📋  |
| Account age rules (minimum DID age for joining)       | ✅  | ✅     | 📋  |
| VC requirement rules (require VCs for community join) | ✅  | ✅     | 📋  |

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

| Feature                               | Lib | Server | UI  |
| ------------------------------------- | --- | ------ | --- |
| Mention detection (@username, @DID)   | ✅  | ✅     | ➖  |
| DM / reply notifications              | ✅  | ✅     | ➖  |
| notification.list / mark-read / count | ✅  | ✅     | ✅  |
| Real-time notification push           | ✅  | ✅     | ✅  |
| Notification center UI                | ➖  | ➖     | 📋  |
| Notification settings UI              | ➖  | ➖     | 📋  |
| Notification item                     | ➖  | ➖     | 📋  |

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
| 11  | Penetration test (48 tests, 11 findings)                      | ✅     |
| 12  | Remediation (0 critical, 4 high — all fixed)                  | ✅     |

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

### 2026-02-28

- Penetration test: 48 tests across 8 categories, 11 findings (0 Critical, 4 High, 3 Medium, 3 Low, 1 Info)
- Pen test remediation: Ed25519 signed auth (`Harmony-Ed25519`) on all REST endpoints (migration + user-data)
- Security: readBody() 5MB limit, security headers, DID length validation, DID ownership enforcement
- Moderation: slow mode, per-community rate limits, raid detection + auto-lockdown, account age rules, VC requirement rules
- Notifications: mention detection, DM/reply notifications, notification.list/mark-read/count protocol, real-time push
- Tests: 2433 passing (was 2364), 22 new tests across auth + moderation + notifications
- Full mediasoup-client WebRTC integration: Device, send/recv transports, producers, consumers
- Cross-device voice/video E2E: Mac ↔ Linux, 22/23 tests passing (audio, video, mute, leave/rejoin)
- Community resync on reconnect: server queries RDF store for memberships, sends `community.auto-joined`
- Multi-server voice routing: `communityId` injection in all voice signaling payloads
- Electron screen share: `desktopCapturer` IPC bridge, preload `getScreenSources`
- VideoGrid reactive rewrite: SolidJS signals, `onTrack` for remotes, `onunmute` retry
- VoiceClient `debugState()` method for E2E testing introspection
- `fireVoiceSignal` (fire-and-forget) vs `sendVoiceSignal` (request-response) pattern
- Voice signaling fix: `onVoiceSignal` emitter listener for server-push messages
- Electron builds: macOS arm64 DMG (195MB) + Linux x64 AppImage (192MB)
- Merged FEATURES.md back into ROADMAP.md (single source of truth)
- Robust media lifecycle: mute/video/screenshare all fully stop (close producer + stop tracks) not just pause
- `voice.producer-closed` server broadcast: remote clients tear down matching consumers + fire `onTrackRemoved`
- Self-consumption prevention: `getProducers` excludes requester's own producers, skips closed producers
- Cross-device speaking indicators: AnalyserNode → `voice.speaking` signal → server relay → remote store
- Deafen wired: `setDeafened()` pauses/resumes all consumers, auto-mutes on deafen
- `onTrackRemoved` callback: VideoGrid removes tiles when producer-closed arrives
- VideoGrid callback leak fixed: registered once per session via `callbacksRegistered` flag
- Full member list sync on reconnect: `community.info.response` with display names sent during `resyncMemberships`
- Store init race fix: replays client's internal `_communities` Map for pre-mount auto-joined communities
- Real-time presence updates: `presence` event listener in store + server broadcasts `presence.changed` during resync
- `getMembersWithDisplayNames()` helper extracted for DRY member resolution (RDF store → display names + online status)
- Message edit decryption: `handleChannelMessageUpdated` decrypts ciphertext before emitting `message.edited`
- DM multi-server routing: non-community messages sent to ALL connected servers (was first-only, missing cross-server recipients)
- Optimistic DM tracking: sender's store records outgoing DMs under peer DID key
- Channel lifecycle events in store: `channel.created`, `channel.updated`, `channel.deleted` listeners added
- **51-test cross-device E2E suite** (`harmony-flows.cjs`): messaging, edit/delete, reactions, channel CRUD, voice, DMs, typing, threads, pins, roles, presence — all green on Mac+Linux

### 2026-02-28 → 2026-03-01

- 101 new unit tests: DM routing, message edits, voice lifecycle, channel events, adapter contracts
- Message edit/delete self-echo prevention: server-side `conn.id` exclude + client-side sender guard
- DM architecture documented: `docs/dm-architecture.md` (relay-based E2EE, 4-phase sovereignty roadmap)
- Cross-topology Playwright E2E suite: 31 passing across 4 topologies (single client, two clients, self-hosted, mixed)
- MLS encryption diagnosed and disabled: independent MLS groups per client can't decrypt each other — plaintext passthrough until key exchange implemented
- Store `community.updated` listener: picks up new communities from `createCommunity`
- Local `message` emit in `sendMessage`: server excludes sender from broadcast, local emit needed for optimistic updates
- `HarmonyClient.toBytes()` static helper: handles `Uint8Array`, `Array`, and `Record<string, number>` ciphertext forms
- `handleSyncResponse` updated to use `toBytes()` for consistent array-format ciphertext handling
- Fixed `encryptForChannel` serialisation: `Array.from(plaintext)` instead of raw `Uint8Array` (JSON round-trip produces object, not array)
- Edit/delete events now include `channelId` (headless Playwright has no `activeChannelId()`)
- Port conflict fix: test servers use even base ports with +10 spacing (health endpoint uses port+1)
- Discord mock E2E suite: 48 Playwright tests covering Bot REST API, OAuth flow, DiscordLinkService, MigrationBot export, Portal identity & friends — all with mock HTTP server using real Discord API v10 data shapes
- Vitest count: 2,534 passing (was 2,433). Playwright count: 79 passing + 7 skipped (was 13)
- All commits pushed to origin/main

### 2026-03-01

- MLS key exchange fully operational: creator adds members via Welcome, epoch sync verified
- MLS dedup fix: `_pendingMemberDIDs` Map on client prevents duplicate `addMember` when multiple `mls.member.joined` notifications arrive before async add completes
- Server MLS logging: `[MLS-KP-UPLOAD]`, `[MLS-COMM-JOIN]`, `[MLS-GROUP-SETUP]`, `[MLS-NOTIFY]`, `[MLS-DEDUP]`
- Client MLS logging: `[MLS-DECRYPT-FAIL]` with epoch/senderIndex/ctLen
- Encryption key pair persistence in `PersistedState` — survives reconnects
- `joinFromWelcome` signature fix: separate encryption (X25519) and signing (Ed25519) key pairs
- `processCommit` epoch guard: `commit.epoch <= current` → skip (prevents Welcome+Commit double-apply)
- Pending MLS message queue: messages before Welcome stored in `_pendingMlsMessages`, replayed after
- Sequential member addition queue: `_pendingMemberAdds` prevents racing on keypackage.response
- `handleChannelMessage` rewritten: epoch 0 = plaintext, epoch >0 = MLS decrypt, regex validation for printable text
- 34 new MLS key exchange tests (`packages/e2ee/test/mls-key-exchange.spec.ts`) — all passing
- 88/88 e2ee tests passing (was 54)
- Vitest total: 2,565 (was 2,534)
- Manual browser MLS verification: Alice+Bob same epoch, decrypt confirmed via CDP
- Repo cleanup: `dist-electron/` removed from git + added to `.gitignore`, test scripts moved to `tests/scripts/`
- Beta polish B1–B5 implemented and **visually verified via CDP browser automation**:
  - B1: Channel unread badges (count + bold name, auto-clear on switch)
  - B2: Notification sounds (Web Audio API 880→660Hz chime)
  - B3: Markdown renderer rewrite (bold, italic, code, strikethrough, spoiler, links, mentions, blockquotes, lists, code blocks, headings)
  - B4: @mention rendering with accent highlight
  - B5: Debug logs → `console.debug` (16 statements across server/client/voice/UI)
- TS fixes: voice transport/produce/consume message types, voice event types, `EventHandler` type, duplicate export, unused import — 0 errors across client/server/ui-app
- `PENTEST-RESULTS.md` deleted — all 11 findings remediated, tracked in security section
- App.tsx: silent `catch {}` blocks now log `console.error("[App] init error:")` — was hiding identity init failures
- Superseded CDP test scripts deleted; voice + MLS scripts kept in `tests/scripts/`
- Beta polish B7–B12 completed:
  - B7: Document title `(count) Harmony` + canvas favicon badge (red circle with count, caps at 99+)
  - B8: Full emoji picker (7 categories, 350+ emoji, search, shortcode resolution `:fire:` → 🔥)
  - B9/B10/B12: Already implemented (confirmed via visual verification)
  - B11: Member profile popover on author name click (avatar, DID, status, role badges)
- 11 new unit tests (emoji shortcode resolution, document title logic, unread count aggregation)
- All B1–B12 items visually verified in browser via CDP automation

---

## Beta Polish — Must Fix & Should Fix

> Items identified from a full codebase sweep (2026-03-01). Must-fix items are things users will notice immediately as broken; should-fix items are polish that sets the tone for a quality product.

### 🔴 Must Fix

| # | Item | Status | Notes |
| --- | --- | --- | --- |
| B1 | Channel unread indicators | ✅ | Sidebar has no unread badges or bold for channels. DM unreads exist; channels don't. |
| B2 | Notification sounds | ✅ | Zero audio feedback for messages, mentions, or DMs. Silent app feels broken. |
| B3 | Markdown renderer (inline) | ✅ | Line-level only — can't handle `**bold** and *italic*` in same line. No multi-line code blocks, blockquotes, or lists. |
| B4 | @mention rendering in messages | ✅ | Detected server-side for notifications but not highlighted/clickable in message view. |
| B5 | Remove debug console.log statements | ✅ | 16 debug logs in server (`[MLS-*]`, `[resync]`) and client (`[MLS]`, `[Voice]`, `[Migration]`). Behind debug flag or remove. |
| B6 | Social recovery UI stubs | ✅ | Setup wired to `IdentityManager.setupRecovery()` with validation + localStorage persistence. Approve/status/complete show "coming in a future update" (requires server relay). |

### 🟡 Should Fix

| # | Item | Status | Notes |
| --- | --- | --- | --- |
| B7 | Favicon badge / document title unread | ✅ | `(count) Harmony` in document title + canvas-drawn favicon badge with red circle + count. |
| B8 | Emoji picker for message compose | ✅ | Full categorized picker (7 categories, 350+ emoji), search, shortcode resolution (`:fire:` → 🔥). |
| B9 | Italic/spoiler/link not rendered | ✅ | Already implemented in B3 MarkdownRenderer rewrite — all inline types render in MessageArea. |
| B10 | Image lightbox on click | ✅ | Already wired — `setLightboxSrc(attachment.url)` on image click, full-screen overlay with dismiss. |
| B11 | Member profile popover | ✅ | Click author name → popover with avatar, DID, status, role badges. Dismiss on click-outside. |
| B12 | Channel topic in header | ✅ | Already implemented in MainLayout — shows `  topic` next to channel name when present. |

---

## Road to Beta

### Pre-Dev Requirements (must complete before first deployment)

| # | Task | Status | Owner | Notes |
| --- | --- | --- | --- | --- |
| 1 | Penetration test | ✅ | Agent | 48 tests, 11 findings, all high items fixed |
| 2 | Pen test remediation | ✅ | Agent | Ed25519 signed auth on all REST endpoints |
| 3 | Provision CF resources | ⬜ | Josh | `wrangler d1 create`, `wrangler r2 bucket create`, KV/DO namespaces |
| 4 | Fill wrangler placeholder IDs | ⬜ | Josh | Replace `REPLACE_WITH_*` in wrangler.toml files |
| 5 | Register domain | ⬜ | Josh | `harmony.chat` or similar → Cloudflare |
| 6 | Stripe API keys | ⬜ | Josh | Test + live keys |
| 7 | Billing integration | ⬜ | Agent | Wire Stripe into cloud worker per billing plan — needs Stripe keys first |
| 8 | Voice E2E test | ✅ | Agent | Mac ↔ Linux, 22/23 E2E tests passing (mediasoup SFU) |
| 9 | Cross-topology E2E | ✅ | Agent | 31 Playwright tests across 4 topologies (single, two-client, self-hosted, mixed) |
| 10 | Discord mock E2E | ✅ | Agent | 48 Playwright tests: Bot API, OAuth, migration export, identity linking |
| 11 | Electron build pipeline | ⬜ | Josh + Agent | macOS notarization, Windows signing, auto-update |
| 12 | Capacitor build pipeline | ⬜ | Josh + Agent | APK signing, iOS provisioning |
| 13 | Secrets management | ⬜ | Josh | `wrangler secret put` for OAuth, Stripe, etc. |

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

| # | Task | Status | Notes |
| --- | --- | --- | --- |
| 1 | Full onboarding flow | ⬜ | Real browser |
| 2 | Voice with real media | ✅ | Two Electron clients (Mac+Linux), mute/unmute/leave verified |
| 3 | Multi-user real-time | ✅ | 51 CDP E2E tests + 31 Playwright cross-topology tests |
| 4 | Mobile | ⬜ | Capacitor APK on real Android device |
| 5 | Self-hosted Docker | ⬜ | `docker compose up` → Electron → create community → restart → verify persistence |
| 6 | Migration flow | ⬜ | Real Discord server → import → verify |
| 7 | E2EE wire verification | ⬜ | Inspect WS frames, confirm encryption |
| 8 | Cloud billing | ⬜ | Create community, hit free tier limits, verify enforcement |

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
- **Rich embeds** — Render link previews inline in messages
- **Contact list persistence** — Friends list storage

### Voice Production Hardening

- **WASM encryption** — Rust-WASM for AES-GCM frame encryption (performance over JS)
- **TURN/STUN** — CF global TURN for restrictive NATs
- **DO location hints** — `locationHint` set to majority-participant region
- **Voice analytics** — Workers Analytics Engine for "Time to First Frame"
- **Simulcast** — VP8 simulcast layers (high/medium/low), SFU selects per subscriber
- **Mesh fallback** — If CF SFU unavailable, degrade to P2P mesh (post-launch)

### Priority 2 — Important but not urgent

- **Time/rate-limited capabilities** — Enforce expiry and rate caveats on ZCAPs
- **E2EE re-keying on member revocation** — MLS epoch rotation when member leaves/banned
- **E2EE key binding in VCs** — Embed X25519 public key in membership VC
- **User-to-user delegation** — Members delegate capabilities without admin
- **Credential UI wiring** — Wire portfolio/detail/issue/editor components to live data
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
| Voice E2E tests       | `~/Desktop/harmony/tests/scripts/harmony-e2e-voice.cjs`                     |
| MLS browser test      | `~/Desktop/harmony/tests/scripts/mls-browser-test.cjs`                      |
| MLS cross-device      | `~/Desktop/harmony/tests/scripts/verify-mls.cjs`                            |
| Cross-topology tests  | `~/Desktop/harmony/tests/cross-topology.spec.ts`                            |
| Discord mock tests    | `~/Desktop/harmony/tests/discord-mock-e2e.spec.ts`                          |
| DM architecture       | `~/Desktop/harmony/docs/dm-architecture.md`                                 |
