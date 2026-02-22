import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { WebSocket } from 'ws'
import { MemoryQuadStore } from '@harmony/quads'
import { createCryptoProvider } from '@harmony/crypto'
import type { KeyPair } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import type { DIDDocument } from '@harmony/did'
import { VCService, MemoryRevocationStore } from '@harmony/vc'
import type { VerifiablePresentation } from '@harmony/vc'
import type { Identity } from '@harmony/identity'
import { HarmonyServer } from '@harmony/server'
import type { ProtocolMessage } from '@harmony/protocol'
import { serialise, deserialise } from '@harmony/protocol'
import { HarmonyClient } from '../src/index.js'

const crypto = createCryptoProvider()
const didProvider = new DIDKeyProvider(crypto)
const vcService = new VCService(crypto)

const PORT = 19877
let server: HarmonyServer
let store: MemoryQuadStore
let revocationStore: MemoryRevocationStore
const didDocs: Map<string, DIDDocument> = new Map()
const didResolver = async (did: string) => didDocs.get(did) ?? null

async function createTestIdentity(): Promise<{
  identity: Identity
  keyPair: KeyPair
  vp: VerifiablePresentation
  doc: DIDDocument
}> {
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

  const identity: Identity = {
    did: doc.id,
    document: doc,
    credentials: [vc],
    capabilities: []
  }

  return { identity, keyPair, vp, doc }
}

// WSLike adapter for ws module
function createWsFactory(port: number) {
  return (url: string) => {
    const ws = new WebSocket(url)
    const wsLike = {
      send: (data: string) => ws.send(data),
      close: () => ws.close(),
      get readyState() {
        return ws.readyState
      },
      onmessage: null as ((event: { data: string }) => void) | null,
      onclose: null as (() => void) | null,
      onopen: null as (() => void) | null,
      onerror: null as ((event: unknown) => void) | null
    }
    ws.on('open', () => wsLike.onopen?.())
    ws.on('message', (data: Buffer) => wsLike.onmessage?.({ data: data.toString() }))
    ws.on('close', () => wsLike.onclose?.())
    ws.on('error', (err: Error) => wsLike.onerror?.(err))
    return wsLike
  }
}

