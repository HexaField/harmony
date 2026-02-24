import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import { MigrationEndpoint } from '../src/migration-endpoint.js'
import { createLogger } from '../src/logger.js'

const logger = createLogger({ level: 'error', format: 'json', silent: true })

function makeRequest(
  server: Server,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const port = (server.address() as any).port
    const opts = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {}
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

  it('MUST return 400 for invalid JSON on export', async () => {
    const port = (server.address() as any).port
    const res = await new Promise<{ status: number; body: any }>((resolve, reject) => {
      const req = require('node:http').request(
        { hostname: '127.0.0.1', port, path: '/api/migration/export', method: 'POST' },
        (res: any) => {
          const chunks: Buffer[] = []
          res.on('data', (c: Buffer) => chunks.push(c))
          res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }))
        }
      )
      req.on('error', reject)
      req.write('not json')
      req.end()
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Invalid JSON')
  })

  it('MUST return 400 for missing fields on export', async () => {
    const res = await makeRequest(server, 'POST', '/api/migration/export', { botToken: 'x' })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Missing required fields')
  })

  it('MUST return 404 for unknown export ID', async () => {
    const res = await makeRequest(server, 'GET', '/api/migration/export/00000000-0000-0000-0000-000000000000')
    expect(res.status).toBe(404)
  })

  it('MUST return 400 for missing fields on import', async () => {
    const res = await makeRequest(server, 'POST', '/api/migration/import', { adminDID: 'did:key:z123' })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Missing required fields')
  })

  it('MUST return 503 for import when store is null', async () => {
    const res = await makeRequest(server, 'POST', '/api/migration/import', {
      bundle: { ciphertext: 'aa', nonce: 'bb', metadata: {} },
      adminDID: 'did:key:z123',
      communityName: 'Test'
    })
    expect(res.status).toBe(503)
  })

  it('MUST return 404 for unhandled paths', async () => {
    const res = await makeRequest(server, 'GET', '/api/migration/unknown')
    expect(res.status).toBe(404)
  })

  it('MUST return 202 with exportId for valid export request (will fail in background due to fake token)', async () => {
    const res = await makeRequest(server, 'POST', '/api/migration/export', {
      botToken: 'fake-token',
      guildId: '123',
      adminDID: 'did:key:z123'
    })
    expect(res.status).toBe(202)
    expect(res.body.exportId).toBeTruthy()
    expect(typeof res.body.exportId).toBe('string')
  })
})
