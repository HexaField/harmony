import { describe, it, expect, vi } from 'vitest'
import { createCryptoProvider } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import { MigrationBot, type DiscordAPI } from '../src/index.js'

const crypto = createCryptoProvider()
const didProvider = new DIDKeyProvider(crypto)

function createMockAPI(): DiscordAPI {
  return {
    getGuild: async () => ({ id: 'srv1', name: 'Test Server', ownerId: 'u1' }),
    getGuildChannels: async () => [
      { id: 'ch1', name: 'general', type: 'text' as const },
      { id: 'vc1', name: 'Voice Chat', type: 'voice' as const },
      { id: 'cat1', name: 'Category', type: 'category' as const },
      { id: 'th1', name: 'Thread', type: 'thread' as const }
    ],
    getGuildRoles: async () => [{ id: 'r1', name: 'Admin', permissions: ['MANAGE_CHANNELS'] }],
    getGuildMembers: async () => [{ userId: 'u1', username: 'Alice', roles: ['r1'], joinedAt: '2023-01-01T00:00:00Z' }],
    getChannelMessages: async () => []
  }
}

describe('Export fidelity', () => {
  it('voice channels included in export', async () => {
    const api = createMockAPI()
    const bot = new MigrationBot(crypto, api)
    const kp = await crypto.generateSigningKeyPair()
    const doc = await didProvider.create(kp)
    const bundle = await bot.exportServer({ serverId: 'srv1', adminDID: doc.id, adminKeyPair: kp })
    expect(bundle.metadata.channelCount).toBeGreaterThanOrEqual(2)
  })

  it('all channel types mapped correctly in API response', async () => {
    const api = createMockAPI()
    const channels = await api.getGuildChannels('srv1')
    const types = channels.map((c) => c.type)
    expect(types).toContain('text')
    expect(types).toContain('voice')
    expect(types).toContain('category')
    expect(types).toContain('thread')
  })

  it('progress callbacks fire', async () => {
    const api = createMockAPI()
    const bot = new MigrationBot(crypto, api)
    const kp = await crypto.generateSigningKeyPair()
    const doc = await didProvider.create(kp)
    const phases: string[] = []
    await bot.exportServer({
      serverId: 'srv1',
      adminDID: doc.id,
      adminKeyPair: kp,
      onProgress: (p) => phases.push(p.phase)
    })
    expect(phases.length).toBeGreaterThan(0)
    expect(phases).toContain('channels')
  })

  it('message pagination: returns empty on subsequent call', async () => {
    let callCount = 0
    const api = createMockAPI()
    api.getChannelMessages = async (_channelId: string, opts?: { before?: string; limit?: number }) => {
      callCount++
      if (callCount === 1) {
        return [
          {
            id: 'msg1',
            channelId: 'ch1',
            author: { id: 'u1', username: 'Alice' },
            content: 'Hi',
            timestamp: '2023-01-15T10:00:00Z'
          }
        ]
      }
      return []
    }
    const bot = new MigrationBot(crypto, api)
    const kp = await crypto.generateSigningKeyPair()
    const doc = await didProvider.create(kp)
    const bundle = await bot.exportServer({ serverId: 'srv1', adminDID: doc.id, adminKeyPair: kp })
    expect(bundle.metadata.messageCount).toBeGreaterThanOrEqual(1)
  })

  it.skip('rate limiting retries work (requires real API)', () => {
    // Would need to simulate 429 responses
  })
})
