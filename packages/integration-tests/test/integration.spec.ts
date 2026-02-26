import { describe, it, expect, afterEach } from 'vitest'
import { WebSocket } from 'ws'
import { createCryptoProvider } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import { IdentityManager } from '@harmony/identity'
import { VCService, MemoryRevocationStore } from '@harmony/vc'
import type { DIDResolver } from '@harmony/vc'
import { ZCAPService } from '@harmony/zcap'
import { HarmonyServer } from '@harmony/server'
import { HarmonyClient } from '@harmony/client'
import { MemoryQuadStore } from '@harmony/quads'
import { CRDTLog, clockCreate, clockTick, clockMerge } from '@harmony/crdt'
import { SimplifiedMLSProvider } from '@harmony/e2ee'
import { FederationManager } from '@harmony/federation'
import { ModerationPlugin } from '@harmony/moderation'
import { MigrationService } from '@harmony/migration'
import type { KeyPair } from '@harmony/crypto'
import type { Identity } from '@harmony/identity'
import type { VerifiablePresentation } from '@harmony/vc'
import { HarmonyAction } from '@harmony/vocab'

// ── Helpers ──

const crypto = createCryptoProvider()
const didProvider = new DIDKeyProvider(crypto)
const identityMgr = new IdentityManager(crypto)
const vcService = new VCService(crypto)
const zcapService = new ZCAPService(crypto)

const resolver: DIDResolver = (did: string) => didProvider.resolve(did)

async function createIdentityAndVP(): Promise<{
  identity: Identity
  keyPair: KeyPair
  vp: VerifiablePresentation
}> {
  const { identity, keyPair } = await identityMgr.create()
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
  return { identity, keyPair, vp }
}

function createWSFactory(port: number): (url: string) => WebSocket {
  return (url: string) => new WebSocket(url) as unknown as WebSocket
}

