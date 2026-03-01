# Codebase Audit Report — Round 3 (2026-03-01)

## Previously Found (already fixed — NOT re-reporting)

**Round 1 (AUDIT-REPORT.md):** Zeroed media/encryption/download keys in client, XOR key derivation fallback, fake thumbnail (returns first 1024 bytes), zero salt in identity sync KDF, MLS placeholder signing key, DID resolver dummy secretKey, voice HKDF zero salt, mock CF calls adapter in src, insertable-streams mock in src, expect(true).toBe(true) tests, mobile-responsive placeholder test, migration placeholder DID, recovery.ts placeholder.

**Round 2 (AUDIT-REPORT-2.md):** checkIssuerPolicy no-op (now enforces admin+role), reputation silent catch, various test assertion fixes, search index edge cases, missing permission checks, incomplete error handling in voice negotiation.

---

## Critical: Marked Complete But Incomplete

| File:Line | What | ROADMAP/Matrix Status | Actual Status |
| --- | --- | --- | --- |
| `bot-api/src/webhooks.ts:37-46` | **`computeHMAC` is a fake XOR hash, not HMAC-SHA256** — webhook signatures are trivially forgeable. Comment says "simplified for isomorphic testing" but it's in production `src/`. Returns `hmac-<hex number>` from a 32-bit XOR loop. | ROADMAP: bot-api 📋 | **Security-critical stub shipped as real code** |
| `governance/src/execution.ts:18-30` | **`executeActions` is a counter, not an executor** — `create-role`, `create-channel`, `delete-channel`, `update-rule`, `update-constitution` just increment `actionsExecuted` without performing any operation. `delegate-capability` fabricates a fake cap ID string. | ROADMAP: governance 📋 (correctly marked) | Stub (matches tracking — low severity) |
| `governance/src/constitution.ts:103-110` | **`require-role` and `rate-limit` constraint checks are empty stubs** — bodies are just comments (`// Would check if actor has required role`) then `break`. | ROADMAP: governance 📋 | Stub (matches tracking) |
| `e2ee/src/mls.ts:174` | **`processWelcome` is an empty no-op** — existing group members receiving a Welcome message get no state update. MLS group add is broken for receivers. | Matrix 14.4: MLS group add ✅ | **Overclaimed — receivers don't process Welcome** |
| `e2ee/src/mls.ts:163-170` | **`processCommit` skips signature verification** — commit's `signature` field is never verified against the committer's signing key. Any peer can forge commits. | Matrix 14.5: MLS epoch advance ✅ | **Overclaimed — no commit authentication** |
| `cloud-worker/src/community-do.ts:292-316` | **Message edit leaks quads** — `remove()` passes `object: ''` (empty string) but stored object is `JSON.stringify(content)`. Remove never matches → each edit adds a duplicate content quad without removing the old one. | Matrix 3.6: Edit message ✅ | **Bug — edits accumulate duplicate quads** |

---

## Missing From Tracking

