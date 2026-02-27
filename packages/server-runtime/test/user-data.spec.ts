import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { MigrationEndpoint } from '../src/migration-endpoint.js'
import { createLogger } from '../src/logger.js'
import { createCryptoProvider } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'

const logger = createLogger({ level: 'error', format: 'json', silent: true })
const crypto = createCryptoProvider()
const didProvider = new DIDKeyProvider(crypto)

/** Generate a test identity: DID + secret key */
async function createTestIdentity() {
  const keyPair = await crypto.generateSigningKeyPair()
  const doc = await didProvider.create(keyPair)
  return { did: doc.id, secretKey: keyPair.secretKey, publicKey: keyPair.publicKey }
}

/** Sign a request for Harmony-Ed25519 auth */
async function signAuth(did: string, secretKey: Uint8Array, method: string, path: string): Promise<string> {
  const timestamp = Date.now().toString()
  const message = `${timestamp}:${method}:${path}`
  const messageBytes = new TextEncoder().encode(message)
  const signature = await crypto.sign(messageBytes, secretKey)
  const signatureB64 = Buffer.from(signature).toString('base64')
  return `Harmony-Ed25519 ${did} ${timestamp} ${signatureB64}`
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

describe('User Data Endpoints (authenticated)', () => {
  let server: Server
  let mediaDir: string

  beforeEach(async () => {
    mediaDir = mkdtempSync(join(tmpdir(), 'harmony-user-data-'))
    const endpoint = new MigrationEndpoint(logger, null, mediaDir)
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
    rmSync(mediaDir, { recursive: true, force: true })
  })

  it('rejects requests without Authorization header', async () => {
    const res = await makeRequest(server, 'POST', '/api/user-data/upload', { did: 'test' })
    expect(res.status).toBe(401)
    expect(res.body.error).toContain('Authorization')
  })

  it('rejects requests with invalid Authorization scheme', async () => {
    const res = await makeRequest(
      server,
      'POST',
      '/api/user-data/upload',
      { did: 'test' },
      {
        Authorization: 'Bearer some-token'
      }
    )
    expect(res.status).toBe(401)
  })

  it('rejects requests with expired timestamp', async () => {
    const { did, secretKey } = await createTestIdentity()
    const oldTimestamp = (Date.now() - 10 * 60 * 1000).toString()
    const message = `${oldTimestamp}:POST:/api/user-data/upload`
    const sig = await crypto.sign(new TextEncoder().encode(message), secretKey)
    const auth = `Harmony-Ed25519 ${did} ${oldTimestamp} ${Buffer.from(sig).toString('base64')}`

    const res = await makeRequest(
      server,
      'POST',
      '/api/user-data/upload',
      { did },
      {
        Authorization: auth
      }
    )
    expect(res.status).toBe(401)
    expect(res.body.error).toContain('Timestamp')
  })

  it('rejects requests with wrong signature', async () => {
    const identity = await createTestIdentity()
    const other = await createTestIdentity()
    // Sign with other's key but claim identity's DID
    const auth = await signAuth(identity.did, other.secretKey, 'POST', '/api/user-data/upload')

    const res = await makeRequest(
      server,
      'POST',
      '/api/user-data/upload',
      { did: identity.did },
      {
        Authorization: auth
      }
    )
    expect(res.status).toBe(401)
    expect(res.body.error).toContain('Signature')
  })

  it('upload + get + delete round-trip with valid auth', async () => {
    const { did, secretKey } = await createTestIdentity()

    const upload = {
      did,
      ciphertext: Buffer.from('encrypted-data-here').toString('base64'),
      nonce: Buffer.from('nonce12345678').toString('base64'),
      metadata: {
        messageCount: 42,
        channelCount: 5,
        serverCount: 2,
        dateRange: { earliest: '2023-01-01', latest: '2024-01-01' },
        uploadedAt: new Date().toISOString()
      }
    }

    // Upload
    const uploadAuth = await signAuth(did, secretKey, 'POST', '/api/user-data/upload')
    const uploadRes = await makeRequest(server, 'POST', '/api/user-data/upload', upload, {
      Authorization: uploadAuth
    })
    expect(uploadRes.status).toBe(200)
    expect(uploadRes.body.ok).toBe(true)

    // Get
    const getPath = `/api/user-data/${encodeURIComponent(did)}`
    const getAuth = await signAuth(did, secretKey, 'GET', getPath)
    const getRes = await makeRequest(server, 'GET', getPath, undefined, {
      Authorization: getAuth
    })
    expect(getRes.status).toBe(200)
    expect(getRes.body.ciphertext).toBe(upload.ciphertext)
    expect(getRes.body.nonce).toBe(upload.nonce)
    expect(getRes.body.metadata.messageCount).toBe(42)

    // Delete
    const delAuth = await signAuth(did, secretKey, 'DELETE', getPath)
    const delRes = await makeRequest(server, 'DELETE', getPath, undefined, {
      Authorization: delAuth
    })
    expect(delRes.status).toBe(200)

    // Verify gone
    const getAuth2 = await signAuth(did, secretKey, 'GET', getPath)
    const gone = await makeRequest(server, 'GET', getPath, undefined, {
      Authorization: getAuth2
    })
    expect(gone.status).toBe(404)
  })

  it('rejects upload for a different DID than authenticated', async () => {
    const identity = await createTestIdentity()
    const other = await createTestIdentity()

    const auth = await signAuth(identity.did, identity.secretKey, 'POST', '/api/user-data/upload')
    const res = await makeRequest(
      server,
      'POST',
      '/api/user-data/upload',
      {
        did: other.did,
        ciphertext: Buffer.from('x').toString('base64'),
        nonce: Buffer.from('y').toString('base64'),
        metadata: {
          messageCount: 1,
          channelCount: 1,
          serverCount: 1,
          dateRange: null,
          uploadedAt: new Date().toISOString()
        }
      },
      { Authorization: auth }
    )
    expect(res.status).toBe(403)
    expect(res.body.error).toContain('DID mismatch')
  })

  it('rejects GET for a different DID than authenticated', async () => {
    const identity = await createTestIdentity()
    const other = await createTestIdentity()

    const path = `/api/user-data/${encodeURIComponent(other.did)}`
    const auth = await signAuth(identity.did, identity.secretKey, 'GET', path)
    const res = await makeRequest(server, 'GET', path, undefined, { Authorization: auth })
    expect(res.status).toBe(403)
    expect(res.body.error).toContain('DID mismatch')
  })

  it('rejects DELETE for a different DID than authenticated', async () => {
    const identity = await createTestIdentity()
    const other = await createTestIdentity()

    const path = `/api/user-data/${encodeURIComponent(other.did)}`
    const auth = await signAuth(identity.did, identity.secretKey, 'DELETE', path)
    const res = await makeRequest(server, 'DELETE', path, undefined, { Authorization: auth })
    expect(res.status).toBe(403)
  })

  it('migration import requires auth', async () => {
    const res = await makeRequest(server, 'POST', '/api/migration/import', {})
    expect(res.status).toBe(401)
  })

  it('migration export requires auth', async () => {
    const res = await makeRequest(server, 'POST', '/api/migration/export', {})
    expect(res.status).toBe(401)
  })

  it('migration import accepts valid auth', async () => {
    const { did, secretKey } = await createTestIdentity()
    const auth = await signAuth(did, secretKey, 'POST', '/api/migration/import')
    const res = await makeRequest(server, 'POST', '/api/migration/import', {}, { Authorization: auth })
    // Should get past auth (not 401) — will fail on body parsing
    expect(res.status).not.toBe(401)
  })

  it('export status does not require auth (read-only, ID-based)', async () => {
    const res = await makeRequest(server, 'GET', '/api/migration/export/00000000-0000-0000-0000-000000000000')
    expect(res.status).toBe(404)
  })

  it('upload with missing body fields returns 400', async () => {
    const { did, secretKey } = await createTestIdentity()
    const auth = await signAuth(did, secretKey, 'POST', '/api/user-data/upload')
    const res = await makeRequest(
      server,
      'POST',
      '/api/user-data/upload',
      { did },
      {
        Authorization: auth
      }
    )
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Missing required fields')
  })

  it('large blob handling with auth', async () => {
    const { did, secretKey } = await createTestIdentity()

    const largePlaintext = Buffer.alloc(1.5 * 1024 * 1024, 'A')
    const upload = {
      did,
      ciphertext: largePlaintext.toString('base64'),
      nonce: Buffer.from('nonce12345678').toString('base64'),
      metadata: {
        messageCount: 1,
        channelCount: 1,
        serverCount: 1,
        dateRange: null,
        uploadedAt: new Date().toISOString()
      }
    }

    const auth = await signAuth(did, secretKey, 'POST', '/api/user-data/upload')
    const res = await makeRequest(server, 'POST', '/api/user-data/upload', upload, { Authorization: auth })
    expect(res.status).toBe(200)
    expect(res.body.size).toBeGreaterThan(1024 * 1024)
  })
})
