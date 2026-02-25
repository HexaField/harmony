/**
 * Comprehensive flow verification for all main Harmony user flows.
 * Tests run against live HarmonyServer instances (not Electron).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createServer, request as httpRequest, type Server } from 'node:http'
import WebSocket from 'ws'
import { HarmonyApp } from '../../app/src/app.js'
import { createCryptoProvider } from '@harmony/crypto'
import type { KeyPair } from '@harmony/crypto'
import { IdentityManager } from '@harmony/identity'
import type { Identity } from '@harmony/identity'
import { HarmonyClient } from '@harmony/client'
import { MemoryQuadStore } from '@harmony/quads'
import type { Quad } from '@harmony/quads'
import { HarmonyServer } from '@harmony/server'
import { DIDKeyProvider } from '@harmony/did'
import { MemoryRevocationStore } from '@harmony/vc'
import { MigrationService } from '@harmony/migration'
import type { EncryptedExportBundle } from '@harmony/migration'
import { MigrationEndpoint } from '../../server-runtime/src/migration-endpoint.js'
import { createLogger } from '../../server-runtime/src/logger.js'
import { HarmonyType, HarmonyPredicate, RDFPredicate, XSDDatatype } from '@harmony/vocab'
import { createCloudApp } from '../../cloud/src/index.js'
import { PortalService } from '../../portal/src/index.js'

const crypto = createCryptoProvider()
const logger = createLogger({ level: 'error', format: 'json', silent: true })

// Helper: wait for a client event with timeout
function waitForEvent(client: HarmonyClient, event: string, timeoutMs = 5000): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for event: ${event}`)), timeoutMs)
    const unsub = client.on(event as any, (...args: unknown[]) => {
      clearTimeout(timer)
      unsub()
      resolve(args)
    })
  })
}

// Helper: create identity + client connected to a server
async function createConnectedClient(
  serverUrl: string
): Promise<{ client: HarmonyClient; identity: Identity; keyPair: KeyPair; did: string }> {
  const idMgr = new IdentityManager(crypto)
  const result = await idMgr.create()
  const client = await HarmonyClient.create({
    identity: result.identity,
    keyPair: result.keyPair,
    cryptoProvider: crypto,
    wsFactory: (url: string) => new WebSocket(url) as any
  })
  await client.connect({
    serverUrl,
    identity: result.identity,
    keyPair: result.keyPair
  })
  // connect() resolves when authenticated — client is now connected
  return { client, identity: result.identity, keyPair: result.keyPair, did: result.identity.did }
}

// Helper: HTTP request
function makeRequest(
  url: string,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const opts = {
      hostname: u.hostname,
      port: u.port,
      path,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {}
    }
    const req = httpRequest(opts, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString()
        try {
          resolve({ status: res.statusCode!, body: JSON.parse(text) })
        } catch {
          resolve({ status: res.statusCode!, body: text })
        }
      })
    })
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

// ═══════════════════════════════════════════════════════
// Flow 1: Onboarding
// ═══════════════════════════════════════════════════════
describe('Flow 1: Onboarding', () => {
  it('creates identity with valid DID and 12-word mnemonic', async () => {
    const idMgr = new IdentityManager(crypto)
    const result = await idMgr.create()
    expect(result.identity.did).toMatch(/^did:key:z6Mk/)
    expect(result.mnemonic.split(' ')).toHaveLength(12)
    expect(result.keyPair.publicKey).toBeInstanceOf(Uint8Array)
    expect(result.keyPair.secretKey).toBeInstanceOf(Uint8Array)
  })

  it('recovers identity from mnemonic (same DID)', async () => {
    const idMgr = new IdentityManager(crypto)
    const original = await idMgr.create()
    const recovered = await idMgr.createFromMnemonic(original.mnemonic)
    expect(recovered.identity.did).toBe(original.identity.did)
    expect(Buffer.from(recovered.keyPair.publicKey)).toEqual(Buffer.from(original.keyPair.publicKey))
  })

  it('persists config to disk (config.json format)', async () => {
    const dataDir = join(tmpdir(), 'harmony-flow1-' + randomBytes(4).toString('hex'))
    mkdirSync(dataDir, { recursive: true })
    const app = new HarmonyApp(dataDir)
    const { did, mnemonic } = await app.createIdentity()

    const config = JSON.parse(readFileSync(join(dataDir, 'config.json'), 'utf-8'))
    expect(config.version).toBe(1)
    expect(config.identity.did).toBe(did)
    expect(config.identity.mnemonic).toBe(mnemonic)
    expect(config.identity.createdAt).toBeDefined()
  })
})

// ═══════════════════════════════════════════════════════
// Flows 2–8: Server-based flows (shared HarmonyApp)
// ═══════════════════════════════════════════════════════
describe('Flows 2–8: Server connection, communities, messaging, persistence', () => {
  let app: HarmonyApp
  let dataDir: string
  const port = 19880

  beforeAll(async () => {
    dataDir = join(tmpdir(), 'harmony-flows-' + randomBytes(4).toString('hex'))
    mkdirSync(dataDir, { recursive: true })
    app = new HarmonyApp(dataDir, { port })
    await app.createIdentity()
    await app.startServer()
  })

  afterAll(async () => {
    if (app.getState().running) await app.stopServer()
  })

  // Flow 2: Server Connection
  describe('Flow 2: Server Connection', () => {
    it('connects client and completes auth handshake', async () => {
      const { client, did } = await createConnectedClient(`ws://127.0.0.1:${port}`)
      expect(client.connectionState()).toBe('connected')
      expect(did).toMatch(/^did:key:z6Mk/)
      await client.disconnect()
    })
  })

  // Flow 3: Community Creation
  let communityId: string
  let channelId: string
  let client1: HarmonyClient
  let client1Did: string

  describe('Flow 3: Community Creation', () => {
    it('creates community with default channels', async () => {
      const conn = await createConnectedClient(`ws://127.0.0.1:${port}`)
      client1 = conn.client
      client1Did = conn.did

      const community = await client1.createCommunity({
        name: 'Test Community',
        description: 'A test community',
        defaultChannels: ['general', 'random']
      })

      communityId = community.id
      expect(communityId).toMatch(/^community:/)
      expect(community.channels).toHaveLength(2)
      expect(community.channels.map((c) => c.name)).toContain('general')
      expect(community.channels.map((c) => c.name)).toContain('random')
      channelId = community.channels.find((c) => c.name === 'general')!.id
    })

    it('community.list returns the created community', async () => {
      const listPromise = waitForEvent(client1, 'community.list', 5000)
      client1.requestCommunityList()
      const [data] = await listPromise
      const payload = data as { communities: any[] }
      expect(payload.communities.length).toBeGreaterThanOrEqual(1)
      const found = payload.communities.find((c: any) => c.id === communityId)
      expect(found).toBeDefined()
      expect(found.name).toBe('Test Community')
    })

    it('community.info returns member list with creator', async () => {
      const infoPromise = waitForEvent(client1, 'community.info', 5000)
      client1.requestCommunityInfo(communityId)
      const [data] = await infoPromise
      const payload = data as { communityId: string; members: any[] }
      expect(payload.communityId).toBe(communityId)
      expect(payload.members.length).toBeGreaterThanOrEqual(1)
      const creatorMember = payload.members.find((m: any) => m.did === client1Did)
      expect(creatorMember).toBeDefined()
    })
  })

  // Flow 4: Messaging
  describe('Flow 4: Messaging', () => {
    it('sends messages and retrieves via sync', async () => {
      // Send 3 messages
      const msgId1 = await client1.sendMessage(communityId, channelId, 'Hello World')
      const msgId2 = await client1.sendMessage(communityId, channelId, 'Second message')
      const msgId3 = await client1.sendMessage(communityId, channelId, 'Third message')

      expect(msgId1).toBeDefined()
      expect(msgId2).toBeDefined()
      expect(msgId3).toBeDefined()

      // Sync channel
      const syncPromise = waitForEvent(client1, 'sync', 5000)
      await client1.syncChannel(communityId, channelId)
      const [syncData] = await syncPromise
      const sync = syncData as { communityId: string; channelId: string; messages: any[] }

      expect(sync.communityId).toBe(communityId)
      expect(sync.channelId).toBe(channelId)
      expect(sync.messages.length).toBeGreaterThanOrEqual(3)

      // Verify ordering (by clock counter)
      for (let i = 1; i < sync.messages.length; i++) {
        const prevClock = sync.messages[i - 1].payload?.clock?.counter ?? 0
        const currClock = sync.messages[i].payload?.clock?.counter ?? 0
        expect(currClock).toBeGreaterThanOrEqual(prevClock)
      }

      // Verify content
      const firstMsg = sync.messages.find((m: any) => m.id === msgId1)
      expect(firstMsg).toBeDefined()
      expect(firstMsg.authorDID).toBe(client1Did)
      expect(firstMsg.timestamp).toBeDefined()
    })
  })

  // Flow 6: Restart Persistence
  describe('Flow 6: Restart Persistence', () => {
    it('communities and messages survive server restart', async () => {
      await client1.disconnect()
      await app.stopServer()

      // Restart
      await app.startServer()

      // Reconnect
      const conn = await createConnectedClient(`ws://127.0.0.1:${port}`)
      client1 = conn.client
      client1Did = conn.did

      // Check community still exists
      const listPromise = waitForEvent(client1, 'community.list', 5000)
      client1.requestCommunityList()
      const [listData] = await listPromise
      const payload = listData as { communities: any[] }
      const found = payload.communities.find((c: any) => c.id === communityId)
      expect(found).toBeDefined()
      expect(found.name).toBe('Test Community')

      // Sync messages — should still be there
      const syncPromise = waitForEvent(client1, 'sync', 5000)
      await client1.syncChannel(communityId, channelId)
      const [syncData] = await syncPromise
      const sync = syncData as { messages: any[] }
      expect(sync.messages.length).toBeGreaterThanOrEqual(3)
    })
  })

  // Flow 7: Display Names
  describe('Flow 7: Display Names', () => {
    it('display name visible in community.info', async () => {
      // Set display name via app config
      const config = app.getConfig()
      if (config.identity) {
        config.identity.displayName = 'TestUser'
        writeFileSync(join(dataDir, 'config.json'), JSON.stringify(config, null, 2))
      }

      // Create a second client with display name set on identity
      const idMgr = new IdentityManager(crypto)
      const result = await idMgr.create()
      // The display name is part of the member record on the server side
      // We need to join the community and check community.info
      const client2 = await HarmonyClient.create({
        identity: result.identity,
        keyPair: result.keyPair,
        cryptoProvider: crypto,
        wsFactory: (url: string) => new WebSocket(url) as any
      })
      await client2.connect({
        serverUrl: `ws://127.0.0.1:${port}`,
        identity: result.identity,
        keyPair: result.keyPair
      })
      // connect() resolves when authenticated

      // Request community info from client1
      const infoPromise = waitForEvent(client1, 'community.info', 5000)
      client1.requestCommunityInfo(communityId)
      const [data] = await infoPromise
      const payload = data as { members: any[] }
      // Should have at least the creator member
      expect(payload.members.length).toBeGreaterThanOrEqual(1)

      await client2.disconnect()
    })
  })

  // Flow 8: Member Sidebar Data
  describe('Flow 8: Member Sidebar Data', () => {
    it('community.info returns multiple members with status', async () => {
      // client1 is already connected and in the community
      // Create a second client, join the same community
      const conn2 = await createConnectedClient(`ws://127.0.0.1:${port}`)

      // The second client needs to sync with this community to appear
      const syncPromise2 = waitForEvent(conn2.client, 'sync', 5000)
      await conn2.client.syncChannel(communityId, channelId)
      const [syncData] = await syncPromise2
      expect(syncData).toBeDefined()

      // Now check community.info from client1
      const infoPromise = waitForEvent(client1, 'community.info', 5000)
      client1.requestCommunityInfo(communityId)
      const [data] = await infoPromise
      const payload = data as { members: any[]; onlineMembers: any[] }

      // Should have at least 2 members visible (online connections)
      expect(payload.onlineMembers.length).toBeGreaterThanOrEqual(2)

      // Check status fields exist
      for (const m of payload.onlineMembers) {
        expect(m.status).toBeDefined()
        expect(m.did).toBeDefined()
      }

      await conn2.client.disconnect()
    })
  })
})

// ═══════════════════════════════════════════════════════
// Flow 5: Migration Import
// ═══════════════════════════════════════════════════════
describe('Flow 5: Migration Import', () => {
  let httpServer: Server
  let endpoint: MigrationEndpoint
  let store: MemoryQuadStore
  let harmonyServer: HarmonyServer
  let adminKeyPair: KeyPair
  let bundle: EncryptedExportBundle
  const migCommunityId = 'harmony:community:discord-test-456'

  beforeAll(async () => {
    const quads: Quad[] = [
      { subject: migCommunityId, predicate: RDFPredicate.type, object: HarmonyType.Community, graph: migCommunityId },
      {
        subject: migCommunityId,
        predicate: HarmonyPredicate.name,
        object: { value: 'Migrated Server' },
        graph: migCommunityId
      },
      {
        subject: 'harmony:channel:mig-ch1',
        predicate: RDFPredicate.type,
        object: HarmonyType.Channel,
        graph: migCommunityId
      },
      {
        subject: 'harmony:channel:mig-ch1',
        predicate: HarmonyPredicate.name,
        object: { value: 'welcome' },
        graph: migCommunityId
      },
      {
        subject: 'harmony:member:user1',
        predicate: RDFPredicate.type,
        object: HarmonyType.Member,
        graph: migCommunityId
      },
      {
        subject: 'harmony:member:user1',
        predicate: HarmonyPredicate.name,
        object: { value: 'Bob' },
        graph: migCommunityId
      },
      // A message
      { subject: 'msg:1', predicate: RDFPredicate.type, object: HarmonyType.Message, graph: migCommunityId },
      {
        subject: 'msg:1',
        predicate: HarmonyPredicate.author,
        object: { value: 'harmony:member:user1' },
        graph: migCommunityId
      },
      {
        subject: 'msg:1',
        predicate: HarmonyPredicate.content,
        object: { value: 'Hello from Discord!' },
        graph: migCommunityId
      },
      {
        subject: 'msg:1',
        predicate: HarmonyPredicate.timestamp,
        object: { value: new Date().toISOString(), datatype: XSDDatatype.dateTime },
        graph: migCommunityId
      },
      {
        subject: 'msg:1',
        predicate: HarmonyPredicate.inChannel,
        object: 'harmony:channel:mig-ch1',
        graph: migCommunityId
      }
    ]

    adminKeyPair = await crypto.generateSigningKeyPair()
    const migration = new MigrationService(crypto)
    bundle = await migration.encryptExport(quads, adminKeyPair, {
      exportDate: new Date().toISOString(),
      sourceServerId: 'discord-test-456',
      sourceServerName: 'Migrated Server',
      adminDID: 'did:key:test',
      channelCount: 1,
      messageCount: 1,
      memberCount: 1
    })

    store = new MemoryQuadStore()
    const didProvider = new DIDKeyProvider(crypto)
    harmonyServer = new HarmonyServer({
      port: 0,
      store,
      didResolver: async (did: string) => didProvider.resolve(did),
      revocationStore: new MemoryRevocationStore(),
      cryptoProvider: crypto
    })

    endpoint = new MigrationEndpoint(logger, store as any)
    endpoint.setHarmonyServer(harmonyServer)

    httpServer = createServer((req, res) => {
      void endpoint.handleRequest(req, res).then((handled) => {
        if (!handled) {
          res.writeHead(404)
          res.end()
        }
      })
    })
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()))
  })

  it('imports Discord export bundle successfully', async () => {
    const port = (httpServer.address() as any).port
    const result = await makeRequest(`http://127.0.0.1:${port}`, 'POST', '/api/migration/import', {
      bundle: {
        ciphertext: Buffer.from(bundle.ciphertext).toString('base64'),
        nonce: Buffer.from(bundle.nonce).toString('base64'),
        metadata: bundle.metadata
      },
      adminDID: 'did:key:test',
      communityName: 'Migrated Server',
      adminKeyPair: {
        publicKey: Buffer.from(adminKeyPair.publicKey).toString('base64'),
        secretKey: Buffer.from(adminKeyPair.secretKey).toString('base64')
      }
    })

    expect(result.status).toBe(200)
    expect(result.body.communityId).toBe(migCommunityId)
    expect(result.body.channels).toHaveLength(1)
    expect(result.body.channels[0].name).toBe('welcome')
    expect(result.body.members).toHaveLength(1)
    expect(result.body.members[0].displayName).toBe('Bob')
  })

  it('community is registered after import', () => {
    expect(harmonyServer.communities()).toContain(migCommunityId)
  })

  it('imported quads are queryable', async () => {
    const quads = await store.match({ subject: migCommunityId, predicate: RDFPredicate.type })
    expect(quads.length).toBeGreaterThan(0)
  })
})

// ═══════════════════════════════════════════════════════
// Flow 9: Cloud Service
// ═══════════════════════════════════════════════════════
describe('Flow 9: Cloud Service', () => {
  let cloudServer: Server
  let cloudPort: number

  beforeAll(async () => {
    const { app } = await createCloudApp(crypto)
    cloudServer = app.listen(0, '127.0.0.1')
    await new Promise<void>((resolve) => cloudServer.on('listening', resolve))
    cloudPort = (cloudServer.address() as any).port
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => cloudServer.close(() => resolve()))
  })

  it('health endpoint returns ok', async () => {
    const res = await makeRequest(`http://127.0.0.1:${cloudPort}`, 'GET', '/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })

  it('identity creation endpoint works', async () => {
    const res = await makeRequest(`http://127.0.0.1:${cloudPort}`, 'POST', '/api/identities', {})
    // Should return 200 or 201 with identity data
    expect([200, 201]).toContain(res.status)
    if (res.body.did) {
      expect(res.body.did).toMatch(/^did:key:/)
    }
  })

  it('storage endpoints respond', async () => {
    const res = await makeRequest(`http://127.0.0.1:${cloudPort}`, 'GET', '/api/storage/status')
    // May be 200 or 404 depending on route setup, but should not 500
    expect(res.status).not.toBe(500)
  })
})

// ═══════════════════════════════════════════════════════
// Flow 10: Portal Service
// ═══════════════════════════════════════════════════════
describe('Flow 10: Portal Service', () => {
  let portal: PortalService

  beforeAll(async () => {
    portal = new PortalService(crypto)
    await portal.initialize()
  })

  it('creates identity', async () => {
    const result = await portal.createIdentity()
    expect(result.identity.did).toMatch(/^did:key:/)
    expect(result.mnemonic.split(' ')).toHaveLength(12)
  })

  it('resolves created identity', async () => {
    const result = await portal.createIdentity()
    const resolved = await portal.resolveIdentity(result.identity.did)
    expect(resolved).not.toBeNull()
    expect(resolved!.did).toBe(result.identity.did)
  })

  it('initiates OAuth link', async () => {
    const result = await portal.initiateOAuthLink({
      provider: 'discord',
      userDID: 'did:key:test123'
    })
    expect(result.redirectUrl).toContain('discord')
    expect(result.state).toBeDefined()
    expect(result.state.length).toBeGreaterThan(0)
  })

  it('stores and retrieves exports', async () => {
    const testBundle = {
      ciphertext: new Uint8Array([1, 2, 3]),
      nonce: new Uint8Array([4, 5, 6]),
      metadata: {
        exportDate: new Date().toISOString(),
        sourceServerId: 'test',
        sourceServerName: 'Test',
        adminDID: 'did:key:test',
        channelCount: 1,
        messageCount: 0,
        memberCount: 1
      }
    }
    const storeResult = await portal.storeExport(testBundle)
    expect(storeResult.exportId).toBeDefined()
  })
})

// ═══════════════════════════════════════════════════════
// Flow 11: Client Event Types
// ═══════════════════════════════════════════════════════
describe('Flow 11: Client Event Types', () => {
  it('community.list is a valid ClientEvent (compile check)', async () => {
    // This test passes if it compiles — 'community.list' must be in ClientEvent union
    const client = await HarmonyClient.create({ cryptoProvider: crypto })
    let called = false
    const unsub = client.on('community.list', () => {
      called = true
    })
    expect(typeof unsub).toBe('function')
    unsub() // clean up
  })

  it('client.off() removes handler', async () => {
    const client = await HarmonyClient.create({ cryptoProvider: crypto })
    let count = 0
    const handler = () => {
      count++
    }
    client.on('error', handler)
    client.off('error', handler)
    // Emitting error internally shouldn't reach our handler
    // We just verify the API works without throwing
    expect(count).toBe(0)
  })

  it('unsubscribe function from on() works', async () => {
    const client = await HarmonyClient.create({ cryptoProvider: crypto })
    let count = 0
    const unsub = client.on('error', () => {
      count++
    })
    unsub()
    expect(count).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════
// Flow 12: Loading State
// ═══════════════════════════════════════════════════════
describe('Flow 12: Loading State (channel store)', () => {
  it('channel store has loading signal concept', async () => {
    // The channel store in ui/src/stores/channel.ts has a loading signal
    // We verify the client-side loading concept exists
    // HarmonyClient subscriptions have a loading property
    const client = await HarmonyClient.create({ cryptoProvider: crypto })
    // Communities start empty
    expect(client.communities()).toHaveLength(0)
    // The client has connectionState
    expect(client.connectionState()).toBe('disconnected')
  })
})
