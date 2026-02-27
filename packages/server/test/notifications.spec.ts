import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { WebSocket } from 'ws'
import { MemoryQuadStore } from '@harmony/quads'
import { createCryptoProvider } from '@harmony/crypto'
import type { KeyPair } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import type { DIDDocument } from '@harmony/did'
import { VCService, MemoryRevocationStore } from '@harmony/vc'
import type { VerifiablePresentation, VerifiableCredential } from '@harmony/vc'
import type { ProtocolMessage, LamportClock, Notification } from '@harmony/protocol'
import { serialise, deserialise } from '@harmony/protocol'
import { HarmonyServer, CommunityManager, MessageStore } from '../src/index.js'

const crypto = createCryptoProvider()
const didProvider = new DIDKeyProvider(crypto)
const vcService = new VCService(crypto)

let server: HarmonyServer
let store: MemoryQuadStore
let revocationStore: MemoryRevocationStore
const PORT = 0

const didDocs: Map<string, DIDDocument> = new Map()
const didResolver = async (did: string): Promise<DIDDocument | null> => didDocs.get(did) ?? null

async function createIdentity(): Promise<{
  did: string
  doc: DIDDocument
  keyPair: KeyPair
  encKP: KeyPair
  vp: VerifiablePresentation
  memberVC: VerifiableCredential
}> {
  const keyPair = await crypto.generateSigningKeyPair()
  const encKP = await crypto.generateEncryptionKeyPair()
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

  return { did: doc.id, doc, keyPair, encKP, vp, memberVC }
}

