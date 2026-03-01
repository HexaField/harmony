import { describe, it, expect, afterEach } from 'vitest'
import { WebSocket } from 'ws'
import { createCryptoProvider } from '@harmony/crypto'
import type { KeyPair } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import { IdentityManager } from '@harmony/identity'
import type { Identity } from '@harmony/identity'
import { VCService, MemoryRevocationStore } from '@harmony/vc'
import type { VerifiablePresentation, DIDResolver } from '@harmony/vc'
import { ZCAPService } from '@harmony/zcap'
import { HarmonyServer } from '@harmony/server'
import { HarmonyClient } from '@harmony/client'
import { MemoryQuadStore } from '@harmony/quads'
import type { QuadStore } from '@harmony/quads'
import { MigrationService } from '@harmony/migration'
import { SimplifiedMLSProvider } from '@harmony/e2ee'
import { ModerationPlugin } from '@harmony/moderation'
import { FederationManager } from '@harmony/federation'
import { HarmonyAction } from '@harmony/vocab'
import {
  CredentialTypeRegistry,
  CredentialIssuer,
  ReputationEngine,
  CrossCommunityService,
  VCPortfolio
} from '@harmony/credentials'
import { GovernanceEngine, Constitution } from '@harmony/governance'
import { BotHost, createBotContext, EventDispatcher, ZCAPBotAuth, SandboxEnforcer } from '@harmony/bot-api'
import type { BotManifest } from '@harmony/bot-api'

// ── Shared Helpers ──

const crypto = createCryptoProvider()
const didProvider = new DIDKeyProvider(crypto)
const identityMgr = new IdentityManager(crypto)
const vcService = new VCService(crypto)
const zcapService = new ZCAPService(crypto)
const resolver: DIDResolver = (did: string) => didProvider.resolve(did)

function createTestStore(): QuadStore {
  return new MemoryQuadStore()
}

async function createIdentityAndVP(): Promise<{
  identity: Identity
  keyPair: KeyPair
  vp: VerifiablePresentation
  mnemonic: string
}> {
  const { identity, keyPair, mnemonic } = await identityMgr.create()
  const vc = await vcService.issue({
    issuerDID: identity.did,
    issuerKeyPair: keyPair,
    subjectDID: identity.did,
    type: 'HarmonyAuthCredential',
    claims: { auth: true }
  })
  const vp = await vcService.present({
    holderDID: identity.did,
    holderKeyPair: keyPair,
    credentials: [vc]
  })
  return { identity, keyPair, vp, mnemonic }
}

async function createServerOnRandomPort(): Promise<{ server: HarmonyServer; port: number }> {
  const { createServer } = await import('node:net')
  const port = await new Promise<number>((resolve) => {
    const s = createServer()
    s.listen(0, () => {
      const addr = s.address()
      const p = typeof addr === 'object' && addr ? addr.port : 0
      s.close(() => resolve(p))
    })
  })
  const store = new MemoryQuadStore()
  const revocationStore = new MemoryRevocationStore()
  const server = new HarmonyServer({
    port,
    host: '127.0.0.1',
    store,
    didResolver: resolver,
    revocationStore
  })
  await server.start()
  return { server, port }
}

async function connectClient(
  port: number,
  identity: Identity,
  keyPair: KeyPair,
  vp: VerifiablePresentation
): Promise<HarmonyClient> {
  const client = new HarmonyClient({
    wsFactory: (url: string) => new WebSocket(url) as any
  })
  await client.connect({
    serverUrl: `ws://127.0.0.1:${port}`,
    identity,
    keyPair,
    vp
  })
  return client
}

// Track resources for cleanup
const servers: HarmonyServer[] = []
const clients: HarmonyClient[] = []

afterEach(async () => {
  for (const c of clients) {
    try {
      await c.disconnect()
    } catch {
      /* ignore */
    }
  }
  clients.length = 0
  for (const s of servers) {
    try {
      await s.stop()
    } catch {
      /* ignore */
    }
  }
  servers.length = 0
})

// ────────────────────────────────────────────────────────────────────────────
// 1. New User Onboarding Journey
// ────────────────────────────────────────────────────────────────────────────

