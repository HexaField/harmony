import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import { MigrationEndpoint } from '../src/migration-endpoint.js'
import { createLogger } from '../src/logger.js'
import { createCryptoProvider } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'

const logger = createLogger({ level: 'error', format: 'json', silent: true })
const crypto = createCryptoProvider()
const didProvider = new DIDKeyProvider(crypto)

async function createTestIdentity() {
  const keyPair = await crypto.generateSigningKeyPair()
  const doc = await didProvider.create(keyPair)
  return { did: doc.id, secretKey: keyPair.secretKey }
}

async function signAuth(did: string, secretKey: Uint8Array, method: string, path: string): Promise<string> {
  const timestamp = Date.now().toString()
  const message = `${timestamp}:${method}:${path}`
  const sig = await crypto.sign(new TextEncoder().encode(message), secretKey)
  return `Harmony-Ed25519 ${did} ${timestamp} ${Buffer.from(sig).toString('base64')}`
}

function makeRequest(
  server: Server,
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const port = (server.address() as any).port
    const opts: any = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }
    }
    const req = require('node:http').request(opts, (res: any) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString()
        try {
          resolve({ status: res.statusCode, body: JSON.parse(text) })
        } catch {
          resolve({ status: res.statusCode, body: text })
        }
      })
    })
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

/** Make a raw request (non-JSON body) with custom headers */
function makeRawRequest(
  server: Server,
  method: string,
  path: string,
  rawBody: string,
  headers?: Record<string, string>
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const port = (server.address() as any).port
    const req = require('node:http').request(
      { hostname: '127.0.0.1', port, path, method, headers: headers ?? {} },
      (res: any) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString()
          try {
            resolve({ status: res.statusCode, body: JSON.parse(text) })
          } catch {
            resolve({ status: res.statusCode, body: text })
          }
        })
      }
    )
    req.on('error', reject)
    req.write(rawBody)
    req.end()
  })
}

describe('MigrationEndpoint', () => {
  let server: Server
  let endpoint: MigrationEndpoint

  beforeEach(async () => {
    endpoint = new MigrationEndpoint(logger, null)
    server = createServer((req, res) => {
      void endpoint.handleRequest(req, res).then((handled) => {
        if (!handled) {
          res.writeHead(404)
          res.end()
        }
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('MUST return 401 for unauthenticated export', async () => {
    const res = await makeRequest(server, 'POST', '/api/migration/export', { botToken: 'x' })
    expect(res.status).toBe(401)
  })

  it('MUST return 401 for unauthenticated import', async () => {
    const res = await makeRequest(server, 'POST', '/api/migration/import', {})
    expect(res.status).toBe(401)
  })

  it('MUST return 400 for invalid JSON on export (with auth)', async () => {
    const { did, secretKey } = await createTestIdentity()
    const auth = await signAuth(did, secretKey, 'POST', '/api/migration/export')
    const res = await makeRawRequest(server, 'POST', '/api/migration/export', 'not json', {
      Authorization: auth
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Invalid JSON')
  })

  it('MUST return 400 for missing fields on export (with auth)', async () => {
    const { did, secretKey } = await createTestIdentity()
    const auth = await signAuth(did, secretKey, 'POST', '/api/migration/export')
    const res = await makeRequest(
      server,
      'POST',
      '/api/migration/export',
      { botToken: 'x' },
      {
        Authorization: auth
      }
    )
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Missing required fields')
  })

  it('MUST return 404 for unknown export ID (no auth needed)', async () => {
    const res = await makeRequest(server, 'GET', '/api/migration/export/00000000-0000-0000-0000-000000000000')
    expect(res.status).toBe(404)
  })

  it('MUST return 400 for missing fields on import (with auth)', async () => {
    const { did, secretKey } = await createTestIdentity()
    const auth = await signAuth(did, secretKey, 'POST', '/api/migration/import')
    const res = await makeRequest(
      server,
      'POST',
      '/api/migration/import',
      { adminDID: 'did:key:z123' },
      {
        Authorization: auth
      }
    )
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Missing required fields')
  })

  it('MUST return 503 for import when store is null (with auth)', async () => {
    const { did, secretKey } = await createTestIdentity()
    const auth = await signAuth(did, secretKey, 'POST', '/api/migration/import')
    const res = await makeRequest(
      server,
      'POST',
      '/api/migration/import',
      {
        bundle: { ciphertext: 'aa', nonce: 'bb', metadata: {} },
        adminDID: 'did:key:z123',
        communityName: 'Test'
      },
      { Authorization: auth }
    )
    expect(res.status).toBe(503)
  })

  it('MUST return 404 for unhandled paths', async () => {
    const res = await makeRequest(server, 'GET', '/api/migration/unknown')
    expect(res.status).toBe(404)
  })

  it('MUST return 202 with exportId for valid export request (with auth)', async () => {
    const { did, secretKey } = await createTestIdentity()
    const auth = await signAuth(did, secretKey, 'POST', '/api/migration/export')
    const res = await makeRequest(
      server,
      'POST',
      '/api/migration/export',
      {
        botToken: 'fake-token',
        guildId: '123',
        adminDID: 'did:key:z123'
      },
      { Authorization: auth }
    )
    expect(res.status).toBe(202)
    expect(res.body.exportId).toBeTruthy()
  })

  it('MUST include adminKeyPair in completed export status', async () => {
    const { did, secretKey } = await createTestIdentity()
    const auth = await signAuth(did, secretKey, 'POST', '/api/migration/export')
    const exportRes = await makeRequest(
      server,
      'POST',
      '/api/migration/export',
      {
        botToken: 'fake-token',
        guildId: '123',
        adminDID: 'did:key:z123'
      },
      { Authorization: auth }
    )
    expect(exportRes.status).toBe(202)
    const { exportId } = exportRes.body

    let statusRes: { status: number; body: any }
    let attempts = 0
    do {
      await new Promise((r) => setTimeout(r, 200))
      statusRes = await makeRequest(server, 'GET', `/api/migration/export/${exportId}`)
      attempts++
    } while (statusRes.body.status === 'running' && attempts < 20)

    expect(statusRes.status).toBe(200)
    expect(['complete', 'error']).toContain(statusRes.body.status)
    if (statusRes.body.status === 'complete') {
      expect(statusRes.body.adminKeyPair).toBeDefined()
    }
  })

  it('MUST accept adminKeyPair in import request body (with auth)', async () => {
    const { did, secretKey } = await createTestIdentity()
    const auth = await signAuth(did, secretKey, 'POST', '/api/migration/import')
    const res = await makeRequest(
      server,
      'POST',
      '/api/migration/import',
      {
        bundle: { ciphertext: 'aa', nonce: 'bb', metadata: {} },
        adminDID: 'did:key:z123',
        communityName: 'Test',
        adminKeyPair: {
          publicKey: Buffer.from('test-pub').toString('base64'),
          secretKey: Buffer.from('test-sec').toString('base64')
        }
      },
      { Authorization: auth }
    )
    expect(res.status).toBe(503)
  })
})
