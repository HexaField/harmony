import { describe, it, expect } from 'vitest'
import { createCryptoProvider } from '@harmony/crypto'
import { IdentityManager } from '@harmony/identity'
import { MigrationService } from '@harmony/migration'
import { MemoryQuadStore } from '@harmony/quads'

const crypto = createCryptoProvider()
const identityMgr = new IdentityManager(crypto)

describe('Migration E2E Flows', () => {
  describe('Full export → import flow', () => {
    it.skip('admin exports Discord server → imports to Harmony → community accessible (requires Discord bot token and running Discord API)', () => {
      // This test needs a real Discord bot token and a real Discord server.
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
      const bundle = await migrationService.encryptExport(quads, adminKP, {
        exportDate: new Date().toISOString(),
        sourceServerId: 'test',
        sourceServerName: 'test',
        adminDID: 'did:test:1',
        channelCount: 0,
        messageCount: 0,
        memberCount: 0
      })
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

      // Verify messages
      const messageQuads = await store.match({
        predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
        object: 'https://harmony.example/vocab#Message'
      })
      expect(messageQuads.length).toBe(2)
    })
  })

  describe('Reconciliation flow', () => {
    it.skip('ghost member linked via Discord OAuth → DID replaces ghost → member has correct roles (requires OAuth flow)', () => {
      // Reconciliation requires a real Discord OAuth link to associate a Discord userId with a DID.
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
      expect(ghostDid).toBeTruthy()
    })

    it('multiple ghost members get unique DIDs', async () => {
      const migrationService = new MigrationService(crypto)
      const { identity: admin } = await identityMgr.create()

      const serverExport = {
        server: { id: 'srv1', name: 'Test', ownerId: 'owner1' },
        channels: [],
        roles: [],
        members: [
          { userId: 'u1', username: 'Alice', roles: [], joinedAt: '2024-01-01T00:00:00Z' },
          { userId: 'u2', username: 'Bob', roles: [], joinedAt: '2024-02-01T00:00:00Z' }
        ],
        messages: new Map(),
        pins: new Map<string, string[]>()
      }

      const { pendingMemberMap } = migrationService.transformServerExport(serverExport, admin.did)
      const did1 = pendingMemberMap.get('u1')!
      const did2 = pendingMemberMap.get('u2')!
      expect(did1).not.toBe(did2)
    })
  })

  describe('Data claim flow', () => {
    it('encrypt → decrypt roundtrip preserves original data', async () => {
      const migrationService = new MigrationService(crypto)
      const { keyPair } = await identityMgr.create()

      const originalData = {
        messages: [
          { content: 'Hello world', timestamp: '2024-01-01T12:00:00Z' },
          { content: 'Goodbye', timestamp: '2024-06-01T12:00:00Z' }
        ],
        count: 2
      }

      // Simulate encrypting user data as quads
      const quads = [
        {
          subject: 'urn:test:data',
          predicate: 'urn:test:content',
          object: JSON.stringify(originalData),
          graph: ''
        }
      ]

      const bundle = await migrationService.encryptExport(quads, keyPair, {
        exportDate: new Date().toISOString(),
        sourceServerId: 'test',
        sourceServerName: 'test',
        adminDID: 'did:test:1',
        channelCount: 0,
        messageCount: 0,
        memberCount: 0
      })
      expect(bundle.ciphertext.length).toBeGreaterThan(0)

      const decrypted = await migrationService.decryptExport(bundle, keyPair)
      expect(decrypted.length).toBe(1)
      const recovered = JSON.parse(
        typeof decrypted[0].object === 'string' ? decrypted[0].object : (decrypted[0].object as any).value
      )
      expect(recovered).toEqual(originalData)
    })

    it('wrong key cannot decrypt', async () => {
      const migrationService = new MigrationService(crypto)
      const { keyPair: kp1 } = await identityMgr.create()
      const { keyPair: kp2 } = await identityMgr.create()

      const quads = [
        {
          subject: 'urn:test:secret',
          predicate: 'urn:test:data',
          object: 'sensitive',
          graph: ''
        }
      ]

      const bundle = await migrationService.encryptExport(quads, kp1, {
        exportDate: new Date().toISOString(),
        sourceServerId: 'test',
        sourceServerName: 'test',
        adminDID: 'did:test:1',
        channelCount: 0,
        messageCount: 0,
        memberCount: 0
      })
      await expect(migrationService.decryptExport(bundle, kp2)).rejects.toThrow()
    })
  })

  describe('Auto-join flow', () => {
    it.skip('ghost member reconciled → client receives community.auto-joined event (requires full server with WebSocket event dispatch)', () => {
      // This needs a running HarmonyServer that emits community.auto-joined events
      // when a ghost member is reconciled via Discord linking.
    })

    it('transformed export contains member data that enables auto-join on reconciliation', async () => {
      const migrationService = new MigrationService(crypto)
      const { identity: admin } = await identityMgr.create()

      const serverExport = {
        server: { id: 'srv1', name: 'Auto-Join Test', ownerId: 'owner1' },
        channels: [{ id: 'ch1', name: 'general', type: 'text' as const }],
        roles: [],
        members: [{ userId: 'u1', username: 'Ghost', roles: [], joinedAt: '2024-01-01T00:00:00Z' }],
        messages: new Map(),
        pins: new Map<string, string[]>()
      }

      const { quads, pendingMemberMap } = migrationService.transformServerExport(serverExport, admin.did)

      // Ghost member exists in quads
      const store = new MemoryQuadStore()
      await store.addAll(quads)
      const memberQuads = await store.match({
        predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
        object: 'https://harmony.example/vocab#Member'
      })
      expect(memberQuads.length).toBe(1)

      // Ghost DID is tracked for future reconciliation
      expect(pendingMemberMap.get('u1')).toBeTruthy()
    })
  })

  describe('Friend discovery flow', () => {
    it.skip('two users link Discord → discover each other via portal (requires Discord OAuth and portal service)', () => {
      // Friend discovery requires both users to have linked their Discord accounts
      // via the portal OAuth flow, which needs a running portal service.
    })
  })
})
