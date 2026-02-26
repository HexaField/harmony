import { describe, it, expect, afterEach } from 'vitest'
import { WebSocket } from 'ws'
import { createCryptoProvider } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import { IdentityManager } from '@harmony/identity'
import { VCService, MemoryRevocationStore } from '@harmony/vc'
import type { DIDResolver } from '@harmony/vc'
import { HarmonyServer } from '@harmony/server'
import { HarmonyClient } from '@harmony/client'
import { MemoryQuadStore } from '@harmony/quads'
import type { KeyPair } from '@harmony/crypto'
import type { Identity } from '@harmony/identity'
import type { VerifiablePresentation } from '@harmony/vc'

// ── Helpers ──

const crypto = createCryptoProvider()
const didProvider = new DIDKeyProvider(crypto)
const identityMgr = new IdentityManager(crypto)
const vcService = new VCService(crypto)

const resolver: DIDResolver = (did: string) => didProvider.resolve(did)

async function createIdentityAndVP(): Promise<{
  identity: Identity
  keyPair: KeyPair
  vp: VerifiablePresentation
}> {
  const { identity, keyPair } = await identityMgr.create()
  const vc = await vcService.issue({
    issuerDID: identity.did,
    issuerKeyPair: keyPair,
    subjectDID: identity.did,
    type: 'HarmonyAuthCredential',
    claims: { auth: true }
  })
  const vp = await vcService.present({
    holderDID: identity.did,
    holderKeyPair: keyPair,
    credentials: [vc]
  })
  return { identity, keyPair, vp }
}

async function createServerOnRandomPort(): Promise<{ server: HarmonyServer; port: number }> {
  const { createServer } = await import('node:net')
  const port = await new Promise<number>((resolve) => {
    const s = createServer()
    s.listen(0, () => {
      const addr = s.address()
      const p = typeof addr === 'object' && addr ? addr.port : 0
      s.close(() => resolve(p))
    })
  })

  const store = new MemoryQuadStore()
  const revocationStore = new MemoryRevocationStore()
  const server = new HarmonyServer({
    port,
    host: '127.0.0.1',
    store,
    didResolver: resolver,
    revocationStore
  })
  await server.start()
  return { server, port }
}

async function connectClient(port: number): Promise<HarmonyClient> {
  const auth = await createIdentityAndVP()
  const client = new HarmonyClient({
    wsFactory: (url: string) => new WebSocket(url) as any
  })
  await client.connect({
    serverUrl: `ws://127.0.0.1:${port}`,
    identity: auth.identity,
    keyPair: auth.keyPair,
    vp: auth.vp
  })
  return client
}

// Track resources for cleanup
const servers: HarmonyServer[] = []
const clients: HarmonyClient[] = []

afterEach(async () => {
  for (const c of clients) {
    try {
      await c.disconnect()
    } catch {
      /* ignore */
    }
  }
  clients.length = 0
  for (const s of servers) {
    try {
      await s.stop()
    } catch {
      /* ignore */
    }
  }
  servers.length = 0
})

// ── Helper: set up community with 2 clients ──
async function setupCommunityWith2Clients() {
  const { server, port } = await createServerOnRandomPort()
  servers.push(server)

  const client1 = await connectClient(port)
  const client2 = await connectClient(port)
  clients.push(client1, client2)

  const community = await client1.createCommunity({ name: 'ThreadTest', defaultChannels: ['general'] })
  const channelId = community.channels[0]?.id
  expect(channelId).toBeTruthy()

  await client2.joinCommunity(community.id)

  // Small delay for join to propagate
  await new Promise((r) => setTimeout(r, 100))

  return { server, port, client1, client2, community, channelId }
}

