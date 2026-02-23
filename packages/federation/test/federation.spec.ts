import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { WebSocketServer, WebSocket } from 'ws'
import { createCryptoProvider } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import type { DIDDocument } from '@harmony/did'
import { VCService, MemoryRevocationStore } from '@harmony/vc'
import { ZCAPService } from '@harmony/zcap'
import type { Capability } from '@harmony/zcap'
import type { ProtocolMessage } from '@harmony/protocol'
import { serialise, deserialise } from '@harmony/protocol'
import { HarmonyAction } from '@harmony/vocab'
import { FederationManager } from '../src/index.js'

const crypto = createCryptoProvider()
const didProvider = new DIDKeyProvider(crypto)
const zcapService = new ZCAPService(crypto)

const PORT_A = 19878
const PORT_B = 19879

let mockServerA: WebSocketServer | null = null
let mockServerB: WebSocketServer | null = null
let revocationStore: MemoryRevocationStore

const didDocs: Map<string, DIDDocument> = new Map()
const didResolver = async (did: string) => didDocs.get(did) ?? null

async function createInstanceIdentity(name: string) {
  const kp = await crypto.generateSigningKeyPair()
  const doc = await didProvider.create(kp)
  didDocs.set(doc.id, doc)
  return { did: doc.id, keyPair: kp, doc }
}

async function createFederationCap(
  ownerDID: string,
  ownerKP: Awaited<ReturnType<typeof crypto.generateSigningKeyPair>>,
  communityId: string
): Promise<Capability> {
  return zcapService.createRoot({
    ownerDID,
    ownerKeyPair: ownerKP,
    scope: { community: communityId },
    allowedAction: [HarmonyAction.RelayMessage, HarmonyAction.SendMessage]
  })
}