| File:Line | What | Notes |
| --- | --- | --- |
| `bot-api/src/bot-host.ts:startBot/stopBot` | **Bot lifecycle is status-flag-only** — `startBot` sets status to `running`, `stopBot` sets to `stopped`. No sandbox, no process spawn, no code execution. | Not in ROADMAP or matrix as incomplete |
| `bot-api/src/bot-context.ts:addReaction` | **`addReaction` is a no-op after auth** — passes rate-limit and auth checks, then returns without storing the reaction or notifying anyone. | Not tracked |
| `bot-api/src/bot-host.ts:constructor` | **`_sandboxEnforcer` parameter accepted but discarded** — underscore-prefixed, never assigned to `this`. Sandbox enforcement never applied to bots. | Not tracked |
| `vc/src/index.ts:revoke` | **No authorization on VC revocation** — `_revokerKeyPair` is accepted but never used. No proof is created or verified. Anyone can revoke any credential. | Not tracked |
| `zcap/src/index.ts:revoke` | **No authorization on capability revocation** — same pattern as VC. `_revokerKeyPair` unused. | Not tracked |
| `zcap/src/index.ts:isScopeNarrowerOrEqual` | **Scope attenuation only checks key presence, not values** — child `{channel: "*"}` passes validation against parent `{channel: "general"}`. Delegation can silently widen scope. | Not tracked — **security issue** |
| `credentials/src/issuance.ts:~85` | **Role-based policy type mismatch** — casts to `{ roles?: string[] }` but `IssuerPolicy` defines `requiredRole?: string` (singular). `policy.roles` always `undefined` → role-based issuance permitted with no check. | Not tracked |
| `credentials/src/issuance.ts:~89` | **`self-attest` and `peer-attest` policies are no-ops** — `self-attest` should verify `issuerDID === subjectDID`; `peer-attest` should check `requiredAttestations` count. Both just pass through. | Not tracked |
| `identity/src/index.ts:createFromOAuthRecovery` | **OAuth recovery creates new identity each time** — derives keypair from `provider + token`, but OAuth tokens are ephemeral. Each recovery attempt with a new token produces a different DID. | Not tracked |
| `identity/src/index.ts:completeRecovery` | **Recovery discards all credentials and capabilities** — creates fresh identity with `credentials: []` and `capabilities: []`. User loses all attestations. | Not tracked |
| `e2ee/src/mls.ts:206-207` | **`updateKeys` generates raw random bytes as encryption key** — no X25519 derivation. The "public key" stored in the leaf node is the raw secret. | Not tracked |
| `e2ee/src/mls.ts:36,42` | **HKDF with undefined salt in MLS epoch key derivation** — `deriveEpochKey` and `advanceEpochSecret` pass `undefined` as salt. Weakens key separation. | Not tracked (voice salt was found; MLS path was not) |
| `e2ee/src/dm.ts:42,53` | **HKDF with undefined salt in DM encryption** — `createChannel` and `openChannel` both derive shared keys with `undefined` salt. | Not tracked |
| `cloud/src/discord-link.ts:28` | **OAuth state token uses `Math.random()`** — not cryptographically secure. Should use `crypto.getRandomValues()`. | Not tracked |
| `cloud/src/hosting-service.ts:119,125` | **Silent failure on instance creation** — `catch {}` after CF provisioning and local spawn. Instance appears "created" with no server URL and no error to caller. | Not tracked |
| `cloud-worker/src/provisioning.ts:43` | **Missing authorization check on delete** — `handleDelete` checks for presence of `Authorization` header but never validates it. Any non-empty auth header allows deletion. | Not tracked — **security issue** |
| `cloud-worker/src/auth.ts:83` | **Dead code in base58 decode** — first loop with broken carry propagation runs, then result is overwritten by BigInt approach. Wastes cycles. | Not tracked |
| `cloud-worker/src/voice-room-do.ts` | **Entire file unused** — `VoiceRoomDO` is never referenced in `index.ts` or any routing. Voice handled inline in `CommunityDurableObject`. | Dead code |
| `server-runtime/src/logger.ts:~46` | **`child()` mutates parent logger's `baseMeta`** — child meta not isolated; parent gets polluted. | Logic bug |
| `portal/src/index.ts:43` | **Hardcoded placeholder OAuth URL** — `initiateOAuthLink` returns `https://oauth.example.com/${provider}/authorize?...` | Not tracked |
| `portal/src/index.ts:59` | **`userKeyPair` param unused** — `completeOAuthLink` accepts it but never uses it. Callers pass `undefined as any`. | Dead parameter |
| `portal/src/server.ts:20` | **Wildcard CORS** — `Access-Control-Allow-Origin` set to whatever origin the request sends, effectively `*` with credentials. | **Security issue** |
| `portal-worker/src/handler.ts:136` | **OAuth callback stores auth code as Discord user ID** — `code` (OAuth authorization code) is passed as `discordUserId` to `identityStore.linkIdentity()`. Should exchange code for access token first. | **Logic bug — links ephemeral code as permanent ID** |
| `portal-worker/src/handler.ts:139` | **Silent catch on identity link failure** — `catch { // May fail if already linked }` swallows all errors including DB failures. | Silent failure |
| `portal-worker/src/handler.ts:152` | **Invite viewing consumes a use** — `resolve()` increments use count as side effect of viewing, and handler calls both `checkValidity` and `resolve`. | Logic bug |
| `portal-worker/src/invite-resolver.ts:22` | **Weak invite codes** — `Math.random().toString(36).substring(2, 10)` — ~8 chars of non-crypto randomness. Guessable/brute-forceable. | **Security issue** |
| `portal-worker/src/relay.ts` | **RelayDurableObject is mock-only** — uses `MockWebSocket` types, not real CF WebSocket APIs. Won't function as a real DO. | Mock in production src |
| `portal-worker/src/d1-schema.ts` | **Fragile regex SQL parser** — `InMemoryStatement.parseQuery()` won't handle subqueries, JOINs, ORDER BY, quoted strings. Exported as public API alongside production code. | Test double in production |
| `portal-worker/src/handler.ts:99,161` | **Hardcoded domains** — `https://portal.harmony.chat` fallback URL and `https://harmony.chat/invite/${code}` not configurable via env. | Hardcoded |
| `cloud-worker/src/auth.ts:108` | **VP verification depends on JSON key ordering** — `JSON.stringify`s raw JSON instead of hashing. Fragile across implementations. | Logic bug |
| `cloud/src/routes/oauth.ts:9` | **Duplicated OAuth state management** — `pendingStates` Map in routes duplicates state tracked inside `DiscordLinkService`. GET flow stores in both, POST uses only the service's. | Maintenance hazard |
| `bot-api/src/bot-context.ts:118` | **`getMember` skips permission check** — `getMembers` requires `ReadPresence` but `getMember` only calls `trackApiCall`. Bots can look up any member without authorization. | **Auth gap** |
| `federation/src/index.ts:166` | **Unhandled promise** — `handleFederatedMessage` called without `await`. Rejected messages produce no error or log. | Silent failure |
| `moderation/src/index.ts:130-136` | **`accountAge` uses proof creation time as account age** — `proof.invocation.proof.created` is when the ZCAP proof was created, not when the DID was created. | Logic bug |
| `governance/src/execution.ts:35-37` | **Success flag logic bug** — `result.success` stays `true` if errors exist but `actionsExecuted === actionsTotal`. Should check `errors.length > 0` alone. | Logic bug |

