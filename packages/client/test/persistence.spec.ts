import { describe, it, expect } from 'vitest'
import { MemoryKVPersistence, KVBackedPersistence } from '../src/persistence.js'

describe('MemoryKVPersistence', () => {
  it('returns null for missing keys', async () => {
    const kv = new MemoryKVPersistence()
    expect(await kv.get('nope')).toBeNull()
  })

  it('sets and gets values', async () => {
    const kv = new MemoryKVPersistence()
    await kv.set('a', '1')
    expect(await kv.get('a')).toBe('1')
  })

  it('removes keys', async () => {
    const kv = new MemoryKVPersistence()
    await kv.set('a', '1')
    await kv.remove('a')
    expect(await kv.get('a')).toBeNull()
  })

  it('lists keys', async () => {
    const kv = new MemoryKVPersistence()
    await kv.set('x', '1')
    await kv.set('y', '2')
    expect(await kv.keys()).toEqual(['x', 'y'])
  })
})

describe('KVBackedPersistence', () => {
  it('returns empty state when nothing stored', async () => {
    const kv = new MemoryKVPersistence()
    const p = new KVBackedPersistence(kv)
    const state = await p.load()
    expect(state).toEqual({ servers: [] })
  })

  it('round-trips state through save/load', async () => {
    const kv = new MemoryKVPersistence()
    const p = new KVBackedPersistence(kv)
    const state = {
      servers: [{ url: 'ws://localhost:3000', communityIds: ['abc'] }],
      did: 'did:test:123'
    }
    await p.save(state)
    expect(await p.load()).toEqual(state)
  })

  it('uses custom state key', async () => {
    const kv = new MemoryKVPersistence()
    const p = new KVBackedPersistence(kv, 'custom-key')
    await p.save({ servers: [] })
    expect(await kv.get('custom-key')).toBeTruthy()
    expect(await kv.get('harmony:client:state')).toBeNull()
  })
})
