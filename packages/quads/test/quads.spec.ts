import { describe, it, expect } from 'vitest'
import { MemoryQuadStore, serializeQuad, parseNQuads, type Quad, type TypedLiteral } from '../src/index.js'

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

  describe('Edge Cases', () => {
    it('MUST handle empty store operations', async () => {
      const store = new MemoryQuadStore()
      expect(await store.count()).toBe(0)
      expect(await store.match({})).toEqual([])
      expect(await store.graphs()).toEqual([])
      expect(await store.export()).toEqual([])
      expect(await store.exportNQuads()).toBe('')
      expect(await store.has({ subject: 'nonexistent' })).toBe(false)
    })

    it('MUST not notify on duplicate add (no-op)', async () => {
      const store = new MemoryQuadStore()
      const events: unknown[] = []
      store.subscribe({}, (e) => events.push(e))
      const q = quad('s:1', 'p:1', 'o:1')
      await store.add(q)
      await store.add(q) // duplicate
      expect(events).toHaveLength(1) // only one add event
    })

    it('MUST not notify on remove of non-existent quad', async () => {
      const store = new MemoryQuadStore()
      const events: unknown[] = []
      store.subscribe({}, (e) => events.push(e))
      await store.remove(quad('s:nonexist', 'p:1', 'o:1'))
      expect(events).toHaveLength(0)
    })

    it('MUST handle addAll with empty array', async () => {
      const store = new MemoryQuadStore()
      await store.addAll([])
      expect(await store.count()).toBe(0)
    })

    it('addAll MUST deduplicate', async () => {
      const store = new MemoryQuadStore()
      const q = quad('s:1', 'p:1', 'o:1')
      await store.addAll([q, q, q])
      expect(await store.count()).toBe(1)
    })

    it('MUST match empty pattern (all quads)', async () => {
      const store = new MemoryQuadStore()
      await store.add(quad('s:1', 'p:1', 'o:1'))
      await store.add(quad('s:2', 'p:2', 'o:2'))
      expect(await store.match({})).toHaveLength(2)
    })

    it('has MUST return true for existing quad', async () => {
      const store = new MemoryQuadStore()
      await store.add(quad('s:1', 'p:1', 'o:1'))
      expect(await store.has({ subject: 's:1' })).toBe(true)
      expect(await store.has({ subject: 's:2' })).toBe(false)
    })

    it('MUST handle typed literal with language tag', async () => {
      const store = new MemoryQuadStore()
      const q = quad('s:1', 'p:1', { value: 'Hola', language: 'es' })
      await store.add(q)
      const results = await store.match({ object: { value: 'Hola', language: 'es' } })
      expect(results).toHaveLength(1)
      // Different language should not match
      expect(await store.match({ object: { value: 'Hola', language: 'fr' } })).toHaveLength(0)
    })

    it('MUST not match string object against typed literal', async () => {
      const store = new MemoryQuadStore()
      await store.add(quad('s:1', 'p:1', { value: 'hello' }))
      expect(await store.match({ object: 'hello' })).toHaveLength(0)
    })

    it('removeGraph MUST not affect other graphs', async () => {
      const store = new MemoryQuadStore()
      await store.add(quad('s:1', 'p:1', 'o:1', 'g:1'))
      await store.add(quad('s:2', 'p:2', 'o:2', 'g:2'))
      await store.removeGraph('g:1')
      expect(await store.count()).toBe(1)
      expect(await store.match({ graph: 'g:2' })).toHaveLength(1)
    })

    it('removeGraph on nonexistent graph is a no-op', async () => {
      const store = new MemoryQuadStore()
      await store.add(quad('s:1', 'p:1', 'o:1', 'g:1'))
      await store.removeGraph('g:nonexist')
      expect(await store.count()).toBe(1)
    })

    it('MUST handle blank nodes in NQuads', async () => {
      const store = new MemoryQuadStore()
      await store.importNQuads('_:b0 <http://ex.org/p> <http://ex.org/o> <http://ex.org/g> .')
      expect(await store.count()).toBe(1)
      const results = await store.match({})
      expect(results[0].subject).toBe('_:b0')
    })

    it('MUST skip comment lines in NQuads', async () => {
      const store = new MemoryQuadStore()
      await store.importNQuads(
        '# comment\n<http://ex.org/s> <http://ex.org/p> <http://ex.org/o> <http://ex.org/g> .\n# another comment'
      )
      expect(await store.count()).toBe(1)
    })

    it('MUST skip empty lines in NQuads', async () => {
      const store = new MemoryQuadStore()
      await store.importNQuads('\n\n<http://ex.org/s> <http://ex.org/p> <http://ex.org/o> <http://ex.org/g> .\n\n')
      expect(await store.count()).toBe(1)
    })

    it('MUST handle NQuads without graph (default graph)', async () => {
      const store = new MemoryQuadStore()
      await store.importNQuads('<http://ex.org/s> <http://ex.org/p> <http://ex.org/o> .')
      const results = await store.match({})
      expect(results).toHaveLength(1)
      expect(results[0].graph).toBe('default')
    })

    it('MUST serialize typed literal with language in NQuads', async () => {
      const store = new MemoryQuadStore()
      await store.add(quad('http://ex.org/s', 'http://ex.org/p', { value: 'hello', language: 'en' }, 'http://ex.org/g'))
      const nq = await store.exportNQuads()
      expect(nq).toContain('"hello"@en')
    })

    it('MUST round-trip language-tagged literals', async () => {
      const store1 = new MemoryQuadStore()
      await store1.add(quad('http://ex.org/s', 'http://ex.org/p', { value: 'hola', language: 'es' }, 'http://ex.org/g'))
      const nq = await store1.exportNQuads()
      const store2 = new MemoryQuadStore()
      await store2.importNQuads(nq)
      const results = await store2.match({})
      expect(results).toHaveLength(1)
      const obj = results[0].object as TypedLiteral
      expect(obj.value).toBe('hola')
      expect(obj.language).toBe('es')
    })

    it('serializeQuad MUST be exported and callable', () => {
      const q = quad('http://ex.org/s', 'http://ex.org/p', 'http://ex.org/o', 'http://ex.org/g')
      const s = serializeQuad(q)
      expect(s).toContain('<http://ex.org/s>')
      expect(s).toContain(' .')
    })

    it('parseNQuads MUST be exported and callable', () => {
      const quads = parseNQuads('<http://ex.org/s> <http://ex.org/p> <http://ex.org/o> <http://ex.org/g> .')
      expect(quads).toHaveLength(1)
    })

    it('parseNQuads MUST handle malformed lines gracefully', () => {
      const quads = parseNQuads('this is not valid nquads\n<http://ex.org/s> <http://ex.org/p> <http://ex.org/o> .')
      expect(quads).toHaveLength(1) // only the valid line
    })

    it('MUST handle escape sequences: tab and carriage return', async () => {
      const store = new MemoryQuadStore()
      await store.add(quad('http://ex.org/s', 'http://ex.org/p', { value: 'tab\there\r' }, 'http://ex.org/g'))
      const nq = await store.exportNQuads()
      expect(nq).toContain('\\t')
      expect(nq).toContain('\\r')
      const store2 = new MemoryQuadStore()
      await store2.importNQuads(nq)
      const results = await store2.match({})
      const obj = results[0].object as TypedLiteral
      expect(obj.value).toBe('tab\there\r')
    })

    it('MUST notify subscribers on removeGraph', async () => {
      const store = new MemoryQuadStore()
      await store.add(quad('s:1', 'p:1', 'o:1', 'g:1'))
      await store.add(quad('s:2', 'p:2', 'o:2', 'g:1'))
      const events: unknown[] = []
      store.subscribe({}, (e) => events.push(e))
      await store.removeGraph('g:1')
      expect(events).toHaveLength(2)
      expect((events[0] as { type: string }).type).toBe('remove')
    })

    it('multiple subscribers MUST all receive events', async () => {
      const store = new MemoryQuadStore()
      const events1: unknown[] = []
      const events2: unknown[] = []
      store.subscribe({}, (e) => events1.push(e))
      store.subscribe({}, (e) => events2.push(e))
      await store.add(quad('s:1', 'p:1', 'o:1'))
      expect(events1).toHaveLength(1)
      expect(events2).toHaveLength(1)
    })

    it('count with no pattern MUST count all quads', async () => {
      const store = new MemoryQuadStore()
      await store.add(quad('s:1', 'p:1', 'o:1'))
      await store.add(quad('s:2', 'p:2', 'o:2'))
      expect(await store.count()).toBe(2)
    })
  })
})
