import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryQuadStore } from '@harmony/quads'
import { HarmonyClient } from '../src/index.js'
import { VoiceClient } from '@harmony/voice'
import { MediaClient } from '@harmony/media'
import { MediaStorage } from '@harmony/media'
import { ClientSearchIndex } from '@harmony/search'
import { GovernanceEngine } from '@harmony/governance'
import { DelegationManager } from '@harmony/governance'
import { ReputationEngine } from '@harmony/credentials'
import { InMemoryPushService } from '@harmony/mobile'
import type { ProposalDef } from '@harmony/governance'
import type { FileInput } from '@harmony/media'

// Minimal WS factory that auto-connects
function createMockWsFactory() {
  return (_url: string) => {
    const wsLike = {
      send: (data: string) => {
        // Auto-respond to voice.token requests
        try {
          const msg = JSON.parse(data)
          if (msg.type === 'voice.token') {
            const channelId = msg.payload?.channelId ?? 'unknown'
            setTimeout(() => {
              wsLike.onmessage?.({
                data: JSON.stringify({
                  id: `vt-${Date.now()}`,
                  type: 'voice.token.response',
                  timestamp: new Date().toISOString(),
                  sender: 'server',
                  payload: {
                    channelId,
                    token: Buffer.from(
                      JSON.stringify({ room: channelId, participant: 'did:key:z6MkTestUser123', iat: Date.now() })
                    ).toString('base64'),
                    mode: 'signaling'
                  }
                })
              })
            }, 1)
          }
        } catch {
          /* ignore */
        }
      },
      close: () => {
        wsLike.onclose?.()
      },
      readyState: 1,
      onmessage: null as ((event: { data: string }) => void) | null,
      onclose: null as (() => void) | null,
      onopen: null as (() => void) | null,
      onerror: null as ((event: unknown) => void) | null
    }
    // Auto-open and send sync.response
    setTimeout(() => {
      wsLike.onopen?.()
      wsLike.onmessage?.({
        data: JSON.stringify({
          id: 'auth-1',
          type: 'sync.response',
          timestamp: new Date().toISOString(),
          sender: 'server',
          payload: {}
        })
      })
    }, 5)
    return wsLike
  }
}

function createMockIdentity() {
  return {
    identity: {
      did: 'did:key:z6MkTestUser123',
      document: {} as any,
      credentials: [],
      capabilities: []
    },
    keyPair: {
      publicKey: new Uint8Array(32),
      secretKey: new Uint8Array(32),
      type: 'Ed25519' as const
    }
  }
}

