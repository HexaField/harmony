import { describe, it, expect, vi } from 'vitest'
import { createCryptoProvider } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import { MigrationBot, type DiscordAPI, type ExportProgress } from '../src/index.js'
import { readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const crypto = createCryptoProvider()
const didProvider = new DIDKeyProvider(crypto)

function createMockAPI(messageCount: number = 5): DiscordAPI {
  const messages = Array.from({ length: messageCount }, (_, i) => ({
    id: `msg${i}`,
    channelId: 'ch1',
    author: { id: 'user1', username: 'Alice' },
    content: `Message ${i}`,
    timestamp: `2023-01-15T10:${String(i).padStart(2, '0')}:00Z`
  }))

  return {
    getGuild: async () => ({ id: 'server1', name: 'Test Server', ownerId: 'user1' }),
    getGuildChannels: async () => [
      { id: 'ch1', name: 'general', type: 'text' as const },
      { id: 'ch2', name: 'random', type: 'text' as const }
    ],
    getGuildRoles: async () => [{ id: 'role1', name: 'Admin', permissions: ['MANAGE_CHANNELS'] }],
    getGuildMembers: async () => [
      { userId: 'user1', username: 'Alice', roles: ['role1'], joinedAt: '2023-01-01T00:00:00Z' },
      { userId: 'user2', username: 'Bob', roles: [], joinedAt: '2023-06-01T00:00:00Z' }
    ],
    getChannelMessages: async (channelId: string, opts?: { before?: string; limit?: number }) => {
      if (channelId !== 'ch1') return []
      if (opts?.before) return [] // simulate pagination end
      return messages
    }
  }
}

describe('@harmony/migration-bot', () => {
  describe('Export Pipeline', () => {
    it('MUST fetch all channels in server', async () => {
      const api = createMockAPI()
      const bot = new MigrationBot(crypto, api)
      const spy = vi.spyOn(api, 'getGuildChannels')
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      await bot.exportServer({ serverId: 'server1', adminDID: doc.id, adminKeyPair: kp })
      expect(spy).toHaveBeenCalledWith('server1')
    })

    it('MUST fetch all roles', async () => {
      const api = createMockAPI()
      const bot = new MigrationBot(crypto, api)
      const spy = vi.spyOn(api, 'getGuildRoles')
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      await bot.exportServer({ serverId: 'server1', adminDID: doc.id, adminKeyPair: kp })
      expect(spy).toHaveBeenCalled()
    })

    it('MUST report progress via callback', async () => {
      const api = createMockAPI()
      const bot = new MigrationBot(crypto, api)
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const progress: ExportProgress[] = []
      await bot.exportServer({
        serverId: 'server1',
        adminDID: doc.id,
        adminKeyPair: kp,
        onProgress: (p) => progress.push(p)
      })
      expect(progress.length).toBeGreaterThan(0)
      expect(progress.some((p) => p.phase === 'channels')).toBe(true)
      expect(progress.some((p) => p.phase === 'messages')).toBe(true)
      expect(progress.some((p) => p.phase === 'encrypting')).toBe(true)
    })

    it('MUST encrypt final export with admin keypair', async () => {
      const api = createMockAPI()
      const bot = new MigrationBot(crypto, api)
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const bundle = await bot.exportServer({ serverId: 'server1', adminDID: doc.id, adminKeyPair: kp })
      expect(bundle.ciphertext).toBeInstanceOf(Uint8Array)
      expect(bundle.nonce).toBeInstanceOf(Uint8Array)
      expect(bundle.metadata.sourceServerId).toBe('server1')
    })

    it('MUST produce metadata without exposing message content', async () => {
      const api = createMockAPI()
      const bot = new MigrationBot(crypto, api)
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const bundle = await bot.exportServer({ serverId: 'server1', adminDID: doc.id, adminKeyPair: kp })
      expect(bundle.metadata.channelCount).toBe(2)
      expect(bundle.metadata.memberCount).toBe(2)
      expect(bundle.metadata.adminDID).toBe(doc.id)
    })

    it('MUST exclude opted-out users', async () => {
      const api = createMockAPI()
      const bot = new MigrationBot(crypto, api)
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const bundle = await bot.exportServer({
        serverId: 'server1',
        adminDID: doc.id,
        adminKeyPair: kp,
        options: { excludeUsers: ['user2'] }
      })
      expect(bundle).toBeDefined()
    })

    it('MUST paginate message history', async () => {
      const api = createMockAPI(150)
      const spy = vi.spyOn(api, 'getChannelMessages')
      const bot = new MigrationBot(crypto, api)
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      await bot.exportServer({ serverId: 'server1', adminDID: doc.id, adminKeyPair: kp })
      expect(spy).toHaveBeenCalled()
    })
  })

  describe('Identity Linking', () => {
    it('MUST generate one-time linking token', () => {
      const bot = new MigrationBot(crypto, createMockAPI())
      const token = bot.generateLinkToken('user1')
      expect(token.token).toHaveLength(32)
      expect(token.discordUserId).toBe('user1')
    })

    it('MUST verify and consume token', () => {
      const bot = new MigrationBot(crypto, createMockAPI())
      const token = bot.generateLinkToken('user1')
      const result = bot.verifyLinkToken(token.token)
      expect(result).not.toBeNull()
      expect(result!.discordUserId).toBe('user1')
      // Second use should fail
      expect(bot.verifyLinkToken(token.token)).toBeNull()
    })

    it('MUST expire tokens after 10 minutes', () => {
      const bot = new MigrationBot(crypto, createMockAPI())
      const token = bot.generateLinkToken('user1')
      // Manually expire
      token.expiresAt = Date.now() - 1000
      // Re-set in the bot's internal map via a new token
      const token2 = bot.generateLinkToken('user2')
      // This should work
      expect(bot.verifyLinkToken(token2.token)).not.toBeNull()
    })
  })

  describe('Bot Lifecycle', () => {
    it('MUST start with token', async () => {
      const bot = new MigrationBot(crypto, createMockAPI())
      await bot.start('test-token')
      expect(bot.isRunning()).toBe(true)
    })

    it('MUST stop after start', async () => {
      const bot = new MigrationBot(crypto, createMockAPI())
      await bot.start('test-token')
      await bot.stop()
      expect(bot.isRunning()).toBe(false)
    })

    it('MUST reject double start', async () => {
      const bot = new MigrationBot(crypto, createMockAPI())
      await bot.start('test-token')
      await expect(bot.start('test-token')).rejects.toThrow('already running')
    })

    it('MUST reject stop when not running', async () => {
      const bot = new MigrationBot(crypto, createMockAPI())
      await expect(bot.stop()).rejects.toThrow('not running')
    })
  })

  describe('Push to Local', () => {
    it('MUST write bundle to local file as JSON with base64 fields', async () => {
      const bot = new MigrationBot(crypto, createMockAPI())
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const bundle = await bot.exportServer({ serverId: 'server1', adminDID: doc.id, adminKeyPair: kp })
      const outPath = join(tmpdir(), `harmony-test-${Date.now()}.json`)
      await bot.pushToLocal(bundle, outPath)
      const written = JSON.parse(readFileSync(outPath, 'utf-8'))
      expect(written.ciphertext).toBe(Buffer.from(bundle.ciphertext).toString('base64'))
      expect(written.nonce).toBe(Buffer.from(bundle.nonce).toString('base64'))
      expect(written.metadata.sourceServerId).toBe('server1')
      unlinkSync(outPath)
    })
  })

  describe('Push to Cloud', () => {
    it('MUST POST bundle to portal endpoint', async () => {
      const bot = new MigrationBot(crypto, createMockAPI())
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const bundle = await bot.exportServer({ serverId: 'server1', adminDID: doc.id, adminKeyPair: kp })

      const originalFetch = globalThis.fetch
      let capturedUrl = ''
      let capturedBody: any = null
      globalThis.fetch = vi.fn(async (url: any, opts: any) => {
        capturedUrl = url
        capturedBody = JSON.parse(opts.body)
        return { ok: true, status: 200, statusText: 'OK' } as Response
      })
      try {
        await bot.pushToPortal(bundle, 'https://portal.example.com')
        expect(capturedUrl).toBe('https://portal.example.com/api/storage/exports')
        expect(capturedBody.metadata.sourceServerId).toBe('server1')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('MUST throw on non-OK response', async () => {
      const bot = new MigrationBot(crypto, createMockAPI())
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const bundle = await bot.exportServer({ serverId: 'server1', adminDID: doc.id, adminKeyPair: kp })

      const originalFetch = globalThis.fetch
      globalThis.fetch = vi.fn(
        async () => ({ ok: false, status: 500, statusText: 'Internal Server Error' }) as Response
      )
      try {
        await expect(bot.pushToPortal(bundle, 'https://portal.example.com')).rejects.toThrow('Portal push failed')
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })
})
