import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DOQuadStore, type Quad } from '../src/do-quad-store.js'
import { parseVP, extractDID, extractPublicKeyFromDIDKey } from '../src/auth.js'
import { createInstance, listInstances, deleteInstance } from '../src/provisioning.js'

// ── Mock SqlStorage ──

function createMockSqlStorage() {
  const rows: Quad[] = []

  return {
    exec(query: string, ...params: unknown[]) {
      const sql = query.trim()

      if (sql.startsWith('INSERT OR IGNORE INTO quads')) {
        const [subject, predicate, object, graph] = params as string[]
        const exists = rows.some(
          (r) => r.subject === subject && r.predicate === predicate && r.object === object && r.graph === graph
        )
        if (!exists) {
          rows.push({ subject, predicate, object, graph })
        }
        return { results: [] } as any
      }

      if (sql.startsWith('DELETE FROM quads WHERE subject = ? AND predicate')) {
        const [subject, predicate, object, graph] = params as string[]
        const idx = rows.findIndex(
          (r) => r.subject === subject && r.predicate === predicate && r.object === object && r.graph === graph
        )
        if (idx >= 0) rows.splice(idx, 1)
        return { results: [] } as any
      }

      if (sql.startsWith('DELETE FROM quads WHERE subject = ? AND graph')) {
        const [subject, graph] = params as string[]
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i].subject === subject && rows[i].graph === graph) rows.splice(i, 1)
        }
        return { results: [] } as any
      }

      if (sql.startsWith('DELETE FROM quads WHERE subject = ?')) {
        const [subject] = params as string[]
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i].subject === subject) rows.splice(i, 1)
        }
        return { results: [] } as any
      }

      if (sql.startsWith('SELECT')) {
        // Filter based on WHERE conditions
        let filtered = [...rows]
        const conditions = sql.match(/WHERE (.+)/)?.[1] || ''

        if (conditions) {
          const parts = conditions.split(' AND ')
          let paramIdx = 0
          for (const part of parts) {
            const field = part.split(' = ')[0].trim() as keyof Quad
            const value = params[paramIdx++] as string
            filtered = filtered.filter((r) => r[field] === value)
          }
        }

        // Return an iterable
        return filtered[Symbol.iterator] ? filtered : filtered
      }

      if (sql.startsWith('SELECT COUNT')) {
        return [{ cnt: rows.length }]
      }

      return { results: [] } as any
    },
    _rows: rows
  } as unknown as SqlStorage & { _rows: Quad[] }
}

// ── Mock D1Database ──

function createMockD1() {
  const tables: Record<string, Record<string, unknown>[]> = {
    instances: []
  }

  return {
    prepare(query: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async run() {
              if (query.includes('INSERT INTO instances')) {
                const [id, name, owner_did, created_at, status] = params
                tables.instances.push({ id, name, owner_did, created_at, status })
              }
              if (query.includes('UPDATE instances')) {
                const [id] = params.slice(-1)
                const inst = tables.instances.find((i) => i.id === id)
                if (inst) inst.status = 'deleted'
              }
              return { success: true }
            },
            async all() {
              if (query.includes('SELECT') && query.includes('instances')) {
                const [ownerDID] = params
                const results = tables.instances.filter((i) => i.owner_did === ownerDID && i.status !== 'deleted')
                return { results }
              }
              return { results: [] }
            }
          }
        }
      }
    },
    _tables: tables
  } as unknown as D1Database & { _tables: typeof tables }
}

// ── DOQuadStore Tests ──

