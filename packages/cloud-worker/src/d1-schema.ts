// D1 Schema and in-memory test implementation
import type { D1Database, D1PreparedStatement, D1Result, D1ExecResult } from './types.js'

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS identity_links (
  discord_user_id TEXT PRIMARY KEY,
  did TEXT NOT NULL UNIQUE,
  proof TEXT NOT NULL,
  linked_at TEXT NOT NULL DEFAULT (datetime('now')),
  verified INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  community_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  community_name TEXT,
  community_description TEXT,
  member_count INTEGER DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  max_uses INTEGER,
  uses INTEGER NOT NULL DEFAULT 0,
  revoked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS directory (
  community_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  endpoint TEXT NOT NULL,
  member_count INTEGER DEFAULT 0,
  invite_code TEXT,
  listed_at TEXT NOT NULL DEFAULT (datetime('now')),
  owner_did TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS export_metadata (
  export_id TEXT PRIMARY KEY,
  admin_did TEXT NOT NULL,
  community_name TEXT,
  quad_count INTEGER NOT NULL DEFAULT 0,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_identity_links_did ON identity_links(did);
CREATE INDEX IF NOT EXISTS idx_export_metadata_admin ON export_metadata(admin_did);
CREATE INDEX IF NOT EXISTS idx_invites_community ON invites(community_id);
CREATE INDEX IF NOT EXISTS idx_directory_owner ON directory(owner_did);
`

// In-memory D1 implementation for testing
interface TableRow {
  [key: string]: unknown
}

export class InMemoryD1 implements D1Database {
  private tables: Map<string, TableRow[]> = new Map()
  private initialized = false

  async exec(query: string): Promise<D1ExecResult> {
    // Parse CREATE TABLE and CREATE INDEX statements
    const statements = query.split(';').filter((s) => s.trim().length > 0)
    for (const stmt of statements) {
      const trimmed = stmt.trim()
      if (trimmed.startsWith('CREATE TABLE')) {
        const match = trimmed.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)/i)
        if (match) {
          if (!this.tables.has(match[1])) {
            this.tables.set(match[1], [])
          }
        }
      }
      // CREATE INDEX — no-op for in-memory
    }
    this.initialized = true
    return { count: statements.length, duration: 0 }
  }

  isInitialized(): boolean {
    return this.initialized
  }

  prepare(query: string): D1PreparedStatement {
    return new InMemoryStatement(this, query)
  }

  async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    const results: D1Result[] = []
    for (const stmt of statements) {
      results.push(await stmt.run())
    }
    return results
  }

  // Internal methods for the statement to use
  _getTable(name: string): TableRow[] {
    if (!this.tables.has(name)) {
      this.tables.set(name, [])
    }
    return this.tables.get(name)!
  }

  _setTable(name: string, rows: TableRow[]): void {
    this.tables.set(name, rows)
  }
}

class InMemoryStatement implements D1PreparedStatement {
  private db: InMemoryD1
  private query: string
  private bindings: unknown[] = []

  constructor(db: InMemoryD1, query: string) {
    this.db = db
    this.query = query
  }

  bind(...values: unknown[]): D1PreparedStatement {
    this.bindings = values
    return this
  }

  async first<T = Record<string, unknown>>(_column?: string): Promise<T | null> {
    const result = await this.all<T>()
    return result.results[0] ?? null
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const { type, table, conditions } = this.parseQuery()

    if (type === 'SELECT') {
      const rows = this.db._getTable(table)
      const filtered = this.applyConditions(rows, conditions)
      return { results: filtered as T[], success: true, meta: {} }
    }

    return { results: [], success: true, meta: {} }
  }

  async run(): Promise<D1Result> {
    const { type, table, data, conditions } = this.parseQuery()

    if (type === 'INSERT') {
      const rows = this.db._getTable(table)
      // Check unique constraints by scanning for existing rows
      const isReplace = this.query.toUpperCase().includes('OR REPLACE')
      const isIgnore = this.query.toUpperCase().includes('OR IGNORE')

      if (isReplace) {
        // Remove existing row with same primary key
        const pkCol = this.getPrimaryKeyColumn(table)
        if (pkCol && data[pkCol] !== undefined) {
          const idx = rows.findIndex((r) => r[pkCol] === data[pkCol])
          if (idx >= 0) rows.splice(idx, 1)
        }
      } else if (isIgnore) {
        // Skip insert if row with same primary key exists
        const pkCol = this.getPrimaryKeyColumn(table)
        if (pkCol && data[pkCol] !== undefined) {
          const existing = rows.find((r) => r[pkCol] === data[pkCol])
          if (existing) return { results: [], success: true, meta: {} }
        }
      }

      rows.push({ ...data, created_at: data.created_at ?? new Date().toISOString() })
    } else if (type === 'UPDATE') {
      const rows = this.db._getTable(table)
      const matching = this.applyConditions(rows, conditions)
      for (const row of matching) {
        for (const [key, val] of Object.entries(data)) {
          if (val === '__INCREMENT__') {
            row[key] = (typeof row[key] === 'number' ? (row[key] as number) : 0) + 1
          } else {
            row[key] = val
          }
        }
      }
    } else if (type === 'DELETE') {
      const rows = this.db._getTable(table)
      const remaining = rows.filter((r) => !this.matchesConditions(r, conditions))
      this.db._setTable(table, remaining)
    }

    return { results: [], success: true, meta: {} }
  }

  private getPrimaryKeyColumn(table: string): string | null {
    const pkMap: Record<string, string> = {
      identity_links: 'discord_user_id',
      invites: 'code',
      directory: 'community_id',
      export_metadata: 'export_id'
    }
    return pkMap[table] ?? null
  }

  private parseQuery(): {
    type: string
    table: string
    data: TableRow
    conditions: Array<{ column: string; value: unknown }>
  } {
    const normalized = this.query.replace(/\s+/g, ' ').trim()
    let bindIdx = 0

    const nextBind = (): unknown => this.bindings[bindIdx++]

    // INSERT
    const insertMatch = normalized.match(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i)
    if (insertMatch) {
      const table = insertMatch[1]
      const columns = insertMatch[2].split(',').map((c) => c.trim())
      const valuePlaceholders = insertMatch[3].split(',').map((v) => v.trim())
      const data: TableRow = {}

      for (let i = 0; i < columns.length; i++) {
        const val = valuePlaceholders[i]
        if (val === '?') {
          data[columns[i]] = nextBind()
        } else if (val.includes("datetime('now')")) {
          data[columns[i]] = new Date().toISOString()
        } else {
          data[columns[i]] = val.replace(/'/g, '')
        }
      }

      return { type: 'INSERT', table, data, conditions: [] }
    }

    // SELECT
    const selectMatch = normalized.match(/SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?$/i)
    if (selectMatch) {
      const table = selectMatch[2]
      const conditions: Array<{ column: string; value: unknown }> = []

      if (selectMatch[3]) {
        const whereClause = selectMatch[3]
        // Handle IN clauses
        const inMatch = whereClause.match(/(\w+)\s+IN\s*\(([^)]+)\)/i)
        if (inMatch) {
          const col = inMatch[1]
          const placeholders = inMatch[2].split(',').map((p) => p.trim())
          const values = placeholders.map(() => nextBind())
          conditions.push({ column: col, value: values })
        } else {
          // Handle simple AND conditions
          const parts = whereClause.split(/\s+AND\s+/i)
          for (const part of parts) {
            const condMatch = part.trim().match(/(\w+)\s*=\s*\?/i)
            if (condMatch) {
              conditions.push({ column: condMatch[1], value: nextBind() })
            }
          }
        }
      }

      return { type: 'SELECT', table, data: {}, conditions }
    }

    // UPDATE
    const updateMatch = normalized.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)$/i)
    if (updateMatch) {
      const table = updateMatch[1]
      const setParts = updateMatch[2].split(',').map((s) => s.trim())
      const data: TableRow = {}

      for (const part of setParts) {
        const eqMatch = part.match(/(\w+)\s*=\s*(.+)/i)
        if (eqMatch) {
          const col = eqMatch[1]
          const val = eqMatch[2].trim()
          if (val === '?') {
            data[col] = nextBind()
          } else if (val.match(/(\w+)\s*\+\s*1/)) {
            // Increment expression like "uses = uses + 1"
            data[col] = '__INCREMENT__'
          } else {
            data[col] = val.replace(/'/g, '')
          }
        }
      }

      const conditions: Array<{ column: string; value: unknown }> = []
      const whereParts = updateMatch[3].split(/\s+AND\s+/i)
      for (const part of whereParts) {
        const condMatch = part.trim().match(/(\w+)\s*=\s*\?/i)
        if (condMatch) {
          conditions.push({ column: condMatch[1], value: nextBind() })
        }
      }

      return { type: 'UPDATE', table, data, conditions }
    }

    // DELETE
    const deleteMatch = normalized.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?$/i)
    if (deleteMatch) {
      const table = deleteMatch[1]
      const conditions: Array<{ column: string; value: unknown }> = []

      if (deleteMatch[2]) {
        const whereParts = deleteMatch[2].split(/\s+AND\s+/i)
        for (const part of whereParts) {
          const condMatch = part.trim().match(/(\w+)\s*=\s*\?/i)
          if (condMatch) {
            conditions.push({ column: condMatch[1], value: nextBind() })
          }
        }
      }

      return { type: 'DELETE', table, data: {}, conditions }
    }

    return { type: 'UNKNOWN', table: '', data: {}, conditions: [] }
  }

  private applyConditions(rows: TableRow[], conditions: Array<{ column: string; value: unknown }>): TableRow[] {
    if (conditions.length === 0) return [...rows]
    return rows.filter((row) => this.matchesConditions(row, conditions))
  }

  private matchesConditions(row: TableRow, conditions: Array<{ column: string; value: unknown }>): boolean {
    for (const cond of conditions) {
      if (Array.isArray(cond.value)) {
        // IN clause
        if (!cond.value.includes(row[cond.column])) return false
      } else {
        if (row[cond.column] !== cond.value) return false
      }
    }
    return true
  }
}

// In-memory R2 implementation
import type { R2Bucket, R2Object, R2ObjectBody, R2PutOptions, R2ListOptions, R2Objects } from './types.js'

export class InMemoryR2 implements R2Bucket {
  private store: Map<string, { data: string; metadata?: Record<string, string> }> = new Map()

  async put(key: string, value: ArrayBuffer | string, options?: R2PutOptions): Promise<R2Object> {
    const data = typeof value === 'string' ? value : new TextDecoder().decode(value)
    this.store.set(key, { data, metadata: options?.customMetadata })
    return { key, size: data.length, etag: 'etag-' + key }
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    const entry = this.store.get(key)
    if (!entry) return null
    return {
      key,
      size: entry.data.length,
      etag: 'etag-' + key,
      async arrayBuffer() {
        return new TextEncoder().encode(entry.data).buffer as ArrayBuffer
      },
      async text() {
        return entry.data
      }
    }
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key)
  }

  async list(options?: R2ListOptions): Promise<R2Objects> {
    const objects: R2Object[] = []
    for (const [key, entry] of this.store) {
      if (options?.prefix && !key.startsWith(options.prefix)) continue
      objects.push({ key, size: entry.data.length, etag: 'etag-' + key })
    }
    return { objects, truncated: false }
  }
}

// In-memory KV implementation
import type { KVNamespace } from './types.js'

export class InMemoryKV implements KVNamespace {
  private store: Map<string, { value: string; expiresAt?: number }> = new Map()

  async get(key: string, _options?: { type?: string }): Promise<string | null> {
    const entry = this.store.get(key)
    if (!entry) return null
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return null
    }
    return entry.value
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    const expiresAt = options?.expirationTtl ? Date.now() + options.expirationTtl * 1000 : undefined
    this.store.set(key, { value, expiresAt })
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key)
  }
}
