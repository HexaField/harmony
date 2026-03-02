/**
 * Voice track registry tests: publish, remove, get-producers,
 * disconnect cleanup, multi-participant, cross-channel isolation.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { WebSocket } from 'ws'
import { MemoryQuadStore } from '@harmony/quads'
import { createCryptoProvider } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import type { DIDDocument } from '@harmony/did'
import { VCService, MemoryRevocationStore } from '@harmony/vc'
import type { VerifiablePresentation } from '@harmony/vc'
import type { ProtocolMessage } from '@harmony/protocol'
import { serialise, deserialise } from '@harmony/protocol'
import { HarmonyServer } from '../src/index.js'

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
      type: type as ProtocolMessage['type'],
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
      reject(new Error('Timeout waiting for message'))
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

describe('Voice Track Registry', () => {
  let server: HarmonyServer
  const openSockets: WebSocket[] = []

  beforeEach(async () => {
    didDocs.clear()
    openSockets.length = 0
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
    for (const ws of openSockets) {
      if (ws.readyState === WebSocket.OPEN) ws.close()
    }
    await server?.stop()
  })

  async function connect(vp: VerifiablePresentation): Promise<WebSocket> {
    const ws = await connectAndAuth(server.port, vp)
    openSockets.push(ws)
    return ws
  }

  function joinVoice(ws: WebSocket, did: string, channelId: string) {
    sendMsg(ws, 'voice.join', did, { channelId, communityId: 'c1' })
  }

  function publishTrack(
    ws: WebSocket,
    did: string,
    channelId: string,
    sessionId: string,
    trackName: string,
    kind: string,
    mediaType: string
  ) {
    sendMsg(ws, 'voice.track.published', did, {
      roomId: channelId,
      sessionId,
      trackName,
      kind,
      mediaType
    })
  }

  function removeTrack(ws: WebSocket, did: string, channelId: string, sessionId: string, trackName: string) {
    sendMsg(ws, 'voice.track.removed', did, {
      roomId: channelId,
      sessionId,
      trackName
    })
  }

  it('broadcasts voice.track.published to other participants', async () => {
    const alice = await createIdentity()
    const bob = await createIdentity()
    const wsAlice = await connect(alice.vp)
    const wsBob = await connect(bob.vp)

    const ch = 'vc-1'
    joinVoice(wsAlice, alice.did, ch)
    joinVoice(wsBob, bob.did, ch)
    await sleep(100)

    const bobPub = waitForMessage(wsBob, (m) => m.type === ('voice.track.published' as ProtocolMessage['type']))
    publishTrack(wsAlice, alice.did, ch, 'alice-session', 'audio', 'audio', 'audio')
    const msg = await bobPub

    const p = msg.payload as Record<string, unknown>
    expect(p.trackName).toBe('audio')
    expect(p.kind).toBe('audio')
    expect(p.mediaType).toBe('audio')
    expect(p.participantId).toBe(alice.did)
    expect(msg.sender).toBe(alice.did)
  })

  it('broadcasts voice.track.removed to other participants', async () => {
    const alice = await createIdentity()
    const bob = await createIdentity()
    const wsAlice = await connect(alice.vp)
    const wsBob = await connect(bob.vp)

    const ch = 'vc-2'
    joinVoice(wsAlice, alice.did, ch)
    joinVoice(wsBob, bob.did, ch)
    await sleep(100)

    publishTrack(wsAlice, alice.did, ch, 'alice-session', 'audio', 'audio', 'audio')
    await sleep(100)

    const bobRem = waitForMessage(wsBob, (m) => m.type === ('voice.track.removed' as ProtocolMessage['type']))
    removeTrack(wsAlice, alice.did, ch, 'alice-session', 'audio')
    const msg = await bobRem

    const p = msg.payload as Record<string, unknown>
    expect(p.trackName).toBe('audio')
    expect(p.participantId).toBe(alice.did)
  })

  it('late joiner gets existing tracks via voice.get-producers', async () => {
    const alice = await createIdentity()
    const bob = await createIdentity()
    const wsAlice = await connect(alice.vp)

    const ch = 'vc-3'
    joinVoice(wsAlice, alice.did, ch)
    await sleep(50)

    publishTrack(wsAlice, alice.did, ch, 'alice-session', 'audio', 'audio', 'audio')
    publishTrack(wsAlice, alice.did, ch, 'alice-session', 'video', 'video', 'video')
    await sleep(100)

    const wsBob = await connect(bob.vp)
    joinVoice(wsBob, bob.did, ch)
    await sleep(100)

    const resp = waitForMessage(wsBob, (m) => m.type === ('voice.get-producers.response' as ProtocolMessage['type']))
    sendMsg(wsBob, 'voice.get-producers', bob.did, {})
    const msg = await resp

    const producers = (msg.payload as Record<string, unknown>).producers as Array<Record<string, unknown>>
    expect(producers).toHaveLength(2)
    const trackNames = producers.map((p) => p.trackName).sort()
    expect(trackNames).toEqual(['audio', 'video'])
    expect(producers[0].participantId).toBe(alice.did)
  })

  it('cleans up tracks on participant disconnect', async () => {
    const alice = await createIdentity()
    const bob = await createIdentity()
    const wsAlice = await connect(alice.vp)
    const wsBob = await connect(bob.vp)

    const ch = 'vc-4'
    joinVoice(wsAlice, alice.did, ch)
    joinVoice(wsBob, bob.did, ch)
    await sleep(100)

    publishTrack(wsAlice, alice.did, ch, 'alice-session', 'audio', 'audio', 'audio')
    await sleep(100)

    // Disconnect Alice
    wsAlice.close()
    await sleep(300)

    const resp = waitForMessage(wsBob, (m) => m.type === ('voice.get-producers.response' as ProtocolMessage['type']))
    sendMsg(wsBob, 'voice.get-producers', bob.did, {})
    const msg = await resp

    const producers = (msg.payload as Record<string, unknown>).producers as Array<Record<string, unknown>>
    expect(producers).toHaveLength(0)
  })

  it('3-participant: broadcast to all, respects voice.leave', async () => {
    const alice = await createIdentity()
    const bob = await createIdentity()
    const charlie = await createIdentity()
    const wsAlice = await connect(alice.vp)
    const wsBob = await connect(bob.vp)
    const wsCharlie = await connect(charlie.vp)

    const ch = 'vc-5'
    joinVoice(wsAlice, alice.did, ch)
    joinVoice(wsBob, bob.did, ch)
    joinVoice(wsCharlie, charlie.did, ch)
    await sleep(100)

    const bobMsgs = collectMessages(wsBob)
    const charlieMsgs = collectMessages(wsCharlie)

    publishTrack(wsAlice, alice.did, ch, 'alice-session', 'video', 'video', 'video')
    await sleep(200)

    expect(bobMsgs.find((m) => m.type === ('voice.track.published' as ProtocolMessage['type']))).toBeDefined()
    expect(charlieMsgs.find((m) => m.type === ('voice.track.published' as ProtocolMessage['type']))).toBeDefined()

    // Charlie leaves
    sendMsg(wsCharlie, 'voice.leave', charlie.did, { channelId: ch })
    await sleep(100)

    // Clear collected messages
    bobMsgs.length = 0
    charlieMsgs.length = 0

    publishTrack(wsAlice, alice.did, ch, 'alice-session', 'screen', 'video', 'screen')
    await sleep(200)

    expect(
      bobMsgs.find(
        (m) =>
          m.type === ('voice.track.published' as ProtocolMessage['type']) &&
          (m.payload as Record<string, unknown>).trackName === 'screen'
      )
    ).toBeDefined()

    // Charlie should NOT receive it
    expect(
      charlieMsgs.find(
        (m) =>
          m.type === ('voice.track.published' as ProtocolMessage['type']) &&
          (m.payload as Record<string, unknown>).trackName === 'screen'
      )
    ).toBeUndefined()
  })

  it('multiple tracks per participant returned by get-producers', async () => {
    const alice = await createIdentity()
    const bob = await createIdentity()
    const wsAlice = await connect(alice.vp)
    const wsBob = await connect(bob.vp)

    const ch = 'vc-6'
    joinVoice(wsAlice, alice.did, ch)
    joinVoice(wsBob, bob.did, ch)
    await sleep(100)

    publishTrack(wsAlice, alice.did, ch, 'alice-session', 'audio', 'audio', 'audio')
    publishTrack(wsAlice, alice.did, ch, 'alice-session', 'video', 'video', 'video')
    publishTrack(wsAlice, alice.did, ch, 'alice-session', 'screen', 'video', 'screen')
    await sleep(150)

    const resp = waitForMessage(wsBob, (m) => m.type === ('voice.get-producers.response' as ProtocolMessage['type']))
    sendMsg(wsBob, 'voice.get-producers', bob.did, {})
    const msg = await resp

    const producers = (msg.payload as Record<string, unknown>).producers as Array<Record<string, unknown>>
    expect(producers).toHaveLength(3)
    const trackNames = producers.map((p) => p.trackName).sort()
    expect(trackNames).toEqual(['audio', 'screen', 'video'])
  })

  it('cross-channel isolation: participants in different channels see no producers', async () => {
    const alice = await createIdentity()
    const bob = await createIdentity()
    const wsAlice = await connect(alice.vp)
    const wsBob = await connect(bob.vp)

    joinVoice(wsAlice, alice.did, 'channel-1')
    joinVoice(wsBob, bob.did, 'channel-2')
    await sleep(100)

    publishTrack(wsAlice, alice.did, 'channel-1', 'alice-session', 'audio', 'audio', 'audio')
    publishTrack(wsBob, bob.did, 'channel-2', 'bob-session', 'audio', 'audio', 'audio')
    await sleep(150)

    // Alice asks for producers — should get none (Bob is in different channel)
    const aliceResp = waitForMessage(
      wsAlice,
      (m) => m.type === ('voice.get-producers.response' as ProtocolMessage['type'])
    )
    sendMsg(wsAlice, 'voice.get-producers', alice.did, {})
    const aliceMsg = await aliceResp
    const aliceProducers = (aliceMsg.payload as Record<string, unknown>).producers as Array<Record<string, unknown>>
    expect(aliceProducers).toHaveLength(0)

    // Bob asks for producers — should also get none
    const bobResp = waitForMessage(wsBob, (m) => m.type === ('voice.get-producers.response' as ProtocolMessage['type']))
    sendMsg(wsBob, 'voice.get-producers', bob.did, {})
    const bobMsg = await bobResp
    const bobProducers = (bobMsg.payload as Record<string, unknown>).producers as Array<Record<string, unknown>>
    expect(bobProducers).toHaveLength(0)
  })
})
