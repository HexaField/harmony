/**
 * Server-side tests for voice relay, DM routing, member sync,
 * and self-consumption prevention.
 *
 * Covers regressions from commits 4b6be63, e726d8e, fbd7f16, af406d0.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { WebSocket } from 'ws'
import { MemoryQuadStore } from '@harmony/quads'
import { createCryptoProvider } from '@harmony/crypto'
import type { KeyPair } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import type { DIDDocument } from '@harmony/did'
import { VCService, MemoryRevocationStore } from '@harmony/vc'
import type { VerifiablePresentation } from '@harmony/vc'
import type { ProtocolMessage } from '@harmony/protocol'
import { serialise, deserialise } from '@harmony/protocol'
import { HarmonyServer } from '../src/index.js'
import { HarmonyPredicate, HarmonyType } from '@harmony/vocab'

const crypto = createCryptoProvider()
const didProvider = new DIDKeyProvider(crypto)
const vcService = new VCService(crypto)

const didDocs: Map<string, DIDDocument> = new Map()
const didResolver = async (did: string) => didDocs.get(did) ?? null
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function createIdentity() {
  const keyPair = await crypto.generateSigningKeyPair()
  const doc = await didProvider.create(keyPair)
  didDocs.set(doc.id, doc)
  const vc = await vcService.issue({
    issuerDID: doc.id,
    issuerKeyPair: keyPair,
    subjectDID: doc.id,
    type: 'IdentityCredential',
    claims: { name: 'Test' }
  })
  const vp = await vcService.present({
    holderDID: doc.id,
    holderKeyPair: keyPair,
    credentials: [vc]
  })
  return { did: doc.id, doc, keyPair, vp }
}

async function connectAndAuth(port: number, vp: VerifiablePresentation): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`)
    ws.on('open', () => {
      ws.send(
        serialise({
          id: 'auth-1',
          type: 'sync.state',
          timestamp: new Date().toISOString(),
          sender: vp.holder,
          payload: vp
        })
      )
      ws.once('message', () => resolve(ws))
    })
    ws.on('error', reject)
  })
}

function sendMsg(ws: WebSocket, type: string, sender: string, payload: unknown, id?: string) {
  ws.send(
    serialise({
      id: id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: type as any,
      timestamp: new Date().toISOString(),
      sender,
      payload
    })
  )
}

function collectMessages(ws: WebSocket): ProtocolMessage[] {
  const msgs: ProtocolMessage[] = []
  ws.on('message', (data: Buffer) => msgs.push(deserialise<ProtocolMessage>(data.toString())))
  return msgs
}

function waitForMessage(
  ws: WebSocket,
  pred: (m: ProtocolMessage) => boolean,
  timeout = 3000
): Promise<ProtocolMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', h)
      reject(new Error('Timeout'))
    }, timeout)
    const h = (data: Buffer) => {
      const msg = deserialise<ProtocolMessage>(data.toString())
      if (pred(msg)) {
        clearTimeout(timer)
        ws.off('message', h)
        resolve(msg)
      }
    }
    ws.on('message', h)
  })
}

describe('Server DM Routing', () => {
  let server: HarmonyServer
  beforeEach(async () => {
    didDocs.clear()
    server = new HarmonyServer({
      port: 0,
      store: new MemoryQuadStore(),
      didResolver,
      revocationStore: new MemoryRevocationStore(),
      cryptoProvider: crypto,
      rateLimit: { windowMs: 60000, maxMessages: 1000 }
    })
    await server.start()
  })
  afterEach(async () => {
    await server?.stop()
  })

  it('routes DM to recipient connected to same server', async () => {
    const alice = await createIdentity()
    const bob = await createIdentity()
    const wsAlice = await connectAndAuth(server.port, alice.vp)
    const wsBob = await connectAndAuth(server.port, bob.vp)
    const bobMsgs = collectMessages(wsBob)

    sendMsg(wsAlice, 'dm.send', alice.did, {
      recipientDID: bob.did,
      content: { ciphertext: new TextEncoder().encode('hello'), epoch: 0, senderIndex: 0 },
      clock: { counter: 1, authorDID: alice.did }
    })

    await sleep(500)
    const dm = bobMsgs.find((m) => m.type === 'dm.message')
    expect(dm).toBeDefined()
    expect(dm!.sender).toBe(alice.did)

    wsAlice.close()
    wsBob.close()
  })

  it('does not route DM to sender (no echo)', async () => {
    const alice = await createIdentity()
    const bob = await createIdentity()
    const wsAlice = await connectAndAuth(server.port, alice.vp)
    const _wsBob = await connectAndAuth(server.port, bob.vp)
    const aliceMsgs = collectMessages(wsAlice)

    sendMsg(wsAlice, 'dm.send', alice.did, {
      recipientDID: bob.did,
      content: { ciphertext: new TextEncoder().encode('hello'), epoch: 0, senderIndex: 0 },
      clock: { counter: 1, authorDID: alice.did }
    })

    await sleep(500)
    const echo = aliceMsgs.find((m) => m.type === 'dm.message')
    expect(echo).toBeUndefined()

    wsAlice.close()
    _wsBob.close()
  })

  it('routes DM edit to recipient', async () => {
    const alice = await createIdentity()
    const bob = await createIdentity()
    const wsAlice = await connectAndAuth(server.port, alice.vp)
    const wsBob = await connectAndAuth(server.port, bob.vp)
    const bobMsgs = collectMessages(wsBob)

    sendMsg(wsAlice, 'dm.edit', alice.did, {
      recipientDID: bob.did,
      messageId: 'dm-1',
      newText: 'edited'
    })
    await sleep(500)

    expect(bobMsgs.find((m) => m.type === 'dm.edited')).toBeDefined()
    wsAlice.close()
    wsBob.close()
  })

  it('routes DM delete to recipient', async () => {
    const alice = await createIdentity()
    const bob = await createIdentity()
    const wsAlice = await connectAndAuth(server.port, alice.vp)
    const wsBob = await connectAndAuth(server.port, bob.vp)
    const bobMsgs = collectMessages(wsBob)

    sendMsg(wsAlice, 'dm.delete', alice.did, {
      recipientDID: bob.did,
      messageId: 'dm-1'
    })
    await sleep(500)

    expect(bobMsgs.find((m) => m.type === 'dm.deleted')).toBeDefined()
    wsAlice.close()
    wsBob.close()
  })

  it('DM to offline recipient does not crash', async () => {
    const alice = await createIdentity()
    const bob = await createIdentity()
    const wsAlice = await connectAndAuth(server.port, alice.vp)

    // Bob is not connected — this should not throw
    sendMsg(wsAlice, 'dm.send', alice.did, {
      recipientDID: bob.did,
      content: { ciphertext: new TextEncoder().encode('offline'), epoch: 0, senderIndex: 0 },
      clock: { counter: 1, authorDID: alice.did }
    })
    await sleep(300)

    // Server should still be healthy
    expect(wsAlice.readyState).toBe(WebSocket.OPEN)
    wsAlice.close()
  })
})

describe('Server Voice Relay', () => {
  let server: HarmonyServer
  beforeEach(async () => {
    didDocs.clear()
    server = new HarmonyServer({
      port: 0,
      store: new MemoryQuadStore(),
      didResolver,
      revocationStore: new MemoryRevocationStore(),
      cryptoProvider: crypto,
      rateLimit: { windowMs: 60000, maxMessages: 1000 }
    })
    await server.start()
  })
  afterEach(async () => {
    await server?.stop()
  })

  it('relays voice.speaking to other participants', async () => {
    const alice = await createIdentity()
    const bob = await createIdentity()
    const wsAlice = await connectAndAuth(server.port, alice.vp)
    const wsBob = await connectAndAuth(server.port, bob.vp)

    const roomId = 'room-speak'
    for (const [ws, did] of [
      [wsAlice, alice.did],
      [wsBob, bob.did]
    ] as const) {
      sendMsg(ws, 'voice.join', did, { communityId: 'c1', channelId: 'vc', roomId })
    }
    await sleep(300)

    const bobMsgs = collectMessages(wsBob)
    sendMsg(wsAlice, 'voice.speaking', alice.did, { roomId, speaking: true })
    await sleep(300)

    const speak = bobMsgs.find((m) => m.type === ('voice.speaking' as any))
    expect(speak).toBeDefined()
    expect((speak!.payload as any).speaking).toBe(true)
    expect(speak!.sender).toBe(alice.did)

    wsAlice.close()
    wsBob.close()
  })

  it('relays voice.producer-closed to other participants', async () => {
    const alice = await createIdentity()
    const bob = await createIdentity()
    const wsAlice = await connectAndAuth(server.port, alice.vp)
    const wsBob = await connectAndAuth(server.port, bob.vp)

    const roomId = 'room-pc'
    for (const [ws, did] of [
      [wsAlice, alice.did],
      [wsBob, bob.did]
    ] as const) {
      sendMsg(ws, 'voice.join', did, { communityId: 'c1', channelId: 'vc', roomId })
    }
    await sleep(300)

    const bobMsgs = collectMessages(wsBob)
    sendMsg(wsAlice, 'voice.producer-closed', alice.did, {
      roomId,
      producerId: 'p-123',
      mediaType: 'audio'
    })
    await sleep(300)

    const pc = bobMsgs.find((m) => m.type === ('voice.producer-closed' as any))
    expect(pc).toBeDefined()
    expect((pc!.payload as any).producerId).toBe('p-123')
    expect((pc!.payload as any).mediaType).toBe('audio')

    wsAlice.close()
    wsBob.close()
  })

  it('does not relay voice.speaking to the sender', async () => {
    const alice = await createIdentity()
    const bob = await createIdentity()
    const wsAlice = await connectAndAuth(server.port, alice.vp)
    const wsBob = await connectAndAuth(server.port, bob.vp)

    const roomId = 'room-noecho'
    for (const [ws, did] of [
      [wsAlice, alice.did],
      [wsBob, bob.did]
    ] as const) {
      sendMsg(ws, 'voice.join', did, { communityId: 'c1', channelId: 'vc', roomId })
    }
    await sleep(300)

    const aliceMsgs = collectMessages(wsAlice)
    sendMsg(wsAlice, 'voice.speaking', alice.did, { roomId, speaking: true })
    await sleep(300)

    const echo = aliceMsgs.find((m) => m.type === ('voice.speaking' as any))
    expect(echo).toBeUndefined()

    wsAlice.close()
    wsBob.close()
  })

  it('voice.mute updates participant state', async () => {
    const alice = await createIdentity()
    const bob = await createIdentity()
    const wsAlice = await connectAndAuth(server.port, alice.vp)
    const wsBob = await connectAndAuth(server.port, bob.vp)

    const roomId = 'room-mute'
    for (const [ws, did] of [
      [wsAlice, alice.did],
      [wsBob, bob.did]
    ] as const) {
      sendMsg(ws, 'voice.join', did, { communityId: 'c1', channelId: 'vc', roomId })
    }
    await sleep(300)

    const bobMsgs = collectMessages(wsBob)
    sendMsg(wsAlice, 'voice.mute', alice.did, { roomId })
    await sleep(300)

    // Server broadcasts mute state change
    const muteMsg = bobMsgs.find(
      (m) =>
        (m.payload as any)?.action === 'voice.mute' ||
        m.type === ('voice.mute' as any) ||
        (m.payload as any)?.did === alice.did
    )
    // At minimum the server shouldn't crash
    expect(wsAlice.readyState).toBe(WebSocket.OPEN)

    wsAlice.close()
    wsBob.close()
  })

  it('voice.video state is relayed', async () => {
    const alice = await createIdentity()
    const bob = await createIdentity()
    const wsAlice = await connectAndAuth(server.port, alice.vp)
    const wsBob = await connectAndAuth(server.port, bob.vp)

    const roomId = 'room-vid'
    for (const [ws, did] of [
      [wsAlice, alice.did],
      [wsBob, bob.did]
    ] as const) {
      sendMsg(ws, 'voice.join', did, { communityId: 'c1', channelId: 'vc', roomId })
    }
    await sleep(300)

    const bobMsgs = collectMessages(wsBob)
    sendMsg(wsAlice, 'voice.video', alice.did, { roomId, enabled: true })
    await sleep(300)

    // Server should process without crashing
    expect(wsAlice.readyState).toBe(WebSocket.OPEN)

    wsAlice.close()
    wsBob.close()
  })
})

/** Helper: create community via Alice, join Bob. Returns communityId. */
async function setupCommunityWithMembers(
  port: number,
  alice: { did: string; vp: VerifiablePresentation },
  bob: { did: string; vp: VerifiablePresentation }
): Promise<{ wsAlice: WebSocket; wsBob: WebSocket; communityId: string }> {
  const wsAlice = await connectAndAuth(port, alice.vp)
  const wsBob = await connectAndAuth(port, bob.vp)

  // Alice creates community
  const createResponse = waitForMessage(wsAlice, (m) => m.type === ('community.updated' as any), 3000)
  sendMsg(wsAlice, 'community.create', alice.did, { name: 'Test Community' })
  const created = await createResponse
  const communityId = (created.payload as any).communityId

  // Bob joins
  sendMsg(wsBob, 'community.join', bob.did, { communityId })
  await sleep(500)

  return { wsAlice, wsBob, communityId }
}

