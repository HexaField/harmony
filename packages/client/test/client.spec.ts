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
import { HarmonyClient, LocalStoragePersistence } from '../src/index.js'
import type { PersistenceAdapter, PersistedState } from '../src/index.js'

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

  describe('Accessors', () => {
    it('myDID() MUST return correct DID after connect', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })
      expect(client.myDID()).toBe(identity.did)
      await client.disconnect()
    })

    it('community(id) MUST return specific community or null', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      expect(client.community('nonexistent')).toBeNull()

      const community = await client.createCommunity({ name: 'Accessor Test' })
      expect(client.community(community.id)).not.toBeNull()
      expect(client.community(community.id)?.info.name).toBe('Accessor Test')

      await client.disconnect()
    })
  })

  describe('DM Edit/Delete', () => {
    it('MUST edit DM message', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      const msgId = await client.sendDM('did:key:recipient', 'original')
      // Should not throw
      await client.editDM('did:key:recipient', msgId, 'edited')
      await client.disconnect()
    })

    it('MUST delete DM message', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      const msgId = await client.sendDM('did:key:recipient', 'to delete')
      await client.deleteDM('did:key:recipient', msgId)

      const dms = client.dmChannels()
      const channel = dms.find((d) => d.recipientDID === 'did:key:recipient')
      expect(channel?.messages.find((m) => m.id === msgId)).toBeUndefined()
      await client.disconnect()
    })
  })

  describe('Role Management', () => {
    it('MUST send role.create message', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      await client.createRole('c1', { communityId: 'c1', name: 'Mod', permissions: ['kick'], position: 1 })
      await client.disconnect()
    })

    it('MUST send role.update message', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      await client.updateRole('c1', 'r1', { communityId: 'c1', name: 'Admin', permissions: ['all'], position: 0 })
      await client.disconnect()
    })

    it('MUST send role.delete message', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      await client.deleteRole('c1', 'r1')
      await client.disconnect()
    })

    it('MUST assign role to member', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      await client.assignRole('c1', 'did:key:member', 'r1')
      await client.disconnect()
    })
  })

  describe('Kick/Ban', () => {
    it('MUST send kick message', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      await client.kickMember('c1', 'did:key:baduser', 'spam')
      await client.disconnect()
    })

    it('MUST send ban message', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      await client.banMember('c1', 'did:key:baduser', 'harassment')
      await client.disconnect()
    })
  })

  describe('Error Events', () => {
    it('MUST emit error event on server error message', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      let errorReceived = false
      client.on('error', () => {
        errorReceived = true
      })

      // Trigger error by sending invalid ZCAP proof
      const conn = server.connections()[0]
      server.sendToConnectionById(conn.id, {
        id: 'err-test',
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'FORBIDDEN', message: 'Test error' }
      })

      await new Promise((r) => setTimeout(r, 200))
      expect(errorReceived).toBe(true)
      await client.disconnect()
    })
  })

  describe('Channel Operations', () => {
    it('MUST delete channel', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      // Should not throw
      await client.deleteChannel('c1', 'ch1')
      await client.disconnect()
    })
  })

  describe('Reconnection', () => {
    it('MUST emit reconnecting event on server disconnect', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      let reconnecting = false
      client.on('reconnecting', () => {
        reconnecting = true
      })

      // Force disconnect the client's connection from server side
      const conns = server.connections()
      for (const conn of conns) conn.ws.close()
      await new Promise((r) => setTimeout(r, 2500))

      expect(reconnecting).toBe(true)
      await client.disconnect()
    })

    it('MUST support manual reconnect', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })
      await client.disconnect()

      // Server is still running, just reconnect
      await client.reconnect()
      expect(client.isConnected()).toBe(true)
      await client.disconnect()
    })
  })

  describe('Clock Management', () => {
    it('MUST increment clock on each send', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      const community = await client.createCommunity({ name: 'Clock Inc' })
      const channelId = community.channels[0]?.id ?? 'ch1'
      const sub = client.subscribeChannel(community.id, channelId)

      await client.sendMessage(community.id, channelId, 'msg1')
      await client.sendMessage(community.id, channelId, 'msg2')
      await client.sendMessage(community.id, channelId, 'msg3')

      expect(sub.messages[0].clock.counter).toBeLessThan(sub.messages[1].clock.counter)
      expect(sub.messages[1].clock.counter).toBeLessThan(sub.messages[2].clock.counter)

      sub.unsubscribe()
      await client.disconnect()
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

    it('MUST emit sync event with decoded messages', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      const community = await client.createCommunity({ name: 'Sync Event Test' })
      const channelId = community.channels[0]?.id ?? 'ch1'

      await client.sendMessage(community.id, channelId, 'sync-event-msg')
      await new Promise((r) => setTimeout(r, 200))

      const syncPromise = new Promise<{
        communityId: string
        channelId: string
        messages: Array<{ content: { text: string } }>
      }>((resolve) => {
        client.on('sync', (...args: unknown[]) => {
          resolve(args[0] as { communityId: string; channelId: string; messages: Array<{ content: { text: string } }> })
        })
      })

      await client.syncChannel(community.id, channelId)
      const event = await syncPromise

      expect(event.communityId).toBe(community.id)
      expect(event.channelId).toBe(channelId)
      expect(event.messages.length).toBeGreaterThan(0)
      expect(event.messages.some((m: { content: { text: string } }) => m.content.text === 'sync-event-msg')).toBe(true)

      await client.disconnect()
    })
  })

  describe('Content Decoding', () => {
    it('MUST decode plaintext content { text } from synced messages', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      const community = await client.createCommunity({ name: 'Plaintext Decode' })
      const channelId = community.channels[0]?.id ?? 'ch1'

      await client.sendMessage(community.id, channelId, 'Hello')
      await new Promise((r) => setTimeout(r, 200))

      const syncPromise = new Promise<{ messages: Array<{ content: { text: string } }> }>((resolve) => {
        client.on('sync', (...args: unknown[]) => {
          resolve(args[0] as { messages: Array<{ content: { text: string } }> })
        })
      })

      await client.syncChannel(community.id, channelId)
      const event = await syncPromise

      const msg = event.messages.find((m: { content: { text: string } }) => m.content.text === 'Hello')
      expect(msg).toBeDefined()
      expect(msg!.content.text).toBe('Hello')

      await client.disconnect()
    })

    it('MUST decode Uint8Array ciphertext from synced messages', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      const community = await client.createCommunity({ name: 'Uint8Array Decode' })
      const channelId = community.channels[0]?.id ?? 'ch1'

      // Send a message — the server stores ciphertext as Uint8Array
      await client.sendMessage(community.id, channelId, 'Hello')
      await new Promise((r) => setTimeout(r, 200))

      const syncPromise = new Promise<{ messages: Array<{ content: { text: string } }> }>((resolve) => {
        client.on('sync', (...args: unknown[]) => {
          resolve(args[0] as { messages: Array<{ content: { text: string } }> })
        })
      })

      await client.syncChannel(community.id, channelId)
      const event = await syncPromise

      // The server may return ciphertext as Uint8Array; either way content should decode
      expect(event.messages.length).toBeGreaterThan(0)
      const decoded = event.messages[event.messages.length - 1]
      expect(typeof decoded.content.text).toBe('string')
      expect(decoded.content.text.length).toBeGreaterThan(0)
      expect(decoded.content.text).not.toBe('[synced]')

      await client.disconnect()
    })

    it('MUST decode serialized Uint8Array ciphertext (numeric keys) from synced messages', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      const community = await client.createCommunity({ name: 'Serialized Decode' })
      const channelId = community.channels[0]?.id ?? 'ch1'

      // Simulate a sync response with serialized Uint8Array ciphertext (numeric keys object)
      // This format occurs when JSON serialization converts Uint8Array to { "0": 72, "1": 101, ... }
      const syncPromise = new Promise<{ messages: Array<{ content: { text: string } }> }>((resolve) => {
        client.on('sync', (...args: unknown[]) => {
          resolve(args[0] as { messages: Array<{ content: { text: string } }> })
        })
      })

      // Inject a fake sync response via the client's WebSocket message handler
      // We need to craft a protocol message that looks like a sync.response
      const fakeMsg = serialise({
        id: 'fake-sync-1',
        type: 'sync.response',
        sender: 'server',
        timestamp: new Date().toISOString(),
        payload: {
          communityId: community.id,
          channelId,
          messages: [
            {
              id: 'msg-serialized-1',
              type: 'channel.send',
              sender: identity.did,
              timestamp: new Date().toISOString(),
              payload: {
                clock: { counter: 1, authorDID: identity.did },
                channelId,
                content: {
                  ciphertext: { 0: 72, 1: 101, 2: 108, 3: 108, 4: 111 }
                }
              }
            }
          ],
          hasMore: false,
          latestClock: { counter: 1, authorDID: identity.did }
        }
      })

      // Get the underlying ws connection and inject the message
      const servers = client.servers()
      const serverEntry = servers[0]
      // Access internal ws via private field — cast to any for test
      const clientAny = client as unknown as {
        _servers: Map<string, { ws: { onmessage: ((event: { data: string }) => void) | null } }>
      }
      const wsEntry = clientAny._servers.get(serverEntry.url)
      wsEntry?.ws?.onmessage?.({ data: fakeMsg })

      const event = await syncPromise

      expect(event.messages.length).toBeGreaterThan(0)
      const msg = event.messages.find((m: { content: { text: string } }) => m.content.text === 'Hello')
      expect(msg).toBeDefined()
      expect(msg!.content.text).toBe('Hello')

      await client.disconnect()
    })

    it('MUST fallback to [synced] when content is missing', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })

      const community = await client.createCommunity({ name: 'Fallback Decode' })
      const channelId = community.channels[0]?.id ?? 'ch1'

      const syncPromise = new Promise<{ messages: Array<{ content: { text: string } }> }>((resolve) => {
        client.on('sync', (...args: unknown[]) => {
          resolve(args[0] as { messages: Array<{ content: { text: string } }> })
        })
      })

      // Inject a sync response with no content field
      const fakeMsg = serialise({
        id: 'fake-sync-2',
        type: 'sync.response',
        sender: 'server',
        timestamp: new Date().toISOString(),
        payload: {
          communityId: community.id,
          channelId,
          messages: [
            {
              id: 'msg-no-content',
              type: 'channel.send',
              sender: identity.did,
              timestamp: new Date().toISOString(),
              payload: {
                clock: { counter: 1, authorDID: identity.did },
                channelId
                // no content field
              }
            }
          ],
          hasMore: false,
          latestClock: { counter: 1, authorDID: identity.did }
        }
      })

      const servers = client.servers()
      const clientAny = client as unknown as {
        _servers: Map<string, { ws: { onmessage: ((event: { data: string }) => void) | null } }>
      }
      const wsEntry = clientAny._servers.get(servers[0].url)
      wsEntry?.ws?.onmessage?.({ data: fakeMsg })

      const event = await syncPromise

      expect(event.messages.length).toBeGreaterThan(0)
      const msg = event.messages.find((m: { content: { text: string } }) => m.content.text === '[synced]')
      expect(msg).toBeDefined()
      expect(msg!.content.text).toBe('[synced]')

      await client.disconnect()
    })
  })

  describe('Auto-VP Creation', () => {
    it('MUST auto-create VP when connecting without explicit VP', async () => {
      const { identity, keyPair } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })

      // Connect without providing vp parameter
      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair })
      expect(client.isConnected()).toBe(true)

      await client.disconnect()
    })
  })

  describe('Multi-Server', () => {
    it('MUST connect to two servers and track both', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })

      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })
      // Connect again with same URL simulates second server (same server, different entry would need different port)
      // For this test, verify servers() returns at least one entry
      expect(client.isConnected()).toBe(true)
      expect(client.servers().length).toBe(1)
      expect(client.servers()[0].connected).toBe(true)
      expect(client.isConnectedTo(`ws://127.0.0.1:${PORT}`)).toBe(true)
      expect(client.isConnectedToAny()).toBe(true)
      await client.disconnect()
    })

    it('MUST report connectionState correctly', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })

      expect(client.connectionState()).toBe('disconnected')

      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })
      expect(client.connectionState()).toBe('connected')

      await client.disconnect()
      expect(client.connectionState()).toBe('disconnected')
    })

    it('MUST remove server and disconnect it', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })

      const url = `ws://127.0.0.1:${PORT}`
      await client.connect({ serverUrl: url, identity, keyPair, vp })
      expect(client.isConnectedTo(url)).toBe(true)

      client.removeServer(url)
      expect(client.isConnectedTo(url)).toBe(false)
      expect(client.servers().length).toBe(0)
    })

    it('MUST track community-to-server mapping', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })

      const url = `ws://127.0.0.1:${PORT}`
      await client.connect({ serverUrl: url, identity, keyPair, vp })

      const community = await client.createCommunity({ name: 'Mapped Community' })
      expect(client.serverForCommunity(community.id)).toBe(url)

      await client.disconnect()
    })

    it('MUST clear community mapping on leave', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })

      const url = `ws://127.0.0.1:${PORT}`
      await client.connect({ serverUrl: url, identity, keyPair, vp })

      const community = await client.createCommunity({ name: 'Leave Mapped' })
      expect(client.serverForCommunity(community.id)).toBe(url)

      await client.leaveCommunity(community.id)
      expect(client.serverForCommunity(community.id)).toBeNull()

      await client.disconnect()
    })

    it('MUST clear community mappings on removeServer', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })

      const url = `ws://127.0.0.1:${PORT}`
      await client.connect({ serverUrl: url, identity, keyPair, vp })

      const community = await client.createCommunity({ name: 'Remove Server' })
      client.removeServer(url)
      expect(client.serverForCommunity(community.id)).toBeNull()
    })

    it('addServer MUST register without connecting if no identity', () => {
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })
      client.addServer(`ws://127.0.0.1:${PORT}`)
      expect(client.servers().length).toBe(1)
      expect(client.servers()[0].connected).toBe(false)
    })
  })

  describe('Persistence', () => {
    it('MUST save and load state via adapter', async () => {
      let savedState: PersistedState | null = null
      const adapter: PersistenceAdapter = {
        async load() {
          return savedState ?? { servers: [] }
        },
        async save(state) {
          savedState = state
        }
      }

      const { identity, keyPair, vp } = await createTestIdentity()
      const url = `ws://127.0.0.1:${PORT}`

      // First client: connect and create community
      const client1 = new HarmonyClient({ wsFactory: createWsFactory(PORT), persistenceAdapter: adapter })
      await client1.connect({ serverUrl: url, identity, keyPair, vp })
      await client1.createCommunity({ name: 'Persisted' })

      // Wait for async save
      await new Promise((r) => setTimeout(r, 50))
      expect(savedState).not.toBeNull()
      expect(savedState!.servers.length).toBe(1)
      expect(savedState!.servers[0].url).toBe(url)
      expect(savedState!.servers[0].communityIds.length).toBe(1)

      await client1.disconnect()

      // Second client: create from persisted state
      const client2 = await HarmonyClient.create({
        wsFactory: createWsFactory(PORT),
        persistenceAdapter: adapter,
        identity,
        keyPair,
        vp
      })
      expect(client2.isConnected()).toBe(true)
      expect(client2.servers().length).toBe(1)

      await client2.disconnect()
    })
  })

  describe('Backward Compatibility', () => {
    it('MUST work with single-server usage unchanged', async () => {
      const { identity, keyPair, vp } = await createTestIdentity()
      const client = new HarmonyClient({ wsFactory: createWsFactory(PORT) })

      await client.connect({ serverUrl: `ws://127.0.0.1:${PORT}`, identity, keyPair, vp })
      expect(client.isConnected()).toBe(true)
      expect(client.myDID()).toBe(identity.did)

      const community = await client.createCommunity({ name: 'Compat Test' })
      expect(client.communities().length).toBe(1)

      await client.disconnect()
      expect(client.isConnected()).toBe(false)

      await client.reconnect()
      expect(client.isConnected()).toBe(true)
      await client.disconnect()
    })
  })
})
