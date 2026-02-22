import { describe, it, expect } from 'vitest'
import { createCryptoProvider } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import { HarmonyType, HarmonyPredicate } from '@harmony/vocab'
import { MigrationService, type DiscordServerExport, type DiscordExport } from '../src/index.js'

const crypto = createCryptoProvider()
const didProvider = new DIDKeyProvider(crypto)
const migration = new MigrationService(crypto)

function createTestServerExport(): DiscordServerExport {
  return {
    server: { id: 'server1', name: 'Test Server', ownerId: 'user1' },
    channels: [
      { id: 'ch1', name: 'general', type: 'text' },
      { id: 'ch2', name: 'random', type: 'text', categoryId: 'cat1' },
      { id: 'cat1', name: 'Text Channels', type: 'category' },
      { id: 'thread1', name: 'Discussion', type: 'thread', parentMessageId: 'msg1' }
    ],
    roles: [
      { id: 'role1', name: 'Admin', permissions: ['MANAGE_CHANNELS', 'BAN_MEMBERS'] },
      { id: 'role2', name: 'Member', permissions: ['SEND_MESSAGES'] }
    ],
    members: [
      { userId: 'user1', username: 'Alice', roles: ['role1'], joinedAt: '2023-01-01T00:00:00Z' },
      { userId: 'user2', username: 'Bob', roles: ['role2'], joinedAt: '2023-06-01T00:00:00Z' },
      { userId: 'user3', username: 'Charlie', roles: ['role2'], joinedAt: '2023-07-01T00:00:00Z' }
    ],
    messages: new Map([
      [
        'ch1',
        [
          {
            id: 'msg1',
            channelId: 'ch1',
            author: { id: 'user1', username: 'Alice' },
            content: 'Hello!',
            timestamp: '2023-01-15T10:00:00Z'
          },
          {
            id: 'msg2',
            channelId: 'ch1',
            author: { id: 'user2', username: 'Bob' },
            content: 'Hi there!',
            timestamp: '2023-01-15T10:01:00Z',
            replyTo: 'msg1',
            reactions: [{ emoji: '👍', users: ['user1'] }]
          }
        ]
      ]
    ]),
    pins: new Map([['ch1', ['msg1']]])
  }
}

