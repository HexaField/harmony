# Harmony — Feature Matrix

_Generated 2026-02-27. Based on codebase analysis of ~32,000+ LOC across 36 packages._

## Legend

✅ Fully implemented and tested | 🔧 Implemented, not fully wired/tested | 📋 Stub/interface only | ❌ Not implemented | ➖ N/A

## Deployment Targets

| Target           | Description                                           |
| ---------------- | ----------------------------------------------------- |
| **Electron**     | Desktop app — embedded server-runtime + UI renderer   |
| **Local Server** | Self-hosted `server-runtime` daemon (SQLite-backed)   |
| **Cloud Web UI** | Browser-based SPA connecting to cloud/local server    |
| **Portal**       | `portal-worker` on Cloudflare (D1, R2, KV)            |
| **Cloud Server** | `cloud-worker` Durable Objects (one DO per community) |
| **Mobile**       | Capacitor (Android) + PWA service worker              |

---

## Identity & Authentication

| Feature | Electron | Local Server | Cloud Web UI | Portal | Cloud Server | Mobile |
| --- | --- | --- | --- | --- | --- | --- |
| DID:key creation | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| DID:key resolution (DID documents) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| DID:web / DID:plc support | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Identity persistence (config file) | ✅ | ✅ | ➖ | ➖ | ➖ | 🔧 |
| Identity persistence (localStorage) | ➖ | ➖ | ✅ | ➖ | ➖ | ✅ |
| Mnemonic backup (BIP-39) | ✅ | ✅ | ✅ | ➖ | ➖ | ✅ |
| Mnemonic recovery | ✅ | ✅ | ✅ | ➖ | ➖ | ✅ |
| Social recovery (guardian setup) | 🔧 | ➖ | ✅ | ➖ | ✅ | ✅ |
| Social recovery (initiate/approve/complete) | 🔧 | ➖ | ✅ | ➖ | ✅ | ✅ |
| VP-based authentication (handshake) | ✅ | ✅ | ✅ | ➖ | ✅ | ✅ |
| Biometric lock | ➖ | ➖ | ➖ | ➖ | ➖ | ✅ |
| Discord OAuth linking | ➖ | ➖ | ✅ | ✅ | ✅ | 🔧 |
| Display name / profile | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Pseudonym generation (deterministic) | ✅ | ✅ | ✅ | ➖ | ➖ | ✅ |

## Verifiable Credentials

| Feature                               | Electron | Local Server | Cloud Web UI | Portal | Cloud Server | Mobile |
| ------------------------------------- | -------- | ------------ | ------------ | ------ | ------------ | ------ |
| VC issuance (membership credentials)  | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| VC verification (signature check)     | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| VC revocation (revocation store)      | ✅       | ✅           | 🔧           | ➖     | 🔧           | 🔧     |
| Credential type registry              | 📋       | 📋           | 📋           | ➖     | ➖           | 📋     |
| Custom credential types per community | ❌       | ❌           | ❌           | ❌     | ❌           | ❌     |
| VC portfolio UI                       | ❌       | ➖           | ❌           | ➖     | ➖           | ❌     |
| Reputation engine                     | 📋       | 📋           | 📋           | ➖     | ➖           | 📋     |
| Cross-community trust service         | 📋       | 📋           | 📋           | ➖     | ➖           | 📋     |
| VC-based admission policies           | ❌       | ❌           | ❌           | ❌     | ❌           | ❌     |
| E2EE key binding in VCs               | ❌       | ❌           | ❌           | ❌     | ❌           | ❌     |

## ZCAP (Authorization Capabilities)

| Feature                                  | Electron | Local Server | Cloud Web UI | Portal | Cloud Server | Mobile |
| ---------------------------------------- | -------- | ------------ | ------------ | ------ | ------------ | ------ |
| Root capability creation                 | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Single-level delegation (admin → member) | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Chain verification (cryptographic)       | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Action scope checking                    | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Revocation checking                      | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Multi-level delegation chains            | ❌       | ❌           | ❌           | ❌     | ❌           | ❌     |
| Time-limited capabilities                | ❌       | ❌           | ❌           | ❌     | ❌           | ❌     |
| Rate-limited capabilities (caveats)      | ❌       | ❌           | ❌           | ❌     | ❌           | ❌     |
| User-to-user delegation                  | ❌       | ❌           | ❌           | ❌     | ❌           | ❌     |
| AI agent ZCAPs                           | ❌       | ❌           | ❌           | ❌     | ❌           | ❌     |

