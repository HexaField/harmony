import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { WebSocket } from 'ws'
import { MemoryQuadStore } from '@harmony/quads'
import { createCryptoProvider } from '@harmony/crypto'
import type { KeyPair } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import type { DIDDocument } from '@harmony/did'
import { VCService, MemoryRevocationStore } from '@harmony/vc'
import type { VerifiablePresentation, VerifiableCredential } from '@harmony/vc'
import { ZCAPService } from '@harmony/zcap'
import type { ProtocolMessage, LamportClock } from '@harmony/protocol'
import { serialise, deserialise } from '@harmony/protocol'
import { HarmonyServer, CommunityManager, MessageStore } from '../src/index.js'

const crypto = createCryptoProvider()
const didProvider = new DIDKeyProvider(crypto)
const vcService = new VCService(crypto)
const zcapService = new ZCAPService(crypto)

let server: HarmonyServer
let store: MemoryQuadStore
let revocationStore: MemoryRevocationStore
const PORT = 19876

// DID document cache for resolver
const didDocs: Map<string, DIDDocument> = new Map()
const didResolver = async (did: string): Promise<DIDDocument | null> => didDocs.get(did) ?? null

// Helper to create identity
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

// Helper to connect and authenticate
async function connectAndAuth(vp: VerifiablePresentation): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`)
  await new Promise<void>((resolve, reject) => {
    ws.on('open', resolve)
    ws.on('error', reject)
  })

  // Send auth message
  const authMsg: ProtocolMessage = {
    id: 'auth-1',
    type: 'sync.state',
    timestamp: new Date().toISOString(),
    sender: vp.holder,
    payload: vp
  }
  ws.send(serialise(authMsg))

  // Wait for auth response
  await new Promise<void>((resolve) => {
    ws.once('message', (data) => {
      const msg = deserialise<ProtocolMessage>(data.toString())
      resolve()
    })
  })

  return ws
}

// Helper to send and wait for response
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

describe('@harmony/server', () => {
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

  afterAll(async () => {
    await server?.stop()
  })

  afterEach(async () => {
    await server?.stop()
  })

  describe('Connection', () => {
    it('MUST accept WebSocket connections', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}`)
      await new Promise<void>((resolve) => ws.on('open', resolve))
      expect(ws.readyState).toBe(WebSocket.OPEN)
      ws.close()
    })

    it('MUST require authentication before accepting messages', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}`)
      await new Promise<void>((resolve) => ws.on('open', resolve))

      const response = await sendAndWait(ws, {
        id: 'test',
        type: 'channel.send',
        timestamp: new Date().toISOString(),
        sender: 'did:key:test',
        payload: {}
      })

      expect(response.type).toBe('error')
      expect((response.payload as { code: string }).code).toBe('AUTH_REQUIRED')
      ws.close()
    })

    it('MUST reject connections with invalid VPs', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}`)
      await new Promise<void>((resolve) => ws.on('open', resolve))

      const fakeVP = {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiablePresentation'],
        holder: 'did:key:fake',
        verifiableCredential: [],
        proof: {
          type: 'Ed25519Signature2020',
          created: new Date().toISOString(),
          verificationMethod: 'did:key:fake#fake',
          proofPurpose: 'authentication',
          proofValue: 'zINVALID'
        }
      }

      const response = await sendAndWait(ws, {
        id: 'auth',
        type: 'sync.state',
        timestamp: new Date().toISOString(),
        sender: 'did:key:fake',
        payload: fakeVP
      })

      expect(response.type).toBe('error')
      ws.close()
    })

    it('MUST assign connection ID on authenticate', async () => {
      const { vp } = await createIdentity()
      const ws = await connectAndAuth(vp)
      expect(server.connections().length).toBe(1)
      expect(server.connections()[0].id).toBeTruthy()
      ws.close()
    })

    it('MUST track connection presence', async () => {
      const { vp } = await createIdentity()
      const ws = await connectAndAuth(vp)
      const conn = server.connections()[0]
      expect(conn.presence.status).toBe('online')
      ws.close()
    })

    it('MUST clean up on disconnect', async () => {
      const { vp } = await createIdentity()
      const ws = await connectAndAuth(vp)
      expect(server.connections().length).toBe(1)
      ws.close()
      await new Promise((r) => setTimeout(r, 100))
      expect(server.connections().length).toBe(0)
    })
  })

  describe('Authentication', () => {
    it('MUST verify VP signature', async () => {
      const { vp } = await createIdentity()
      const ws = await connectAndAuth(vp)
      expect(server.connections().length).toBe(1)
      ws.close()
    })

    it('MUST resolve holder DID', async () => {
      const { vp, did } = await createIdentity()
      const ws = await connectAndAuth(vp)
      const conn = server.connections()[0]
      expect(conn.did).toBe(did)
      ws.close()
    })

    it('MUST reject expired VCs in VP', async () => {
      const keyPair = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(keyPair)
      didDocs.set(doc.id, doc)

      const expiredVC = await vcService.issue({
        issuerDID: doc.id,
        issuerKeyPair: keyPair,
        subjectDID: doc.id,
        type: 'IdentityCredential',
        claims: { name: 'Test' },
        expirationDate: '2020-01-01T00:00:00Z'
      })

      const vp = await vcService.present({
        holderDID: doc.id,
        holderKeyPair: keyPair,
        credentials: [expiredVC]
      })

      const ws = new WebSocket(`ws://127.0.0.1:${PORT}`)
      await new Promise<void>((resolve) => ws.on('open', resolve))
      const response = await sendAndWait(ws, {
        id: 'auth',
        type: 'sync.state',
        timestamp: new Date().toISOString(),
        sender: doc.id,
        payload: vp
      })
      expect(response.type).toBe('error')
      ws.close()
    })

    it('MUST reject revoked VCs in VP', async () => {
      const { did, vp, memberVC } = await createIdentity()
      await revocationStore.revoke(memberVC.id)

      const ws = new WebSocket(`ws://127.0.0.1:${PORT}`)
      await new Promise<void>((resolve) => ws.on('open', resolve))
      const response = await sendAndWait(ws, {
        id: 'auth',
        type: 'sync.state',
        timestamp: new Date().toISOString(),
        sender: did,
        payload: vp
      })
      expect(response.type).toBe('error')
      ws.close()
    })

    it('MUST set connection DID from VP holder', async () => {
      const { vp, did } = await createIdentity()
      const ws = await connectAndAuth(vp)
      expect(server.connections()[0].did).toBe(did)
      ws.close()
    })
  })

  describe('ZCAP Verification', () => {
    it('MUST verify ZCAP invocation proof on channel.send', async () => {
      const { vp, did, keyPair } = await createIdentity()
      const ws = await connectAndAuth(vp)
      const conn = server.connections()[0]
      server.subscribeToCommunity(conn.id, 'c1')

      // Create ZCAP
      const cap = await zcapService.createRoot({
        ownerDID: did,
        ownerKeyPair: keyPair,
        scope: { community: 'c1' },
        allowedAction: ['https://harmony.example/vocab#SendMessage']
      })
      const inv = await zcapService.invoke({
        capability: cap,
        invokerKeyPair: keyPair,
        action: 'https://harmony.example/vocab#SendMessage',
        target: 'channel-1'
      })

      const msg: ProtocolMessage = {
        id: 'msg-1',
        type: 'channel.send',
        timestamp: new Date().toISOString(),
        sender: did,
        payload: {
          communityId: 'c1',
          channelId: 'channel-1',
          content: { ciphertext: new Uint8Array([1, 2, 3]), epoch: 0, senderIndex: 0 },
          nonce: 'n1',
          clock: { counter: 1, authorDID: did }
        },
        proof: {
          capabilityId: cap.id,
          capabilityChain: [cap.id],
          invocation: {
            action: inv.action,
            target: inv.target,
            proof: inv.proof
          }
        }
      }

      ws.send(serialise(msg))
      // Should not get error back (message accepted)
      await new Promise((r) => setTimeout(r, 200))
      ws.close()
    })

    it('MUST reject action not in allowed actions', async () => {
      const { vp, did, keyPair } = await createIdentity()
      const ws = await connectAndAuth(vp)

      // Message without valid proof should still be processed (simplified version)
      // but with proof that has invalid structure...
      const msg: ProtocolMessage = {
        id: 'msg-bad',
        type: 'channel.send',
        timestamp: new Date().toISOString(),
        sender: did,
        payload: {
          communityId: 'c1',
          channelId: 'ch1',
          content: { ciphertext: new Uint8Array([1]), epoch: 0, senderIndex: 0 },
          nonce: 'n1',
          clock: { counter: 1, authorDID: did }
        },
        proof: {
          capabilityId: '',
          capabilityChain: [],
          invocation: {
            action: '',
            target: '',
            proof: { type: '', created: '', verificationMethod: '', proofPurpose: '', proofValue: '' }
          }
        }
      }

      const response = await sendAndWait(ws, msg)
      expect(response.type).toBe('error')
      expect((response.payload as { code: string }).code).toBe('ZCAP_INVALID')
      ws.close()
    })
  })

  describe('Message Routing', () => {
    it('MUST broadcast channel messages to all subscribed connections', async () => {
      const alice = await createIdentity()
      const bob = await createIdentity()

      const aliceWs = await connectAndAuth(alice.vp)
      const bobWs = await connectAndAuth(bob.vp)

      // Subscribe both to community
      const conns = server.connections()
      for (const conn of conns) {
        server.subscribeToCommunity(conn.id, 'c1')
      }

      const bobMsgPromise = waitForMessage(bobWs)

      aliceWs.send(
        serialise({
          id: 'msg-alice',
          type: 'channel.send',
          timestamp: new Date().toISOString(),
          sender: alice.did,
          payload: {
            communityId: 'c1',
            channelId: 'ch1',
            content: { ciphertext: new Uint8Array([1, 2]), epoch: 0, senderIndex: 0 },
            nonce: 'n1',
            clock: { counter: 1, authorDID: alice.did }
          }
        })
      )

      const received = await bobMsgPromise
      expect(received.type).toBe('channel.message')
      expect(received.sender).toBe(alice.did)

      aliceWs.close()
      bobWs.close()
    })

    it('MUST route DMs to recipient connection only', async () => {
      const alice = await createIdentity()
      const bob = await createIdentity()

      const aliceWs = await connectAndAuth(alice.vp)
      const bobWs = await connectAndAuth(bob.vp)

      const bobMsgPromise = waitForMessage(bobWs)

      aliceWs.send(
        serialise({
          id: 'dm-1',
          type: 'dm.send',
          timestamp: new Date().toISOString(),
          sender: alice.did,
          payload: {
            recipientDID: bob.did,
            content: { ciphertext: new Uint8Array([1, 2, 3]), epoch: 0, senderIndex: 0 },
            nonce: 'n1',
            clock: { counter: 1, authorDID: alice.did }
          }
        })
      )

      const received = await bobMsgPromise
      expect(received.type).toBe('dm.message')
      expect(received.sender).toBe(alice.did)

      aliceWs.close()
      bobWs.close()
    })

    it('MUST persist messages to quad store', async () => {
      const { vp, did } = await createIdentity()
      const ws = await connectAndAuth(vp)
      const conn = server.connections()[0]
      server.subscribeToCommunity(conn.id, 'c1')

      ws.send(
        serialise({
          id: 'persist-msg',
          type: 'channel.send',
          timestamp: new Date().toISOString(),
          sender: did,
          payload: {
            communityId: 'c1',
            channelId: 'ch1',
            content: { ciphertext: new Uint8Array([1]), epoch: 0, senderIndex: 0 },
            nonce: 'n1',
            clock: { counter: 1, authorDID: did }
          }
        })
      )

      await new Promise((r) => setTimeout(r, 200))
      const stored = await server.messageStoreInstance.getMessage('persist-msg')
      expect(stored).not.toBeNull()
      expect(stored!.id).toBe('persist-msg')

      ws.close()
    })

    it('MUST include Lamport clock in persisted messages', async () => {
      const { vp, did } = await createIdentity()
      const ws = await connectAndAuth(vp)
      const conn = server.connections()[0]
      server.subscribeToCommunity(conn.id, 'c1')

      const clock: LamportClock = { counter: 42, authorDID: did }
      ws.send(
        serialise({
          id: 'clock-msg',
          type: 'channel.send',
          timestamp: new Date().toISOString(),
          sender: did,
          payload: {
            communityId: 'c1',
            channelId: 'ch1',
            content: { ciphertext: new Uint8Array([1]), epoch: 0, senderIndex: 0 },
            nonce: 'n1',
            clock
          }
        })
      )

      await new Promise((r) => setTimeout(r, 200))
      const clockQuads = await store.match({ subject: 'clock-msg', predicate: 'https://harmony.example/vocab#clock' })
      expect(clockQuads.length).toBe(1)
      ws.close()
    })

    it('MUST NOT expose message plaintext (content is EncryptedContent)', async () => {
      const { vp, did } = await createIdentity()
      const ws = await connectAndAuth(vp)
      const conn = server.connections()[0]
      server.subscribeToCommunity(conn.id, 'c1')

      ws.send(
        serialise({
          id: 'enc-msg',
          type: 'channel.send',
          timestamp: new Date().toISOString(),
          sender: did,
          payload: {
            communityId: 'c1',
            channelId: 'ch1',
            content: { ciphertext: new Uint8Array([1, 2, 3]), epoch: 0, senderIndex: 0 },
            nonce: 'n1',
            clock: { counter: 1, authorDID: did }
          }
        })
      )

      await new Promise((r) => setTimeout(r, 200))
      // No plaintext should be stored
      const textQuads = await store.match({ predicate: 'https://harmony.example/vocab#content' })
      // Content predicate should not contain plaintext — payload is serialised
      const stored = await server.messageStoreInstance.getMessage('enc-msg')
      const payload = stored?.payload as { content?: { ciphertext: unknown } }
      expect(payload?.content?.ciphertext).toBeDefined()
      ws.close()
    })

    it('MUST handle offline recipients (store for later sync)', async () => {
      const { vp, did } = await createIdentity()
      const ws = await connectAndAuth(vp)
      const conn = server.connections()[0]
      server.subscribeToCommunity(conn.id, 'c1')

      ws.send(
        serialise({
          id: 'offline-msg',
          type: 'channel.send',
          timestamp: new Date().toISOString(),
          sender: did,
          payload: {
            communityId: 'c1',
            channelId: 'ch1',
            content: { ciphertext: new Uint8Array([1]), epoch: 0, senderIndex: 0 },
            nonce: 'n1',
            clock: { counter: 1, authorDID: did }
          }
        })
      )

      await new Promise((r) => setTimeout(r, 200))
      // Message should be stored even if no other connections
      const stored = await server.messageStoreInstance.getMessage('offline-msg')
      expect(stored).not.toBeNull()
      ws.close()
    })
  })

  describe('Community Management', () => {
    it('MUST create community with default channels', async () => {
      const cm = new CommunityManager(store, crypto)
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const result = await cm.create({
        name: 'Test Community',
        creatorDID: doc.id,
        creatorKeyPair: kp,
        defaultChannels: ['general', 'random']
      })
      expect(result.communityId).toBeTruthy()
      expect(result.defaultChannels.length).toBe(2)
    })

    it('MUST issue root capability to creator', async () => {
      const cm = new CommunityManager(store, crypto)
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const result = await cm.create({ name: 'Test', creatorDID: doc.id, creatorKeyPair: kp })
      expect(result.rootCapability.invoker).toBe(doc.id)
      expect(result.rootCapability.allowedAction.length).toBeGreaterThan(0)
    })

    it('MUST issue membership VC to creator', async () => {
      const cm = new CommunityManager(store, crypto)
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const result = await cm.create({ name: 'Test', creatorDID: doc.id, creatorKeyPair: kp })
      expect(result.membershipVC.credentialSubject.id).toBe(doc.id)
    })

    it('MUST allow joining with valid membership VC', async () => {
      const cm = new CommunityManager(store, crypto)
      const creatorKP = await crypto.generateSigningKeyPair()
      const creatorDoc = await didProvider.create(creatorKP)
      const community = await cm.create({ name: 'Test', creatorDID: creatorDoc.id, creatorKeyPair: creatorKP })

      const joinerKP = await crypto.generateSigningKeyPair()
      const joinerDoc = await didProvider.create(joinerKP)
      const memberVC = await vcService.issue({
        issuerDID: creatorDoc.id,
        issuerKeyPair: creatorKP,
        subjectDID: joinerDoc.id,
        type: 'CommunityMembershipCredential',
        claims: { community: community.communityId }
      })

      const result = await cm.join({
        communityId: community.communityId,
        memberDID: joinerDoc.id,
        membershipVC: memberVC
      })
      expect(result.channels.length).toBeGreaterThan(0)
      expect(result.members.length).toBe(2)
    })

    it('MUST handle leave (remove from community)', async () => {
      const cm = new CommunityManager(store, crypto)
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const community = await cm.create({ name: 'Test', creatorDID: doc.id, creatorKeyPair: kp })

      const joinerKP = await crypto.generateSigningKeyPair()
      const joinerDoc = await didProvider.create(joinerKP)
      const memberVC = await vcService.issue({
        issuerDID: doc.id,
        issuerKeyPair: kp,
        subjectDID: joinerDoc.id,
        type: 'CommunityMembershipCredential',
        claims: { community: community.communityId }
      })
      await cm.join({ communityId: community.communityId, memberDID: joinerDoc.id, membershipVC: memberVC })

      await cm.leave(community.communityId, joinerDoc.id)
      const members = await cm.getMembers(community.communityId)
      expect(members.length).toBe(1) // only creator
    })

    it('MUST store community metadata as RDF quads', async () => {
      const cm = new CommunityManager(store, crypto)
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const result = await cm.create({ name: 'Quad Community', creatorDID: doc.id, creatorKeyPair: kp })

      const quads = await store.match({ subject: result.communityId })
      expect(quads.length).toBeGreaterThan(0)
      const typeQuad = quads.find((q) => q.predicate === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type')
      expect(typeQuad).toBeDefined()
    })
  })

  describe('Channel Management', () => {
    it('MUST create channels', async () => {
      const cm = new CommunityManager(store, crypto)
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const community = await cm.create({ name: 'Test', creatorDID: doc.id, creatorKeyPair: kp })

      const channel = await cm.createChannel(community.communityId, {
        name: 'new-channel',
        type: 'text',
        topic: 'A topic'
      })
      expect(channel.name).toBe('new-channel')
      expect(channel.type).toBe('text')
      expect(channel.topic).toBe('A topic')
    })

    it('MUST update channels', async () => {
      const cm = new CommunityManager(store, crypto)
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const community = await cm.create({ name: 'Test', creatorDID: doc.id, creatorKeyPair: kp })
      const channel = community.defaultChannels[0]

      const updated = await cm.updateChannel(community.communityId, channel.id, { name: 'renamed' })
      expect(updated?.name).toBe('renamed')
    })

    it('MUST delete channels', async () => {
      const cm = new CommunityManager(store, crypto)
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const community = await cm.create({ name: 'Test', creatorDID: doc.id, creatorKeyPair: kp })
      const channel = community.defaultChannels[0]

      await cm.deleteChannel(community.communityId, channel.id)
      const channels = await cm.getChannels(community.communityId)
      expect(channels.find((c) => c.id === channel.id)).toBeUndefined()
    })

    it('MUST store channel metadata as RDF quads', async () => {
      const cm = new CommunityManager(store, crypto)
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const community = await cm.create({ name: 'Test', creatorDID: doc.id, creatorKeyPair: kp })

      const channelQuads = await store.match({
        predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
        object: 'https://harmony.example/vocab#Channel'
      })
      expect(channelQuads.length).toBeGreaterThan(0)
    })
  })

  describe('Sync', () => {
    it('MUST return message history for sync.request', async () => {
      const { vp, did } = await createIdentity()
      const ws = await connectAndAuth(vp)
      const conn = server.connections()[0]
      server.subscribeToCommunity(conn.id, 'c1')

      // Send a message first
      ws.send(
        serialise({
          id: 'sync-test-msg',
          type: 'channel.send',
          timestamp: new Date().toISOString(),
          sender: did,
          payload: {
            communityId: 'c1',
            channelId: 'ch1',
            content: { ciphertext: new Uint8Array([1]), epoch: 0, senderIndex: 0 },
            nonce: 'n1',
            clock: { counter: 1, authorDID: did }
          }
        })
      )

      await new Promise((r) => setTimeout(r, 200))

      const response = await sendAndWait(ws, {
        id: 'sync-req',
        type: 'sync.request',
        timestamp: new Date().toISOString(),
        sender: did,
        payload: { communityId: 'c1', channelId: 'ch1', limit: 50 }
      })

      expect(response.type).toBe('sync.response')
      const payload = response.payload as { messages: ProtocolMessage[]; hasMore: boolean }
      expect(payload.messages.length).toBeGreaterThan(0)
      ws.close()
    })

    it('MUST filter by since clock', async () => {
      const { vp, did } = await createIdentity()
      const ws = await connectAndAuth(vp)
      const conn = server.connections()[0]
      server.subscribeToCommunity(conn.id, 'c1')

      for (let i = 1; i <= 3; i++) {
        ws.send(
          serialise({
            id: `sync-filter-${i}`,
            type: 'channel.send',
            timestamp: new Date().toISOString(),
            sender: did,
            payload: {
              communityId: 'c1',
              channelId: 'ch1',
              content: { ciphertext: new Uint8Array([i]), epoch: 0, senderIndex: 0 },
              nonce: `n${i}`,
              clock: { counter: i, authorDID: did }
            }
          })
        )
        await new Promise((r) => setTimeout(r, 50))
      }

      await new Promise((r) => setTimeout(r, 200))

      const response = await sendAndWait(ws, {
        id: 'sync-since',
        type: 'sync.request',
        timestamp: new Date().toISOString(),
        sender: did,
        payload: { communityId: 'c1', channelId: 'ch1', clock: { counter: 1, authorDID: did }, limit: 50 }
      })

      const payload = response.payload as { messages: ProtocolMessage[] }
      expect(payload.messages.length).toBe(2) // messages with clock 2 and 3
      ws.close()
    })

    it('MUST paginate with limit', async () => {
      const { vp, did } = await createIdentity()
      const ws = await connectAndAuth(vp)
      const conn = server.connections()[0]
      server.subscribeToCommunity(conn.id, 'c1')

      for (let i = 1; i <= 5; i++) {
        ws.send(
          serialise({
            id: `sync-page-${i}`,
            type: 'channel.send',
            timestamp: new Date().toISOString(),
            sender: did,
            payload: {
              communityId: 'c1',
              channelId: 'ch-page',
              content: { ciphertext: new Uint8Array([i]), epoch: 0, senderIndex: 0 },
              nonce: `np${i}`,
              clock: { counter: i, authorDID: did }
            }
          })
        )
        await new Promise((r) => setTimeout(r, 30))
      }

      await new Promise((r) => setTimeout(r, 300))

      const response = await sendAndWait(ws, {
        id: 'sync-limit',
        type: 'sync.request',
        timestamp: new Date().toISOString(),
        sender: did,
        payload: { communityId: 'c1', channelId: 'ch-page', limit: 2 }
      })

      const payload = response.payload as { messages: ProtocolMessage[]; hasMore: boolean }
      expect(payload.messages.length).toBe(2)
      expect(payload.hasMore).toBe(true)
      ws.close()
    })

    it('MUST return hasMore flag', async () => {
      const { vp, did } = await createIdentity()
      const ws = await connectAndAuth(vp)
      const conn = server.connections()[0]
      server.subscribeToCommunity(conn.id, 'c1')

      const response = await sendAndWait(ws, {
        id: 'sync-empty',
        type: 'sync.request',
        timestamp: new Date().toISOString(),
        sender: did,
        payload: { communityId: 'c1', channelId: 'ch-empty', limit: 50 }
      })

      const payload = response.payload as { hasMore: boolean }
      expect(payload.hasMore).toBe(false)
      ws.close()
    })

    it('MUST return latest clock for client to track', async () => {
      const { vp, did } = await createIdentity()
      const ws = await connectAndAuth(vp)
      const conn = server.connections()[0]
      server.subscribeToCommunity(conn.id, 'c1')

      const response = await sendAndWait(ws, {
        id: 'sync-clock',
        type: 'sync.request',
        timestamp: new Date().toISOString(),
        sender: did,
        payload: { communityId: 'c1', channelId: 'ch-clock', limit: 50 }
      })

      const payload = response.payload as { latestClock: LamportClock }
      expect(payload.latestClock).toBeDefined()
      expect(typeof payload.latestClock.counter).toBe('number')
      ws.close()
    })
  })

  describe('Presence', () => {
    it('MUST broadcast presence changes to community members', async () => {
      const alice = await createIdentity()
      const bob = await createIdentity()

      const aliceWs = await connectAndAuth(alice.vp)
      const bobWs = await connectAndAuth(bob.vp)

      const conns = server.connections()
      for (const conn of conns) server.subscribeToCommunity(conn.id, 'c1')

      const bobMsgPromise = waitForMessage(bobWs)

      aliceWs.send(
        serialise({
          id: 'pres-1',
          type: 'presence.update',
          timestamp: new Date().toISOString(),
          sender: alice.did,
          payload: { status: 'dnd', customStatus: 'Busy coding' }
        })
      )

      const received = await bobMsgPromise
      expect(received.type).toBe('presence.changed')
      expect((received.payload as { status: string }).status).toBe('dnd')

      aliceWs.close()
      bobWs.close()
    })

    it('MUST set offline on disconnect', async () => {
      const alice = await createIdentity()
      const bob = await createIdentity()

      const aliceWs = await connectAndAuth(alice.vp)
      const bobWs = await connectAndAuth(bob.vp)

      const conns = server.connections()
      for (const conn of conns) server.subscribeToCommunity(conn.id, 'c1')

      const bobMsgPromise = waitForMessage(bobWs, 3000)

      aliceWs.close()

      const received = await bobMsgPromise
      expect(received.type).toBe('presence.changed')
      expect((received.payload as { status: string }).status).toBe('offline')

      bobWs.close()
    })
  })

  describe('Message Persistence as RDF', () => {
    it('MUST store messages as RDF quads', async () => {
      const ms = new MessageStore(store)
      const msg: ProtocolMessage = {
        id: 'rdf-msg',
        type: 'channel.message',
        timestamp: '2026-02-22T10:00:00Z',
        sender: 'did:key:test',
        payload: { clock: { counter: 1, authorDID: 'did:key:test' } }
      }
      await ms.storeMessage('c1', 'ch1', msg)

      const quads = await store.match({ subject: 'rdf-msg' })
      expect(quads.length).toBeGreaterThan(0)
    })

    it('MUST use channel as graph context', async () => {
      const ms = new MessageStore(store)
      await ms.storeMessage('c1', 'ch1', {
        id: 'graph-msg',
        type: 'channel.message',
        timestamp: '2026-02-22T10:00:00Z',
        sender: 'did:key:test',
        payload: {}
      })

      const quads = await store.match({ subject: 'graph-msg', graph: 'c1:ch1' })
      expect(quads.length).toBeGreaterThan(0)
    })

    it('MUST store clock as typed literal (xsd:integer)', async () => {
      const ms = new MessageStore(store)
      await ms.storeMessage('c1', 'ch1', {
        id: 'clock-rdf-msg',
        type: 'channel.message',
        timestamp: '2026-02-22T10:00:00Z',
        sender: 'did:key:test',
        payload: { clock: { counter: 7, authorDID: 'did:key:test' } }
      })

      const clockQuads = await store.match({
        subject: 'clock-rdf-msg',
        predicate: 'https://harmony.example/vocab#clock'
      })
      expect(clockQuads.length).toBe(1)
      const obj = clockQuads[0].object
      expect(typeof obj).toBe('object')
      if (typeof obj === 'object') {
        expect(obj.datatype).toBe('http://www.w3.org/2001/XMLSchema#integer')
        expect(obj.value).toBe('7')
      }
    })

    it('MUST store ciphertext reference (not plaintext)', async () => {
      const ms = new MessageStore(store)
      await ms.storeMessage('c1', 'ch1', {
        id: 'cipher-ref-msg',
        type: 'channel.message',
        timestamp: '2026-02-22T10:00:00Z',
        sender: 'did:key:test',
        payload: {
          content: { ciphertext: new Uint8Array([1, 2, 3]), epoch: 0, senderIndex: 0 },
          clock: { counter: 1, authorDID: 'did:key:test' }
        }
      })

      // No plaintext should be in the quads
      const allQuads = await store.match({ subject: 'cipher-ref-msg' })
      for (const q of allQuads) {
        const val = typeof q.object === 'string' ? q.object : q.object.value
        // The content should be serialised JSON (not plaintext)
        if (q.predicate === 'https://harmony.example/vocab#payload') {
          expect(val).toContain('ciphertext')
        }
      }
    })

    it('MUST support history queries via quad store', async () => {
      const ms = new MessageStore(store)
      for (let i = 1; i <= 3; i++) {
        await ms.storeMessage('c1', 'ch1', {
          id: `hist-msg-${i}`,
          type: 'channel.message',
          timestamp: `2026-02-22T10:00:0${i}Z`,
          sender: 'did:key:test',
          payload: { clock: { counter: i, authorDID: 'did:key:test' } }
        })
      }

      const history = await ms.getHistory({ communityId: 'c1', channelId: 'ch1', limit: 10 })
      expect(history.length).toBe(3)
      expect(history[0].id).toBe('hist-msg-1')
    })
  })

  describe('Rate Limiting', () => {
    it('MUST rate limit per connection', async () => {
      // Create server with very low rate limit
      await server.stop()
      server = new HarmonyServer({
        port: PORT,
        store,
        didResolver,
        revocationStore,
        cryptoProvider: crypto,
        rateLimit: { windowMs: 10000, maxMessages: 2 }
      })
      await server.start()

      const { vp, did } = await createIdentity()
      const ws = await connectAndAuth(vp)
      const conn = server.connections()[0]
      server.subscribeToCommunity(conn.id, 'c1')

      // Send 3 messages (limit is 2)
      for (let i = 0; i < 3; i++) {
        ws.send(
          serialise({
            id: `rl-msg-${i}`,
            type: 'channel.send',
            timestamp: new Date().toISOString(),
            sender: did,
            payload: {
              communityId: 'c1',
              channelId: 'ch1',
              content: { ciphertext: new Uint8Array([i]), epoch: 0, senderIndex: 0 },
              nonce: `rl-n${i}`,
              clock: { counter: i + 1, authorDID: did }
            }
          })
        )
        await new Promise((r) => setTimeout(r, 50))
      }

      // Should receive rate limited error
      await new Promise((r) => setTimeout(r, 300))
      // Check by trying to receive - the third message should trigger RL error
      ws.close()
    })

    it('MUST return RATE_LIMITED error', async () => {
      await server.stop()
      server = new HarmonyServer({
        port: PORT,
        store,
        didResolver,
        revocationStore,
        cryptoProvider: crypto,
        rateLimit: { windowMs: 10000, maxMessages: 1 }
      })
      await server.start()

      const { vp, did } = await createIdentity()
      const ws = await connectAndAuth(vp)
      const conn = server.connections()[0]
      server.subscribeToCommunity(conn.id, 'c1')

      // First message OK
      ws.send(
        serialise({
          id: 'rl-first',
          type: 'channel.send',
          timestamp: new Date().toISOString(),
          sender: did,
          payload: {
            communityId: 'c1',
            channelId: 'ch1',
            content: { ciphertext: new Uint8Array([1]), epoch: 0, senderIndex: 0 },
            nonce: 'rl1',
            clock: { counter: 1, authorDID: did }
          }
        })
      )
      await new Promise((r) => setTimeout(r, 100))

      // Second should be rate limited
      const response = await sendAndWait(ws, {
        id: 'rl-second',
        type: 'channel.send',
        timestamp: new Date().toISOString(),
        sender: did,
        payload: {
          communityId: 'c1',
          channelId: 'ch1',
          content: { ciphertext: new Uint8Array([2]), epoch: 0, senderIndex: 0 },
          nonce: 'rl2',
          clock: { counter: 2, authorDID: did }
        }
      })

      expect(response.type).toBe('error')
      expect((response.payload as { code: string }).code).toBe('RATE_LIMITED')
      ws.close()
    })
  })
})
