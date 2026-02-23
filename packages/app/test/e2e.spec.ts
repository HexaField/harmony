import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MemoryQuadStore } from '@harmony/quads'
import type { QuadStore } from '@harmony/quads'
import { createCryptoProvider, randomBytes } from '@harmony/crypto'
import type { CryptoProvider, KeyPair } from '@harmony/crypto'

// Voice
import { VoiceRoomManager, VoiceClient, InMemoryLiveKitAdapter } from '@harmony/voice'
import type { VoiceRoom } from '@harmony/voice'

// Media
import { MediaClient, MediaStorage } from '@harmony/media'
import type { MediaRef } from '@harmony/media'

// Search
import { ClientSearchIndex, MetadataSearchIndex } from '@harmony/search'
import type { IndexableMessage } from '@harmony/search'

// Bot API
import { BotHost, createBotContext, EventDispatcher, ZCAPBotAuth, SandboxEnforcer } from '@harmony/bot-api'
import type { BotManifest, BotEvent } from '@harmony/bot-api'

// Governance
import { GovernanceEngine, Constitution, DelegationManager, AgentAuthManager } from '@harmony/governance'
import type { Proposal } from '@harmony/governance'

// Credentials
import {
  CredentialTypeRegistry,
  CredentialIssuer,
  ReputationEngine,
  CrossCommunityService,
  VCPortfolio
} from '@harmony/credentials'

// Server (for CommunityManager)
import { CommunityManager } from '@harmony/server'

// VC for credential issuance
import { VCService } from '@harmony/vc'

// ZCAPService for voice room manager
import { ZCAPService } from '@harmony/zcap'

// ── Helpers ──

function createTestStore(): QuadStore {
  return new MemoryQuadStore()
}

let crypto: CryptoProvider

beforeEach(async () => {
  crypto = createCryptoProvider()
})

// ────────────────────────────────────────────────────────────────────────────
// 1. Voice Call Flow
// ────────────────────────────────────────────────────────────────────────────