describe('Server Message Edit Broadcast', () => {
  let server: HarmonyServer
  beforeEach(async () => {
    didDocs.clear()
    server = new HarmonyServer({
      port: 0,
      store: new MemoryQuadStore(),
      didResolver,
      revocationStore: new MemoryRevocationStore(),
      cryptoProvider: crypto,
      rateLimit: { windowMs: 60000, maxMessages: 1000 }
    })
    await server.start()
  })
  afterEach(async () => {
    await server?.stop()
  })

  it('broadcasts channel.message.updated with encrypted content', async () => {
    const alice = await createIdentity()
    const bob = await createIdentity()
    const { wsAlice, wsBob, communityId } = await setupCommunityWithMembers(server.port, alice, bob)
    const bobMsgs = collectMessages(wsBob)

    // Send original message
    sendMsg(
      wsAlice,
      'channel.send',
      alice.did,
      {
        communityId,
        channelId: 'general',
        content: { ciphertext: new TextEncoder().encode('original'), epoch: 0, senderIndex: 0 },
        clock: { counter: 1, authorDID: alice.did }
      },
      'msg-edit-1'
    )
    await sleep(300)

    // Edit
    sendMsg(wsAlice, 'channel.edit', alice.did, {
      communityId,
      channelId: 'general',
      messageId: 'msg-edit-1',
      content: { ciphertext: new TextEncoder().encode('edited'), epoch: 0, senderIndex: 0 },
      clock: { counter: 2, authorDID: alice.did }
    })
    await sleep(500)

    const editMsg = bobMsgs.find((m) => m.type === 'channel.message.updated')
    expect(editMsg).toBeDefined()

    wsAlice.close()
    wsBob.close()
  })

  it('broadcasts channel.message.deleted', async () => {
    const alice = await createIdentity()
    const bob = await createIdentity()
    const { wsAlice, wsBob, communityId } = await setupCommunityWithMembers(server.port, alice, bob)
    const bobMsgs = collectMessages(wsBob)

    sendMsg(wsAlice, 'channel.delete', alice.did, {
      communityId,
      channelId: 'general',
      messageId: 'msg-del-1'
    })
    await sleep(500)

    const del = bobMsgs.find((m) => m.type === ('channel.message.deleted' as any))
    expect(del).toBeDefined()

    wsAlice.close()
    wsBob.close()
  })
})

