/**
 * Discord Mock E2E Tests
 *
 * Spins up a local mock Discord API server with real data shapes (fake entries),
 * then tests OAuth flows, bot API calls, migration export, and edge cases
 * against the actual Harmony codebase — no real Discord token needed.
 */
import { test, expect } from '@playwright/test'
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http'
import { createCryptoProvider } from '../packages/crypto/src/index.js'
import { DIDKeyProvider } from '../packages/did/src/index.js'
import { DiscordRESTAPI } from '../packages/migration-bot/src/discord-api.js'
import { MigrationBot, type ExportProgress } from '../packages/migration-bot/src/index.js'
import { PortalService } from '../packages/portal/src/index.js'
import { oauthRoutes, _pendingStates } from '../packages/portal/src/routes/oauth.js'
import { DiscordLinkService } from '../packages/cloud/src/discord-link.js'
import express from 'express'

// ─── Fake Discord Data (real shapes from discord.com/developers/docs/resources) ─

const FAKE_GUILD = {
  id: '1098765432101234567',
  name: 'Vaporwave Aesthetics',
  icon: 'a_1234567890abcdef',
  owner_id: '223344556677889900',
  verification_level: 2,
  default_message_notifications: 1,
  roles: [] as any[],
  emojis: [],
  features: ['COMMUNITY', 'NEWS'],
  member_count: 47,
  premium_tier: 2,
  premium_subscription_count: 8,
  preferred_locale: 'en-US',
  nsfw_level: 0
}

const FAKE_CHANNELS = [
  { id: '1100000000000000001', name: 'General', type: 4, position: 0, parent_id: null, permission_overwrites: [] },
  {
    id: '1100000000000000002',
    name: 'welcome',
    type: 0,
    position: 0,
    parent_id: '1100000000000000001',
    topic: 'Say hello!',
    nsfw: false,
    rate_limit_per_user: 0,
    permission_overwrites: []
  },
  {
    id: '1100000000000000003',
    name: 'general',
    type: 0,
    position: 1,
    parent_id: '1100000000000000001',
    topic: 'Main chat',
    nsfw: false,
    rate_limit_per_user: 0,
    permission_overwrites: []
  },
  {
    id: '1100000000000000004',
    name: 'memes',
    type: 0,
    position: 2,
    parent_id: '1100000000000000001',
    topic: null,
    nsfw: false,
    permission_overwrites: []
  },
  {
    id: '1100000000000000005',
    name: 'Voice Lounge',
    type: 2,
    position: 3,
    parent_id: '1100000000000000001',
    bitrate: 64000,
    user_limit: 0,
    permission_overwrites: []
  },
  {
    id: '1100000000000000006',
    name: 'mod-log',
    type: 0,
    position: 4,
    parent_id: null,
    topic: 'Moderation logs',
    permission_overwrites: [{ id: FAKE_GUILD.id, type: 0, deny: '1024', allow: '0' }]
  },
  {
    id: '1100000000000000007',
    name: 'announcements',
    type: 0,
    position: 5,
    parent_id: '1100000000000000001',
    topic: 'Server updates',
    permission_overwrites: []
  }
]

const FAKE_ROLES = [
  { id: FAKE_GUILD.id, name: '@everyone', permissions: '104324673', position: 0, color: 0, mentionable: false },
  {
    id: '1100000000000000101',
    name: 'Admin',
    permissions: '8',
    position: 3,
    color: 15158332,
    mentionable: false,
    hoist: true
  },
  {
    id: '1100000000000000102',
    name: 'Moderator',
    permissions: '1099511627776',
    position: 2,
    color: 3447003,
    mentionable: true,
    hoist: true
  },
  {
    id: '1100000000000000103',
    name: 'Member',
    permissions: '104324673',
    position: 1,
    color: 0,
    mentionable: false,
    hoist: false
  },
  {
    id: '1100000000000000104',
    name: 'VIP',
    permissions: '104324673',
    position: 1,
    color: 15844367,
    mentionable: true,
    hoist: true
  }
]

const FAKE_MEMBERS = [
  {
    user: {
      id: '223344556677889900',
      username: 'neon_admin',
      discriminator: '0',
      avatar: 'abc123',
      global_name: 'Neon Admin'
    },
    roles: ['1100000000000000101'],
    joined_at: '2023-06-15T10:30:00.000Z',
    premium_since: '2023-07-01T00:00:00.000Z',
    deaf: false,
    mute: false
  },
  {
    user: {
      id: '334455667788990011',
      username: 'synthwave_sarah',
      discriminator: '0',
      avatar: null,
      global_name: 'Sarah'
    },
    roles: ['1100000000000000102', '1100000000000000103'],
    joined_at: '2023-07-20T14:00:00.000Z',
    deaf: false,
    mute: false
  },
  {
    user: {
      id: '445566778899001122',
      username: 'retro_mike',
      discriminator: '0',
      avatar: 'def456',
      global_name: 'Mike'
    },
    roles: ['1100000000000000103'],
    joined_at: '2023-08-01T09:15:00.000Z',
    deaf: false,
    mute: false
  },
  {
    user: {
      id: '556677889900112233',
      username: 'pixel_queen',
      discriminator: '0',
      avatar: 'ghi789',
      global_name: 'Pixel Queen'
    },
    roles: ['1100000000000000103', '1100000000000000104'],
    joined_at: '2023-09-10T18:45:00.000Z',
    deaf: false,
    mute: false
  },
  {
    user: { id: '667788990011223344', username: 'cyber_ghost', discriminator: '0', avatar: null, global_name: null },
    roles: ['1100000000000000103'],
    joined_at: '2024-01-05T22:00:00.000Z',
    deaf: false,
    mute: false
  }
]