describe('Voice Call Flow', () => {
  let store: QuadStore
  let adapter: InMemoryLiveKitAdapter
  let manager: VoiceRoomManager
  let zcapService: ZCAPService
  let room: VoiceRoom

  beforeEach(async () => {
    store = createTestStore()
    adapter = new InMemoryLiveKitAdapter()
    zcapService = new ZCAPService(crypto)
    manager = new VoiceRoomManager(adapter, store, zcapService, { autoDestroyTimeout: 200 })
    room = await manager.createRoom('community-1', 'channel-voice', { maxParticipants: 5 })
  })

  afterEach(() => {
    manager.destroy()
  })

  it('creates a voice channel and room exists on adapter', async () => {
    expect(room.id).toBeTruthy()
    expect(room.communityId).toBe('community-1')
    expect(room.channelId).toBe('channel-voice')
    expect(adapter.hasRoom(room.id)).toBe(true)
  })

  it('Alice joins voice → participant tracked', async () => {
    manager.addParticipant(room.id, 'did:alice')
    const r = await manager.getRoom(room.id)
    expect(r!.participants).toHaveLength(1)
    expect(r!.participants[0].did).toBe('did:alice')
  })

  it('Bob joins same room → both present', async () => {
    manager.addParticipant(room.id, 'did:alice')
    manager.addParticipant(room.id, 'did:bob')
    const r = await manager.getRoom(room.id)
    expect(r!.participants).toHaveLength(2)
  })

  it('Alice toggles mute via VoiceClient', async () => {
    const token = await adapter.generateToken(room.id, 'did:alice', { did: 'did:alice' })
    const client = new VoiceClient()
    const conn = await client.joinRoom(token)
    expect(conn.localAudioEnabled).toBe(true)
    await conn.toggleAudio()
    expect(conn.localAudioEnabled).toBe(false)
    await conn.disconnect()
  })

  it('Admin mutes Bob via manager', async () => {
    manager.addParticipant(room.id, 'did:bob', { audioEnabled: true })
    await manager.muteParticipant(room.id, 'did:bob', 'audio')
    const r = await manager.getRoom(room.id)
    expect(r!.participants[0].audioEnabled).toBe(false)
    expect(adapter.isMuted(room.id, 'did:bob', 'audio')).toBe(true)
  })

  it('Alice leaves → participant count decrements', async () => {
    manager.addParticipant(room.id, 'did:alice')
    manager.addParticipant(room.id, 'did:bob')
    manager.removeParticipant(room.id, 'did:alice')
    const r = await manager.getRoom(room.id)
    expect(r!.participants).toHaveLength(1)
  })

  it('last participant leaves → room auto-destroyed', async () => {
    manager.addParticipant(room.id, 'did:alice')
    manager.removeParticipant(room.id, 'did:alice')
    // Wait for auto-destroy
    await new Promise((r) => setTimeout(r, 350))
    const r = await manager.getRoom(room.id)
    expect(r).toBeNull()
  })

  it('rejects join when room is full', () => {
    for (let i = 0; i < 5; i++) manager.addParticipant(room.id, `did:user-${i}`)
    expect(() => manager.addParticipant(room.id, 'did:extra')).toThrow('Room is full')
  })

  it('Charlie without valid ZCAP → rejected', async () => {
    const badProof = { invocation: { action: 'WrongAction', proof: '' }, capabilityId: '' }
    await expect(manager.generateJoinToken(room.id, 'did:charlie', badProof as any)).rejects.toThrow('Unauthorized')
  })

  it('VoiceClient participant joined/left events fire', async () => {
    const token = await adapter.generateToken(room.id, 'did:alice', { did: 'did:alice' })
    const client = new VoiceClient()
    const conn = (await client.joinRoom(token)) as any // access simulateParticipantJoined

    const joined: string[] = []
    const left: string[] = []
    ;(conn as any).onParticipantJoined?.call
    conn.onParticipantJoined((p: any) => joined.push(p.did))
    conn.onParticipantLeft((did: string) => left.push(did))

    conn.simulateParticipantJoined({
      did: 'did:bob',
      joinedAt: new Date().toISOString(),
      audioEnabled: true,
      videoEnabled: false,
      screenSharing: false,
      speaking: false
    })
    conn.simulateParticipantLeft('did:bob')

    expect(joined).toEqual(['did:bob'])
    expect(left).toEqual(['did:bob'])
    await conn.disconnect()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 2. File Sharing Flow
// ────────────────────────────────────────────────────────────────────────────

describe('File Sharing Flow', () => {
  let store: QuadStore
  let storage: MediaStorage
  let mediaClient: MediaClient
  let channelKey: Uint8Array

  beforeEach(() => {
    store = createTestStore()
    storage = new MediaStorage(store)
    mediaClient = new MediaClient(storage)
    channelKey = randomBytes(32)
  })

  it('Alice uploads image → encrypted on server, Bob downloads and decrypts', async () => {
    const fileData = new TextEncoder().encode('fake-image-data-for-testing-purposes')
    const file = { data: fileData, filename: 'photo.png', contentType: 'image/png', size: fileData.length }

    const ref = await mediaClient.uploadFile(file, channelKey, 'did:alice', 'comm-1', 'ch-general')

    // Server stores only ciphertext — verify it's different from plaintext
    const stored = await storage.retrieve(ref.id)
    expect(stored).not.toBeNull()
    expect(Buffer.from(stored!).toString()).not.toBe('fake-image-data-for-testing-purposes')

    // Bob downloads and decrypts
    const decrypted = await mediaClient.downloadFile(ref, channelKey)
    expect(decrypted.filename).toBe('photo.png')
    expect(new TextDecoder().decode(decrypted.data)).toBe('fake-image-data-for-testing-purposes')
  })

  it('upload progress is reported', async () => {
    const data = new Uint8Array(1000)
    const file = { data, filename: 'file.bin', contentType: 'application/octet-stream', size: data.length }
    const statuses: string[] = []

    await mediaClient.uploadFile(file, channelKey, 'did:alice', 'comm-1', 'ch-1', {
      onProgress: (p) => statuses.push(p.status)
    })

    expect(statuses).toContain('encrypting')
    expect(statuses).toContain('uploading')
    expect(statuses).toContain('complete')
  })

  it('file deletion removes from storage', async () => {
    const data = new Uint8Array(10)
    const file = { data, filename: 'f.bin', contentType: 'application/octet-stream', size: data.length }
    const ref = await mediaClient.uploadFile(file, channelKey, 'did:alice', 'comm-1', 'ch-1')

    await storage.delete(ref.id)
    const retrieved = await storage.retrieve(ref.id)
    expect(retrieved).toBeNull()
  })

  it('storage quota enforced', async () => {
    const tinyStorage = new MediaStorage(store, { quotaBytes: 100 })
    const tinyClient = new MediaClient(tinyStorage)
    const bigData = new Uint8Array(200)
    const file = { data: bigData, filename: 'big.bin', contentType: 'application/octet-stream', size: bigData.length }

    await expect(tinyClient.uploadFile(file, channelKey, 'did:alice', 'comm-1', 'ch-1')).rejects.toThrow('quota')
  })

  it('checksum mismatch detected on tampered data', async () => {
    const data = new TextEncoder().encode('original')
    const file = { data, filename: 'f.txt', contentType: 'text/plain', size: data.length }
    const ref = await mediaClient.uploadFile(file, channelKey, 'did:alice', 'comm-1', 'ch-1')

    // Tamper the encrypted checksum in ref
    const tamperedRef: MediaRef = { ...ref, encryptedChecksum: 'wrong-checksum' }
    await expect(mediaClient.downloadFile(tamperedRef, channelKey)).rejects.toThrow('checksum')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 3. Search Flow
// ────────────────────────────────────────────────────────────────────────────

describe('Search Flow', () => {
  let clientIndex: ClientSearchIndex
  let metadataIndex: MetadataSearchIndex

  const msgs: IndexableMessage[] = [
    {
      id: 'm1',
      channelId: 'ch-1',
      communityId: 'c1',
      authorDID: 'did:alice',
      text: 'The project update is ready for review',
      timestamp: '2026-01-15T10:00:00Z'
    },
    {
      id: 'm2',
      channelId: 'ch-1',
      communityId: 'c1',
      authorDID: 'did:bob',
      text: 'Great, I will check the project files',
      timestamp: '2026-01-15T11:00:00Z'
    },
    {
      id: 'm3',
      channelId: 'ch-2',
      communityId: 'c1',
      authorDID: 'did:alice',
      text: 'Meeting at 3pm today',
      timestamp: '2026-01-16T09:00:00Z'
    },
    {
      id: 'm4',
      channelId: 'ch-1',
      communityId: 'c1',
      authorDID: 'did:charlie',
      text: 'Unrelated discussion about cats',
      timestamp: '2026-02-01T12:00:00Z'
    }
  ]

  beforeEach(() => {
    clientIndex = new ClientSearchIndex()
    metadataIndex = new MetadataSearchIndex()
    for (const m of msgs) {
      clientIndex.indexMessage(m)
      metadataIndex.indexMessageMeta({
        id: m.id,
        channelId: m.channelId,
        communityId: m.communityId,
        authorDID: m.authorDID,
        timestamp: m.timestamp,
        hasAttachment: false,
        clock: 0
      })
    }
  })

  it('searches "project update" → results with snippets', () => {
    const results = clientIndex.search({ text: 'project update' })
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].snippet).toBeTruthy()
  })

  it('filter by author → only that author', () => {
    const results = clientIndex.search({ text: 'project', filters: { authorDID: 'did:alice' } })
    expect(results.every((r) => r.authorDID === 'did:alice')).toBe(true)
  })

  it('filter by channel → scoped results', () => {
    const results = clientIndex.search({ text: 'project', filters: { channelId: 'ch-1' } })
    expect(results.every((r) => r.channelId === 'ch-1')).toBe(true)
  })

  it('filter by date range', () => {
    const results = clientIndex.search({
      text: 'project',
      filters: { after: '2026-01-14T00:00:00Z', before: '2026-01-16T00:00:00Z' }
    })
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.every((r) => r.timestamp > '2026-01-14T00:00:00Z' && r.timestamp < '2026-01-16T00:00:00Z')).toBe(
      true
    )
  })

  it('server metadata search by author', () => {
    const results = metadataIndex.searchMetadata({
      communityId: 'c1',
      filters: { authorDID: 'did:alice' }
    })
    expect(results.length).toBe(2)
    expect(results.every((r) => r.authorDID === 'did:alice')).toBe(true)
  })

  it('deleted messages removed from index', () => {
    clientIndex.removeMessage('m1')
    const results = clientIndex.search({ text: 'project update' })
    expect(results.find((r) => r.messageId === 'm1')).toBeUndefined()
    expect(clientIndex.getIndexSize()).toBe(3)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 4. Bot Flow
// ────────────────────────────────────────────────────────────────────────────

describe('Bot Flow', () => {
  let store: QuadStore
  let auth: ZCAPBotAuth
  let sandbox: SandboxEnforcer
  let botHost: BotHost
  let dispatcher: EventDispatcher

  const communityId = 'community-bots'
  const adminDID = 'did:admin'
  const botDID = 'did:bot-echo'

  const manifest: BotManifest = {
    did: botDID,
    name: 'EchoBot',
    description: 'Echoes messages',
    version: '1.0.0',
    permissions: ['SendMessage', 'ReadMessage'],
    events: ['message.created'],
    entrypoint: 'echo.js'
  }

  beforeEach(async () => {
    store = createTestStore()
    auth = new ZCAPBotAuth()
    sandbox = new SandboxEnforcer()
    botHost = new BotHost(store, auth, sandbox)
    dispatcher = new EventDispatcher(auth)

    // Grant admin
    auth.grantAdmin(adminDID, communityId)
  })

  it('Admin installs bot with ZCAP delegation', async () => {
    const botId = await botHost.registerBot(manifest, communityId, adminDID, ['cap-1'])
    expect(botId).toBeTruthy()
    const bot = await botHost.getBot(botId)
    expect(bot!.manifest.name).toBe('EchoBot')
    expect(bot!.status).toBe('stopped')
  })

  it('Bot starts and receives message events', async () => {
    const botId = await botHost.registerBot(manifest, communityId, adminDID, ['cap-1'])
    await botHost.startBot(botId)

    // Set up bot context and event handling
    auth.grantBotPermission(botDID, communityId, 'SendMessage')
    auth.grantBotPermission(botDID, communityId, 'ReadMessage')
    sandbox.registerBot(botDID, {
      memoryLimitMB: 128,
      cpuPercent: 10,
      maxMessagesPerMinute: 60,
      maxApiCallsPerMinute: 120,
      networkAccess: false
    })

    const botStorage = {
      messages: new Map<string, { channelId: string; content: string; authorDID: string }>(),
      channels: new Map(),
      members: new Map()
    }
    const ctx = createBotContext(botDID, communityId, ['cap-1'], auth, sandbox, botStorage)

    const receivedEvents: BotEvent[] = []
    const bot = await botHost.getBot(botId)

    dispatcher.registerBot(bot!, async (event) => {
      receivedEvents.push(event)
      // Bot responds
      if (event.type === 'message.created') {
        await ctx.sendMessage('ch-1', `Echo: ${(event.data as any).text}`)
      }
    })

    // Dispatch event
    await dispatcher.dispatchEvent({
      type: 'message.created',
      communityId,
      channelId: 'ch-1',
      actorDID: 'did:user',
      timestamp: new Date().toISOString(),
      data: { text: 'Hello' }
    })

    expect(receivedEvents).toHaveLength(1)
    expect(botStorage.messages.size).toBe(1)
    const reply = Array.from(botStorage.messages.values())[0]
    expect(reply.content).toBe('Echo: Hello')
  })

  it('Bot action outside capabilities → rejected', async () => {
    auth.grantBotPermission(botDID, communityId, 'SendMessage')
    // NOT granting ReadMessage
    sandbox.registerBot(botDID, {
      memoryLimitMB: 128,
      cpuPercent: 10,
      maxMessagesPerMinute: 60,
      maxApiCallsPerMinute: 120,
      networkAccess: false
    })

    const botStorage = {
      messages: new Map(),
      channels: new Map([['ch-1', { id: 'ch-1', name: 'general', communityId, type: 'text' }]]),
      members: new Map()
    }
    const ctx = createBotContext(botDID, communityId, [], auth, sandbox, botStorage)

    // ReadMessage not granted → getChannel should fail
    await expect(ctx.getChannel('ch-1')).rejects.toThrow('Unauthorized')
  })

  it('Bot exceeds rate limit → throttled', async () => {
    auth.grantBotPermission(botDID, communityId, 'SendMessage')
    sandbox.registerBot(botDID, {
      memoryLimitMB: 128,
      cpuPercent: 10,
      maxMessagesPerMinute: 2,
      maxApiCallsPerMinute: 5,
      networkAccess: false
    })

    const botStorage = { messages: new Map(), channels: new Map(), members: new Map() }
    const ctx = createBotContext(botDID, communityId, [], auth, sandbox, botStorage)

    await ctx.sendMessage('ch-1', 'msg1')
    await ctx.sendMessage('ch-1', 'msg2')
    // Third message should exceed rate limit (max 2 per minute)
    await expect(ctx.sendMessage('ch-1', 'msg3')).rejects.toThrow('Rate limit')
  })

  it('Admin revokes bot → bot stopped', async () => {
    const botId = await botHost.registerBot(manifest, communityId, adminDID, ['cap-1'])
    await botHost.startBot(botId)
    expect(botHost.getBotStatus(botId)).toBe('running')

    await botHost.unregisterBot(botId)
    const bot = await botHost.getBot(botId)
    expect(bot).toBeNull()
  })

  it('non-admin cannot install bot', async () => {
    await expect(botHost.registerBot(manifest, communityId, 'did:random-user', ['cap-1'])).rejects.toThrow(
      'Unauthorized'
    )
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 5. Governance Flow
// ────────────────────────────────────────────────────────────────────────────

describe('Governance Flow', () => {
  let store: QuadStore
  let engine: GovernanceEngine
  let constitution: Constitution

  const communityId = 'community-gov'
  const mods = ['did:mod1', 'did:mod2', 'did:mod3', 'did:mod4', 'did:mod5']

  beforeEach(() => {
    store = createTestStore()
    const voterRoles = new Map<string, string[]>()
    for (const mod of mods) voterRoles.set(mod, ['moderator'])
    engine = new GovernanceEngine(store, { totalEligible: 5, voterRoles })
    constitution = new Constitution(store)
  })

  it('create proposal, collect signatures, quorum met → passed', async () => {
    const proposal = await engine.createProposal(
      {
        communityId,
        title: 'Add #announcements channel',
        description: 'Create a new announcements channel',
        actions: [{ kind: 'create-channel', params: { name: 'announcements' } }],
        quorum: { kind: 'threshold', threshold: 3 },
        votingPeriod: 3600,
        executionDelay: 0,
        contestPeriod: 0
      },
      'did:admin'
    )

    expect(proposal.status).toBe('active')

    const proof = {
      type: 'Ed25519Signature2020',
      proofPurpose: 'assertionMethod',
      verificationMethod: '',
      created: '',
      proofValue: ''
    }

    await engine.signProposal(proposal.id, 'did:mod1', proof, 'approve')
    await engine.signProposal(proposal.id, 'did:mod2', proof, 'approve')

    let p = await engine.getProposal(proposal.id)
    expect(p!.status).toBe('active') // not yet quorum

    await engine.signProposal(proposal.id, 'did:mod3', proof, 'approve')
    p = await engine.getProposal(proposal.id)
    expect(p!.status).toBe('passed')
    expect(p!.quorumMet).toBe(true)
  })

  it('passed proposal → execution creates capabilities', async () => {
    const proposal = await engine.createProposal(
      {
        communityId,
        title: 'Delegate capability',
        description: 'Grant send message capability',
        actions: [{ kind: 'delegate-capability', params: { target: 'did:user', capability: 'SendMessage' } }],
        quorum: { kind: 'threshold', threshold: 1 },
        votingPeriod: 3600,
        executionDelay: 0,
        contestPeriod: 0
      },
      'did:admin'
    )

    const proof = {
      type: 'Ed25519Signature2020',
      proofPurpose: 'assertionMethod',
      verificationMethod: '',
      created: '',
      proofValue: ''
    }
    await engine.signProposal(proposal.id, 'did:mod1', proof, 'approve')

    const result = await engine.executeProposal(proposal.id)
    expect(result.success).toBe(true)
    expect(result.actionsExecuted).toBe(1)
    expect(result.capabilitiesCreated!.length).toBe(1)

    const p = await engine.getProposal(proposal.id)
    expect(p!.status).toBe('executed')
  })

  it('proposal contested → status changes', async () => {
    const proposal = await engine.createProposal(
      {
        communityId,
        title: 'Test',
        description: 'Test',
        actions: [{ kind: 'create-channel', params: { name: 'test' } }],
        quorum: { kind: 'threshold', threshold: 1 },
        votingPeriod: 3600,
        executionDelay: 86400,
        contestPeriod: 3600
      },
      'did:admin'
    )

    const proof = {
      type: 'Ed25519Signature2020',
      proofPurpose: 'assertionMethod',
      verificationMethod: '',
      created: '',
      proofValue: ''
    }
    await engine.signProposal(proposal.id, 'did:mod1', proof, 'approve')

    await engine.contestProposal(proposal.id)
    const p = await engine.getProposal(proposal.id)
    expect(p!.status).toBe('contested')
  })

  it('constitutional constraint prevents forbidden action', async () => {
    await constitution.createConstitution(
      communityId,
      [
        {
          id: 'rule-no-delete',
          description: 'Cannot delete channels',
          constraint: { kind: 'forbid-action', params: { action: 'delete-channel' } },
          immutable: true
        }
      ],
      ['did:admin']
    )

    const check = constitution.validateAction(communityId, {
      kind: 'delete-channel',
      params: { channelId: 'ch-1' }
    })
    expect(check.allowed).toBe(false)
    expect(check.violations).toContain('rule-no-delete')
  })

  it('immutable constitution rules cannot be removed', async () => {
    await constitution.createConstitution(
      communityId,
      [
        {
          id: 'immutable-rule',
          description: 'Cannot remove',
          constraint: { kind: 'forbid-action', params: { action: 'x' } },
          immutable: true
        }
      ],
      ['did:admin']
    )

    await expect(constitution.updateConstitution(communityId, { removeRuleIds: ['immutable-rule'] })).rejects.toThrow(
      'immutable'
    )
  })

  it('duplicate signature rejected', async () => {
    const proposal = await engine.createProposal(
      {
        communityId,
        title: 'T',
        description: 'D',
        actions: [{ kind: 'create-channel', params: {} }],
        quorum: { kind: 'threshold', threshold: 3 },
        votingPeriod: 3600,
        executionDelay: 0,
        contestPeriod: 0
      },
      'did:admin'
    )

    const proof = {
      type: 'Ed25519Signature2020',
      proofPurpose: 'assertionMethod',
      verificationMethod: '',
      created: '',
      proofValue: ''
    }
    await engine.signProposal(proposal.id, 'did:mod1', proof, 'approve')
    await expect(engine.signProposal(proposal.id, 'did:mod1', proof, 'approve')).rejects.toThrow('Already signed')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 6. Custom Credentials Flow
// ────────────────────────────────────────────────────────────────────────────

describe('Custom Credentials Flow', () => {
  let store: QuadStore
  let registry: CredentialTypeRegistry
  let issuer: CredentialIssuer
  let reputation: ReputationEngine
  let portfolio: VCPortfolio
  let crossCommunity: CrossCommunityService
  let adminKP: KeyPair

  const communityId = 'community-creds'
  const adminDID = 'did:admin-creds'
  const aliceDID = 'did:alice-creds'

  beforeEach(async () => {
    store = createTestStore()
    registry = new CredentialTypeRegistry(store)
    issuer = new CredentialIssuer(crypto, registry)
    reputation = new ReputationEngine(store)
    portfolio = new VCPortfolio(crypto)
    crossCommunity = new CrossCommunityService(crypto)
    adminKP = await crypto.generateSigningKeyPair()
  })

  it('Admin creates credential type, issues to Alice', async () => {
    const credType = await registry.registerType(
      communityId,
      {
        name: 'Verified Artist',
        description: 'Verified artist in the community',
        schema: { fields: [{ name: 'artStyle', type: 'string', required: true }] },
        issuerPolicy: { kind: 'admin-only' },
        displayConfig: { badgeEmoji: '🎨', showInMemberList: true, showOnMessages: true, priority: 1 },
        revocable: true,
        transferable: true
      },
      adminDID
    )

    expect(credType.id).toBeTruthy()
    expect(credType.active).toBe(true)

    const vc = await issuer.issueCredential(
      credType.id,
      { artStyle: 'Digital' },
      adminDID,
      adminKP,
      aliceDID,
      communityId
    )

    expect(vc.credentialSubject.id).toBe(aliceDID)
    expect(vc.credentialSubject.artStyle).toBe('Digital')
    expect(vc.credentialSubject.transferable).toBe(true)

    // Import into portfolio
    await portfolio.importCredential(vc)
    const held = await portfolio.listCredentials(aliceDID)
    expect(held).toHaveLength(1)
    expect(held[0].status).toBe('active')
  })

  it('Alice presents transferable credential to another community', async () => {
    const credType = await registry.registerType(
      communityId,
      {
        name: 'TransferableBadge',
        description: 'A transferable badge',
        schema: { fields: [] },
        issuerPolicy: { kind: 'admin-only' },
        displayConfig: { showInMemberList: false, showOnMessages: false, priority: 0 },
        revocable: true,
        transferable: true
      },
      adminDID
    )

    const vc = await issuer.issueCredential(credType.id, {}, adminDID, adminKP, aliceDID, communityId)

    expect(crossCommunity.isTransferable(vc)).toBe(true)

    // Alice presents it
    const aliceKP = await crypto.generateSigningKeyPair()
    await portfolio.importCredential(vc)
    const vp = await portfolio.presentCredentials([vc.id], aliceDID, aliceKP)
    expect(vp.verifiableCredential).toHaveLength(1)
  })

  it('revoking credential updates reputation score', async () => {
    // Set up reputation
    reputation.addCredential(aliceDID, {
      credentialId: 'cred-1',
      typeId: 'type-1',
      typeName: 'Badge',
      issuingCommunity: communityId,
      issuedAt: new Date().toISOString(),
      transferable: false,
      verified: true
    })

    const before = await reputation.getReputation(aliceDID)
    expect(before.aggregateScore).toBeGreaterThan(0)

    reputation.removeCredential(aliceDID, 'cred-1')
    const after = await reputation.getReputation(aliceDID)
    expect(after.aggregateScore).toBeLessThan(before.aggregateScore)
  })

  it('schema validation rejects invalid fields', async () => {
    const credType = await registry.registerType(
      communityId,
      {
        name: 'Strict',
        description: 'Strict schema',
        schema: { fields: [{ name: 'email', type: 'string', required: true }] },
        issuerPolicy: { kind: 'admin-only' },
        displayConfig: { showInMemberList: false, showOnMessages: false, priority: 0 },
        revocable: false,
        transferable: false
      },
      adminDID
    )

    // Missing required field
    await expect(issuer.issueCredential(credType.id, {}, adminDID, adminKP, aliceDID, communityId)).rejects.toThrow(
      'Missing required field'
    )

    // Wrong type
    await expect(
      issuer.issueCredential(credType.id, { email: 42 }, adminDID, adminKP, aliceDID, communityId)
    ).rejects.toThrow('must be a string')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 7. User Delegation Flow
// ────────────────────────────────────────────────────────────────────────────

describe('User Delegation Flow', () => {
  let store: QuadStore
  let delegation: DelegationManager

  const aliceDID = 'did:alice-deleg'
  const bobDID = 'did:bob-deleg'

  beforeEach(() => {
    store = createTestStore()
    const caps = new Map<string, Set<string>>()
    caps.set(aliceDID, new Set(['SendMessage', 'ManageChannels', 'ReadMessage']))
    delegation = new DelegationManager(store, caps)
  })

  it('Alice delegates SendMessage to Bob', async () => {
    const d = await delegation.createDelegation(aliceDID, bobDID, ['SendMessage'], { reason: 'vacation' })
    expect(d.active).toBe(true)
    expect(d.capabilities).toEqual(['SendMessage'])
    expect(delegation.hasCapability(bobDID, 'SendMessage')).toBe(true)
  })

  it('Bob cannot use ManageChannels (not delegated)', async () => {
    await delegation.createDelegation(aliceDID, bobDID, ['SendMessage'])
    expect(delegation.hasCapability(bobDID, 'ManageChannels')).toBe(false)
  })

  it('delegation expires → access revoked', async () => {
    const d = await delegation.createDelegation(aliceDID, bobDID, ['SendMessage'], { expiresIn: 0 })
    // Wait a tick for expiry
    await new Promise((r) => setTimeout(r, 10))
    const active = await delegation.getActiveDelegation(d.id)
    expect(active).toBeNull()
  })

  it('Alice revokes delegation early → Bob loses access', async () => {
    const d = await delegation.createDelegation(aliceDID, bobDID, ['SendMessage', 'ReadMessage'])
    expect(delegation.hasCapability(bobDID, 'SendMessage')).toBe(true)

    await delegation.revokeDelegation(d.id)
    expect(delegation.hasCapability(bobDID, 'SendMessage')).toBe(false)
    expect(delegation.hasCapability(bobDID, 'ReadMessage')).toBe(false)
  })

  it('cannot delegate capability not held', async () => {
    await expect(delegation.createDelegation(aliceDID, bobDID, ['JoinVoice'])).rejects.toThrow('not held')
  })

  it('delegation stored as RDF quads', async () => {
    const d = await delegation.createDelegation(aliceDID, bobDID, ['SendMessage'])
    const quads = await store.match({ subject: `harmony:${d.id}` })
    expect(quads.length).toBeGreaterThan(0)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 8. AI Agent Flow
// ────────────────────────────────────────────────────────────────────────────

describe('AI Agent Flow', () => {
  let store: QuadStore
  let agentMgr: AgentAuthManager

  const communityId = 'community-ai'
  const agentDID = 'did:ai-agent'
  const adminDID = 'did:admin-ai'

  beforeEach(async () => {
    store = createTestStore()
    agentMgr = new AgentAuthManager(store)
  })

  it('Admin authorizes agent with scoped capabilities', async () => {
    const auth = await agentMgr.authorizeAgent(
      agentDID,
      communityId,
      ['SendMessage'],
      {
        maxActionsPerHour: 100,
        allowedActions: ['SendMessage'],
        auditLevel: 'full'
      },
      adminDID
    )

    expect(auth.active).toBe(true)
    expect(auth.agentDID).toBe(agentDID)
  })

  it('agent performs allowed action → audit logged', async () => {
    await agentMgr.authorizeAgent(
      agentDID,
      communityId,
      ['SendMessage'],
      {
        maxActionsPerHour: 100,
        allowedActions: ['SendMessage'],
        auditLevel: 'full'
      },
      adminDID
    )

    const result = await agentMgr.performAction(agentDID, 'SendMessage', 'ch-1')
    expect(result).toBe('allowed')

    const logs = agentMgr.getAuditLog(agentDID)
    expect(logs).toHaveLength(1)
    expect(logs[0].result).toBe('allowed')
  })

  it('agent disallowed action → denied, logged', async () => {
    await agentMgr.authorizeAgent(
      agentDID,
      communityId,
      ['SendMessage'],
      {
        maxActionsPerHour: 100,
        allowedActions: ['SendMessage'],
        auditLevel: 'full'
      },
      adminDID
    )

    const result = await agentMgr.performAction(agentDID, 'ManageChannels', 'ch-1')
    expect(result).toBe('denied')
  })

  it('agent exceeds rate limit → throttled', async () => {
    await agentMgr.authorizeAgent(
      agentDID,
      communityId,
      ['SendMessage'],
      {
        maxActionsPerHour: 2,
        allowedActions: ['SendMessage'],
        auditLevel: 'full'
      },
      adminDID
    )

    await agentMgr.performAction(agentDID, 'SendMessage', 'ch-1')
    await agentMgr.performAction(agentDID, 'SendMessage', 'ch-1')
    const result = await agentMgr.performAction(agentDID, 'SendMessage', 'ch-1')
    expect(result).toBe('rate-limited')
  })

  it('action requires human approval → detected', async () => {
    await agentMgr.authorizeAgent(
      agentDID,
      communityId,
      ['ManageChannels'],
      {
        maxActionsPerHour: 100,
        allowedActions: ['ManageChannels'],
        requireHumanApproval: ['ManageChannels'],
        auditLevel: 'full'
      },
      adminDID
    )

    expect(agentMgr.requiresHumanApproval(agentDID, 'ManageChannels')).toBe(true)
    expect(agentMgr.requiresHumanApproval(agentDID, 'SendMessage')).toBe(false)
  })

  it('admin revokes agent → actions blocked', async () => {
    const auth = await agentMgr.authorizeAgent(
      agentDID,
      communityId,
      ['SendMessage'],
      {
        maxActionsPerHour: 100,
        allowedActions: ['SendMessage'],
        auditLevel: 'full'
      },
      adminDID
    )

    await agentMgr.revokeAgent(auth.id)
    const result = await agentMgr.performAction(agentDID, 'SendMessage', 'ch-1')
    expect(result).toBe('denied')
  })

  it('audit log queryable with filters', async () => {
    await agentMgr.authorizeAgent(
      agentDID,
      communityId,
      ['SendMessage', 'ReadMessage'],
      {
        maxActionsPerHour: 100,
        allowedActions: ['SendMessage', 'ReadMessage'],
        auditLevel: 'full'
      },
      adminDID
    )

    await agentMgr.performAction(agentDID, 'SendMessage', 'ch-1')
    await agentMgr.performAction(agentDID, 'ReadMessage', 'ch-1')
    await agentMgr.performAction(agentDID, 'ManageChannels', 'ch-1') // denied

    const allLogs = agentMgr.getAuditLog(agentDID)
    expect(allLogs).toHaveLength(3)

    const deniedOnly = agentMgr.getAuditLog(agentDID, { result: 'denied' })
    expect(deniedOnly).toHaveLength(1)

    const sendOnly = agentMgr.getAuditLog(agentDID, { action: 'SendMessage' })
    expect(sendOnly).toHaveLength(1)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 9. Migration → Full Platform
// ────────────────────────────────────────────────────────────────────────────

describe('Migration → Full Platform', () => {
  let store: QuadStore
  let communityManager: CommunityManager

  beforeEach(async () => {
    store = createTestStore()
    communityManager = new CommunityManager(store, crypto)
  })

  it('migrated community uses voice channels', async () => {
    const kp = await crypto.generateSigningKeyPair()
    const { communityId } = await communityManager.create({
      name: 'Migrated Community',
      creatorDID: 'did:migrator',
      creatorKeyPair: kp,
      defaultChannels: ['general']
    })

    // Create voice channel
    const voiceChannel = await communityManager.createChannel(communityId, { name: 'voice-chat', type: 'voice' })
    expect(voiceChannel.type).toBe('voice')

    // Set up voice room
    const adapter = new InMemoryLiveKitAdapter()
    const zcapService = new ZCAPService(crypto)
    const voiceManager = new VoiceRoomManager(adapter, store, zcapService, { autoDestroyTimeout: 5000 })
    const room = await voiceManager.createRoom(communityId, voiceChannel.id)
    expect(room.communityId).toBe(communityId)

    voiceManager.destroy()
  })

  it('migrated messages searchable in full-text index', async () => {
    const kp = await crypto.generateSigningKeyPair()
    const { communityId, defaultChannels } = await communityManager.create({
      name: 'Search Community',
      creatorDID: 'did:migrator',
      creatorKeyPair: kp,
      defaultChannels: ['general']
    })

    const channelId = defaultChannels[0].id
    const searchIndex = new ClientSearchIndex()

    // Simulate migrated messages
    searchIndex.indexMessage({
      id: 'migrated-1',
      channelId,
      communityId,
      authorDID: 'did:migrator',
      text: 'Welcome to the migrated community',
      timestamp: new Date().toISOString()
    })

    const results = searchIndex.search({ text: 'migrated community' })
    expect(results.length).toBe(1)
    expect(results[0].snippet).toContain('migrated')
  })

  it('governance proposal works on migrated community', async () => {
    const kp = await crypto.generateSigningKeyPair()
    const { communityId } = await communityManager.create({
      name: 'Gov Community',
      creatorDID: 'did:migrator',
      creatorKeyPair: kp
    })

    const engine = new GovernanceEngine(store, { totalEligible: 1 })
    const proposal = await engine.createProposal(
      {
        communityId,
        title: 'Add new channel',
        description: 'Create #feedback',
        actions: [{ kind: 'create-channel', params: { name: 'feedback' } }],
        quorum: { kind: 'threshold', threshold: 1 },
        votingPeriod: 3600,
        executionDelay: 0,
        contestPeriod: 0
      },
      'did:migrator'
    )

    const proof = {
      type: 'Ed25519Signature2020',
      proofPurpose: 'assertionMethod',
      verificationMethod: '',
      created: '',
      proofValue: ''
    }
    await engine.signProposal(proposal.id, 'did:migrator', proof, 'approve')

    const result = await engine.executeProposal(proposal.id)
    expect(result.success).toBe(true)
  })

  it('custom credentials issued to migrated members', async () => {
    const kp = await crypto.generateSigningKeyPair()
    const { communityId } = await communityManager.create({
      name: 'Cred Community',
      creatorDID: 'did:admin',
      creatorKeyPair: kp
    })

    const registry = new CredentialTypeRegistry(store)
    const credIssuer = new CredentialIssuer(crypto, registry)

    const credType = await registry.registerType(
      communityId,
      {
        name: 'OG Member',
        description: 'Original community member before migration',
        schema: { fields: [{ name: 'migrationDate', type: 'date', required: true }] },
        issuerPolicy: { kind: 'admin-only' },
        displayConfig: { badgeEmoji: '⭐', showInMemberList: true, showOnMessages: true, priority: 10 },
        revocable: false,
        transferable: false
      },
      'did:admin'
    )

    const vc = await credIssuer.issueCredential(
      credType.id,
      { migrationDate: '2025-12-01' },
      'did:admin',
      kp,
      'did:member-1',
      communityId
    )

    expect(vc.credentialSubject.id).toBe('did:member-1')
    expect(vc.credentialSubject.migrationDate).toBe('2025-12-01')
  })
})
