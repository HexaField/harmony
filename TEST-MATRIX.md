# Harmony — E2E Test Matrix

_Automated test playbook. Run by Hex._

## Instructions

This matrix is the definitive E2E acceptance test plan. To execute:

1. **Spawn one subagent per section** (in order, top to bottom)
2. Each subagent:
   - Reads this file for its section's test items
   - Executes each test (manual verification against a running server/client)
   - Records the result in the matrix: `✅` pass, `❌` fail, `⚠️` partial
   - Commits the updated matrix before finishing
3. **Wait for each subagent to complete** before spawning the next (results build on each other)
4. Items marked `⊘` are known-not-testable (feature not implemented or infrastructure-dependent) — skip them, leave the mark
5. Empty cells `  ` are untested — must be filled by the subagent

## Test Environment

```
Server: cd ~/Desktop/harmony && node packages/server-runtime/dist/index.js (or use test harness)
UI: cd ~/Desktop/harmony/packages/ui-app && pnpm dev
Test harness: cd ~/Desktop/harmony && npx vitest run (for programmatic verification)
Rebuild first: cd ~/Desktop/harmony/node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3 && npx node-gyp rebuild --release
```

## Legend

| Mark | Meaning                                                   |
| ---- | --------------------------------------------------------- |
| `✅` | Tested and passing                                        |
| `❌` | Tested and failing                                        |
| `⚠️` | Partial — works with caveats (note in Comments)           |
| `⊘`  | Not testable — feature not implemented or infra-dependent |
| ` `  | Untested — subagent must fill                             |

---

## 1. Identity & Authentication

| #    | Test                                                  | Result | Comments               |
| ---- | ----------------------------------------------------- | ------ | ---------------------- |
| 1.1  | Create DID:key from new mnemonic                      |        |                        |
| 1.2  | Recover DID:key from existing mnemonic                |        |                        |
| 1.3  | DID document resolves correctly from did:key          |        |                        |
| 1.4  | Identity persists to config file (Electron/local)     |        |                        |
| 1.5  | Identity persists to localStorage (web)               |        |                        |
| 1.6  | VP-based auth handshake succeeds                      |        |                        |
| 1.7  | VP-based auth rejects invalid VP                      |        |                        |
| 1.8  | Display name set and broadcast to community           |        |                        |
| 1.9  | Pseudonym generated deterministically from DID        |        |                        |
| 1.10 | Social recovery: set up guardians                     |        |                        |
| 1.11 | Social recovery: initiate recovery request            |        |                        |
| 1.12 | Social recovery: guardian approves                    |        |                        |
| 1.13 | Social recovery: complete recovery with threshold met |        |                        |
| 1.14 | Discord OAuth link produces identity VC               |        |                        |
| 1.15 | Biometric lock protects mnemonic access               | ⊘      | Requires native device |
| 1.16 | DID:web resolution                                    | ⊘      | Not implemented        |
| 1.17 | DID:plc resolution                                    | ⊘      | Not implemented        |

---

## 2. Verifiable Credentials

| #    | Test                                    | Result | Comments        |
| ---- | --------------------------------------- | ------ | --------------- |
| 2.1  | Issue membership VC on community join   |        |                 |
| 2.2  | Verify VC signature (valid)             |        |                 |
| 2.3  | Verify VC signature (tampered — reject) |        |                 |
| 2.4  | Revoke VC → verification fails          |        |                 |
| 2.5  | Credential type registry stores types   |        |                 |
| 2.6  | Custom credential types per community   | ⊘      | Not implemented |
| 2.7  | VC portfolio UI displays credentials    | ⊘      | Not implemented |
| 2.8  | Reputation engine scores                | ⊘      | Stub only       |
| 2.9  | Cross-community trust evaluation        | ⊘      | Stub only       |
| 2.10 | VC-based admission gate                 | ⊘      | Not implemented |
| 2.11 | E2EE key binding in membership VC       | ⊘      | Not implemented |

---

## 3. ZCAP Authorization