---

## Overclaimed Test Coverage

| Matrix Row | Claim | Actual Test | Issue |
| --- | --- | --- | --- |
| 14.4 MLS group add | "MLS group add ✅" | `processWelcome` is an empty no-op in `e2ee/src/mls.ts:174` | **Test likely only checks the sender side (addMember), not the receiver processing the Welcome** |
| 14.5 MLS epoch advance | "MLS epoch advance ✅" | `processCommit` never verifies the commit signature | **Test doesn't verify commit authentication — any peer can forge epoch transitions** |
| 3.6 Edit message (cloud-worker) | "Edit message ✅" | `handleChannelEdit` uses `object: ''` for remove which won't match stored content | **Test may pass if it only checks broadcast, not quad store integrity after edit** |

---

## Dead Code / Unreachable Features

| File:Line | What | Notes |
| --- | --- | --- |
| `cloud-worker/src/voice-room-do.ts` | Entire `VoiceRoomDO` class (~170 LOC) | Never imported or referenced. Voice handled in CommunityDurableObject. |
| `cloud-worker/src/auth.ts:83` | First base58 decode loop | Broken carry propagation; result immediately overwritten by BigInt decode. |
| `did/src/index.ts:~87-91` | `multicodec` array allocation in `encodeMultibase` | Allocated, populated, then shadowed by varint-based encoding. |
| `cloud/src/middleware/rate-limit.ts:38` | `clearRateLimits()` | Empty function body with only a comment. No way to actually clear rate limits. |
| `app/src/app.ts:~272` | `checkForUpdates()` | Always returns `{ available: false }`. |
| `app/src/app.ts:~300` | `reconnect()` | "Simulates reconnection" — always returns true. |
| `app/src/app.ts:~315` | `handleFileDrop()` | Returns `{ encrypted: false }` without processing. |
| `app/src/app.ts:~323` | `joinVoice()` | Always returns true without connecting to voice. |

---

## Hardcoded Values That Should Be Configurable

