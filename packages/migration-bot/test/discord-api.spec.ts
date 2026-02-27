import { describe, it, expect, vi } from 'vitest'
import { config } from 'dotenv'
import { resolve } from 'node:path'
config({ path: resolve(import.meta.dirname, '..', '..', '..', '.env.test') })
import { DiscordRESTAPI } from '../src/discord-api.js'

describe('DiscordRESTAPI', () => {
  it('MUST construct with a bot token', () => {
    const api = new DiscordRESTAPI('test-token')
    expect(api).toBeDefined()
  })

  it('MUST throw on invalid token (401)', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Headers()
    })) as any
    try {
      const api = new DiscordRESTAPI('bad-token')
      await expect(api.getGuild('123')).rejects.toThrow('Invalid bot token')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('MUST throw on forbidden (403)', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      headers: new Headers()
    })) as any
    try {
      const api = new DiscordRESTAPI('token')
      await expect(api.getGuild('123')).rejects.toThrow('Forbidden')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('MUST map guild response to DiscordServer', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'X-RateLimit-Remaining': '10' }),
      json: async () => ({ id: '123', name: 'Test', owner_id: 'u1' })
    })) as any
    try {
      const api = new DiscordRESTAPI('token')
      const guild = await api.getGuild('123')
      expect(guild).toEqual({ id: '123', name: 'Test', ownerId: 'u1' })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('MUST map channel types correctly', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'X-RateLimit-Remaining': '10' }),
      json: async () => [
        { id: '1', name: 'general', type: 0, parent_id: null },
        { id: '2', name: 'voice', type: 2, parent_id: null },
        { id: '3', name: 'category', type: 4, parent_id: null },
        { id: '4', name: 'thread', type: 11, parent_id: '1' },
        { id: '5', name: 'unknown', type: 99, parent_id: null }
      ]
    })) as any
    try {
      const api = new DiscordRESTAPI('token')
      const channels = await api.getGuildChannels('123')
      expect(channels).toHaveLength(4) // unknown type filtered out
      expect(channels[0].type).toBe('text')
      expect(channels[1].type).toBe('voice')
      expect(channels[2].type).toBe('category')
      expect(channels[3].type).toBe('thread')
      expect(channels[3].categoryId).toBe('1')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('MUST handle rate limiting with backoff', async () => {
    const originalFetch = globalThis.fetch
    let callCount = 0
    globalThis.fetch = vi.fn(async () => {
      callCount++
      if (callCount === 1) {
        return {
          ok: false,
          status: 429,
          headers: new Headers({ 'X-RateLimit-Reset-After': '0.01' }),
          json: async () => ({})
        }
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'X-RateLimit-Remaining': '10' }),
        json: async () => ({ id: '123', name: 'Test', owner_id: 'u1' })
      }
    }) as any
    try {
      const api = new DiscordRESTAPI('token')
      const guild = await api.getGuild('123')
      expect(guild.id).toBe('123')
      expect(callCount).toBe(2)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('MUST paginate guild members', async () => {
    const originalFetch = globalThis.fetch
    let callCount = 0
    globalThis.fetch = vi.fn(async (url: any) => {
      callCount++
      const urlStr = String(url)
      if (urlStr.includes('after=0')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'X-RateLimit-Remaining': '10' }),
          json: async () => [
            { user: { id: 'u1', username: 'Alice' }, roles: ['r1'], joined_at: '2023-01-01T00:00:00Z' }
          ]
        }
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'X-RateLimit-Remaining': '10' }),
        json: async () => []
      }
    }) as any
    try {
      const api = new DiscordRESTAPI('token')
      const members = await api.getGuildMembers('123')
      expect(members).toHaveLength(1)
      expect(members[0].userId).toBe('u1')
      expect(members[0].username).toBe('Alice')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('MUST map message responses correctly', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'X-RateLimit-Remaining': '10' }),
      json: async () => [
        {
          id: 'm1',
          channel_id: 'ch1',
          author: { id: 'u1', username: 'Alice' },
          content: 'Hello',
          timestamp: '2023-01-15T10:00:00Z',
          message_reference: { message_id: 'm0' },
          attachments: [{ url: 'https://cdn.example.com/file.png', filename: 'file.png' }]
        }
      ]
    })) as any
    try {
      const api = new DiscordRESTAPI('token')
      const msgs = await api.getChannelMessages('ch1', { limit: 10 })
      expect(msgs).toHaveLength(1)
      expect(msgs[0].replyTo).toBe('m0')
      expect(msgs[0].attachments).toHaveLength(1)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('MUST work with real Discord token', async () => {
    const token = process.env.TEST_DISCORD_TOKEN
    const guildId = process.env.TEST_DISCORD_TARGET_ID
    if (!token || !guildId) {
      return // skip silently when credentials not available
    }
    const api = new DiscordRESTAPI(token)
    const guild = await api.getGuild(guildId)
    expect(guild.id).toBe(guildId)
    expect(guild.name).toBeTruthy()
  })

  it('MUST fetch active threads for a guild', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'X-RateLimit-Remaining': '10' }),
      json: async () => ({
        threads: [
          { id: 't1', name: 'Thread One', type: 11, parent_id: 'ch1' },
          { id: 't2', name: 'Thread Two', type: 12, parent_id: 'ch1' }
        ]
      })
    })) as any
    try {
      const api = new DiscordRESTAPI('token')
      const threads = await api.getActiveThreads('guild1')
      expect(threads).toHaveLength(2)
      expect(threads[0].type).toBe('thread')
      expect(threads[0].name).toBe('Thread One')
      expect(threads[1].categoryId).toBe('ch1')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('MUST fetch archived threads for a channel', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'X-RateLimit-Remaining': '10' }),
      json: async () => ({
        threads: [{ id: 't3', name: 'Old Thread', type: 11, parent_id: 'ch1' }]
      })
    })) as any
    try {
      const api = new DiscordRESTAPI('token')
      const threads = await api.getArchivedThreads('ch1')
      expect(threads).toHaveLength(1)
      expect(threads[0].name).toBe('Old Thread')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('MUST fetch reaction users for a message', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'X-RateLimit-Remaining': '10' }),
      json: async () => [{ id: 'u1' }, { id: 'u2' }]
    })) as any
    try {
      const api = new DiscordRESTAPI('token')
      const users = await api.getReactionUsers('ch1', 'm1', '👍')
      expect(users).toEqual(['u1', 'u2'])
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('MUST include embeds in message response', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'X-RateLimit-Remaining': '10' }),
      json: async () => [
        {
          id: 'm1',
          channel_id: 'ch1',
          author: { id: 'u1', username: 'Alice' },
          content: 'Check this out',
          timestamp: '2023-01-15T10:00:00Z',
          embeds: [
            {
              type: 'rich',
              url: 'https://example.com',
              title: 'Example',
              description: 'A description',
              thumbnail: { url: 'https://example.com/thumb.jpg' }
            }
          ]
        }
      ]
    })) as any
    try {
      const api = new DiscordRESTAPI('token')
      const msgs = await api.getChannelMessages('ch1')
      expect(msgs[0].embeds).toHaveLength(1)
      expect(msgs[0].embeds![0].title).toBe('Example')
      expect(msgs[0].embeds![0].thumbnail?.url).toBe('https://example.com/thumb.jpg')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('MUST download attachment data', async () => {
    const originalFetch = globalThis.fetch
    const testData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]) // PNG header
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ 'content-type': 'image/png' }),
      arrayBuffer: async () => testData.buffer
    })) as any
    try {
      const api = new DiscordRESTAPI('token')
      const result = await api.downloadAttachment('https://cdn.discord.com/file.png')
      expect(result.contentType).toBe('image/png')
      expect(result.data.length).toBe(4)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