async function connectAndAuth(vp: VerifiablePresentation): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`)
  await new Promise<void>((resolve, reject) => {
    ws.on('open', resolve)
    ws.on('error', reject)
  })

  const authMsg: ProtocolMessage = {
    id: 'auth-1',
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

describe('Notifications', () => {
  beforeEach(async () => {
    store = new MemoryQuadStore()
    revocationStore = new MemoryRevocationStore()
    didDocs.clear()
    server = new HarmonyServer({
      port: PORT,
      store,
      didResolver,
      revocationStore,
      cryptoProvider: crypto,
      rateLimit: { windowMs: 1000, maxMessages: 100 }
    })
    await server.start()
  })

  afterEach(async () => {
    await server?.stop()
  })

  describe('parseMentions', () => {
    it('should parse @username mentions', () => {
      const result = HarmonyServer.parseMentions('Hello @alice and @bob')
      expect(result).toEqual(['alice', 'bob'])
    })

    it('should parse @did:key: mentions', () => {
      const result = HarmonyServer.parseMentions('Hey @did:key:z6MkTest123')
      expect(result).toEqual(['did:key:z6MkTest123'])
    })

    it('should return empty array for no mentions', () => {
      const result = HarmonyServer.parseMentions('No mentions here')
      expect(result).toEqual([])
    })
  })

  describe('DM notifications', () => {
    it('should create notification on DM send', async () => {
      const alice = await createIdentity()
      const bob = await createIdentity()

      const aliceWs = await connectAndAuth(alice.vp)
      const bobWs = await connectAndAuth(bob.vp)

      // Alice sends DM to Bob
      const dmMsg: ProtocolMessage = {
        id: `dm-${Date.now()}`,
        type: 'dm.send',
        timestamp: new Date().toISOString(),
        sender: alice.did,
        payload: {
          recipientDID: bob.did,
          content: { ciphertext: new Uint8Array([1, 2, 3]), epoch: 0, senderIndex: 0 },
          nonce: 'test-nonce',
          clock: { counter: 1, authorDID: alice.did }
        }
      }
      aliceWs.send(serialise(dmMsg))

      // Bob should receive the DM message
      const dmReceived = await waitForMessage(bobWs)
      expect(dmReceived.type).toBe('dm.message')

      // Bob should also receive a notification.new
      const notifMsg = await waitForMessage(bobWs)
      expect(notifMsg.type).toBe('notification.new')
      const notif = notifMsg.payload as Notification
      expect(notif.type).toBe('dm')
      expect(notif.fromDID).toBe(alice.did)
      expect(notif.read).toBe(false)

      aliceWs.close()
      bobWs.close()
    })
  })

  describe('Channel mention notifications', () => {
    it('should create notification for mentioned users', async () => {
      const alice = await createIdentity()
      const bob = await createIdentity()

      const aliceWs = await connectAndAuth(alice.vp)
      const bobWs = await connectAndAuth(bob.vp)

      // Create community first
      const communityId = 'test-community'
      const createMsg: ProtocolMessage = {
        id: 'create-1',
        type: 'community.create',
        timestamp: new Date().toISOString(),
        sender: alice.did,
        payload: { name: 'Test', defaultChannels: ['general'] }
      }
      const createResp = await sendAndWait(aliceWs, createMsg)
      const actualCommunityId = (createResp.payload as any)?.communityId ?? communityId

      // Bob joins
      const joinMsg: ProtocolMessage = {
        id: 'join-1',
        type: 'community.join',
        timestamp: new Date().toISOString(),
        sender: bob.did,
        payload: {
          communityId: actualCommunityId,
          membershipVC: bob.memberVC,
          encryptionPublicKey: bob.encKP.publicKey
        }
      }
      bobWs.send(serialise(joinMsg))
      // Wait for join response
      await waitForMessage(bobWs)

      // Drain any extra messages (member.joined broadcasts etc)
      await new Promise((r) => setTimeout(r, 100))
      bobWs.removeAllListeners('message')
      aliceWs.removeAllListeners('message')

      // Alice sends message with mention of Bob
      const channelMsg: ProtocolMessage = {
        id: `ch-${Date.now()}`,
        type: 'channel.send',
        timestamp: new Date().toISOString(),
        sender: alice.did,
        payload: {
          communityId: actualCommunityId,
          channelId: 'general',
          content: {
            ciphertext: new Uint8Array([1, 2, 3]),
            epoch: 0,
            senderIndex: 0,
            mentions: [bob.did]
          },
          nonce: 'test-nonce',
          clock: { counter: 1, authorDID: alice.did }
        }
      }
      aliceWs.send(serialise(channelMsg))

      // Bob should receive channel.message broadcast
      const broadcastMsg = await waitForMessage(bobWs)
      expect(broadcastMsg.type).toBe('channel.message')

      // Bob should also receive notification.new for the mention
      const notifMsg = await waitForMessage(bobWs)
      expect(notifMsg.type).toBe('notification.new')
      const notif = notifMsg.payload as Notification
      expect(notif.type).toBe('mention')
      expect(notif.fromDID).toBe(alice.did)

      aliceWs.close()
      bobWs.close()
    })
  })

  describe('notification.list handler', () => {
    it('should return notifications for the user', async () => {
      const alice = await createIdentity()
      const bob = await createIdentity()

      const aliceWs = await connectAndAuth(alice.vp)
      const bobWs = await connectAndAuth(bob.vp)

      // Alice sends DM to Bob to generate a notification
      aliceWs.send(
        serialise({
          id: `dm-${Date.now()}`,
          type: 'dm.send',
          timestamp: new Date().toISOString(),
          sender: alice.did,
          payload: {
            recipientDID: bob.did,
            content: { ciphertext: new Uint8Array([1]), epoch: 0, senderIndex: 0 },
            nonce: 'n1',
            clock: { counter: 1, authorDID: alice.did }
          }
        })
      )

      // Drain DM message + notification.new
      await waitForMessage(bobWs)
      await waitForMessage(bobWs)

      // Bob requests notification list
      const listResp = await sendAndWait(bobWs, {
        id: 'list-1',
        type: 'notification.list' as any,
        timestamp: new Date().toISOString(),
        sender: bob.did,
        payload: {}
      })

      expect(listResp.type).toBe('notification.list.response')
      const payload = listResp.payload as { notifications: Notification[]; total: number }
      expect(payload.total).toBe(1)
      expect(payload.notifications).toHaveLength(1)
      expect(payload.notifications[0].type).toBe('dm')

      aliceWs.close()
      bobWs.close()
    })
  })

  describe('notification.mark-read handler', () => {
    it('should mark specific notifications as read', async () => {
      const alice = await createIdentity()
      const bob = await createIdentity()

      const aliceWs = await connectAndAuth(alice.vp)
      const bobWs = await connectAndAuth(bob.vp)

      // Generate a notification
      aliceWs.send(
        serialise({
          id: `dm-${Date.now()}`,
          type: 'dm.send',
          timestamp: new Date().toISOString(),
          sender: alice.did,
          payload: {
            recipientDID: bob.did,
            content: { ciphertext: new Uint8Array([1]), epoch: 0, senderIndex: 0 },
            nonce: 'n1',
            clock: { counter: 1, authorDID: alice.did }
          }
        })
      )

      await waitForMessage(bobWs) // dm.message
      const notifNew = await waitForMessage(bobWs) // notification.new
      const notifId = (notifNew.payload as Notification).id

      // Mark it read
      bobWs.send(
        serialise({
          id: 'mark-1',
          type: 'notification.mark-read' as any,
          timestamp: new Date().toISOString(),
          sender: bob.did,
          payload: { notificationIds: [notifId] }
        })
      )

      // Small delay for processing
      await new Promise((r) => setTimeout(r, 50))

      // Check count
      const countResp = await sendAndWait(bobWs, {
        id: 'count-1',
        type: 'notification.count' as any,
        timestamp: new Date().toISOString(),
        sender: bob.did,
        payload: {}
      })

      expect(countResp.type).toBe('notification.count.response')
      expect((countResp.payload as any).unread).toBe(0)

      aliceWs.close()
      bobWs.close()
    })

    it('should mark all as read when notificationIds is empty', async () => {
      const alice = await createIdentity()
      const bob = await createIdentity()

      const aliceWs = await connectAndAuth(alice.vp)
      const bobWs = await connectAndAuth(bob.vp)

      // Generate two notifications
      for (let i = 0; i < 2; i++) {
        aliceWs.send(
          serialise({
            id: `dm-${Date.now()}-${i}`,
            type: 'dm.send',
            timestamp: new Date().toISOString(),
            sender: alice.did,
            payload: {
              recipientDID: bob.did,
              content: { ciphertext: new Uint8Array([1]), epoch: 0, senderIndex: 0 },
              nonce: `n${i}`,
              clock: { counter: i + 1, authorDID: alice.did }
            }
          })
        )
        await waitForMessage(bobWs) // dm.message
        await waitForMessage(bobWs) // notification.new
      }

      // Mark all read
      bobWs.send(
        serialise({
          id: 'mark-all',
          type: 'notification.mark-read' as any,
          timestamp: new Date().toISOString(),
          sender: bob.did,
          payload: { notificationIds: [] }
        })
      )

      await new Promise((r) => setTimeout(r, 50))

      const countResp = await sendAndWait(bobWs, {
        id: 'count-2',
        type: 'notification.count' as any,
        timestamp: new Date().toISOString(),
        sender: bob.did,
        payload: {}
      })

      expect((countResp.payload as any).unread).toBe(0)

      aliceWs.close()
      bobWs.close()
    })
  })

  describe('notification.count handler', () => {
    it('should return unread count and byChannel breakdown', async () => {
      const alice = await createIdentity()
      const bob = await createIdentity()

      const aliceWs = await connectAndAuth(alice.vp)
      const bobWs = await connectAndAuth(bob.vp)

      // DM notification (no channelId)
      aliceWs.send(
        serialise({
          id: `dm-${Date.now()}`,
          type: 'dm.send',
          timestamp: new Date().toISOString(),
          sender: alice.did,
          payload: {
            recipientDID: bob.did,
            content: { ciphertext: new Uint8Array([1]), epoch: 0, senderIndex: 0 },
            nonce: 'n1',
            clock: { counter: 1, authorDID: alice.did }
          }
        })
      )

      await waitForMessage(bobWs)
      await waitForMessage(bobWs)

      const countResp = await sendAndWait(bobWs, {
        id: 'count-1',
        type: 'notification.count' as any,
        timestamp: new Date().toISOString(),
        sender: bob.did,
        payload: {}
      })

      expect(countResp.type).toBe('notification.count.response')
      const payload = countResp.payload as { unread: number; byChannel: Record<string, number> }
      expect(payload.unread).toBe(1)

      aliceWs.close()
      bobWs.close()
    })
  })
})