| File:Line | What | Notes |
| --- | --- | --- |
| `server-runtime/src/runtime.ts:166` | `jwtSecret: '***' + (identityDID ?? 'default')` | Predictable JWT secret; should be configurable/rotated |
| `server-runtime/src/runtime.ts:339-342` | `channels: 0, messagesTotal: 0, version: '0.1.0'` | Hardcoded status placeholders |
| `app/src/app.ts:133` | `announcedIp: '192.168.1.111'` | Environment-specific magic IP |
| `client/src/index.ts:786` | `portalBaseUrl = 'https://harmony.chat'` | Baked-in endpoint |
| `cloud/src/hosting-service.ts:93` | `defaultMaxStorageBytes = 100MB, maxInstancesPerUser = 5, _nextPort = 5000` | All embedded as magic defaults |
| `cloud/src/hosting-service.ts:101` | `_dataDir = '/tmp/harmony-cloud/instances'` | Hardcoded absolute path |
| `cloud/src/hosting-service.ts:65` | `healthPort = port + 1` | Implicit convention, not configurable |
| `portal/src/index.ts:43` | `https://oauth.example.com/...` | Placeholder OAuth URL |
| `cloud/src/middleware/rate-limit.ts:15` | `entries` Map grows unbounded | Expired entries never pruned — memory leak |

---

## Verified Accurate (10+ spot checks)

| Feature | Files | Verdict |
| --- | --- | --- |
| Ban/kick enforcement | `server/src/index.ts` (ban handlers, join checks, message checks) | ✅ Fully functional — bans persist, messages rejected, reconnection blocked |
| Pin/unpin with limits | `server/src/index.ts` (pin handlers) | ✅ Working — 50-pin limit, permission checks, broadcasts |
| DM encryption (E2EE) | `e2ee/src/dm.ts`, `client/src/index.ts` | ✅ Key exchange + XChaCha20-Poly1305 works (salt issue aside) |
| Client-side search | `search/src/client-index.ts`, `search/src/tokenizer.ts` | ✅ Full inverted index with TF-IDF scoring, phrase search, filters |
| Rate limiting (server) | `server/src/index.ts` rate limit logic | ✅ Configurable window/max, sends RATE_LIMITED error |
| Moderation plugin | `moderation/src/index.ts` | ✅ Slow mode, rate limits, account age, raid detection, lockdown — all functional |
| Discord export parser | `migration/src/discord-export-parser.ts` | ✅ Real ZIP parsing with fflate, handles account/messages/servers |
| Quad store | `quads/src/index.ts` | ✅ Working in-memory quad store with N-Quads serialization |
| Portal identity routes | `portal/src/routes/identity.ts` | ✅ Create and resolve identities via REST |
| VoiceRoomDO (cloud-worker) | `cloud-worker/src/voice-room-do.ts` | ✅ Well-structured — but dead code (never imported) |
| Notification mark-read | `server/src/index.ts` notification handlers | ✅ Mark individual/all as read, unread count by channel |
| Content filter | `moderation/src/index.ts` ContentFilter class | ✅ Regex-based pattern matching with confidence scores |

---

## Summary

**Round 3 found 37 new issues not caught by prior audits**, broken into:

- **6 security-critical**: Fake HMAC in webhook signing, ZCAP scope attenuation only checks key presence (not values), cloud-worker delete endpoint has no real auth, wildcard CORS on portal, weak invite codes (`Math.random`), guessable OAuth state tokens
- **4 cryptographic weaknesses**: Undefined HKDF salt in MLS epoch keys and DM channels, MLS updateKeys uses raw random bytes as "public key", VP verification depends on JSON key ordering
- **5 protocol/logic bugs**: MLS processWelcome is a no-op, processCommit skips signature verification, cloud-worker message edit leaks duplicate quads, portal-worker OAuth stores auth code as Discord user ID, invite viewing consumes a use
- **5 authorization gaps**: VC revoke has no auth, ZCAP revoke has no auth, role-based issuance policy type mismatch makes it a no-op, self-attest/peer-attest policies are no-ops, bot getMember skips permission check
- **2 identity/recovery bugs**: OAuth recovery creates new DID each time (doesn't recover), recovery discards all credentials
- **8 dead code / stubs**: VoiceRoomDO unused, base58 dead loop, checkForUpdates/reconnect/handleFileDrop/joinVoice stubs, clearRateLimits empty, RelayDurableObject is mock-only
- **7 hardcoded values / maintenance issues**: Predictable JWT secret, hardcoded IPs/URLs/domains, magic numbers, unbounded rate-limit map, duplicated OAuth state management

The prior audits caught the surface-level issues (zeroed keys, obvious TODOs, test placeholders). This round went deeper into function bodies and found **authorization logic that appears correct at a glance but fails due to type mismatches, scope comparison bugs, and no-op method bodies**. The MLS implementation is the most concerning area — Welcome processing and commit verification are both non-functional, meaning the group key agreement protocol is not actually secure.