describe('@harmony/migration', () => {
  describe('Server Export Parsing', () => {
    it('MUST parse channel structure', () => {
      const exp = createTestServerExport()
      const parsed = migration.parseServerExport(exp)
      expect(parsed.channels).toHaveLength(4)
      expect(parsed.channels.find((c) => c.type === 'category')).toBeDefined()
      expect(parsed.channels.find((c) => c.type === 'thread')).toBeDefined()
    })

    it('MUST parse roles with permissions', () => {
      const parsed = migration.parseServerExport(createTestServerExport())
      expect(parsed.roles).toHaveLength(2)
      expect(parsed.roles[0].permissions).toContain('MANAGE_CHANNELS')
    })

    it('MUST parse members with roles', () => {
      const parsed = migration.parseServerExport(createTestServerExport())
      expect(parsed.members).toHaveLength(3)
      expect(parsed.members[0].roles).toContain('role1')
    })
  })

  describe('RDF Transformation', () => {
    it('MUST produce valid RDF quads', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const { quads } = migration.transformServerExport(createTestServerExport(), doc.id)
      expect(quads.length).toBeGreaterThan(0)
    })

    it('MUST map channels to correct types', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const { quads } = migration.transformServerExport(createTestServerExport(), doc.id)
      const channelTypes = quads.filter(
        (q) => q.predicate === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' && q.object === HarmonyType.Channel
      )
      expect(channelTypes.length).toBeGreaterThan(0)
    })

    it('MUST map messages with author and timestamp', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const { quads } = migration.transformServerExport(createTestServerExport(), doc.id)
      const msgQuads = quads.filter((q) => q.predicate === HarmonyPredicate.content)
      expect(msgQuads.length).toBeGreaterThan(0)
    })

    it('MUST preserve reply chains', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const { quads } = migration.transformServerExport(createTestServerExport(), doc.id)
      const replies = quads.filter((q) => q.predicate === HarmonyPredicate.replyTo)
      expect(replies).toHaveLength(1)
    })

    it('MUST preserve thread structure', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const { quads } = migration.transformServerExport(createTestServerExport(), doc.id)
      const threads = quads.filter((q) => q.object === HarmonyType.Thread)
      expect(threads).toHaveLength(1)
    })

    it('MUST handle opt-out (excluded users)', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const { quads } = migration.transformServerExport(createTestServerExport(), doc.id, { excludeUsers: ['user2'] })
      const user2Refs = quads.filter(
        (q) => (typeof q.object === 'string' && q.object.includes('user2')) || q.subject.includes('user2')
      )
      expect(user2Refs).toHaveLength(0)
    })

    it('MUST produce pending member map', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const { pendingMemberMap } = migration.transformServerExport(createTestServerExport(), doc.id)
      expect(pendingMemberMap.size).toBe(3)
      expect(pendingMemberMap.get('user1')).toContain('harmony:member:user1')
    })

    it('MUST handle reactions', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const { quads } = migration.transformServerExport(createTestServerExport(), doc.id)
      const reactions = quads.filter((q) => q.object === HarmonyType.Reaction)
      expect(reactions.length).toBeGreaterThan(0)
    })
  })

  describe('Encryption', () => {
    it('MUST encrypt and decrypt export', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const { quads } = migration.transformServerExport(createTestServerExport(), doc.id)
      const bundle = await migration.encryptExport(quads, kp, {
        exportDate: new Date().toISOString(),
        sourceServerId: 'server1',
        sourceServerName: 'Test',
        adminDID: doc.id,
        channelCount: 2,
        messageCount: 2,
        memberCount: 3
      })
      const decrypted = await migration.decryptExport(bundle, kp)
      expect(decrypted.length).toBe(quads.length)
    })

    it('MUST fail decryption with wrong keypair', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const wrongKp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const { quads } = migration.transformServerExport(createTestServerExport(), doc.id)
      const bundle = await migration.encryptExport(quads, kp, {
        exportDate: new Date().toISOString(),
        sourceServerId: 'server1',
        sourceServerName: 'Test',
        adminDID: doc.id,
        channelCount: 2,
        messageCount: 2,
        memberCount: 3
      })
      await expect(migration.decryptExport(bundle, wrongKp)).rejects.toThrow()
    })

    it('MUST preserve metadata in plaintext', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const { quads } = migration.transformServerExport(createTestServerExport(), doc.id)
      const bundle = await migration.encryptExport(quads, kp, {
        exportDate: '2024-01-01T00:00:00Z',
        sourceServerId: 'server1',
        sourceServerName: 'Test',
        adminDID: doc.id,
        channelCount: 2,
        messageCount: 2,
        memberCount: 3
      })
      expect(bundle.metadata.sourceServerName).toBe('Test')
      expect(bundle.metadata.memberCount).toBe(3)
    })
  })

  describe('Re-signing', () => {
    it('MUST re-issue root ZCAP for new instance', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const { quads } = migration.transformServerExport(createTestServerExport(), doc.id)
      const result = await migration.resignCommunityCredentials({
        quads,
        adminDID: doc.id,
        adminKeyPair: kp,
        newServiceEndpoint: 'https://new.example.com'
      })
      expect(result.reissuedRootCapability).toBeDefined()
      expect(result.reissuedRootCapability.invoker).toBe(doc.id)
    })

    it('MUST re-issue membership VCs for all members', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const { quads } = migration.transformServerExport(createTestServerExport(), doc.id)
      const result = await migration.resignCommunityCredentials({
        quads,
        adminDID: doc.id,
        adminKeyPair: kp,
        newServiceEndpoint: 'https://new.example.com'
      })
      // 3 members in test export
      expect(result.reissuedVCs).toHaveLength(3)
      expect(result.reissuedVCs[0].type).toContain('CommunityMembershipCredential')
      expect(result.reissuedVCs[0].issuer).toBe(doc.id)
      expect(result.reissuedVCs[0].credentialSubject.serviceEndpoint).toBe('https://new.example.com')
    })

    it('MUST include community and member info in reissued VCs', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const { quads } = migration.transformServerExport(createTestServerExport(), doc.id)
      const result = await migration.resignCommunityCredentials({
        quads,
        adminDID: doc.id,
        adminKeyPair: kp,
        newServiceEndpoint: 'https://new.example.com'
      })
      const vc = result.reissuedVCs[0]
      expect(vc.credentialSubject.communityId).toContain('harmony:community:server1')
      expect(vc.credentialSubject.memberName).toBeDefined()
      expect(vc.credentialSubject.joinedAt).toBeDefined()
    })
  })

  describe('Personal Export Parsing', () => {
    it('MUST transform personal export to quads', () => {
      const personalExport: DiscordExport = {
        account: { id: 'user1', username: 'Alice', discriminator: '0001' },
        messages: [
          {
            id: 'dm1',
            channelId: 'dm-ch1',
            author: { id: 'user1', username: 'Alice' },
            content: 'Hello DM',
            timestamp: '2023-01-01T00:00:00Z'
          }
        ],
        servers: [{ id: 's1', name: 'Server 1' }],
        connections: [{ type: 'github', id: 'gh123', name: 'alice-gh' }]
      }
      const quads = migration.transformPersonalExport(personalExport, 'did:key:zTest')
      expect(quads.length).toBeGreaterThan(0)
      const msgs = quads.filter((q) => q.predicate === HarmonyPredicate.content)
      expect(msgs).toHaveLength(1)
    })

    it('MUST validate required fields in parsePersonalExport', () => {
      expect(() => migration.parsePersonalExport({} as any)).toThrow('Missing account')
      expect(() => migration.parsePersonalExport({ account: {} } as any)).toThrow('Missing or invalid account.id')
      expect(() => migration.parsePersonalExport({ account: { id: '1' } } as any)).toThrow(
        'Missing or invalid account.username'
      )
    })

    it('MUST normalize fields in parsePersonalExport', () => {
      const raw: DiscordExport = {
        account: { id: 'u1', username: '  Bob  ', discriminator: '' },
        messages: [],
        servers: [],
        connections: []
      }
      const parsed = migration.parsePersonalExport(raw)
      expect(parsed.account.username).toBe('Bob')
      expect(parsed.account.discriminator).toBe('0')
      expect(parsed.messages).toEqual([])
      expect(parsed.servers).toEqual([])
    })
  })
})
