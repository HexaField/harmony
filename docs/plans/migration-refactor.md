# Migration Refactor: Hash-Verified User-Driven Import

## Design Principle

The Discord bot exports **structure only** (channels, roles, categories, permissions) + a **SHA256 hash index** of all messages. It never stores or transmits message content. Users migrate their own messages via Discord's personal data export, verified against the hash index.

## Current Architecture (to be replaced)

```
Bot → Discord API → fetches ALL data (structure + messages + members)
    → encrypts entire bundle → pushes to Portal
    → single admin controls everything
```

**Packages involved:**

- `packages/migration` — `MigrationService` (550 LOC): transform, encrypt, decrypt exports
- `packages/migration/src/discord-export-parser.ts` (268 LOC): parses Discord personal data ZIP
- `packages/migration/src/user-data-transform.ts` (104 LOC): Discord export → quads
- `packages/migration/src/user-data-encryption.ts` (51 LOC): client-side encryption
- `packages/migration-bot` — `MigrationBot` (240 LOC): orchestrates full server export via API
- `packages/migration-bot/src/discord-api.ts` (274 LOC): REST API wrapper
- `packages/discord-bot` — `HarmonyDiscordBot` (377 LOC): slash commands, DiscordJS adapter
- `packages/ui-app/src/migration-client.ts`: UI-side import flow
- `packages/server-runtime/src/migration-endpoint.ts`: server-side import endpoint

**Total affected:** ~1,864 LOC across 5 packages

## New Architecture

```
┌─────────────────────────────────────────────────────┐
│                  ADMIN FLOW (Bot)                    │
│                                                     │
│  1. Admin installs bot, runs /harmony migrate       │
│  2. Bot reads: server name, icon, channels,         │
│     categories, roles, permissions, member list      │
│  3. Bot paginates all messages in all channels       │
│     → for each: compute SHA256(serverId + channelId │
│       + messageId + authorId + timestamp)            │
│     → store ONLY the hash                           │
│  4. Bot creates Harmony community with matching      │
│     structure (channels, categories, roles)          │
│  5. Bot uploads hash index to Harmony server         │
│  6. Bot posts announcement: "Migration ready!        │
│     Export your data at discord.com/settings →       │
│     Privacy → Request All of My Data, then upload    │
│     at https://app.harmony.chat/import"             │
│  7. Bot removes itself from server (optional)        │
│                                                     │
│  Hash index stored per-migration with 30-day TTL    │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                  USER FLOW (Client)                  │
│                                                     │
│  1. User requests Discord data export (GDPR right)  │
│  2. User opens Harmony → Import → select community  │
│  3. User uploads Discord data export ZIP             │
│  4. Client-side parser extracts messages             │
│  5. For each message: recompute same SHA256 hash     │
│  6. Client sends hashes to server for verification   │
│  7. Server checks against stored hash index          │
│  8. Only verified messages are accepted              │
│  9. Messages attributed to uploading user's DID      │
│  10. Messages placed in correct channels via         │
│      Discord→Harmony channel ID mapping              │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                 SERVER/DO STORAGE                    │
│                                                     │
│  migration_hash_index table:                        │
│    migration_id TEXT                                 │
│    hash TEXT (SHA256 hex, indexed)                   │
│    created_at INTEGER                               │
│    expires_at INTEGER (created_at + 30 days)        │
│                                                     │
│  migration_metadata table:                          │
│    migration_id TEXT PRIMARY KEY                     │
│    discord_server_id TEXT                            │
│    harmony_community_id TEXT                         │
│    channel_map TEXT (JSON: discord_id → harmony_id) │
│    initiated_by TEXT (admin DID)                     │
│    created_at INTEGER                               │
│    status TEXT (indexing|ready|expired)              │
│    hash_count INTEGER                               │
│    expires_at INTEGER                               │
└─────────────────────────────────────────────────────┘
```

## Hash Computation

Both bot and client must produce identical hashes:

```typescript
import { createHash } from 'crypto' // Node (bot)
// or crypto.subtle.digest('SHA-256', ...) for browser (client)

function computeMessageHash(
  serverId: string,
  channelId: string,
  messageId: string,
  authorId: string,
  timestamp: string
): string {
  const input = `${serverId}:${channelId}:${messageId}:${authorId}:${timestamp}`
  return createHash('sha256').update(input).digest('hex')
}
```

