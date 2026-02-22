export interface TypedLiteral {
  value: string
  datatype?: string
  language?: string
}

export interface Quad {
  subject: string
  predicate: string
  object: string | TypedLiteral
  graph: string
}

export type QuadEvent = { type: 'add'; quad: Quad } | { type: 'remove'; quad: Quad }

export type Unsubscribe = () => void

export interface QuadStore {
  add(quad: Quad): Promise<void>
  addAll(quads: Quad[]): Promise<void>
  remove(quad: Quad): Promise<void>
  removeGraph(graph: string): Promise<void>
  match(pattern: Partial<Quad>): Promise<Quad[]>
  has(pattern: Partial<Quad>): Promise<boolean>
  count(pattern?: Partial<Quad>): Promise<number>
  graphs(): Promise<string[]>
  export(graph?: string): Promise<Quad[]>
  exportNQuads(graph?: string): Promise<string>
  importNQuads(nquads: string): Promise<void>
  subscribe(pattern: Partial<Quad>, callback: (event: QuadEvent) => void): Unsubscribe
}

function objectEquals(a: string | TypedLiteral, b: string | TypedLiteral): boolean {
  if (typeof a === 'string' && typeof b === 'string') return a === b
  if (typeof a === 'object' && typeof b === 'object') {
    return a.value === b.value && a.datatype === b.datatype && a.language === b.language
  }
  return false
}

function quadEquals(a: Quad, b: Quad): boolean {
  return (
    a.subject === b.subject && a.predicate === b.predicate && objectEquals(a.object, b.object) && a.graph === b.graph
  )
}

function matchesPattern(quad: Quad, pattern: Partial<Quad>): boolean {
  if (pattern.subject !== undefined && quad.subject !== pattern.subject) return false
  if (pattern.predicate !== undefined && quad.predicate !== pattern.predicate) return false
  if (pattern.object !== undefined && !objectEquals(quad.object, pattern.object)) return false
  if (pattern.graph !== undefined && quad.graph !== pattern.graph) return false
  return true
}

function serializeObject(obj: string | TypedLiteral): string {
  if (typeof obj === 'string') {
    if (obj.startsWith('_:') || obj.startsWith('<')) return obj
    if (obj.startsWith('"')) return obj
    return `<${obj}>`
  }
  const escaped = obj.value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
  if (obj.language) return `"${escaped}"@${obj.language}`
  if (obj.datatype) return `"${escaped}"^^<${obj.datatype}>`
  return `"${escaped}"`
}

function serializeTerm(term: string): string {
  if (term.startsWith('_:')) return term
  return `<${term}>`
}

function serializeQuad(quad: Quad): string {
  return `${serializeTerm(quad.subject)} ${serializeTerm(quad.predicate)} ${serializeObject(quad.object)} ${serializeTerm(quad.graph)} .`
}

function parseNQuads(nquads: string): Quad[] {
  const quads: Quad[] = []
  for (const line of nquads.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const quad = parseNQuadLine(trimmed)
    if (quad) quads.push(quad)
  }
  return quads
}

function parseTerm(s: string, pos: number): [string, number] {
  if (s[pos] === '<') {
    const end = s.indexOf('>', pos)
    return [s.substring(pos + 1, end), end + 1]
  }
  if (s[pos] === '_' && s[pos + 1] === ':') {
    let end = pos + 2
    while (end < s.length && s[end] !== ' ' && s[end] !== '\t') end++
    return [s.substring(pos, end), end]
  }
  throw new Error(`Unexpected char at ${pos}: ${s[pos]}`)
}