function fakeMessages(channelId: string) {
  return [
    {
      id: '2200000000000000001',
      channel_id: channelId,
      author: { id: '223344556677889900', username: 'neon_admin' },
      content: 'Welcome to Vaporwave Aesthetics! 🌴',
      timestamp: '2023-06-15T10:35:00.000Z',
      edited_timestamp: null,
      tts: false,
      mention_everyone: false,
      mentions: [],
      mention_roles: [],
      attachments: [],
      embeds: [],
      pinned: true,
      type: 0
    },
    {
      id: '2200000000000000002',
      channel_id: channelId,
      author: { id: '334455667788990011', username: 'synthwave_sarah' },
      content: 'Hey everyone! Love the vibes here 💜',
      timestamp: '2023-07-20T14:05:00.000Z',
      edited_timestamp: null,
      tts: false,
      mention_everyone: false,
      mentions: [],
      mention_roles: [],
      attachments: [],
      embeds: [],
      reactions: [
        { emoji: { id: null, name: '💜' }, count: 3 },
        { emoji: { id: null, name: '🔥' }, count: 1 }
      ],
      pinned: false,
      type: 0
    },
    {
      id: '2200000000000000003',
      channel_id: channelId,
      author: { id: '445566778899001122', username: 'retro_mike' },
      content: 'Check out this sunset photo from last night',
      timestamp: '2023-08-02T20:30:00.000Z',
      edited_timestamp: null,
      tts: false,
      mention_everyone: false,
      mentions: [],
      mention_roles: [],
      attachments: [
        {
          id: 'att_001',
          filename: 'sunset_vaporwave.jpg',
          size: 2048576,
          url: 'https://cdn.discordapp.com/attachments/1100000000000000003/att_001/sunset_vaporwave.jpg',
          proxy_url: 'https://media.discordapp.net/attachments/1100000000000000003/att_001/sunset_vaporwave.jpg',
          width: 1920,
          height: 1080,
          content_type: 'image/jpeg'
        }
      ],
      embeds: [],
      pinned: false,
      type: 0
    },
    {
      id: '2200000000000000004',
      channel_id: channelId,
      author: { id: '556677889900112233', username: 'pixel_queen' },
      content: '',
      timestamp: '2023-09-11T12:00:00.000Z',
      edited_timestamp: null,
      tts: false,
      mention_everyone: false,
      mentions: [],
      mention_roles: [],
      attachments: [],
      embeds: [
        {
          type: 'rich',
          url: 'https://open.spotify.com/track/abc123',
          title: 'MACINTOSH PLUS - リサフランク420 / 現代のコンピュー',
          description: 'The quintessential vaporwave track',
          color: 1947988,
          thumbnail: { url: 'https://i.scdn.co/image/ab67616d0000b273abc123', proxy_url: '', width: 300, height: 300 },
          provider: { name: 'Spotify' }
        }
      ],
      sticker_items: [],
      pinned: false,
      type: 0
    },
    {
      id: '2200000000000000005',
      channel_id: channelId,
      author: { id: '334455667788990011', username: 'synthwave_sarah' },
      content: 'Replying to the welcome message!',
      timestamp: '2023-09-15T08:00:00.000Z',
      edited_timestamp: '2023-09-15T08:05:00.000Z',
      tts: false,
      mention_everyone: false,
      mentions: [{ id: '223344556677889900', username: 'neon_admin' }],
      mention_roles: [],
      message_reference: { message_id: '2200000000000000001', channel_id: channelId, guild_id: FAKE_GUILD.id },
      attachments: [],
      embeds: [],
      pinned: false,
      type: 19
    },
    {
      id: '2200000000000000006',
      channel_id: channelId,
      author: { id: '667788990011223344', username: 'cyber_ghost' },
      content: 'Just joined, what did I miss?',
      timestamp: '2024-01-05T22:05:00.000Z',
      edited_timestamp: null,
      tts: false,
      mention_everyone: false,
      mentions: [],
      mention_roles: [],
      attachments: [],
      embeds: [],
      sticker_items: [{ id: '3300000000000000001', name: 'wave', format_type: 1 }],
      pinned: false,
      type: 0
    }
  ]
}

const FAKE_THREADS = {
  threads: [
    { id: '3300000000000000101', name: 'sunset-discussion', type: 11, parent_id: '1100000000000000003' },
    { id: '3300000000000000102', name: 'music-recs', type: 12, parent_id: '1100000000000000003' }
  ],
  members: [],
  has_more: false
}

const FAKE_ARCHIVED_THREADS = {
  threads: [{ id: '3300000000000000201', name: 'old-events', type: 11, parent_id: '1100000000000000003' }],
  members: [],
  has_more: false
}

const FAKE_REACTION_USERS = [{ id: '223344556677889900' }, { id: '445566778899001122' }, { id: '556677889900112233' }]

const FAKE_OAUTH_TOKEN = {
  access_token: 'mock_access_token_abc123def456',
  token_type: 'Bearer',
  expires_in: 604800,
  refresh_token: 'mock_refresh_token_xyz789',
  scope: 'identify'
}

const FAKE_OAUTH_USER = {
  id: '334455667788990011',
  username: 'synthwave_sarah',
  discriminator: '0',
  avatar: 'a_mock_avatar_hash',
  global_name: 'Sarah',
  email: null,
  verified: true,
  flags: 0,
  premium_type: 2,
  public_flags: 256
}

// ─── Mock Discord HTTP Server ─────────────────────────────────────────────────

let mockDiscord: Server
let mockPort: number
let requestLog: Array<{ method: string; path: string; headers: Record<string, string> }>
let rateLimitRemaining = 10
let forcedRateLimitPath: string | null = null
let force401 = false
let force403Path: string | null = null

function resetMockState() {
  requestLog = []
  rateLimitRemaining = 10
  forcedRateLimitPath = null
  force401 = false
  force403Path = null
}

function parseBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk: Buffer) => (body += chunk.toString()))
    req.on('end', () => resolve(body))
  })
}

