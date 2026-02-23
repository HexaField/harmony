import { describe, it, expect, beforeEach } from 'vitest'

import {
  InMemoryD1,
  InMemoryR2,
  InMemoryKV,
  SCHEMA_SQL,
  createIdentityStore,
  createExportStore,
  createInviteResolver,
  createOAuthHandler,
  createRateLimiter,
  createDirectoryStore,
  RelayDurableObject,
  createMockWebSocket,
  handleRequest,
  type PortalWorkerEnv,
  type EncryptedExportBundle
} from '../src/index.js'

let db: InMemoryD1
let r2: InMemoryR2
let kv: InMemoryKV

function createEnv(): PortalWorkerEnv {
  return {
    DB: db,
    EXPORTS: r2,
    KV: kv,
    RELAY: null as never,
    DISCORD_CLIENT_ID: 'test-client-id',
    DISCORD_CLIENT_SECRET: 'test-secret',
    DISCORD_REDIRECT_URI: 'http://localhost/callback',
    ALLOWED_ORIGINS: '*'
  }
}

beforeEach(async () => {
  db = new InMemoryD1()
  r2 = new InMemoryR2()
  kv = new InMemoryKV()
  await db.exec(SCHEMA_SQL)
})

// ── Identity Store ──
describe('Identity Store', () => {
  it('T1: Identity link creates D1 row', async () => {
    const store = createIdentityStore(db)
    await store.linkIdentity('discord123', 'did:key:z6Mk1', 'proof1')
    const did = await store.getByDiscordId('discord123')
    expect(did).toBe('did:key:z6Mk1')
  })

  it('T2: Identity link rejects duplicate Discord ID', async () => {
    const store = createIdentityStore(db)
    await store.linkIdentity('discord123', 'did:key:z6Mk1', 'proof1')
    await expect(store.linkIdentity('discord123', 'did:key:z6Mk2', 'proof2')).rejects.toThrow('DUPLICATE_DISCORD_ID')
  })

  it('T3: Identity link rejects duplicate DID', async () => {
    const store = createIdentityStore(db)
    await store.linkIdentity('discord123', 'did:key:z6Mk1', 'proof1')
    await expect(store.linkIdentity('discord456', 'did:key:z6Mk1', 'proof2')).rejects.toThrow('DUPLICATE_DID')
  })

  it('T4: Identity verify returns DID', async () => {
    const store = createIdentityStore(db)
    await store.linkIdentity('discord123', 'did:key:z6Mk1', 'proof1')
    const did = await store.getByDiscordId('discord123')
    expect(did).toBe('did:key:z6Mk1')
  })

  it('T5: Identity verify returns null for unknown', async () => {
    const store = createIdentityStore(db)
    const did = await store.getByDiscordId('unknown')
    expect(did).toBeNull()
  })
})

// ── Export Store ──
describe('Export Store', () => {
  const testBundle: EncryptedExportBundle = {
    ciphertext: new Uint8Array([1, 2, 3, 4]),
    nonce: new Uint8Array([5, 6, 7]),
    metadata: {
      exportDate: '2026-02-23',
      sourceServerId: 'srv1',
      sourceServerName: 'Test Server',
      adminDID: 'did:key:z6MkAdmin',
      channelCount: 5,
      messageCount: 100,
      memberCount: 10,
      quadCount: 50
    }
  }

  it('T6: Export upload stores to R2', async () => {
    const store = createExportStore(r2, db)
    const { exportId } = await store.upload(testBundle)
    expect(exportId).toBeDefined()
    const retrieved = await store.download(exportId)
    expect(retrieved).not.toBeNull()
  })

  it('T7: Export upload stores metadata in D1', async () => {
    const store = createExportStore(r2, db)
    await store.upload(testBundle)
    const list = await store.listByAdmin('did:key:z6MkAdmin')
    expect(list.length).toBe(1)
    expect(list[0].communityName).toBe('Test Server')
  })

  it('T8: Export download returns bundle', async () => {
    const store = createExportStore(r2, db)
    const { exportId } = await store.upload(testBundle)
    const bundle = await store.download(exportId)
    expect(bundle).not.toBeNull()
    expect(Array.from(bundle!.ciphertext)).toEqual([1, 2, 3, 4])
    expect(Array.from(bundle!.nonce)).toEqual([5, 6, 7])
  })

  it('T9: Export delete removes from R2 and D1', async () => {
    const store = createExportStore(r2, db)
    const { exportId } = await store.upload(testBundle)
    await store.delete(exportId)
    const bundle = await store.download(exportId)
    expect(bundle).toBeNull()
    const list = await store.listByAdmin('did:key:z6MkAdmin')
    expect(list.length).toBe(0)
  })

  it('T10: Export list by admin', async () => {
    const store = createExportStore(r2, db)
    await store.upload(testBundle)
    await store.upload({ ...testBundle, metadata: { ...testBundle.metadata, sourceServerName: 'Server 2' } })
    const list = await store.listByAdmin('did:key:z6MkAdmin')
    expect(list.length).toBe(2)
  })
})