## Messaging

| Feature                            | Electron | Local Server | Cloud Web UI | Portal | Cloud Server | Mobile |
| ---------------------------------- | -------- | ------------ | ------------ | ------ | ------------ | ------ |
| Send message (channel.send)        | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Edit message (channel.edit)        | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Delete message (channel.delete)    | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Typing indicators (channel.typing) | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Reactions (add/remove)             | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Message history (sync.request)     | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Lamport clock ordering (CRDT)      | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Reply-to (message references)      | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Message context menu               | ➖       | ➖           | ✅           | ➖     | ➖           | ✅     |
| Virtual scrolling (message list)   | ➖       | ➖           | ✅           | ➖     | ➖           | ✅     |
| Link previews (OpenGraph)          | 📋       | 📋           | 📋           | ➖     | ➖           | 📋     |
| Rich embeds rendering              | ❌       | ❌           | ❌           | ❌     | ❌           | ❌     |
| Code block syntax highlighting     | ❌       | ❌           | ❌           | ❌     | ❌           | ❌     |

## Direct Messages

| Feature                      | Electron | Local Server | Cloud Web UI | Portal | Cloud Server | Mobile |
| ---------------------------- | -------- | ------------ | ------------ | ------ | ------------ | ------ |
| DM send (dm.send)            | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| DM typing indicator          | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| DM key exchange (X25519)     | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| DM E2EE (XChaCha20-Poly1305) | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| DM edit/delete               | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| DM list UI                   | ➖       | ➖           | ✅           | ➖     | ➖           | ✅     |
| DM conversation view         | ➖       | ➖           | ✅           | ➖     | ➖           | ✅     |
| New DM modal                 | ➖       | ➖           | ✅           | ➖     | ➖           | ✅     |
| DM unread count              | ➖       | ➖           | 🔧           | ➖     | ➖           | 🔧     |

## Threads

| Feature                         | Electron | Local Server | Cloud Web UI | Portal | Cloud Server | Mobile |
| ------------------------------- | -------- | ------------ | ------------ | ------ | ------------ | ------ |
| Thread creation (thread.create) | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Thread send (thread.send)       | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Thread side panel UI            | ➖       | ➖           | ✅           | ➖     | ➖           | ✅     |
| Reply count on parent messages  | ➖       | ➖           | ✅           | ➖     | ➖           | ✅     |

## Communities & Channels

| Feature                                    | Electron | Local Server | Cloud Web UI | Portal | Cloud Server | Mobile |
| ------------------------------------------ | -------- | ------------ | ------------ | ------ | ------------ | ------ |
| Community creation                         | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Community join                             | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Community leave                            | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Community info / list                      | ✅       | ✅           | ✅           | ✅     | ✅           | ✅     |
| Community settings UI                      | ➖       | ➖           | ✅           | ➖     | ➖           | ✅     |
| Channel creation (text/voice/announcement) | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Channel update (name/topic)                | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Channel delete                             | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Channel settings modal                     | ➖       | ➖           | ✅           | ➖     | ➖           | ✅     |
| Channel sidebar                            | ➖       | ➖           | ✅           | ➖     | ➖           | ✅     |
| Channel pins (pin/unpin/list)              | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Server list bar (multi-community)          | ➖       | ➖           | ✅           | ➖     | ➖           | ✅     |
| Member sidebar                             | ➖       | ➖           | ✅           | ➖     | ➖           | ✅     |
| Member list (with presence)                | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Join via invite code                       | ✅       | ✅           | ✅           | ✅     | ✅           | ✅     |
| Create community modal                     | ➖       | ➖           | ✅           | ➖     | ➖           | ✅     |
| Create channel modal                       | ➖       | ➖           | ✅           | ➖     | ➖           | ✅     |
| Empty state view                           | ➖       | ➖           | ✅           | ➖     | ➖           | ✅     |
| Community ban/unban                        | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Member kick                                | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |

