import { describe, it, expect } from 'vitest'
import { MemoryQuadStore, type Quad, type TypedLiteral } from '../src/index.js'

function quad(s: string, p: string, o: string | TypedLiteral, g: string = 'default'): Quad {
  return { subject: s, predicate: p, object: o, graph: g }
}

describe('@harmony/quads', () => {
  describe('Storage', () => {
    it('MUST store and retrieve quads', async () => {
      const store = new MemoryQuadStore()
      const q = quad('s:1', 'p:name', { value: 'Alice' }, 'g:1')
      await store.add(q)
      const results = await store.match({ subject: 's:1' })
      expect(results).toHaveLength(1)
      expect(results[0]).toEqual(q)
    })

    it('MUST deduplicate identical quads', async () => {
      const store = new MemoryQuadStore()
      const q = quad('s:1', 'p:name', 'o:1', 'g:1')
      await store.add(q)
      await store.add(q)
      expect(await store.count()).toBe(1)
    })

    it('MUST remove specific quads', async () => {
      const store = new MemoryQuadStore()
      const q = quad('s:1', 'p:name', 'o:1', 'g:1')
      await store.add(q)
      await store.remove(q)
      expect(await store.count()).toBe(0)
    })

    it('MUST remove all quads in a graph', async () => {
      const store = new MemoryQuadStore()
      await store.add(quad('s:1', 'p:1', 'o:1', 'g:1'))
      await store.add(quad('s:2', 'p:2', 'o:2', 'g:1'))
      await store.add(quad('s:3', 'p:3', 'o:3', 'g:2'))
      await store.removeGraph('g:1')
      expect(await store.count()).toBe(1)
    })
  })

  describe('Querying', () => {
    it('MUST match by subject', async () => {
      const store = new MemoryQuadStore()
      await store.add(quad('s:1', 'p:1', 'o:1'))
      await store.add(quad('s:2', 'p:1', 'o:2'))
      expect(await store.match({ subject: 's:1' })).toHaveLength(1)
    })

    it('MUST match by predicate', async () => {
      const store = new MemoryQuadStore()
      await store.add(quad('s:1', 'p:name', 'o:1'))
      await store.add(quad('s:1', 'p:age', 'o:2'))
      expect(await store.match({ predicate: 'p:name' })).toHaveLength(1)
    })

    it('MUST match by object (string and typed literal)', async () => {
      const store = new MemoryQuadStore()
      await store.add(quad('s:1', 'p:1', 'o:target'))
      await store.add(quad('s:2', 'p:1', { value: '42', datatype: 'xsd:integer' }))
      expect(await store.match({ object: 'o:target' })).toHaveLength(1)
      expect(await store.match({ object: { value: '42', datatype: 'xsd:integer' } })).toHaveLength(1)
    })

    it('MUST match by graph', async () => {
      const store = new MemoryQuadStore()
      await store.add(quad('s:1', 'p:1', 'o:1', 'g:1'))
      await store.add(quad('s:2', 'p:2', 'o:2', 'g:2'))
      expect(await store.match({ graph: 'g:1' })).toHaveLength(1)
    })

    it('MUST match by multiple fields', async () => {
      const store = new MemoryQuadStore()
      await store.add(quad('s:1', 'p:1', 'o:1'))
      await store.add(quad('s:1', 'p:2', 'o:2'))
      expect(await store.match({ subject: 's:1', predicate: 'p:1' })).toHaveLength(1)
    })

    it('MUST return empty array for no matches', async () => {
      const store = new MemoryQuadStore()
      expect(await store.match({ subject: 'nonexistent' })).toEqual([])
    })

    it('MUST count correctly', async () => {
      const store = new MemoryQuadStore()
      await store.add(quad('s:1', 'p:1', 'o:1'))
      await store.add(quad('s:2', 'p:2', 'o:2'))
      expect(await store.count()).toBe(2)
      expect(await store.count({ subject: 's:1' })).toBe(1)
    })
  })

  describe('Serialisation', () => {
    it('MUST export valid N-Quads', async () => {
      const store = new MemoryQuadStore()
      await store.add(quad('http://ex.org/s', 'http://ex.org/p', 'http://ex.org/o', 'http://ex.org/g'))
      const nq = await store.exportNQuads()
      expect(nq).toContain('<http://ex.org/s>')
      expect(nq).toContain('<http://ex.org/p>')
      expect(nq).toContain('<http://ex.org/o>')
      expect(nq).toContain('<http://ex.org/g>')
      expect(nq).toContain(' .')
    })

    it('MUST import valid N-Quads', async () => {
      const store = new MemoryQuadStore()
      await store.importNQuads('<http://ex.org/s> <http://ex.org/p> <http://ex.org/o> <http://ex.org/g> .')
      expect(await store.count()).toBe(1)
      const results = await store.match({ subject: 'http://ex.org/s' })
      expect(results).toHaveLength(1)
    })

    it('MUST round-trip without data loss', async () => {
      const store1 = new MemoryQuadStore()
      await store1.add(quad('http://ex.org/s', 'http://ex.org/p', { value: 'hello' }, 'http://ex.org/g'))
      await store1.add(
        quad(
          'http://ex.org/s',
          'http://ex.org/p2',
          { value: '42', datatype: 'http://www.w3.org/2001/XMLSchema#integer' },
          'http://ex.org/g'
        )
      )
      const nq = await store1.exportNQuads()
      const store2 = new MemoryQuadStore()
      await store2.importNQuads(nq)
      expect(await store2.count()).toBe(2)
    })

    it('MUST handle unicode and escaped characters', async () => {
      const store = new MemoryQuadStore()
      await store.add(quad('http://ex.org/s', 'http://ex.org/p', { value: 'hello\nworld "quoted"' }, 'http://ex.org/g'))
      const nq = await store.exportNQuads()
      expect(nq).toContain('\\n')
      expect(nq).toContain('\\"')
      const store2 = new MemoryQuadStore()
      await store2.importNQuads(nq)
      const results = await store2.match({})
      expect(results).toHaveLength(1)
      const obj = results[0].object as { value: string }
      expect(obj.value).toBe('hello\nworld "quoted"')
    })
  })

  describe('Graph Operations', () => {
    it('MUST list all graphs', async () => {
      const store = new MemoryQuadStore()
      await store.add(quad('s:1', 'p:1', 'o:1', 'g:1'))
      await store.add(quad('s:2', 'p:2', 'o:2', 'g:2'))
      const graphs = await store.graphs()
      expect(graphs).toContain('g:1')
      expect(graphs).toContain('g:2')
    })

    it('MUST export single graph', async () => {
      const store = new MemoryQuadStore()
      await store.add(quad('s:1', 'p:1', 'o:1', 'g:1'))
      await store.add(quad('s:2', 'p:2', 'o:2', 'g:2'))
      const exported = await store.export('g:1')
      expect(exported).toHaveLength(1)
    })
  })

  describe('Subscriptions', () => {
    it('MUST notify on add', async () => {
      const store = new MemoryQuadStore()
      const events: unknown[] = []
      store.subscribe({}, (e) => events.push(e))
      await store.add(quad('s:1', 'p:1', 'o:1'))
      expect(events).toHaveLength(1)
      expect((events[0] as { type: string }).type).toBe('add')
    })

    it('MUST notify on remove', async () => {
      const store = new MemoryQuadStore()
      const q = quad('s:1', 'p:1', 'o:1')
      await store.add(q)
      const events: unknown[] = []
      store.subscribe({}, (e) => events.push(e))
      await store.remove(q)
      expect(events).toHaveLength(1)
      expect((events[0] as { type: string }).type).toBe('remove')
    })

    it('MUST filter notifications by pattern', async () => {
      const store = new MemoryQuadStore()
      const events: unknown[] = []
      store.subscribe({ subject: 's:1' }, (e) => events.push(e))
      await store.add(quad('s:1', 'p:1', 'o:1'))
      await store.add(quad('s:2', 'p:2', 'o:2'))
      expect(events).toHaveLength(1)
    })

    it('MUST stop notifying after unsubscribe', async () => {
      const store = new MemoryQuadStore()
      const events: unknown[] = []
      const unsub = store.subscribe({}, (e) => events.push(e))
      await store.add(quad('s:1', 'p:1', 'o:1'))
      unsub()
      await store.add(quad('s:2', 'p:2', 'o:2'))
      expect(events).toHaveLength(1)
    })
  })
})