// ── Friends ──
describe('Friends', () => {
  it('T11: Friends find returns linked DIDs', async () => {
    const store = createIdentityStore(db)
    await store.linkIdentity('d1', 'did:key:z6Mk1', 'p1')
    await store.linkIdentity('d2', 'did:key:z6Mk2', 'p2')
    const friends = await store.findFriends(['d1', 'd2', 'd3'])
    expect(friends.length).toBe(2)
    expect(friends.find((f) => f.discordId === 'd1')?.did).toBe('did:key:z6Mk1')
  })
})

// ── OAuth ──
describe('OAuth', () => {
  it('T12: OAuth flow stores state in KV', async () => {
    const handler = createOAuthHandler(kv)
    await handler.storeState('state123', { did: 'did:key:z6Mk1', provider: 'discord' })
    const val = await kv.get('oauth_state:state123')
    expect(val).not.toBeNull()
    expect(JSON.parse(val!).did).toBe('did:key:z6Mk1')
  })

  it('T13: OAuth callback validates state', async () => {
    const handler = createOAuthHandler(kv)
    // Invalid state
    const invalid = await handler.validateState('nonexistent')
    expect(invalid).toBeNull()

    // Valid state
    await handler.storeState('valid', { did: 'did:key:z6Mk1' })
    const valid = await handler.validateState('valid')
    expect(valid).not.toBeNull()
    expect(valid!.did).toBe('did:key:z6Mk1')
    // Consumed - second attempt fails
    const consumed = await handler.validateState('valid')
    expect(consumed).toBeNull()
  })

  it('T14: OAuth callback links identity', async () => {
    const env = createEnv()
    const handler = createOAuthHandler(kv)
    await handler.storeState('teststate', { did: 'did:key:z6Mk1', provider: 'discord' })

    const resp = await handleRequest(
      {
        method: 'GET',
        url: 'https://portal.harmony.chat/api/oauth/discord/callback?state=teststate&code=discord_user_1',
        headers: {}
      },
      env
    )

    expect(resp.status).toBe(200)
    const body = JSON.parse(resp.body)
    expect(body.success).toBe(true)
  })
})