## Presence

| Feature                                   | Electron | Local Server | Cloud Web UI | Portal | Cloud Server | Mobile |
| ----------------------------------------- | -------- | ------------ | ------------ | ------ | ------------ | ------ |
| Presence update (online/idle/dnd/offline) | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Custom status text                        | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Presence broadcast to community           | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |

## Roles & Permissions

| Feature                          | Electron | Local Server | Cloud Web UI | Portal | Cloud Server | Mobile |
| -------------------------------- | -------- | ------------ | ------------ | ------ | ------------ | ------ |
| Role CRUD (create/update/delete) | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Role assign/remove               | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Permission-gated operations      | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Admin-only enforcement           | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Role manager UI                  | ➖       | ➖           | 🔧           | ➖     | ➖           | 🔧     |
| Role event broadcast             | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |

## Voice & Video

| Feature | Electron | Local Server | Cloud Web UI | Portal | Cloud Server | Mobile |
| --- | --- | --- | --- | --- | --- | --- |
| Voice join/leave | ✅ | ✅ | ✅ | ➖ | ✅ | 🔧 |
| WebRTC signalling (offer/answer/ICE) | ✅ | ✅ | ✅ | ➖ | ✅ | 🔧 |
| Mute/unmute | ✅ | ✅ | ✅ | ➖ | ✅ | 🔧 |
| Speaking indicators | ✅ | ✅ | ✅ | ➖ | ✅ | 🔧 |
| Video enable/disable | ✅ | ✅ | ✅ | ➖ | ✅ | 🔧 |
| Screen sharing (start/stop) | ✅ | ✅ | ✅ | ➖ | ✅ | ❌ |
| Video grid (adaptive layout) | ➖ | ➖ | ✅ | ➖ | ➖ | 🔧 |
| Screen share view | ➖ | ➖ | ✅ | ➖ | ➖ | 🔧 |
| Voice control bar | ➖ | ➖ | ✅ | ➖ | ➖ | ✅ |
| Voice channel panel (participant indicators) | ➖ | ➖ | ✅ | ➖ | ➖ | ✅ |
| Voice PiP (picture-in-picture) | ➖ | ➖ | ✅ | ➖ | ➖ | ✅ |
| SFUAdapter interface (pluggable) | ✅ | ✅ | ✅ | ➖ | ✅ | ✅ |
| Mediasoup adapter (self-hosted SFU) | ✅ | ✅ | ✅ | ➖ | ➖ | 🔧 |
| Cloudflare Realtime adapter (cloud SFU) | ➖ | ➖ | ➖ | ➖ | ✅ | ➖ |
| VoiceRoomDO (cloud voice coordination) | ➖ | ➖ | ➖ | ➖ | ✅ | ➖ |
| E2EE bridge (Insertable Streams + HKDF) | ✅ | ➖ | ✅ | ➖ | ➖ | 🔧 |
| Voice token exchange | ✅ | ✅ | ✅ | ➖ | ✅ | ✅ |

## E2EE (End-to-End Encryption)

| Feature                             | Electron | Local Server | Cloud Web UI | Portal | Cloud Server | Mobile |
| ----------------------------------- | -------- | ------------ | ------------ | ------ | ------------ | ------ |
| MLS group creation                  | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| MLS key package upload/fetch        | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| MLS welcome/commit messages         | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| MLS auto member addition            | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Always-on MLS (no toggle)           | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| DM encryption (XChaCha20-Poly1305)  | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| DM key exchange (X25519)            | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| E2EE re-keying on member revocation | ❌       | ❌           | ❌           | ❌     | ❌           | ❌     |

## Media & Files

