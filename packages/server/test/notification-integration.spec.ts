import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { WebSocket } from 'ws'
import { MemoryQuadStore } from '@harmony/quads'
import { createCryptoProvider } from '@harmony/crypto'
import type { KeyPair } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import type { DIDDocument } from '@harmony/did'
import { VCService, MemoryRevocationStore } from '@harmony/vc'
import type { VerifiablePresentation, VerifiableCredential } from '@harmony/vc'
import type { ProtocolMessage } from '@harmony/protocol'
import { serialise, deserialise } from '@harmony/protocol'
import { HarmonyServer } from '../src/index.js'

const crypto = createCryptoProvider()
const didProvider = new DIDKeyProvider(crypto)
const vcService = new VCService(crypto)

let server: HarmonyServer
let store: MemoryQuadStore
let revocationStore: MemoryRevocationStore

const didDocs: Map<string, DIDDocument> = new Map()
const didResolver = async (did: string): Promise<DIDDocument | null> => didDocs.get(did) ?? null

async function createIdentity(): Promise<{
  did: string
  doc: DIDDocument
  keyPair: KeyPair
  vp: VerifiablePresentation
  memberVC: VerifiableCredential
}> {
  const keyPair = await crypto.generateSigningKeyPair()
  const doc = await didProvider.create(keyPair)
  didDocs.set(doc.id, doc)

  const memberVC = await vcService.issue({
    issuerDID: doc.id,
    issuerKeyPair: keyPair,
    subjectDID: doc.id,
    type: 'IdentityCredential',
    claims: { name: 'Test User' }
  })

  const vp = await vcService.present({
    holderDID: doc.id,
    holderKeyPair: keyPair,
    credentials: [memberVC]
  })

  return { did: doc.id, doc, keyPair, vp, memberVC }
}

