// QuadStore backed by Durable Object SQLite storage

export interface Quad {
  subject: string
  predicate: string
  object: string
  graph: string
}

export class DOQuadStore {
  private sql: SqlStorage
  constructor(sql: SqlStorage) {
    this.sql = sql
  }

  add(quad: Quad): void {
    this.sql.exec(
      'INSERT OR IGNORE INTO quads (subject, predicate, object, graph) VALUES (?, ?, ?, ?)',
      quad.subject,
      quad.predicate,
      quad.object,
      quad.graph
    )
  }

  addAll(quads: Quad[]): void {
    for (const quad of quads) {
      this.add(quad)
    }
  }

  remove(quad: Quad): void {
    this.sql.exec(
      'DELETE FROM quads WHERE subject = ? AND predicate = ? AND object = ? AND graph = ?',
      quad.subject,
      quad.predicate,
      quad.object,
      quad.graph
    )
  }

  removeBySubject(subject: string, graph?: string): void {
    if (graph !== undefined) {
      this.sql.exec('DELETE FROM quads WHERE subject = ? AND graph = ?', subject, graph)
    } else {
      this.sql.exec('DELETE FROM quads WHERE subject = ?', subject)
    }
  }

  match(pattern: Partial<Quad>): Quad[] {
    const conditions: string[] = []
    const params: string[] = []

    if (pattern.subject !== undefined) {
      conditions.push('subject = ?')
      params.push(pattern.subject)
    }
    if (pattern.predicate !== undefined) {
      conditions.push('predicate = ?')
      params.push(pattern.predicate)
    }
    if (pattern.object !== undefined) {
      conditions.push('object = ?')
      params.push(pattern.object)
    }
    if (pattern.graph !== undefined) {
      conditions.push('graph = ?')
      params.push(pattern.graph)
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''
    const cursor = this.sql.exec(`SELECT subject, predicate, object, graph FROM quads${where}`, ...params)

    const results: Quad[] = []
    for (const row of cursor) {
      results.push({
        subject: row.subject as string,
        predicate: row.predicate as string,
        object: row.object as string,
        graph: row.graph as string
      })
    }
    return results
  }

  /** Get single object value for a subject+predicate */
  getValue(subject: string, predicate: string, graph?: string): string | null {
    const pattern: Partial<Quad> = { subject, predicate }
    if (graph !== undefined) pattern.graph = graph
    const results = this.match(pattern)
    return results.length > 0 ? results[0].object : null
  }

  count(pattern?: Partial<Quad>): number {
    if (!pattern) {
      const cursor = this.sql.exec('SELECT COUNT(*) as cnt FROM quads')
      for (const row of cursor) return row.cnt as number
      return 0
    }
    return this.match(pattern).length
  }
}
