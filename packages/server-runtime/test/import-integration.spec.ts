import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import { MemoryQuadStore } from '@harmony/quads'
import { createCryptoProvider } from '@harmony/crypto'
import type { KeyPair } from '@harmony/crypto'
import { MigrationService } from '@harmony/migration'
import type { EncryptedExportBundle } from '@harmony/migration'
import { HarmonyServer } from '@harmony/server'
import { DIDKeyProvider } from '@harmony/did'
import { MemoryRevocationStore } from '@harmony/vc'
import { MigrationEndpoint } from '../src/migration-endpoint.js'
import { createLogger } from '../src/logger.js'
import { HarmonyType, HarmonyPredicate, RDFPredicate, XSDDatatype } from '@harmony/vocab'
import type { Quad } from '@harmony/quads'

const logger = createLogger({ level: 'error', format: 'json', silent: true })
const crypto = createCryptoProvider()

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

describe('Import integration: export → import → community accessible', () => {
  let httpServer: Server
  let endpoint: MigrationEndpoint
  let store: MemoryQuadStore
  let harmonyServer: HarmonyServer
  let adminKeyPair: KeyPair
  let bundle: EncryptedExportBundle

  const communityId = 'harmony:community:discord123'

  beforeAll(async () => {
    // Build quads simulating a Discord export
    const quads: Quad[] = [
      { subject: communityId, predicate: RDFPredicate.type, object: HarmonyType.Community, graph: communityId },
      { subject: communityId, predicate: HarmonyPredicate.name, object: { value: 'Test Discord' }, graph: communityId },
      { subject: 'harmony:channel:ch1', predicate: RDFPredicate.type, object: HarmonyType.Channel, graph: communityId },
      {
        subject: 'harmony:channel:ch1',
        predicate: HarmonyPredicate.name,
        object: { value: 'general' },
        graph: communityId
      },
      { subject: 'harmony:member:u1', predicate: RDFPredicate.type, object: HarmonyType.Member, graph: communityId },
      { subject: 'harmony:member:u1', predicate: HarmonyPredicate.name, object: { value: 'Alice' }, graph: communityId }
    ]

    // Encrypt
    adminKeyPair = await crypto.generateSigningKeyPair()
    const migration = new MigrationService(crypto)
    bundle = await migration.encryptExport(quads, adminKeyPair, {
      exportDate: new Date().toISOString(),
      sourceServerId: 'discord123',
      sourceServerName: 'Test Discord',
      adminDID: 'did:key:test',
      channelCount: 1,
      messageCount: 0,
      memberCount: 1
    })

    // Create store and HarmonyServer
    store = new MemoryQuadStore()
    const didProvider = new DIDKeyProvider(crypto)
    harmonyServer = new HarmonyServer({
      port: 0, // won't actually start WS for this test
      store,
      didResolver: async (did: string) => didProvider.resolve(did),
      revocationStore: new MemoryRevocationStore(),
      cryptoProvider: crypto
    })

    // Use store as a duck-typed SQLiteQuadStore (MemoryQuadStore has the same interface)
    endpoint = new MigrationEndpoint(logger, store as any)
    endpoint.setHarmonyServer(harmonyServer)

    httpServer = createServer((req, res) => {
      void endpoint.handleRequest(req, res).then((handled) => {
        if (!handled) {
          res.writeHead(404)
          res.end()
        }
      })
    })

    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()))
  })

  it('import returns ImportResult with communityId, channels, members', async () => {
    const result = await makeRequest(httpServer, 'POST', '/api/migration/import', {
      bundle: {
        ciphertext: Buffer.from(bundle.ciphertext).toString('base64'),
        nonce: Buffer.from(bundle.nonce).toString('base64'),
        metadata: bundle.metadata
      },
      adminDID: 'did:key:test',
      communityName: 'Test Discord',
      adminKeyPair: {
        publicKey: Buffer.from(adminKeyPair.publicKey).toString('base64'),
        secretKey: Buffer.from(adminKeyPair.secretKey).toString('base64')
      }
    })

    expect(result.status).toBe(200)
    expect(result.body.communityId).toBe(communityId)
    expect(result.body.channels).toHaveLength(1)
    expect(result.body.channels[0].name).toBe('general')
    expect(result.body.members).toHaveLength(1)
    expect(result.body.members[0].displayName).toBe('Alice')
  })

  it('community is registered with HarmonyServer after import', async () => {
    // The community should be in the server's communities list
    expect(harmonyServer.communities()).toContain(communityId)
  })

  it('quads are stored and queryable', async () => {
    const communityQuads = await store.match({
      subject: communityId,
      predicate: RDFPredicate.type,
      object: HarmonyType.Community
    })
    expect(communityQuads.length).toBeGreaterThan(0)
  })
})