function startMockDiscord(): Promise<number> {
  return new Promise((resolve) => {
    mockDiscord = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url!, `http://localhost`)
      const path = url.pathname
      const method = req.method || 'GET'
      const headers: Record<string, string> = {}
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === 'string') headers[k] = v
      }

      requestLog.push({ method, path, headers })

      if (force401) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ message: '401: Unauthorized', code: 0 }))
        return
      }

      if (force403Path && path.includes(force403Path)) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ message: 'Missing Access', code: 50001 }))
        return
      }

      // Rate limiting
      if (forcedRateLimitPath && path.includes(forcedRateLimitPath)) {
        forcedRateLimitPath = null // Only rate-limit once
        res.writeHead(429, {
          'Content-Type': 'application/json',
          'X-RateLimit-Reset-After': '0.05',
          'Retry-After': '0.05'
        })
        res.end(JSON.stringify({ message: 'You are being rate limited.', retry_after: 0.05, global: false }))
        return
      }

      const rlHeaders = {
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': '30',
        'X-RateLimit-Remaining': String(Math.max(0, --rateLimitRemaining)),
        'X-RateLimit-Reset-After': '1.0',
        'X-RateLimit-Bucket': 'mock-bucket-abc'
      }

      // ── OAuth Routes ──
      if (path === '/api/oauth2/token' && method === 'POST') {
        const body = await parseBody(req)
        const params = new URLSearchParams(body)
        const code = params.get('code')
        if (code === 'invalid_code') {
          res.writeHead(400, rlHeaders)
          res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid "code" in request.' }))
          return
        }
        res.writeHead(200, rlHeaders)
        res.end(JSON.stringify(FAKE_OAUTH_TOKEN))
        return
      }

      if (path === '/api/v10/users/@me' && method === 'GET') {
        if (!headers.authorization?.startsWith('Bearer ')) {
          res.writeHead(401, rlHeaders)
          res.end(JSON.stringify({ message: '401: Unauthorized' }))
          return
        }
        res.writeHead(200, rlHeaders)
        res.end(JSON.stringify(FAKE_OAUTH_USER))
        return
      }

      // ── Bot API Routes ──
      const guildMatch = path.match(/^\/api\/v10\/guilds\/(\d+)$/)
      if (guildMatch && method === 'GET') {
        if (guildMatch[1] !== FAKE_GUILD.id) {
          res.writeHead(404, rlHeaders)
          res.end(JSON.stringify({ message: 'Unknown Guild', code: 10004 }))
          return
        }
        res.writeHead(200, rlHeaders)
        res.end(JSON.stringify(FAKE_GUILD))
        return
      }

      const channelsMatch = path.match(/^\/api\/v10\/guilds\/(\d+)\/channels$/)
      if (channelsMatch && method === 'GET') {
        if (channelsMatch[1] !== FAKE_GUILD.id) {
          res.writeHead(404, rlHeaders)
          res.end(JSON.stringify({ message: 'Unknown Guild', code: 10004 }))
          return
        }
        res.writeHead(200, rlHeaders)
        res.end(JSON.stringify(FAKE_CHANNELS))
        return
      }

      const rolesMatch = path.match(/^\/api\/v10\/guilds\/(\d+)\/roles$/)
      if (rolesMatch && method === 'GET') {
        res.writeHead(200, rlHeaders)
        res.end(JSON.stringify(FAKE_ROLES))
        return
      }

      const membersMatch = path.match(/^\/api\/v10\/guilds\/(\d+)\/members$/)
      if (membersMatch && method === 'GET') {
        const after = url.searchParams.get('after') || '0'
        const members = after === '0' ? FAKE_MEMBERS : []
        res.writeHead(200, rlHeaders)
        res.end(JSON.stringify(members))
        return
      }

      const messagesMatch = path.match(/^\/api\/v10\/channels\/(\d+)\/messages$/)
      if (messagesMatch && method === 'GET') {
        const channelId = messagesMatch[1]
        const limit = parseInt(url.searchParams.get('limit') || '100')
        const before = url.searchParams.get('before')
        let msgs = fakeMessages(channelId)
        if (before) {
          const idx = msgs.findIndex((m) => m.id === before)
          if (idx > 0) msgs = msgs.slice(0, idx)
          else if (idx === -1) msgs = []
        }
        msgs = msgs.slice(-limit)
        res.writeHead(200, rlHeaders)
        res.end(JSON.stringify(msgs))
        return
      }

      const threadsMatch = path.match(/^\/api\/v10\/guilds\/(\d+)\/threads\/active$/)
      if (threadsMatch && method === 'GET') {
        res.writeHead(200, rlHeaders)
        res.end(JSON.stringify(FAKE_THREADS))
        return
      }

      const archivedMatch = path.match(/^\/api\/v10\/channels\/(\d+)\/threads\/archived\/public$/)
      if (archivedMatch && method === 'GET') {
        res.writeHead(200, rlHeaders)
        res.end(JSON.stringify(FAKE_ARCHIVED_THREADS))
        return
      }

      const reactionsMatch = path.match(/^\/api\/v10\/channels\/(\d+)\/messages\/(\d+)\/reactions\//)
      if (reactionsMatch && method === 'GET') {
        res.writeHead(200, rlHeaders)
        res.end(JSON.stringify(FAKE_REACTION_USERS))
        return
      }

      res.writeHead(404, rlHeaders)
      res.end(JSON.stringify({ message: 'Not Found', code: 0 }))
    })

    mockDiscord.listen(0, () => {
      const addr = mockDiscord.address()
      mockPort = typeof addr === 'object' && addr ? addr.port : 0
      resolve(mockPort)
    })
  })
}

// ─── Patched DiscordRESTAPI that hits our mock ────────────────────────────────

