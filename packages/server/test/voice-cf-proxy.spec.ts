/**
 * Integration tests for Cloudflare Calls API proxy chain.
 * Uses a mock HTTP server to verify the server correctly proxies
 * voice.session.create, voice.tracks.push/pull/close, and voice.renegotiate.
 */
import http from 'node:http'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { WebSocket } from 'ws'
import { MemoryQuadStore } from '@harmony/quads'
import { createCryptoProvider } from '@harmony/crypto'
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

const didDocs: Map<string, DIDDocument> = new Map()
const didResolver = async (did: string) => didDocs.get(did) ?? null

interface MockRequest {
  method: string
  path: string
  headers: http.IncomingHttpHeaders
  body: string
}

async function createIdentity() {
  const keyPair = await crypto.generateSigningKeyPair()
  const doc = await didProvider.create(keyPair)
  didDocs.set(doc.id, doc)
  const vc = await vcService.issue({
    issuerDID: doc.id,
    issuerKeyPair: keyPair,
    subjectDID: doc.id,
    type: 'IdentityCredential',
    claims: { name: 'Test' }
  })
  const vp = await vcService.present({
    holderDID: doc.id,
    holderKeyPair: keyPair,
    credentials: [vc]
  })
  return { did: doc.id, keyPair, vp }
}

