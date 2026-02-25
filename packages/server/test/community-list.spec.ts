/**
 * Regression tests for community.list protocol message.
 *
 * The community.list flow ensures the client can request all communities
 * from the server on connect, receiving community metadata AND channels
 * in a single response. This replaces localStorage persistence of
 * communities/channels.
 *
 * Regressions covered:
 * - community.list returns all communities in the quad store
 * - community.list.response includes channels per community
 * - Empty server returns empty communities array
 * - Multiple communities returned correctly
 * - CommunityManager.listAll queries quad store for all community types
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { WebSocket } from 'ws'
import { MemoryQuadStore } from '@harmony/quads'
import { createCryptoProvider } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import { VCService, MemoryRevocationStore } from '@harmony/vc'
import { ZCAPService } from '@harmony/zcap'
import type { ProtocolMessage } from '@harmony/protocol'
import { serialise, deserialise } from '@harmony/protocol'
import { HarmonyServer, CommunityManager } from '../src/index.js'

const crypto = createCryptoProvider()
const didProvider = new DIDKeyProvider(crypto)
const vcService = new VCService(crypto)

const PORT = 19878
const didDocs: Map<string, any> = new Map()
const didResolver = async (did: string) => didDocs.get(did) ?? null

async function createIdentity() {
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

async function connectAndAuth(vp: any): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`)
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
    const timer = setTimeout(() => reject(new Error('Timeout')), timeout)
    ws.once('message', (data) => {
      clearTimeout(timer)
      resolve(deserialise<ProtocolMessage>(data.toString()))
    })
    ws.send(serialise(msg))
  })
}

let server: HarmonyServer
let store: MemoryQuadStore

describe('community.list protocol', () => {
  beforeEach(async () => {
    store = new MemoryQuadStore()
    didDocs.clear()
    server = new HarmonyServer({
      port: PORT,
      store,
      didResolver,
      revocationStore: new MemoryRevocationStore(),
      cryptoProvider: crypto,
      rateLimit: { windowMs: 1000, maxMessages: 100 }
    })
    await server.start()
  })

  afterEach(async () => {
    await server?.stop()
  })

  it('returns empty communities array when no communities exist', async () => {
    const user = await createIdentity()
    const ws = await connectAndAuth(user.vp)

    const response = await sendAndWait(ws, {
      id: 'list-1',
      type: 'community.list' as any,
      timestamp: new Date().toISOString(),
      sender: user.did,
      payload: {}
    })

    expect(response.type).toBe('community.list.response')
    expect(response.payload).toHaveProperty('communities')
    expect((response.payload as any).communities).toEqual([])
    ws.close()
  })

  it('returns created community with channels', async () => {
    const user = await createIdentity()
    const ws = await connectAndAuth(user.vp)

    // Create a community first
    const createResponse = await sendAndWait(ws, {
      id: 'create-1',
      type: 'community.create',
      timestamp: new Date().toISOString(),
      sender: user.did,
      payload: {
        name: 'Test Server',
        creatorDID: user.did,
        creatorKeyPair: user.keyPair,
        defaultChannels: ['general', 'random']
      }
    })

    const communityId = (createResponse.payload as any).communityId
    expect(communityId).toBeTruthy()

    // Now list communities
    const listResponse = await sendAndWait(ws, {
      id: 'list-2',
      type: 'community.list' as any,
      timestamp: new Date().toISOString(),
      sender: user.did,
      payload: {}
    })

    const communities = (listResponse.payload as any).communities
    expect(communities).toHaveLength(1)
    expect(communities[0].id).toBe(communityId)
    expect(communities[0].name).toBe('Test Server')

    // Must include channels (regression: was missing, causing blank UI on refresh)
    expect(communities[0].channels).toBeDefined()
    expect(communities[0].channels.length).toBeGreaterThanOrEqual(2)
    const channelNames = communities[0].channels.map((ch: any) => ch.name)
    expect(channelNames).toContain('general')
    expect(channelNames).toContain('random')

    // Each channel must have id, name, type
    for (const ch of communities[0].channels) {
      expect(ch.id).toBeTruthy()
      expect(ch.name).toBeTruthy()
      expect(ch.type).toBeTruthy()
    }

    ws.close()
  })

  it('returns multiple communities', async () => {
    const user = await createIdentity()
    const ws = await connectAndAuth(user.vp)

    // Create two communities
    await sendAndWait(ws, {
      id: 'create-a',
      type: 'community.create',
      timestamp: new Date().toISOString(),
      sender: user.did,
      payload: { name: 'Alpha', creatorDID: user.did, creatorKeyPair: user.keyPair }
    })
    await sendAndWait(ws, {
      id: 'create-b',
      type: 'community.create',
      timestamp: new Date().toISOString(),
      sender: user.did,
      payload: { name: 'Beta', creatorDID: user.did, creatorKeyPair: user.keyPair }
    })

    const listResponse = await sendAndWait(ws, {
      id: 'list-3',
      type: 'community.list' as any,
      timestamp: new Date().toISOString(),
      sender: user.did,
      payload: {}
    })

    const communities = (listResponse.payload as any).communities
    expect(communities).toHaveLength(2)
    const names = communities.map((c: any) => c.name)
    expect(names).toContain('Alpha')
    expect(names).toContain('Beta')

    ws.close()
  })
})

describe('CommunityManager.listAll', () => {
  it('returns all communities from quad store', async () => {
    const s = new MemoryQuadStore()
    const mgr = new CommunityManager(s, crypto)

    const keyPair = await crypto.generateSigningKeyPair()
    const doc = await didProvider.create(keyPair)

    const r1 = await mgr.create({
      name: 'First',
      creatorDID: doc.id,
      creatorKeyPair: keyPair,
      defaultChannels: ['general']
    })
    const r2 = await mgr.create({
      name: 'Second',
      creatorDID: doc.id,
      creatorKeyPair: keyPair,
      defaultChannels: ['chat']
    })

    const all = await mgr.listAll()
    expect(all).toHaveLength(2)
    const ids = all.map((c) => c.id)
    expect(ids).toContain(r1.communityId)
    expect(ids).toContain(r2.communityId)
  })

  it('returns empty array when quad store has no communities', async () => {
    const s = new MemoryQuadStore()
    const mgr = new CommunityManager(s, crypto)
    const all = await mgr.listAll()
    expect(all).toEqual([])
  })
})
