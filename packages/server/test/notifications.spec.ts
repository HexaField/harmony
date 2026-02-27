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

/** Collect all messages received within a time window */
function collectMessages(ws: WebSocket, durationMs = 500): Promise<ProtocolMessage[]> {
  return new Promise((resolve) => {
    const messages: ProtocolMessage[] = []
    const handler = (data: any) => {
      messages.push(deserialise<ProtocolMessage>(data.toString()))
    }
    ws.on('message', handler)
    setTimeout(() => {
      ws.off('message', handler)
      resolve(messages)
    }, durationMs)
  })
}

function sendAndCollect(ws: WebSocket, msg: ProtocolMessage, durationMs = 500): Promise<ProtocolMessage[]> {
  const p = collectMessages(ws, durationMs)
  ws.send(serialise(msg))
  return p
}

function waitForMessageOfType(ws: WebSocket, type: string, timeout = 3000): Promise<ProtocolMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', handler)
      reject(new Error(`Timeout waiting for ${type}`))
    }, timeout)
    const handler = (data: any) => {
      const msg = deserialise<ProtocolMessage>(data.toString())
      if (msg.type === type) {
        clearTimeout(timer)
        ws.off('message', handler)
        resolve(msg)
      }
    }
    ws.on('message', handler)
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
    it('should create notification on DM send and deliver in real-time', async () => {
      const alice = await createIdentity()
      const bob = await createIdentity()

      const aliceWs = await connectAndAuth(alice.vp)
      const bobWs = await connectAndAuth(bob.vp)

      // Alice sends DM to Bob — collect all messages Bob receives
      const bobMessages = collectMessages(bobWs, 300)

      aliceWs.send(
        serialise({
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
        })
      )

      const received = await bobMessages
      const types = received.map((m) => m.type)
      expect(types).toContain('dm.message')
      expect(types).toContain('notification.new')

      const notif = received.find((m) => m.type === 'notification.new')!.payload as Notification
      expect(notif.type).toBe('dm')
      expect(notif.fromDID).toBe(alice.did)
      expect(notif.read).toBe(false)

      aliceWs.close()
      bobWs.close()
    })
  })

  describe('notification.list, mark-read, and count', () => {
    it('should list, mark-read, and count notifications', async () => {
      const alice = await createIdentity()
      const bob = await createIdentity()

      const aliceWs = await connectAndAuth(alice.vp)
      const bobWs = await connectAndAuth(bob.vp)

      // Generate 2 DM notifications
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
        await new Promise((r) => setTimeout(r, 50))
      }

      // Wait for all messages to arrive
      await collectMessages(bobWs, 500)

      // Request notification list
      const listPromise = waitForMessageOfType(bobWs, 'notification.list.response')
      bobWs.send(
        serialise({
          id: 'list-1',
          type: 'notification.list' as any,
          timestamp: new Date().toISOString(),
          sender: bob.did,
          payload: {}
        })
      )
      const listResp = await listPromise
      const listPayload = listResp.payload as { notifications: Notification[]; total: number }
      expect(listPayload.total).toBe(2)
      expect(listPayload.notifications).toHaveLength(2)

      // Get count
      const countPromise = waitForMessageOfType(bobWs, 'notification.count.response')
      bobWs.send(
        serialise({
          id: 'count-1',
          type: 'notification.count' as any,
          timestamp: new Date().toISOString(),
          sender: bob.did,
          payload: {}
        })
      )
      const countResp = await countPromise
      expect((countResp.payload as any).unread).toBe(2)

      // Mark one as read
      const notifId = listPayload.notifications[0].id
      bobWs.send(
        serialise({
          id: 'mark-1',
          type: 'notification.mark-read' as any,
          timestamp: new Date().toISOString(),
          sender: bob.did,
          payload: { notificationIds: [notifId] }
        })
      )
      await new Promise((r) => setTimeout(r, 100))

      // Check count again
      const count2Promise = waitForMessageOfType(bobWs, 'notification.count.response')
      bobWs.send(
        serialise({
          id: 'count-2',
          type: 'notification.count' as any,
          timestamp: new Date().toISOString(),
          sender: bob.did,
          payload: {}
        })
      )
      const count2Resp = await count2Promise
      expect((count2Resp.payload as any).unread).toBe(1)

      // Mark all as read
      bobWs.send(
        serialise({
          id: 'mark-all',
          type: 'notification.mark-read' as any,
          timestamp: new Date().toISOString(),
          sender: bob.did,
          payload: { notificationIds: [] }
        })
      )
      await new Promise((r) => setTimeout(r, 100))

      // Check count
      const count3Promise = waitForMessageOfType(bobWs, 'notification.count.response')
      bobWs.send(
        serialise({
          id: 'count-3',
          type: 'notification.count' as any,
          timestamp: new Date().toISOString(),
          sender: bob.did,
          payload: {}
        })
      )
      const count3Resp = await count3Promise
      expect((count3Resp.payload as any).unread).toBe(0)

      aliceWs.close()
      bobWs.close()
    })

    it('should filter unreadOnly', async () => {
      const alice = await createIdentity()
      const bob = await createIdentity()

      const aliceWs = await connectAndAuth(alice.vp)
      const bobWs = await connectAndAuth(bob.vp)

      // Generate 1 notification
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

      await collectMessages(bobWs, 300)

      // Mark it read
      const listPromise = waitForMessageOfType(bobWs, 'notification.list.response')
      bobWs.send(
        serialise({
          id: 'list-1',
          type: 'notification.list' as any,
          timestamp: new Date().toISOString(),
          sender: bob.did,
          payload: {}
        })
      )
      const listResp = await listPromise
      const notifId = (listResp.payload as any).notifications[0].id

      bobWs.send(
        serialise({
          id: 'mark-1',
          type: 'notification.mark-read' as any,
          timestamp: new Date().toISOString(),
          sender: bob.did,
          payload: { notificationIds: [notifId] }
        })
      )
      await new Promise((r) => setTimeout(r, 100))

      // List unread only
      const list2Promise = waitForMessageOfType(bobWs, 'notification.list.response')
      bobWs.send(
        serialise({
          id: 'list-2',
          type: 'notification.list' as any,
          timestamp: new Date().toISOString(),
          sender: bob.did,
          payload: { unreadOnly: true }
        })
      )
      const list2Resp = await list2Promise
      expect((list2Resp.payload as any).notifications).toHaveLength(0)
      expect((list2Resp.payload as any).total).toBe(0)

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

      // Create community
      const createPromise = waitForMessageOfType(aliceWs, 'community.updated')
      aliceWs.send(
        serialise({
          id: 'create-1',
          type: 'community.create',
          timestamp: new Date().toISOString(),
          sender: alice.did,
          payload: { name: 'Test', defaultChannels: ['general'] }
        })
      )
      const createResp = await createPromise
      const communityId = (createResp.payload as any)?.communityId

      // Bob joins
      bobWs.send(
        serialise({
          id: 'join-1',
          type: 'community.join',
          timestamp: new Date().toISOString(),
          sender: bob.did,
          payload: {
            communityId,
            membershipVC: bob.memberVC,
            encryptionPublicKey: bob.encKP.publicKey
          }
        })
      )

      // Wait for join-related messages
      await collectMessages(bobWs, 500)
      await collectMessages(aliceWs, 200)

      // Alice sends message mentioning Bob
      const bobMsgs = collectMessages(bobWs, 500)

      aliceWs.send(
        serialise({
          id: `ch-${Date.now()}`,
          type: 'channel.send',
          timestamp: new Date().toISOString(),
          sender: alice.did,
          payload: {
            communityId,
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
        })
      )

      const received = await bobMsgs
      const types = received.map((m) => m.type)
      expect(types).toContain('channel.message')
      expect(types).toContain('notification.new')

      const notif = received.find((m) => m.type === 'notification.new')!.payload as Notification
      expect(notif.type).toBe('mention')
      expect(notif.fromDID).toBe(alice.did)

      aliceWs.close()
      bobWs.close()
    })
  })
})
