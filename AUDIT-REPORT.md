# Harmony Codebase Audit Report

_Generated 2026-03-01 by Hex_

---

## Section 1: Stubs/TODOs in Code NOT Tracked in ROADMAP or Test Matrix

These are issues present in the code that are **not called out** in ROADMAP.md or TEST-MATRIX-20260227.md as incomplete.

| # | File | Line | Issue | What It Relates To |
| --- | --- | --- | --- | --- |
| 1 | `packages/client/src/index.ts` | 1371, 1377 | `// Use a dummy channel key (in real impl, would use MLS group key)` — `channelKey = new Uint8Array(32)` (all zeros) used for media upload AND download encryption | **Media E2EE is not functional.** Files are "encrypted" with a zeroed key. ROADMAP marks Media upload ✅ but doesn't flag this. |
| 2 | `packages/client/src/index.ts` | 730 | `encryptionPublicKey: new Uint8Array(32)` — zeroed encryption public key in some context | Key material placeholder |
| 3 | `packages/credentials/src/issuance.ts` | 93–100 | `checkIssuerPolicy()` is a no-op — comment says "trust the caller" | Credential issuance has **no authorization enforcement**. ROADMAP marks VC issuance ✅ but this policy check is hollow. |
| 4 | `packages/credentials/src/cross-community.ts` | entire file (32 LOC) | `CrossCommunityService` — only checks `transferable` flag and delegates to `VCService.verify()`. No actual cross-community trust establishment. | ROADMAP marks this 📋 (correct), but the test matrix doesn't mention it at all. |
| 5 | `packages/ui-app/src/services/recovery.ts` | 3, 96, 110 | "Server-side relay not yet available", creates "placeholder" request locally | Social recovery approve/status/complete are non-functional. ROADMAP B6 marked ✅ but the ✅ only covers client-side setup. |
| 6 | `packages/ui-app/src/views/OnboardingView.tsx` | 589, 598, 615 | "coming in a future update" for recovery completion and status checking | Same as above — user-facing dead ends in recovery flow |
| 7 | `packages/integration-tests/test/full-e2e.spec.ts` | 197 | `// TODO: sync.response message parsing may need work` | Sync response parsing may be incomplete |
| 8 | `packages/app/test/user-journeys.spec.ts` | 488 | "Server-side ban enforcement is not yet wired (server accepts any valid VP)" | Ban enforcement gap in `app` package's auth flow |
| 9 | `packages/media/src/thumbnail.ts` | entire file | Returns first 1024 bytes with a `HMYTHUMB:` marker prefix — **not a real thumbnail**. Comment admits "can't decode images in pure isomorphic environment." | ROADMAP marks Thumbnail generation 📋 (correct), but this fake implementation could mislead. |
| 10 | `packages/e2ee/src/mls.ts` | 167 | `mySigningKey: new Uint8Array(0), // placeholder — joiner fills in own keys` | MLS placeholder for joiner signing key |
| 11 | `packages/server/src/index.ts` | 2079 | `// Wire up raid alert broadcasting` — comment suggesting incomplete wiring | Raid alerts may not broadcast to admins |

---

## Section 2: Items Marked ✅ in ROADMAP/Test Matrix That Are Actually Incomplete

| # | ROADMAP/Matrix Item | What's Actually Missing | Evidence |
| --- | --- | --- | --- |
| 1 | **Media upload ✅ (Lib/Server/UI)** | Media files are encrypted with `new Uint8Array(32)` (all zeros) — no real channel key derivation from MLS. Upload/download works mechanically but E2EE is **fake**. | `packages/client/src/index.ts:1371-1377` — hardcoded zero key |
| 2 | **File checksum verification 📋** | Actually this is correctly marked 📋 in ROADMAP. The code exists and works (`packages/media/src/checksum.ts`). **This could be upgraded to 🔧 or ✅** — checksums are computed and verified in `media-client.ts`. | `packages/media/src/checksum.ts` + `media-client.ts:172,197` |
| 3 | **Social Recovery (UI ✅, Cloud ✅)** | B6 is marked ✅ but only client-side setup works. Approve, status check, and completion all show "coming in a future update" to the user. The ROADMAP does document this in "Post-Beta: Future Work" but the feature matrix marks Cloud ✅. | `packages/ui-app/src/services/recovery.ts:3,96` |
| 4 | **VC issuance ✅ (Lib/Server)** | `VCService.issue()` works for signature generation but `CredentialIssuer.checkIssuerPolicy()` is a no-op — no actual authorization check on who can issue credentials. | `packages/credentials/src/issuance.ts:93-100` |
| 5 | **Test Matrix 10.7 — Slow mode/account age/raid detection marked ⊘ "Stub only"** | Actually these ARE implemented server-side (ROADMAP marks them ✅ for Lib/Server). The test matrix is wrong — they're not stubs, they have real server handlers with tests. | ROADMAP Moderation section shows ✅ for Lib/Server |
| 6 | **Test Matrix 17.5 — VC portfolio UI ✅** | The test matrix marks this ✅ with "VCPortfolio class + SolidJS components exported." But ROADMAP marks the UI components 📋 (not wired). The components exist but aren't connected to live data. | ROADMAP VC section: "VC portfolio UI → 📋" |

