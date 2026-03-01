import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { WebSocket } from 'ws'
import { MemoryQuadStore } from '@harmony/quads'
import { createCryptoProvider } from '@harmony/crypto'
import type { KeyPair } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import type { DIDDocument } from '@harmony/did'
import { VCService, MemoryRevocationStore } from '@harmony/vc'
import type { VerifiablePresentation, VerifiableCredential } from '@harmony/vc'
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

describe('VP-based WebSocket Authentication', () => {
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

  it('MUST accept a valid VP and establish connection', async () => {
    const { vp } = await createIdentity()
    const ws = await connectAndAuth(vp)
    expect(server.connections().length).toBe(1)
    ws.close()
  })

  it('MUST reject a VP with expired proof.created', async () => {
    const { vp, did } = await createIdentity()

    // Hack proof.created to 2 years ago
    const expiredVP = JSON.parse(JSON.stringify(vp)) as VerifiablePresentation
    const twoYearsAgo = new Date()
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
    ;(expiredVP as any).proof.created = twoYearsAgo.toISOString()

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`)
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve)
      ws.on('error', reject)
    })

    const response = await sendAndWait(ws, {
      id: 'auth-expired',
      type: 'sync.state',
      timestamp: new Date().toISOString(),
      sender: did,
      payload: expiredVP
    })

    expect(response.type).toBe('error')
    expect((response.payload as { code: string }).code).toBeTruthy()
    ws.close()
  })

  it('MUST reject a VP missing the proof field entirely', async () => {
    const { vp, did } = await createIdentity()

    // Remove proof field
    const malformedVP = JSON.parse(JSON.stringify(vp))
    delete malformedVP.proof

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`)
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve)
      ws.on('error', reject)
    })

    const response = await sendAndWait(ws, {
      id: 'auth-malformed',
      type: 'sync.state',
      timestamp: new Date().toISOString(),
      sender: did,
      payload: malformedVP
    })

    expect(response.type).toBe('error')
    ws.close()
  })

  it('MUST allow the same VP on two separate WS connections (no nonce replay rejection)', async () => {
    const { vp } = await createIdentity()

    const ws1 = await connectAndAuth(vp)
    const ws2 = await connectAndAuth(vp)

    expect(server.connections().length).toBe(2)

    ws1.close()
    ws2.close()
  })

  it('MUST set connection DID from VP holder, not from sender field', async () => {
    const identity1 = await createIdentity()
    const identity2 = await createIdentity()

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`)
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve)
      ws.on('error', reject)
    })

    // Send identity1's VP but claim sender is identity2
    // Server should authenticate based on VP holder (identity1), not sender field
    const authMsg: ProtocolMessage = {
      id: 'auth-wrong-did',
      type: 'sync.state',
      timestamp: new Date().toISOString(),
      sender: identity2.did,
      payload: identity1.vp
    }
    ws.send(serialise(authMsg))

    await new Promise<void>((resolve) => {
      ws.once('message', () => resolve())
    })

    // Connection DID should be from the VP holder, not the sender field
    const conn = server.connections()[0]
    expect(conn.did).toBe(identity1.did)
    ws.close()
  })

  it('MUST reject auth message with missing VP payload', async () => {
    const { did } = await createIdentity()

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`)
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve)
      ws.on('error', reject)
    })

    const response = await sendAndWait(ws, {
      id: 'auth-empty',
      type: 'sync.state',
      timestamp: new Date().toISOString(),
      sender: did,
      payload: {}
    })

    expect(response.type).toBe('error')
    ws.close()
  })
})