async function connectAndAuth(vp: VerifiablePresentation): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`)
  await new Promise<void>((resolve, reject) => {
    ws.on('open', resolve)
    ws.on('error', reject)
  })

  const authMsg: ProtocolMessage = {
    id: `auth-${Date.now()}`,
    type: 'sync.state',
    timestamp: new Date().toISOString(),
    sender: vp.holder,
    payload: vp
  }
  ws.send(serialise(authMsg))

  await new Promise<void>((resolve) => {
    ws.once('message', () => resolve())
  })

  return ws
}

function sendAndWait(ws: WebSocket, msg: ProtocolMessage, timeout = 2000): Promise<ProtocolMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for response')), timeout)
    ws.once('message', (data) => {
      clearTimeout(timer)
      resolve(deserialise<ProtocolMessage>(data.toString()))
    })
    ws.send(serialise(msg))
  })
}

function waitForMessage(ws: WebSocket, timeout = 2000): Promise<ProtocolMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout')), timeout)
    ws.once('message', (data) => {
      clearTimeout(timer)
      resolve(deserialise<ProtocolMessage>(data.toString()))
    })
  })
}

/** Collect N messages from a WebSocket (non-destructive listener). */
function collectMessages(ws: WebSocket, count: number, timeout = 3000): Promise<ProtocolMessage[]> {
  return new Promise((resolve, reject) => {
    const msgs: ProtocolMessage[] = []
    const timer = setTimeout(() => reject(new Error(`Timeout: got ${msgs.length}/${count} messages`)), timeout)
    const handler = (data: unknown) => {
      msgs.push(deserialise<ProtocolMessage>(data!.toString()))
      if (msgs.length >= count) {
        clearTimeout(timer)
        ws.off('message', handler)
        resolve(msgs)
      }
    }
    ws.on('message', handler)
  })
}

describe('Notification Integration', () => {
  let alice: Awaited<ReturnType<typeof createIdentity>>
  let bob: Awaited<ReturnType<typeof createIdentity>>
  let aliceWs: WebSocket
  let bobWs: WebSocket
  let communityId: string
  let channelId: string

  beforeEach(async () => {
    store = new MemoryQuadStore()
    revocationStore = new MemoryRevocationStore()
    didDocs.clear()
    server = new HarmonyServer({
      port: 0,
      store,
      didResolver,
      revocationStore,
      cryptoProvider: crypto,
      rateLimit: { windowMs: 1000, maxMessages: 100 }
    })
    await server.start()

    // Create two identities
    alice = await createIdentity()
    bob = await createIdentity()

    // Connect both
    aliceWs = await connectAndAuth(alice.vp)
    bobWs = await connectAndAuth(bob.vp)

    // Alice creates a community
    const createResp = await sendAndWait(aliceWs, {
      id: 'cc-notif',
      type: 'community.create',
      timestamp: new Date().toISOString(),
      sender: alice.did,
      payload: { name: 'Notification Test', defaultChannels: ['general', 'random'] }
    })
    const cp = createResp.payload as { communityId: string; channels: { id: string; name: string }[] }
    communityId = cp.communityId
    channelId = cp.channels[0].id

    // Bob joins
    const joinResp = await sendAndWait(bobWs, {
      id: 'join-notif',
      type: 'community.join',
      timestamp: new Date().toISOString(),
      sender: bob.did,
      payload: { communityId, membershipVC: bob.memberVC }
    })

    // Drain the member.joined broadcast on alice
    await waitForMessage(aliceWs).catch(() => {})
  })

  afterEach(async () => {
    aliceWs?.close()
    bobWs?.close()
    await server?.stop()
  })

  it('should create notification on @mention', async () => {
    // Alice sends a message mentioning bob
    aliceWs.send(
      serialise({
        id: 'mention-msg-1',
        type: 'channel.send',
        timestamp: new Date().toISOString(),
        sender: alice.did,
        payload: {
          communityId,
          channelId,
          content: { mentions: [bob.did], ciphertext: new Uint8Array([1]), epoch: 0, senderIndex: 0 },
          nonce: 'n1',
          clock: { counter: 1, authorDID: alice.did }
        }
      })
    )

    // Bob receives the channel.message broadcast + notification.new
    // Drain channel.message first
    await new Promise((r) => setTimeout(r, 300))

    // Bob requests notification list
    const listResp = await sendAndWait(bobWs, {
      id: 'notif-list-1',
      type: 'notification.list',
      timestamp: new Date().toISOString(),
      sender: bob.did,
      payload: {}
    })

    const payload = listResp.payload as { notifications: any[]; total: number }
    expect(payload.total).toBe(1)
    expect(payload.notifications[0].type).toBe('mention')
    expect(payload.notifications[0].fromDID).toBe(alice.did)
    expect(payload.notifications[0].communityId).toBe(communityId)
    expect(payload.notifications[0].channelId).toBe(channelId)
  })

  it('should create notification on DM', async () => {
    // Alice sends a DM to bob
    aliceWs.send(
      serialise({
        id: 'dm-notif-1',
        type: 'dm.send',
        timestamp: new Date().toISOString(),
        sender: alice.did,
        payload: {
          recipientDID: bob.did,
          content: { ciphertext: new Uint8Array([1, 2, 3]), epoch: 0, senderIndex: 0 },
          nonce: 'dm-n1',
          clock: { counter: 1, authorDID: alice.did }
        }
      })
    )

    // Wait for processing
    await new Promise((r) => setTimeout(r, 300))

    // Bob requests notification list
    const listResp = await sendAndWait(bobWs, {
      id: 'notif-list-dm',
      type: 'notification.list',
      timestamp: new Date().toISOString(),
      sender: bob.did,
      payload: {}
    })

    const payload = listResp.payload as { notifications: any[]; total: number }
    expect(payload.total).toBe(1)
    expect(payload.notifications[0].type).toBe('dm')
    expect(payload.notifications[0].fromDID).toBe(alice.did)
  })

  it('should mark single notification as read', async () => {
    // Create a mention notification for bob
    aliceWs.send(
      serialise({
        id: 'mark-read-msg-1',
        type: 'channel.send',
        timestamp: new Date().toISOString(),
        sender: alice.did,
        payload: {
          communityId,
          channelId,
          content: { mentions: [bob.did], ciphertext: new Uint8Array([1]), epoch: 0, senderIndex: 0 },
          nonce: 'mr1',
          clock: { counter: 1, authorDID: alice.did }
        }
      })
    )

    await new Promise((r) => setTimeout(r, 300))

    // Get the notification ID
    const listResp = await sendAndWait(bobWs, {
      id: 'notif-list-mr',
      type: 'notification.list',
      timestamp: new Date().toISOString(),
      sender: bob.did,
      payload: {}
    })
    const notifId = (listResp.payload as any).notifications[0].id

    // Mark it read
    bobWs.send(
      serialise({
        id: 'mark-read-1',
        type: 'notification.mark-read',
        timestamp: new Date().toISOString(),
        sender: bob.did,
        payload: { notificationIds: [notifId] }
      })
    )
    await new Promise((r) => setTimeout(r, 100))

    // Verify unread count is 0
    const countResp = await sendAndWait(bobWs, {
      id: 'notif-count-mr',
      type: 'notification.count',
      timestamp: new Date().toISOString(),
      sender: bob.did,
      payload: {}
    })

    const countPayload = countResp.payload as { unread: number; byChannel: Record<string, number> }
    expect(countPayload.unread).toBe(0)
  })

  it('should mark all notifications as read with empty notificationIds', async () => {
    // Create two mention notifications
    for (let i = 1; i <= 2; i++) {
      aliceWs.send(
        serialise({
          id: `mark-all-msg-${i}`,
          type: 'channel.send',
          timestamp: new Date().toISOString(),
          sender: alice.did,
          payload: {
            communityId,
            channelId,
            content: { mentions: [bob.did], ciphertext: new Uint8Array([i]), epoch: 0, senderIndex: 0 },
            nonce: `ma${i}`,
            clock: { counter: i, authorDID: alice.did }
          }
        })
      )
      await new Promise((r) => setTimeout(r, 50))
    }

    await new Promise((r) => setTimeout(r, 300))

    // Verify we have 2 unread
    const countBefore = await sendAndWait(bobWs, {
      id: 'count-before-ma',
      type: 'notification.count',
      timestamp: new Date().toISOString(),
      sender: bob.did,
      payload: {}
    })
    expect((countBefore.payload as any).unread).toBe(2)

    // Mark all read (empty array)
    bobWs.send(
      serialise({
        id: 'mark-all-read',
        type: 'notification.mark-read',
        timestamp: new Date().toISOString(),
        sender: bob.did,
        payload: { notificationIds: [] }
      })
    )
    await new Promise((r) => setTimeout(r, 100))

    // Verify all read
    const countAfter = await sendAndWait(bobWs, {
      id: 'count-after-ma',
      type: 'notification.count',
      timestamp: new Date().toISOString(),
      sender: bob.did,
      payload: {}
    })
    expect((countAfter.payload as any).unread).toBe(0)
  })

  it('should return correct unread count per channel', async () => {
    const channels = (
      await sendAndWait(aliceWs, {
        id: 'ci-channels',
        type: 'community.info',
        timestamp: new Date().toISOString(),
        sender: alice.did,
        payload: { communityId }
      })
    ).payload as any

    // We have two channels from community creation: general and random
    // Get both channel IDs
    const ch1 = channelId // first channel (general)
    // Create a second channel to get its ID
    const ch2Resp = await sendAndWait(aliceWs, {
      id: 'create-ch2',
      type: 'channel.create',
      timestamp: new Date().toISOString(),
      sender: alice.did,
      payload: { communityId, name: 'extra', type: 'text' }
    })
    // Drain broadcast on bob
    await waitForMessage(bobWs).catch(() => {})
    const ch2 = (ch2Resp.payload as any).id

    // Send mention in ch1
    aliceWs.send(
      serialise({
        id: 'by-ch-msg-1',
        type: 'channel.send',
        timestamp: new Date().toISOString(),
        sender: alice.did,
        payload: {
          communityId,
          channelId: ch1,
          content: { mentions: [bob.did], ciphertext: new Uint8Array([1]), epoch: 0, senderIndex: 0 },
          nonce: 'bc1',
          clock: { counter: 10, authorDID: alice.did }
        }
      })
    )
    await new Promise((r) => setTimeout(r, 100))

    // Send two mentions in ch2
    for (let i = 0; i < 2; i++) {
      aliceWs.send(
        serialise({
          id: `by-ch-msg-2-${i}`,
          type: 'channel.send',
          timestamp: new Date().toISOString(),
          sender: alice.did,
          payload: {
            communityId,
            channelId: ch2,
            content: { mentions: [bob.did], ciphertext: new Uint8Array([i]), epoch: 0, senderIndex: 0 },
            nonce: `bc2-${i}`,
            clock: { counter: 20 + i, authorDID: alice.did }
          }
        })
      )
      await new Promise((r) => setTimeout(r, 50))
    }

    await new Promise((r) => setTimeout(r, 300))

    const countResp = await sendAndWait(bobWs, {
      id: 'count-by-ch',
      type: 'notification.count',
      timestamp: new Date().toISOString(),
      sender: bob.did,
      payload: {}
    })

    const payload = countResp.payload as { unread: number; byChannel: Record<string, number> }
    expect(payload.unread).toBe(3)
    expect(payload.byChannel[ch1]).toBe(1)
    expect(payload.byChannel[ch2]).toBe(2)
  })

  it('should push real-time notification.new to recipient', async () => {
    // Set up listener on bob BEFORE sending the mention
    const bobMessages = collectMessages(bobWs, 2, 3000) // channel.message + notification.new

    aliceWs.send(
      serialise({
        id: 'realtime-msg-1',
        type: 'channel.send',
        timestamp: new Date().toISOString(),
        sender: alice.did,
        payload: {
          communityId,
          channelId,
          content: { mentions: [bob.did], ciphertext: new Uint8Array([1]), epoch: 0, senderIndex: 0 },
          nonce: 'rt1',
          clock: { counter: 1, authorDID: alice.did }
        }
      })
    )

    const msgs = await bobMessages
    const notifMsg = msgs.find((m) => m.type === 'notification.new')
    expect(notifMsg).toBeDefined()
    expect(notifMsg!.sender).toBe('server')
    const notifPayload = notifMsg!.payload as any
    expect(notifPayload.type).toBe('mention')
    expect(notifPayload.fromDID).toBe(alice.did)
    expect(notifPayload.messageId).toBe('realtime-msg-1')
    expect(notifPayload.read).toBe(false)
  })
})
