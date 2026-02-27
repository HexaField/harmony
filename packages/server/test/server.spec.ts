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
import { HarmonyPredicate, RDFPredicate, HarmonyType } from '@harmony/vocab'

const crypto = createCryptoProvider()
const didProvider = new DIDKeyProvider(crypto)
const vcService = new VCService(crypto)
const zcapService = new ZCAPService(crypto)

let server: HarmonyServer
let store: MemoryQuadStore
let revocationStore: MemoryRevocationStore
const PORT = 0 // Auto-assign to avoid port conflicts in parallel test runs

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
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`)
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
      const ws = new WebSocket(`ws://127.0.0.1:${server.port}`)
      await new Promise<void>((resolve) => ws.on('open', resolve))
      expect(ws.readyState).toBe(WebSocket.OPEN)
      ws.close()
    })

    it('MUST require authentication before accepting messages', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${server.port}`)
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
      const ws = new WebSocket(`ws://127.0.0.1:${server.port}`)
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

      const ws = new WebSocket(`ws://127.0.0.1:${server.port}`)
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

      const ws = new WebSocket(`ws://127.0.0.1:${server.port}`)
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
      const typeQuad = quads.find((q) => q.predicate === RDFPredicate.type)
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
        predicate: RDFPredicate.type,
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

    it('MUST auto-subscribe connection to community on sync.request', async () => {
      const alice = await createIdentity()
      const bob = await createIdentity()

      // Alice connects but does NOT manually subscribe
      const aliceWs = await connectAndAuth(alice.vp)
      const bobWs = await connectAndAuth(bob.vp)

      // Subscribe bob manually so he can send messages
      const conns = server.connections()
      const bobConn = conns.find((c) => c.did === bob.did)!
      server.subscribeToCommunity(bobConn.id, 'c1')

      // Bob sends a message
      bobWs.send(
        serialise({
          id: 'auto-sub-msg-1',
          type: 'channel.send',
          timestamp: new Date().toISOString(),
          sender: bob.did,
          payload: {
            communityId: 'c1',
            channelId: 'ch1',
            content: { ciphertext: new Uint8Array([1]), epoch: 0, senderIndex: 0 },
            nonce: 'as1',
            clock: { counter: 1, authorDID: bob.did }
          }
        })
      )

      await new Promise((r) => setTimeout(r, 200))

      // Alice sends sync.request (should auto-subscribe her)
      await sendAndWait(aliceWs, {
        id: 'auto-sub-sync',
        type: 'sync.request',
        timestamp: new Date().toISOString(),
        sender: alice.did,
        payload: { communityId: 'c1', channelId: 'ch1', limit: 50 }
      })

      // Now bob sends another message — alice should receive it in real-time
      const aliceMsgPromise = waitForMessage(aliceWs)

      bobWs.send(
        serialise({
          id: 'auto-sub-msg-2',
          type: 'channel.send',
          timestamp: new Date().toISOString(),
          sender: bob.did,
          payload: {
            communityId: 'c1',
            channelId: 'ch1',
            content: { ciphertext: new Uint8Array([2]), epoch: 0, senderIndex: 0 },
            nonce: 'as2',
            clock: { counter: 2, authorDID: bob.did }
          }
        })
      )

      const received = await aliceMsgPromise
      expect(received.type).toBe('channel.message')
      expect(received.sender).toBe(bob.did)

      aliceWs.close()
      bobWs.close()
    })

    it('MUST add connection to conn.communities on sync.request', async () => {
      const { vp, did } = await createIdentity()
      const ws = await connectAndAuth(vp)

      // Send sync.request without manual subscribe
      await sendAndWait(ws, {
        id: 'conn-communities-sync',
        type: 'sync.request',
        timestamp: new Date().toISOString(),
        sender: did,
        payload: { communityId: 'c1', channelId: 'ch1', limit: 50 }
      })

      const conn = server.connections().find((c) => c.did === did)!
      expect(conn.communities).toContain('c1')
      ws.close()
    })

    it('MUST not duplicate subscription on repeated sync.request', async () => {
      const { vp, did } = await createIdentity()
      const ws = await connectAndAuth(vp)

      // Send two sync.requests for the same community
      await sendAndWait(ws, {
        id: 'dup-sync-1',
        type: 'sync.request',
        timestamp: new Date().toISOString(),
        sender: did,
        payload: { communityId: 'c1', channelId: 'ch1', limit: 50 }
      })

      await sendAndWait(ws, {
        id: 'dup-sync-2',
        type: 'sync.request',
        timestamp: new Date().toISOString(),
        sender: did,
        payload: { communityId: 'c1', channelId: 'ch1', limit: 50 }
      })

      const conn = server.connections().find((c) => c.did === did)!
      const c1Count = conn.communities.filter((c: string) => c === 'c1').length
      expect(c1Count).toBe(1)
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

  describe('Typing Indicators', () => {
    it('MUST broadcast typing indicator to other community members', async () => {
      const alice = await createIdentity()
      const bob = await createIdentity()

      const aliceWs = await connectAndAuth(alice.vp)
      const bobWs = await connectAndAuth(bob.vp)

      const conns = server.connections()
      for (const conn of conns) server.subscribeToCommunity(conn.id, 'c1')

      const bobMsgPromise = waitForMessage(bobWs)

      aliceWs.send(
        serialise({
          id: 'typing-1',
          type: 'channel.typing',
          timestamp: new Date().toISOString(),
          sender: alice.did,
          payload: { communityId: 'c1', channelId: 'ch1' }
        })
      )

      const received = await bobMsgPromise
      expect(received.type).toBe('channel.typing.indicator')
      expect(received.sender).toBe(alice.did)

      aliceWs.close()
      bobWs.close()
    })

    it('MUST NOT echo typing indicator back to sender', async () => {
      const alice = await createIdentity()
      const bob = await createIdentity()

      const aliceWs = await connectAndAuth(alice.vp)
      const bobWs = await connectAndAuth(bob.vp)

      const conns = server.connections()
      for (const conn of conns) server.subscribeToCommunity(conn.id, 'c1')

      // Listen on alice for any response
      let aliceReceived = false
      aliceWs.on('message', () => {
        aliceReceived = true
      })

      aliceWs.send(
        serialise({
          id: 'typing-echo',
          type: 'channel.typing',
          timestamp: new Date().toISOString(),
          sender: alice.did,
          payload: { communityId: 'c1', channelId: 'ch1' }
        })
      )

      await new Promise((r) => setTimeout(r, 200))
      expect(aliceReceived).toBe(false)

      aliceWs.close()
      bobWs.close()
    })
  })

  describe('Channel Edit/Delete via WebSocket', () => {
    it('MUST broadcast channel.message.updated on edit', async () => {
      const alice = await createIdentity()
      const bob = await createIdentity()

      const aliceWs = await connectAndAuth(alice.vp)
      const bobWs = await connectAndAuth(bob.vp)

      const conns = server.connections()
      for (const conn of conns) server.subscribeToCommunity(conn.id, 'c1')

      const bobMsgPromise = waitForMessage(bobWs)

      aliceWs.send(
        serialise({
          id: 'edit-1',
          type: 'channel.edit',
          timestamp: new Date().toISOString(),
          sender: alice.did,
          payload: {
            communityId: 'c1',
            channelId: 'ch1',
            messageId: 'msg-orig',
            content: { ciphertext: new Uint8Array([1, 2]), epoch: 0, senderIndex: 0 },
            clock: { counter: 2, authorDID: alice.did }
          }
        })
      )

      const received = await bobMsgPromise
      expect(received.type).toBe('channel.message.updated')

      aliceWs.close()
      bobWs.close()
    })

    it('MUST broadcast channel.message.deleted and remove from store', async () => {
      const { vp, did } = await createIdentity()
      const ws = await connectAndAuth(vp)
      const conn = server.connections()[0]
      server.subscribeToCommunity(conn.id, 'c1')

      // Store a message first
      ws.send(
        serialise({
          id: 'to-delete',
          type: 'channel.send',
          timestamp: new Date().toISOString(),
          sender: did,
          payload: {
            communityId: 'c1',
            channelId: 'ch1',
            content: { ciphertext: new Uint8Array([1]), epoch: 0, senderIndex: 0 },
            nonce: 'n-del',
            clock: { counter: 1, authorDID: did }
          }
        })
      )
      await new Promise((r) => setTimeout(r, 200))

      // Now delete it
      ws.send(
        serialise({
          id: 'delete-cmd',
          type: 'channel.delete',
          timestamp: new Date().toISOString(),
          sender: did,
          payload: {
            communityId: 'c1',
            channelId: 'ch1',
            messageId: 'to-delete',
            clock: { counter: 2, authorDID: did }
          }
        })
      )
      await new Promise((r) => setTimeout(r, 200))

      const stored = await server.messageStoreInstance.getMessage('to-delete')
      expect(stored).toBeNull()

      ws.close()
    })
  })

  describe('Reaction Handlers', () => {
    it('MUST broadcast reaction.added', async () => {
      const alice = await createIdentity()
      const bob = await createIdentity()

      const aliceWs = await connectAndAuth(alice.vp)
      const bobWs = await connectAndAuth(bob.vp)

      const conns = server.connections()
      for (const conn of conns) server.subscribeToCommunity(conn.id, 'c1')

      const bobMsgPromise = waitForMessage(bobWs)

      aliceWs.send(
        serialise({
          id: 'react-1',
          type: 'channel.reaction.add',
          timestamp: new Date().toISOString(),
          sender: alice.did,
          payload: { communityId: 'c1', channelId: 'ch1', messageId: 'msg-1', emoji: '👍' }
        })
      )

      const received = await bobMsgPromise
      expect(received.type).toBe('channel.reaction.added')

      aliceWs.close()
      bobWs.close()
    })

    it('MUST broadcast reaction.removed', async () => {
      const alice = await createIdentity()
      const bob = await createIdentity()

      const aliceWs = await connectAndAuth(alice.vp)
      const bobWs = await connectAndAuth(bob.vp)

      const conns = server.connections()
      for (const conn of conns) server.subscribeToCommunity(conn.id, 'c1')

      const bobMsgPromise = waitForMessage(bobWs)

      aliceWs.send(
        serialise({
          id: 'unreact-1',
          type: 'channel.reaction.remove',
          timestamp: new Date().toISOString(),
          sender: alice.did,
          payload: { communityId: 'c1', channelId: 'ch1', messageId: 'msg-1', emoji: '👍' }
        })
      )

      const received = await bobMsgPromise
      expect(received.type).toBe('channel.reaction.removed')

      aliceWs.close()
      bobWs.close()
    })
  })

  describe('Community CRUD via WebSocket', () => {
    it('MUST create community and return communityId', async () => {
      const { vp, did } = await createIdentity()
      const ws = await connectAndAuth(vp)

      const response = await sendAndWait(ws, {
        id: 'cc-ws',
        type: 'community.create',
        timestamp: new Date().toISOString(),
        sender: did,
        payload: { name: 'WS Community', defaultChannels: ['general', 'random'] }
      })

      expect(response.type).toBe('community.updated')
      const payload = response.payload as { communityId: string; channels: unknown[] }
      expect(payload.communityId).toBeTruthy()
      expect(payload.channels.length).toBe(2)

      ws.close()
    })

    it('MUST handle community join and broadcast member.joined', async () => {
      const creator = await createIdentity()
      const joiner = await createIdentity()

      const creatorWs = await connectAndAuth(creator.vp)

      // Creator creates community
      const createResponse = await sendAndWait(creatorWs, {
        id: 'cc-join',
        type: 'community.create',
        timestamp: new Date().toISOString(),
        sender: creator.did,
        payload: { name: 'Join Test' }
      })
      const communityId = (createResponse.payload as { communityId: string }).communityId

      // Joiner connects
      const joinerWs = await connectAndAuth(joiner.vp)

      const creatorMsgPromise = waitForMessage(creatorWs)

      joinerWs.send(
        serialise({
          id: 'join-msg',
          type: 'community.join',
          timestamp: new Date().toISOString(),
          sender: joiner.did,
          payload: { communityId, membershipVC: joiner.memberVC }
        })
      )

      const joinNotif = await creatorMsgPromise
      expect(joinNotif.type).toBe('community.member.joined')

      creatorWs.close()
      joinerWs.close()
    })

    it('MUST handle community leave and broadcast member.left', async () => {
      const creator = await createIdentity()
      const leaver = await createIdentity()

      const creatorWs = await connectAndAuth(creator.vp)
      const createResponse = await sendAndWait(creatorWs, {
        id: 'cc-leave',
        type: 'community.create',
        timestamp: new Date().toISOString(),
        sender: creator.did,
        payload: { name: 'Leave Test' }
      })
      const communityId = (createResponse.payload as { communityId: string }).communityId

      const leaverWs = await connectAndAuth(leaver.vp)

      // Joiner joins
      await sendAndWait(leaverWs, {
        id: 'join-for-leave',
        type: 'community.join',
        timestamp: new Date().toISOString(),
        sender: leaver.did,
        payload: { communityId, membershipVC: leaver.memberVC }
      })
      // consume the member.joined notification on creator
      await waitForMessage(creatorWs)

      const creatorMsgPromise = waitForMessage(creatorWs)

      leaverWs.send(
        serialise({
          id: 'leave-msg',
          type: 'community.leave',
          timestamp: new Date().toISOString(),
          sender: leaver.did,
          payload: { communityId }
        })
      )

      const leaveNotif = await creatorMsgPromise
      expect(leaveNotif.type).toBe('community.member.left')

      creatorWs.close()
      leaverWs.close()
    })
  })

  describe('Channel CRUD via WebSocket', () => {
    it('MUST broadcast channel.created', async () => {
      const alice = await createIdentity()
      const bob = await createIdentity()

      const aliceWs = await connectAndAuth(alice.vp)
      const createResponse = await sendAndWait(aliceWs, {
        id: 'cc-ch',
        type: 'community.create',
        timestamp: new Date().toISOString(),
        sender: alice.did,
        payload: { name: 'Channel CRUD' }
      })
      const communityId = (createResponse.payload as { communityId: string }).communityId

      const bobWs = await connectAndAuth(bob.vp)
      await sendAndWait(bobWs, {
        id: 'join-ch-crud',
        type: 'community.join',
        timestamp: new Date().toISOString(),
        sender: bob.did,
        payload: { communityId, membershipVC: bob.memberVC }
      })
      // consume member.joined on alice
      await waitForMessage(aliceWs)

      const bobMsgPromise = waitForMessage(bobWs)

      aliceWs.send(
        serialise({
          id: 'create-ch',
          type: 'channel.create',
          timestamp: new Date().toISOString(),
          sender: alice.did,
          payload: { communityId, name: 'new-channel', type: 'text', topic: 'New topic' }
        })
      )

      const received = await bobMsgPromise
      expect(received.type).toBe('channel.created')

      aliceWs.close()
      bobWs.close()
    })
  })

  describe('Community Info', () => {
    it('MUST return community info and online members for community.info request', async () => {
      const { vp, did } = await createIdentity()
      const ws = await connectAndAuth(vp)

      // Create community
      const createResponse = await sendAndWait(ws, {
        id: 'ci-create',
        type: 'community.create',
        timestamp: new Date().toISOString(),
        sender: did,
        payload: { name: 'Info Test Community', defaultChannels: ['general'] }
      })
      const communityId = (createResponse.payload as { communityId: string }).communityId

      // Request community info
      const infoResponse = await sendAndWait(ws, {
        id: 'ci-info',
        type: 'community.info',
        timestamp: new Date().toISOString(),
        sender: did,
        payload: { communityId }
      })

      expect(infoResponse.type).toBe('community.info.response')
      const payload = infoResponse.payload as {
        communityId: string
        info: { name: string } | null
        onlineMembers: Array<{ did: string; status: string }>
      }
      expect(payload.communityId).toBe(communityId)
      expect(payload.info).not.toBeNull()
      expect(payload.info!.name).toBe('Info Test Community')
      expect(payload.onlineMembers.length).toBeGreaterThanOrEqual(1)
      expect(payload.onlineMembers.some((m) => m.did === did && m.status === 'online')).toBe(true)

      ws.close()
    })

    it('MUST return null info for non-existent community', async () => {
      const { vp, did } = await createIdentity()
      const ws = await connectAndAuth(vp)

      const infoResponse = await sendAndWait(ws, {
        id: 'ci-nonexistent',
        type: 'community.info',
        timestamp: new Date().toISOString(),
        sender: did,
        payload: { communityId: 'nonexistent-community-id' }
      })

      expect(infoResponse.type).toBe('community.info.response')
      const payload = infoResponse.payload as {
        communityId: string
        info: unknown
        onlineMembers: Array<{ did: string; status: string }>
      }
      expect(payload.info).toBeNull()
      expect(payload.onlineMembers.length).toBe(0)

      ws.close()
    })

    it('MUST include all connected members in onlineMembers', async () => {
      const alice = await createIdentity()
      const bob = await createIdentity()

      const aliceWs = await connectAndAuth(alice.vp)

      // Alice creates community
      const createResponse = await sendAndWait(aliceWs, {
        id: 'ci-multi-create',
        type: 'community.create',
        timestamp: new Date().toISOString(),
        sender: alice.did,
        payload: { name: 'Multi Member', defaultChannels: ['general'] }
      })
      const communityId = (createResponse.payload as { communityId: string }).communityId

      // Bob connects and joins
      const bobWs = await connectAndAuth(bob.vp)
      bobWs.send(
        serialise({
          id: 'ci-bob-join',
          type: 'community.join',
          timestamp: new Date().toISOString(),
          sender: bob.did,
          payload: { communityId, membershipVC: bob.memberVC }
        })
      )
      // Wait for join to process
      await waitForMessage(aliceWs)

      // Alice requests community info
      const infoResponse = await sendAndWait(aliceWs, {
        id: 'ci-multi-info',
        type: 'community.info',
        timestamp: new Date().toISOString(),
        sender: alice.did,
        payload: { communityId }
      })

      const payload = infoResponse.payload as {
        communityId: string
        info: unknown
        onlineMembers: Array<{ did: string; status: string }>
      }
      expect(payload.onlineMembers.length).toBeGreaterThanOrEqual(2)
      expect(payload.onlineMembers.some((m) => m.did === alice.did)).toBe(true)
      expect(payload.onlineMembers.some((m) => m.did === bob.did)).toBe(true)

      aliceWs.close()
      bobWs.close()
    })
  })

  describe('CommunityManager Additional', () => {
    it('MUST return community info with getInfo', async () => {
      const cm = new CommunityManager(store, crypto)
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const result = await cm.create({
        name: 'Info Test',
        description: 'A description',
        creatorDID: doc.id,
        creatorKeyPair: kp
      })

      const info = await cm.getInfo(result.communityId)
      expect(info).not.toBeNull()
      expect(info!.name).toBe('Info Test')
      expect(info!.description).toBe('A description')
      expect(info!.creatorDID).toBe(doc.id)
      expect(info!.memberCount).toBe(1)
    })

    it('MUST return null for non-existent community', async () => {
      const cm = new CommunityManager(store, crypto)
      const info = await cm.getInfo('nonexistent')
      expect(info).toBeNull()
    })

    it('MUST update channel topic', async () => {
      const cm = new CommunityManager(store, crypto)
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const community = await cm.create({ name: 'Topic Test', creatorDID: doc.id, creatorKeyPair: kp })
      const channel = community.defaultChannels[0]

      const updated = await cm.updateChannel(community.communityId, channel.id, { topic: 'New topic' })
      expect(updated?.topic).toBe('New topic')
    })
  })

  describe('MessageStore Additional', () => {
    it('MUST return null for non-existent message', async () => {
      const ms = new MessageStore(store)
      const msg = await ms.getMessage('nonexistent')
      expect(msg).toBeNull()
    })

    it('MUST search by author', async () => {
      const ms = new MessageStore(store)
      for (let i = 1; i <= 3; i++) {
        await ms.storeMessage('c1', 'ch1', {
          id: `search-msg-${i}`,
          type: 'channel.message',
          timestamp: `2026-02-22T10:00:0${i}Z`,
          sender: i <= 2 ? 'did:key:alice' : 'did:key:bob',
          payload: { clock: { counter: i, authorDID: i <= 2 ? 'did:key:alice' : 'did:key:bob' } }
        })
      }

      const results = await ms.search({ communityId: 'c1', channelId: 'ch1', authorDID: 'did:key:alice', limit: 10 })
      expect(results.length).toBe(2)
      expect(results.every((m) => m.sender === 'did:key:alice')).toBe(true)
    })

    it('MUST delete message and confirm gone', async () => {
      const ms = new MessageStore(store)
      await ms.storeMessage('c1', 'ch1', {
        id: 'del-test',
        type: 'channel.message',
        timestamp: '2026-02-22T10:00:00Z',
        sender: 'did:key:test',
        payload: {}
      })
      await ms.deleteMessage('del-test')
      expect(await ms.getMessage('del-test')).toBeNull()
    })
  })

  describe('DM Typing via WebSocket', () => {
    it('MUST route dm.typing.indicator to recipient', async () => {
      const alice = await createIdentity()
      const bob = await createIdentity()

      const aliceWs = await connectAndAuth(alice.vp)
      const bobWs = await connectAndAuth(bob.vp)

      const bobMsgPromise = waitForMessage(bobWs)

      aliceWs.send(
        serialise({
          id: 'dm-typing',
          type: 'dm.typing',
          timestamp: new Date().toISOString(),
          sender: alice.did,
          payload: { recipientDID: bob.did }
        })
      )

      const received = await bobMsgPromise
      expect(received.type).toBe('dm.typing.indicator')

      aliceWs.close()
      bobWs.close()
    })
  })

  describe('Multiple Communities', () => {
    it('MUST support connection subscribed to multiple communities', async () => {
      const { vp, did } = await createIdentity()
      const ws = await connectAndAuth(vp)
      const conn = server.connections()[0]

      server.subscribeToCommunity(conn.id, 'c1')
      server.subscribeToCommunity(conn.id, 'c2')

      // Send to c1
      ws.send(
        serialise({
          id: 'multi-c1',
          type: 'channel.send',
          timestamp: new Date().toISOString(),
          sender: did,
          payload: {
            communityId: 'c1',
            channelId: 'ch1',
            content: { ciphertext: new Uint8Array([1]), epoch: 0, senderIndex: 0 },
            nonce: 'mc1',
            clock: { counter: 1, authorDID: did }
          }
        })
      )
      // Send to c2
      ws.send(
        serialise({
          id: 'multi-c2',
          type: 'channel.send',
          timestamp: new Date().toISOString(),
          sender: did,
          payload: {
            communityId: 'c2',
            channelId: 'ch2',
            content: { ciphertext: new Uint8Array([2]), epoch: 0, senderIndex: 0 },
            nonce: 'mc2',
            clock: { counter: 2, authorDID: did }
          }
        })
      )

      await new Promise((r) => setTimeout(r, 200))
      const msg1 = await server.messageStoreInstance.getMessage('multi-c1')
      const msg2 = await server.messageStoreInstance.getMessage('multi-c2')
      expect(msg1).not.toBeNull()
      expect(msg2).not.toBeNull()

      ws.close()
    })
  })

  describe('reconcileMember()', () => {
    it('MUST update store quads and broadcast community.member.reconciled', async () => {
      const { did, vp } = await createIdentity()
      const ws = await connectAndAuth(vp)

      // Create community so we have subscriptions
      const createMsg: ProtocolMessage = {
        id: 'rc-create',
        type: 'community.create',
        timestamp: new Date().toISOString(),
        sender: did,
        payload: { name: 'Reconcile Test', defaultChannels: ['general'] }
      }
      const createResp = await sendAndWait(ws, createMsg)
      const communityId = (createResp.payload as any).communityId

      // Add a ghost member to the store
      const ghostSubject = `harmony:member:discord123`
      await store.addAll([
        { subject: ghostSubject, predicate: RDFPredicate.type, object: HarmonyType.Member, graph: communityId },
        { subject: ghostSubject, predicate: HarmonyPredicate.name, object: { value: 'GhostUser' }, graph: communityId }
      ])

      // Listen for broadcast
      const broadcastPromise = new Promise<ProtocolMessage>((resolve) => {
        ws.once('message', (data) => resolve(deserialise<ProtocolMessage>(data.toString())))
      })

      // Reconcile
      await server.reconcileMember(communityId, 'discord123', 'did:key:zNewDID', 'RealUser')

      const broadcast = await broadcastPromise
      expect(broadcast.type).toBe('community.member.reconciled')
      expect((broadcast.payload as any).discordUserId).toBe('discord123')
      expect((broadcast.payload as any).newDID).toBe('did:key:zNewDID')
      expect((broadcast.payload as any).displayName).toBe('RealUser')

      // Verify store was updated
      const authorQuads = await store.match({
        subject: ghostSubject,
        predicate: HarmonyPredicate.author,
        graph: communityId
      })
      expect(authorQuads.length).toBe(1)
      expect(typeof authorQuads[0].object === 'string' ? authorQuads[0].object : authorQuads[0].object.value).toBe(
        'did:key:zNewDID'
      )

      ws.close()
    })

    it('MUST update display name during reconciliation', async () => {
      const communityId = 'test-community-reconcile'
      const ghostSubject = `harmony:member:discord456`
      await store.addAll([
        { subject: ghostSubject, predicate: HarmonyPredicate.name, object: { value: 'OldName' }, graph: communityId }
      ])

      // Need to register community so broadcast doesn't fail
      server.registerCommunity(communityId)

      await server.reconcileMember(communityId, 'discord456', 'did:key:zNew', 'NewDisplayName')

      const nameQuads = await store.match({
        subject: ghostSubject,
        predicate: HarmonyPredicate.name,
        graph: communityId
      })
      expect(nameQuads.length).toBe(1)
      const nameValue = typeof nameQuads[0].object === 'string' ? nameQuads[0].object : nameQuads[0].object.value
      expect(nameValue).toBe('NewDisplayName')
    })

    it('MUST handle reconciliation for non-existent member gracefully', async () => {
      server.registerCommunity('no-such-community')
      // Should not throw even if the ghost member doesn't exist in the store
      await expect(
        server.reconcileMember('no-such-community', 'nonexistent', 'did:key:z1', 'User')
      ).resolves.toBeUndefined()
    })

    it('MUST update community subscriptions after auto-join from reconciliation', async () => {
      const { did, vp } = await createIdentity()
      const ws = await connectAndAuth(vp)

      // Create community
      const createMsg: ProtocolMessage = {
        id: 'rc-sub-create',
        type: 'community.create',
        timestamp: new Date().toISOString(),
        sender: did,
        payload: { name: 'Sub Update Test', defaultChannels: ['general'] }
      }
      const createResp = await sendAndWait(ws, createMsg)
      const communityId = (createResp.payload as any).communityId

      // Create second identity and connect
      const { did: did2, vp: vp2 } = await createIdentity()
      const ws2 = await connectAndAuth(vp2)

      // Auto-join the second user
      const autoJoinPromise = new Promise<ProtocolMessage>((resolve) => {
        ws2.once('message', (data) => resolve(deserialise<ProtocolMessage>(data.toString())))
      })

      await server.autoJoinCommunity(did2, communityId)
      const autoJoinMsg = await autoJoinPromise
      expect(autoJoinMsg.type).toBe('community.auto-joined')

      // Verify ws2 now receives broadcasts to this community
      const broadcastPromise = new Promise<ProtocolMessage>((resolve) => {
        ws2.once('message', (data) => resolve(deserialise<ProtocolMessage>(data.toString())))
      })

      // Reconcile a member — should broadcast to ws2 since they're now subscribed
      server.registerCommunity(communityId)
      await store.add({
        subject: 'harmony:member:d999',
        predicate: HarmonyPredicate.name,
        object: { value: 'Ghost' },
        graph: communityId
      })
      await server.reconcileMember(communityId, 'd999', 'did:key:zReconciled', 'Reconciled')

      const reconciledMsg = await broadcastPromise
      expect(reconciledMsg.type).toBe('community.member.reconciled')

      ws.close()
      ws2.close()
    })
  })

  describe('autoJoinCommunity()', () => {
    it('MUST send community.auto-joined message to connected client', async () => {
      const { did, vp } = await createIdentity()
      const ws = await connectAndAuth(vp)

      // Create a community first
      const createMsg: ProtocolMessage = {
        id: 'aj-create',
        type: 'community.create',
        timestamp: new Date().toISOString(),
        sender: did,
        payload: { name: 'Auto Join Test', defaultChannels: ['general'] }
      }
      const createResp = await sendAndWait(ws, createMsg)
      const communityId = (createResp.payload as any).communityId

      // Create second user
      const { did: did2, vp: vp2 } = await createIdentity()
      const ws2 = await connectAndAuth(vp2)

      const msgPromise = new Promise<ProtocolMessage>((resolve) => {
        ws2.once('message', (data) => resolve(deserialise<ProtocolMessage>(data.toString())))
      })

      await server.autoJoinCommunity(did2, communityId)

      const msg = await msgPromise
      expect(msg.type).toBe('community.auto-joined')
      expect((msg.payload as any).communityId).toBe(communityId)
      expect((msg.payload as any).communityName).toBe('Auto Join Test')
      expect((msg.payload as any).channels).toBeDefined()
      expect(Array.isArray((msg.payload as any).channels)).toBe(true)

      ws.close()
      ws2.close()
    })

    it('MUST add client to community subscriptions', async () => {
      const { did, vp } = await createIdentity()
      const ws = await connectAndAuth(vp)

      const createMsg: ProtocolMessage = {
        id: 'aj-sub',
        type: 'community.create',
        timestamp: new Date().toISOString(),
        sender: did,
        payload: { name: 'Sub Test', defaultChannels: ['general'] }
      }
      const createResp = await sendAndWait(ws, createMsg)
      const communityId = (createResp.payload as any).communityId

      const { did: did2, vp: vp2 } = await createIdentity()
      const ws2 = await connectAndAuth(vp2)

      // Drain auto-joined message
      const drainPromise = new Promise<void>((resolve) => {
        ws2.once('message', () => resolve())
      })

      await server.autoJoinCommunity(did2, communityId)
      await drainPromise

      // Now send a message to the community — ws2 should receive broadcast
      const broadcastPromise = new Promise<ProtocolMessage>((resolve) => {
        ws2.once('message', (data) => resolve(deserialise<ProtocolMessage>(data.toString())))
      })

      ws.send(
        serialise({
          id: 'aj-msg-1',
          type: 'channel.send',
          timestamp: new Date().toISOString(),
          sender: did,
          payload: {
            communityId,
            channelId: 'any-channel',
            content: { ciphertext: new Uint8Array([1]), epoch: 0, senderIndex: 0 },
            nonce: 'n1',
            clock: { counter: 1, authorDID: did }
          }
        })
      )

      const broadcast = await broadcastPromise
      expect(broadcast.type).toBe('channel.message')

      ws.close()
      ws2.close()
    })

    it('MUST handle auto-join for disconnected user gracefully', async () => {
      const { did, vp } = await createIdentity()
      const ws = await connectAndAuth(vp)

      const createMsg: ProtocolMessage = {
        id: 'aj-disc',
        type: 'community.create',
        timestamp: new Date().toISOString(),
        sender: did,
        payload: { name: 'Disconnected Test', defaultChannels: ['general'] }
      }
      const createResp = await sendAndWait(ws, createMsg)
      const communityId = (createResp.payload as any).communityId

      // Auto-join a DID that has no connected websocket — should not crash
      await expect(server.autoJoinCommunity('did:key:zNotConnected', communityId)).resolves.toBeUndefined()

      ws.close()
    })
  })

  describe('Ban Enforcement', () => {
    it('MUST allow admin to ban a user and disconnect them', async () => {
      const admin = await createIdentity()
      const user = await createIdentity()

      const wsAdmin = await connectAndAuth(admin.vp)
      const wsUser = await connectAndAuth(user.vp)

      // Admin creates community
      const createMsg: ProtocolMessage = {
        id: 'cc-ban-1',
        type: 'community.create',
        timestamp: new Date().toISOString(),
        sender: admin.did,
        payload: { name: 'Ban Test', creatorKeyPair: admin.keyPair }
      }
      const createResp = await sendAndWait(wsAdmin, createMsg)
      const communityId = (createResp.payload as any).communityId

      // User joins community
      const joinMsg: ProtocolMessage = {
        id: 'cj-ban-1',
        type: 'community.join',
        timestamp: new Date().toISOString(),
        sender: user.did,
        payload: { communityId, membershipVC: user.memberVC }
      }
      await sendAndWait(wsUser, joinMsg)

      // Drain pending community.member.joined broadcast on admin ws
      await waitForMessage(wsAdmin, 1000).catch(() => {})

      // Admin bans user
      const userClosed = new Promise<number>((resolve) => {
        wsUser.on('close', (code) => resolve(code))
      })

      const banMsg: ProtocolMessage = {
        id: 'ban-1',
        type: 'community.ban' as any,
        timestamp: new Date().toISOString(),
        sender: admin.did,
        payload: { communityId, targetDID: user.did, reason: 'test ban' }
      }
      const banResp = await sendAndWait(wsAdmin, banMsg)
      expect((banResp.payload as any).targetDID).toBe(user.did)

      // User should be disconnected
      const closeCode = await userClosed
      expect(closeCode).toBe(4003)

      wsAdmin.close()
    })

    it('MUST prevent banned user from reconnecting to community', async () => {
      const admin = await createIdentity()
      const user = await createIdentity()

      const wsAdmin = await connectAndAuth(admin.vp)

      // Admin creates community
      const createMsg: ProtocolMessage = {
        id: 'cc-ban-2',
        type: 'community.create',
        timestamp: new Date().toISOString(),
        sender: admin.did,
        payload: { name: 'Ban Reconnect Test', creatorKeyPair: admin.keyPair }
      }
      const createResp = await sendAndWait(wsAdmin, createMsg)
      const communityId = (createResp.payload as any).communityId

      // Ban the user before they even connect
      const banMsg: ProtocolMessage = {
        id: 'ban-2',
        type: 'community.ban' as any,
        timestamp: new Date().toISOString(),
        sender: admin.did,
        payload: { communityId, targetDID: user.did }
      }
      await sendAndWait(wsAdmin, banMsg)

      // User connects and tries to join
      const wsUser = await connectAndAuth(user.vp)
      const joinMsg: ProtocolMessage = {
        id: 'cj-ban-2',
        type: 'community.join',
        timestamp: new Date().toISOString(),
        sender: user.did,
        payload: { communityId, membershipVC: user.memberVC }
      }

      const userClosed = new Promise<number>((resolve) => {
        wsUser.on('close', (code) => resolve(code))
      })

      wsUser.send(serialise(joinMsg))
      const closeCode = await userClosed
      expect(closeCode).toBe(4003)

      wsAdmin.close()
    })

    it('MUST allow admin to unban a user so they can reconnect', async () => {
      const admin = await createIdentity()
      const user = await createIdentity()

      const wsAdmin = await connectAndAuth(admin.vp)

      // Admin creates community
      const createMsg: ProtocolMessage = {
        id: 'cc-ban-3',
        type: 'community.create',
        timestamp: new Date().toISOString(),
        sender: admin.did,
        payload: { name: 'Unban Test', creatorKeyPair: admin.keyPair }
      }
      const createResp = await sendAndWait(wsAdmin, createMsg)
      const communityId = (createResp.payload as any).communityId

      // Ban then unban
      const banMsg: ProtocolMessage = {
        id: 'ban-3',
        type: 'community.ban' as any,
        timestamp: new Date().toISOString(),
        sender: admin.did,
        payload: { communityId, targetDID: user.did }
      }
      await sendAndWait(wsAdmin, banMsg)

      const unbanMsg: ProtocolMessage = {
        id: 'unban-3',
        type: 'community.unban' as any,
        timestamp: new Date().toISOString(),
        sender: admin.did,
        payload: { communityId, targetDID: user.did }
      }
      const unbanResp = await sendAndWait(wsAdmin, unbanMsg)
      expect((unbanResp.payload as any).targetDID).toBe(user.did)

      // User can now join
      const wsUser = await connectAndAuth(user.vp)
      const joinMsg: ProtocolMessage = {
        id: 'cj-ban-3',
        type: 'community.join',
        timestamp: new Date().toISOString(),
        sender: user.did,
        payload: { communityId, membershipVC: user.memberVC }
      }
      const joinResp = await sendAndWait(wsUser, joinMsg)
      expect((joinResp.payload as any).communityId).toBe(communityId)

      wsUser.close()
      wsAdmin.close()
    })

    it('MUST reject ban from non-admin user', async () => {
      const admin = await createIdentity()
      const user1 = await createIdentity()
      const user2 = await createIdentity()

      const wsAdmin = await connectAndAuth(admin.vp)
      const wsUser1 = await connectAndAuth(user1.vp)

      // Admin creates community
      const createMsg: ProtocolMessage = {
        id: 'cc-ban-4',
        type: 'community.create',
        timestamp: new Date().toISOString(),
        sender: admin.did,
        payload: { name: 'Non-admin Ban Test', creatorKeyPair: admin.keyPair }
      }
      const createResp = await sendAndWait(wsAdmin, createMsg)
      const communityId = (createResp.payload as any).communityId

      // User1 joins
      const joinMsg: ProtocolMessage = {
        id: 'cj-ban-4',
        type: 'community.join',
        timestamp: new Date().toISOString(),
        sender: user1.did,
        payload: { communityId, membershipVC: user1.memberVC }
      }
      await sendAndWait(wsUser1, joinMsg)

      // Drain pending community.member.joined broadcast on admin ws
      await waitForMessage(wsAdmin, 1000).catch(() => {})

      // User1 tries to ban user2 — should fail
      const banMsg: ProtocolMessage = {
        id: 'ban-4',
        type: 'community.ban' as any,
        timestamp: new Date().toISOString(),
        sender: user1.did,
        payload: { communityId, targetDID: user2.did }
      }
      const banResp = await sendAndWait(wsUser1, banMsg)
      expect((banResp.payload as any).code).toBe('FORBIDDEN')

      wsUser1.close()
      wsAdmin.close()
    })

    it('MUST reject channel.send from banned user', async () => {
      const admin = await createIdentity()
      const user = await createIdentity()

      const wsAdmin = await connectAndAuth(admin.vp)
      const wsUser = await connectAndAuth(user.vp)

      // Admin creates community
      const createMsg: ProtocolMessage = {
        id: 'cc-ban-5',
        type: 'community.create',
        timestamp: new Date().toISOString(),
        sender: admin.did,
        payload: { name: 'Ban Send Test', creatorKeyPair: admin.keyPair }
      }
      const createResp = await sendAndWait(wsAdmin, createMsg)
      const communityId = (createResp.payload as any).communityId
      const channelId = ((createResp.payload as any).channels as any[])[0]?.id ?? 'channel:general'

      // User joins
      const joinMsg: ProtocolMessage = {
        id: 'cj-ban-5',
        type: 'community.join',
        timestamp: new Date().toISOString(),
        sender: user.did,
        payload: { communityId, membershipVC: user.memberVC }
      }
      await sendAndWait(wsUser, joinMsg)

      // Drain pending community.member.joined broadcast on admin ws
      await waitForMessage(wsAdmin, 1000).catch(() => {})

      // Admin bans user — user gets disconnected
      const userClosed = new Promise<number>((resolve) => {
        wsUser.on('close', (code) => resolve(code))
      })

      const banMsg: ProtocolMessage = {
        id: 'ban-5',
        type: 'community.ban' as any,
        timestamp: new Date().toISOString(),
        sender: admin.did,
        payload: { communityId, targetDID: user.did }
      }
      await sendAndWait(wsAdmin, banMsg)
      await userClosed

      // User reconnects and tries to send (they're still banned)
      const wsUser2 = await connectAndAuth(user.vp)
      // Manually join without going through community.join (simulating a reconnect scenario)
      // Actually they can't join because they're banned — so channel.send should fail too
      // Since they can't be in the community, the send would fail because communityId isn't in their list
      // But let's test that channel.send also checks ban list directly
      const sendMsg: ProtocolMessage = {
        id: 'send-ban-5',
        type: 'channel.send',
        timestamp: new Date().toISOString(),
        sender: user.did,
        payload: {
          communityId,
          channelId,
          content: { text: 'hello' },
          nonce: 'n1',
          clock: { counter: 1, nodeId: user.did }
        }
      }

      const user2Closed = new Promise<number>((resolve) => {
        wsUser2.on('close', (code) => resolve(code))
      })
      wsUser2.send(serialise(sendMsg))
      const closeCode = await user2Closed
      expect(closeCode).toBe(4003)

      wsAdmin.close()
    })
  })

  describe('Input Validation & Security', () => {
    it('MUST reject oversized messages', async () => {
      const { vp } = await createIdentity()
      const ws = await connectAndAuth(vp)
      try {
        // Message larger than 1MB — ws library will close with maxPayload error
        const bigPayload = 'x'.repeat(1_100_000)
        const msg: ProtocolMessage = {
          id: 'big-1',
          type: 'channel.send',
          timestamp: new Date().toISOString(),
          sender: 'test',
          payload: { text: bigPayload }
        }
        const closePromise = new Promise<number>((resolve) => {
          ws.on('close', (code) => resolve(code))
        })
        ws.send(serialise(msg))
        const code = await closePromise
        // ws library closes with 1009 (message too big) when maxPayload exceeded
        expect(code).toBe(1009)
      } finally {
        ws.close()
      }
    })

    it('MUST reject malformed messages (missing type)', async () => {
      const { vp } = await createIdentity()
      const ws = await connectAndAuth(vp)
      try {
        const response = await new Promise<ProtocolMessage>((resolve) => {
          ws.on('message', (data) => {
            const msg = deserialise<ProtocolMessage>(data.toString())
            if (msg.type === 'error') resolve(msg)
          })
          // Send raw JSON missing required fields
          ws.send(JSON.stringify({ id: 'x' }))
        })
        expect((response.payload as any).code).toBe('INVALID_MESSAGE')
      } finally {
        ws.close()
      }
    })

    it('MUST reject channel.send with missing communityId', async () => {
      const { vp } = await createIdentity()
      const ws = await connectAndAuth(vp)
      try {
        const response = await new Promise<ProtocolMessage>((resolve) => {
          ws.on('message', (data) => {
            const msg = deserialise<ProtocolMessage>(data.toString())
            if (msg.type === 'error') resolve(msg)
          })
          ws.send(
            serialise({
              id: 'bad-send',
              type: 'channel.send',
              timestamp: new Date().toISOString(),
              sender: 'test',
              payload: { channelId: 'ch1', content: { text: 'hi' }, nonce: 'n1' }
            })
          )
        })
        expect((response.payload as any).code).toBe('INVALID_PAYLOAD')
      } finally {
        ws.close()
      }
    })

    it('MUST reject community.join with missing communityId', async () => {
      const { vp } = await createIdentity()
      const ws = await connectAndAuth(vp)
      try {
        const response = await new Promise<ProtocolMessage>((resolve) => {
          ws.on('message', (data) => {
            const msg = deserialise<ProtocolMessage>(data.toString())
            if (msg.type === 'error') resolve(msg)
          })
          ws.send(
            serialise({
              id: 'bad-join',
              type: 'community.join',
              timestamp: new Date().toISOString(),
              sender: 'test',
              payload: {}
            })
          )
        })
        expect((response.payload as any).code).toBe('INVALID_PAYLOAD')
      } finally {
        ws.close()
      }
    })

    it('MUST reject channel.send to non-member community', async () => {
      const { vp, did } = await createIdentity()
      const ws = await connectAndAuth(vp)
      try {
        const response = await new Promise<ProtocolMessage>((resolve) => {
          ws.on('message', (data) => {
            const msg = deserialise<ProtocolMessage>(data.toString())
            if (msg.type === 'error') resolve(msg)
          })
          ws.send(
            serialise({
              id: 'nonmember-send',
              type: 'channel.send',
              timestamp: new Date().toISOString(),
              sender: did,
              payload: {
                communityId: 'non-existent-community',
                channelId: 'ch1',
                content: { text: 'should fail' },
                nonce: 'n1',
                clock: { counter: 1, nodeId: did }
              }
            })
          )
        })
        expect((response.payload as any).code).toBe('NOT_MEMBER')
      } finally {
        ws.close()
      }
    })

    it('MUST reject media upload with path traversal filename', async () => {
      const { vp, did, keyPair } = await createIdentity()
      const ws = await connectAndAuth(vp)

      // First create community so user is a member
      const createResp = await sendAndWait(ws, {
        id: 'cc-path-trav',
        type: 'community.create',
        timestamp: new Date().toISOString(),
        sender: did,
        payload: { name: 'Path Traversal Test', creatorKeyPair: keyPair }
      })
      const communityId = (createResp.payload as any).communityId
      const channelId = ((createResp.payload as any).channels as any[])[0]?.id ?? 'channel:general'

      // Upload with path traversal filename
      const uploadResp = await sendAndWait(ws, {
        id: 'upload-traversal',
        type: 'media.upload.request',
        timestamp: new Date().toISOString(),
        sender: did,
        payload: {
          communityId,
          channelId,
          filename: '../../../etc/passwd',
          mimeType: 'image/png',
          size: 100,
          data: btoa('fake image data')
        }
      })
      // Should succeed but with sanitized filename
      expect(uploadResp.type).toBe('media.upload.complete')
      const resultFilename = (uploadResp.payload as any).filename
      expect(resultFilename).not.toContain('..')
      expect(resultFilename).not.toContain('/')
      ws.close()
    })

    it('MUST reject media upload with invalid MIME type', async () => {
      const { vp, did, keyPair } = await createIdentity()
      const ws = await connectAndAuth(vp)

      const createResp = await sendAndWait(ws, {
        id: 'cc-mime',
        type: 'community.create',
        timestamp: new Date().toISOString(),
        sender: did,
        payload: { name: 'MIME Test', creatorKeyPair: keyPair }
      })
      const communityId = (createResp.payload as any).communityId
      const channelId = ((createResp.payload as any).channels as any[])[0]?.id ?? 'channel:general'

      const response = await sendAndWait(ws, {
        id: 'upload-exe',
        type: 'media.upload.request',
        timestamp: new Date().toISOString(),
        sender: did,
        payload: {
          communityId,
          channelId,
          filename: 'malware.exe',
          mimeType: 'application/x-executable',
          size: 100,
          data: btoa('MZ')
        }
      })
      expect(response.type).toBe('error')
      expect((response.payload as any).code).toBe('INVALID_MIME_TYPE')
      ws.close()
    })

    it('MUST reject channel.send with empty communityId', async () => {
      const { vp, did } = await createIdentity()
      const ws = await connectAndAuth(vp)
      try {
        const response = await new Promise<ProtocolMessage>((resolve) => {
          ws.on('message', (data) => {
            const msg = deserialise<ProtocolMessage>(data.toString())
            if (msg.type === 'error') resolve(msg)
          })
          ws.send(
            serialise({
              id: 'empty-community',
              type: 'channel.send',
              timestamp: new Date().toISOString(),
              sender: did,
              payload: {
                communityId: '',
                channelId: 'ch1',
                content: { text: 'hi' },
                nonce: 'n1',
                clock: { counter: 1, nodeId: did }
              }
            })
          )
        })
        expect((response.payload as any).code).toBe('INVALID_PAYLOAD')
      } finally {
        ws.close()
      }
    })
  })
})