| #    | Test                                                 | Result | Comments        |
| ---- | ---------------------------------------------------- | ------ | --------------- |
| 3.1  | Root capability created on community creation        |        |                 |
| 3.2  | Single-level delegation (admin → member)             |        |                 |
| 3.3  | Chain verification: valid chain passes               |        |                 |
| 3.4  | Chain verification: broken chain rejected            |        |                 |
| 3.5  | Chain verification: wrong action scope rejected      |        |                 |
| 3.6  | Revoked capability rejected                          |        |                 |
| 3.7  | Message without proof still passes (backward compat) |        |                 |
| 3.8  | Multi-level delegation chain                         | ⊘      | Not implemented |
| 3.9  | Time-limited capability expires                      | ⊘      | Not implemented |
| 3.10 | Rate-limited capability (caveats)                    | ⊘      | Not implemented |
| 3.11 | User-to-user delegation                              | ⊘      | Not implemented |
| 3.12 | AI agent ZCAP scoping                                | ⊘      | Not implemented |

---

## 4. Messaging

| #    | Test                                                | Result | Comments        |
| ---- | --------------------------------------------------- | ------ | --------------- |
| 4.1  | Send message to channel → received by other members |        |                 |
| 4.2  | Edit message → update broadcast                     |        |                 |
| 4.3  | Delete message → deletion broadcast                 |        |                 |
| 4.4  | Typing indicator sent and received                  |        |                 |
| 4.5  | Typing indicator auto-clears after timeout          |        |                 |
| 4.6  | Add reaction → reaction broadcast                   |        |                 |
| 4.7  | Remove reaction → removal broadcast                 |        |                 |
| 4.8  | Message history via sync.request                    |        |                 |
| 4.9  | Lamport clock ordering correct across clients       |        |                 |
| 4.10 | Reply-to references correct parent message          |        |                 |
| 4.11 | Messages from banned user rejected                  |        |                 |
| 4.12 | Rate limiting enforced on rapid sends               |        |                 |
| 4.13 | Rate limit error sent to client                     |        |                 |
| 4.14 | Link preview fetched for URL in message             | ⊘      | Stub only       |
| 4.15 | Rich embed rendered for link                        | ⊘      | Not implemented |
| 4.16 | Code block syntax highlighting                      | ⊘      | Not implemented |

---

## 5. Direct Messages

| #   | Test                                        | Result | Comments |
| --- | ------------------------------------------- | ------ | -------- |
| 5.1 | Send DM → received by recipient             |        |          |
| 5.2 | DM typing indicator                         |        |          |
| 5.3 | DM key exchange auto-negotiated on first DM |        |          |
| 5.4 | DM encrypted with XChaCha20-Poly1305        |        |          |
| 5.5 | DM decrypted correctly by recipient         |        |          |
| 5.6 | DM edit → update received                   |        |          |
| 5.7 | DM delete → deletion received               |        |          |
| 5.8 | Server never sees DM plaintext              |        |          |

---

## 6. Threads

| #   | Test                                            | Result | Comments |
| --- | ----------------------------------------------- | ------ | -------- |
| 6.1 | Create thread on message → thread.created event |        |          |
| 6.2 | Send to thread → thread.message event           |        |          |
| 6.3 | Reply count updates on parent message           |        |          |
| 6.4 | Thread messages ordered correctly               |        |          |
| 6.5 | Multiple threads in same channel independent    |        |          |

---

## 7. Communities & Channels

| #    | Test                                                  | Result | Comments |
| ---- | ----------------------------------------------------- | ------ | -------- |
| 7.1  | Create community → community.created with root ZCAP   |        |          |
| 7.2  | Join community → membership VC issued                 |        |          |
| 7.3  | Leave community → member.left broadcast               |        |          |
| 7.4  | Community info returns correct data                   |        |          |
| 7.5  | Community list returns all joined communities         |        |          |
| 7.6  | Create text channel → channel.created broadcast       |        |          |
| 7.7  | Create voice channel                                  |        |          |
| 7.8  | Update channel name/topic → channel.updated broadcast |        |          |
| 7.9  | Delete channel → channel.deleted broadcast            |        |          |
| 7.10 | Join via invite code → auto-join community            |        |          |
| 7.11 | Ban member → member removed, cannot rejoin            |        |          |
| 7.12 | Unban member → can rejoin                             |        |          |
| 7.13 | Kick member → member removed, can rejoin              |        |          |
| 7.14 | Member list includes presence status                  |        |          |
| 7.15 | Default channels created on community creation        |        |          |