describe('DOQuadStore', () => {
  let store: DOQuadStore
  let mockSql: ReturnType<typeof createMockSqlStorage>

  beforeEach(() => {
    mockSql = createMockSqlStorage()
    store = new DOQuadStore(mockSql)
  })

  it('should add and match quads', () => {
    store.add({ subject: 's1', predicate: 'p1', object: 'o1', graph: 'g1' })
    store.add({ subject: 's1', predicate: 'p2', object: 'o2', graph: 'g1' })

    const results = store.match({ subject: 's1' })
    expect(results).toHaveLength(2)
  })

  it('should not add duplicate quads', () => {
    store.add({ subject: 's1', predicate: 'p1', object: 'o1', graph: 'g1' })
    store.add({ subject: 's1', predicate: 'p1', object: 'o1', graph: 'g1' })

    const results = store.match({ subject: 's1' })
    expect(results).toHaveLength(1)
  })

  it('should remove quads', () => {
    store.add({ subject: 's1', predicate: 'p1', object: 'o1', graph: 'g1' })
    store.remove({ subject: 's1', predicate: 'p1', object: 'o1', graph: 'g1' })

    const results = store.match({ subject: 's1' })
    expect(results).toHaveLength(0)
  })

  it('should remove by subject', () => {
    store.add({ subject: 's1', predicate: 'p1', object: 'o1', graph: 'g1' })
    store.add({ subject: 's1', predicate: 'p2', object: 'o2', graph: 'g1' })
    store.add({ subject: 's2', predicate: 'p1', object: 'o1', graph: 'g1' })

    store.removeBySubject('s1', 'g1')

    expect(store.match({ subject: 's1' })).toHaveLength(0)
    expect(store.match({ subject: 's2' })).toHaveLength(1)
  })

  it('should add multiple quads at once', () => {
    store.addAll([
      { subject: 's1', predicate: 'p1', object: 'o1', graph: 'g1' },
      { subject: 's1', predicate: 'p2', object: 'o2', graph: 'g1' },
      { subject: 's2', predicate: 'p1', object: 'o3', graph: 'g1' }
    ])

    expect(store.match({})).toHaveLength(3)
  })

  it('should get a single value', () => {
    store.add({ subject: 's1', predicate: 'p1', object: 'hello', graph: 'g1' })

    expect(store.getValue('s1', 'p1', 'g1')).toBe('hello')
    expect(store.getValue('s1', 'p2', 'g1')).toBeNull()
  })

  it('should match by predicate', () => {
    store.add({ subject: 's1', predicate: 'type', object: 'Community', graph: 'g1' })
    store.add({ subject: 's2', predicate: 'type', object: 'Channel', graph: 'g1' })
    store.add({ subject: 's3', predicate: 'name', object: 'test', graph: 'g1' })

    const results = store.match({ predicate: 'type' })
    expect(results).toHaveLength(2)
  })
})

// ── Auth Tests ──

describe('Auth', () => {
  it('should parse a valid VP', () => {
    const vp = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiablePresentation'],
      verifiableCredential: [],
      holder: 'did:key:z6MkTest123',
      proof: {
        type: 'Ed25519Signature2020',
        created: '2025-01-01T00:00:00Z',
        verificationMethod: 'did:key:z6MkTest123#key-1',
        proofPurpose: 'authentication',
        proofValue: 'dGVzdA=='
      }
    }

    const parsed = parseVP(JSON.stringify(vp))
    expect(parsed).not.toBeNull()
    expect(parsed!.holder).toBe('did:key:z6MkTest123')
  })

  it('should return null for invalid VP', () => {
    expect(parseVP('not json')).toBeNull()
    expect(parseVP(JSON.stringify({ type: ['NotAVP'] }))).toBeNull()
  })

  it('should extract DID from VP', () => {
    const vp = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiablePresentation'],
      verifiableCredential: [],
      holder: 'did:key:z6MkTest123',
      proof: { type: 'Ed25519Signature2020', created: '', verificationMethod: '', proofPurpose: '', proofValue: '' }
    }
    expect(extractDID(vp)).toBe('did:key:z6MkTest123')
  })

  it('should return null for non-did:key DIDs in key extraction', () => {
    expect(extractPublicKeyFromDIDKey('did:web:example.com')).toBeNull()
  })
})

// ── Provisioning Tests ──

describe('Provisioning', () => {
  let db: ReturnType<typeof createMockD1>

  beforeEach(() => {
    db = createMockD1()
  })

  it('should create an instance', async () => {
    const instance = await createInstance(db, { name: 'Test Community', ownerDID: 'did:key:z6MkOwner' })

    expect(instance.name).toBe('Test Community')
    expect(instance.ownerDID).toBe('did:key:z6MkOwner')
    expect(instance.status).toBe('active')
    expect(instance.id).toBeTruthy()
    expect(instance.serverUrl).toBe(`/ws/${instance.id}`)
  })

  it('should list instances for an owner', async () => {
    await createInstance(db, { name: 'Community 1', ownerDID: 'did:key:z6MkOwner' })
    await createInstance(db, { name: 'Community 2', ownerDID: 'did:key:z6MkOwner' })
    await createInstance(db, { name: 'Other', ownerDID: 'did:key:z6MkOther' })

    const instances = await listInstances(db, 'did:key:z6MkOwner')
    expect(instances).toHaveLength(2)
  })

  it('should delete an instance (soft delete)', async () => {
    const instance = await createInstance(db, { name: 'Test', ownerDID: 'did:key:z6MkOwner' })
    await deleteInstance(db, instance.id)

    const instances = await listInstances(db, 'did:key:z6MkOwner')
    expect(instances).toHaveLength(0)
  })
})

// ── Integration Tests (require Workers runtime) ──

describe('CommunityDurableObject', () => {
  it.todo('should accept WebSocket upgrade (requires miniflare with hibernatable WebSockets + DO SQLite)')

  it.todo('should authenticate via VP on first message (requires miniflare with ctx.acceptWebSocket)')

  it.todo('should broadcast messages to all connected clients (requires miniflare with multiple WebSocket connections)')

  it.todo('should timeout unauthenticated connections after 30s (requires miniflare with alarm support)')
})
