// SQLite-backed QuadStore using better-sqlite3
import Database from 'better-sqlite3'
import type { Quad, QuadStore, QuadEvent, TypedLiteral } from '@harmony/quads'

type Unsubscribe = () => void

export interface SQLiteQuadStoreStats {
  quadCount: number
  sizeBytes: number
}

interface QuadRow {
  subject: string
  predicate: string
  object_value: string
  object_datatype: string
  object_language: string
  graph: string
}

function objectToString(obj: string | TypedLiteral): string {
  if (typeof obj === 'string') return obj
  return obj.value
}

function objectDatatype(obj: string | TypedLiteral): string {
  if (typeof obj === 'object' && obj.datatype) return obj.datatype
  return ''
}

function objectLanguage(obj: string | TypedLiteral): string {
  if (typeof obj === 'object' && obj.language) return obj.language
  return ''
}

function rowToQuad(row: QuadRow): Quad {
  const obj: string | TypedLiteral =
    row.object_datatype || row.object_language
      ? {
          value: row.object_value,
          datatype: row.object_datatype || undefined,
          language: row.object_language || undefined
        }
      : row.object_value
  return {
    subject: row.subject,
    predicate: row.predicate,
    object: obj,
    graph: row.graph
  }
}

function objectEquals(a: string | TypedLiteral, b: string | TypedLiteral): boolean {
  if (typeof a === 'string' && typeof b === 'string') return a === b
  if (typeof a === 'object' && typeof b === 'object') {
    return a.value === b.value && a.datatype === b.datatype && a.language === b.language
  }
  return false
}

function serializeObject(obj: string | TypedLiteral): string {
  if (typeof obj === 'string') {
    if (obj.startsWith('_:') || obj.startsWith('<')) return obj
    if (obj.startsWith('"')) return obj
    return `<${obj}>`
  }
  let result = `"${obj.value}"`
  if (obj.language) result += `@${obj.language}`
  else if (obj.datatype) result += `^^<${obj.datatype}>`
  return result
}

function serializeSubject(s: string): string {
  if (s.startsWith('_:') || s.startsWith('<')) return s
  return `<${s}>`
}

export class SQLiteQuadStore implements QuadStore {
  private db: Database.Database
  private subscribers: Map<number, { pattern: Partial<Quad>; callback: (event: QuadEvent) => void }> = new Map()
  private nextSubId = 0

  // Prepared statements
  private insertStmt: Database.Statement
  private deleteStmt: Database.Statement
  private deleteGraphStmt: Database.Statement
  private countAllStmt: Database.Statement

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('foreign_keys = ON')
    this.initSchema()