---

## 8. Presence

| #   | Test                                            | Result | Comments |
| --- | ----------------------------------------------- | ------ | -------- |
| 8.1 | Set presence to online → broadcast to community |        |          |
| 8.2 | Set presence to idle/dnd/offline → broadcast    |        |          |
| 8.3 | Custom status text broadcast                    |        |          |
| 8.4 | Presence visible in member list                 |        |          |

---

## 9. Roles & Permissions

| #    | Test                                                        | Result | Comments |
| ---- | ----------------------------------------------------------- | ------ | -------- |
| 9.1  | Create role → role.created broadcast                        |        |          |
| 9.2  | Update role (name, color, permissions) → role.updated       |        |          |
| 9.3  | Delete role → role.deleted, stripped from members           |        |          |
| 9.4  | Assign role to member → member.updated broadcast            |        |          |
| 9.5  | Remove role from member → member.updated broadcast          |        |          |
| 9.6  | Non-admin cannot create role → error                        |        |          |
| 9.7  | Non-admin cannot assign role → error                        |        |          |
| 9.8  | Permission-gated action: member without permission rejected |        |          |
| 9.9  | Permission-gated action: member with correct role passes    |        |          |
| 9.10 | Admin bypasses all permission checks                        |        |          |

---

## 10. Pins

| #    | Test                                               | Result | Comments |
| ---- | -------------------------------------------------- | ------ | -------- |
| 10.1 | Pin message → channel.message.pinned broadcast     |        |          |
| 10.2 | Unpin message → channel.message.unpinned broadcast |        |          |
| 10.3 | List pinned messages → correct list returned       |        |          |
| 10.4 | Max 50 pins per channel → error on 51st            |        |          |
| 10.5 | Non-admin cannot pin → error (if permission-gated) |        |          |
| 10.6 | Pin persists across reconnection                   |        |          |

---

## 11. Voice & Video

| # | Test | Result | Comments |
| --- | --- | --- | --- |
| 11.1 | Join voice channel → participant.joined broadcast |  |  |
| 11.2 | Leave voice channel → participant.left broadcast |  |  |
| 11.3 | Two clients in voice → both see each other |  |  |
| 11.4 | Mute → state broadcast to room |  |  |
| 11.5 | Unmute → state broadcast to room |  |  |
| 11.6 | Enable video → state broadcast |  |  |
| 11.7 | Disable video → state broadcast |  |  |
| 11.8 | Start screen share → state broadcast |  |  |
| 11.9 | Stop screen share → state broadcast |  |  |
| 11.10 | Speaking indicator relay |  |  |
| 11.11 | Voice state includes all participants on join |  |  |
| 11.12 | Voice token exchange returns token |  |  |
| 11.13 | Participant cleanup on disconnect |  |  |
| 11.14 | WebRTC signaling: offer/answer/ICE relay |  |  |
| 11.15 | mediasoup SFU: room create/delete | ✅ | MediasoupAdapter tested (6 tests) |
| 11.16 | mediasoup SFU: JWT token with transport params | ✅ | Contains dtls, ice, rtpCapabilities |
| 11.17 | mediasoup SFU: participant tracking | ✅ | list/remove/mute via adapter |
| 11.18 | VoiceClient mediasoup mode: parse JWT + SFU params | ✅ | hasSFUParams=true, hasE2EE=true |
| 11.19 | VoiceClient test mode: backward compat | ✅ | InMemoryAdapter base64 tokens still work |
| 11.20 | E2EE bridge: HKDF key derivation | ✅ | MLS epoch secret → AES-256-GCM via Web Crypto |
| 11.21 | E2EE bridge: encrypt/decrypt frame roundtrip | ✅ | IV‖ciphertext‖tag, verified |
| 11.22 | E2EE bridge: epoch ratchet re-derives key | ✅ | Old ciphertext fails with new key |
| 11.23 | E2EE bridge: wrong key rejected | ✅ | Decryption throws on key mismatch |
| 11.24 | Insertable Streams: encrypt transform | ✅ | Preserves header bytes, encrypts payload |
| 11.25 | Insertable Streams: decrypt transform roundtrip | ✅ | Audio frame encrypt→decrypt matches original |
| 11.26 | Insertable Streams: passthrough without key | ✅ | No-op when bridge has no key |
| 11.27 | CF Calls mock: room lifecycle | ✅ | create/delete/list via MockCloudflareCallsAdapter |
| 11.28 | CF Calls mock: WHIP/WHEP token generation | ✅ | Token contains publish/subscribe endpoints |
| 11.29 | CF Calls mock: call logging | ✅ | All operations logged for test assertions |
| 11.30 | CommunityDO: voice.join handler | ✅ | SQL storage + broadcast (code review) |
| 11.31 | CommunityDO: voice.leave handler | ✅ | Participant removal + broadcast |
| 11.32 | CommunityDO: voice.mute handler | ✅ | Audio/video mute state update + broadcast |
| 11.33 | VoiceRoomDO: WebSocket signaling | ✅ | Join/leave/mute via WS (code review) |
| 11.34 | VoiceRoomDO: auto-destroy on empty | ✅ | Room cleaned up when last participant leaves |
| 11.35 | Real browser Insertable Streams | ⊘ | Requires real browser RTCRtpScriptTransform |
| 11.36 | Real media over mediasoup (wrtc) | ⊘ | wrtc npm not installed; transport-level tested |