Shared in `packages/migration/src/hash.ts` — isomorphic (Node + browser via WebCrypto).

## Implementation Plan

### Phase 1: Hash Infrastructure (`packages/migration`)

**New files:**

- `src/hash.ts` — isomorphic `computeMessageHash()`, browser + Node implementations

**Modified files:**

- `src/index.ts` — `MigrationService`:
  - Remove `transformServerExport()` message handling (keep structure transform)
  - Remove `encryptExport()` / `decryptExport()` for full bundles (replace with structure-only)
  - Add `buildHashIndex(messages: Iterable<{serverId, channelId, messageId, authorId, timestamp}>): string[]`
  - Add `verifyUserMessages(hashes: string[], index: Set<string>): {verified: string[], rejected: string[]}`
  - Add `transformUserExport(data: DiscordDataPackage, ownerDID: string, channelMap: Map<string, string>): Quad[]` — maps Discord channel IDs to Harmony channel IDs

**Modified files:**

- `src/discord-export-parser.ts` — extend `ParsedMessage` to include `channelId` and `authorId` (needed for hash recomputation)
- `src/user-data-transform.ts` — update to use channel mapping instead of raw Discord IDs

### Phase 2: Bot Refactor (`packages/migration-bot`)

**Modified: `src/index.ts` — `MigrationBot`:**

Replace `exportServer()` (currently fetches everything and encrypts) with:

```typescript
async migrateServerStructure(params: {
  serverId: string
  adminDID: string
  harmonyServerUrl: string
  onProgress?: (progress: MigrationProgress) => void
}): Promise<MigrationResult> {
  // 1. Fetch structure only: guild info, channels, roles, categories
  // 2. Create Harmony community via WS connection to server
  // 3. Create matching channels with category mapping
  // 4. Create matching roles with permission mapping
  // 5. Return community ID + channel map (discord_id → harmony_id)
}

async buildHashIndex(params: {
  serverId: string
  onProgress?: (progress: HashingProgress) => void
}): Promise<{ hashes: string[], channelMap: Map<string, string> }> {
  // 1. Paginate all messages in all text channels + threads
  // 2. For each message: computeMessageHash(), discard raw data
  // 3. Return array of hex hashes
  // No message content retained at any point
}

async uploadHashIndex(params: {
  migrationId: string
  hashes: string[]
  channelMap: Record<string, string>  // discord → harmony
  serverUrl: string
}): Promise<void> {
  // POST to Harmony server migration endpoint
}

async announceInDiscord(params: {
  guildId: string
  harmonyInviteLink: string
  importUrl: string
}): Promise<void> {
  // Post migration announcement in Discord server
  // Include instructions for personal data export
}
```

Remove: `pushToPortal()`, `pushToLocal()`, full message fetching in export flow. Keep: `generateLinkToken()`, `verifyLinkToken()`, `start()`, `stop()`.

**Modified: `src/discord-api.ts`:**

- Keep as-is (still need `getChannelMessages` for hash indexing)
- Add optional `getMessageById(channelId, messageId)` for spot-verification (not used in main flow)

### Phase 3: Discord Bot Commands (`packages/discord-bot`)

**Modified: `src/bot.ts` — `HarmonyDiscordBot`:**

Replace `/harmony export` with `/harmony migrate`:

```typescript
// New command flow
HARMONY_COMMANDS = [
  {
    name: 'harmony',
    subcommands: [
      {
        name: 'migrate',
        description: 'Migrate this server to Harmony (admin only)',
        requiredPermissions: ['Administrator']
      },
      {
        name: 'status',
        description: 'Check migration status for this server'
      }
      // keep: link, identity, info
    ]
  }
]
```

`handleMigrate()` orchestrates:

1. Call `migrateServerStructure()` → creates Harmony community
2. Call `buildHashIndex()` → hashes all messages (show progress in Discord embed)
3. Call `uploadHashIndex()` → sends hashes to Harmony server
4. Call `announceInDiscord()` → posts migration announcement
5. Bot optionally removes itself

Remove: `handleExport()`, `dmIdentityTokens()`.

### Phase 4: Server Endpoint (`packages/server-runtime`)

**Modified: `src/migration-endpoint.ts`:**

New endpoints:

