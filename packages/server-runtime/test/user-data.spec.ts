import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { MigrationEndpoint } from '../src/migration-endpoint.js'
import { createLogger } from '../src/logger.js'

const logger = createLogger({ level: 'error', format: 'json', silent: true })

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

describe('User Data Upload/Download Endpoints', () => {
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

  const testDid = 'did:key:z6MkTestUser123'
  const validUpload = {
    did: testDid,
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

  it('POST /api/user-data/upload stores encrypted blob', async () => {
    const res = await makeRequest(server, 'POST', '/api/user-data/upload', validUpload)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.size).toBeGreaterThan(0)
  })

  it('GET /api/user-data/:did retrieves stored blob', async () => {
    await makeRequest(server, 'POST', '/api/user-data/upload', validUpload)
    const res = await makeRequest(server, 'GET', `/api/user-data/${encodeURIComponent(testDid)}`)
    expect(res.status).toBe(200)
    expect(res.body.ciphertext).toBe(validUpload.ciphertext)
    expect(res.body.nonce).toBe(validUpload.nonce)
    expect(res.body.metadata).toBeTruthy()
    expect(res.body.metadata.messageCount).toBe(42)
  })

  it('GET /api/user-data/:did returns 404 for unknown DID', async () => {
    const res = await makeRequest(server, 'GET', `/api/user-data/${encodeURIComponent('did:key:zUnknown')}`)
    expect(res.status).toBe(404)
    expect(res.body.error).toContain('No data found')
  })

  it('DELETE /api/user-data/:did removes stored data', async () => {
    await makeRequest(server, 'POST', '/api/user-data/upload', validUpload)
    const res = await makeRequest(server, 'DELETE', `/api/user-data/${encodeURIComponent(testDid)}`, undefined, {
      'x-harmony-did': testDid
    })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    // Verify it's gone
    const getRes = await makeRequest(server, 'GET', `/api/user-data/${encodeURIComponent(testDid)}`)
    expect(getRes.status).toBe(404)
  })

  it('DELETE /api/user-data/:did returns 404 for unknown DID', async () => {
    const res = await makeRequest(
      server,
      'DELETE',
      `/api/user-data/${encodeURIComponent('did:key:zUnknown')}`,
      undefined,
      { 'x-harmony-did': 'did:key:zUnknown' }
    )
    expect(res.status).toBe(404)
  })

  it('DELETE /api/user-data/:did returns 403 without matching auth', async () => {
    await makeRequest(server, 'POST', '/api/user-data/upload', validUpload)
    const res = await makeRequest(server, 'DELETE', `/api/user-data/${encodeURIComponent(testDid)}`, undefined, {
      'x-harmony-did': 'did:key:zWrongUser'
    })
    expect(res.status).toBe(403)
  })

  it('Upload with missing body returns 400', async () => {
    const res = await makeRequest(server, 'POST', '/api/user-data/upload', { did: testDid })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Missing required fields')
  })

  it('Upload with invalid JSON returns 400', async () => {
    const port = (server.address() as any).port
    const res = await new Promise<{ status: number; body: any }>((resolve, reject) => {
      const req = require('node:http').request(
        { hostname: '127.0.0.1', port, path: '/api/user-data/upload', method: 'POST' },
        (res: any) => {
          const chunks: Buffer[] = []
          res.on('data', (c: Buffer) => chunks.push(c))
          res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }))
        }
      )
      req.on('error', reject)
      req.write('not-json')
      req.end()
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Invalid JSON')
  })

  it('Stored data is opaque — server returns exact ciphertext without modification', async () => {
    const originalCiphertext = Buffer.from('this-is-opaque-encrypted-data-server-cannot-read').toString('base64')
    const upload = {
      ...validUpload,
      ciphertext: originalCiphertext
    }
    await makeRequest(server, 'POST', '/api/user-data/upload', upload)
    const res = await makeRequest(server, 'GET', `/api/user-data/${encodeURIComponent(testDid)}`)
    expect(res.status).toBe(200)
    // Server stores and returns the exact same ciphertext — it never decrypts
    expect(res.body.ciphertext).toBe(originalCiphertext)
  })

  it('Large blob handling (>1MB data)', async () => {
    const largePlaintext = Buffer.alloc(1.5 * 1024 * 1024, 'A')
    const upload = {
      ...validUpload,
      ciphertext: largePlaintext.toString('base64')
    }
    const uploadRes = await makeRequest(server, 'POST', '/api/user-data/upload', upload)
    expect(uploadRes.status).toBe(200)
    expect(uploadRes.body.size).toBeGreaterThan(1024 * 1024)

    const getRes = await makeRequest(server, 'GET', `/api/user-data/${encodeURIComponent(testDid)}`)
    expect(getRes.status).toBe(200)
    expect(getRes.body.ciphertext).toBe(upload.ciphertext)
  })
})