    this.insertStmt = this.db.prepare(
      `INSERT OR IGNORE INTO quads (subject, predicate, object_value, object_datatype, object_language, graph) VALUES (?, ?, ?, ?, ?, ?)`
    )
    this.deleteStmt = this.db.prepare(
      `DELETE FROM quads WHERE subject = ? AND predicate = ? AND object_value = ? AND object_datatype = ? AND object_language = ? AND graph = ?`
    )
    this.deleteGraphStmt = this.db.prepare(`DELETE FROM quads WHERE graph = ?`)
    this.countAllStmt = this.db.prepare(`SELECT COUNT(*) as cnt FROM quads`)
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS quads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject TEXT NOT NULL,
        predicate TEXT NOT NULL,
        object_value TEXT NOT NULL,
        object_datatype TEXT NOT NULL DEFAULT '',
        object_language TEXT NOT NULL DEFAULT '',
        graph TEXT NOT NULL,
        UNIQUE(subject, predicate, object_value, object_datatype, object_language, graph)
      );
      CREATE INDEX IF NOT EXISTS idx_quads_subject ON quads(subject);
      CREATE INDEX IF NOT EXISTS idx_quads_predicate ON quads(predicate);
      CREATE INDEX IF NOT EXISTS idx_quads_graph ON quads(graph);
      CREATE INDEX IF NOT EXISTS idx_quads_spg ON quads(subject, predicate, graph);

      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER NOT NULL
      );
      INSERT OR IGNORE INTO schema_version (rowid, version) VALUES (1, 1);
    `)
  }

  get schemaVersion(): number {
    const row = this.db.prepare('SELECT version FROM schema_version WHERE rowid = 1').get() as
      | { version: number }
      | undefined
    return row?.version ?? 0
  }

  applyMigration(name: string, sql: string): void {
    this.db.exec(sql)
    // Update schema version by incrementing
    const current = this.schemaVersion
    this.db.prepare('UPDATE schema_version SET version = ? WHERE rowid = 1').run(current + 1)
    void name // used for logging externally
  }

  private notify(event: QuadEvent): void {
    for (const [, sub] of this.subscribers) {
      if (matchesPattern(event.type === 'add' ? event.quad : event.quad, sub.pattern)) {
        sub.callback(event)
      }
    }
  }

  async add(quad: Quad): Promise<void> {
    const objVal = objectToString(quad.object)
    const objDt = objectDatatype(quad.object)
    const objLang = objectLanguage(quad.object)
    const result = this.insertStmt.run(quad.subject, quad.predicate, objVal, objDt, objLang, quad.graph)
    if (result.changes > 0) {
      this.notify({ type: 'add', quad })
    }
  }

  async addAll(quads: Quad[]): Promise<void> {
    const insertMany = this.db.transaction((qs: Quad[]) => {
      for (const q of qs) {
        const objVal = objectToString(q.object)
        const objDt = objectDatatype(q.object)
        const objLang = objectLanguage(q.object)
        this.insertStmt.run(q.subject, q.predicate, objVal, objDt, objLang, q.graph)
      }
    })
    insertMany(quads)
    for (const q of quads) {
      this.notify({ type: 'add', quad: q })
    }
  }

  async remove(quad: Quad): Promise<void> {
    const objVal = objectToString(quad.object)
    const objDt = objectDatatype(quad.object)
    const objLang = objectLanguage(quad.object)
    const result = this.deleteStmt.run(quad.subject, quad.predicate, objVal, objDt, objLang, quad.graph)
    if (result.changes > 0) {
      this.notify({ type: 'remove', quad })
    }
  }

  async removeGraph(graph: string): Promise<void> {
    this.deleteGraphStmt.run(graph)
  }

  async match(pattern: Partial<Quad>): Promise<Quad[]> {
    const conditions: string[] = []
    const params: (string | null)[] = []

    if (pattern.subject !== undefined) {
      conditions.push('subject = ?')
      params.push(pattern.subject)
    }
    if (pattern.predicate !== undefined) {
      conditions.push('predicate = ?')
      params.push(pattern.predicate)
    }
    if (pattern.object !== undefined) {
      conditions.push('object_value = ?')
      params.push(objectToString(pattern.object))
      const dt = objectDatatype(pattern.object)
      if (dt) {
        conditions.push('object_datatype = ?')
        params.push(dt)
      }
      const lang = objectLanguage(pattern.object)
      if (lang) {
        conditions.push('object_language = ?')
        params.push(lang)
      }
    }
    if (pattern.graph !== undefined) {
      conditions.push('graph = ?')
      params.push(pattern.graph)
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''
    const stmt = this.db.prepare(
      `SELECT subject, predicate, object_value, object_datatype, object_language, graph FROM quads${where}`
    )
    const rows = stmt.all(...params) as QuadRow[]
    return rows.map(rowToQuad)
  }

  async has(pattern: Partial<Quad>): Promise<boolean> {
    const results = await this.match(pattern)
    return results.length > 0
  }

  async count(pattern?: Partial<Quad>): Promise<number> {
    if (!pattern || Object.keys(pattern).length === 0) {
      const row = this.countAllStmt.get() as { cnt: number }
      return row.cnt
    }
    const results = await this.match(pattern)
    return results.length
  }

  async graphs(): Promise<string[]> {
    const rows = this.db.prepare('SELECT DISTINCT graph FROM quads').all() as Array<{ graph: string }>
    return rows.map((r) => r.graph)
  }

  async export(graph?: string): Promise<Quad[]> {
    if (graph) {
      return this.match({ graph })
    }
    const rows = this.db
      .prepare('SELECT subject, predicate, object_value, object_datatype, object_language, graph FROM quads')
      .all() as QuadRow[]
    return rows.map(rowToQuad)
  }

  async exportNQuads(graph?: string): Promise<string> {
    const quads = await this.export(graph)
    return quads
      .map((q) => {
        const s = serializeSubject(q.subject)
        const p = serializeSubject(q.predicate)
        const o = serializeObject(q.object)
        const g = serializeSubject(q.graph)
        return `${s} ${p} ${o} ${g} .`
      })
      .join('\n')
  }

  async importNQuads(nquads: string): Promise<void> {
    const lines = nquads.split('\n').filter((l) => l.trim().length > 0)
    const quads: Quad[] = []
    for (const line of lines) {
      const parsed = parseNQuadLine(line)
      if (parsed) quads.push(parsed)
    }
    await this.addAll(quads)
  }

  subscribe(pattern: Partial<Quad>, callback: (event: QuadEvent) => void): Unsubscribe {
    const id = this.nextSubId++
    this.subscribers.set(id, { pattern, callback })
    return () => {
      this.subscribers.delete(id)
    }
  }

  // Extensions for server-runtime
  async compact(): Promise<void> {
    this.db.pragma('wal_checkpoint(TRUNCATE)')
    this.db.exec('VACUUM')
  }

  async backup(path: string): Promise<void> {
    await this.db.backup(path)
  }

  stats(): SQLiteQuadStoreStats {
    const countRow = this.countAllStmt.get() as { cnt: number }
    // Get page size and page count for size estimate
    const pageSize = (this.db.pragma('page_size') as Array<{ page_size: number }>)[0]?.page_size ?? 4096
    const pageCount = (this.db.pragma('page_count') as Array<{ page_count: number }>)[0]?.page_count ?? 0
    return {
      quadCount: countRow.cnt,
      sizeBytes: pageSize * pageCount
    }
  }

  close(): void {
    this.db.close()
  }

  get database(): Database.Database {
    return this.db
  }
}

function matchesPattern(quad: Quad, pattern: Partial<Quad>): boolean {
  if (pattern.subject !== undefined && quad.subject !== pattern.subject) return false
  if (pattern.predicate !== undefined && quad.predicate !== pattern.predicate) return false
  if (pattern.object !== undefined && !objectEquals(quad.object, pattern.object)) return false
  if (pattern.graph !== undefined && quad.graph !== pattern.graph) return false
  return true
}

function parseNQuadLine(line: string): Quad | null {
  // Simple N-Quads parser
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null

  // Remove trailing ' .'
  const withoutDot = trimmed.replace(/\s*\.\s*$/, '')

  const parts: string[] = []
  let i = 0
  while (i < withoutDot.length && parts.length < 4) {
    if (withoutDot[i] === '<') {
      const end = withoutDot.indexOf('>', i)
      if (end === -1) return null
      parts.push(withoutDot.substring(i + 1, end))
      i = end + 1
    } else if (withoutDot[i] === '"') {
      let end = i + 1
      while (end < withoutDot.length && withoutDot[end] !== '"') {
        if (withoutDot[end] === '\\') end++
        end++
      }
      const value = withoutDot.substring(i + 1, end)
      i = end + 1
      // Check for datatype or language
      if (i < withoutDot.length && withoutDot[i] === '@') {
        const langEnd = withoutDot.indexOf(' ', i)
        const lang = withoutDot.substring(i + 1, langEnd === -1 ? withoutDot.length : langEnd)
        parts.push(JSON.stringify({ value, language: lang }))
        i = langEnd === -1 ? withoutDot.length : langEnd
      } else if (i + 1 < withoutDot.length && withoutDot[i] === '^' && withoutDot[i + 1] === '^') {
        i += 2
        if (withoutDot[i] === '<') {
          const dtEnd = withoutDot.indexOf('>', i)
          const datatype = withoutDot.substring(i + 1, dtEnd)
          parts.push(JSON.stringify({ value, datatype }))
          i = dtEnd + 1
        } else {
          parts.push(value)
        }
      } else {
        parts.push(value)
      }
    } else if (withoutDot[i] === '_') {
      const end = withoutDot.indexOf(' ', i)
      parts.push(withoutDot.substring(i, end === -1 ? withoutDot.length : end))
      i = end === -1 ? withoutDot.length : end
    } else {
      i++
    }
  }

  if (parts.length < 3) return null

  let obj: string | TypedLiteral = parts[2]
  try {
    const parsed = JSON.parse(parts[2])
    if (typeof parsed === 'object' && parsed !== null && 'value' in parsed) {
      obj = parsed as TypedLiteral
    }
  } catch {
    // plain string
  }

  return {
    subject: parts[0],
    predicate: parts[1],
    object: obj,
    graph: parts[3] ?? 'default'
  }
}