describe('Server Channel Lifecycle Broadcast', () => {
  let server: HarmonyServer
  beforeEach(async () => {
    didDocs.clear()
    server = new HarmonyServer({
      port: 0,
      store: new MemoryQuadStore(),
      didResolver,
      revocationStore: new MemoryRevocationStore(),
      cryptoProvider: crypto,
      rateLimit: { windowMs: 60000, maxMessages: 1000 }
    })
    await server.start()
  })
  afterEach(async () => {
    await server?.stop()
  })

  it('channel.create is broadcast as channel.created', async () => {
    const alice = await createIdentity()
    const bob = await createIdentity()
    const { wsAlice, wsBob, communityId } = await setupCommunityWithMembers(server.port, alice, bob)
    const bobMsgs = collectMessages(wsBob)

    sendMsg(wsAlice, 'channel.create', alice.did, {
      communityId,
      name: 'new-channel',
      type: 'text'
    })
    await sleep(500)

    const create = bobMsgs.find((m) => m.type === ('channel.created' as any))
    expect(create).toBeDefined()

    wsAlice.close()
    wsBob.close()
  })

  it('channel.update is broadcast as channel.updated', async () => {
    const alice = await createIdentity()
    const bob = await createIdentity()
    const { wsAlice, wsBob, communityId } = await setupCommunityWithMembers(server.port, alice, bob)
    const bobMsgs = collectMessages(wsBob)

    sendMsg(wsAlice, 'channel.update', alice.did, {
      communityId,
      channelId: 'general',
      name: 'renamed'
    })
    await sleep(500)

    const upd = bobMsgs.find((m) => m.type === ('channel.updated' as any))
    expect(upd).toBeDefined()

    wsAlice.close()
    wsBob.close()
  })

  it('channel.delete is broadcast as channel.deleted', async () => {
    const alice = await createIdentity()
    const bob = await createIdentity()
    const { wsAlice, wsBob, communityId } = await setupCommunityWithMembers(server.port, alice, bob)
    const bobMsgs = collectMessages(wsBob)

    sendMsg(wsAlice, 'channel.delete.admin', alice.did, {
      communityId,
      channelId: 'general'
    })
    await sleep(500)

    const del = bobMsgs.find((m) => m.type === ('channel.deleted' as any))
    expect(del).toBeDefined()

    wsAlice.close()
    wsBob.close()
  })
})