---

## 12. E2EE

| #     | Test                                                  | Result | Comments        |
| ----- | ----------------------------------------------------- | ------ | --------------- |
| 12.1  | MLS group auto-created per channel                    |        |                 |
| 12.2  | Key package upload on community join                  |        |                 |
| 12.3  | MLS welcome message sent to new member                |        |                 |
| 12.4  | MLS commit processed                                  |        |                 |
| 12.5  | Encrypted message sent → decrypted by recipient       |        |                 |
| 12.6  | Server cannot read encrypted content (zero-knowledge) |        |                 |
| 12.7  | Invalid ciphertext handled gracefully                 |        |                 |
| 12.8  | Multiple channels get separate MLS groups             |        |                 |
| 12.9  | DM key exchange auto-negotiated                       |        |                 |
| 12.10 | DM encrypted end-to-end                               |        |                 |
| 12.11 | E2EE re-keying on member revocation                   | ⊘      | Not implemented |

---

## 13. Media & Files

| #     | Test                                                         | Result | Comments  |
| ----- | ------------------------------------------------------------ | ------ | --------- |
| 13.1  | Upload file via media.upload.request → media.upload.complete |        |           |
| 13.2  | Send message with attachments → attachments received         |        |           |
| 13.3  | File size > 10MB rejected                                    |        |           |
| 13.4  | Invalid MIME type rejected                                   |        |           |
| 13.5  | Multiple attachments on single message                       |        |           |
| 13.6  | Non-member upload rejected                                   |        |           |
| 13.7  | Media delete removes file                                    |        |           |
| 13.8  | Link preview OpenGraph fetch                                 | ⊘      | Stub only |
| 13.9  | Thumbnail generation                                         | ⊘      | Stub only |
| 13.10 | File checksum verification                                   | ⊘      | Stub only |

---

## 14. Moderation

| #    | Test                                        | Result | Comments  |
| ---- | ------------------------------------------- | ------ | --------- |
| 14.1 | Ban list enforced — banned user cannot send |        |           |
| 14.2 | Ban handler stores ban                      |        |           |
| 14.3 | Unban handler removes ban                   |        |           |
| 14.4 | Kick removes member from community          |        |           |
| 14.5 | Slow mode rules                             | ⊘      | Stub only |
| 14.6 | Account age rules                           | ⊘      | Stub only |
| 14.7 | Raid detection                              | ⊘      | Stub only |
| 14.8 | VC requirement rules                        | ⊘      | Stub only |

---

## 15. Governance