// ── Invites ──
describe('Invites', () => {
  it('T15: Invite create returns code', async () => {
    const resolver = createInviteResolver(db)
    const code = await resolver.create(
      'comm1',
      'ws://localhost:4000',
      { name: 'Test', memberCount: 5 },
      'did:key:z6Mk1'
    )
    expect(code).toBeTruthy()
    const target = await resolver.resolve(code)
    expect(target).not.toBeNull()
    expect(target!.communityId).toBe('comm1')
  })

  it('T16: Invite resolve returns target', async () => {
    const resolver = createInviteResolver(db)
    const code = await resolver.create(
      'comm1',
      'ws://localhost:4000',
      { name: 'Community', memberCount: 10 },
      'did:key:z6Mk1'
    )
    const target = await resolver.resolve(code)
    expect(target).not.toBeNull()
    expect(target!.preview.name).toBe('Community')
    expect(target!.endpoint).toBe('ws://localhost:4000')
  })

  it('T17: Invite resolve handles expired', async () => {
    const resolver = createInviteResolver(db)
    const code = await resolver.create(
      'comm1',
      'ws://localhost:4000',
      { name: 'Test', memberCount: 5 },
      'did:key:z6Mk1',
      {
        expiresAt: '2020-01-01T00:00:00Z' // already expired
      }
    )
    const target = await resolver.resolve(code)
    expect(target).toBeNull()
  })

  it('T18: Invite resolve handles max uses', async () => {
    const resolver = createInviteResolver(db)
    const code = await resolver.create(
      'comm1',
      'ws://localhost:4000',
      { name: 'Test', memberCount: 5 },
      'did:key:z6Mk1',
      {
        maxUses: 1
      }
    )
    // First use
    const target1 = await resolver.resolve(code)
    expect(target1).not.toBeNull()
    // Second use — over limit
    const target2 = await resolver.resolve(code)
    expect(target2).toBeNull()
  })

  it('T19: Invite revoke marks invalid', async () => {
    const resolver = createInviteResolver(db)
    const code = await resolver.create(
      'comm1',
      'ws://localhost:4000',
      { name: 'Test', memberCount: 5 },
      'did:key:z6Mk1'
    )
    await resolver.revoke(code)
    const target = await resolver.resolve(code)
    expect(target).toBeNull()
  })

  it('T20: Invite stats tracked', async () => {
    const resolver = createInviteResolver(db)
    const code = await resolver.create(
      'comm1',
      'ws://localhost:4000',
      { name: 'Test', memberCount: 5 },
      'did:key:z6Mk1'
    )
    await resolver.resolve(code)
    const stats = await resolver.stats(code)
    expect(stats).not.toBeNull()
    expect(stats!.uses).toBe(1)
  })

  it('T21: Invite landing page (no app)', async () => {
    const env = createEnv()
    const resolver = createInviteResolver(db)
    const code = await resolver.create(
      'comm1',
      'ws://localhost:4000',
      { name: 'My Community', memberCount: 15 },
      'did:key:z6Mk1'
    )

    const resp = await handleRequest(
      {
        method: 'GET',
        url: `https://portal.harmony.chat/invite/${code}`,
        headers: { 'user-agent': 'Mozilla/5.0' }
      },
      env
    )

    expect(resp.status).toBe(200)
    expect(resp.headers['Content-Type']).toContain('text/html')
    expect(resp.body).toContain('My Community')
    expect(resp.body).toContain('Download Harmony')
  })

  it('T22: Invite deep link (has app)', async () => {
    const env = createEnv()
    const resolver = createInviteResolver(db)
    const code = await resolver.create(
      'comm1',
      'ws://localhost:4000',
      { name: 'Test', memberCount: 5 },
      'did:key:z6Mk1'
    )

    const resp = await handleRequest(
      {
        method: 'GET',
        url: `https://portal.harmony.chat/invite/${code}`,
        headers: { 'user-agent': 'Harmony/0.1.0' }
      },
      env
    )

    expect(resp.status).toBe(200)
    const body = JSON.parse(resp.body)
    expect(body.redirect).toContain('harmony://')
  })
})

// ── Relay ──
describe('Relay', () => {
  it('T23: Relay node connection', () => {
    const relay = new RelayDurableObject()
    const nodeWs = createMockWebSocket()
    relay.handleNodeConnection(nodeWs, 'did:key:node1')
    expect(relay.getConnectedNodes()).toContain('did:key:node1')
  })

  it('T24: Relay client connection', () => {
    const relay = new RelayDurableObject()
    const nodeWs = createMockWebSocket()
    relay.handleNodeConnection(nodeWs, 'did:key:node1')

    const clientWs = createMockWebSocket()
    relay.handleClientConnection(clientWs, 'did:key:node1')
    // Client connected successfully (not closed with 4004)
    expect(clientWs.readyState).toBe(1)
  })

  it('T25: Relay frame routing', () => {
    const relay = new RelayDurableObject()

    const nodeWs = createMockWebSocket()
    relay.handleNodeConnection(nodeWs, 'did:key:node1')

    const clientWs = createMockWebSocket()
    relay.handleClientConnection(clientWs, 'did:key:node1')

    // When client sends a message, relay pipes it to node
    const receivedByNode: unknown[] = []
    // Override the node's send to capture
    ;(nodeWs as { send: (data: unknown) => void }).send = (data: unknown) => {
      receivedByNode.push(data)
    }

    // Simulate client sending a message
    clientWs.dispatchEvent(new MessageEvent('message', { data: 'hello from client' }))
    expect(receivedByNode).toContain('hello from client')

    // Verify relay structure
    expect(relay.getConnectedNodes()).toContain('did:key:node1')
  })

  it('T26: Relay handles node disconnect', () => {
    const relay = new RelayDurableObject()
    const nodeWs = createMockWebSocket()
    relay.handleNodeConnection(nodeWs, 'did:key:node1')
    expect(relay.getConnectedNodes()).toContain('did:key:node1')

    // Node disconnects
    nodeWs.close()
    expect(relay.getConnectedNodes()).not.toContain('did:key:node1')
  })
})