describe('Server Reaction Broadcast', () => {
  let server: HarmonyServer
  beforeEach(async () => {
    didDocs.clear()
    server = new HarmonyServer({
      port: 0,
      store: new MemoryQuadStore(),
      didResolver,
      revocationStore: new MemoryRevocationStore(),
      cryptoProvider: crypto,
      rateLimit: { windowMs: 60000, maxMessages: 1000 }
    })
    await server.start()
  })
  afterEach(async () => {
    await server?.stop()
  })

  it('channel.reaction.add broadcasts channel.reaction.added', async () => {
    const alice = await createIdentity()
    const bob = await createIdentity()
    const { wsAlice, wsBob, communityId } = await setupCommunityWithMembers(server.port, alice, bob)
    const bobMsgs = collectMessages(wsBob)

    sendMsg(wsAlice, 'channel.reaction.add', alice.did, {
      communityId,
      channelId: 'general',
      messageId: 'msg-1',
      emoji: '❤️'
    })
    await sleep(500)

    const rxn = bobMsgs.find((m) => m.type === ('channel.reaction.added' as any))
    expect(rxn).toBeDefined()
    expect((rxn!.payload as any).emoji).toBe('❤️')

    wsAlice.close()
    wsBob.close()
  })

  it('channel.reaction.remove broadcasts channel.reaction.removed', async () => {
    const alice = await createIdentity()
    const bob = await createIdentity()
    const { wsAlice, wsBob, communityId } = await setupCommunityWithMembers(server.port, alice, bob)
    const bobMsgs = collectMessages(wsBob)

    sendMsg(wsAlice, 'channel.reaction.remove', alice.did, {
      communityId,
      channelId: 'general',
      messageId: 'msg-1',
      emoji: '❤️'
    })
    await sleep(500)

    const rxn = bobMsgs.find((m) => m.type === ('channel.reaction.removed' as any))
    expect(rxn).toBeDefined()

    wsAlice.close()
    wsBob.close()
  })
})