| Feature | Electron | Local Server | Cloud Web UI | Portal | Cloud Server | Mobile |
| --- | --- | --- | --- | --- | --- | --- |
| Media upload request (server handler) | ✅ | ✅ | ✅ | ➖ | ✅ | ✅ |
| Media delete | ✅ | ✅ | ✅ | ➖ | ✅ | ✅ |
| MIME validation | ✅ | ✅ | ✅ | ➖ | ✅ | ✅ |
| 10MB size limit | ✅ | ✅ | ✅ | ➖ | ✅ | ✅ |
| Membership check on upload | ✅ | ✅ | ✅ | ➖ | ✅ | ✅ |
| `uploadMediaToServer()` client method | ✅ | ✅ | ✅ | ➖ | ✅ | ✅ |
| `sendMessageWithAttachments()` | ✅ | ✅ | ✅ | ➖ | ✅ | ✅ |
| Attachment display (inline images + download) | ➖ | ➖ | ✅ | ➖ | ➖ | ✅ |
| File upload UI (preview chips) | ➖ | ➖ | ✅ | ➖ | ➖ | ✅ |
| Link preview (OpenGraph fetch) | 📋 | 📋 | 📋 | ➖ | ➖ | 📋 |
| Thumbnail generation | 📋 | 📋 | 📋 | ➖ | ➖ | 📋 |
| File checksum verification | 📋 | 📋 | 📋 | ➖ | ➖ | 📋 |
| Media storage (server-side) | ✅ | ✅ | ➖ | ✅ | 🔧 | ➖ |
| Image gallery | ➖ | ➖ | ✅ | ➖ | ➖ | ✅ |
| R2 blob storage | ➖ | ➖ | ➖ | ✅ | ➖ | ➖ |

## Moderation

| Feature                            | Electron | Local Server | Cloud Web UI | Portal | Cloud Server | Mobile |
| ---------------------------------- | -------- | ------------ | ------------ | ------ | ------------ | ------ |
| Slow mode rules                    | 📋       | 📋           | 📋           | ➖     | ➖           | 📋     |
| Rate limit rules                   | 📋       | 📋           | 📋           | ➖     | ➖           | 📋     |
| Account age rules                  | 📋       | 📋           | 📋           | ➖     | ➖           | 📋     |
| Raid detection rules               | 📋       | 📋           | 📋           | ➖     | ➖           | 📋     |
| VC requirement rules               | 📋       | 📋           | 📋           | ➖     | ➖           | 📋     |
| Ban list enforcement (server-side) | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Ban/unban handlers                 | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| Kick members                       | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |

## Governance

| Feature | Electron | Local Server | Cloud Web UI | Portal | Cloud Server | Mobile |
| --- | --- | --- | --- | --- | --- | --- |
| Governance engine (proposals) | 📋 | 📋 | 📋 | ➖ | ➖ | 📋 |
| Constitution (rules/constraints) | 📋 | 📋 | 📋 | ➖ | ➖ | 📋 |
| Delegation manager | 📋 | 📋 | 📋 | ➖ | ➖ | 📋 |
| Agent auth manager | 📋 | 📋 | 📋 | ➖ | ➖ | 📋 |
| Audit log | 📋 | 📋 | 📋 | ➖ | ➖ | 📋 |
| Quorum evaluation | 📋 | 📋 | 📋 | ➖ | ➖ | 📋 |
| Action execution | 📋 | 📋 | 📋 | ➖ | ➖ | 📋 |
| Create proposal (client method) | 📋 | 📋 | 📋 | ➖ | ➖ | 📋 |
| Sign/vote on proposals (client method) | 📋 | 📋 | 📋 | ➖ | ➖ | 📋 |
| Governance UI (proposal list/detail/create) | ➖ | ➖ | 📋 | ➖ | ➖ | 📋 |
| Constitution view UI | ➖ | ➖ | 📋 | ➖ | ➖ | 📋 |
| Delegation view UI | ➖ | ➖ | 📋 | ➖ | ➖ | 📋 |

## Bot API

| Feature                                | Electron | Local Server | Cloud Web UI | Portal | Cloud Server | Mobile |
| -------------------------------------- | -------- | ------------ | ------------ | ------ | ------------ | ------ |
| Bot host (lifecycle management)        | 🔧       | 🔧           | ➖           | ➖     | ➖           | ➖     |
| Bot context (community/channel access) | 🔧       | 🔧           | ➖           | ➖     | ➖           | ➖     |
| Event dispatch                         | 🔧       | 🔧           | ➖           | ➖     | ➖           | ➖     |
| Webhooks (inbound/outbound)            | 🔧       | 🔧           | ➖           | ➖     | ➖           | ➖     |
| ZCAP-based bot auth                    | 📋       | 📋           | ➖           | ➖     | ➖           | ➖     |
| Sandbox (isolated execution)           | 📋       | 📋           | ➖           | ➖     | ➖           | ➖     |
| Bot directory UI                       | ➖       | ➖           | 📋           | ➖     | ➖           | 📋     |
| Bot install UI                         | ➖       | ➖           | 📋           | ➖     | ➖           | 📋     |
| Bot settings UI                        | ➖       | ➖           | 📋           | ➖     | ➖           | 📋     |
| Webhook manager UI                     | ➖       | ➖           | 📋           | ➖     | ➖           | 📋     |
| Per-channel bot scoping                | ❌       | ❌           | ❌           | ❌     | ❌           | ❌     |

