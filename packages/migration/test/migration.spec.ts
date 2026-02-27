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
            reactions: [{ emoji: '👍', users: ['user1'] }],
            stickers: [{ id: 'sticker1', name: 'pepe_happy', formatType: 1 }],
            attachments: [{ url: 'https://cdn.discord.com/attachments/ch1/img.png', filename: 'img.png' }],
            embeds: [
              {
                type: 'rich',
                url: 'https://example.com/article',
                title: 'Example Article',
                description: 'An article about something',
                thumbnail: { url: 'https://example.com/thumb.jpg' }
              }
            ]
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

    it('MUST preserve sticker data in migration', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const { quads } = migration.transformServerExport(createTestServerExport(), doc.id)
      const stickerQuads = quads.filter((q) => typeof q.predicate === 'string' && q.predicate.includes('sticker'))
      // Should have: sticker link, stickerName, stickerFormat
      expect(stickerQuads.length).toBeGreaterThanOrEqual(3)
      const stickerName = stickerQuads.find((q) => q.predicate.includes('stickerName'))
      expect(stickerName).toBeDefined()
      expect(stickerName!.object).toEqual({ value: 'pepe_happy' })
      const stickerFormat = stickerQuads.find((q) => q.predicate.includes('stickerFormat'))
      expect(stickerFormat).toBeDefined()
      expect(stickerFormat!.object).toEqual({ value: '1' })
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

    it('MUST preserve attachment data in migration', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const { quads } = migration.transformServerExport(createTestServerExport(), doc.id)
      const attachmentQuads = quads.filter((q) => typeof q.predicate === 'string' && q.predicate.includes('attachment'))
      expect(attachmentQuads.length).toBeGreaterThanOrEqual(1)
      const urlQuad = attachmentQuads.find((q) => q.predicate.includes('attachment') && !q.predicate.includes('Name'))
      expect(urlQuad).toBeDefined()
      expect((urlQuad!.object as { value: string }).value).toBe('https://cdn.discord.com/attachments/ch1/img.png')
    })

    it('MUST preserve embed data in migration', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const { quads } = migration.transformServerExport(createTestServerExport(), doc.id)
      const embedQuads = quads.filter((q) => typeof q.predicate === 'string' && q.predicate.includes('embed'))
      // Should have: embed link, type, embedUrl, embedTitle, embedDescription, embedThumbnail
      expect(embedQuads.length).toBeGreaterThanOrEqual(5)
      const titleQuad = embedQuads.find((q) => q.predicate.includes('embedTitle'))
      expect(titleQuad).toBeDefined()
      expect((titleQuad!.object as { value: string }).value).toBe('Example Article')
      const descQuad = embedQuads.find((q) => q.predicate.includes('embedDescription'))
      expect(descQuad).toBeDefined()
      expect((descQuad!.object as { value: string }).value).toBe('An article about something')
      const thumbQuad = embedQuads.find((q) => q.predicate.includes('embedThumbnail'))
      expect(thumbQuad).toBeDefined()
      expect((thumbQuad!.object as { value: string }).value).toBe('https://example.com/thumb.jpg')
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

  describe('Edge Cases', () => {
    it('MUST handle empty server export (no channels, roles, members, messages)', async () => {
      const emptyExport: DiscordServerExport = {
        server: { id: 'empty', name: 'Empty', ownerId: 'u1' },
        channels: [],
        roles: [],
        members: [],
        messages: new Map(),
        pins: new Map()
      }
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const { quads, pendingMemberMap } = migration.transformServerExport(emptyExport, doc.id)
      // Should still have community quad
      expect(quads.length).toBeGreaterThan(0)
      expect(quads.some((q) => q.object === HarmonyType.Community)).toBe(true)
      expect(pendingMemberMap.size).toBe(0)
    })

    it('MUST handle special characters in message content', async () => {
      const exp = createTestServerExport()
      // Modify a message to have special chars
      const msgs = exp.messages.get('ch1')!
      msgs[0].content = 'Hello <script>alert("xss")</script> "quotes" & ampersand'
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const { quads } = migration.transformServerExport(exp, doc.id)
      const contentQuads = quads.filter((q) => q.predicate === HarmonyPredicate.content)
      const found = contentQuads.find((q) => typeof q.object === 'object' && q.object.value.includes('<script>'))
      expect(found).toBeDefined()
    })

    it('MUST handle message without replyTo', async () => {
      const exp = createTestServerExport()
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const { quads } = migration.transformServerExport(exp, doc.id)
      // msg1 has no replyTo, only msg2 does
      const replyQuads = quads.filter((q) => q.predicate === HarmonyPredicate.replyTo)
      expect(replyQuads).toHaveLength(1)
    })

    it('MUST handle message without reactions', async () => {
      const exp: DiscordServerExport = {
        server: { id: 's1', name: 'Test', ownerId: 'u1' },
        channels: [{ id: 'ch1', name: 'general', type: 'text' }],
        roles: [],
        members: [{ userId: 'u1', username: 'Alice', roles: [], joinedAt: '2023-01-01T00:00:00Z' }],
        messages: new Map([
          [
            'ch1',
            [
              {
                id: 'msg1',
                channelId: 'ch1',
                author: { id: 'u1', username: 'Alice' },
                content: 'No reactions',
                timestamp: '2023-01-01T00:00:00Z'
              }
            ]
          ]
        ]),
        pins: new Map()
      }
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const { quads } = migration.transformServerExport(exp, doc.id)
      const reactionQuads = quads.filter((q) => q.object === HarmonyType.Reaction)
      expect(reactionQuads).toHaveLength(0)
    })

    it('MUST handle channel with categoryId', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const { quads } = migration.transformServerExport(createTestServerExport(), doc.id)
      const categoryQuads = quads.filter((q) => q.predicate === HarmonyPredicate.inCategory)
      expect(categoryQuads.length).toBeGreaterThan(0)
    })

    it('MUST handle personal export with missing optional fields', () => {
      const raw = {
        account: { id: 'u1', username: 'Test', discriminator: '0' }
      } as unknown as DiscordExport
      const parsed = migration.parsePersonalExport(raw)
      expect(parsed.messages).toEqual([])
      expect(parsed.servers).toEqual([])
      expect(parsed.connections).toEqual([])
    })

    it('MUST handle message with missing content (null/undefined)', () => {
      const raw: DiscordExport = {
        account: { id: 'u1', username: 'Test', discriminator: '0' },
        messages: [
          { id: 'm1', channelId: 'ch1', author: { id: 'u1', username: 'T' }, content: undefined as any, timestamp: '' }
        ],
        servers: [],
        connections: []
      }
      const parsed = migration.parsePersonalExport(raw)
      expect(parsed.messages[0].content).toBe('')
      expect(parsed.messages[0].timestamp).toBeTruthy()
    })

    it('encrypt/decrypt MUST round-trip with metadata intact', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const { quads } = migration.transformServerExport(createTestServerExport(), doc.id)
      const metadata = {
        exportDate: '2024-06-01T00:00:00Z',
        sourceServerId: 'server1',
        sourceServerName: 'Test Server',
        adminDID: doc.id,
        channelCount: 4,
        messageCount: 2,
        memberCount: 3
      }
      const bundle = await migration.encryptExport(quads, kp, metadata)
      expect(bundle.metadata).toEqual(metadata)
      const decrypted = await migration.decryptExport(bundle, kp)
      expect(decrypted.length).toBe(quads.length)
    })

    it('resignCommunityCredentials MUST include roles in reissued VCs', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const { quads } = migration.transformServerExport(createTestServerExport(), doc.id)
      const result = await migration.resignCommunityCredentials({
        quads,
        adminDID: doc.id,
        adminKeyPair: kp,
        newServiceEndpoint: 'https://new.example.com'
      })
      // Alice has role1
      const aliceVC = result.reissuedVCs.find((vc) => vc.credentialSubject.memberName === 'Alice')
      expect(aliceVC).toBeDefined()
      expect((aliceVC!.credentialSubject.roles as string[]).length).toBeGreaterThan(0)
    })
  })

  describe('Discord ID/Username Quads', () => {
    it('MUST include discordId predicate in exported member quads', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const { quads } = migration.transformServerExport(createTestServerExport(), doc.id)
      const discordIdQuads = quads.filter((q) => q.predicate === HarmonyPredicate.discordId)
      expect(discordIdQuads.length).toBe(3) // 3 members
      const user1Quad = discordIdQuads.find((q) => {
        const val = typeof q.object === 'string' ? q.object : q.object.value
        return val === 'user1'
      })
      expect(user1Quad).toBeDefined()
    })

    it('MUST include discordUsername predicate in exported member quads', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const { quads } = migration.transformServerExport(createTestServerExport(), doc.id)
      const discordUsernameQuads = quads.filter((q) => q.predicate === HarmonyPredicate.discordUsername)
      expect(discordUsernameQuads.length).toBe(3) // 3 members
      const aliceQuad = discordUsernameQuads.find((q) => {
        const val = typeof q.object === 'string' ? q.object : q.object.value
        return val === 'Alice'
      })
      expect(aliceQuad).toBeDefined()
    })

    it('MUST preserve Discord IDs after transform round-trip', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const { quads } = migration.transformServerExport(createTestServerExport(), doc.id)

      // Verify each member has both discordId and discordUsername
      const members = createTestServerExport().members
      for (const member of members) {
        const memberURI = `harmony:member:${member.userId}`
        const idQuad = quads.find((q) => q.subject === memberURI && q.predicate === HarmonyPredicate.discordId)
        const usernameQuad = quads.find(
          (q) => q.subject === memberURI && q.predicate === HarmonyPredicate.discordUsername
        )
        expect(idQuad).toBeDefined()
        expect(usernameQuad).toBeDefined()
        const idVal = typeof idQuad!.object === 'string' ? idQuad!.object : idQuad!.object.value
        const usernameVal = typeof usernameQuad!.object === 'string' ? usernameQuad!.object : usernameQuad!.object.value
        expect(idVal).toBe(member.userId)
        expect(usernameVal).toBe(member.username)
      }
    })
  })

  describe('GDPR Compliance', () => {
    it.todo('MUST allow member opt-out before migration')
    it.todo('MUST generate privacy notice template')
    it.todo('MUST export personal data in portable format (GDPR Article 20)')
  })
})
