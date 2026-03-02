// SQLite-backed RevocationStore using better-sqlite3
import Database from 'better-sqlite3'
import type { RevocationStore, RevocationEntry } from '@harmony/vc'

export class SqliteRevocationStore implements RevocationStore {
  private db: Database.Database
  private stmtRevoke: Database.Statement
  private stmtIsRevoked: Database.Statement
  private stmtList: Database.Statement

  constructor(dbOrPath: Database.Database | string) {
    if (typeof dbOrPath === 'string') {
      this.db = new Database(dbOrPath)
      this.db.pragma('journal_mode = WAL')
    } else {
      this.db = dbOrPath
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS revocations (
        credential_id TEXT PRIMARY KEY,
        reason TEXT,
        revoked_at TEXT NOT NULL
      )
    `)

    this.stmtRevoke = this.db.prepare(
      'INSERT OR IGNORE INTO revocations (credential_id, reason, revoked_at) VALUES (?, ?, ?)'
    )
    this.stmtIsRevoked = this.db.prepare('SELECT 1 FROM revocations WHERE credential_id = ?')
    this.stmtList = this.db.prepare(
      'SELECT credential_id, reason, revoked_at FROM revocations ORDER BY revoked_at DESC'
    )
  }

  async revoke(credentialId: string, reason?: string): Promise<void> {
    this.stmtRevoke.run(credentialId, reason ?? null, new Date().toISOString())
  }

  async isRevoked(credentialId: string): Promise<boolean> {
    return this.stmtIsRevoked.get(credentialId) !== undefined
  }

  async list(): Promise<RevocationEntry[]> {
    const rows = this.stmtList.all() as Array<{ credential_id: string; reason: string | null; revoked_at: string }>
    return rows.map((r) => ({
      credentialId: r.credential_id,
      reason: r.reason ?? undefined,
      revokedAt: r.revoked_at
    }))
  }
}
