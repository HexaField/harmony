# Codebase Audit Report — Stubs & Completeness (2026-03-01)

## Critical: Marked Complete But Incomplete

(features marked ✅ in ROADMAP/TEST-MATRIX but code is stub/placeholder)

| File:Line | What | ROADMAP/Matrix Status | Actual Status |
| --- | --- | --- | --- |
| `packages/media/src/thumbnail.ts:1-33` | Thumbnail generation is a fake stub — returns first 1024 bytes with a "HMYTHUMB:" prefix, not an actual thumbnail | ROADMAP: Media ✅ (13.2 "Image attachments get thumbnail preview") | Stub. No image decoding/resizing. Returns raw bytes with a marker, not a renderable thumbnail. |
| `packages/client/src/index.ts:1378` | `getMediaKey()` fallback derives key from XOR of channel name bytes — not cryptographically secure | ROADMAP: Media ✅, E2EE ✅ | Deterministic but insecure fallback. XOR of string bytes is not a proper key derivation. Any client can compute the same "key" from the channel name. Used when MLS group has ≤1 member. |
| `packages/client/src/index.ts:1391` | `downloadFile()` uses `new Uint8Array(32)` (all zeros) as decryption key when communityId/channelId missing | ROADMAP: Media ✅ | Zero key = no encryption. Files downloaded without context are decrypted with a null key. |
| `packages/client/src/index.ts:730` | `joinCommunity()` sends `new Uint8Array(32)` as `encryptionPublicKey` when encryption key pair not yet created | ROADMAP: E2EE ✅, Community ✅ | Zeroed public key sent if encryption key pair hasn't been initialized. Race condition on fast joins. |
| `packages/did/src/index.ts:198` | DID resolver creates KeyPair with `secretKey: new Uint8Array(32)` (zeroed) and comment "dummy, not used for resolution" | ROADMAP: DID:key ✅ | Technically safe (secretKey unused in resolve path), but a zeroed secret key in a KeyPair struct is dangerous if accidentally used elsewhere. |
| `packages/voice/src/e2ee-bridge.ts:55` | HKDF uses zero salt `new Uint8Array(32)` with comment "epoch secret has enough entropy" | ROADMAP: Voice E2EE ✅ | Cryptographically questionable. HKDF spec recommends non-zero salt. May be acceptable given high-entropy input, but deviates from best practice. |
| `packages/ui-app/test/channel-dm-voice.spec.ts:543,554` | Two tests use `expect(true).toBe(true)` — typing user tests that don't actually verify behavior | TEST-MATRIX: Messaging ✅ (4.7 typing indicators) | Placeholder assertions. Tests pass without verifying anything. |
| `packages/ui-app/test/mobile-responsive.spec.ts:55` | "layout adapts at mobile breakpoint" test is just `expect(true).toBe(true)` | TEST-MATRIX: 19.1 Mobile responsive ✅ | Placeholder. No actual responsive layout verification. |
| `packages/voice/test/media-lifecycle.spec.ts:103` | `setSignaling` test uses `expect(true).toBe(true)` | TEST-MATRIX: Voice 11.x ✅ | Placeholder assertion. |

## Missing From Tracking

(stubs/TODOs not mentioned in ROADMAP or TEST-MATRIX)

| File:Line | What | Notes |
| --- | --- | --- |
| `packages/migration/src/index.ts:513` | `subjectDID: memberURI, // placeholder URI until DID linked` | Ghost member DID is a placeholder URI. Not tracked as incomplete — migration tests claim ✅. |
| `packages/ui-app/src/services/recovery.ts:110` | `// In practice this would come from the server, but for now we create a placeholder` — recovery config hardcoded with empty trustedDIDs and threshold 1 | ROADMAP mentions social recovery as 🔧 but this specific stub isn't called out. The recovery initiation always creates a dummy config. |
| `packages/identity/src/index.ts:129,139` | `new Uint8Array(16)` used as static zero salt for sync key derivation | Not tracked. Using zero salt for `deriveKey` in both export and import flows. Deterministic but reduces KDF security. |
| `packages/migration/src/index.ts:447,457` | `new Uint8Array(16)` static zero salt for export encryption key derivation | Same pattern — zero salt in migration encrypt/decrypt. |
| `packages/cloud/src/discord-link.ts:36` | `new Uint8Array(16)` for OAuth state — uses `crypto.getRandomValues` so this one is fine | Actually OK — random fill. |
| `packages/migration-bot/src/index.ts:218` | `new Uint8Array(16)` — uses `crypto.getRandomValues` | Actually OK — random fill. |
| `packages/cloud-worker/src/cf-calls-adapter.ts:161-165` | Mock Cloudflare Calls adapter returns hardcoded `mock-session-*` URLs in production code path | `MockCFCallsAdapter` is in the main src file, not test. Could be accidentally used in production. |
| `packages/voice/src/insertable-streams.ts:7` | "For non-browser environments (tests, Node.js), provides mock fallbacks" — mock in src, not test | Mock/stub code in production source. |
| `packages/credentials/src/reputation.ts:110` | `this.storeReputationQuads(did, rep).catch(() => {})` — silently swallows reputation storage errors | Empty catch in production code. |

