# Harmony — Migration Strategy

_How to handle data and schema changes as the architecture evolves._

---

## Principles

1. **Zero data loss.** Every migration must preserve existing user data — messages, identities, communities, channels, memberships.
2. **Backward compatibility window.** Old clients must work with new servers for at least one version. New clients should degrade gracefully against old servers.
3. **Offline-first.** Self-hosted instances may not update immediately. Migrations must be safe to run weeks or months after release.
4. **Reversible where possible.** Additive changes (new columns, new tables) are preferred over destructive ones. If a migration can't be reversed, document it explicitly.
5. **Test with real data.** Every migration must be tested against a snapshot of production-shaped data, not just empty databases.

---

## Current Data Architecture

### Self-Hosted (server-runtime)

- **Storage:** SQLite via `better-sqlite3` in WAL mode
- **Schema:** Single `quads` table (subject, predicate, object_value, object_datatype, object_language, graph) + `schema_version` table
- **Media:** Filesystem (path configured in `storage.media`)
- **State:** In-memory for voice rooms, presence, typing indicators (lost on restart)
- **Identity:** Config file or env var (server's own DID mnemonic)

### Cloud (cloud-worker)

- **Storage:** Durable Object SQLite (one DO per community)
- **Portal:** D1 (identity store, community directory), R2 (media), KV (rate limiting)
- **Schema:** Same quad model, stored in DO SQLite

### Client

- **Identity:** `localStorage` key `harmony:identity`
- **MLS state:** In-memory (lost on reload — known limitation)
- **Message cache:** In-memory

---

## Migration Types

### Type 1: SQLite Schema Migration (Server)

The quad store uses a generic triple/quad model, so most feature additions don't require schema changes. When they do:

**How it works:**

1. `schema_version` table tracks current version (integer)
2. On server start, check `schema_version` against expected version
3. Run migration functions sequentially: `v1→v2`, `v2→v3`, etc.
4. Each migration is a single transaction (atomic)

**Implementation pattern:**

```typescript
// packages/server-runtime/src/migrations/index.ts
interface Migration {
  version: number
  description: string
  up(db: Database): void
  down?(db: Database): void // optional rollback
}

const migrations: Migration[] = [
  {
    version: 2,
    description: 'Add full-text search index',
    up(db) {
      db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS quads_fts
               USING fts5(subject, object_value, content=quads, content_rowid=rowid)`)
    },
    down(db) {
      db.exec('DROP TABLE IF EXISTS quads_fts')
    }
  }
]
```

**Rules:**

- Migrations are **append-only** — never edit a released migration
- Always wrap in a transaction
- Test against a copy of production data before deploying
- Backup database before running: `sqlite3 harmony.db ".backup harmony-pre-migration.db"`

### Type 2: Protocol Message Changes

The WebSocket protocol uses typed JSON messages (`@harmony/protocol`). Changes here affect client-server compatibility.

**Adding new message types:** Safe — old clients ignore unknown types, old servers ignore unknown types.

**Changing existing message payloads:**

- **Adding optional fields:** Safe — both sides tolerate missing fields
- **Removing fields:** Breaking — requires version negotiation
- **Changing field types:** Breaking — requires version negotiation

**Version negotiation (when needed):**

```typescript
// During auth handshake, client sends:
{ type: 'auth', payload: { vp: '...', protocolVersion: 2 } }

// Server responds with:
{ type: 'auth.ok', payload: { protocolVersion: 2 } }
// or
{ type: 'auth.ok', payload: { protocolVersion: 1 } }  // downgrade
```

**Rules:**

- Prefer additive changes (new message types, optional fields)
- When breaking changes are unavoidable, support N and N-1 simultaneously
- Deprecation period: at least 2 releases before removing old format
- Protocol version is a simple integer, not semver

### Type 3: Quad Vocabulary Changes

The RDF quad model means "schema" is really "vocabulary" — which predicates and object patterns we use.

**Adding new predicates:** Safe — old code ignores unknown predicates.

**Changing predicate URIs:** Requires a data migration to rewrite existing quads.

**Pattern:**

```typescript
// Migration that renames a predicate
{
  version: 3,
  description: 'Rename harmony:channelType to harmony:channel/type',
  up(db) {
    db.prepare(`
      UPDATE quads SET predicate = ? WHERE predicate = ?
    `).run('harmony:channel/type', 'harmony:channelType')
  }
}
```

### Type 4: Durable Object Migration (Cloud)

CF Durable Objects have their own migration system via `wrangler.toml`:

```toml
[[migrations]]
tag = "v1"
new_sqlite_classes = ["CommunityDurableObject"]

[[migrations]]
tag = "v2"
# renamed_classes or deleted_classes
```

DO SQLite migrations follow the same pattern as server-runtime but run inside the DO class `constructor` or `migrate()` method.

**Rules:**

- DO migrations are per-community (each DO has its own SQLite)
- Migrations run on first access after deploy — lazy, not eager
- Test with `wrangler dev` before deploying
- Cannot roll back DO class deletions

### Type 5: Client Storage Migration

Client data is in `localStorage`. Migrations run on app load.

```typescript
const STORAGE_VERSION = 2