## Federation

| Feature                                 | Electron | Local Server | Cloud Web UI | Portal | Cloud Server | Mobile |
| --------------------------------------- | -------- | ------------ | ------------ | ------ | ------------ | ------ |
| FederationManager class (319 LOC)       | 📋       | 📋           | ➖           | ➖     | ➖           | ➖     |
| Peer data structures & types            | 📋       | 📋           | ➖           | ➖     | ➖           | ➖     |
| Event emitter for federation events     | 📋       | 📋           | ➖           | ➖     | ➖           | ➖     |
| Server-to-server WebSocket              | ❌       | ❌           | ➖           | ❌     | ❌           | ➖     |
| Peer discovery                          | ❌       | ❌           | ➖           | ❌     | ❌           | ➖     |
| Cross-server message relay              | ❌       | ❌           | ➖           | ❌     | ❌           | ➖     |
| Federation ZCAPs (instance-to-instance) | ❌       | ❌           | ➖           | ❌     | ❌           | ➖     |

## Search

| Feature                | Electron | Local Server | Cloud Web UI | Portal | Cloud Server | Mobile |
| ---------------------- | -------- | ------------ | ------------ | ------ | ------------ | ------ |
| Tokenizer              | 🔧       | 🔧           | 🔧           | ➖     | ➖           | 🔧     |
| Inverted index         | 🔧       | 🔧           | 🔧           | ➖     | ➖           | 🔧     |
| Query parser           | 🔧       | 🔧           | 🔧           | ➖     | ➖           | 🔧     |
| Snippet extraction     | 🔧       | 🔧           | 🔧           | ➖     | ➖           | 🔧     |
| Metadata index         | 🔧       | 🔧           | 🔧           | ➖     | ➖           | 🔧     |
| Search overlay UI      | ➖       | ➖           | 🔧           | ➖     | ➖           | 🔧     |
| Search bar + filters   | ➖       | ➖           | 📋           | ➖     | ➖           | 📋     |
| Search results display | ➖       | ➖           | 📋           | ➖     | ➖           | 📋     |

## Social Features

| Feature                  | Electron | Local Server | Cloud Web UI | Portal | Cloud Server | Mobile |
| ------------------------ | -------- | ------------ | ------------ | ------ | ------------ | ------ |
| Friend finder view       | ➖       | ➖           | 🔧           | ➖     | ➖           | 🔧     |
| Friend search endpoint   | ➖       | ➖           | 🔧           | ✅     | ➖           | 🔧     |
| QR code sharing          | ❌       | ❌           | ❌           | ❌     | ❌           | ❌     |
| Contact list persistence | ❌       | ❌           | ❌           | ❌     | ❌           | ❌     |
| Add friend by DID        | ❌       | ❌           | ❌           | ❌     | ❌           | ❌     |
| Data claim view          | ➖       | ➖           | 🔧           | ➖     | ➖           | 🔧     |

## Migration (Discord → Harmony)

