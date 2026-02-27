import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { WebSocket } from 'ws'
import { MemoryQuadStore } from '@harmony/quads'
import { createCryptoProvider } from '@harmony/crypto'
import type { KeyPair } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import type { DIDDocument } from '@harmony/did'
import { VCService, MemoryRevocationStore } from '@harmony/vc'
import type { VerifiablePresentation, VerifiableCredential } from '@harmony/vc'
import type { ProtocolMessage, LamportClock } from '@harmony/protocol'
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

async function createCommunityAndJoin(
  ws: WebSocket,
  did: string,
  memberVC: VerifiableCredential
): Promise<{ communityId: string; channelId: string }> {
  // Create community
  const createResp = await sendAndWait(ws, {
    id: 'cc-1',
    type: 'community.create',
    timestamp: new Date().toISOString(),
    sender: did,
    payload: { name: 'Test Community', description: 'Test' }
  })
  const communityId = (createResp.payload as any).communityId
  const channelId = (createResp.payload as any).channels?.[0]?.id ?? 'general'

  // Join
  await sendAndWait(ws, {
    id: 'cj-1',
    type: 'community.join',
    timestamp: new Date().toISOString(),
    sender: did,
    payload: { communityId, membershipVC: memberVC }
  })

  return { communityId, channelId }
}