---

## Section 3: Items Marked ✅ That Look Genuinely Complete (Spot-Check Confirmation)

Spot-checked the following ✅ items by reading actual implementation code:

- **DID:key creation + resolution** — `packages/did/src/index.ts` has full Ed25519/X25519 key generation and resolution. ✅ confirmed.
- **VP-based authentication** — Server `handleAuth` verifies VP signatures. ✅ confirmed.
- **Mnemonic backup (BIP-39)** — Full 12-word generation, verification flow in onboarding. ✅ confirmed.
- **Channel CRUD** — Server handlers for create/update/delete with broadcasts. ✅ confirmed.
- **Channel pins** — Pin/unpin with 50-limit enforcement. ✅ confirmed.
- **Ban/unban/kick** — Server handlers exist with ban list persistence. ✅ confirmed.
- **MLS key exchange** — `packages/e2ee/src/mls.ts` has full Welcome/Commit flow, 88 tests. ✅ confirmed.
- **DM encryption (X25519 + XChaCha20-Poly1305)** — Key exchange and encryption in `packages/e2ee/`. ✅ confirmed.
- **Media upload (MIME validation, 10MB limit)** — Server validates content type and size. ✅ confirmed (but key derivation is fake per Section 2 #1).
- **Search (tokenizer + inverted index)** — `packages/search/` has full FTS implementation with 39 tests. ✅ confirmed.
- **Discord migration** — Full export/transform pipeline with 14+ integration tests. ✅ confirmed.
- **Notifications (mention detection, list/mark-read)** — Server handlers exist. ✅ confirmed.
- **Mediasoup SFU adapter** — `packages/voice/` has real mediasoup integration. ✅ confirmed.
- **PWA service worker** — manifest + sw.js present. ✅ confirmed.
- **Lamport clock / CRDT** — `packages/crdt/` has tick/merge/ordered log. ✅ confirmed.
- **Rate limiting** — Server-side rate limiting with configurable windows. ✅ confirmed.
- **Link preview service** — `packages/media/src/link-preview.ts` has full OG tag parsing (116 LOC). ROADMAP correctly marks it 📋 since it's not rendered in messages.
- **File checksum** — Works correctly despite 📋 marking. Could be upgraded.
- **Governance engine** — 898 LOC across 6 files. ROADMAP correctly marks 📋 (not wired to server).
- **Federation manager** — 319 LOC skeleton. ROADMAP correctly marks 📋.

---

## Summary of Critical Findings

1. **🔴 Media E2EE is fake** — all-zero encryption key in `client/src/index.ts`. Files are technically encrypted/decrypted but with a known key. Not tracked anywhere as incomplete.

2. **🟡 Credential issuer authorization is a no-op** — `checkIssuerPolicy()` does nothing. Anyone calling the API can issue any credential type.

3. **🟡 Social Recovery marked ✅ but 3/5 user flows are dead ends** — documented in "Post-Beta" section but feature matrix overstates readiness (Cloud column shows ✅).

4. **🟢 Test Matrix 10.7 understates moderation** — marks slow mode/raid detection as "Stub only" but they're actually implemented with server handlers and tests.

5. **🟡 Test Matrix 17.5 overstates VC portfolio** — marks ✅ but ROADMAP correctly shows UI is 📋 (unwired).

6. **114 `it.todo()` tests** — all properly tracked in ROADMAP's "Skipped & Todo Tests" section. No surprises here.

7. **No `throw new Error('not implemented')` patterns found** anywhere in the codebase.

8. **No empty function bodies** found that constitute stubs (the few `() => {}` are legitimate event handler patterns or no-ops).