| Feature                                 | Electron | Local Server | Cloud Web UI | Portal | Cloud Server | Mobile |
| --------------------------------------- | -------- | ------------ | ------------ | ------ | ------------ | ------ |
| Discord export parser                   | ✅       | ✅           | ➖           | ➖     | ➖           | ➖     |
| Migration service (transform + import)  | ✅       | ✅           | ➖           | ➖     | ➖           | ➖     |
| User data encryption (export bundles)   | ✅       | ✅           | ➖           | ➖     | ➖           | ➖     |
| User data transform                     | ✅       | ✅           | ➖           | ➖     | ➖           | ➖     |
| Migration bot (Discord side)            | ➖       | ✅           | ➖           | ➖     | ➖           | ➖     |
| Migration wizard UI                     | ➖       | ➖           | ✅           | ➖     | ➖           | ✅     |
| Migration client (UI integration)       | ➖       | ➖           | ✅           | ➖     | ➖           | ✅     |
| Migration endpoint (server-runtime)     | ✅       | ✅           | ➖           | ➖     | ➖           | ➖     |
| Migration dedup                         | ➖       | ➖           | ✅           | ➖     | ➖           | ✅     |
| Export view UI                          | ➖       | ➖           | 📋           | ➖     | ➖           | 📋     |
| Import wizard UI                        | ➖       | ➖           | 📋           | ➖     | ➖           | 📋     |
| GDPR member opt-out                     | ❌       | ❌           | ❌           | ❌     | ❌           | ❌     |
| Privacy notice template                 | ❌       | ❌           | ❌           | ❌     | ❌           | ❌     |
| Personal data export (GDPR portability) | ❌       | ❌           | ❌           | ❌     | ❌           | ❌     |

## Mobile-Specific

| Feature                                  | Electron | Local Server | Cloud Web UI | Portal | Cloud Server | Mobile |
| ---------------------------------------- | -------- | ------------ | ------------ | ------ | ------------ | ------ |
| Capacitor project (Android)              | ➖       | ➖           | ➖           | ➖     | ➖           | ✅     |
| Push notifications (Capacitor native)    | ➖       | ➖           | ➖           | ➖     | ➖           | ✅     |
| Biometric authentication                 | ➖       | ➖           | ➖           | ➖     | ➖           | ✅     |
| Native share target                      | ➖       | ➖           | ➖           | ➖     | ➖           | ✅     |
| Platform detection                       | ➖       | ➖           | ➖           | ➖     | ➖           | ✅     |
| Background sync (Capacitor)              | ➖       | ➖           | ➖           | ➖     | ➖           | ✅     |
| InMemory fallbacks (when no native)      | ➖       | ➖           | ✅           | ➖     | ➖           | ✅     |
| PWA service worker (cache/push/sync)     | ➖       | ➖           | ✅           | ➖     | ➖           | ✅     |
| Mobile-responsive UI (hamburger/drawers) | ➖       | ➖           | ✅           | ➖     | ➖           | ✅     |
| Safe-area insets                         | ➖       | ➖           | ➖           | ➖     | ➖           | ✅     |
| Touch targets (44px minimum)             | ➖       | ➖           | ✅           | ➖     | ➖           | ✅     |
| Push registration (client method)        | ➖       | ➖           | ➖           | ➖     | ➖           | ✅     |

## Cloud & Portal Infrastructure

| Feature | Electron | Local Server | Cloud Web UI | Portal | Cloud Server | Mobile |
| --- | --- | --- | --- | --- | --- | --- |
| Community Durable Object (one per community) | ➖ | ➖ | ➖ | ➖ | ✅ | ➖ |
| DO SQLite storage (quads/members/channels) | ➖ | ➖ | ➖ | ➖ | ✅ | ➖ |
| Hibernatable WebSockets | ➖ | ➖ | ➖ | ➖ | ✅ | ➖ |
| Community provisioning | ➖ | ➖ | ➖ | ➖ | ✅ | ➖ |
| Portal identity store (D1) | ➖ | ➖ | ➖ | ✅ | ➖ | ➖ |
| Portal community directory | ➖ | ➖ | ➖ | ✅ | ➖ | ➖ |
| Portal invite resolver | ➖ | ➖ | ➖ | ✅ | ➖ | ➖ |
| Portal OAuth handler | ➖ | ➖ | ➖ | ✅ | ➖ | ➖ |
| Portal rate limiter (KV) | ➖ | ➖ | ➖ | ✅ | ➖ | ➖ |
| Portal relay (WebSocket proxy) | ➖ | ➖ | ➖ | ✅ | ➖ | ➖ |
| Portal export store (R2) | ➖ | ➖ | ➖ | ✅ | ➖ | ➖ |
| Portal reconciliation | ➖ | ➖ | ➖ | ✅ | ➖ | ➖ |
| Cloud identity routes | ➖ | ➖ | ✅ | ➖ | ✅ | ✅ |
| Cloud OAuth routes | ➖ | ➖ | ✅ | ➖ | ✅ | ✅ |
| Cloud recovery routes | ➖ | ➖ | ✅ | ➖ | ✅ | ✅ |
| Cloud hosting routes | ➖ | ➖ | ✅ | ➖ | ✅ | ➖ |
| Cloud storage routes | ➖ | ➖ | ✅ | ➖ | ✅ | ✅ |