```
POST /api/migration/create
  Body: { discordServerId, communityId, channelMap, adminDID }
  → Creates migration record, returns migrationId

POST /api/migration/:id/hashes
  Body: { hashes: string[] }  (chunked upload, up to 100K hashes per request)
  → Stores hashes in SQLite table with migration_id + expires_at

POST /api/migration/:id/verify
  Body: { hashes: string[] }  (user submits their message hashes)
  → Returns { verified: string[], rejected: string[] }

GET  /api/migration/:id/status
  → Returns { status, hashCount, expiresAt, channelMap }

POST /api/migration/:id/import
  Body: { messages: VerifiedMessage[] }  (only verified messages)
  → Inserts messages into community channels
  Auth: user's DID (messages attributed to them)

DELETE /api/migration/:id
  Auth: admin DID only
  → Purges hash index + metadata
```

**New SQLite tables** (in server-runtime + cloud-worker DO):

```sql
CREATE TABLE migration_metadata (
  migration_id TEXT PRIMARY KEY,
  discord_server_id TEXT NOT NULL,
  harmony_community_id TEXT NOT NULL,
  channel_map TEXT NOT NULL,        -- JSON
  initiated_by TEXT NOT NULL,       -- admin DID
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,      -- +30 days
  status TEXT NOT NULL DEFAULT 'indexing',
  hash_count INTEGER DEFAULT 0
);

CREATE TABLE migration_hash_index (
  migration_id TEXT NOT NULL,
  hash TEXT NOT NULL,
  FOREIGN KEY (migration_id) REFERENCES migration_metadata(migration_id)
);
CREATE INDEX idx_migration_hashes ON migration_hash_index(migration_id, hash);
```

Add a cron/periodic job to purge expired migrations (`expires_at < now()`).

### Phase 5: Client Import Flow (`packages/ui-app`)

**Modified: `src/migration-client.ts`:**

Replace current import flow with:

```typescript
export async function importDiscordExport(params: {
  file: File // Discord data export ZIP
  migrationId: string // from the migration the admin set up
  client: HarmonyClient
  onProgress?: (progress: ImportProgress) => void
}): Promise<ImportResult> {
  // 1. Parse ZIP client-side (already exists in discord-export-parser.ts)
  const parsed = await parseDiscordDataPackage(file)

  // 2. Recompute hashes for user's messages
  const userHashes = parsed.messages.flatMap((ch) =>
    ch.messages.map((msg) => ({
      hash: computeMessageHash(serverId, ch.channelId, msg.id, parsed.account.id, msg.timestamp),
      message: msg,
      channelId: ch.channelId
    }))
  )

  // 3. Send hashes to server for verification
  const { verified } = await client.verifyMigrationHashes(
    migrationId,
    userHashes.map((h) => h.hash)
  )

  // 4. Filter to verified messages only
  const verifiedSet = new Set(verified)
  const toImport = userHashes.filter((h) => verifiedSet.has(h.hash))

  // 5. Map Discord channels → Harmony channels using migration's channelMap
  // 6. Send verified messages to server for import
  // 7. Messages attributed to current user's DID
}
```

**UI changes:**

- Import page: select migration (dropdown of available migrations for communities user belongs to)
- Drag-and-drop ZIP upload
- Progress bar: parsing → hashing → verifying → importing
- Summary: "X messages verified and imported, Y rejected"

### Phase 6: Cloud Worker (`packages/cloud-worker`)

**Modified: `src/community-do.ts`:**

Add handlers:

- `migration.create` → stores metadata in DO SQLite
- `migration.hashes.upload` → bulk inserts hashes
- `migration.verify` → checks hashes against index
- `migration.import` → inserts verified messages
- `migration.status` → returns metadata
- `migration.delete` → purges data

Uses same SQLite schema as server-runtime.

### Phase 7: Tests

**Update existing:**

- `packages/discord-bot/test/discord-bot.spec.ts` — rewrite for new command structure
- `packages/migration/test/*.spec.ts` — add hash computation + verification tests
- `packages/integration-tests/test/migration.spec.ts` — rewrite for new flow
- `packages/integration-tests/test/migration-e2e.spec.ts` — rewrite for hash-based flow
- `packages/ui-app/test/migration-*.spec.ts` — update for new client flow

**New:**

