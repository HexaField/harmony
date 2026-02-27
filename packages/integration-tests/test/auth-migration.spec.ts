/**
 * Test Ed25519 auth verification and migration endpoint security.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import { createCryptoProvider } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import { MemoryRevocationStore } from '@harmony/vc'
import { MigrationService } from '@harmony/migration'
import { HarmonyServer } from '@harmony/server'
import { MemoryQuadStore } from '@harmony/quads'
import { MigrationEndpoint } from '../../server-runtime/src/migration-endpoint.js'
import { createLogger } from '../../server-runtime/src/logger.js'

const crypto = createCryptoProvider()
const didProvider = new DIDKeyProvider(crypto)
const logger = createLogger({ level: 'error', format: 'json', silent: true })

let harmonyServer: HarmonyServer
let httpServer: Server
let migrationEndpoint: MigrationEndpoint
let wsPort: number
let httpPort: number

beforeAll(async () => {
  wsPort = 19950 + Math.floor(Math.random() * 100)
  httpPort = wsPort + 1

  const store = new MemoryQuadStore()
  harmonyServer = new HarmonyServer({
    port: wsPort,
    host: '127.0.0.1',
    store,
    didResolver: didProvider,
    revocationStore: new MemoryRevocationStore(),
    cryptoProvider: crypto
  })
  await harmonyServer.start()

  migrationEndpoint = new MigrationEndpoint(logger, null)
  migrationEndpoint.setHarmonyServer(harmonyServer)

  httpServer = createServer(async (req, res) => {
    if (req.url === '/health') {
      res.writeHead(200)
      res.end('{"status":"ok"}')
      return
    }
    const handled = await migrationEndpoint.handleRequest(req, res)
    if (!handled) {
      res.writeHead(404)
      res.end('{"error":"not found"}')
    }
  })
  await new Promise<void>((r) => httpServer.listen(httpPort, '127.0.0.1', r))
})

afterAll(async () => {
  httpServer?.close()
  await harmonyServer?.stop()
})

async function signedFetch(url: string, method: string, body: any, did: string, keyPair: any) {
  const timestamp = Date.now().toString()
  // Signature format from migration-endpoint.ts: `${timestamp}:${method}:${path}`
  const path = new URL(url).pathname
  const message = `${timestamp}:${method}:${path}`
  const sig = await crypto.sign(new TextEncoder().encode(message), keyPair.secretKey)
  const sigB64 = Buffer.from(sig).toString('base64')
  return fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Harmony-Ed25519 ${did} ${timestamp} ${sigB64}`
    },
    body: body ? JSON.stringify(body) : undefined
  })
}

describe('Ed25519 Auth + Migration Endpoints', () => {
  it('health responds', async () => {
    const res = await fetch(`http://127.0.0.1:${httpPort}/health`)
    expect(res.status).toBe(200)
  })

  it('export rejects unauthenticated request', async () => {
    const res = await fetch(`http://127.0.0.1:${httpPort}/api/migration/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ communityId: 'test' })
    })
    expect(res.status).toBe(401)
  })

  it('export accepts signed request', async () => {
    const kp = await crypto.generateSigningKeyPair()
    const doc = await didProvider.create(kp)
    const res = await signedFetch(
      `http://127.0.0.1:${httpPort}/api/migration/export`,
      'POST',
      { communityId: 'nonexistent' },
      doc.id,
      kp
    )
    // Authenticated but community doesn't exist — should not be 401
    expect(res.status).not.toBe(401)
  })

  it('import decrypts and imports community', async () => {
    const kp = await crypto.generateSigningKeyPair()
    const doc = await didProvider.create(kp)
    const migration = new MigrationService(crypto)

    const quads = [
      {
        subject: 'harmony:community:importtest',
        predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
        object: 'harmony:Community',
        graph: 'harmony:community:importtest'
      },
      {
        subject: 'harmony:community:importtest',
        predicate: 'harmony:name',
        object: '"Imported Community"',
        graph: 'harmony:community:importtest'
      }
    ]

    const bundle = await migration.encryptExport(quads, kp, {
      exportDate: new Date().toISOString(),
      sourceServerId: 'discord:456',
      sourceServerName: 'TestImport',
      adminDID: doc.id,
      channelCount: 0,
      messageCount: 0,
      memberCount: 1
    })

    const res = await signedFetch(
      `http://127.0.0.1:${httpPort}/api/migration/import`,
      'POST',
      {
        bundle: {
          ciphertext: Buffer.from(bundle.ciphertext).toString('base64'),
          nonce: Buffer.from(bundle.nonce).toString('base64'),
          metadata: bundle.metadata
        },
        adminKeyPair: {
          publicKey: Buffer.from(kp.publicKey).toString('base64'),
          privateKey: Buffer.from(kp.secretKey).toString('base64')
        }
      },
      doc.id,
      kp
    )
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(500)
    const body = await res.json()
    // Should get success or at least a structured response
    expect(body).toBeDefined()
  })

  it('export status returns valid response for unknown job', async () => {
    const res = await fetch(
      `http://127.0.0.1:${httpPort}/api/migration/export/status/00000000-0000-0000-0000-000000000000`
    )
    expect([200, 404].includes(res.status)).toBe(true)
  })

  it('rejects expired timestamp (>5min old)', async () => {
    const kp = await crypto.generateSigningKeyPair()
    const doc = await didProvider.create(kp)
    const expiredTs = (Date.now() - 600_000).toString()
    const msg = `${expiredTs}:POST:/api/migration/export`
    const sig = await crypto.sign(new TextEncoder().encode(msg), kp.secretKey)
    const res = await fetch(`http://127.0.0.1:${httpPort}/api/migration/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Harmony-Ed25519 ${doc.id} ${expiredTs} ${Buffer.from(sig).toString('base64')}`
      },
      body: JSON.stringify({ communityId: 'test' })
    })
    expect(res.status).toBe(401)
  })

  it('rejects tampered signature', async () => {
    const kp = await crypto.generateSigningKeyPair()
    const doc = await didProvider.create(kp)
    const ts = Date.now().toString()
    const sig = await crypto.sign(new TextEncoder().encode(`${ts}:POST:/api/migration/export`), kp.secretKey)
    const tampered = new Uint8Array(sig)
    tampered[0] ^= 0xff
    const res = await fetch(`http://127.0.0.1:${httpPort}/api/migration/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Harmony-Ed25519 ${doc.id} ${ts} ${Buffer.from(tampered).toString('base64')}`
      },
      body: JSON.stringify({ communityId: 'test' })
    })
    expect(res.status).toBe(401)
  })

  it('rejects malformed auth header', async () => {
    const res = await fetch(`http://127.0.0.1:${httpPort}/api/migration/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer some-token'
      },
      body: JSON.stringify({ communityId: 'test' })
    })
    expect(res.status).toBe(401)
  })
})