function parseObject(s: string, pos: number): [string | TypedLiteral, number] {
  if (s[pos] === '<' || (s[pos] === '_' && s[pos + 1] === ':')) {
    return parseTerm(s, pos)
  }
  if (s[pos] === '"') {
    let end = pos + 1
    let value = ''
    while (end < s.length) {
      if (s[end] === '\\') {
        const next = s[end + 1]
        if (next === '\\') value += '\\'
        else if (next === '"') value += '"'
        else if (next === 'n') value += '\n'
        else if (next === 'r') value += '\r'
        else if (next === 't') value += '\t'
        else value += next
        end += 2
      } else if (s[end] === '"') {
        end++
        break
      } else {
        value += s[end]
        end++
      }
    }
    if (s[end] === '@') {
      let langEnd = end + 1
      while (langEnd < s.length && s[langEnd] !== ' ' && s[langEnd] !== '\t') langEnd++
      return [{ value, language: s.substring(end + 1, langEnd) }, langEnd]
    }
    if (s[end] === '^' && s[end + 1] === '^') {
      end += 2
      if (s[end] === '<') {
        const dtEnd = s.indexOf('>', end)
        return [{ value, datatype: s.substring(end + 1, dtEnd) }, dtEnd + 1]
      }
    }
    return [{ value }, end]
  }
  throw new Error(`Unexpected object at ${pos}: ${s.substring(pos, pos + 10)}`)
}

function skipWS(s: string, pos: number): number {
  while (pos < s.length && (s[pos] === ' ' || s[pos] === '\t')) pos++
  return pos
}

function parseNQuadLine(line: string): Quad | null {
  try {
    let pos = 0
    pos = skipWS(line, pos)
    const [subject, p1] = parseTerm(line, pos)
    pos = skipWS(line, p1)
    const [predicate, p2] = parseTerm(line, pos)
    pos = skipWS(line, p2)
    const [object, p3] = parseObject(line, pos)
    pos = skipWS(line, p3)
    let graph = ''
    if (line[pos] !== '.') {
      const [g, _p4] = parseTerm(line, pos)
      graph = g
    }
    if (!graph) graph = 'default'
    return { subject, predicate, object, graph }
  } catch {
    return null
  }
}

export class MemoryQuadStore implements QuadStore {
  private quads: Quad[] = []
  private subscribers: Array<{ pattern: Partial<Quad>; callback: (event: QuadEvent) => void }> = []

  async add(quad: Quad): Promise<void> {
    if (!this.quads.some((q) => quadEquals(q, quad))) {
      this.quads.push(quad)
      this.notify({ type: 'add', quad })
    }
  }

  async addAll(quads: Quad[]): Promise<void> {
    for (const q of quads) await this.add(q)
  }

  async remove(quad: Quad): Promise<void> {
    const idx = this.quads.findIndex((q) => quadEquals(q, quad))
    if (idx >= 0) {
      this.quads.splice(idx, 1)
      this.notify({ type: 'remove', quad })
    }
  }

  async removeGraph(graph: string): Promise<void> {
    const toRemove = this.quads.filter((q) => q.graph === graph)
    this.quads = this.quads.filter((q) => q.graph !== graph)
    for (const q of toRemove) this.notify({ type: 'remove', quad: q })
  }

  async match(pattern: Partial<Quad>): Promise<Quad[]> {
    return this.quads.filter((q) => matchesPattern(q, pattern))
  }

  async has(pattern: Partial<Quad>): Promise<boolean> {
    return this.quads.some((q) => matchesPattern(q, pattern))
  }

  async count(pattern?: Partial<Quad>): Promise<number> {
    if (!pattern) return this.quads.length
    return this.quads.filter((q) => matchesPattern(q, pattern)).length
  }

  async graphs(): Promise<string[]> {
    return [...new Set(this.quads.map((q) => q.graph))]
  }

  async export(graph?: string): Promise<Quad[]> {
    if (graph) return this.quads.filter((q) => q.graph === graph)
    return [...this.quads]
  }

  async exportNQuads(graph?: string): Promise<string> {
    const quads = await this.export(graph)
    return quads.map(serializeQuad).join('\n')
  }

  async importNQuads(nquads: string): Promise<void> {
    const parsed = parseNQuads(nquads)
    await this.addAll(parsed)
  }

  subscribe(pattern: Partial<Quad>, callback: (event: QuadEvent) => void): Unsubscribe {
    const sub = { pattern, callback }
    this.subscribers.push(sub)
    return () => {
      const idx = this.subscribers.indexOf(sub)
      if (idx >= 0) this.subscribers.splice(idx, 1)
    }
  }

  private notify(event: QuadEvent): void {
    for (const sub of this.subscribers) {
      if (matchesPattern(event.quad, sub.pattern)) {
        sub.callback(event)
      }
    }
  }
}

export { serializeQuad, parseNQuads }