| #    | Test                     | Result | Comments                      |
| ---- | ------------------------ | ------ | ----------------------------- |
| 15.1 | Create proposal          | ⊘      | Stub only — no server handler |
| 15.2 | Sign/vote on proposal    | ⊘      | Stub only                     |
| 15.3 | Quorum evaluation        | ⊘      | Stub only                     |
| 15.4 | Constitution constraints | ⊘      | Stub only                     |
| 15.5 | Delegation manager       | ⊘      | Stub only                     |
| 15.6 | Agent auth manager       | ⊘      | Stub only                     |
| 15.7 | Audit log                | ⊘      | Stub only                     |
| 15.8 | Action execution         | ⊘      | Stub only                     |

---

## 16. Bot API

| #    | Test                                  | Result | Comments        |
| ---- | ------------------------------------- | ------ | --------------- |
| 16.1 | Bot host lifecycle (start/stop)       |        |                 |
| 16.2 | Bot context provides community access |        |                 |
| 16.3 | Event dispatch to bot                 |        |                 |
| 16.4 | Webhook inbound/outbound              |        |                 |
| 16.5 | ZCAP-based bot auth                   | ⊘      | Stub only       |
| 16.6 | Sandbox isolated execution            | ⊘      | Stub only       |
| 16.7 | Per-channel bot scoping               | ⊘      | Not implemented |

---

## 17. Search

| #    | Test                                         | Result | Comments |
| ---- | -------------------------------------------- | ------ | -------- |
| 17.1 | Tokenizer splits text correctly              |        |          |
| 17.2 | Inverted index indexes and retrieves         |        |          |
| 17.3 | Query parser handles operators               |        |          |
| 17.4 | Snippet extraction highlights matches        |        |          |
| 17.5 | Metadata index stores and queries            |        |          |
| 17.6 | End-to-end: index message → search → find it |        |          |

---

## 18. Migration (Discord → Harmony)

| #     | Test                                             | Result | Comments                   |
| ----- | ------------------------------------------------ | ------ | -------------------------- |
| 18.1  | Discord export parsed correctly                  |        |                            |
| 18.2  | Transform produces valid Harmony quads           |        |                            |
| 18.3  | User data encrypted in export bundle             |        |                            |
| 18.4  | Migration import creates community with channels |        |                            |
| 18.5  | Migration dedup prevents double-import           |        |                            |
| 18.6  | Migration endpoint accepts upload                |        |                            |
| 18.7  | Migration bot Discord-side export                | ⊘      | Requires Discord bot token |
| 18.8  | GDPR member opt-out                              | ⊘      | Not implemented            |
| 18.9  | Privacy notice template                          | ⊘      | Not implemented            |
| 18.10 | Personal data export                             | ⊘      | Not implemented            |

---

## 19. Federation

| #    | Test                            | Result | Comments        |
| ---- | ------------------------------- | ------ | --------------- |
| 19.1 | FederationManager instantiation |        |                 |
| 19.2 | Peer data structures valid      |        |                 |
| 19.3 | Federation event emitter fires  |        |                 |
| 19.4 | Server-to-server WebSocket      | ⊘      | Not implemented |
| 19.5 | Peer discovery                  | ⊘      | Not implemented |
| 19.6 | Cross-server message relay      | ⊘      | Not implemented |
| 19.7 | Federation ZCAPs                | ⊘      | Not implemented |

---

## 20. CRDT

| #    | Test                             | Result | Comments |
| ---- | -------------------------------- | ------ | -------- |
| 20.1 | Lamport clock tick increments    |        |          |
| 20.2 | Lamport clock merge takes max    |        |          |
| 20.3 | CRDT log maintains order         |        |          |
| 20.4 | CRDT insert/delete operations    |        |          |
| 20.5 | Concurrent edits merge correctly |        |          |

---

## 21. Infrastructure

| #     | Test                                            | Result | Comments                  |
| ----- | ----------------------------------------------- | ------ | ------------------------- |
| 21.1  | SQLite quad store: add/query/delete quads       |        |                           |
| 21.2  | In-memory quad store: add/query/delete quads    |        |                           |
| 21.3  | Config file loads and deep-merges               |        |                           |
| 21.4  | WebSocket reconnection with exponential backoff |        |                           |
| 21.5  | Message queue buffers while offline             |        |                           |
| 21.6  | Rate limiting rejects excess messages           |        |                           |
| 21.7  | Rate limit window resets                        |        |                           |
| 21.8  | Health check endpoint responds                  |        |                           |
| 21.9  | Server daemon starts and listens                |        |                           |
| 21.10 | Docker build succeeds                           | ⊘      | Requires Docker daemon    |
| 21.11 | Electron packaging                              | ⊘      | Requires electron-builder |