async function createServerOnRandomPort(): Promise<{ server: HarmonyServer; port: number }> {
  // Find a random available port
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
  identity?: Identity,
  keyPair?: KeyPair,
  vp?: VerifiablePresentation
): Promise<HarmonyClient> {
  const auth = identity && keyPair && vp ? { identity, keyPair, vp } : await createIdentityAndVP()

  const client = new HarmonyClient({
    wsFactory: (url: string) => new WebSocket(url) as any
  })
  await client.connect({
    serverUrl: `ws://127.0.0.1:${port}`,
    identity: auth.identity,
    keyPair: auth.keyPair,
    vp: auth.vp
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

// ── 1. Identity → VC → Auth Flow ──

describe('1. Identity → VC → Auth Flow', () => {
  it('should create DID, issue self-signed VC, create/verify VP, and extract DID', async () => {
    // Create DID via identity
    const { identity, keyPair } = await identityMgr.create()
    expect(identity.did).toMatch(/^did:key:z/)

    // Issue self-signed VC
    const vc = await vcService.issue({
      issuerDID: identity.did,
      issuerKeyPair: keyPair,
      subjectDID: identity.did,
      type: 'HarmonyMembershipCredential',
      claims: { community: 'test-community', role: 'member' }
    })
    expect(vc.issuer).toBe(identity.did)
    expect(vc.credentialSubject.id).toBe(identity.did)
    expect(vc.type).toContain('HarmonyMembershipCredential')

    // Verify VC
    const vcResult = await vcService.verify(vc, resolver)
    expect(vcResult.valid).toBe(true)

    // Create VP wrapping VC
    const vp = await vcService.present({
      holderDID: identity.did,
      holderKeyPair: keyPair,
      credentials: [vc]
    })
    expect(vp.holder).toBe(identity.did)
    expect(vp.verifiableCredential).toHaveLength(1)

    // Verify VP signature
    const vpResult = await vcService.verifyPresentation(vp, resolver)
    expect(vpResult.valid).toBe(true)

    // Extract DID from verified VP
    expect(vp.holder).toBe(identity.did)
    expect(vp.verifiableCredential[0].credentialSubject.id).toBe(identity.did)
  })
})

// ── 2. Client → Server Connection + Auth ──

describe('2. Client → Server Connection + Auth', () => {
  it('should connect client to server with VP auth and clean disconnect', async () => {
    const { server, port } = await createServerOnRandomPort()
    servers.push(server)

    const { identity, keyPair, vp } = await createIdentityAndVP()

    const client = new HarmonyClient({
      wsFactory: (url: string) => new WebSocket(url) as any
    })

    let connectedFired = false
    client.on('connected', () => {
      connectedFired = true
    })

    await client.connect({
      serverUrl: `ws://127.0.0.1:${port}`,
      identity,
      keyPair,
      vp
    })
    clients.push(client)

    // Verify client is connected
    expect(client.isConnected()).toBe(true)
    expect(connectedFired).toBe(true)

    // Verify server accepted connection
    expect(server.connections().length).toBe(1)
    expect(server.connections()[0].did).toBe(identity.did)

    // Clean disconnection
    await client.disconnect()
    expect(client.isConnected()).toBe(false)

    // Wait a beat for server to process close
    await new Promise((r) => setTimeout(r, 100))
    expect(server.connections().length).toBe(0)
  })
})

// ── 3. Client → Server → Message Flow ──

describe('3. Client → Server → Message Flow', () => {
  it('should relay messages between two clients', async () => {
    const { server, port } = await createServerOnRandomPort()
    servers.push(server)

    const authA = await createIdentityAndVP()
    const authB = await createIdentityAndVP()

    const clientA = new HarmonyClient({ wsFactory: (url: string) => new WebSocket(url) as any })
    const clientB = new HarmonyClient({ wsFactory: (url: string) => new WebSocket(url) as any })

    await clientA.connect({ serverUrl: `ws://127.0.0.1:${port}`, ...authA })
    await clientB.connect({ serverUrl: `ws://127.0.0.1:${port}`, ...authB })
    clients.push(clientA, clientB)

    // Create community so both are subscribed
    const community = await clientA.createCommunity({ name: 'Test', defaultChannels: ['general'] })
    const channelId = community.channels[0]?.id
    expect(channelId).toBeTruthy()

    // Client B joins
    await clientB.joinCommunity(community.id)

    // Listen for message on client B
    const received = new Promise<any>((resolve) => {
      clientB.on('message', (...args: unknown[]) => {
        resolve(args[0])
      })
    })

    // Client A sends message
    const msgId = await clientA.sendMessage(community.id, channelId, 'Hello from A')
    expect(msgId).toBeTruthy()

    // Client B should receive it
    const msg = await received
    expect(msg.authorDID).toBe(authA.identity.did)
    expect(msg.channelId).toBe(channelId)
  })
})

// ── 4. Community CRUD via Client ──

describe('4. Community CRUD via Client', () => {
  it('should create community with default channels', async () => {
    const { server, port } = await createServerOnRandomPort()
    servers.push(server)

    const client = await connectClient(port)
    clients.push(client)

    const community = await client.createCommunity({
      name: 'My Community',
      description: 'A test community',
      defaultChannels: ['general', 'random']
    })

    expect(community.id).toBeTruthy()
    expect(community.info.name).toBe('My Community')
    expect(community.channels.length).toBeGreaterThanOrEqual(2)

    const channelNames = community.channels.map((c) => c.name)
    expect(channelNames).toContain('general')
    expect(channelNames).toContain('random')

    // Client sees community in list
    const communities = client.communities()
    expect(communities.length).toBe(1)
    expect(communities[0].id).toBe(community.id)
  })
})

// ── 5. E2EE Message Round-Trip ──

describe('5. E2EE Message Round-Trip', () => {
  it.skip('should encrypt and decrypt messages between two clients via MLS groups (requires MLS group key exchange wiring through server, which is not yet implemented end-to-end)', async () => {
    // The MLS provider exists but the server doesn't coordinate MLS group creation/welcome messages.
    // Individual MLS encrypt/decrypt works at unit level but the full E2EE client-to-client flow
    // through the server requires additional protocol messages (group.create, welcome, etc.)
  })

  it('should verify MLS provider can create group, encrypt and decrypt', async () => {
    const mlsProvider = new SimplifiedMLSProvider()
    const kpA = await crypto.generateSigningKeyPair()
    const encKpA = await crypto.deriveEncryptionKeyPair(kpA)

    const group = await mlsProvider.createGroup({
      groupId: 'test-group',
      creatorDID: 'did:key:zTestA',
      creatorKeyPair: kpA,
      creatorEncryptionKeyPair: encKpA
    })

    const plaintext = new TextEncoder().encode('Hello E2EE')
    const ct = await group.encrypt(plaintext)
    expect(ct.ciphertext).toBeTruthy()
    expect(ct.epoch).toBe(0)

    // Same group can decrypt
    const decrypted = await group.decrypt(ct)
    expect(new TextDecoder().decode(decrypted.plaintext)).toBe('Hello E2EE')
  })
})

// ── 6. CRDT Sync ──

describe('6. CRDT Sync', () => {
  it('should converge two CRDT logs with concurrent messages', () => {
    const logA = new CRDTLog<string>('alice')
    const logB = new CRDTLog<string>('bob')

    let clockA = clockCreate('alice')
    let clockB = clockCreate('bob')

    // Alice sends message 1
    clockA = clockTick(clockA)
    logA.append('msg-A1', clockA, 'id-A1')

    // Bob sends message 1 concurrently
    clockB = clockTick(clockB)
    logB.append('msg-B1', clockB, 'id-B1')

    // Alice sends message 2
    clockA = clockTick(clockA)
    logA.append('msg-A2', clockA, 'id-A2')

    // Merge: A receives B's messages
    for (const entry of logB.entries()) {
      logA.merge(entry.clock, entry.data, entry.id)
      clockA = clockMerge(clockA, entry.clock)
    }

    // Merge: B receives A's messages
    for (const entry of logA.entries()) {
      logB.merge(entry.clock, entry.data, entry.id)
      clockB = clockMerge(clockB, entry.clock)
    }

    // Both logs should converge to same ordering
    const entriesA = logA.entries().map((e) => e.id)
    const entriesB = logB.entries().map((e) => e.id)
    expect(entriesA).toEqual(entriesB)
    expect(entriesA.length).toBe(3) // A1, B1, A2
  })
})

// ── 7. Federation (Instance-to-Instance) ──

describe('7. Federation (Instance-to-Instance)', () => {
  it.skip('should federate messages between two server instances (requires two WS servers with real connections; FederationManager.connectToPeer uses raw WebSocket to peer endpoint which needs a running WS server accepting federation protocol)', async () => {
    // FederationManager connects to peer via WebSocket at the endpoint URL.
    // This requires the peer to have a WS server that handles federation protocol messages.
    // HarmonyServer does not currently expose a federation-aware WS handler — it only handles
    // client auth (VP). Federation would need a separate listener or protocol extension.
  })

  it('should add/remove peers and handle federated messages', async () => {
    const kpA = await crypto.generateSigningKeyPair()
    const kpB = await crypto.generateSigningKeyPair()

    const received: any[] = []
    const fedA = new FederationManager(
      { instanceDID: 'did:key:zInstanceA', instanceKeyPair: kpA },
      { onMessage: (_peer, msg) => received.push(msg) }
    )

    // Create a ZCAP for federation
    const cap = await zcapService.createRoot({
      ownerDID: 'did:key:zInstanceB',
      ownerKeyPair: kpB,
      scope: { community: 'community:test' },
      allowedAction: [HarmonyAction.SendMessage, 'harmony:Relay']
    })

    const peer = await fedA.addPeer({
      instanceDID: 'did:key:zInstanceB',
      endpoint: 'ws://127.0.0.1:9999', // not actually connected
      capability: cap
    })

    expect(peer.status).toBe('pending')
    expect(fedA.peers().length).toBe(1)

    // Handle a federated message
    const result = await fedA.handleFederatedMessage('did:key:zInstanceB', {
      id: 'fed-msg-1',
      type: 'federation.relay',
      timestamp: new Date().toISOString(),
      sender: 'did:key:zInstanceB',
      payload: {
        communityId: 'community:test',
        originalMessage: {
          id: 'orig-1',
          type: 'channel.message',
          timestamp: new Date().toISOString(),
          sender: 'did:key:zUser1',
          payload: {}
        }
      }
    })
    expect(result.accepted).toBe(true)
    expect(received.length).toBe(1)

    // Remove peer
    await fedA.removePeer('did:key:zInstanceB')
    expect(fedA.peers().length).toBe(0)
  })
})

// ── 8. Moderation Flow ──

describe('8. Moderation Flow', () => {
  it('should ban user, terminate connection, prevent reconnect, and unban', async () => {
    const { server, port } = await createServerOnRandomPort()
    servers.push(server)

    const admin = await createIdentityAndVP()
    const user = await createIdentityAndVP()

    // Helper: wait for a message of specific type on a WS
    const waitMsg = (ws: WebSocket, type: string, timeout = 3000) =>
      new Promise<any>((resolve, reject) => {
        const t = setTimeout(() => {
          ws.removeListener('message', h)
          reject(new Error('timeout:' + type))
        }, timeout)
        const h = (d: any) => {
          const m = JSON.parse(d.toString())
          if (m.type === type) {
            clearTimeout(t)
            ws.removeListener('message', h)
            resolve(m)
          }
        }
        ws.on('message', h)
      })

    // Admin raw WS — connect & auth
    const wsAdmin = new WebSocket('ws://127.0.0.1:' + port)
    await new Promise<void>((r) => wsAdmin.on('open', r))
    const authP = waitMsg(wsAdmin, 'sync.response')
    wsAdmin.send(
      JSON.stringify({
        id: 'a1',
        type: 'sync.state',
        timestamp: new Date().toISOString(),
        sender: admin.identity.did,
        payload: admin.vp
      })
    )
    await authP

    // Admin creates community
    const ccP = waitMsg(wsAdmin, 'community.updated')
    wsAdmin.send(
      JSON.stringify({
        id: 'cc1',
        type: 'community.create',
        timestamp: new Date().toISOString(),
        sender: admin.identity.did,
        payload: { name: 'Ban Test' }
      })
    )
    const ccResp = await ccP
    const communityId = ccResp.payload.communityId

    // User raw WS — connect & auth
    const wsUser = new WebSocket('ws://127.0.0.1:' + port)
    await new Promise<void>((r) => wsUser.on('open', r))
    const authP2 = waitMsg(wsUser, 'sync.response')
    wsUser.send(
      JSON.stringify({
        id: 'a2',
        type: 'sync.state',
        timestamp: new Date().toISOString(),
        sender: user.identity.did,
        payload: user.vp
      })
    )
    await authP2

    // User joins community
    const joinP = waitMsg(wsUser, 'community.updated')
    wsUser.send(
      JSON.stringify({
        id: 'cj1',
        type: 'community.join',
        timestamp: new Date().toISOString(),
        sender: user.identity.did,
        payload: { communityId, membershipVC: {} }
      })
    )
    await joinP

    // Admin bans user
    const userClosed = new Promise<number>((r) => wsUser.on('close', (code) => r(code)))
    const banP = waitMsg(wsAdmin, 'community.ban.applied')
    wsAdmin.send(
      JSON.stringify({
        id: 'b1',
        type: 'community.ban',
        timestamp: new Date().toISOString(),
        sender: admin.identity.did,
        payload: { communityId, targetDID: user.identity.did }
      })
    )
    await banP
    const closeCode = await userClosed
    expect(closeCode).toBe(4003)

    // Banned user cannot rejoin
    const wsUser2 = new WebSocket('ws://127.0.0.1:' + port)
    await new Promise<void>((r) => wsUser2.on('open', r))
    const authP3 = waitMsg(wsUser2, 'sync.response')
    wsUser2.send(
      JSON.stringify({
        id: 'a3',
        type: 'sync.state',
        timestamp: new Date().toISOString(),
        sender: user.identity.did,
        payload: user.vp
      })
    )
    await authP3

    const user2Closed = new Promise<number>((r) => wsUser2.on('close', (code) => r(code)))
    wsUser2.send(
      JSON.stringify({
        id: 'cj2',
        type: 'community.join',
        timestamp: new Date().toISOString(),
        sender: user.identity.did,
        payload: { communityId, membershipVC: {} }
      })
    )
    const closeCode2 = await user2Closed
    expect(closeCode2).toBe(4003)

    // Admin unbans user
    const unbanP = waitMsg(wsAdmin, 'community.unban.applied')
    wsAdmin.send(
      JSON.stringify({
        id: 'ub1',
        type: 'community.unban',
        timestamp: new Date().toISOString(),
        sender: admin.identity.did,
        payload: { communityId, targetDID: user.identity.did }
      })
    )
    await unbanP

    // Unbanned user can rejoin
    const wsUser3 = new WebSocket('ws://127.0.0.1:' + port)
    await new Promise<void>((r) => wsUser3.on('open', r))
    const authP4 = waitMsg(wsUser3, 'sync.response')
    wsUser3.send(
      JSON.stringify({
        id: 'a4',
        type: 'sync.state',
        timestamp: new Date().toISOString(),
        sender: user.identity.did,
        payload: user.vp
      })
    )
    await authP4

    const rejoinP = waitMsg(wsUser3, 'community.updated')
    wsUser3.send(
      JSON.stringify({
        id: 'cj3',
        type: 'community.join',
        timestamp: new Date().toISOString(),
        sender: user.identity.did,
        payload: { communityId, membershipVC: {} }
      })
    )
    const joinResp = await rejoinP
    expect(joinResp.payload.communityId).toBe(communityId)

    wsUser3.close()
    wsAdmin.close()
  })

  it('should enforce moderation rules (slow mode, rate limit)', async () => {
    const plugin = new ModerationPlugin()
    const communityId = 'community:modtest'

    // Add slow mode rule
    plugin.addRule(communityId, {
      id: 'slow1',
      type: 'slowMode',
      channelId: 'channel:general',
      intervalSeconds: 5
    })

    // First message allowed
    const r1 = await plugin.handleMessage(communityId, {
      id: 'm1',
      type: 'channel.send',
      timestamp: new Date().toISOString(),
      sender: 'did:key:zUser1',
      payload: { channelId: 'channel:general' }
    })
    expect(r1.allowed).toBe(true)

    // Second message from same user should be blocked (slow mode)
    const r2 = await plugin.handleMessage(communityId, {
      id: 'm2',
      type: 'channel.send',
      timestamp: new Date().toISOString(),
      sender: 'did:key:zUser1',
      payload: { channelId: 'channel:general' }
    })
    expect(r2.allowed).toBe(false)
    expect(r2.action).toBe('slowMode')
  })

  it('should detect raid and trigger lockdown', async () => {
    const plugin = new ModerationPlugin()
    const communityId = 'community:raidtest'

    plugin.addRule(communityId, {
      id: 'raid1',
      type: 'raidDetection',
      joinThreshold: 3,
      windowSeconds: 60,
      lockdownDurationSeconds: 300,
      action: 'lockdown'
    })

    const dummyVC = await vcService.issue({
      issuerDID: 'did:key:zAdmin',
      issuerKeyPair: await crypto.generateSigningKeyPair(),
      subjectDID: 'did:key:zUser',
      type: 'CommunityMembershipCredential',
      claims: {}
    })

    // Simulate rapid joins
    await plugin.handleJoin(communityId, 'user1', dummyVC)
    await plugin.handleJoin(communityId, 'user2', dummyVC)
    const r3 = await plugin.handleJoin(communityId, 'user3', dummyVC)

    expect(r3.allowed).toBe(false)
    expect(r3.action).toBe('lockdown')
    expect(plugin.isLockedDown(communityId)).toBe(true)

    // Release lockdown
    plugin.releaseLockdown(communityId)
    expect(plugin.isLockedDown(communityId)).toBe(false)
  })
})

// ── 9. Migration → Live Community ──

describe('9. Migration → Live Community', () => {
  it('should transform Discord export data into quads and store in server quad store', async () => {
    const migrationService = new MigrationService(crypto)
    const { identity: adminIdentity, keyPair: adminKP } = await identityMgr.create()

    const serverExport = {
      server: { id: 'srv1', name: 'Test Server', ownerId: 'owner1' },
      channels: [
        { id: 'ch1', name: 'general', type: 'text' as const },
        { id: 'ch2', name: 'random', type: 'text' as const }
      ],
      roles: [{ id: 'r1', name: 'admin', permissions: ['ADMINISTRATOR'] }],
      members: [
        { userId: 'u1', username: 'Alice', roles: ['r1'], joinedAt: '2024-01-01T00:00:00Z' },
        { userId: 'u2', username: 'Bob', roles: [], joinedAt: '2024-02-01T00:00:00Z' }
      ],
      messages: new Map([
        [
          'ch1',
          [
            {
              id: 'msg1',
              channelId: 'ch1',
              author: { id: 'u1', username: 'Alice' },
              content: 'Hello world',
              timestamp: '2024-01-01T12:00:00Z'
            },
            {
              id: 'msg2',
              channelId: 'ch1',
              author: { id: 'u2', username: 'Bob' },
              content: 'Hi Alice!',
              timestamp: '2024-01-01T12:01:00Z'
            }
          ]
        ]
      ]),
      pins: new Map<string, string[]>()
    }

    const { quads, pendingMemberMap } = migrationService.transformServerExport(serverExport, adminIdentity.did)

    expect(quads.length).toBeGreaterThan(0)
    expect(pendingMemberMap.size).toBe(2)

    // Import quads into a store
    const store = new MemoryQuadStore()
    await store.addAll(quads)

    // Verify community was created
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
    expect(messageQuads.length).toBe(2)

    // Verify re-signing credentials
    const resigned = await migrationService.resignCommunityCredentials({
      quads,
      adminDID: adminIdentity.did,
      adminKeyPair: adminKP,
      newServiceEndpoint: 'https://harmony.example.com'
    })
    expect(resigned.reissuedRootCapability).toBeTruthy()
    expect(resigned.reissuedVCs.length).toBe(2) // 2 members
  })
})

// ── 10. ZCAP Authorization Chain ──

describe('10. ZCAP Authorization Chain', () => {
  it('should create root → admin → moderator → user delegation chain and verify', async () => {
    const { identity: adminId, keyPair: adminKP } = await identityMgr.create()
    const { identity: modId, keyPair: modKP } = await identityMgr.create()
    const { identity: userId, keyPair: userKP } = await identityMgr.create()

    // Root capability (admin)
    const rootCap = await zcapService.createRoot({
      ownerDID: adminId.did,
      ownerKeyPair: adminKP,
      scope: { community: 'community:zcap-test' },
      allowedAction: [HarmonyAction.SendMessage, HarmonyAction.ManageChannel, HarmonyAction.ManageRoles]
    })

    // Admin delegates to moderator (subset of actions)
    const modCap = await zcapService.delegate({
      parentCapability: rootCap,
      delegatorKeyPair: adminKP,
      invokerDID: modId.did,
      allowedAction: [HarmonyAction.SendMessage, HarmonyAction.ManageChannel],
      scope: { community: 'community:zcap-test' }
    })

    // Moderator delegates to user (further subset)
    const userCap = await zcapService.delegate({
      parentCapability: modCap,
      delegatorKeyPair: modKP,
      invokerDID: userId.did,
      allowedAction: [HarmonyAction.SendMessage],
      scope: { community: 'community:zcap-test' }
    })

    // User invokes SendMessage — should pass
    const invocation = await zcapService.invoke({
      capability: userCap,
      invokerKeyPair: userKP,
      action: HarmonyAction.SendMessage,
      target: 'community:zcap-test:channel:general'
    })

    const chain = [rootCap, modCap, userCap]
    const result = await zcapService.verifyInvocation(invocation, chain, resolver)
    expect(result.valid).toBe(true)

    // Attenuated capability rejects over-scope action
    await expect(
      zcapService.delegate({
        parentCapability: userCap,
        delegatorKeyPair: userKP,
        invokerDID: 'did:key:zOther',
        allowedAction: [HarmonyAction.ManageRoles], // not in userCap
        scope: { community: 'community:zcap-test' }
      })
    ).rejects.toThrow('Cannot widen actions')

    // Revocation breaks chain
    const revStore = new MemoryRevocationStore()
    await zcapService.revoke(modCap.id, adminKP, revStore)

    const revokedResult = await zcapService.verifyInvocation(invocation, chain, resolver, revStore)
    expect(revokedResult.valid).toBe(false)
    const revokedCheck = revokedResult.checks.find((c) => c.name.includes('chainRevocation') && !c.passed)
    expect(revokedCheck).toBeTruthy()
  })
})