async function connectAndAuth(port: number, vp: VerifiablePresentation): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`)
    ws.on('open', () => {
      ws.send(
        serialise({
          id: 'auth-1',
          type: 'sync.state',
          timestamp: new Date().toISOString(),
          sender: vp.holder,
          payload: vp
        })
      )
      ws.once('message', () => resolve(ws))
    })
    ws.on('error', reject)
  })
}

function sendMsg(ws: WebSocket, type: string, sender: string, payload: unknown, id?: string) {
  ws.send(
    serialise({
      id: id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: type as ProtocolMessage['type'],
      timestamp: new Date().toISOString(),
      sender,
      payload
    })
  )
}

function waitForMessage(
  ws: WebSocket,
  pred: (m: ProtocolMessage) => boolean,
  timeout = 3000
): Promise<ProtocolMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', h)
      reject(new Error('Timeout waiting for message'))
    }, timeout)
    const h = (data: Buffer) => {
      const msg = deserialise<ProtocolMessage>(data.toString())
      if (pred(msg)) {
        clearTimeout(timer)
        ws.off('message', h)
        resolve(msg)
      }
    }
    ws.on('message', h)
  })
}

function createMockCFServer(): { server: http.Server; requests: MockRequest[]; port: () => number } {
  const requests: MockRequest[] = []
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString()
    })
    req.on('end', () => {
      requests.push({
        method: req.method || '',
        path: req.url || '',
        headers: req.headers,
        body
      })

      const path = req.url || ''
      res.setHeader('Content-Type', 'application/json')

      if (req.method === 'POST' && path.endsWith('/sessions/new')) {
        res.end(JSON.stringify({ sessionId: 'test-session-123' }))
      } else if (req.method === 'POST' && path.includes('/tracks/new')) {
        res.end(
          JSON.stringify({
            sessionDescription: { type: 'answer', sdp: 'v=0\r\n...' },
            tracks: [{ trackName: 'audio', mid: '0' }]
          })
        )
      } else if (req.method === 'PUT' && path.includes('/renegotiate')) {
        res.end(JSON.stringify({ sessionDescription: { sdp: 'v=0\r\nrenegotiated' } }))
      } else if (req.method === 'PUT' && path.includes('/tracks/close')) {
        res.end(JSON.stringify({ ok: true }))
      } else {
        res.statusCode = 404
        res.end(JSON.stringify({ error: 'not found' }))
      }
    })
  })

  return {
    server,
    requests,
    port: () => (server.address() as { port: number }).port
  }
}

describe('CF Proxy Chain', () => {
  let server: HarmonyServer
  let mockCF: ReturnType<typeof createMockCFServer>
  const openSockets: WebSocket[] = []

  beforeEach(async () => {
    didDocs.clear()
    openSockets.length = 0

    mockCF = createMockCFServer()
    await new Promise<void>((resolve) => mockCF.server.listen(0, '127.0.0.1', resolve))

    server = new HarmonyServer({
      port: 0,
      store: new MemoryQuadStore(),
      didResolver,
      revocationStore: new MemoryRevocationStore(),
      cryptoProvider: crypto,
      rateLimit: { windowMs: 60000, maxMessages: 1000 },
      callsAppId: 'test-app-id',
      callsAppSecret: 'test-secret',
      callsApiBase: `http://127.0.0.1:${mockCF.port()}`
    })
    await server.start()
  })

  afterEach(async () => {
    for (const ws of openSockets) {
      if (ws.readyState === WebSocket.OPEN) ws.close()
    }
    await server?.stop()
    await new Promise<void>((resolve, reject) => mockCF.server.close((err) => (err ? reject(err) : resolve())))
  })

  async function connect(): Promise<{ ws: WebSocket; did: string }> {
    const identity = await createIdentity()
    const ws = await connectAndAuth(server.port, identity.vp)
    openSockets.push(ws)
    return { ws, did: identity.did }
  }

  it('voice.token returns mode "cf" when CF is configured', async () => {
    const { ws, did } = await connect()
    const resp = waitForMessage(ws, (m) => m.type === ('voice.token.response' as ProtocolMessage['type']))
    sendMsg(ws, 'voice.token', did, { channelId: 'ch-1' })
    const msg = await resp
    const payload = msg.payload as Record<string, unknown>
    expect(payload.mode).toBe('cf')
    expect(payload.channelId).toBe('ch-1')
    expect(payload.token).toBeDefined()
  })

  it('voice.session.create proxies to CF and returns sessionId', async () => {
    const { ws, did } = await connect()
    const resp = waitForMessage(ws, (m) => m.type === ('voice.session.created' as ProtocolMessage['type']))
    sendMsg(ws, 'voice.session.create', did, {})
    const msg = await resp
    const payload = msg.payload as Record<string, unknown>
    expect(payload.sessionId).toBe('test-session-123')
  })

  it('voice.tracks.push proxies to CF and returns session description', async () => {
    const { ws, did } = await connect()
    const resp = waitForMessage(ws, (m) => m.type === ('voice.tracks.pushed' as ProtocolMessage['type']))
    sendMsg(ws, 'voice.tracks.push', did, {
      sessionId: 'sess-1',
      tracks: [{ location: 'local', trackName: 'audio' }],
      sessionDescription: { type: 'offer', sdp: 'v=0\r\noffer' }
    })
    const msg = await resp
    const payload = msg.payload as Record<string, unknown>
    const sd = payload.sessionDescription as Record<string, unknown>
    expect(sd.type).toBe('answer')
    const tracks = payload.tracks as Array<Record<string, unknown>>
    expect(tracks[0].trackName).toBe('audio')
  })

  it('voice.tracks.pull proxies to CF and returns pulled tracks', async () => {
    const { ws, did } = await connect()
    const resp = waitForMessage(ws, (m) => m.type === ('voice.tracks.pulled' as ProtocolMessage['type']))
    sendMsg(ws, 'voice.tracks.pull', did, {
      sessionId: 'sess-1',
      tracks: [{ location: 'remote', trackName: 'audio', sessionId: 'other-sess' }],
      sessionDescription: { type: 'offer', sdp: 'v=0\r\npull-offer' }
    })
    const msg = await resp
    const payload = msg.payload as Record<string, unknown>
    const sd = payload.sessionDescription as Record<string, unknown>
    expect(sd.type).toBe('answer')
  })

  it('voice.tracks.close proxies to CF', async () => {
    const { ws, did } = await connect()
    const resp = waitForMessage(ws, (m) => m.type === ('voice.tracks.closed' as ProtocolMessage['type']))
    sendMsg(ws, 'voice.tracks.close', did, {
      sessionId: 'sess-1',
      tracks: [{ trackName: 'audio' }]
    })
    const msg = await resp
    const payload = msg.payload as Record<string, unknown>
    expect(payload.closed).toBe(true)
  })

  it('voice.renegotiate proxies to CF', async () => {
    const { ws, did } = await connect()
    const resp = waitForMessage(ws, (m) => m.type === ('voice.renegotiated' as ProtocolMessage['type']))
    sendMsg(ws, 'voice.renegotiate', did, {
      sessionId: 'sess-1',
      sessionDescription: { type: 'offer', sdp: 'v=0\r\nrenego' }
    })
    const msg = await resp
    const payload = msg.payload as Record<string, unknown>
    const sd = payload.sessionDescription as Record<string, unknown>
    expect(sd.sdp).toBe('v=0\r\nrenegotiated')
  })

  it('mock CF received correct Authorization header on all requests', async () => {
    const { ws, did } = await connect()

    // Fire a session create to generate at least one request
    const resp = waitForMessage(ws, (m) => m.type === ('voice.session.created' as ProtocolMessage['type']))
    sendMsg(ws, 'voice.session.create', did, {})
    await resp

    expect(mockCF.requests.length).toBeGreaterThanOrEqual(1)
    for (const req of mockCF.requests) {
      expect(req.headers.authorization).toBe('Bearer test-secret')
    }
  })

  it('mock CF received correct URL paths', async () => {
    const { ws, did } = await connect()

    // session create
    let wait = waitForMessage(ws, (m) => m.type === ('voice.session.created' as ProtocolMessage['type']))
    sendMsg(ws, 'voice.session.create', did, {})
    await wait

    // tracks push
    wait = waitForMessage(ws, (m) => m.type === ('voice.tracks.pushed' as ProtocolMessage['type']))
    sendMsg(ws, 'voice.tracks.push', did, {
      sessionId: 'sess-1',
      tracks: [{ location: 'local', trackName: 'audio' }],
      sessionDescription: { type: 'offer', sdp: 'v=0\r\n' }
    })
    await wait

    // renegotiate
    wait = waitForMessage(ws, (m) => m.type === ('voice.renegotiated' as ProtocolMessage['type']))
    sendMsg(ws, 'voice.renegotiate', did, {
      sessionId: 'sess-1',
      sessionDescription: { type: 'offer', sdp: 'v=0\r\n' }
    })
    await wait

    // tracks close
    wait = waitForMessage(ws, (m) => m.type === ('voice.tracks.closed' as ProtocolMessage['type']))
    sendMsg(ws, 'voice.tracks.close', did, {
      sessionId: 'sess-1',
      tracks: [{ trackName: 'audio' }]
    })
    await wait

    const paths = mockCF.requests.map((r) => r.path)
    expect(paths).toContain('/v1/apps/test-app-id/sessions/new')
    expect(paths).toContain('/v1/apps/test-app-id/sessions/sess-1/tracks/new')
    expect(paths).toContain('/v1/apps/test-app-id/sessions/sess-1/renegotiate')
    expect(paths).toContain('/v1/apps/test-app-id/sessions/sess-1/tracks/close')
  })
})
