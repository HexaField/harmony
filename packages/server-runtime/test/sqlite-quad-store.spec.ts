import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SQLiteQuadStore } from '../src/sqlite-quad-store.js'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { Quad } from '@harmony/quads'

let store: SQLiteQuadStore
let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'quad-test-'))
  store = new SQLiteQuadStore(join(tmpDir, 'test.db'))
})

afterEach(() => {
  store.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('SQLiteQuadStore dedup (INSERT OR IGNORE)', () => {
  const quad: Quad = {
    subject: 'harmony:channel:1',
    predicate: 'rdf:type',
    object: 'harmony:Channel',
    graph: 'harmony:community:1'
  }

  it('inserting the same quad twice does not create duplicates', async () => {
    await store.add(quad)
    await store.add(quad)
    const results = await store.match({ subject: quad.subject })
    expect(results).toHaveLength(1)
  })

  it('addAll with duplicate quads does not create duplicates', async () => {
    await store.addAll([quad, quad, quad])
    const results = await store.match({ subject: quad.subject })
    expect(results).toHaveLength(1)
  })

  it('re-importing identical quad set is idempotent', async () => {
    const quads: Quad[] = [
      { subject: 's1', predicate: 'p1', object: 'o1', graph: 'g1' },
      { subject: 's1', predicate: 'p2', object: 'o2', graph: 'g1' },
      { subject: 's2', predicate: 'p1', object: { value: 'typed', datatype: 'xsd:string' }, graph: 'g1' }
    ]
    await store.addAll(quads)
    const before = await store.match({ graph: 'g1' })
    await store.addAll(quads)
    const after = await store.match({ graph: 'g1' })
    expect(after).toHaveLength(before.length)
  })

  it('quads with typed literals dedup correctly', async () => {
    const q: Quad = {
      subject: 's1',
      predicate: 'p1',
      object: { value: '2023-01-01', datatype: 'xsd:dateTime' },
      graph: 'g1'
    }
    await store.add(q)
    await store.add(q)
    const results = await store.match({ subject: 's1' })
    expect(results).toHaveLength(1)
  })

  it('quads with language tags dedup correctly', async () => {
    const q: Quad = {
      subject: 's1',
      predicate: 'p1',
      object: { value: 'Hello', language: 'en' },
      graph: 'g1'
    }
    await store.add(q)
    await store.add(q)
    const results = await store.match({ subject: 's1' })
    expect(results).toHaveLength(1)
  })

  it('plain string objects dedup correctly (no datatype/language)', async () => {
    const q: Quad = {
      subject: 's1',
      predicate: 'rdf:type',
      object: 'harmony:Channel',
      graph: 'g1'
    }
    await store.add(q)
    await store.add(q)
    await store.add(q)
    const results = await store.match({ subject: 's1' })
    expect(results).toHaveLength(1)
  })

  it('new quads are added alongside existing ones on re-import', async () => {
    const batch1: Quad[] = [{ subject: 's1', predicate: 'p1', object: 'o1', graph: 'g1' }]
    const batch2: Quad[] = [
      { subject: 's1', predicate: 'p1', object: 'o1', graph: 'g1' }, // duplicate
      { subject: 's2', predicate: 'p1', object: 'o2', graph: 'g1' } // new
    ]
    await store.addAll(batch1)
    await store.addAll(batch2)
    const results = await store.match({ graph: 'g1' })
    expect(results).toHaveLength(2)
  })

  it('delete works for plain string objects', async () => {
    await store.add(quad)
    await store.remove(quad)
    const results = await store.match({ subject: quad.subject })
    expect(results).toHaveLength(0)
  })

  it('delete works for typed literal objects', async () => {
    const q: Quad = {
      subject: 's1',
      predicate: 'p1',
      object: { value: '2023', datatype: 'xsd:gYear' },
      graph: 'g1'
    }
    await store.add(q)
    await store.remove(q)
    const results = await store.match({ subject: 's1' })
    expect(results).toHaveLength(0)
  })
})
