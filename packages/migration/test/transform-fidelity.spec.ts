import { describe, it, expect } from 'vitest'
import { createCryptoProvider } from '@harmony/crypto'
import { HarmonyType, HarmonyPredicate, HARMONY, RDFPredicate } from '@harmony/vocab'
import { MigrationService, type DiscordServerExport } from '../src/index.js'

const crypto = createCryptoProvider()
const migration = new MigrationService(crypto)

function createExport(overrides?: Partial<DiscordServerExport>): DiscordServerExport {
  return {
    server: { id: 'srv1', name: 'Test', ownerId: 'u1' },
    channels: [
      { id: 'text1', name: 'general', type: 'text' },
      { id: 'voice1', name: 'Voice Chat', type: 'voice' },
      { id: 'cat1', name: 'Category', type: 'category' },
      { id: 'thread1', name: 'Thread', type: 'thread', parentMessageId: 'msg1' }
    ],
    roles: [
      { id: 'r1', name: 'Admin', permissions: ['MANAGE_CHANNELS'] },
      { id: 'r2', name: 'Member', permissions: ['SEND_MESSAGES'] }
    ],
    members: [
      { userId: 'u1', username: 'Alice', roles: ['r1'], joinedAt: '2023-01-01T00:00:00Z' },
      { userId: 'u2', username: 'Bob', roles: ['r2'], joinedAt: '2023-06-01T00:00:00Z' }
    ],
    messages: new Map([
      [
        'text1',
        [
          {
            id: 'msg1',
            channelId: 'text1',
            author: { id: 'u1', username: 'Alice' },
            content: 'Hello!',
            timestamp: '2023-01-15T10:00:00Z',
            reactions: [{ emoji: '👍', users: ['u2'] }],
            attachments: [{ url: 'https://cdn.example/file.png', filename: 'file.png' }]
          },
          {
            id: 'msg2',
            channelId: 'text1',
            author: { id: 'u2', username: 'Bob' },
            content: 'Hi!',
            timestamp: '2023-01-15T10:01:00Z'
          }
        ]
      ]
    ]),
    pins: new Map(),
    ...overrides
  }
}