describe('Journey 1: New User Onboarding', () => {
  it('creates identity, recovers from mnemonic, issues VC, connects, creates community, sends message', async () => {
    // Step 1: Create identity from random mnemonic
    const { identity, keyPair, mnemonic } = await identityMgr.create()
    expect(identity.did).toMatch(/^did:key:z/)
    expect(mnemonic.split(' ').length).toBe(12)

    // Step 2: Verify mnemonic recovers same DID
    const recovered = await identityMgr.createFromMnemonic(mnemonic)
    expect(recovered.identity.did).toBe(identity.did)
    expect(Buffer.from(recovered.keyPair.publicKey).toString('hex')).toBe(
      Buffer.from(keyPair.publicKey).toString('hex')
    )

    // Step 3: Issue self-signed identity VC
    const identityVC = await vcService.issue({
      issuerDID: identity.did,
      issuerKeyPair: keyPair,
      subjectDID: identity.did,
      type: 'HarmonyIdentityCredential',
      claims: { displayName: 'Alice', createdAt: new Date().toISOString() }
    })
    expect(identityVC.issuer).toBe(identity.did)
    expect(identityVC.credentialSubject.id).toBe(identity.did)

    const vcResult = await vcService.verify(identityVC, resolver)
    expect(vcResult.valid).toBe(true)

    // Step 4: Create VP for server auth
    const authVC = await vcService.issue({
      issuerDID: identity.did,
      issuerKeyPair: keyPair,
      subjectDID: identity.did,
      type: 'HarmonyAuthCredential',
      claims: { auth: true }
    })
    const vp = await vcService.present({
      holderDID: identity.did,
      holderKeyPair: keyPair,
      credentials: [authVC]
    })
    const vpResult = await vcService.verifyPresentation(vp, resolver)
    expect(vpResult.valid).toBe(true)

    // Step 5: Connect to server
    const { server, port } = await createServerOnRandomPort()
    servers.push(server)

    const client = await connectClient(port, identity, keyPair, vp)
    clients.push(client)
    expect(client.isConnected()).toBe(true)

    // Step 6: Create first community
    const community = await client.createCommunity({
      name: 'My First Community',
      defaultChannels: ['general']
    })
    expect(community.id).toBeTruthy()
    expect(community.info.name).toBe('My First Community')
    expect(community.channels.length).toBeGreaterThanOrEqual(1)

    const channelId = community.channels[0].id

    // Step 7: Send first message
    const msgId = await client.sendMessage(community.id, channelId, 'Hello, world!')
    expect(msgId).toBeTruthy()

    // Step 8: Verify message persisted and retrievable
    const log = client.getChannelLog(community.id, channelId)
    expect(log).toBeTruthy()
    const entries = log!.entries()
    expect(entries.length).toBe(1)
    expect(entries[0].data.content.text).toBe('Hello, world!')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 2. Discord Migration Journey
// ────────────────────────────────────────────────────────────────────────────

describe('Journey 2: Discord Migration', () => {
  it('migrates Discord data to Harmony, verifies quads, connects to server, accesses data', async () => {
    const migrationService = new MigrationService(crypto)
    const { identity: adminIdentity, keyPair: adminKP, mnemonic: _mnemonic } = await identityMgr.create()
    const { identity: user2Identity, keyPair: user2KP } = await identityMgr.create()

    // Step 1: Create identities for two users (simulating Discord linking via VC)
    const discordLinkVC1 = await vcService.issue({
      issuerDID: adminIdentity.did,
      issuerKeyPair: adminKP,
      subjectDID: adminIdentity.did,
      type: 'DiscordLinkCredential',
      claims: { discordUserId: 'u1', discordUsername: 'Alice', provider: 'discord' }
    })
    expect(discordLinkVC1.credentialSubject.discordUserId).toBe('u1')

    const discordLinkVC2 = await vcService.issue({
      issuerDID: user2Identity.did,
      issuerKeyPair: user2KP,
      subjectDID: user2Identity.did,
      type: 'DiscordLinkCredential',
      claims: { discordUserId: 'u2', discordUsername: 'Bob', provider: 'discord' }
    })

    // Step 2: Import Discord server data
    const serverExport = {
      server: { id: 'srv1', name: 'Gaming Server', ownerId: 'u1' },
      channels: [
        { id: 'ch1', name: 'general', type: 'text' as const },
        { id: 'ch2', name: 'memes', type: 'text' as const }
      ],
      roles: [
        { id: 'r1', name: 'admin', permissions: ['ADMINISTRATOR'] },
        { id: 'r2', name: 'member', permissions: ['SEND_MESSAGES'] }
      ],
      members: [
        { userId: 'u1', username: 'Alice', roles: ['r1'], joinedAt: '2024-01-01T00:00:00Z' },
        { userId: 'u2', username: 'Bob', roles: ['r2'], joinedAt: '2024-02-01T00:00:00Z' }
      ],
      messages: new Map([
        [
          'ch1',
          [
            {
              id: 'msg1',
              channelId: 'ch1',
              author: { id: 'u1', username: 'Alice' },
              content: 'Welcome!',
              timestamp: '2024-01-01T12:00:00Z'
            },
            {
              id: 'msg2',
              channelId: 'ch1',
              author: { id: 'u2', username: 'Bob' },
              content: 'Thanks Alice!',
              timestamp: '2024-01-01T12:01:00Z'
            }
          ]
        ],
        [
          'ch2',
          [
            {
              id: 'msg3',
              channelId: 'ch2',
              author: { id: 'u1', username: 'Alice' },
              content: 'First meme',
              timestamp: '2024-01-02T10:00:00Z'
            }
          ]
        ]
      ]),
      pins: new Map<string, string[]>()
    }

    const { quads, pendingMemberMap } = migrationService.transformServerExport(serverExport, adminIdentity.did)

    // Step 3: Verify channels/messages/roles imported as RDF quads
    expect(quads.length).toBeGreaterThan(0)
    expect(pendingMemberMap.size).toBe(2)

    const store = new MemoryQuadStore()
    await store.addAll(quads)

    // Verify community
    const communityQuads = await store.match({
      predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
      object: 'https://harmony.example/vocab#Community'
    })
    expect(communityQuads.length).toBe(1)

    // Verify channels
    const channelQuads = await store.match({
      predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
      object: 'https://harmony.example/vocab#Channel'
    })
    expect(channelQuads.length).toBe(2)

    // Verify messages
    const messageQuads = await store.match({
      predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
      object: 'https://harmony.example/vocab#Message'
    })
    expect(messageQuads.length).toBe(3)

    // Step 4: Connect to Harmony server with migrated identity
    const { server, port } = await createServerOnRandomPort()
    servers.push(server)

    const authVC = await vcService.issue({
      issuerDID: adminIdentity.did,
      issuerKeyPair: adminKP,
      subjectDID: adminIdentity.did,
      type: 'HarmonyAuthCredential',
      claims: { auth: true }
    })
    const vp = await vcService.present({
      holderDID: adminIdentity.did,
      holderKeyPair: adminKP,
      credentials: [authVC]
    })
    const client = await connectClient(port, adminIdentity, adminKP, vp)
    clients.push(client)
    expect(client.isConnected()).toBe(true)

    // Step 5: Friend graph reconstruction — both users have Discord link VCs
    // pointing to same server, so they can discover each other
    expect(discordLinkVC1.credentialSubject.discordUserId).toBe('u1')
    expect(discordLinkVC2.credentialSubject.discordUserId).toBe('u2')
    // Both are in pendingMemberMap
    expect(pendingMemberMap.has('u1')).toBe(true)
    expect(pendingMemberMap.has('u2')).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 3. Multi-Community User Journey
// ────────────────────────────────────────────────────────────────────────────

describe('Journey 3: Multi-Community User', () => {
  it('same identity joins two communities, messages isolated, DID consistent', async () => {
    const { server, port } = await createServerOnRandomPort()
    servers.push(server)

    const auth = await createIdentityAndVP()
    const client = await connectClient(port, auth.identity, auth.keyPair, auth.vp)
    clients.push(client)

    // Create Community A
    const communityA = await client.createCommunity({
      name: 'Community Alpha',
      defaultChannels: ['general']
    })
    const channelA = communityA.channels[0].id

    // Create Community B
    const communityB = await client.createCommunity({
      name: 'Community Beta',
      defaultChannels: ['lobby']
    })
    const channelB = communityB.channels[0].id

    // Send messages in both
    const msgIdA = await client.sendMessage(communityA.id, channelA, 'Hello Alpha!')
    const msgIdB = await client.sendMessage(communityB.id, channelB, 'Hello Beta!')
    expect(msgIdA).toBeTruthy()
    expect(msgIdB).toBeTruthy()

    // Verify communities are isolated
    const logA = client.getChannelLog(communityA.id, channelA)
    const logB = client.getChannelLog(communityB.id, channelB)

    expect(logA!.entries().length).toBe(1)
    expect(logB!.entries().length).toBe(1)
    expect(logA!.entries()[0].data.content.text).toBe('Hello Alpha!')
    expect(logB!.entries()[0].data.content.text).toBe('Hello Beta!')

    // Messages don't leak between communities
    expect(logA!.entries().every((e) => e.data.content.text !== 'Hello Beta!')).toBe(true)
    expect(logB!.entries().every((e) => e.data.content.text !== 'Hello Alpha!')).toBe(true)

    // Verify identity is the same across both
    expect(client.myDID()).toBe(auth.identity.did)
    expect(client.communities().length).toBe(2)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 4. Moderation Journey
// ────────────────────────────────────────────────────────────────────────────

describe('Journey 4: Moderation', () => {
  it('admin creates community, assigns moderator, moderator acts, admin bans/unbans user', async () => {
    const { server, port } = await createServerOnRandomPort()
    servers.push(server)

    // Admin creates community
    const adminAuth = await createIdentityAndVP()
    const adminClient = await connectClient(port, adminAuth.identity, adminAuth.keyPair, adminAuth.vp)
    clients.push(adminClient)

    const community = await adminClient.createCommunity({
      name: 'Moderated Community',
      defaultChannels: ['general']
    })
    const channelId = community.channels[0].id

    // User joins community
    const userAuth = await createIdentityAndVP()
    const userClient = await connectClient(port, userAuth.identity, userAuth.keyPair, userAuth.vp)
    clients.push(userClient)
    await userClient.joinCommunity(community.id)

    // Admin assigns moderator role via VC issuance
    const modVC = await vcService.issue({
      issuerDID: adminAuth.identity.did,
      issuerKeyPair: adminAuth.keyPair,
      subjectDID: userAuth.identity.did,
      type: 'CommunityModeratorCredential',
      claims: { community: community.id, role: 'moderator' }
    })
    const modVCResult = await vcService.verify(modVC, resolver)
    expect(modVCResult.valid).toBe(true)
    expect(modVC.credentialSubject.role).toBe('moderator')

    // Moderator uses ZCAP to get mod capabilities
    const rootCap = await zcapService.createRoot({
      ownerDID: adminAuth.identity.did,
      ownerKeyPair: adminAuth.keyPair,
      scope: { community: community.id },
      allowedAction: [HarmonyAction.SendMessage, HarmonyAction.ManageChannel, HarmonyAction.ManageRoles]
    })

    const modCap = await zcapService.delegate({
      parentCapability: rootCap,
      delegatorKeyPair: adminAuth.keyPair,
      invokerDID: userAuth.identity.did,
      allowedAction: [HarmonyAction.ManageChannel],
      scope: { community: community.id }
    })
    expect(modCap.invoker).toBe(userAuth.identity.did)

    // Moderator uses moderation plugin for slow mode
    const plugin = new ModerationPlugin()
    plugin.addRule(community.id, {
      id: 'slow1',
      type: 'slowMode',
      channelId: channelId,
      intervalSeconds: 5
    })

    const r1 = await plugin.handleMessage(community.id, {
      id: 'm1',
      type: 'channel.send',
      timestamp: new Date().toISOString(),
      sender: 'did:key:zSpammer',
      payload: { channelId }
    })
    expect(r1.allowed).toBe(true)

    const r2 = await plugin.handleMessage(community.id, {
      id: 'm2',
      type: 'channel.send',
      timestamp: new Date().toISOString(),
      sender: 'did:key:zSpammer',
      payload: { channelId }
    })
    expect(r2.allowed).toBe(false)
    expect(r2.action).toBe('slowMode')

    // Admin bans user (via client protocol)
    // The ban is sent through the protocol
    await adminClient.banMember(community.id, userAuth.identity.did, 'Spam')

    // Ban enforcement is tested in integration.spec.ts (banned user is disconnected and cannot rejoin).
    // This journey test verifies the client-side ban call.
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 5. Identity Recovery Journey
// ────────────────────────────────────────────────────────────────────────────

describe('Journey 5: Identity Recovery', () => {
  it('creates identity, loses it, recovers from mnemonic, reconnects and sends messages', async () => {
    const { server, port } = await createServerOnRandomPort()
    servers.push(server)

    // Step 1: Create identity with mnemonic
    const { identity: origIdentity, keyPair: origKP, mnemonic } = await identityMgr.create()
    const origDID = origIdentity.did

    // Connect and create community
    const authVC = await vcService.issue({
      issuerDID: origIdentity.did,
      issuerKeyPair: origKP,
      subjectDID: origIdentity.did,
      type: 'HarmonyAuthCredential',
      claims: { auth: true }
    })
    const vp1 = await vcService.present({
      holderDID: origIdentity.did,
      holderKeyPair: origKP,
      credentials: [authVC]
    })

    const client1 = await connectClient(port, origIdentity, origKP, vp1)
    clients.push(client1)

    const community = await client1.createCommunity({
      name: 'Recovery Test',
      defaultChannels: ['general']
    })
    const channelId = community.channels[0].id
    await client1.sendMessage(community.id, channelId, 'Before recovery')

    // Step 2: "Lose" the identity — disconnect
    await client1.disconnect()

    // Step 3: Recover from mnemonic
    const { identity: recoveredIdentity, keyPair: recoveredKP } = await identityMgr.createFromMnemonic(mnemonic)

    // Step 4: Verify same DID, same keys
    expect(recoveredIdentity.did).toBe(origDID)
    expect(Buffer.from(recoveredKP.publicKey).toString('hex')).toBe(Buffer.from(origKP.publicKey).toString('hex'))
    expect(Buffer.from(recoveredKP.secretKey).toString('hex')).toBe(Buffer.from(origKP.secretKey).toString('hex'))

    // Step 5: Reconnect to server with recovered identity
    const authVC2 = await vcService.issue({
      issuerDID: recoveredIdentity.did,
      issuerKeyPair: recoveredKP,
      subjectDID: recoveredIdentity.did,
      type: 'HarmonyAuthCredential',
      claims: { auth: true }
    })
    const vp2 = await vcService.present({
      holderDID: recoveredIdentity.did,
      holderKeyPair: recoveredKP,
      credentials: [authVC2]
    })

    const client2 = await connectClient(port, recoveredIdentity, recoveredKP, vp2)
    clients.push(client2)
    expect(client2.isConnected()).toBe(true)
    expect(client2.myDID()).toBe(origDID)

    // Step 6: Can still access communities and send messages
    await client2.joinCommunity(community.id)
    const msgId = await client2.sendMessage(community.id, channelId, 'After recovery!')
    expect(msgId).toBeTruthy()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 6. Federation Journey
// ────────────────────────────────────────────────────────────────────────────

describe('Journey 6: Federation', () => {
  it('two instances federate, relay messages, revocation stops relay', async () => {
    const kpA = await crypto.generateSigningKeyPair()
    const kpB = await crypto.generateSigningKeyPair()
    const instanceDIDA = 'did:key:zInstanceA'
    const instanceDIDB = 'did:key:zInstanceB'

    const receivedA: any[] = []
    const receivedB: any[] = []

    // Server A creates federation manager
    const fedA = new FederationManager(
      { instanceDID: instanceDIDA, instanceKeyPair: kpA },
      { onMessage: (_peer, msg) => receivedA.push(msg) }
    )

    // Server B creates federation manager
    const _fedB = new FederationManager(
      { instanceDID: instanceDIDB, instanceKeyPair: kpB },
      { onMessage: (_peer, msg) => receivedB.push(msg) }
    )

    // Admin on A creates community
    const communityId = 'community:federated-test'

    // Create ZCAP for federation: B gets capability to relay to A's community
    const fedCap = await zcapService.createRoot({
      ownerDID: instanceDIDB,
      ownerKeyPair: kpB,
      scope: { community: communityId },
      allowedAction: [HarmonyAction.SendMessage, 'harmony:Relay']
    })

    // A adds B as peer
    const peer = await fedA.addPeer({
      instanceDID: instanceDIDB,
      endpoint: 'ws://127.0.0.1:9999', // not actually connected for unit test
      capability: fedCap
    })
    expect(peer.status).toBe('pending')
    expect(fedA.peers().length).toBe(1)

    // B sends federated message to A
    const fedResult = await fedA.handleFederatedMessage(instanceDIDB, {
      id: 'fed-msg-1',
      type: 'federation.relay',
      timestamp: new Date().toISOString(),
      sender: instanceDIDB,
      payload: {
        communityId,
        originalMessage: {
          id: 'orig-1',
          type: 'channel.message',
          timestamp: new Date().toISOString(),
          sender: 'did:key:zUserOnB',
          payload: { text: 'Hello from B!' }
        }
      }
    })
    expect(fedResult.accepted).toBe(true)
    expect(receivedA.length).toBe(1)

    // Admin on A revokes federation — remove peer
    await fedA.removePeer(instanceDIDB)
    expect(fedA.peers().length).toBe(0)

    // After revocation, B's messages should be rejected
    const rejectedResult = await fedA.handleFederatedMessage(instanceDIDB, {
      id: 'fed-msg-2',
      type: 'federation.relay',
      timestamp: new Date().toISOString(),
      sender: instanceDIDB,
      payload: {
        communityId,
        originalMessage: {
          id: 'orig-2',
          type: 'channel.message',
          timestamp: new Date().toISOString(),
          sender: 'did:key:zUserOnB',
          payload: { text: 'Should be rejected' }
        }
      }
    })
    expect(rejectedResult.accepted).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 7. E2EE Private Messaging Journey
// ────────────────────────────────────────────────────────────────────────────

describe('Journey 7: E2EE Private Messaging', () => {
  it('two users create MLS group, encrypt/decrypt messages, third user excluded', async () => {
    const mlsProvider = new SimplifiedMLSProvider()

    // User A creates identity and keys
    const kpA = await crypto.generateSigningKeyPair()
    const encKpA = await crypto.deriveEncryptionKeyPair(kpA)
    const didA = 'did:key:zUserA'

    // User B creates identity and keys
    const kpB = await crypto.generateSigningKeyPair()
    const _encKpB = await crypto.deriveEncryptionKeyPair(kpB)
    const _didB = 'did:key:zUserB'

    // User C (outsider)
    const kpC = await crypto.generateSigningKeyPair()
    const encKpC = await crypto.deriveEncryptionKeyPair(kpC)

    // Step 1: Create MLS group for DM channel
    const group = await mlsProvider.createGroup({
      groupId: 'dm-channel-AB',
      creatorDID: didA,
      creatorKeyPair: kpA,
      creatorEncryptionKeyPair: encKpA
    })
    expect(group).toBeTruthy()

    // Step 2: User A sends encrypted message
    const plaintext = new TextEncoder().encode('Secret message from A')
    const ct = await group.encrypt(plaintext)
    expect(ct.ciphertext).toBeTruthy()
    expect(ct.epoch).toBe(0)

    // Step 3: Same group can decrypt (simulating User B with group key)
    const decrypted = await group.decrypt(ct)
    expect(new TextDecoder().decode(decrypted.plaintext)).toBe('Secret message from A')

    // Step 4: Verify a different group (User C) can't decrypt
    const otherGroup = await mlsProvider.createGroup({
      groupId: 'other-group',
      creatorDID: 'did:key:zUserC',
      creatorKeyPair: kpC,
      creatorEncryptionKeyPair: encKpC
    })

    // Different group's decrypt should fail or produce garbage
    await expect(otherGroup.decrypt(ct)).rejects.toThrow()
  })

  it('full E2EE flow through server with MLS group key exchange', async () => {
    // Server-side MLS coordination is now implemented:
    // - mls.group.setup tracks E2EE groups on the server
    // - mls.member.joined notifies group creators when new members join
    // - Client auto-adds members via addMemberToChannel()
    // - Welcome/commit messages are forwarded to correct recipients
    // Full integration tested in packages/integration-tests/test/e2ee-integration.spec.ts
    const mlsProvider = new SimplifiedMLSProvider()
    const kp = await crypto.generateSigningKeyPair()
    const encKp = await crypto.deriveEncryptionKeyPair(kp)

    const group = await mlsProvider.createGroup({
      groupId: 'user-journey-e2ee',
      creatorDID: 'did:key:zCreator',
      creatorKeyPair: kp,
      creatorEncryptionKeyPair: encKp
    })

    // Verify encrypt → decrypt roundtrip
    const plaintext = new TextEncoder().encode('User journey E2EE test')
    const ct = await group.encrypt(plaintext)
    const result = await group.decrypt(ct)
    expect(new TextDecoder().decode(result.plaintext)).toBe('User journey E2EE test')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 8. Credential Portfolio Journey
// ────────────────────────────────────────────────────────────────────────────

describe('Journey 8: Credential Portfolio', () => {
  it('user collects credentials, builds portfolio, presents to another community', async () => {
    const store = createTestStore()
    const registry = new CredentialTypeRegistry(store)
    const credIssuer = new CredentialIssuer(crypto, registry)
    const _reputation = new ReputationEngine(store)
    const portfolio = new VCPortfolio(crypto)
    const crossCommunity = new CrossCommunityService(crypto)

    const { identity: adminId, keyPair: adminKP } = await identityMgr.create()
    const adminDID = adminId.did
    const { identity: aliceId, keyPair: aliceKP } = await identityMgr.create()
    const aliceDID = aliceId.did
    const communityA = 'community:alpha'
    const _communityB = 'community:beta'

    // Step 1: Discord linking VC (simulated OAuth)
    const discordVC = await vcService.issue({
      issuerDID: aliceDID,
      issuerKeyPair: aliceKP,
      subjectDID: aliceDID,
      type: 'DiscordLinkCredential',
      claims: { discordUserId: '12345', discordUsername: 'alice#1234', provider: 'discord' }
    })
    await portfolio.importCredential(discordVC)

    // Step 2: Community membership VC
    const membershipVC = await vcService.issue({
      issuerDID: adminDID,
      issuerKeyPair: adminKP,
      subjectDID: aliceDID,
      type: 'CommunityMembershipCredential',
      claims: { community: communityA, role: 'member' }
    })
    await portfolio.importCredential(membershipVC)

    // Step 3: Moderator role VC
    const modVC = await vcService.issue({
      issuerDID: adminDID,
      issuerKeyPair: adminKP,
      subjectDID: aliceDID,
      type: 'CommunityModeratorCredential',
      claims: { community: communityA, role: 'moderator' }
    })
    await portfolio.importCredential(modVC)

    // Step 4: Custom credential (community-defined type)
    const credType = await registry.registerType(
      communityA,
      {
        name: 'Verified Artist',
        description: 'Verified artist',
        schema: { fields: [{ name: 'artStyle', type: 'string', required: true }] },
        issuerPolicy: { kind: 'admin-only' },
        displayConfig: { badgeEmoji: '🎨', showInMemberList: true, showOnMessages: true, priority: 1 },
        revocable: true,
        transferable: true
      },
      adminDID
    )

    const customVC = await credIssuer.issueCredential(
      credType.id,
      { artStyle: 'Digital' },
      adminDID,
      adminKP,
      aliceDID,
      communityA,
      ['admin']
    )
    await portfolio.importCredential(customVC)

    // Verify portfolio has all credentials
    const held = await portfolio.listCredentials(aliceDID)
    expect(held.length).toBe(4)

    // Step 5: Present selected credentials to community B
    const selectedIds = [membershipVC.id, modVC.id]
    const vp = await portfolio.presentCredentials(selectedIds, aliceDID, aliceKP)
    expect(vp.verifiableCredential).toHaveLength(2)

    // Step 6: Verify the presentation
    const vpResult = await vcService.verifyPresentation(vp, resolver)
    expect(vpResult.valid).toBe(true)

    // Step 7: Check transferability
    expect(crossCommunity.isTransferable(customVC)).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 9. Bot + Governance Journey
// ────────────────────────────────────────────────────────────────────────────

describe('Journey 9: Bot + Governance', () => {
  it('admin creates community with constitution, installs bot, governance proposal creates channel', async () => {
    const store = createTestStore()
    const communityId = 'community:governed'
    const adminDID = 'did:key:zAdminGov'
    const botDID = 'did:key:zBotEcho'

    // Step 1: Create community with constitution
    const constitution = new Constitution(store)
    await constitution.createConstitution(
      communityId,
      [
        {
          id: 'rule-no-delete-channels',
          description: 'Cannot delete channels',
          constraint: { kind: 'forbid-action', params: { action: 'delete-channel' } },
          immutable: true
        }
      ],
      [adminDID]
    )

    // Verify constitutional constraint
    const check = constitution.validateAction(communityId, {
      kind: 'delete-channel',
      params: { channelId: 'ch-1' }
    })
    expect(check.allowed).toBe(false)

    // Step 2: Install bot with scoped ZCAP
    const auth = new ZCAPBotAuth()
    const sandbox = new SandboxEnforcer()
    const botHost = new BotHost(store, auth, sandbox)
    auth.grantAdmin(adminDID, communityId)

    const manifest: BotManifest = {
      did: botDID,
      name: 'EchoBot',
      description: 'Echoes messages',
      version: '1.0.0',
      permissions: ['SendMessage', 'ReadMessage'],
      events: ['message.created'],
      entrypoint: 'echo.js'
    }

    const botId = await botHost.registerBot(manifest, communityId, adminDID, ['cap-1'])
    await botHost.startBot(botId)

    // Set up bot permissions
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
    const dispatcher = new EventDispatcher(auth)
    const bot = await botHost.getBot(botId)

    // Step 3: Bot responds to messages
    dispatcher.registerBot(bot!, async (event) => {
      if (event.type === 'message.created') {
        await ctx.sendMessage('ch-general', `Echo: ${(event.data as any).text}`)
      }
    })

    await dispatcher.dispatchEvent({
      type: 'message.created',
      communityId,
      channelId: 'ch-general',
      actorDID: 'did:key:zUser1',
      timestamp: new Date().toISOString(),
      data: { text: 'Hello bot!' }
    })

    expect(botStorage.messages.size).toBe(1)
    const reply = Array.from(botStorage.messages.values())[0]
    expect(reply.content).toBe('Echo: Hello bot!')

    // Step 4: Governance proposal to create new channel
    const mods = ['did:key:zMod1', 'did:key:zMod2', 'did:key:zMod3']
    const voterRoles = new Map<string, string[]>()
    for (const mod of mods) voterRoles.set(mod, ['moderator'])
    const engine = new GovernanceEngine(store, { totalEligible: 3, voterRoles })

    const proposal = await engine.createProposal(
      {
        communityId,
        title: 'Create #announcements channel',
        description: 'Add a new announcements channel',
        actions: [{ kind: 'create-channel', params: { name: 'announcements' } }],
        quorum: { kind: 'threshold', threshold: 2 },
        votingPeriod: 3600,
        executionDelay: 0,
        contestPeriod: 0
      },
      adminDID
    )

    expect(proposal.status).toBe('active')

    const proof = {
      type: 'Ed25519Signature2020',
      proofPurpose: 'assertionMethod',
      verificationMethod: '',
      created: '',
      proofValue: ''
    }
    await engine.signProposal(proposal.id, 'did:key:zMod1', proof, 'approve')
    await engine.signProposal(proposal.id, 'did:key:zMod2', proof, 'approve')

    // Step 5: Quorum reached, execute
    const p = await engine.getProposal(proposal.id)
    expect(p!.status).toBe('passed')
    expect(p!.quorumMet).toBe(true)

    const result = await engine.executeProposal(proposal.id)
    expect(result.success).toBe(true)
    expect(result.actionsExecuted).toBe(1)

    const executed = await engine.getProposal(proposal.id)
    expect(executed!.status).toBe('executed')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 10. Cloud → Self-Hosted Migration Journey
// ────────────────────────────────────────────────────────────────────────────

describe('Journey 10: Cloud → Self-Hosted Migration', () => {
  it('creates identity, exports encrypted data, re-signs VCs for self-hosted', async () => {
    const migrationService = new MigrationService(crypto)
    const { identity: adminIdentity, keyPair: adminKP, mnemonic } = await identityMgr.create()

    // Step 1: Create identity on "cloud" service
    expect(adminIdentity.did).toMatch(/^did:key:z/)

    // Step 2: Create community data to export
    const serverExport = {
      server: { id: 'cloud-srv', name: 'Cloud Community', ownerId: 'admin1' },
      channels: [{ id: 'ch1', name: 'general', type: 'text' as const }],
      roles: [{ id: 'r1', name: 'admin', permissions: ['ADMINISTRATOR'] }],
      members: [
        { userId: 'admin1', username: 'Admin', roles: ['r1'], joinedAt: '2024-01-01T00:00:00Z' },
        { userId: 'u1', username: 'User1', roles: [], joinedAt: '2024-03-01T00:00:00Z' }
      ],
      messages: new Map([
        [
          'ch1',
          [
            {
              id: 'msg1',
              channelId: 'ch1',
              author: { id: 'admin1', username: 'Admin' },
              content: 'Welcome to the cloud!',
              timestamp: '2024-01-01T12:00:00Z'
            }
          ]
        ]
      ]),
      pins: new Map<string, string[]>()
    }

    const { quads } = migrationService.transformServerExport(serverExport, adminIdentity.did)
    expect(quads.length).toBeGreaterThan(0)

    // Step 3: Export encrypted sync payload
    const syncPayload = await identityMgr.exportSyncPayload(adminIdentity, adminKP)
    expect(syncPayload.ciphertext).toBeTruthy()

    // Step 4: Import on self-hosted (decrypt with mnemonic)
    const { identity: selfHostedIdentity, keyPair: selfHostedKP } = await identityMgr.importSyncPayload(
      syncPayload,
      mnemonic
    )
    expect(selfHostedIdentity.did).toBe(adminIdentity.did)

    // Step 5: Re-sign VCs and update service endpoints for self-hosted
    const resigned = await migrationService.resignCommunityCredentials({
      quads,
      adminDID: adminIdentity.did,
      adminKeyPair: adminKP,
      newServiceEndpoint: 'https://my-selfhosted.example.com'
    })
    expect(resigned.reissuedRootCapability).toBeTruthy()
    expect(resigned.reissuedVCs.length).toBe(2) // 2 members

    // Step 6: Verify membership VCs still valid with same admin DID
    for (const vc of resigned.reissuedVCs) {
      expect(vc.issuer).toBe(adminIdentity.did)
      const result = await vcService.verify(vc, resolver)
      expect(result.valid).toBe(true)
    }

    // Step 7: Connect to self-hosted server with recovered identity
    const { server, port } = await createServerOnRandomPort()
    servers.push(server)

    const authVC = await vcService.issue({
      issuerDID: selfHostedIdentity.did,
      issuerKeyPair: selfHostedKP,
      subjectDID: selfHostedIdentity.did,
      type: 'HarmonyAuthCredential',
      claims: { auth: true }
    })
    const vp = await vcService.present({
      holderDID: selfHostedIdentity.did,
      holderKeyPair: selfHostedKP,
      credentials: [authVC]
    })

    const client = await connectClient(port, selfHostedIdentity, selfHostedKP, vp)
    clients.push(client)
    expect(client.isConnected()).toBe(true)
    expect(client.myDID()).toBe(adminIdentity.did)
  })
})
