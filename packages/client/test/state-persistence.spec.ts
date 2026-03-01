import { describe, it, expect, afterEach } from 'vitest'
import { HarmonyClient, LocalStoragePersistence } from '../src/index.js'
import type { PersistenceAdapter, PersistedState } from '../src/persistence.js'

class MemoryPersistence implements PersistenceAdapter {
  state: PersistedState = { servers: [] }
  async load() {
    return this.state
  }
  async save(state: PersistedState) {
    this.state = structuredClone(state)
  }
}

describe('comprehensive state persistence', () => {
  let client: HarmonyClient | null = null

  afterEach(async () => {
    if (client) {
      client.stopPeriodicPersist()
      client = null
    }
  })

  it('persistFullState saves community server map', async () => {
    const adapter = new MemoryPersistence()
    client = new HarmonyClient({ persistenceAdapter: adapter })
    // Use addServer + internal state to verify persistence
    client.addServer('ws://localhost:9000')
    client.persistFullState()
    expect(adapter.state.servers).toHaveLength(1)
    expect(adapter.state.servers[0].url).toBe('ws://localhost:9000')
  })

  it('setActiveCommunity and setActiveChannel persist', async () => {
    const adapter = new MemoryPersistence()
    client = new HarmonyClient({ persistenceAdapter: adapter })
    client.setActiveCommunity('community-123')
    expect(adapter.state.lastActiveCommunityId).toBe('community-123')
    client.setActiveChannel('channel-456')
    expect(adapter.state.lastActiveChannelId).toBe('channel-456')
  })

  it('restoreFullState recovers last active IDs', async () => {
    const adapter = new MemoryPersistence()
    adapter.state = {
      servers: [],
      lastActiveCommunityId: 'c1',
      lastActiveChannelId: 'ch1'
    }
    client = new HarmonyClient({ persistenceAdapter: adapter })
    await client.restoreFullState()
    expect(client.lastActiveCommunityId).toBe('c1')
    expect(client.lastActiveChannelId).toBe('ch1')
  })

  it('restoreFullState recovers session tokens', async () => {
    const adapter = new MemoryPersistence()
    adapter.state = {
      servers: [],
      sessionTokens: { 'ws://localhost:9000': 'token-abc' }
    }
    client = new HarmonyClient({ persistenceAdapter: adapter })
    await client.restoreFullState()
    expect(client.sessionTokens.get('ws://localhost:9000')).toBe('token-abc')
  })

  it('session tokens round-trip through persist/restore', async () => {
    const adapter = new MemoryPersistence()
    client = new HarmonyClient({ persistenceAdapter: adapter })
    client.sessionTokens.set('ws://example.com', 'my-token')
    client.persistFullState()
    expect(adapter.state.sessionTokens).toEqual({ 'ws://example.com': 'my-token' })

    // Create new client, restore
    const client2 = new HarmonyClient({ persistenceAdapter: adapter })
    await client2.restoreFullState()
    expect(client2.sessionTokens.get('ws://example.com')).toBe('my-token')
    client2.stopPeriodicPersist()
  })
})