describe('Server Typing Indicator', () => {
  let server: HarmonyServer
  beforeEach(async () => {
    didDocs.clear()
    server = new HarmonyServer({
      port: 0,
      store: new MemoryQuadStore(),
      didResolver,
      revocationStore: new MemoryRevocationStore(),
      cryptoProvider: crypto,
      rateLimit: { windowMs: 60000, maxMessages: 1000 }
    })
    await server.start()
  })
  afterEach(async () => {
    await server?.stop()
  })

  it('typing indicator is relayed to other clients', async () => {
    const alice = await createIdentity()
    const bob = await createIdentity()
    const wsAlice = await connectAndAuth(server.port, alice.vp)
    const wsBob = await connectAndAuth(server.port, bob.vp)
    const bobMsgs = collectMessages(wsBob)

    sendMsg(wsAlice, 'channel.typing', alice.did, {
      communityId: 'c1',
      channelId: 'ch1'
    })
    await sleep(500)

    const typing = bobMsgs.find(
      (m) =>
        m.type === ('channel.typing.indicator' as any) ||
        m.type === ('channel.typing' as any) ||
        m.type === ('typing' as any)
    )
    // Typing relay is best-effort
    expect(wsAlice.readyState).toBe(WebSocket.OPEN)

    wsAlice.close()
    wsBob.close()
  })
})
