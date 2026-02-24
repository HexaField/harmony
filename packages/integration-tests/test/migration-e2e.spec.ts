import { describe, it, expect } from 'vitest'
import { createCryptoProvider } from '@harmony/crypto'
import { IdentityManager } from '@harmony/identity'
import { MigrationService } from '@harmony/migration'
import { MemoryQuadStore } from '@harmony/quads'
import { MigrationEndpoint, createLogger } from '@harmony/server-runtime'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const crypto = createCryptoProvider()
const identityMgr = new IdentityManager(crypto)
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

describe('Migration E2E Flows', () => {
  describe('Full export → import flow', () => {
    it.skip('admin exports Discord server → imports to Harmony → community accessible (requires Discord bot token and running Discord API)', () => {
      // This test needs a real Discord bot token and a real Discord server.
      // The MigrationBot connects to Discord REST API to fetch channels, messages, etc.
    })

    it('transform Discord export → encrypt → decrypt → import into quad store', async () => {
      const migrationService = new MigrationService(crypto)
      const { identity: admin, keyPair: adminKP } = await identityMgr.create()

      const serverExport = {
        server: { id: 'srv1', name: 'My Discord', ownerId: 'owner1' },
        channels: [
          { id: 'ch1', name: 'general', type: 'text' as const },
          { id: 'ch2', name: 'announcements', type: 'text' as const }
        ],
        roles: [
          { id: 'r1', name: 'admin', permissions: ['ADMINISTRATOR'] },
          { id: 'r2', name: 'moderator', permissions: ['MANAGE_MESSAGES'] }
        ],
        members: [
          { userId: 'u1', username: 'Alice', roles: ['r1'], joinedAt: '2024-01-01T00:00:00Z' },
          { userId: 'u2', username: 'Bob', roles: ['r2'], joinedAt: '2024-02-01T00:00:00Z' },
          { userId: 'u3', username: 'Charlie', roles: [], joinedAt: '2024-03-01T00:00:00Z' }
        ],
        messages: new Map([
          [
            'ch1',
            [
              {
                id: 'msg1',
                channelId: 'ch1',
                author: { id: 'u1', username: 'Alice' },
                content: 'Welcome!',
                timestamp: '2024-01-01T12:00:00Z'
              },
              {
                id: 'msg2',
                channelId: 'ch1',
                author: { id: 'u2', username: 'Bob' },
                content: 'Thanks!',
                timestamp: '2024-01-01T12:01:00Z'
              }
            ]
          ]
        ]),
        pins: new Map<string, string[]>()
      }

      // Transform
      const { quads, pendingMemberMap } = migrationService.transformServerExport(serverExport, admin.did)
      expect(quads.length).toBeGreaterThan(0)
      expect(pendingMemberMap.size).toBe(3)

      // Encrypt
      const bundle = await migrationService.encryptExport(quads, adminKP)
      expect(bundle.ciphertext.length).toBeGreaterThan(0)
      expect(bundle.nonce.length).toBeGreaterThan(0)

      // Decrypt
      const decryptedQuads = await migrationService.decryptExport(bundle, adminKP)
      expect(decryptedQuads.length).toBe(quads.length)

      // Import into store
      const store = new MemoryQuadStore()
      await store.addAll(decryptedQuads)

      // Verify community
      const communityQuads = await store.match({
        predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
        object: 'https://harmony.example/vocab#Community'
      })
      expect(communityQuads.length).toBe(1)

      // Verify channels
      const channelQuads = await store.match({
        predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
        object: 'https://harmony.example/vocab#Channel'
      })
      expect(channelQuads.length).toBe(2)

      // Verify members
      const memberQuads = await store.match({
        predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
        object: 'https://harmony.example/vocab#Member'
      })
      expect(memberQuads.length).toBe(3)
    })
  })

  describe('Reconciliation flow', () => {
    it.skip('ghost member linked via Discord OAuth → DID replaces ghost → member has correct roles (requires OAuth flow)', () => {
      // Reconciliation requires a real Discord OAuth link to associate a Discord userId with a DID.
      // The MigrationService.reconcileMember() API exists but needs the OAuth credential.
    })

    it('pendingMemberMap maps Discord userIds to ghost DIDs', async () => {
      const migrationService = new MigrationService(crypto)
      const { identity: admin } = await identityMgr.create()

      const serverExport = {
        server: { id: 'srv1', name: 'Test', ownerId: 'owner1' },
        channels: [],
        roles: [{ id: 'r1', name: 'mod', permissions: ['MANAGE_MESSAGES'] }],
        members: [{ userId: 'discord-user-1', username: 'Alice', roles: ['r1'], joinedAt: '2024-01-01T00:00:00Z' }],
        messages: new Map(),
        pins: new Map<string, string[]>()
      }

      const { pendingMemberMap } = migrationService.transformServerExport(serverExport, admin.did)
      expect(pendingMemberMap.has('discord-user-1')).toBe(true)
      const ghostDid = pendingMemberMap.get('discord-user-1')!
      expect(ghostDid).toMatch(/^did:/)
    })
  })

  describe('Data claim flow', () => {
    it('create encrypted blob → upload → download → verify roundtrip', async () => {
      const mediaDir = mkdtempSync(join(tmpdir(), 'harmony-e2e-'))
      const endpoint = new MigrationEndpoint(logger, null, mediaDir)
      const server = createServer((req, res) => {
        void endpoint.handleRequest(req, res).then((handled) => {
          if (!handled) {
            res.writeHead(404)
            res.end()
          }
        })
      })
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

      try {
        const testDid = 'did:key:z6MkDataClaimTest'
        const originalData = { messages: ['hello', 'world'], count: 2 }
        const plaintext = Buffer.from(JSON.stringify(originalData))

        // Simulate client-side encryption (XOR with key for simplicity — real uses nacl)
        const keyPair = await crypto.generateSigningKeyPair()
        const nonce = Buffer.from(crypto.randomBytes(24))
        // For test: just use plaintext as "ciphertext" to verify roundtrip storage
        const ciphertext = plaintext

        const uploadRes = await makeRequest(server, 'POST', '/api/user-data/upload', {
          did: testDid,
          ciphertext: ciphertext.toString('base64'),
          nonce: nonce.toString('base64'),
          metadata: {
            messageCount: 2,
            channelCount: 1,
            serverCount: 1,
            dateRange: null,
            uploadedAt: new Date().toISOString()
          }
        })
        expect(uploadRes.status).toBe(200)

        // Download
        const getRes = await makeRequest(server, 'GET', `/api/user-data/${encodeURIComponent(testDid)}`)
        expect(getRes.status).toBe(200)

        // Decrypt (verify we get original data back)
        const downloadedCiphertext = Buffer.from(getRes.body.ciphertext, 'base64')
        const recovered = JSON.parse(downloadedCiphertext.toString())
        expect(recovered).toEqual(originalData)
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()))
        rmSync(mediaDir, { recursive: true, force: true })
      }
    })
  })

  describe('Auto-join flow', () => {
    it.skip('ghost member reconciled → client receives community.auto-joined event (requires full server with WebSocket event dispatch)', () => {
      // This needs a running HarmonyServer that emits community.auto-joined events
      // when a ghost member is reconciled via Discord linking.
    })
  })

  describe('Friend discovery flow', () => {
    it.skip('two users link Discord → discover each other via portal (requires Discord OAuth and portal service)', () => {
      // Friend discovery requires both users to have linked their Discord accounts
      // via the portal OAuth flow, which needs a running portal service.
    })
  })

  describe('MigrationEndpoint.extractImportData', () => {
    it('extracts community, channels, and members from quads', async () => {
      const migrationService = new MigrationService(crypto)
      const { identity: admin } = await identityMgr.create()
      const endpoint = new MigrationEndpoint(logger, null)

      const serverExport = {
        server: { id: 'srv1', name: 'Test', ownerId: 'o1' },
        channels: [
          { id: 'ch1', name: 'general', type: 'text' as const },
          { id: 'ch2', name: 'random', type: 'text' as const }
        ],
        roles: [],
        members: [{ userId: 'u1', username: 'Alice', roles: [], joinedAt: '2024-01-01T00:00:00Z' }],
        messages: new Map(),
        pins: new Map<string, string[]>()
      }

      const { quads } = migrationService.transformServerExport(serverExport, admin.did)
      const result = endpoint.extractImportData(quads)

      expect(result.communityId).toBeTruthy()
      expect(result.channels.length).toBe(2)
      expect(result.channels.map((c) => c.name)).toContain('general')
      expect(result.members.length).toBe(1)
    })
  })
})
