import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest'
import { createCryptoProvider } from '@harmony/crypto'
import { createPortalDB } from '../src/db.js'
import { createApp } from '../src/server.js'
import { PortalService } from '../src/index.js'
import type { Server } from 'http'

const crypto = createCryptoProvider()

function testDB() {
  return createPortalDB(':memory:')
}

function authFetch(url: string, init?: RequestInit, did?: string): Promise<Response> {
  const headers = new Headers(init?.headers)
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${did ?? 'did:key:zTestBugAuth'}.fakesig`)
  }
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(url, { ...init, headers })
}

function validReport() {
  return {
    title: 'Something is broken',
    description: 'When I click the button, nothing happens at all',
    steps: '1. Open app\n2. Click button',
    severity: 'medium' as const,
    environment: {
      appVersion: '0.1.0',
      os: 'macOS 15',
      platform: 'Chrome 120',
      screenSize: '1920x1080',
      connectionState: 'connected'
    },
    consoleLogs: ['Error: failed to fetch']
  }
}

describe('POST /api/bugs', () => {
  let server: Server
  let baseUrl: string
  let db: ReturnType<typeof testDB>

  beforeAll(async () => {
    db = testDB()
    const portal = new PortalService(crypto, db)
    const app = await createApp(portal, db)
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address()
        const port = typeof addr === 'object' && addr ? addr.port : 0
        baseUrl = `http://127.0.0.1:${port}`
        resolve()
      })
    })
  })

  afterAll(() => {
    server?.close()
    db?.close()
  })

  beforeEach(() => {
    // Clear bug_reports between tests
    db.exec('DELETE FROM bug_reports')
    vi.restoreAllMocks()
  })

  it('should submit a bug report successfully (mock GitHub)', async () => {
    const originalFetch = globalThis.fetch
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes('api.github.com')) {
        return new Response(
          JSON.stringify({ number: 42, html_url: 'https://github.com/HexaField/harmony/issues/42' }),
          {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      }
      return originalFetch(input, init)
    })

    // Set GITHUB_TOKEN for this test
    const oldToken = process.env.GITHUB_TOKEN
    process.env.GITHUB_TOKEN = 'test-token'

    try {
      const res = await authFetch(`${baseUrl}/api/bugs`, {
        method: 'POST',
        body: JSON.stringify(validReport())
      })
      expect(res.status).toBe(201)
      const data = await res.json()
      expect(data.issueNumber).toBe(42)
      expect(data.issueUrl).toBe('https://github.com/HexaField/harmony/issues/42')
    } finally {
      if (oldToken === undefined) delete process.env.GITHUB_TOKEN
      else process.env.GITHUB_TOKEN = oldToken
    }

    // Verify DID is hashed in DB
    const row = db.prepare('SELECT reporter_did_hash FROM bug_reports').get() as { reporter_did_hash: string }
    expect(row.reporter_did_hash).not.toContain('did:key')
    expect(row.reporter_did_hash).toHaveLength(64) // SHA-256 hex
  })

  it('should rate limit after 5 reports per hour', async () => {
    // No GITHUB_TOKEN → graceful degradation, no GitHub calls
    delete process.env.GITHUB_TOKEN

    const did = 'did:key:zRateLimitTest'
    for (let i = 0; i < 5; i++) {
      const res = await authFetch(
        `${baseUrl}/api/bugs`,
        {
          method: 'POST',
          body: JSON.stringify(validReport())
        },
        did
      )
      expect(res.status).toBe(201)
    }

    // 6th should be rejected
    const res = await authFetch(
      `${baseUrl}/api/bugs`,
      {
        method: 'POST',
        body: JSON.stringify(validReport())
      },
      did
    )
    expect(res.status).toBe(429)
    const data = await res.json()
    expect(data.error).toContain('Rate limit')
  })

  it('should reject invalid title (too short)', async () => {
    const report = validReport()
    report.title = 'Hi'
    const res = await authFetch(`${baseUrl}/api/bugs`, {
      method: 'POST',
      body: JSON.stringify(report)
    })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('title')
  })

  it('should reject missing description', async () => {
    const res = await authFetch(`${baseUrl}/api/bugs`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Valid title here', severity: 'low', environment: {} })
    })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('description')
  })

  it('should reject invalid severity', async () => {
    const report = { ...validReport(), severity: 'urgent' }
    const res = await authFetch(`${baseUrl}/api/bugs`, {
      method: 'POST',
      body: JSON.stringify(report)
    })
    expect(res.status).toBe(400)
  })

  it('should gracefully degrade when GITHUB_TOKEN not set', async () => {
    delete process.env.GITHUB_TOKEN
    const res = await authFetch(`${baseUrl}/api/bugs`, {
      method: 'POST',
      body: JSON.stringify(validReport())
    })
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.stored).toBe(true)
    expect(data.issueUrl).toBeNull()
  })
})