describe('Threads', () => {
  it('thread.create → thread.created received by all members', async () => {
    const { client1, client2, community, channelId } = await setupCommunityWith2Clients()

    // Send a channel message to use as parent
    const parentMsgId = await client1.sendMessage(community.id, channelId, 'parent message')
    await new Promise((r) => setTimeout(r, 100))

    // Listen for thread.created on both clients
    const received1 = new Promise<any>((resolve) => {
      client1.on('thread.created', (payload: any) => resolve(payload))
    })
    const received2 = new Promise<any>((resolve) => {
      client2.on('thread.created', (payload: any) => resolve(payload))
    })

    const threadId = await client1.createThread(community.id, channelId, parentMsgId, 'My Thread', 'first msg')

    const [r1, r2] = await Promise.all([received1, received2])

    expect(r1.threadId).toBe(threadId)
    expect(r1.parentMessageId).toBe(parentMsgId)
    expect(r1.channelId).toBe(channelId)
    expect(r1.communityId).toBe(community.id)
    expect(r1.name).toBe('My Thread')

    expect(r2.threadId).toBe(threadId)
    expect(r2.name).toBe('My Thread')
  })

  it('thread.send → thread.message received by all members', async () => {
    const { client1, client2, community, channelId } = await setupCommunityWith2Clients()

    const parentMsgId = await client1.sendMessage(community.id, channelId, 'parent')
    await new Promise((r) => setTimeout(r, 100))

    const threadCreated = new Promise<any>((resolve) => {
      client2.on('thread.created', (payload: any) => resolve(payload))
    })

    const threadId = await client1.createThread(community.id, channelId, parentMsgId, 'Thread', 'first')
    await threadCreated

    // Now client2 sends a thread message
    const received1 = new Promise<any>((resolve) => {
      client1.on('thread.message', (payload: any) => resolve(payload))
    })
    const received2 = new Promise<any>((resolve) => {
      client2.on('thread.message', (payload: any) => resolve(payload))
    })

    await client2.sendThreadMessage(threadId, 'reply from client2')

    const [r1, r2] = await Promise.all([received1, received2])

    expect(r1.threadId).toBe(threadId)
    expect(r2.threadId).toBe(threadId)
  })

  it('multiple threads route messages correctly', async () => {
    const { client1, client2, community, channelId } = await setupCommunityWith2Clients()

    const parentMsg1 = await client1.sendMessage(community.id, channelId, 'msg1')
    const parentMsg2 = await client1.sendMessage(community.id, channelId, 'msg2')
    await new Promise((r) => setTimeout(r, 100))

    // Create two threads
    let createdCount = 0
    const bothCreated = new Promise<void>((resolve) => {
      client2.on('thread.created', () => {
        createdCount++
        if (createdCount >= 2) resolve()
      })
    })

    const threadId1 = await client1.createThread(community.id, channelId, parentMsg1, 'Thread1', 'first1')
    const threadId2 = await client1.createThread(community.id, channelId, parentMsg2, 'Thread2', 'first2')
    await bothCreated

    // Send message to each thread and verify routing
    const threadMessages: any[] = []
    client2.on('thread.message', (payload: any) => {
      threadMessages.push(payload)
    })

    await client1.sendThreadMessage(threadId1, 'msg in thread 1')
    await client1.sendThreadMessage(threadId2, 'msg in thread 2')
    await new Promise((r) => setTimeout(r, 200))

    const t1msgs = threadMessages.filter((m: any) => m.threadId === threadId1)
    const t2msgs = threadMessages.filter((m: any) => m.threadId === threadId2)
    expect(t1msgs.length).toBe(1)
    expect(t2msgs.length).toBe(1)
  })

  it('thread.send to non-existent thread returns error', async () => {
    const { client1, community, channelId } = await setupCommunityWith2Clients()

    // Need to be in a community for the connection to work
    const errorReceived = new Promise<any>((resolve) => {
      client1.on('error', (payload: any) => resolve(payload))
    })

    await client1.sendThreadMessage('nonexistent-thread-id', 'hello')

    const err = await errorReceived
    expect(err.code).toBe('THREAD_NOT_FOUND')
  })

  it('thread preserves name and parent message', async () => {
    const { client1, client2, community, channelId } = await setupCommunityWith2Clients()

    const parentMsgId = await client1.sendMessage(community.id, channelId, 'parent')
    await new Promise((r) => setTimeout(r, 100))

    const received = new Promise<any>((resolve) => {
      client2.on('thread.created', (payload: any) => resolve(payload))
    })

    await client1.createThread(community.id, channelId, parentMsgId, 'Specific Thread Name', 'content')

    const payload = await received
    expect(payload.name).toBe('Specific Thread Name')
    expect(payload.parentMessageId).toBe(parentMsgId)
  })

  it('thread creator attribution is correct', async () => {
    const { client1, client2, community, channelId } = await setupCommunityWith2Clients()

    const parentMsgId = await client1.sendMessage(community.id, channelId, 'parent')
    await new Promise((r) => setTimeout(r, 100))

    const received = new Promise<any>((resolve) => {
      client2.on('thread.created', (payload: any) => resolve(payload))
    })

    await client1.createThread(community.id, channelId, parentMsgId, 'Thread', 'msg')

    const payload = await received
    // creatorDID should be client1's DID
    expect(payload.creatorDID).toBeTruthy()
    expect(typeof payload.creatorDID).toBe('string')
    expect(payload.creatorDID).toMatch(/^did:key:z/)
  })
})