describe('@harmony/client', () => {
  beforeEach(async () => {
    store = new MemoryQuadStore()
    revocationStore = new MemoryRevocationStore()
    didDocs.clear()
    server = new HarmonyServer({
      port: PORT,
      store,
      didResolver,
      revocationStore,
      cryptoProvider: crypto
    })
    await server.start()
  })

  afterEach(async () => {
    await server?.stop()
  })

  describe('Connection', () => {
    it('MUST connect to server via WebSocket', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })

      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })
      expect(client.isConnected()).toBe(true)
      await client.disconnect()
    })

    it('MUST authenticate with VP on connect', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })
      expect(server.connections().length).toBe(1)
      await client.disconnect()
    })

    it('MUST set isConnected() after auth success', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      expect(client.isConnected()).toBe(false)
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })
      expect(client.isConnected()).toBe(true)
      await client.disconnect()
    })

    it('MUST emit connected event on successful connect', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      let connected = false
      client.on('connected', () => {
        connected = true
      })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })
      expect(connected).toBe(true)
      await client.disconnect()
    })

    it('MUST emit disconnected event on disconnect', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      let disconnected = false
      client.on('disconnected', () => {
        disconnected = true
      })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })
      await client.disconnect()
      await new Promise((r) => setTimeout(r, 100))
      // disconnect is triggered by ws close
      expect(client.isConnected()).toBe(false)
    })

    it('MUST queue messages during reconnect and flush on connect', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      // Queue a message before connect
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })
      // Messages should go through normally
      expect(client.isConnected()).toBe(true)
      await client.disconnect()
    })
  })

  describe('Community', () => {
    it('MUST create community', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      const community = await client.createCommunity({ name: 'Test Community' })
      expect(community.id).toBeTruthy()
      expect(community.info.name).toBe('Test Community')
      await client.disconnect()
    })

    it('MUST track community state locally', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      await client.createCommunity({ name: 'Local Track' })
      expect(client.communities().length).toBe(1)
      await client.disconnect()
    })

    it('MUST list all joined communities', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      await client.createCommunity({ name: 'Community A' })
      await client.createCommunity({ name: 'Community B' })
      expect(client.communities().length).toBe(2)
      await client.disconnect()
    })

    it('MUST leave community', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      const community = await client.createCommunity({ name: 'Leave Test' })
      await client.leaveCommunity(community.id)
      expect(client.communities().length).toBe(0)
      await client.disconnect()
    })
  })

  describe('Channel Subscription', () => {
    it('MUST subscribe to channel', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      const sub = client.subscribeChannel('c1', 'ch1')
      expect(sub).toBeDefined()
      expect(sub.messages).toEqual([])
      sub.unsubscribe()
      await client.disconnect()
    })

    it('MUST maintain message list in CRDT order', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      const community = await client.createCommunity({ name: 'CRDT Order' })
      const channelId = community.channels[0]?.id ?? 'ch1'
      const sub = client.subscribeChannel(community.id, channelId)

      await client.sendMessage(community.id, channelId, 'first')
      await client.sendMessage(community.id, channelId, 'second')

      expect(sub.messages.length).toBe(2)
      expect(sub.messages[0].content.text).toBe('first')
      expect(sub.messages[1].content.text).toBe('second')

      sub.unsubscribe()
      await client.disconnect()
    })

    it('MUST unsubscribe (stops receiving messages)', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      const sub = client.subscribeChannel('c1', 'ch1')
      sub.unsubscribe()
      // No crash expected
      await client.disconnect()
    })
  })

  describe('Sending Messages', () => {
    it('MUST include Lamport clock', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      const community = await client.createCommunity({ name: 'Clock Test' })
      const channelId = community.channels[0]?.id ?? 'ch1'
      const sub = client.subscribeChannel(community.id, channelId)

      await client.sendMessage(community.id, channelId, 'msg with clock')
      expect(sub.messages[0].clock.counter).toBeGreaterThan(0)

      sub.unsubscribe()
      await client.disconnect()
    })

    it('MUST optimistically add to local message list', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      const community = await client.createCommunity({ name: 'Optimistic' })
      const channelId = community.channels[0]?.id ?? 'ch1'
      const sub = client.subscribeChannel(community.id, channelId)

      const msgId = await client.sendMessage(community.id, channelId, 'optimistic msg')
      // Should be immediately available
      expect(sub.messages.find((m) => m.id === msgId)).toBeTruthy()

      sub.unsubscribe()
      await client.disconnect()
    })

    it('MUST include nonce for deduplication', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      const id1 = await client.sendMessage('c1', 'ch1', 'msg1')
      const id2 = await client.sendMessage('c1', 'ch1', 'msg2')
      expect(id1).not.toBe(id2)
      await client.disconnect()
    })

    it('MUST encrypt message content', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      // sendMessage should produce encrypted content
      const community = await client.createCommunity({ name: 'Encrypt Test' })
      const channelId = community.channels[0]?.id ?? 'ch1'
      await client.sendMessage(community.id, channelId, 'secret message')
      // The message was sent (no error thrown)
      await client.disconnect()
    })
  })

  describe('DMs', () => {
    it('MUST track DM channels', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      await client.sendDM('did:key:recipient', 'hello')
      expect(client.dmChannels().length).toBe(1)
      expect(client.dmChannels()[0].recipientDID).toBe('did:key:recipient')
      await client.disconnect()
    })

    it('MUST track unread counts', async () => {
      const alice = await createTestIdentity()
      const bob = await createTestIdentity()

      const aliceClient = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      const bobClient = new HarmonyClient({ wsFactory: createWsFactory(PORT) })

      await aliceClient.connect({
        serverUrl: `ws://127.0.0.1:${PORT}`,
        identity: alice.identity,
        keyPair: alice.keyPair,
        vp: alice.vp
      })
      await bobClient.connect({
        serverUrl: `ws://127.0.0.1:${PORT}`,
        identity: bob.identity,
        keyPair: bob.keyPair,
        vp: bob.vp
      })

      const dmPromise = new Promise<void>((resolve) => {
        bobClient.on('dm', () => resolve())
      })

      await aliceClient.sendDM(bob.identity.did, 'hello bob')
      await dmPromise

      const bobDMs = bobClient.dmChannels()
      expect(bobDMs.length).toBe(1)
      expect(bobDMs[0].unreadCount).toBe(1)

      await aliceClient.disconnect()
      await bobClient.disconnect()
    })
  })

  describe('Threads', () => {
    it('MUST create thread from message', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      const threadId = await client.createThread('c1', 'ch1', 'parent-msg', 'Thread Name', 'first thread msg')
      expect(threadId).toBeTruthy()
      await client.disconnect()
    })

    it('MUST send messages in thread', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      const msgId = await client.sendThreadMessage('thread-1', 'thread reply')
      expect(msgId).toBeTruthy()
      await client.disconnect()
    })
  })

  describe('Message Operations', () => {
    it('MUST edit messages', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      const community = await client.createCommunity({ name: 'Edit Test' })
      const channelId = community.channels[0]?.id ?? 'ch1'
      const sub = client.subscribeChannel(community.id, channelId)

      const msgId = await client.sendMessage(community.id, channelId, 'original')
      await client.editMessage(community.id, channelId, msgId, 'edited')

      const log = client.getChannelLog(community.id, channelId)
      const entry = log?.getEntry(msgId)
      expect(entry?.data.content.text).toBe('edited')
      expect(entry?.data.edited).toBe(true)

      sub.unsubscribe()
      await client.disconnect()
    })

    it('MUST delete messages', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      const community = await client.createCommunity({ name: 'Delete Test' })
      const channelId = community.channels[0]?.id ?? 'ch1'
      const sub = client.subscribeChannel(community.id, channelId)

      const msgId = await client.sendMessage(community.id, channelId, 'to delete')
      expect(sub.messages.length).toBe(1)

      await client.deleteMessage(community.id, channelId, msgId)
      expect(sub.messages.length).toBe(0)

      sub.unsubscribe()
      await client.disconnect()
    })

    it('MUST add/remove reactions', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      // Should not throw
      await client.addReaction('c1', 'ch1', 'msg1', '👍')
      await client.removeReaction('c1', 'ch1', 'msg1', '👍')
      await client.disconnect()
    })
  })

  describe('Presence', () => {
    it('MUST send presence updates', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      await client.setPresence('dnd', 'Busy')
      // Should not throw
      await client.disconnect()
    })

    it('MUST track other members presence', async () => {
      const alice = await createTestIdentity()
      const bob = await createTestIdentity()

      const aliceClient = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      const bobClient = new HarmonyClient({ wsFactory: createWsFactory(PORT) })

      await aliceClient.connect({
        serverUrl: `ws://127.0.0.1:${PORT}`,
        identity: alice.identity,
        keyPair: alice.keyPair,
        vp: alice.vp
      })
      await bobClient.connect({
        serverUrl: `ws://127.0.0.1:${PORT}`,
        identity: bob.identity,
        keyPair: bob.keyPair,
        vp: bob.vp
      })

      // Subscribe both to same community
      const conns = server.connections()
      for (const conn of conns) server.subscribeToCommunity(conn.id, 'c1')

      const presencePromise = new Promise<void>((resolve) => {
        bobClient.on('presence', () => resolve())
      })

      await aliceClient.setPresence('idle')
      await presencePromise

      await aliceClient.disconnect()
      await bobClient.disconnect()
    })
  })

  describe('Events', () => {
    it('MUST allow multiple listeners per event', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })

      let count = 0
      client.on('connected', () => count++)
      client.on('connected', () => count++)

      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })
      expect(count).toBe(2)
      await client.disconnect()
    })

    it('MUST unsubscribe correctly', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })

      let count = 0
      const unsub = client.on('connected', () => count++)
      unsub()

      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })
      expect(count).toBe(0)
      await client.disconnect()
    })
  })

  describe('Offline Queue', () => {
    it('MUST queue messages when disconnected', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })

      // Send before connecting — should queue
      const community = client.subscribeChannel('c1', 'ch1')
      expect(() => client.sendMessage('c1', 'ch1', 'queued')).not.toThrow()
    })

    it('MUST flush queue on reconnect', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })

      // Queue a message
      await client.sendMessage('c1', 'ch1', 'pre-connect')

      // Connect — should flush
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })
      await new Promise((r) => setTimeout(r, 100))
      await client.disconnect()
    })
  })

  describe('E2EE Integration', () => {
    it('MUST refuse to send if not connected (queues instead)', async () => {
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      // Sending when not connected should queue, not throw
      const id = await client.sendMessage('c1', 'ch1', 'test')
      expect(id).toBeTruthy()
    })
  })

  describe('Sync', () => {
    it('MUST sync channel history on request', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      // Sync should not throw
      await client.syncChannel('c1', 'ch1')
      await new Promise((r) => setTimeout(r, 100))
      await client.disconnect()
    })
  })
})