describe('@harmony/client Phase 3 Extensions', () => {
  let store: MemoryQuadStore

  beforeEach(() => {
    store = new MemoryQuadStore()
  })

  describe('Voice', () => {
    it('MUST join a voice channel', async () => {
      const voiceClient = new VoiceClient()
      const client = new HarmonyClient({
        wsFactory: createMockWsFactory(),
        voiceClient
      })
      const { identity, keyPair } = createMockIdentity()
      await client.connect({ serverUrl: 'ws://test', identity, keyPair })

      const connection = await client.joinVoice('voice-channel-1')
      expect(connection).toBeDefined()
      expect(connection.roomId).toBe('voice-channel-1')
      await client.disconnect()
    })

    it('MUST leave a voice channel', async () => {
      const voiceClient = new VoiceClient()
      const client = new HarmonyClient({
        wsFactory: createMockWsFactory(),
        voiceClient
      })
      const { identity, keyPair } = createMockIdentity()
      await client.connect({ serverUrl: 'ws://test', identity, keyPair })

      await client.joinVoice('voice-channel-1')
      await client.leaveVoice()
      expect(client.getVoiceConnection()).toBeNull()
      await client.disconnect()
    })

    it('MUST emit voice.joined event on join', async () => {
      const voiceClient = new VoiceClient()
      const client = new HarmonyClient({
        wsFactory: createMockWsFactory(),
        voiceClient
      })
      const { identity, keyPair } = createMockIdentity()
      await client.connect({ serverUrl: 'ws://test', identity, keyPair })

      let joined = false
      client.on('voice.joined' as any, () => {
        joined = true
      })
      await client.joinVoice('vc1')
      expect(joined).toBe(true)
      await client.disconnect()
    })

    it('MUST emit voice.left event on leave', async () => {
      const voiceClient = new VoiceClient()
      const client = new HarmonyClient({
        wsFactory: createMockWsFactory(),
        voiceClient
      })
      const { identity, keyPair } = createMockIdentity()
      await client.connect({ serverUrl: 'ws://test', identity, keyPair })

      let left = false
      client.on('voice.left' as any, () => {
        left = true
      })
      await client.joinVoice('vc1')
      await client.leaveVoice()
      expect(left).toBe(true)
      await client.disconnect()
    })

    it('MUST throw when voice client not configured', async () => {
      const client = new HarmonyClient({ wsFactory: createMockWsFactory() })
      const { identity, keyPair } = createMockIdentity()
      await client.connect({ serverUrl: 'ws://test', identity, keyPair })

      await expect(client.joinVoice('vc1')).rejects.toThrow('Voice client not configured')
      await client.disconnect()
    })

    it('MUST throw when not connected', async () => {
      const voiceClient = new VoiceClient()
      const client = new HarmonyClient({ voiceClient })
      await expect(client.joinVoice('vc1')).rejects.toThrow('Not connected')
    })

    it('MUST report active voice connection', async () => {
      const voiceClient = new VoiceClient()
      const client = new HarmonyClient({
        wsFactory: createMockWsFactory(),
        voiceClient
      })
      const { identity, keyPair } = createMockIdentity()
      await client.connect({ serverUrl: 'ws://test', identity, keyPair })

      expect(client.getVoiceConnection()).toBeNull()
      await client.joinVoice('vc1')
      expect(client.getVoiceConnection()).not.toBeNull()
      await client.disconnect()
    })
  })

  describe('Media', () => {
    it('MUST upload a file', async () => {
      const storage = new MediaStorage(store)
      const mediaClient = new MediaClient(storage)
      const client = new HarmonyClient({
        wsFactory: createMockWsFactory(),
        mediaClient
      })
      const { identity, keyPair } = createMockIdentity()
      await client.connect({ serverUrl: 'ws://test', identity, keyPair })

      const file: FileInput = {
        data: new Uint8Array([1, 2, 3, 4]),
        filename: 'test.txt',
        contentType: 'text/plain',
        size: 4
      }
      const ref = await client.uploadFile('community-1', 'channel-1', file)
      expect(ref.filename).toBe('test.txt')
      expect(ref.uploadedBy).toBe('did:key:z6MkTestUser123')
      await client.disconnect()
    })

    it('MUST download a file', async () => {
      const storage = new MediaStorage(store)
      const mediaClient = new MediaClient(storage)
      const client = new HarmonyClient({
        wsFactory: createMockWsFactory(),
        mediaClient
      })
      const { identity, keyPair } = createMockIdentity()
      await client.connect({ serverUrl: 'ws://test', identity, keyPair })

      const file: FileInput = {
        data: new Uint8Array([10, 20, 30]),
        filename: 'data.bin',
        contentType: 'application/octet-stream',
        size: 3
      }
      const ref = await client.uploadFile('c1', 'ch1', file)
      const downloaded = await client.downloadFile(ref, 'c1', 'ch1')
      expect(downloaded.filename).toBe('data.bin')
      expect(downloaded.data).toEqual(new Uint8Array([10, 20, 30]))
      await client.disconnect()
    })

    it('MUST throw when media client not configured', async () => {
      const client = new HarmonyClient({ wsFactory: createMockWsFactory() })
      const { identity, keyPair } = createMockIdentity()
      await client.connect({ serverUrl: 'ws://test', identity, keyPair })

      const file: FileInput = { data: new Uint8Array(1), filename: 'x', contentType: 'text/plain', size: 1 }
      await expect(client.uploadFile('c1', 'ch1', file)).rejects.toThrow('Media client not configured')
      await client.disconnect()
    })
  })

  describe('Search', () => {
    it('MUST search indexed messages', () => {
      const searchIndex = new ClientSearchIndex()
      const client = new HarmonyClient({ searchIndex })

      client.indexMessage({
        id: 'm1',
        channelId: 'ch1',
        communityId: 'c1',
        authorDID: 'did:key:alice',
        text: 'Hello world from Harmony',
        timestamp: new Date().toISOString()
      })

      const results = client.search({ text: 'hello' })
      expect(results.length).toBe(1)
      expect(results[0].messageId).toBe('m1')
    })

    it('MUST filter search by channel', () => {
      const searchIndex = new ClientSearchIndex()
      const client = new HarmonyClient({ searchIndex })

      client.indexMessage({
        id: 'm1',
        channelId: 'ch1',
        communityId: 'c1',
        authorDID: 'did:key:a',
        text: 'first message',
        timestamp: new Date().toISOString()
      })
      client.indexMessage({
        id: 'm2',
        channelId: 'ch2',
        communityId: 'c1',
        authorDID: 'did:key:b',
        text: 'second message',
        timestamp: new Date().toISOString()
      })

      const results = client.search({ text: 'message', filters: { channelId: 'ch1' } })
      expect(results.length).toBe(1)
      expect(results[0].messageId).toBe('m1')
    })

    it('MUST return empty results for no match', () => {
      const searchIndex = new ClientSearchIndex()
      const client = new HarmonyClient({ searchIndex })

      client.indexMessage({
        id: 'm1',
        channelId: 'ch1',
        communityId: 'c1',
        authorDID: 'did:key:a',
        text: 'hello',
        timestamp: new Date().toISOString()
      })

      const results = client.search({ text: 'nonexistent' })
      expect(results.length).toBe(0)
    })

    it('MUST throw when search index not configured', () => {
      const client = new HarmonyClient()
      expect(() => client.search({ text: 'test' })).toThrow('Search index not configured')
    })
  })

  describe('Governance', () => {
    it('MUST create a proposal', async () => {
      const engine = new GovernanceEngine(store)
      const client = new HarmonyClient({
        wsFactory: createMockWsFactory(),
        governanceEngine: engine
      })
      const { identity, keyPair } = createMockIdentity()
      await client.connect({ serverUrl: 'ws://test', identity, keyPair })

      const def: ProposalDef = {
        communityId: 'c1',
        title: 'Add #announcements',
        description: 'Create a new announcements channel',
        actions: [{ kind: 'create-channel', params: { name: 'announcements' } }],
        quorum: { kind: 'threshold', threshold: 2 },
        votingPeriod: 604800,
        executionDelay: 0,
        contestPeriod: 0
      }

      const proposal = await client.createProposal(def)
      expect(proposal.id).toBeTruthy()
      expect(proposal.status).toBe('active')
      expect(proposal.def.title).toBe('Add #announcements')
      await client.disconnect()
    })

    it('MUST sign a proposal', async () => {
      const engine = new GovernanceEngine(store, { totalEligible: 3 })
      const client = new HarmonyClient({
        wsFactory: createMockWsFactory(),
        governanceEngine: engine
      })
      const { identity, keyPair } = createMockIdentity()
      await client.connect({ serverUrl: 'ws://test', identity, keyPair })

      const proposal = await client.createProposal({
        communityId: 'c1',
        title: 'Test',
        description: 'Test',
        actions: [],
        quorum: { kind: 'threshold', threshold: 1 },
        votingPeriod: 3600,
        executionDelay: 0,
        contestPeriod: 0
      })

      await client.signProposal(proposal.id)
      const updated = await engine.getProposal(proposal.id)
      expect(updated!.signatures.length).toBe(1)
      expect(updated!.quorumMet).toBe(true)
      await client.disconnect()
    })

    it('MUST throw when governance engine not configured', async () => {
      const client = new HarmonyClient({ wsFactory: createMockWsFactory() })
      const { identity, keyPair } = createMockIdentity()
      await client.connect({ serverUrl: 'ws://test', identity, keyPair })

      await expect(client.createProposal({} as any)).rejects.toThrow('Governance engine not configured')
      await client.disconnect()
    })
  })

  describe('Delegation', () => {
    it('MUST delegate capabilities to another DID', async () => {
      const userCaps = new Map<string, Set<string>>()
      userCaps.set('did:key:z6MkTestUser123', new Set(['SendMessage', 'ManageChannels']))
      const delegationManager = new DelegationManager(store, userCaps)
      const client = new HarmonyClient({
        wsFactory: createMockWsFactory(),
        delegationManager
      })
      const { identity, keyPair } = createMockIdentity()
      await client.connect({ serverUrl: 'ws://test', identity, keyPair })

      const delegation = await client.delegateTo('did:key:z6MkBob', ['SendMessage'])
      expect(delegation.fromDID).toBe('did:key:z6MkTestUser123')
      expect(delegation.toDID).toBe('did:key:z6MkBob')
      expect(delegation.capabilities).toContain('SendMessage')
      expect(delegation.active).toBe(true)
      await client.disconnect()
    })

    it('MUST reject delegation of unheld capabilities', async () => {
      const delegationManager = new DelegationManager(store)
      const client = new HarmonyClient({
        wsFactory: createMockWsFactory(),
        delegationManager
      })
      const { identity, keyPair } = createMockIdentity()
      await client.connect({ serverUrl: 'ws://test', identity, keyPair })

      await expect(client.delegateTo('did:key:z6MkBob', ['AdminAll'])).rejects.toThrow(
        'Cannot delegate capability not held'
      )
      await client.disconnect()
    })

    it('MUST throw when delegation manager not configured', async () => {
      const client = new HarmonyClient({ wsFactory: createMockWsFactory() })
      const { identity, keyPair } = createMockIdentity()
      await client.connect({ serverUrl: 'ws://test', identity, keyPair })

      await expect(client.delegateTo('did:key:x', ['y'])).rejects.toThrow('Delegation manager not configured')
      await client.disconnect()
    })
  })

  describe('Reputation', () => {
    it('MUST get reputation for a DID', async () => {
      const reputationEngine = new ReputationEngine(store)
      reputationEngine.setCommunityReputation('did:key:alice', {
        communityId: 'c1',
        communityName: 'Test',
        memberSince: '2026-01-01',
        roles: ['member'],
        credentials: [],
        messageCount: 100,
        contributionScore: 50
      })

      const client = new HarmonyClient({ reputationEngine })

      const rep = await client.getReputation('did:key:alice')
      expect(rep.did).toBe('did:key:alice')
      expect(rep.communities.length).toBe(1)
      expect(rep.aggregateScore).toBeGreaterThan(0)
    })

    it('MUST return zero score for unknown DID', async () => {
      const reputationEngine = new ReputationEngine(store)
      const client = new HarmonyClient({ reputationEngine })

      const rep = await client.getReputation('did:key:unknown')
      expect(rep.did).toBe('did:key:unknown')
      expect(rep.aggregateScore).toBe(0)
    })

    it('MUST throw when reputation engine not configured', async () => {
      const client = new HarmonyClient()
      await expect(client.getReputation('did:key:x')).rejects.toThrow('Reputation engine not configured')
    })
  })

  describe('Push Notifications', () => {
    it('MUST register for push notifications', async () => {
      const pushService = new InMemoryPushService()
      const client = new HarmonyClient({
        wsFactory: createMockWsFactory(),
        pushService
      })
      const { identity, keyPair } = createMockIdentity()
      await client.connect({ serverUrl: 'ws://test', identity, keyPair })

      const reg = await client.registerPush()
      expect(reg.token).toBeTruthy()
      expect(reg.platform).toBe('web')
      await client.disconnect()
    })

    it('MUST throw when push service not configured', async () => {
      const client = new HarmonyClient({ wsFactory: createMockWsFactory() })
      const { identity, keyPair } = createMockIdentity()
      await client.connect({ serverUrl: 'ws://test', identity, keyPair })

      await expect(client.registerPush()).rejects.toThrow('Push service not configured')
      await client.disconnect()
    })
  })
})