## Overclaimed Test Coverage

(TEST-MATRIX rows marked ✅ where test doesn't actually verify the claim)

| Matrix Row | Claim | Actual Test | Issue |
| --- | --- | --- | --- |
| 4.7 | Typing indicator: user A types → user B sees "typing..." | `channel-dm-voice.spec.ts:543` — `expect(true).toBe(true)` | Test doesn't verify typing state. Just checks "no throw". |
| 4.7 (clear) | clearTypingUser removes from typing map | `channel-dm-voice.spec.ts:554` — `expect(true).toBe(true)` | Same — no actual assertion on state. |
| 19.1 | UI responsive at mobile viewport (375px) | `mobile-responsive.spec.ts:55` — `expect(true).toBe(true)` with comment "CSS media queries tested visually" | No viewport test. Pure placeholder. |
| 11.x (voice) | setSignaling updates signaling after construction | `media-lifecycle.spec.ts:103` — `expect(true).toBe(true)` | No verification that signaling was actually set. |
| 13.2 | File preview chip with thumbnail preview for images | Thumbnail generation in `thumbnail.ts` is a stub that returns raw bytes, not a real thumbnail | "Image attachments get thumbnail preview" in TEST-MATRIX — but thumbnails are fake. |

## Verified Accurate

(spot-checked ✅ items that are genuinely complete — list 10+)

| Feature | Files | Verdict |
| --- | --- | --- |
| DID:key creation + resolution | `packages/did/src/index.ts` — full Ed25519/X25519 multibase encoding, DID document construction | ✅ Genuine — 294 lines of real crypto logic |
| VP-based authentication | `packages/client/src/index.ts`, `packages/server/src/index.ts` — full VP creation and verification flow | ✅ Genuine |
| Community CRUD | Server handlers for create/join/leave/list with ZCAP enforcement | ✅ Genuine |
| Channel CRUD | Server handlers with permission checks, broadcast, full UI wiring | ✅ Genuine |
| Message send/edit/delete | Full flow: client → server → broadcast → UI update | ✅ Genuine |
| E2EE (SimplifiedMLSProvider) | Key package upload, symmetric key derivation, encrypt/decrypt cycle | ✅ Genuine — real XChaCha20-Poly1305 |
| DM E2EE (X25519 key exchange) | `SimplifiedDMProvider` with real ECDH + symmetric encryption | ✅ Genuine — 6 tests verify actual crypto |
| Reactions (add/remove + broadcast) | Server handler + client event + store wiring + UI badges | ✅ Genuine |
| Roles & Permissions | `role.create/update/delete/assign/remove` handlers with FORBIDDEN enforcement | ✅ Genuine |
| Pin system (50-pin limit) | Server enforces PIN_LIMIT, broadcasts pin/unpin events | ✅ Genuine |
| Search (client-side FTS) | `packages/search/src/` — real FTS indexing with BM25 scoring, highlight extraction | ✅ Genuine — 539 lines |
| Presence system | Server tracks online/idle/dnd/offline, broadcasts presence.changed | ✅ Genuine |
| Federation library | `packages/federation/src/index.ts` — 319 lines with real WebSocket peer management, Lamport clocks, CRDT sync | ✅ Genuine code (though correctly marked ⊘ in test matrix — needs real peers) |
| Link preview fetcher | `packages/media/src/link-preview.ts` — real OpenGraph HTML parsing, 116 LOC | ✅ Genuine code (correctly marked 📋 in ROADMAP — not rendered in UI) |

## Summary

- Total stubs/TODOs found: ~25 (excluding legitimate test mocks and UI placeholder text)
- Marked complete but incomplete: **9** (5 crypto concerns, 4 placeholder test assertions)
- Missing from tracking: **7** (zero-salt KDF patterns, mock code in src/, silent error swallowing)
- Overclaimed tests: **5** (4 `expect(true).toBe(true)` tests, 1 fake thumbnail claimed as working)

## Risk Assessment

**High risk:**

- `getMediaKey()` fallback in `client/src/index.ts:1378` — XOR-based "key" derivation is trivially reversible. Any client knowing the channel name can compute the key. This is used when MLS hasn't been established, which happens for new channels created after community join (acknowledged in ROADMAP "Post-Beta" section but media encryption claims ✅).
- `downloadFile()` zero-key fallback at line 1391 — decrypting with all-zero key means files without community context have no encryption.

**Medium risk:**

- Zero salts in identity sync and migration export KDFs — reduces brute-force resistance. Acceptable if secret keys have high entropy, but not best practice.
- Mock adapters in production source files (`cf-calls-adapter.ts`, `insertable-streams.ts`) — could be accidentally instantiated.

**Low risk:**

- DID resolver dummy secretKey — unused in resolution path, but code smell.
- Voice HKDF zero salt — epoch secrets should have sufficient entropy, but deviates from RFC 5869 recommendations.
- 4 placeholder test assertions — these tests exist but don't verify behavior. The features themselves work (verified in E2E test matrix), so the risk is false confidence in unit test coverage, not broken features.