function migrateClientStorage() {
  const current = parseInt(localStorage.getItem('harmony:storageVersion') || '1')
  if (current < 2) {
    // v1→v2: move identity from 'harmony:identity' to structured format
    const raw = localStorage.getItem('harmony:identity')
    if (raw) {
      localStorage.setItem('harmony:identity:v2', JSON.stringify({ ...JSON.parse(raw), version: 2 }))
      localStorage.removeItem('harmony:identity')
    }
  }
  localStorage.setItem('harmony:storageVersion', String(STORAGE_VERSION))
}
```

---

## Anticipated Architecture Changes

### Near-Term (Beta)

| Change                    | Migration Type | Impact                       | Strategy                              |
| ------------------------- | -------------- | ---------------------------- | ------------------------------------- |
| Full-text search on quads | Schema (1)     | New FTS5 virtual table       | Additive — `CREATE ... IF NOT EXISTS` |
| Voice state persistence   | Schema (1)     | New table or quad predicates | Additive                              |
| MLS epoch persistence     | Client (5)     | New IndexedDB store          | New storage, no migration needed      |
| Protocol version field    | Protocol (2)   | New optional field in auth   | Additive — backward compatible        |

### Medium-Term (Post-Beta)

| Change                  | Migration Type | Impact                               | Strategy                       |
| ----------------------- | -------------- | ------------------------------------ | ------------------------------ |
| Federation peer table   | Schema (1)     | New table for peer servers           | Additive                       |
| Multi-level ZCAP chains | Vocabulary (3) | New predicates for delegation depth  | Additive                       |
| VC key binding          | Vocabulary (3) | New predicate on membership VCs      | Additive                       |
| DID method expansion    | Protocol (2)   | `did:web`/`did:plc` in auth payloads | Backward compatible (additive) |
| Encrypted media at rest | Schema (1)     | New columns for encryption metadata  | Additive + backfill            |

### Long-Term (Breaking Changes)

| Change | Migration Type | Impact | Strategy |
| --- | --- | --- | --- |
| Quad store → relational | Schema (1) | Complete schema rewrite | Versioned migration with export/import |
| Protocol v2 (binary/CBOR) | Protocol (2) | Wire format change | Dual-protocol support for N-1 window |
| Identity format change | Client (5) + Protocol (2) | Key format change | Migration tool + backward compat window |
| Community data model redesign | Vocabulary (3) | Predicate URI changes | Batch quad rewrite migration |

---

## Migration Execution Checklist

Before running any migration in staging or production:

- [ ] Migration tested against production-shaped data locally
- [ ] Database backed up: `sqlite3 harmony.db ".backup harmony-pre-migration.db"`
- [ ] Rollback procedure documented and tested
- [ ] If protocol change: old clients tested against new server
- [ ] If protocol change: new clients tested against old server
- [ ] Deployment window communicated (if downtime required)
- [ ] Monitoring active during and after migration
- [ ] Verify data integrity post-migration: `SELECT count(*) FROM quads`

---

## Disaster Recovery

### Corrupted Database

```bash
# Stop server
docker compose stop server

# Attempt repair
sqlite3 harmony.db "PRAGMA integrity_check;"

# If corrupted, restore from backup
cp /backups/harmony-latest.db /var/harmony/data/harmony.db

# Restart
docker compose start server
```

### Failed Migration (Stuck Schema Version)

```bash
# Check current version
sqlite3 harmony.db "SELECT version FROM schema_version;"

# If migration partially applied, restore from pre-migration backup
cp harmony-pre-migration.db harmony.db

# Fix the migration code, then retry
```

### Client Storage Corrupted

Users can recover via mnemonic backup:

1. Clear `localStorage` for the app domain
2. Reload → onboarding appears
3. "Recover existing identity" → enter mnemonic
4. Rejoin communities (server still has membership data)

---

## Implementation Status

| Component         | Migration System              | Status                                             |
| ----------------- | ----------------------------- | -------------------------------------------------- |
| SQLite quad store | `schema_version` table exists | ✅ Version tracking in place, no runner yet        |
| Cloud worker DO   | `wrangler.toml` migrations    | ✅ v1 migration defined                            |
| Protocol          | No versioning                 | ❌ Need to add `protocolVersion` to auth handshake |
| Client storage    | No versioning                 | ❌ Need to add `harmony:storageVersion`            |
| Vocabulary        | No tracking                   | ❌ Need to document predicate registry             |

### Next Steps

1. Implement migration runner in `server-runtime` (read `schema_version`, run pending migrations)
2. Add `protocolVersion` to auth handshake (optional field, backward compatible)
3. Add client storage version tracking
4. Create predicate registry document (`VOCABULARY.md`)