describe('Moderation Integration', () => {
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
  })

  afterEach(async () => {
    await server?.stop()
  })

  describe('Slow Mode', () => {
    it('should enforce slow mode on channel.send', async () => {
      const identity = await createIdentity()
      const ws = await connectAndAuth(identity.vp)
      const { communityId, channelId } = await createCommunityAndJoin(ws, identity.did, identity.memberVC)

      // Set slow mode via channel.update
      const updateResp = await sendAndWait(ws, {
        id: 'cu-1',
        type: 'channel.update',
        timestamp: new Date().toISOString(),
        sender: identity.did,
        payload: { communityId, channelId, slowMode: 10 }
      })
      // Should get channel.updated broadcast
      expect(updateResp.type).toBe('channel.updated')

      // First message should succeed
      const msg1 = await sendAndWait(ws, {
        id: 'msg-1',
        type: 'channel.send',
        timestamp: new Date().toISOString(),
        sender: identity.did,
        payload: { communityId, channelId, content: 'Hello', nonce: 'n1', clock: { counter: 1, nodeId: identity.did } }
      })
      expect(msg1.type).toBe('channel.message')

      // Second message immediately should be blocked
      const msg2 = await sendAndWait(ws, {
        id: 'msg-2',
        type: 'channel.send',
        timestamp: new Date().toISOString(),
        sender: identity.did,
        payload: {
          communityId,
          channelId,
          content: 'Too fast',
          nonce: 'n2',
          clock: { counter: 2, nodeId: identity.did }
        }
      })
      expect(msg2.type).toBe('error')
      expect((msg2.payload as any).code).toBe('SLOW_MODE')

      ws.close()
    })

    it('should remove slow mode when set to 0', async () => {
      const identity = await createIdentity()
      const ws = await connectAndAuth(identity.vp)
      const { communityId, channelId } = await createCommunityAndJoin(ws, identity.did, identity.memberVC)

      // Set slow mode
      await sendAndWait(ws, {
        id: 'cu-1',
        type: 'channel.update',
        timestamp: new Date().toISOString(),
        sender: identity.did,
        payload: { communityId, channelId, slowMode: 10 }
      })

      // Remove slow mode
      await sendAndWait(ws, {
        id: 'cu-2',
        type: 'channel.update',
        timestamp: new Date().toISOString(),
        sender: identity.did,
        payload: { communityId, channelId, slowMode: 0 }
      })

      // Two rapid messages should both succeed
      const msg1 = await sendAndWait(ws, {
        id: 'msg-1',
        type: 'channel.send',
        timestamp: new Date().toISOString(),
        sender: identity.did,
        payload: { communityId, channelId, content: 'Hello', nonce: 'n1', clock: { counter: 1, nodeId: identity.did } }
      })
      expect(msg1.type).toBe('channel.message')

      const msg2 = await sendAndWait(ws, {
        id: 'msg-2',
        type: 'channel.send',
        timestamp: new Date().toISOString(),
        sender: identity.did,
        payload: { communityId, channelId, content: 'World', nonce: 'n2', clock: { counter: 2, nodeId: identity.did } }
      })
      expect(msg2.type).toBe('channel.message')

      ws.close()
    })
  })

  describe('Rate Limiting', () => {
    it('should enforce rate limits on channel.send', async () => {
      const identity = await createIdentity()
      const ws = await connectAndAuth(identity.vp)
      const { communityId, channelId } = await createCommunityAndJoin(ws, identity.did, identity.memberVC)

      // Add rate limit rule directly
      server.moderationPluginInstance.addRule(communityId, {
        id: 'rl-1',
        type: 'rateLimit',
        scope: 'community',
        scopeId: communityId,
        maxMessages: 2,
        windowSeconds: 60
      })

      // First two messages succeed
      for (let i = 1; i <= 2; i++) {
        const resp = await sendAndWait(ws, {
          id: `msg-${i}`,
          type: 'channel.send',
          timestamp: new Date().toISOString(),
          sender: identity.did,
          payload: {
            communityId,
            channelId,
            content: `Msg ${i}`,
            nonce: `n${i}`,
            clock: { counter: i, nodeId: identity.did }
          }
        })
        expect(resp.type).toBe('channel.message')
      }

      // Third should be rate limited
      const resp = await sendAndWait(ws, {
        id: 'msg-3',
        type: 'channel.send',
        timestamp: new Date().toISOString(),
        sender: identity.did,
        payload: {
          communityId,
          channelId,
          content: 'Too many',
          nonce: 'n3',
          clock: { counter: 3, nodeId: identity.did }
        }
      })
      expect(resp.type).toBe('error')
      expect((resp.payload as any).code).toBe('RATE_LIMITED')

      ws.close()
    })
  })

  describe('Community Join - Account Age', () => {
    it('should block joins from accounts that are too new', async () => {
      const admin = await createIdentity()
      const ws = await connectAndAuth(admin.vp)
      const { communityId } = await createCommunityAndJoin(ws, admin.did, admin.memberVC)

      // Add account age rule requiring very old accounts
      server.moderationPluginInstance.addRule(communityId, {
        id: 'aa-1',
        type: 'accountAge',
        minAgeSeconds: 999999999, // impossibly old
        action: 'block'
      })

      // New user tries to join
      const newUser = await createIdentity()
      const ws2 = await connectAndAuth(newUser.vp)

      const joinResp = await sendAndWait(ws2, {
        id: 'join-1',
        type: 'community.join',
        timestamp: new Date().toISOString(),
        sender: newUser.did,
        payload: { communityId, membershipVC: newUser.memberVC }
      })

      expect(joinResp.type).toBe('error')
      expect((joinResp.payload as any).code).toBe('FORBIDDEN')

      ws.close()
      ws2.close()
    })
  })

  describe('Community Join - VC Requirement', () => {
    it('should block joins missing required VC types', async () => {
      const admin = await createIdentity()
      const ws = await connectAndAuth(admin.vp)
      const { communityId } = await createCommunityAndJoin(ws, admin.did, admin.memberVC)

      // Require a VC type the user doesn't have
      server.moderationPluginInstance.addRule(communityId, {
        id: 'vc-1',
        type: 'vcRequirement',
        requiredVCTypes: ['PremiumMemberCredential'],
        action: 'block'
      })

      const newUser = await createIdentity()
      const ws2 = await connectAndAuth(newUser.vp)

      const joinResp = await sendAndWait(ws2, {
        id: 'join-1',
        type: 'community.join',
        timestamp: new Date().toISOString(),
        sender: newUser.did,
        payload: { communityId, membershipVC: newUser.memberVC }
      })

      expect(joinResp.type).toBe('error')
      expect((joinResp.payload as any).code).toBe('FORBIDDEN')

      ws.close()
      ws2.close()
    })
  })

  describe('Raid Detection', () => {
    it('should trigger lockdown on rapid joins', async () => {
      const admin = await createIdentity()
      const ws = await connectAndAuth(admin.vp)
      const { communityId } = await createCommunityAndJoin(ws, admin.did, admin.memberVC)

      // Set low raid threshold
      server.moderationPluginInstance.addRule(communityId, {
        id: 'raid-1',
        type: 'raidDetection',
        joinThreshold: 2,
        windowSeconds: 60,
        action: 'lockdown',
        lockdownDurationSeconds: 300
      })

      // First join triggers raid counter
      const user1 = await createIdentity()
      const ws1 = await connectAndAuth(user1.vp)
      await sendAndWait(ws1, {
        id: 'join-1',
        type: 'community.join',
        timestamp: new Date().toISOString(),
        sender: user1.did,
        payload: { communityId, membershipVC: user1.memberVC }
      })

      // Second join should trigger lockdown
      const user2 = await createIdentity()
      const ws2 = await connectAndAuth(user2.vp)
      const joinResp = await sendAndWait(ws2, {
        id: 'join-2',
        type: 'community.join',
        timestamp: new Date().toISOString(),
        sender: user2.did,
        payload: { communityId, membershipVC: user2.memberVC }
      })

      expect(joinResp.type).toBe('error')
      expect((joinResp.payload as any).code).toBe('FORBIDDEN')
      expect(server.moderationPluginInstance.isLockedDown(communityId)).toBe(true)

      ws.close()
      ws1.close()
      ws2.close()
    })
  })

  describe('Moderation Config Handlers', () => {
    it('should update and get moderation config', async () => {
      const admin = await createIdentity()
      const ws = await connectAndAuth(admin.vp)
      const { communityId } = await createCommunityAndJoin(ws, admin.did, admin.memberVC)

      // Update config
      const updateResp = await sendAndWait(ws, {
        id: 'mod-update-1',
        type: 'moderation.config.update' as any,
        timestamp: new Date().toISOString(),
        sender: admin.did,
        payload: {
          communityId,
          rules: [
            {
              type: 'rateLimit',
              config: { maxMessages: 5, windowSeconds: 30, scope: 'community', scopeId: communityId }
            },
            { type: 'accountAge', config: { minAgeSeconds: 3600, action: 'block' } }
          ]
        }
      })

      expect(updateResp.type).toBe('moderation.config.response')
      const rules = (updateResp.payload as any).rules
      expect(rules).toHaveLength(2)
      expect(rules[0].type).toBe('rateLimit')
      expect(rules[1].type).toBe('accountAge')

      // Get config
      const getResp = await sendAndWait(ws, {
        id: 'mod-get-1',
        type: 'moderation.config.get' as any,
        timestamp: new Date().toISOString(),
        sender: admin.did,
        payload: { communityId }
      })

      expect(getResp.type).toBe('moderation.config.response')
      expect((getResp.payload as any).rules).toHaveLength(2)

      ws.close()
    })

    it('should reject non-admin moderation config updates', async () => {
      const admin = await createIdentity()
      const ws = await connectAndAuth(admin.vp)
      const { communityId } = await createCommunityAndJoin(ws, admin.did, admin.memberVC)

      // Create non-admin user
      const user = await createIdentity()
      const ws2 = await connectAndAuth(user.vp)

      // Join community first
      await sendAndWait(ws2, {
        id: 'join-1',
        type: 'community.join',
        timestamp: new Date().toISOString(),
        sender: user.did,
        payload: { communityId, membershipVC: user.memberVC }
      })

      // Try to update moderation config
      const resp = await sendAndWait(ws2, {
        id: 'mod-update-1',
        type: 'moderation.config.update' as any,
        timestamp: new Date().toISOString(),
        sender: user.did,
        payload: {
          communityId,
          rules: [{ type: 'rateLimit', config: { maxMessages: 1, windowSeconds: 1 } }]
        }
      })

      expect(resp.type).toBe('error')
      expect((resp.payload as any).code).toBe('FORBIDDEN')

      ws.close()
      ws2.close()
    })
  })

  describe('slowMode via channel.update', () => {
    it('should set and enforce slow mode through channel.update', async () => {
      const identity = await createIdentity()
      const ws = await connectAndAuth(identity.vp)
      const { communityId, channelId } = await createCommunityAndJoin(ws, identity.did, identity.memberVC)

      // Set slow mode to 60 seconds
      await sendAndWait(ws, {
        id: 'cu-1',
        type: 'channel.update',
        timestamp: new Date().toISOString(),
        sender: identity.did,
        payload: { communityId, channelId, slowMode: 60 }
      })

      // Verify rule was added
      const rules = server.moderationPluginInstance.getRules(communityId)
      const slowRule = rules.find((r) => r.type === 'slowMode')
      expect(slowRule).toBeDefined()
      expect(slowRule!.type).toBe('slowMode')
      if (slowRule!.type === 'slowMode') {
        expect(slowRule!.intervalSeconds).toBe(60)
        expect(slowRule!.channelId).toBe(channelId)
      }

      ws.close()
    })
  })
})