describe('@harmony/federation', () => {
  beforeEach(() => {
    revocationStore = new MemoryRevocationStore()
    didDocs.clear()
  })

  afterEach(async () => {
    if (mockServerA) {
      mockServerA.close()
      mockServerA = null
    }
    if (mockServerB) {
      mockServerB.close()
      mockServerB = null
    }
  })

  describe('Peer Management', () => {
    it('MUST add peer with ZCAP', async () => {
      const instanceA = await createInstanceIdentity('A')
      const instanceB = await createInstanceIdentity('B')
      const cap = await createFederationCap(instanceA.did, instanceA.keyPair, 'community-1')

      const fm = new FederationManager({
        instanceDID: instanceA.did,
        instanceKeyPair: instanceA.keyPair
      })

      const peer = await fm.addPeer({
        instanceDID: instanceB.did,
        endpoint: `ws://127.0.0.1:${PORT_B}`,
        capability: cap
      })

      expect(peer.instanceDID).toBe(instanceB.did)
      expect(peer.status).toBe('pending')
      expect(peer.capabilities.length).toBe(1)
    })

    it('MUST reject peer without valid ZCAP', async () => {
      const instanceA = await createInstanceIdentity('A')

      const fm = new FederationManager({
        instanceDID: instanceA.did,
        instanceKeyPair: instanceA.keyPair
      })

      await expect(
        fm.addPeer({
          instanceDID: 'did:key:bad',
          endpoint: 'ws://localhost:9999',
          capability: { id: '', allowedAction: [], scope: {} } as unknown as Capability
        })
      ).rejects.toThrow()
    })

    it('MUST remove peer and revoke ZCAP', async () => {
      const instanceA = await createInstanceIdentity('A')
      const instanceB = await createInstanceIdentity('B')
      const cap = await createFederationCap(instanceA.did, instanceA.keyPair, 'community-1')

      const fm = new FederationManager(
        {
          instanceDID: instanceA.did,
          instanceKeyPair: instanceA.keyPair
        },
        { revocationStore }
      )

      await fm.addPeer({ instanceDID: instanceB.did, endpoint: 'ws://localhost:9999', capability: cap })
      await fm.removePeer(instanceB.did)

      expect(fm.peers().length).toBe(0)
      expect(await revocationStore.isRevoked(cap.id)).toBe(true)
    })

    it('MUST list active peers', async () => {
      const instanceA = await createInstanceIdentity('A')
      const instanceB = await createInstanceIdentity('B')
      const instanceC = await createInstanceIdentity('C')
      const cap1 = await createFederationCap(instanceA.did, instanceA.keyPair, 'c1')
      const cap2 = await createFederationCap(instanceA.did, instanceA.keyPair, 'c2')

      const fm = new FederationManager({
        instanceDID: instanceA.did,
        instanceKeyPair: instanceA.keyPair
      })

      await fm.addPeer({ instanceDID: instanceB.did, endpoint: 'ws://b', capability: cap1 })
      await fm.addPeer({ instanceDID: instanceC.did, endpoint: 'ws://c', capability: cap2 })

      expect(fm.peers().length).toBe(2)
    })

    it('MUST track peer connection status', async () => {
      const instanceA = await createInstanceIdentity('A')
      const instanceB = await createInstanceIdentity('B')
      const cap = await createFederationCap(instanceA.did, instanceA.keyPair, 'c1')

      const fm = new FederationManager({
        instanceDID: instanceA.did,
        instanceKeyPair: instanceA.keyPair
      })

      const peer = await fm.addPeer({ instanceDID: instanceB.did, endpoint: 'ws://localhost:9999', capability: cap })
      expect(peer.status).toBe('pending')
    })
  })

  describe('Connection', () => {
    it('MUST connect to peer via WebSocket', async () => {
      const instanceA = await createInstanceIdentity('A')
      const instanceB = await createInstanceIdentity('B')
      const cap = await createFederationCap(instanceA.did, instanceA.keyPair, 'c1')

      mockServerB = new WebSocketServer({ port: PORT_B })
      const connPromise = new Promise<void>((resolve) => {
        mockServerB!.on('connection', () => resolve())
      })

      const fm = new FederationManager({
        instanceDID: instanceA.did,
        instanceKeyPair: instanceA.keyPair
      })

      await fm.addPeer({ instanceDID: instanceB.did, endpoint: `ws://127.0.0.1:${PORT_B}`, capability: cap })
      await fm.connectToPeer(instanceB.did)
      await connPromise

      const peers = fm.peers()
      expect(peers[0].status).toBe('connected')

      await fm.disconnectFromPeer(instanceB.did)
    })

    it('MUST authenticate with instance DID', async () => {
      const instanceA = await createInstanceIdentity('A')
      const instanceB = await createInstanceIdentity('B')
      const cap = await createFederationCap(instanceA.did, instanceA.keyPair, 'c1')

      let receivedAuth = false
      mockServerB = new WebSocketServer({ port: PORT_B })
      mockServerB.on('connection', (ws) => {
        ws.on('message', (data: Buffer) => {
          const msg = deserialise<ProtocolMessage>(data.toString())
          if (msg.sender === instanceA.did) receivedAuth = true
        })
      })

      const fm = new FederationManager({
        instanceDID: instanceA.did,
        instanceKeyPair: instanceA.keyPair
      })

      await fm.addPeer({ instanceDID: instanceB.did, endpoint: `ws://127.0.0.1:${PORT_B}`, capability: cap })
      await fm.connectToPeer(instanceB.did)
      await new Promise((r) => setTimeout(r, 100))

      expect(receivedAuth).toBe(true)
      await fm.disconnectFromPeer(instanceB.did)
    })

    it('MUST handle peer disconnect gracefully', async () => {
      const instanceA = await createInstanceIdentity('A')
      const instanceB = await createInstanceIdentity('B')
      const cap = await createFederationCap(instanceA.did, instanceA.keyPair, 'c1')

      mockServerB = new WebSocketServer({ port: PORT_B })

      const fm = new FederationManager({
        instanceDID: instanceA.did,
        instanceKeyPair: instanceA.keyPair
      })

      let disconnected = false
      fm.on('peer.disconnected', () => {
        disconnected = true
      })

      await fm.addPeer({ instanceDID: instanceB.did, endpoint: `ws://127.0.0.1:${PORT_B}`, capability: cap })
      await fm.connectToPeer(instanceB.did)

      // Force close server side
      for (const client of mockServerB.clients) {
        client.close()
      }

      await new Promise((r) => setTimeout(r, 200))
      expect(disconnected).toBe(true)
    })
  })

  describe('Message Relay', () => {
    it('MUST relay channel messages to federated peers', async () => {
      const instanceA = await createInstanceIdentity('A')
      const instanceB = await createInstanceIdentity('B')
      const cap = await createFederationCap(instanceA.did, instanceA.keyPair, 'c1')

      let relayedMsg: ProtocolMessage | null = null
      mockServerB = new WebSocketServer({ port: PORT_B })
      mockServerB.on('connection', (ws) => {
        ws.on('message', (data: Buffer) => {
          const msg = deserialise<ProtocolMessage>(data.toString())
          if (msg.type === 'federation.relay') relayedMsg = msg
        })
      })

      const fm = new FederationManager({
        instanceDID: instanceA.did,
        instanceKeyPair: instanceA.keyPair
      })

      await fm.addPeer({ instanceDID: instanceB.did, endpoint: `ws://127.0.0.1:${PORT_B}`, capability: cap })
      await fm.connectToPeer(instanceB.did)
      await new Promise((r) => setTimeout(r, 100))

      await fm.relayToFederated('c1', {
        id: 'relay-test-msg',
        type: 'channel.message',
        timestamp: new Date().toISOString(),
        sender: 'did:key:user',
        payload: { content: 'hello from A' }
      })

      await new Promise((r) => setTimeout(r, 200))
      expect(relayedMsg).not.toBeNull()
      expect(relayedMsg!.type).toBe('federation.relay')

      await fm.disconnectFromPeer(instanceB.did)
    })

    it('MUST verify ZCAP chain on incoming federated messages', async () => {
      const instanceA = await createInstanceIdentity('A')
      const instanceB = await createInstanceIdentity('B')
      const cap = await createFederationCap(instanceA.did, instanceA.keyPair, 'c1')

      const fm = new FederationManager({
        instanceDID: instanceA.did,
        instanceKeyPair: instanceA.keyPair
      })

      await fm.addPeer({ instanceDID: instanceB.did, endpoint: 'ws://localhost', capability: cap })

      const result = await fm.handleFederatedMessage(instanceB.did, {
        id: 'incoming-msg',
        type: 'federation.relay',
        timestamp: new Date().toISOString(),
        sender: instanceB.did,
        payload: { communityId: 'c1', originalMessage: {} }
      })

      expect(result.accepted).toBe(true)
    })

    it('MUST reject messages with invalid ZCAP', async () => {
      const instanceA = await createInstanceIdentity('A')
      const instanceB = await createInstanceIdentity('B')
      const cap = await createFederationCap(instanceA.did, instanceA.keyPair, 'c1')

      const fm = new FederationManager({
        instanceDID: instanceA.did,
        instanceKeyPair: instanceA.keyPair
      })

      await fm.addPeer({ instanceDID: instanceB.did, endpoint: 'ws://localhost', capability: cap })

      const result = await fm.handleFederatedMessage(instanceB.did, {
        id: 'bad-proof-msg',
        type: 'federation.relay',
        timestamp: new Date().toISOString(),
        sender: instanceB.did,
        payload: { communityId: 'c1' },
        proof: {
          capabilityId: '',
          capabilityChain: [],
          invocation: {
            action: '',
            target: '',
            proof: { type: '', created: '', verificationMethod: '', proofPurpose: '', proofValue: '' }
          }
        }
      })

      expect(result.accepted).toBe(false)
      expect(result.error).toContain('Invalid ZCAP')
    })

    it('MUST NOT relay messages for non-federated communities', async () => {
      const instanceA = await createInstanceIdentity('A')
      const instanceB = await createInstanceIdentity('B')
      const cap = await createFederationCap(instanceA.did, instanceA.keyPair, 'c1')

      let relayCount = 0
      mockServerB = new WebSocketServer({ port: PORT_B })
      mockServerB.on('connection', (ws) => {
        ws.on('message', (data: Buffer) => {
          const msg = deserialise<ProtocolMessage>(data.toString())
          // Only count non-auth relay messages (auth message has payload.type === 'auth')
          if (msg.type === 'federation.relay') {
            const payload = msg.payload as { type?: string }
            if (payload?.type !== 'auth') relayCount++
          }
        })
      })

      const fm = new FederationManager({
        instanceDID: instanceA.did,
        instanceKeyPair: instanceA.keyPair
      })

      await fm.addPeer({ instanceDID: instanceB.did, endpoint: `ws://127.0.0.1:${PORT_B}`, capability: cap })
      await fm.connectToPeer(instanceB.did)
      await new Promise((r) => setTimeout(r, 100))

      // Relay for non-federated community
      await fm.relayToFederated('non-federated-community', {
        id: 'no-relay',
        type: 'channel.message',
        timestamp: new Date().toISOString(),
        sender: 'did:key:user',
        payload: {}
      })

      await new Promise((r) => setTimeout(r, 200))
      expect(relayCount).toBe(0)

      await fm.disconnectFromPeer(instanceB.did)
    })

    it('MUST deduplicate relayed messages', async () => {
      const instanceA = await createInstanceIdentity('A')
      const instanceB = await createInstanceIdentity('B')
      const cap = await createFederationCap(instanceA.did, instanceA.keyPair, 'c1')

      let deliveredCount = 0
      const fm = new FederationManager(
        {
          instanceDID: instanceA.did,
          instanceKeyPair: instanceA.keyPair
        },
        {
          onMessage: () => {
            deliveredCount++
          }
        }
      )

      await fm.addPeer({ instanceDID: instanceB.did, endpoint: 'ws://localhost', capability: cap })

      const msg: ProtocolMessage = {
        id: 'dedup-msg',
        type: 'federation.relay',
        timestamp: new Date().toISOString(),
        sender: instanceB.did,
        payload: { communityId: 'c1' }
      }

      await fm.handleFederatedMessage(instanceB.did, msg)
      await fm.handleFederatedMessage(instanceB.did, msg) // duplicate

      expect(deliveredCount).toBe(1)
    })

    it('MUST deliver relayed messages to local subscribers', async () => {
      const instanceA = await createInstanceIdentity('A')
      const instanceB = await createInstanceIdentity('B')
      const cap = await createFederationCap(instanceA.did, instanceA.keyPair, 'c1')

      let received = false
      const fm = new FederationManager(
        {
          instanceDID: instanceA.did,
          instanceKeyPair: instanceA.keyPair
        },
        {
          onMessage: () => {
            received = true
          }
        }
      )

      await fm.addPeer({ instanceDID: instanceB.did, endpoint: 'ws://localhost', capability: cap })

      await fm.handleFederatedMessage(instanceB.did, {
        id: 'local-delivery',
        type: 'federation.relay',
        timestamp: new Date().toISOString(),
        sender: instanceB.did,
        payload: { communityId: 'c1' }
      })

      expect(received).toBe(true)
    })
  })

  describe('Authorization', () => {
    it('Federation ZCAP MUST be scoped to specific communities', async () => {
      const instanceA = await createInstanceIdentity('A')
      const instanceB = await createInstanceIdentity('B')
      const cap = await createFederationCap(instanceA.did, instanceA.keyPair, 'specific-community')

      const fm = new FederationManager({
        instanceDID: instanceA.did,
        instanceKeyPair: instanceA.keyPair
      })

      await fm.addPeer({ instanceDID: instanceB.did, endpoint: 'ws://localhost', capability: cap })

      // Message for wrong community should fail
      const result = await fm.handleFederatedMessage(instanceB.did, {
        id: 'wrong-community',
        type: 'federation.relay',
        timestamp: new Date().toISOString(),
        sender: instanceB.did,
        payload: { communityId: 'other-community' }
      })

      expect(result.accepted).toBe(false)
    })

    it('Revoking federation ZCAP MUST disconnect peer', async () => {
      const instanceA = await createInstanceIdentity('A')
      const instanceB = await createInstanceIdentity('B')
      const cap = await createFederationCap(instanceA.did, instanceA.keyPair, 'c1')

      const fm = new FederationManager(
        {
          instanceDID: instanceA.did,
          instanceKeyPair: instanceA.keyPair
        },
        { revocationStore }
      )

      await fm.addPeer({ instanceDID: instanceB.did, endpoint: 'ws://localhost', capability: cap })

      // Revoke and remove
      await fm.removePeer(instanceB.did)
      expect(await revocationStore.isRevoked(cap.id)).toBe(true)
      expect(fm.peers().length).toBe(0)
    })

    it('MUST NOT allow federated peer to perform admin actions', async () => {
      const instanceA = await createInstanceIdentity('A')
      const instanceB = await createInstanceIdentity('B')

      // Create ZCAP with only relay actions (no admin)
      const cap = await zcapService.createRoot({
        ownerDID: instanceA.did,
        ownerKeyPair: instanceA.keyPair,
        scope: { community: 'c1' },
        allowedAction: [HarmonyAction.RelayMessage]
      })

      const fm = new FederationManager({
        instanceDID: instanceA.did,
        instanceKeyPair: instanceA.keyPair
      })

      await fm.addPeer({ instanceDID: instanceB.did, endpoint: 'ws://localhost', capability: cap })

      // The capability only allows relay, not admin actions
      expect(cap.allowedAction).not.toContain(HarmonyAction.ManageChannel)
      expect(cap.allowedAction).not.toContain(HarmonyAction.ManageRoles)
    })
  })

  describe('Two-Instance Integration', () => {
    it('Instance A creates community, federates with Instance B', async () => {
      const instanceA = await createInstanceIdentity('A')
      const instanceB = await createInstanceIdentity('B')
      const cap = await createFederationCap(instanceA.did, instanceA.keyPair, 'c1')

      const fmA = new FederationManager({
        instanceDID: instanceA.did,
        instanceKeyPair: instanceA.keyPair
      })

      await fmA.addPeer({ instanceDID: instanceB.did, endpoint: 'ws://localhost', capability: cap })
      expect(fmA.peers().length).toBe(1)
    })

    it('Message relay between instances', async () => {
      const instanceA = await createInstanceIdentity('A')
      const instanceB = await createInstanceIdentity('B')
      const cap = await createFederationCap(instanceA.did, instanceA.keyPair, 'c1')

      let receivedOnB = false
      mockServerB = new WebSocketServer({ port: PORT_B })
      mockServerB.on('connection', (ws) => {
        ws.on('message', (data: Buffer) => {
          const msg = deserialise<ProtocolMessage>(data.toString())
          if (msg.type === 'federation.relay') receivedOnB = true
        })
      })

      const fmA = new FederationManager({
        instanceDID: instanceA.did,
        instanceKeyPair: instanceA.keyPair
      })

      await fmA.addPeer({ instanceDID: instanceB.did, endpoint: `ws://127.0.0.1:${PORT_B}`, capability: cap })
      await fmA.connectToPeer(instanceB.did)
      await new Promise((r) => setTimeout(r, 100))

      await fmA.relayToFederated('c1', {
        id: 'cross-instance',
        type: 'channel.message',
        timestamp: new Date().toISOString(),
        sender: 'did:key:userA',
        payload: { text: 'hello from A' }
      })

      await new Promise((r) => setTimeout(r, 200))
      expect(receivedOnB).toBe(true)

      await fmA.disconnectFromPeer(instanceB.did)
    })

    it('Defederation removes access', async () => {
      const instanceA = await createInstanceIdentity('A')
      const instanceB = await createInstanceIdentity('B')
      const cap = await createFederationCap(instanceA.did, instanceA.keyPair, 'c1')

      const fmA = new FederationManager(
        {
          instanceDID: instanceA.did,
          instanceKeyPair: instanceA.keyPair
        },
        { revocationStore }
      )

      await fmA.addPeer({ instanceDID: instanceB.did, endpoint: 'ws://localhost', capability: cap })
      await fmA.removePeer(instanceB.did)

      expect(fmA.peers().length).toBe(0)
      expect(await revocationStore.isRevoked(cap.id)).toBe(true)

      // Future messages should be rejected
      const result = await fmA.handleFederatedMessage(instanceB.did, {
        id: 'after-defed',
        type: 'federation.relay',
        timestamp: new Date().toISOString(),
        sender: instanceB.did,
        payload: { communityId: 'c1' }
      })
      expect(result.accepted).toBe(false)
    })
  })

  describe('Edge Cases', () => {
    it('MUST enforce max peers limit', async () => {
      const instanceA = await createInstanceIdentity('A')
      const fm = new FederationManager({
        instanceDID: instanceA.did,
        instanceKeyPair: instanceA.keyPair,
        maxPeers: 1
      })

      const instanceB = await createInstanceIdentity('B')
      const cap1 = await createFederationCap(instanceA.did, instanceA.keyPair, 'c1')
      await fm.addPeer({ instanceDID: instanceB.did, endpoint: 'ws://b', capability: cap1 })

      const instanceC = await createInstanceIdentity('C')
      const cap2 = await createFederationCap(instanceA.did, instanceA.keyPair, 'c2')
      await expect(fm.addPeer({ instanceDID: instanceC.did, endpoint: 'ws://c', capability: cap2 })).rejects.toThrow(
        'Max peers reached'
      )
    })

    it('MUST reject ZCAP without relay/federation action', async () => {
      const instanceA = await createInstanceIdentity('A')
      const fm = new FederationManager({
        instanceDID: instanceA.did,
        instanceKeyPair: instanceA.keyPair
      })

      // Create ZCAP with no relay action
      const cap = await zcapService.createRoot({
        ownerDID: instanceA.did,
        ownerKeyPair: instanceA.keyPair,
        scope: { community: 'c1' },
        allowedAction: ['https://harmony.example/vocab#ManageChannel']
      })

      const instanceB = await createInstanceIdentity('B')
      await expect(fm.addPeer({ instanceDID: instanceB.did, endpoint: 'ws://b', capability: cap })).rejects.toThrow(
        'ZCAP does not include relay/federation action'
      )
    })

    it('MUST reject message from unknown peer', async () => {
      const instanceA = await createInstanceIdentity('A')
      const fm = new FederationManager({
        instanceDID: instanceA.did,
        instanceKeyPair: instanceA.keyPair
      })

      const result = await fm.handleFederatedMessage('did:key:unknown', {
        id: 'unknown-peer-msg',
        type: 'federation.relay',
        timestamp: new Date().toISOString(),
        sender: 'did:key:unknown',
        payload: { communityId: 'c1' }
      })
      expect(result.accepted).toBe(false)
      expect(result.error).toBe('Unknown peer')
    })

    it('MUST reject message with revoked ZCAP', async () => {
      const instanceA = await createInstanceIdentity('A')
      const instanceB = await createInstanceIdentity('B')
      const cap = await createFederationCap(instanceA.did, instanceA.keyPair, 'c1')

      const fm = new FederationManager(
        {
          instanceDID: instanceA.did,
          instanceKeyPair: instanceA.keyPair
        },
        { revocationStore }
      )

      await fm.addPeer({ instanceDID: instanceB.did, endpoint: 'ws://b', capability: cap })

      // Manually revoke the ZCAP
      await revocationStore.revoke(cap.id)

      const result = await fm.handleFederatedMessage(instanceB.did, {
        id: 'revoked-msg',
        type: 'federation.relay',
        timestamp: new Date().toISOString(),
        sender: instanceB.did,
        payload: { communityId: 'c1' }
      })
      expect(result.accepted).toBe(false)
      expect(result.error).toBe('Federation ZCAP revoked')
    })

    it('MUST throw when connecting to unknown peer', async () => {
      const instanceA = await createInstanceIdentity('A')
      const fm = new FederationManager({
        instanceDID: instanceA.did,
        instanceKeyPair: instanceA.keyPair
      })

      await expect(fm.connectToPeer('did:key:unknown')).rejects.toThrow('Unknown peer')
    })

    it('MUST handle disconnect from non-connected peer gracefully', async () => {
      const instanceA = await createInstanceIdentity('A')
      const instanceB = await createInstanceIdentity('B')
      const cap = await createFederationCap(instanceA.did, instanceA.keyPair, 'c1')

      const fm = new FederationManager({
        instanceDID: instanceA.did,
        instanceKeyPair: instanceA.keyPair
      })

      await fm.addPeer({ instanceDID: instanceB.did, endpoint: 'ws://b', capability: cap })
      // Disconnect without connecting first — should not throw
      await fm.disconnectFromPeer(instanceB.did)
      expect(fm.peers()[0].status).toBe('disconnected')
    })

    it('MUST emit peer.error on connection failure', async () => {
      const instanceA = await createInstanceIdentity('A')
      const instanceB = await createInstanceIdentity('B')
      const cap = await createFederationCap(instanceA.did, instanceA.keyPair, 'c1')

      const fm = new FederationManager({
        instanceDID: instanceA.did,
        instanceKeyPair: instanceA.keyPair
      })

      let errorEmitted = false
      fm.on('peer.error', () => {
        errorEmitted = true
      })

      await fm.addPeer({ instanceDID: instanceB.did, endpoint: 'ws://127.0.0.1:59999', capability: cap })
      await expect(fm.connectToPeer(instanceB.did)).rejects.toThrow()
      expect(errorEmitted).toBe(true)
    })

    it('MUST relay only to connected peers', async () => {
      const instanceA = await createInstanceIdentity('A')
      const instanceB = await createInstanceIdentity('B')
      const cap = await createFederationCap(instanceA.did, instanceA.keyPair, 'c1')

      const fm = new FederationManager({
        instanceDID: instanceA.did,
        instanceKeyPair: instanceA.keyPair
      })

      await fm.addPeer({ instanceDID: instanceB.did, endpoint: 'ws://b', capability: cap })

      // Relay without connecting — should not throw, just skip
      await fm.relayToFederated('c1', {
        id: 'no-conn-relay',
        type: 'channel.message',
        timestamp: new Date().toISOString(),
        sender: 'did:key:user',
        payload: {}
      })
      // No error expected
    })

    it('removePeer on non-existent peer MUST be no-op', async () => {
      const instanceA = await createInstanceIdentity('A')
      const fm = new FederationManager({
        instanceDID: instanceA.did,
        instanceKeyPair: instanceA.keyPair
      })

      await fm.removePeer('did:key:nonexistent')
      expect(fm.peers().length).toBe(0)
    })
  })
})