// ── Directory ──
describe('Directory', () => {
  it('T27: Directory register adds community', async () => {
    const store = createDirectoryStore(db)
    await store.register({
      communityId: 'comm1',
      name: 'Open Source Chat',
      description: 'A community for devs',
      endpoint: 'ws://example.com:4000',
      memberCount: 50,
      ownerDID: 'did:key:z6Mk1',
      listedAt: new Date().toISOString()
    })
    const list = await store.list()
    expect(list.length).toBe(1)
    expect(list[0].name).toBe('Open Source Chat')
  })

  it('T28: Directory list returns communities', async () => {
    const store = createDirectoryStore(db)
    await store.register({
      communityId: 'comm1',
      name: 'Community 1',
      endpoint: 'ws://a:4000',
      memberCount: 10,
      ownerDID: 'did:key:z6Mk1',
      listedAt: new Date().toISOString()
    })
    await store.register({
      communityId: 'comm2',
      name: 'Community 2',
      endpoint: 'ws://b:4000',
      memberCount: 20,
      ownerDID: 'did:key:z6Mk2',
      listedAt: new Date().toISOString()
    })
    const list = await store.list()
    expect(list.length).toBe(2)
  })
})

// ── Rate Limiting ──
describe('Rate Limiting', () => {
  it('T29: Rate limiting per IP', async () => {
    const limiter = createRateLimiter(kv)
    // Allow 3 requests in 60s
    const r1 = await limiter.check('test-ip', 3, 60)
    expect(r1.allowed).toBe(true)
    const r2 = await limiter.check('test-ip', 3, 60)
    expect(r2.allowed).toBe(true)
    const r3 = await limiter.check('test-ip', 3, 60)
    expect(r3.allowed).toBe(true)
    const r4 = await limiter.check('test-ip', 3, 60)
    expect(r4.allowed).toBe(false)
    expect(r4.remaining).toBe(0)
  })
})

// ── CORS ──
describe('CORS', () => {
  it('T30: CORS headers for allowed origins', async () => {
    const env = createEnv()
    const resp = await handleRequest(
      {
        method: 'GET',
        url: 'https://portal.harmony.chat/health',
        headers: { origin: 'https://harmony.chat' }
      },
      env
    )

    expect(resp.headers['Access-Control-Allow-Origin']).toBe('https://harmony.chat')
  })
})

// ── Health ──
describe('Health', () => {
  it('T31: Health endpoint returns 200', async () => {
    const env = createEnv()
    const resp = await handleRequest(
      {
        method: 'GET',
        url: 'https://portal.harmony.chat/health',
        headers: {}
      },
      env
    )

    expect(resp.status).toBe(200)
    const body = JSON.parse(resp.body)
    expect(body.status).toBe('ok')
  })
})

// ── Large Export ──
describe('Large Export', () => {
  it('T32: Large export upload and download', async () => {
    const store = createExportStore(r2, db)
    const largeData = new Uint8Array(50 * 1024) // 50KB (not 50MB for test speed)
    for (let i = 0; i < largeData.length; i++) largeData[i] = i % 256

    const bundle: EncryptedExportBundle = {
      ciphertext: largeData,
      nonce: new Uint8Array([1, 2, 3]),
      metadata: {
        exportDate: '2026-02-23',
        sourceServerId: 'srv1',
        sourceServerName: 'Large Server',
        adminDID: 'did:key:z6MkAdmin',
        channelCount: 50,
        messageCount: 100000,
        memberCount: 500,
        quadCount: 50000
      }
    }

    const { exportId } = await store.upload(bundle)
    const downloaded = await store.download(exportId)
    expect(downloaded).not.toBeNull()
    expect(downloaded!.ciphertext.length).toBe(largeData.length)
  })
})

// ── D1 Migration ──
describe('D1 Migration', () => {
  it('T33: D1 migration applies cleanly', async () => {
    const freshDb = new InMemoryD1()
    const result = await freshDb.exec(SCHEMA_SQL)
    expect(result.count).toBeGreaterThan(0)
    // Verify tables exist by inserting data
    const store = createIdentityStore(freshDb)
    await store.linkIdentity('test', 'did:key:test', 'proof')
    const did = await store.getByDiscordId('test')
    expect(did).toBe('did:key:test')
  })
})