class MockDiscordRESTAPI extends DiscordRESTAPI {
  constructor(
    token: string,
    private mockBaseUrl: string
  ) {
    super(token)
    // Override the private request method to redirect Discord API calls to mock
    const origRequest = (this as any).request.bind(this)
    ;(this as any).request = async <T>(path: string, retries = 3): Promise<T> => {
      const origFetch = globalThis.fetch
      globalThis.fetch = async (input: any, init?: any) => {
        const url = typeof input === 'string' ? input : input.url || input.toString()
        if (url.startsWith('https://discord.com')) {
          return origFetch(url.replace('https://discord.com', mockBaseUrl), init)
        }
        return origFetch(input, init)
      }
      try {
        return await origRequest(path, retries)
      } finally {
        globalThis.fetch = origFetch
      }
    }
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' })

test.describe('Discord Mock — Bot REST API', () => {
  test.beforeAll(async () => {
    await startMockDiscord()
  })

  test.afterAll(async () => {
    // Don't close — other describes reuse the mock server
  })

  test.beforeEach(() => resetMockState())

  test('getGuild returns mapped DiscordServer', async () => {
    const api = new MockDiscordRESTAPI('mock-bot-token', `http://localhost:${mockPort}`)
    const guild = await api.getGuild(FAKE_GUILD.id)
    expect(guild).toEqual({ id: FAKE_GUILD.id, name: 'Vaporwave Aesthetics', ownerId: '223344556677889900' })
  })

  test('getGuild with unknown ID throws', async () => {
    const api = new MockDiscordRESTAPI('mock-bot-token', `http://localhost:${mockPort}`)
    await expect(api.getGuild('9999999999999999999')).rejects.toThrow()
  })

  test('getGuildChannels maps types correctly', async () => {
    const api = new MockDiscordRESTAPI('mock-bot-token', `http://localhost:${mockPort}`)
    const channels = await api.getGuildChannels(FAKE_GUILD.id)
    const text = channels.filter((c) => c.type === 'text')
    const voice = channels.filter((c) => c.type === 'voice')
    const category = channels.filter((c) => c.type === 'category')
    expect(text.length).toBe(5)
    expect(voice.length).toBe(1)
    expect(category.length).toBe(1)
    expect(text.find((c) => c.name === 'welcome')!.categoryId).toBe('1100000000000000001')
    expect(text.find((c) => c.name === 'mod-log')!.categoryId).toBeUndefined()
  })

  test('getGuildRoles parses permission bitflags', async () => {
    const api = new MockDiscordRESTAPI('mock-bot-token', `http://localhost:${mockPort}`)
    const roles = await api.getGuildRoles(FAKE_GUILD.id)
    expect(roles.length).toBe(FAKE_ROLES.length)
    const admin = roles.find((r) => r.name === 'Admin')!
    expect(admin.permissions).toContain('ADMINISTRATOR')
    const everyone = roles.find((r) => r.name === '@everyone')!
    expect(everyone.permissions.length).toBeGreaterThan(0)
  })

  test('getGuildMembers paginates and maps fields', async () => {
    const api = new MockDiscordRESTAPI('mock-bot-token', `http://localhost:${mockPort}`)
    const members = await api.getGuildMembers(FAKE_GUILD.id)
    expect(members.length).toBe(5)
    expect(members[0]).toEqual({
      userId: '223344556677889900',
      username: 'neon_admin',
      roles: ['1100000000000000101'],
      joinedAt: '2023-06-15T10:30:00.000Z'
    })
    expect(members[1].roles).toContain('1100000000000000102')
    expect(members[4].username).toBe('cyber_ghost')
  })

  test('getChannelMessages returns full message data with reactions, attachments, embeds, stickers, replies', async () => {
    const api = new MockDiscordRESTAPI('mock-bot-token', `http://localhost:${mockPort}`)
    const msgs = await api.getChannelMessages('1100000000000000003')
    expect(msgs.length).toBe(6)

    // Plain text
    expect(msgs[0].content).toBe('Welcome to Vaporwave Aesthetics! 🌴')
    expect(msgs[0].author.username).toBe('neon_admin')

    // Reactions (mock resolves users for each emoji)
    expect(msgs[1].reactions).toBeDefined()
    expect(msgs[1].reactions!.length).toBe(2)
    expect(msgs[1].reactions![0].users.length).toBe(3)

    // Attachments
    expect(msgs[2].attachments!.length).toBe(1)
    expect(msgs[2].attachments![0].filename).toBe('sunset_vaporwave.jpg')

    // Embeds
    expect(msgs[3].embeds!.length).toBe(1)
    expect(msgs[3].embeds![0].title).toContain('MACINTOSH PLUS')
    expect(msgs[3].embeds![0].type).toBe('rich')
    expect(msgs[3].embeds![0].thumbnail!.url).toContain('scdn.co')

    // Reply (message_reference)
    expect(msgs[4].replyTo).toBe('2200000000000000001')

    // Stickers
    expect(msgs[5].stickers).toBeDefined()
    expect(msgs[5].stickers![0].name).toBe('wave')
  })

  test('getChannelMessages respects limit', async () => {
    const api = new MockDiscordRESTAPI('mock-bot-token', `http://localhost:${mockPort}`)
    const msgs = await api.getChannelMessages('1100000000000000003', { limit: 2 })
    expect(msgs.length).toBe(2)
  })

  test('getChannelMessages supports before-based pagination', async () => {
    const api = new MockDiscordRESTAPI('mock-bot-token', `http://localhost:${mockPort}`)
    const msgs = await api.getChannelMessages('1100000000000000003', { before: '2200000000000000003' })
    expect(msgs.length).toBe(2)
    expect(msgs.every((m) => m.id < '2200000000000000003')).toBe(true)
  })

  test('getActiveThreads returns mapped threads', async () => {
    const api = new MockDiscordRESTAPI('mock-bot-token', `http://localhost:${mockPort}`)
    const threads = await api.getActiveThreads(FAKE_GUILD.id)
    expect(threads.length).toBe(2)
    expect(threads[0].type).toBe('thread')
    expect(threads[0].name).toBe('sunset-discussion')
    expect(threads[0].categoryId).toBe('1100000000000000003')
  })

  test('getArchivedThreads returns mapped threads', async () => {
    const api = new MockDiscordRESTAPI('mock-bot-token', `http://localhost:${mockPort}`)
    const threads = await api.getArchivedThreads('1100000000000000003')
    expect(threads.length).toBe(1)
    expect(threads[0].name).toBe('old-events')
  })

  test('getReactionUsers returns user IDs', async () => {
    const api = new MockDiscordRESTAPI('mock-bot-token', `http://localhost:${mockPort}`)
    const users = await api.getReactionUsers('1100000000000000003', '2200000000000000002', '💜')
    expect(users).toEqual(['223344556677889900', '445566778899001122', '556677889900112233'])
  })

  test('rate limit triggers retry and succeeds', async () => {
    forcedRateLimitPath = '/guilds/'
    const api = new MockDiscordRESTAPI('mock-bot-token', `http://localhost:${mockPort}`)
    const guild = await api.getGuild(FAKE_GUILD.id)
    expect(guild.name).toBe('Vaporwave Aesthetics')
    expect(requestLog.filter((r) => r.path === `/api/v10/guilds/${FAKE_GUILD.id}`).length).toBe(2)
  })

  test('401 Unauthorized throws immediately', async () => {
    force401 = true
    const api = new MockDiscordRESTAPI('bad-token', `http://localhost:${mockPort}`)
    await expect(api.getGuild(FAKE_GUILD.id)).rejects.toThrow('Invalid bot token')
  })

  test('403 Forbidden throws with context', async () => {
    force403Path = '/members'
    const api = new MockDiscordRESTAPI('mock-bot-token', `http://localhost:${mockPort}`)
    await expect(api.getGuildMembers(FAKE_GUILD.id)).rejects.toThrow('Forbidden')
  })

  test('Authorization header uses Bot prefix', async () => {
    const api = new MockDiscordRESTAPI('my-secret-token', `http://localhost:${mockPort}`)
    await api.getGuild(FAKE_GUILD.id)
    const req = requestLog.find((r) => r.path.includes('/guilds/'))
    expect(req!.headers.authorization).toBe('Bot my-secret-token')
  })

  test('Unicode content preserved through API layer', async () => {
    const api = new MockDiscordRESTAPI('mock-bot-token', `http://localhost:${mockPort}`)
    const msgs = await api.getChannelMessages('1100000000000000003')
    expect(msgs[0].content).toContain('🌴')
    expect(msgs[3].embeds![0].title).toContain('リサフランク420')
  })

  test('multiple concurrent requests all succeed', async () => {
    const api = new MockDiscordRESTAPI('mock-bot-token', `http://localhost:${mockPort}`)
    const [guild, channels, roles, members, threads] = await Promise.all([
      api.getGuild(FAKE_GUILD.id),
      api.getGuildChannels(FAKE_GUILD.id),
      api.getGuildRoles(FAKE_GUILD.id),
      api.getGuildMembers(FAKE_GUILD.id),
      api.getActiveThreads(FAKE_GUILD.id)
    ])
    expect(guild.name).toBe('Vaporwave Aesthetics')
    expect(channels.length).toBeGreaterThan(0)
    expect(roles.length).toBe(5)
    expect(members.length).toBe(5)
    expect(threads.length).toBe(2)
  })
})

test.describe('Discord Mock — OAuth Flow (Portal)', () => {
  let portalApp: express.Express
  let portalServer: Server
  let portalPort: number
  let portal: PortalService
  const crypto = createCryptoProvider()

  test.beforeAll(async () => {
    if (!mockDiscord) await startMockDiscord()
    resetMockState()

    portal = new PortalService(crypto)
    await portal.initialize()

    portalApp = express()
    portalApp.use(express.json())
    portalApp.use('/api', oauthRoutes(portal))

    process.env.DISCORD_CLIENT_ID = '999888777666555444'
    process.env.DISCORD_CLIENT_SECRET = 'mock_client_secret_abcdef'

    portalPort = await new Promise<number>((resolve) => {
      portalServer = portalApp.listen(0, () => {
        const addr = portalServer.address()
        const port = typeof addr === 'object' && addr ? addr.port : 0
        process.env.DISCORD_REDIRECT_URI = `http://localhost:${port}/api/oauth/discord/callback`
        resolve(port)
      })
    })
  })

  test.afterAll(async () => {
    await new Promise<void>((r) => portalServer?.close(() => r()))
  })

  test.beforeEach(() => resetMockState())

  test('GET /authorize redirects to Discord with correct params', async () => {
    const res = await fetch(`http://localhost:${portalPort}/api/oauth/discord/authorize?userDID=did:key:z6MkTest`, {
      redirect: 'manual'
    })
    expect(res.status).toBe(302)
    const loc = res.headers.get('location')!
    expect(loc).toContain('discord.com/api/oauth2/authorize')
    expect(loc).toContain('client_id=999888777666555444')
    expect(loc).toContain('scope=identify')
    expect(loc).toContain('response_type=code')
    const state = new URL(loc).searchParams.get('state')!
    expect(state.length).toBe(64) // 32 bytes hex
  })

  test('authorize rejects missing userDID', async () => {
    const res = await fetch(`http://localhost:${portalPort}/api/oauth/discord/authorize`)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('userDID')
  })

  test('callback rejects forged CSRF state', async () => {
    const res = await fetch(
      `http://localhost:${portalPort}/api/oauth/discord/callback?code=abc&state=forged_state_1234567890abcdef`
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Invalid or expired')
  })

  test('callback rejects missing code', async () => {
    const res = await fetch(`http://localhost:${portalPort}/api/oauth/discord/callback?state=something`)
    expect(res.status).toBe(400)
  })

  test('callback forwards Discord error parameter', async () => {
    const res = await fetch(`http://localhost:${portalPort}/api/oauth/discord/callback?error=access_denied&state=abc`)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('access_denied')
  })

  test('full OAuth flow: authorize → callback → poll result', async () => {
    const userDID = 'did:key:z6MkFullFlow'

    // 1. Initiate
    const initRes = await fetch(
      `http://localhost:${portalPort}/api/oauth/discord/authorize?userDID=${encodeURIComponent(userDID)}`,
      { redirect: 'manual' }
    )
    const state = new URL(initRes.headers.get('location')!).searchParams.get('state')!

    // 2. Callback — patch fetch so portal's token exchange hits mock
    const origFetch = globalThis.fetch
    globalThis.fetch = async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input.url || input.toString()
      if (url.startsWith('https://discord.com')) {
        return origFetch(url.replace('https://discord.com', `http://localhost:${mockPort}`), init)
      }
      return origFetch(input, init)
    }

    try {
      const callbackRes = await origFetch(
        `http://localhost:${portalPort}/api/oauth/discord/callback?code=valid_code&state=${state}`
      )
      expect(callbackRes.status).toBe(200)
      const html = await callbackRes.text()
      expect(html).toContain('Discord account linked')
      expect(html).toContain('harmony:oauth-complete')
      expect(html).toContain('synthwave_sarah')
    } finally {
      globalThis.fetch = origFetch
    }

    // 3. Poll result
    const resultRes = await fetch(`http://localhost:${portalPort}/api/oauth/result/${encodeURIComponent(userDID)}`)
    const result = await resultRes.json()
    expect(result.complete).toBe(true)
    expect(result.provider).toBe('discord')
    expect(result.discordUsername).toBe('synthwave_sarah')

    // 4. Result consumed — second poll returns incomplete
    const recheck = await (
      await fetch(`http://localhost:${portalPort}/api/oauth/result/${encodeURIComponent(userDID)}`)
    ).json()
    expect(recheck.complete).toBe(false)
  })

  test('expired state is rejected', async () => {
    const userDID = 'did:key:z6MkExpired'
    const initRes = await fetch(
      `http://localhost:${portalPort}/api/oauth/discord/authorize?userDID=${encodeURIComponent(userDID)}`,
      { redirect: 'manual' }
    )
    const state = new URL(initRes.headers.get('location')!).searchParams.get('state')!

    // Simulate expiry
    const pending = _pendingStates.get(state)
    if (pending) pending.createdAt = Date.now() - 11 * 60 * 1000

    const res = await fetch(`http://localhost:${portalPort}/api/oauth/discord/callback?code=test&state=${state}`)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('expired')
  })

  test('POST /identity/link returns redirect URL for discord', async () => {
    const res = await fetch(`http://localhost:${portalPort}/api/identity/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'discord', userDID: 'did:key:z6MkLink' })
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.redirectUrl).toContain('discord.com/api/oauth2/authorize')
  })

  test('POST /identity/link rejects unsupported provider', async () => {
    const res = await fetch(`http://localhost:${portalPort}/api/identity/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'twitter', userDID: 'did:key:z6Mk' })
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('Unsupported')
  })

  test('POST /identity/link rejects missing fields', async () => {
    const res = await fetch(`http://localhost:${portalPort}/api/identity/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'discord' })
    })
    expect(res.status).toBe(400)
  })

  test('GET /identity/:did/discord-profile returns 404 for unlinked DID', async () => {
    const res = await fetch(
      `http://localhost:${portalPort}/api/identity/${encodeURIComponent('did:key:z6MkNobody')}/discord-profile`
    )
    expect(res.status).toBe(404)
  })

  test('GET /identity/:did/discord-profile returns profile after link', async () => {
    await portal.completeOAuthLink({
      provider: 'discord',
      code: 'x',
      state: 'x',
      userDID: 'did:key:z6MkProfile',
      userKeyPair: undefined as any,
      providerUserId: '998877665544332211',
      providerUsername: 'profile_user'
    })

    const res = await fetch(
      `http://localhost:${portalPort}/api/identity/${encodeURIComponent('did:key:z6MkProfile')}/discord-profile`
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.username).toBe('profile_user')
    expect(body.discordId).toBe('998877665544332211')
  })

  test('OAuth with redirectUri redirects with VC', async () => {
    const userDID = 'did:key:z6MkRedir'
    const redirectUri = 'http://localhost:9999/done'
    process.env.ALLOWED_REDIRECT_URIS = 'http://localhost:9999'

    const initRes = await fetch(
      `http://localhost:${portalPort}/api/oauth/discord/authorize?userDID=${encodeURIComponent(userDID)}&redirectUri=${encodeURIComponent(redirectUri)}`,
      { redirect: 'manual' }
    )
    const state = new URL(initRes.headers.get('location')!).searchParams.get('state')!

    const origFetch = globalThis.fetch
    globalThis.fetch = async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input.url || input.toString()
      if (url.startsWith('https://discord.com')) {
        return origFetch(url.replace('https://discord.com', `http://localhost:${mockPort}`), init)
      }
      return origFetch(input, init)
    }

    try {
      const res = await origFetch(`http://localhost:${portalPort}/api/oauth/discord/callback?code=ok&state=${state}`, {
        redirect: 'manual'
      })
      expect(res.status).toBe(302)
      const loc = res.headers.get('location')!
      expect(loc).toContain('http://localhost:9999/done')
      expect(loc).toContain('vc=')
      // DID may be deduped if Discord user was linked in a prior test
      expect(loc).toMatch(/did=did%3Akey%3Az6Mk/)
    } finally {
      globalThis.fetch = origFetch
      delete process.env.ALLOWED_REDIRECT_URIS
    }
  })

  test('javascript: redirectUri is blocked (XSS prevention)', async () => {
    const res = await fetch(
      `http://localhost:${portalPort}/api/oauth/discord/authorize?userDID=did:key:z6MkXSS&redirectUri=${encodeURIComponent('javascript:alert(1)')}`,
      { redirect: 'manual' }
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('protocol')
  })
})

test.describe('Discord Mock — DiscordLinkService', () => {
  const crypto = createCryptoProvider()
  let linkService: DiscordLinkService

  test.beforeAll(async () => {
    const didProvider = new DIDKeyProvider(crypto)
    const kp = await crypto.generateSigningKeyPair()
    const doc = await didProvider.create(kp)
    linkService = new DiscordLinkService(crypto)
    await linkService.initialize(doc.id, kp)
  })

  test('initiateLink returns valid Discord redirect URL', () => {
    const result = linkService.initiateLink({
      userDID: 'did:key:z6MkInit',
      clientId: '999888',
      redirectUri: 'http://localhost:3000/cb'
    })
    expect(result.redirectUrl).toContain('discord.com/api/oauth2/authorize')
    expect(result.redirectUrl).toContain('client_id=999888')
    expect(result.redirectUrl).toContain('scope=identify')
    expect(result.state.length).toBe(32)
  })

  test('completeLink issues VC and stores DID↔Discord mapping', async () => {
    const init = linkService.initiateLink({ userDID: 'did:key:z6MkComp', clientId: 'c', redirectUri: 'http://r' })
    const { vc, userDID } = await linkService.completeLink({
      state: init.state,
      discordProfile: { userId: '112233', username: 'test_linker' }
    })
    expect(userDID).toBe('did:key:z6MkComp')
    expect(vc.type).toContain('DiscordIdentityCredential')
    expect(vc.credentialSubject.discordUserId).toBe('112233')
    expect(vc.credentialSubject.discordUsername).toBe('test_linker')
  })

  test('completeLink rejects invalid state', async () => {
    await expect(
      linkService.completeLink({
        state: 'bogus',
        discordProfile: { userId: 'u1', username: 't' }
      })
    ).rejects.toThrow('Invalid or expired')
  })

  test('bidirectional lookup after link', async () => {
    const init = linkService.initiateLink({ userDID: 'did:key:z6MkLook', clientId: 'c', redirectUri: 'http://r' })
    await linkService.completeLink({
      state: init.state,
      discordProfile: { userId: '998877', username: 'lookup_user' }
    })
    expect(linkService.lookupByDiscordId('998877')).toBe('did:key:z6MkLook')
    expect(linkService.lookupByDID('did:key:z6MkLook')).toBe('998877')
    expect(linkService.lookupByDiscordId('nonexistent')).toBeNull()
    expect(linkService.lookupByDID('did:key:z6MkUnknown')).toBeNull()
  })

  test('pending state count tracks active flows', () => {
    const before = linkService.getPendingStateCount()
    linkService.initiateLink({ userDID: 'did:key:z6MkCount1', clientId: 'c', redirectUri: 'http://r' })
    linkService.initiateLink({ userDID: 'did:key:z6MkCount2', clientId: 'c', redirectUri: 'http://r' })
    expect(linkService.getPendingStateCount()).toBe(before + 2)
  })
})

test.describe('Discord Mock — MigrationBot Export', () => {
  const crypto = createCryptoProvider()

  test.beforeAll(async () => {
    if (!mockDiscord) await startMockDiscord()
    resetMockState()
  })

  test.afterAll(async () => {
    // mock server shared — don't close here
  })

  test('full server export with mock API', async () => {
    test.setTimeout(60_000)
    const api = new MockDiscordRESTAPI('mock-bot-token', `http://localhost:${mockPort}`)
    const kp = await crypto.generateSigningKeyPair()
    const didProvider = new DIDKeyProvider(crypto)
    const doc = await didProvider.create(kp)
    const bot = new MigrationBot(crypto, api)

    const result = await bot.exportServer({
      serverId: FAKE_GUILD.id,
      adminDID: doc.id,
      adminKeyPair: kp
    })

    expect(result).toBeDefined()
    expect(result.metadata.sourceServerName).toBe('Vaporwave Aesthetics')
    expect(result.metadata.sourceServerId).toBe(FAKE_GUILD.id)
    expect(result.metadata.channelCount).toBeGreaterThanOrEqual(5)
    expect(result.metadata.memberCount).toBe(5)
    expect(result.metadata.messageCount).toBeGreaterThan(0)
    expect(result.ciphertext).toBeInstanceOf(Uint8Array)
    expect(result.nonce).toBeInstanceOf(Uint8Array)
  })

  test('export progress callback fires for each phase', async () => {
    test.setTimeout(60_000)
    const api = new MockDiscordRESTAPI('mock-bot-token', `http://localhost:${mockPort}`)
    const kp = await crypto.generateSigningKeyPair()
    const didProvider = new DIDKeyProvider(crypto)
    const doc = await didProvider.create(kp)
    const bot = new MigrationBot(crypto, api)

    const phases: string[] = []
    await bot.exportServer({
      serverId: FAKE_GUILD.id,
      adminDID: doc.id,
      adminKeyPair: kp,
      onProgress: (p: ExportProgress) => {
        if (!phases.includes(p.phase)) phases.push(p.phase)
      }
    })

    expect(phases).toContain('channels')
    expect(phases).toContain('roles')
    expect(phases).toContain('members')
    expect(phases).toContain('messages')
    expect(phases).toContain('encrypting')
  })

  test('export survives rate-limited endpoint', async () => {
    test.setTimeout(60_000)
    forcedRateLimitPath = '/channels/'
    const api = new MockDiscordRESTAPI('mock-bot-token', `http://localhost:${mockPort}`)
    const kp = await crypto.generateSigningKeyPair()
    const didProvider = new DIDKeyProvider(crypto)
    const doc = await didProvider.create(kp)
    const bot = new MigrationBot(crypto, api)

    const result = await bot.exportServer({
      serverId: FAKE_GUILD.id,
      adminDID: doc.id,
      adminKeyPair: kp
    })
    expect(result.metadata.sourceServerName).toBe('Vaporwave Aesthetics')
  })

  test('export with channel filter', async () => {
    test.setTimeout(60_000)
    const api = new MockDiscordRESTAPI('mock-bot-token', `http://localhost:${mockPort}`)
    const kp = await crypto.generateSigningKeyPair()
    const didProvider = new DIDKeyProvider(crypto)
    const doc = await didProvider.create(kp)
    const bot = new MigrationBot(crypto, api)

    const result = await bot.exportServer({
      serverId: FAKE_GUILD.id,
      adminDID: doc.id,
      adminKeyPair: kp,
      options: { channels: ['1100000000000000003'] } // only #general
    })
    expect(result.metadata.sourceServerName).toBe('Vaporwave Aesthetics')
    // Message count should reflect only the filtered channel
    expect(result.metadata.messageCount).toBeGreaterThan(0)
  })

  test('export with user exclusion', async () => {
    test.setTimeout(60_000)
    const api = new MockDiscordRESTAPI('mock-bot-token', `http://localhost:${mockPort}`)
    const kp = await crypto.generateSigningKeyPair()
    const didProvider = new DIDKeyProvider(crypto)
    const doc = await didProvider.create(kp)
    const bot = new MigrationBot(crypto, api)

    const result = await bot.exportServer({
      serverId: FAKE_GUILD.id,
      adminDID: doc.id,
      adminKeyPair: kp,
      options: { excludeUsers: ['667788990011223344'] } // exclude cyber_ghost
    })
    expect(result.metadata.sourceServerName).toBe('Vaporwave Aesthetics')
  })

  test('bot start/stop lifecycle', async () => {
    const api = new MockDiscordRESTAPI('mock-bot-token', `http://localhost:${mockPort}`)
    const bot = new MigrationBot(crypto, api)

    expect(bot.isRunning()).toBe(false)
    await bot.start('mock-token')
    expect(bot.isRunning()).toBe(true)
    await expect(bot.start('mock-token')).rejects.toThrow('already running')
    await bot.stop()
    expect(bot.isRunning()).toBe(false)
    await expect(bot.stop()).rejects.toThrow('not running')
  })
})

test.describe('Discord Mock — Portal Identity & Friends', () => {
  const crypto = createCryptoProvider()
  let portal: PortalService

  test.beforeAll(async () => {
    portal = new PortalService(crypto)
    await portal.initialize()
  })

  test('completeOAuthLink stores discord profile', async () => {
    const vc = await portal.completeOAuthLink({
      provider: 'discord',
      code: 'x',
      state: 'x',
      userDID: 'did:key:z6MkPortal1',
      userKeyPair: undefined as any,
      providerUserId: '111222333444555666',
      providerUsername: 'neon_admin'
    })
    expect(vc.type).toContain('DiscordIdentityCredential')
    const profile = portal.getDiscordProfile('did:key:z6MkPortal1')
    expect(profile!.username).toBe('neon_admin')
    expect(profile!.discordId).toBe('111222333444555666')
  })

  test('resolveDiscordUser maps discord ID → DID', () => {
    expect(portal.resolveDiscordUser!('111222333444555666')).toBe('did:key:z6MkPortal1')
    expect(portal.resolveDiscordUser!('nonexistent')).toBeNull()
  })

  test('findLinkedIdentities batch resolution', async () => {
    await portal.completeOAuthLink({
      provider: 'discord',
      code: 'x',
      state: 'x',
      userDID: 'did:key:z6MkBatch1',
      userKeyPair: undefined as any,
      providerUserId: '100100100100',
      providerUsername: 'batch1'
    })
    await portal.completeOAuthLink({
      provider: 'discord',
      code: 'x',
      state: 'x',
      userDID: 'did:key:z6MkBatch2',
      userKeyPair: undefined as any,
      providerUserId: '200200200200',
      providerUsername: 'batch2'
    })

    const linked = await portal.findLinkedIdentities(['100100100100', '200200200200', '300300300300'])
    expect(linked.size).toBe(2)
    expect(linked.get('100100100100')).toBe('did:key:z6MkBatch1')
    expect(linked.has('300300300300')).toBe(false)
  })

  test('searchByDiscordUsername partial match', async () => {
    await portal.completeOAuthLink({
      provider: 'discord',
      code: 'x',
      state: 'x',
      userDID: 'did:key:z6MkSearch',
      userKeyPair: undefined as any,
      providerUserId: '400400400400',
      providerUsername: 'synthwave_queen'
    })

    expect(portal.searchByDiscordUsername('synth').some((r) => r.username === 'synthwave_queen')).toBe(true)
    expect(portal.searchByDiscordUsername('SYNTH').some((r) => r.username === 'synthwave_queen')).toBe(true) // case-insensitive
    expect(portal.searchByDiscordUsername('zzznomatch').length).toBe(0)
  })

  test('friend discovery across linked accounts', async () => {
    await portal.completeOAuthLink({
      provider: 'discord',
      code: 'x',
      state: 'x',
      userDID: 'did:key:z6MkAlice',
      userKeyPair: undefined as any,
      providerUserId: '500500500500',
      providerUsername: 'alice'
    })
    await portal.completeOAuthLink({
      provider: 'discord',
      code: 'x',
      state: 'x',
      userDID: 'did:key:z6MkBob',
      userKeyPair: undefined as any,
      providerUserId: '600600600600',
      providerUsername: 'bob'
    })

    portal.storeFriendsList('did:key:z6MkAlice', ['600600600600', '700700700700'])
    const friends = await portal.discoverFriends('did:key:z6MkAlice')
    expect(friends.length).toBe(1) // only Bob linked
    expect(friends[0].did).toBe('did:key:z6MkBob')
    expect(friends[0].username).toBe('bob')
  })

  test('discoverFriends with no stored friends returns empty', async () => {
    const friends = await portal.discoverFriends('did:key:z6MkNobodyFriends')
    expect(friends).toEqual([])
  })
})