## Infrastructure & Deployment

| Feature | Electron | Local Server | Cloud Web UI | Portal | Cloud Server | Mobile |
| --- | --- | --- | --- | --- | --- | --- |
| Electron packaging (mac/win/linux) | ✅ | ➖ | ➖ | ➖ | ➖ | ➖ |
| Docker Compose (server + UI) | ➖ | ✅ | ➖ | ➖ | ➖ | ➖ |
| Dockerfile (server) | ➖ | ✅ | ➖ | ➖ | ➖ | ➖ |
| Dockerfile (UI) | ➖ | ➖ | ✅ | ➖ | ➖ | ➖ |
| Health check endpoint | ➖ | ✅ | ➖ | ➖ | ✅ | ➖ |
| Config file (harmony.config.yaml) | ✅ | ✅ | ➖ | ➖ | ➖ | ➖ |
| Config persistence (deep merge) | ✅ | ✅ | ➖ | ➖ | ➖ | ➖ |
| SQLite quad store (server-runtime) | ✅ | ✅ | ➖ | ➖ | ➖ | ➖ |
| In-memory quad store | ✅ | ✅ | ✅ | ➖ | ➖ | ✅ |
| DO quad store (Cloudflare) | ➖ | ➖ | ➖ | ➖ | ✅ | ➖ |
| Server daemon wrapper | ✅ | ✅ | ➖ | ➖ | ➖ | ➖ |
| Logger | ✅ | ✅ | ➖ | ➖ | ➖ | ➖ |
| Media store (file-based) | ✅ | ✅ | ➖ | ➖ | ➖ | ➖ |
| Rate limiting (server-side) | ✅ | ✅ | ➖ | ✅ | ✅ | ➖ |
| PWA manifest + icons | ➖ | ➖ | ✅ | ➖ | ➖ | ✅ |
| WebSocket reconnection (exponential backoff) | ✅ | ✅ | ✅ | ➖ | ✅ | ✅ |
| Message queue (offline buffering) | ✅ | ✅ | ✅ | ➖ | ➖ | ✅ |

## CLI

| Feature                     | Electron | Local Server | Cloud Web UI | Portal | Cloud Server | Mobile |
| --------------------------- | -------- | ------------ | ------------ | ------ | ------------ | ------ |
| Identity create             | ➖       | ✅           | ➖           | ➖     | ➖           | ➖     |
| Community create/join/list  | ➖       | ✅           | ➖           | ➖     | ➖           | ➖     |
| Channel create/send         | ➖       | ✅           | ➖           | ➖     | ➖           | ➖     |
| Migration import            | ➖       | ✅           | ➖           | ➖     | ➖           | ➖     |
| Portal service integration  | ➖       | ✅           | ➖           | ➖     | ➖           | ➖     |
| Community export (.hbundle) | ❌       | ❌           | ❌           | ❌     | ❌           | ❌     |
| Community import (.hbundle) | ❌       | ❌           | ❌           | ❌     | ❌           | ❌     |

## CRDT (Conflict-Free Replicated Data Types)

| Feature                         | Electron | Local Server | Cloud Web UI | Portal | Cloud Server | Mobile |
| ------------------------------- | -------- | ------------ | ------------ | ------ | ------------ | ------ |
| Lamport clock (tick/merge)      | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| CRDT log (ordered message log)  | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |
| CRDT operations (insert/delete) | ✅       | ✅           | ✅           | ➖     | ✅           | ✅     |

## UI Components (Cloud Web UI / Mobile shared)