---

## 22. Mobile

| #     | Test                                         | Result | Comments               |
| ----- | -------------------------------------------- | ------ | ---------------------- |
| 22.1  | InMemory push service: register + receive    |        |                        |
| 22.2  | InMemory biometric: available + authenticate |        |                        |
| 22.3  | InMemory share target: register + receive    |        |                        |
| 22.4  | InMemory background sync: register + trigger |        |                        |
| 22.5  | Platform detection (web vs native)           |        |                        |
| 22.6  | MobileApp aggregates all services            |        |                        |
| 22.7  | Capacitor push notifications                 | ⊘      | Requires native device |
| 22.8  | Capacitor biometric auth                     | ⊘      | Requires native device |
| 22.9  | Capacitor share target                       | ⊘      | Requires native device |
| 22.10 | PWA service worker caches app shell          | ⊘      | Requires browser       |
| 22.11 | PWA push notification display                | ⊘      | Requires browser       |

---

## 23. Cloud & Portal

| #     | Test                                    | Result | Comments                 |
| ----- | --------------------------------------- | ------ | ------------------------ |
| 23.1  | Cloud identity routes: create/get       |        |                          |
| 23.2  | Cloud OAuth routes: Discord flow        | ⊘      | Requires Discord OAuth   |
| 23.3  | Cloud recovery routes: initiate/approve |        |                          |
| 23.4  | Cloud hosting routes                    |        |                          |
| 23.5  | Cloud storage routes                    |        |                          |
| 23.6  | Portal identity store (D1)              | ⊘      | Requires Workers runtime |
| 23.7  | Portal community directory              | ⊘      | Requires Workers runtime |
| 23.8  | Portal invite resolver                  | ⊘      | Requires Workers runtime |
| 23.9  | Portal rate limiter                     | ⊘      | Requires Workers runtime |
| 23.10 | Portal relay WebSocket proxy            | ⊘      | Requires Workers runtime |
| 23.11 | Community Durable Object lifecycle      | ⊘      | Requires Workers runtime |
| 23.12 | DO SQLite storage                       | ⊘      | Requires Workers runtime |
| 23.13 | Hibernatable WebSockets                 | ⊘      | Requires Workers runtime |

---

## Summary

| Section                   | Total   | Testable | Skipped (⊘) |
| ------------------------- | ------- | -------- | ----------- |
| 1. Identity               | 17      | 14       | 3           |
| 2. Verifiable Credentials | 11      | 4        | 7           |
| 3. ZCAP                   | 12      | 7        | 5           |
| 4. Messaging              | 16      | 13       | 3           |
| 5. Direct Messages        | 8       | 8        | 0           |
| 6. Threads                | 5       | 5        | 0           |
| 7. Communities & Channels | 15      | 15       | 0           |
| 8. Presence               | 4       | 4        | 0           |
| 9. Roles & Permissions    | 10      | 10       | 0           |
| 10. Pins                  | 6       | 6        | 0           |
| 11. Voice & Video         | 36      | 34       | 2           |
| 12. E2EE                  | 11      | 10       | 1           |
| 13. Media & Files         | 10      | 7        | 3           |
| 14. Moderation            | 8       | 4        | 4           |
| 15. Governance            | 8       | 0        | 8           |
| 16. Bot API               | 7       | 4        | 3           |
| 17. Search                | 6       | 6        | 0           |
| 18. Migration             | 10      | 6        | 4           |
| 19. Federation            | 7       | 3        | 4           |
| 20. CRDT                  | 5       | 5        | 0           |
| 21. Infrastructure        | 11      | 9        | 2           |
| 22. Mobile                | 11      | 6        | 5           |
| 23. Cloud & Portal        | 13      | 5        | 8           |
| **TOTAL**                 | **251** | **183**  | **68**      |
