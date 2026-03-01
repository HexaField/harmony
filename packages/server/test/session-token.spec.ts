import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { WebSocket } from 'ws'
import { MemoryQuadStore } from '@harmony/quads'
import { createCryptoProvider } from '@harmony/crypto'
import type { KeyPair } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import type { DIDDocument } from '@harmony/did'
import { VCService, MemoryRevocationStore } from '@harmony/vc'
import type { VerifiablePresentation } from '@harmony/vc'
import type { ProtocolMessage } from '@harmony/protocol'
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

async function createIdentity() {
  const keyPair = await crypto.generateSigningKeyPair()
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

  return { did: doc.id, doc, keyPair, vp }
}

function sendAndWait(ws: WebSocket, msg: ProtocolMessage, timeout = 5000): Promise<ProtocolMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for response')), timeout)
    ws.once('message', (data) => {
      clearTimeout(timer)
      resolve(deserialise<ProtocolMessage>(data.toString()))
    })
    ws.send(serialise(msg))
  })
}

function waitForMessage(ws: WebSocket, timeout = 5000): Promise<ProtocolMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for message')), timeout)
    ws.once('message', (data) => {
      clearTimeout(timer)
      resolve(deserialise<ProtocolMessage>(data.toString()))
    })
  })
}

describe('Session Token Auth', () => {
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

  it('should return a session token after VP auth', async () => {
    const { vp } = await createIdentity()
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`)
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve)
      ws.on('error', reject)
    })

    const response = await sendAndWait(ws, {
      id: 'auth-1',
      type: 'sync.state',
      timestamp: new Date().toISOString(),
      sender: vp.holder,
      payload: vp
    })

    expect(response.type).toBe('sync.response')
    expect((response.payload as any).authenticated).toBe(true)
    expect((response.payload as any).sessionToken).toBeDefined()
    expect(typeof (response.payload as any).sessionToken).toBe('string')
    ws.close()
  })

  it('should authenticate with a session token', async () => {
    const { vp, did } = await createIdentity()

    // First: VP auth to get token
    const ws1 = new WebSocket(`ws://127.0.0.1:${server.port}`)
    await new Promise<void>((resolve, reject) => {
      ws1.on('open', resolve)
      ws1.on('error', reject)
    })
    const resp1 = await sendAndWait(ws1, {
      id: 'auth-1',
      type: 'sync.state',
      timestamp: new Date().toISOString(),
      sender: vp.holder,
      payload: vp
    })
    const token = (resp1.payload as any).sessionToken
    ws1.close()
    // Wait for close to propagate
    await new Promise((r) => setTimeout(r, 100))

    // Second: token auth
    const ws2 = new WebSocket(`ws://127.0.0.1:${server.port}`)
    await new Promise<void>((resolve, reject) => {
      ws2.on('open', resolve)
      ws2.on('error', reject)
    })
    const resp2 = await sendAndWait(ws2, {
      id: 'token-auth',
      type: 'auth.token.verify' as ProtocolMessage['type'],
      timestamp: new Date().toISOString(),
      sender: did,
      payload: { token }
    })

    expect(resp2.type).toBe('sync.response')
    expect((resp2.payload as any).authenticated).toBe(true)
    expect((resp2.payload as any).did).toBe(did)
    expect((resp2.payload as any).sessionToken).toBeDefined()
    ws2.close()
  })

  it('should reject an invalid token and allow VP fallback', async () => {
    const { vp, did } = await createIdentity()

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`)
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve)
      ws.on('error', reject)
    })

    // Send invalid token
    const resp1 = await sendAndWait(ws, {
      id: 'bad-token',
      type: 'auth.token.verify' as ProtocolMessage['type'],
      timestamp: new Date().toISOString(),
      sender: did,
      payload: { token: 'invalid.token' }
    })

    expect(resp1.type as string).toBe('auth.token.expired')

    // Fall back to VP auth — connection should still be open
    const resp2 = await sendAndWait(ws, {
      id: 'auth-vp',
      type: 'sync.state',
      timestamp: new Date().toISOString(),
      sender: vp.holder,
      payload: vp
    })

    expect(resp2.type).toBe('sync.response')
    expect((resp2.payload as any).authenticated).toBe(true)
    ws.close()
  })

  it('should issue a fresh token on auth.token.request', async () => {
    const { vp, did } = await createIdentity()

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`)
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve)
      ws.on('error', reject)
    })

    // Authenticate first
    await sendAndWait(ws, {
      id: 'auth-1',
      type: 'sync.state',
      timestamp: new Date().toISOString(),
      sender: vp.holder,
      payload: vp
    })

    // Request fresh token
    const resp = await sendAndWait(ws, {
      id: 'refresh-1',
      type: 'auth.token.request' as ProtocolMessage['type'],
      timestamp: new Date().toISOString(),
      sender: did,
      payload: {}
    })

    expect(resp.type as string).toBe('auth.token.response')
    expect((resp.payload as any).token).toBeDefined()

    // Verify the fresh token works
    ws.close()
    await new Promise((r) => setTimeout(r, 100))

    const ws2 = new WebSocket(`ws://127.0.0.1:${server.port}`)
    await new Promise<void>((resolve, reject) => {
      ws2.on('open', resolve)
      ws2.on('error', reject)
    })
    const resp2 = await sendAndWait(ws2, {
      id: 'token-auth',
      type: 'auth.token.verify' as ProtocolMessage['type'],
      timestamp: new Date().toISOString(),
      sender: did,
      payload: { token: (resp.payload as any).token }
    })
    expect(resp2.type).toBe('sync.response')
    expect((resp2.payload as any).authenticated).toBe(true)
    ws2.close()
  })
})