- `packages/migration/test/hash.spec.ts` — isomorphic hash tests (Node + WebCrypto parity)
- `packages/migration/test/verify.spec.ts` — hash index verification (match, reject, partial)
- `packages/server-runtime/test/migration-hash.spec.ts` — endpoint integration tests
- `packages/cloud-worker/test/migration-do.spec.ts` — DO handler tests

## Migration Sequence Diagram

```
Admin                Bot              Harmony Server       Discord API
  │                   │                     │                   │
  │ /harmony migrate  │                     │                   │
  │──────────────────>│                     │                   │
  │                   │  getGuild           │                   │
  │                   │────────────────────────────────────────>│
  │                   │<────────────────────────────────────────│
  │                   │  getChannels, getRoles                  │
  │                   │────────────────────────────────────────>│
  │                   │<────────────────────────────────────────│
  │                   │                     │                   │
  │                   │ community.create    │                   │
  │                   │────────────────────>│                   │
  │                   │<────────────────────│                   │
  │                   │                     │                   │
  │                   │ channel.create ×N   │                   │
  │                   │────────────────────>│                   │
  │                   │                     │                   │
  │  "Indexing..."    │  getMessages (paginated)                │
  │<──────────────────│────────────────────────────────────────>│
  │                   │  hash each msg      │                   │
  │                   │  discard content    │                   │
  │                   │<────────────────────────────────────────│
  │                   │                     │                   │
  │                   │ migration.hashes    │                   │
  │                   │────────────────────>│ store hashes      │
  │                   │                     │ (30-day TTL)      │
  │                   │                     │                   │
  │                   │ post announcement   │                   │
  │                   │────────────────────────────────────────>│
  │  "Done! ✅"       │                     │                   │
  │<──────────────────│                     │                   │
  │                   │ (bot leaves server) │                   │


User              Harmony Client          Harmony Server
  │                     │                       │
  │ Upload ZIP          │                       │
  │────────────────────>│                       │
  │                     │ parse ZIP (local)     │
  │                     │ compute hashes        │
  │                     │                       │
  │                     │ migration.verify      │
  │                     │──────────────────────>│ check index
  │                     │<──────────────────────│ {verified, rejected}
  │                     │                       │
  │                     │ migration.import      │
  │                     │──────────────────────>│ insert messages
  │                     │                       │ (user's DID)
  │ "42 messages        │                       │
  │  imported! ✅"      │                       │
  │<────────────────────│                       │
```

## Data Flow Summary

| Data | Who touches it | Stored where | Retention |
| --- | --- | --- | --- |
| Server structure (channels, roles) | Bot → Harmony server | Harmony community DB | Permanent |
| Message hashes (SHA256) | Bot computes, server stores | migration_hash_index table | 30 days |
| Message content | User's Discord export → user's browser only | Harmony messages DB (after verify) | Permanent |
| Discord user IDs | Bot sees in-memory during hashing, never stored | Nowhere | Discarded immediately |
| Member list (usernames) | Bot reads for placeholder mapping | Harmony member placeholders (no messages) | Permanent |
| Channel mapping | Bot creates | migration_metadata | 30 days (metadata) / permanent (community) |

## Execution Order

1. **Phase 1** (hash infrastructure) — no dependencies, pure library code
2. **Phase 2** (bot refactor) — depends on Phase 1
3. **Phase 3** (discord-bot commands) — depends on Phase 2
4. **Phase 4** (server endpoint) — parallel with Phase 2-3
5. **Phase 5** (client import UI) — depends on Phase 1 + 4
6. **Phase 6** (cloud worker) — parallel with Phase 4 (same schema)
7. **Phase 7** (tests) — after each phase

Phases 1+4+6 can run in parallel. Phases 2+3 are sequential. Phase 5 after 1+4.

## Privacy Policy Requirements

Document in privacy policy / migration help page:

- Bot reads server structure and message metadata (IDs, timestamps, author IDs) ONE TIME
- Message content is NEVER read, stored, or transmitted by the bot
- SHA256 hashes of metadata are stored for 30 days to verify user-uploaded exports
- Hashes are one-way and cannot be reversed to recover any data
- Users control whether to migrate their messages — no messages appear without explicit upload
- Hash index automatically purged after 30 days
- Admin can manually purge earlier via `/harmony migrate purge` or API call