| Component | Status | Notes |
| --- | --- | --- |
| MainLayout | ✅ | App shell with sidebar/content/drawers |
| OnboardingView | ✅ | Create identity + mnemonic/social recovery tabs |
| SettingsView | ✅ | Recovery setup, profile, preferences |
| MessageArea | ✅ | Message list + composer |
| ChannelSidebarView | ✅ | Channel list with categories |
| MemberSidebarView | ✅ | Member list with presence dots |
| ServerListBar | ✅ | Multi-community navigation |
| DMListView | ✅ | DM conversation list |
| DMConversationView | ✅ | DM message thread |
| NewDMModal | ✅ | Start new DM |
| ThreadView | ✅ | Side panel for thread messages |
| VoiceControlBar | ✅ | Mute/video/screen share/leave buttons |
| VideoGrid | ✅ | Adaptive video participant layout |
| ScreenShareView | ✅ | Screen share display |
| VoiceChannelPanel | ✅ | Voice participant indicators |
| CreateCommunityModal | ✅ | Name/description form |
| CreateChannelModal | ✅ | Channel creation form |
| ChannelSettingsModal | ✅ | Edit channel name/topic |
| RoleManagerView | 🔧 | UI exists, wiring to server partially tested |
| SearchOverlayView | 🔧 | Basic search UI, backend integration incomplete |
| MigrationWizard | ✅ | Step-by-step Discord migration |
| DataBrowserView | 🔧 | RDF quad browser |
| DataClaimView | 🔧 | Data sovereignty claims |
| FriendFinderView | 🔧 | Basic layout, flows incomplete |
| DelegationView | 📋 | Governance delegation UI stub |
| EmptyStateView | ✅ | No-community welcome screen |
| Notifications (center/settings/item) | 📋 | Components exist in ui package |
| Credential components (portfolio/detail/issue/editor/reputation) | 📋 | Components exist in ui package |

## Internationalisation

| Feature                | Electron | Local Server | Cloud Web UI | Portal | Cloud Server | Mobile |
| ---------------------- | -------- | ------------ | ------------ | ------ | ------------ | ------ |
| String table (i18n)    | ➖       | ➖           | ✅           | ✅     | ➖           | ✅     |
| Multi-language support | ➖       | ➖           | 📋           | 📋     | ➖           | 📋     |

## Revenue / Cloud Tiers

| Feature                      | Status |
| ---------------------------- | ------ |
| Billing integration (Stripe) | ❌     |
| Feature gating per tier      | ❌     |
| Custom domains (Pro)         | ❌     |
| SSO / enterprise features    | ❌     |
| Admin dashboard              | ❌     |

---

## Stats

| Metric                        | Count        |
| ----------------------------- | ------------ |
| **Total features catalogued** | **192**      |
| **✅ Fully implemented**      | **~90**      |
| **🔧 Partially implemented**  | **~42**      |
| **📋 Stub/interface only**    | **~38**      |
| **❌ Not implemented**        | **~22**      |
| **Tests passing**             | **2,336**    |
| **Tests skipped**             | **62**       |
| **Test files**                | **104**      |
| **Packages**                  | **36**       |
| **Total LOC**                 | **~32,000+** |

### Assessment Summary

**Production-ready areas:** Identity (DID:key), messaging (full CRUD + reactions + replies), communities & channels (full lifecycle), E2EE (MLS groups + DM encryption), ZCAP single-level delegation, media upload, threads, ban enforcement, Docker deployment, Electron packaging, mobile Capacitor shell, PWA.

**Implemented but needs polish:** Voice/video (SFUAdapter with mediasoup self-hosted + CF Realtime cloud adapters, E2EE bridge with HKDF key derivation, VoiceRoomDO for cloud coordination — needs real media testing), search (index works, UI incomplete), role management (server solid, UI partially wired), migration wizard, friend finder.

**Architecture exists, implementation stubbed:** Governance (full type system + engine skeleton, ~900 LOC, no server integration), bot API (host/context/dispatch exist, not production-tested), moderation rules (types + engine defined, not enforced by server), credentials (type registry/reputation/portfolio classes exist, not wired to UI), federation (peer structures defined, no actual connectivity).

**Not started:** Multi-level ZCAP delegation, federation networking, revenue/billing, community export/import, rich embeds, GDPR tooling, DID method expansion, VC admission policies.