describe('transformServerExport — data fidelity', () => {
  it('text channels get channelType "text" predicate', () => {
    const { quads } = migration.transformServerExport(createExport(), 'did:key:admin')
    const typeQuad = quads.find((q) => q.subject === 'harmony:channel:text1' && q.predicate === `${HARMONY}channelType`)
    expect(typeQuad).toBeDefined()
    expect(typeof typeQuad!.object === 'object' ? typeQuad!.object.value : typeQuad!.object).toBe('text')
  })

  it('voice channels get channelType "voice" predicate', () => {
    const { quads } = migration.transformServerExport(createExport(), 'did:key:admin')
    const typeQuad = quads.find(
      (q) => q.subject === 'harmony:channel:voice1' && q.predicate === `${HARMONY}channelType`
    )
    expect(typeQuad).toBeDefined()
    expect(typeof typeQuad!.object === 'object' ? typeQuad!.object.value : typeQuad!.object).toBe('voice')
  })

  it('voice channels are stored as HarmonyType.Channel (not separate type)', () => {
    const { quads } = migration.transformServerExport(createExport(), 'did:key:admin')
    const rdfTypeQuad = quads.find((q) => q.subject === 'harmony:channel:voice1' && q.predicate === RDFPredicate.type)
    expect(rdfTypeQuad).toBeDefined()
    expect(rdfTypeQuad!.object).toBe(HarmonyType.Channel)
  })

  it('categories stored as HarmonyType.Category', () => {
    const { quads } = migration.transformServerExport(createExport(), 'did:key:admin')
    const catType = quads.find((q) => q.subject === 'harmony:channel:cat1' && q.predicate === RDFPredicate.type)
    expect(catType).toBeDefined()
    expect(catType!.object).toBe(HarmonyType.Category)
  })

  it('categories get channelType "category" predicate', () => {
    const { quads } = migration.transformServerExport(createExport(), 'did:key:admin')
    const typeQuad = quads.find((q) => q.subject === 'harmony:channel:cat1' && q.predicate === `${HARMONY}channelType`)
    expect(typeQuad).toBeDefined()
    expect(typeof typeQuad!.object === 'object' ? typeQuad!.object.value : typeQuad!.object).toBe('category')
  })

  it('threads stored with parent reference', () => {
    const { quads } = migration.transformServerExport(createExport(), 'did:key:admin')
    const parentQuad = quads.find(
      (q) => q.subject === 'harmony:channel:thread1' && q.predicate === HarmonyPredicate.parentThread
    )
    expect(parentQuad).toBeDefined()
    expect(parentQuad!.object).toBe('harmony:message:msg1')
  })

  it('messages have correct channel graph', () => {
    const { quads } = migration.transformServerExport(createExport(), 'did:key:admin')
    const msgQuads = quads.filter((q) => q.subject === 'harmony:message:msg1' && q.predicate === RDFPredicate.type)
    expect(msgQuads.length).toBe(1)
    expect(msgQuads[0].graph).toBe('harmony:channel:text1')
  })

  it('messages have inChannel predicate', () => {
    const { quads } = migration.transformServerExport(createExport(), 'did:key:admin')
    const inChannel = quads.find(
      (q) => q.subject === 'harmony:message:msg1' && q.predicate === HarmonyPredicate.inChannel
    )
    expect(inChannel).toBeDefined()
    expect(inChannel!.object).toBe('harmony:channel:text1')
  })

  it('reactions preserved', () => {
    const { quads } = migration.transformServerExport(createExport(), 'did:key:admin')
    const reactionType = quads.find((q) => q.predicate === RDFPredicate.type && q.object === HarmonyType.Reaction)
    expect(reactionType).toBeDefined()
    const emojiQuad = quads.find((q) => q.subject === reactionType!.subject && q.predicate === HarmonyPredicate.emoji)
    expect(emojiQuad).toBeDefined()
    expect(typeof emojiQuad!.object === 'object' ? emojiQuad!.object.value : emojiQuad!.object).toBe('👍')
  })

  it('attachments preserved', () => {
    const { quads } = migration.transformServerExport(createExport(), 'did:key:admin')
    const attachQuad = quads.find((q) => q.subject === 'harmony:message:msg1' && q.predicate === `${HARMONY}attachment`)
    expect(attachQuad).toBeDefined()
    expect(typeof attachQuad!.object === 'object' ? attachQuad!.object.value : attachQuad!.object).toBe(
      'https://cdn.example/file.png'
    )
    const filenameQuad = quads.find(
      (q) => q.subject === 'harmony:message:msg1' && q.predicate === HarmonyPredicate.filename
    )
    expect(filenameQuad).toBeDefined()
    expect(typeof filenameQuad!.object === 'object' ? filenameQuad!.object.value : filenameQuad!.object).toBe(
      'file.png'
    )
  })

  it('member roles preserved', () => {
    const { quads } = migration.transformServerExport(createExport(), 'did:key:admin')
    const roleQuad = quads.find((q) => q.subject === 'harmony:member:u1' && q.predicate === HarmonyPredicate.role)
    expect(roleQuad).toBeDefined()
    expect(roleQuad!.object).toBe('harmony:role:r1')
  })

  it('user exclusion works', () => {
    const { quads } = migration.transformServerExport(createExport(), 'did:key:admin', {
      excludeUsers: ['u2']
    })
    const bobMember = quads.find((q) => q.subject === 'harmony:member:u2' && q.predicate === RDFPredicate.type)
    expect(bobMember).toBeUndefined()
    // Bob's messages also excluded
    const bobMsg = quads.find((q) => q.subject === 'harmony:message:msg2' && q.predicate === RDFPredicate.type)
    expect(bobMsg).toBeUndefined()
    // Bob's reactions also excluded
    const bobReaction = quads.find((q) => q.predicate === HarmonyPredicate.reactor && q.object === 'harmony:member:u2')
    expect(bobReaction).toBeUndefined()
  })

  it('all channels get channelType predicate', () => {
    const { quads } = migration.transformServerExport(createExport(), 'did:key:admin')
    const channelIds = ['text1', 'voice1', 'cat1', 'thread1']
    for (const id of channelIds) {
      const typeQuad = quads.find(
        (q) => q.subject === `harmony:channel:${id}` && q.predicate === `${HARMONY}channelType`
      )
      expect(typeQuad, `channelType missing for ${id}`).toBeDefined()
    }
  })
})
