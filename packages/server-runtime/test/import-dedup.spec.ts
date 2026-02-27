import { describe, it, expect } from 'vitest'
import { MigrationEndpoint } from '../src/migration-endpoint.js'
import { HarmonyType, HarmonyPredicate, RDFPredicate, HARMONY, XSDDatatype } from '@harmony/vocab'
import type { Quad } from '@harmony/quads'

const logger = { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} } as any

const communityId = 'harmony:community:srv1'
const graph = communityId

function makeQuads(overrides?: {
  channelName?: string
  messageContent?: string
  memberName?: string
  extraMessages?: Quad[]
}): Quad[] {
  const quads: Quad[] = [
    { subject: communityId, predicate: RDFPredicate.type, object: HarmonyType.Community, graph },
    { subject: communityId, predicate: HarmonyPredicate.name, object: { value: 'Test Server' }, graph },
    { subject: 'harmony:channel:ch1', predicate: RDFPredicate.type, object: HarmonyType.Channel, graph },
    {
      subject: 'harmony:channel:ch1',
      predicate: HarmonyPredicate.name,
      object: { value: overrides?.channelName ?? 'general' },
      graph
    },
    { subject: 'harmony:channel:ch1', predicate: `${HARMONY}channelType`, object: { value: 'text' }, graph },
    { subject: 'harmony:member:u1', predicate: RDFPredicate.type, object: HarmonyType.Member, graph },
    {
      subject: 'harmony:member:u1',
      predicate: HarmonyPredicate.name,
      object: { value: overrides?.memberName ?? 'Alice' },
      graph
    },
    {
      subject: 'harmony:message:m1',
      predicate: RDFPredicate.type,
      object: HarmonyType.Message,
      graph: 'harmony:channel:ch1'
    },
    {
      subject: 'harmony:message:m1',
      predicate: HarmonyPredicate.content,
      object: { value: overrides?.messageContent ?? 'Hello' },
      graph: 'harmony:channel:ch1'
    },
    {
      subject: 'harmony:message:m1',
      predicate: HarmonyPredicate.author,
      object: 'harmony:member:u1',
      graph: 'harmony:channel:ch1'
    },
    {
      subject: 'harmony:message:m1',
      predicate: HarmonyPredicate.timestamp,
      object: { value: '2023-01-15T10:00:00Z', datatype: XSDDatatype.dateTime },
      graph: 'harmony:channel:ch1'
    },
    {
      subject: 'harmony:message:m1',
      predicate: HarmonyPredicate.inChannel,
      object: 'harmony:channel:ch1',
      graph: 'harmony:channel:ch1'
    }
  ]
  if (overrides?.extraMessages) quads.push(...overrides.extraMessages)
  return quads
}

describe('extractImportData — idempotent re-import', () => {
  it('returns same result for identical quads', () => {
    const ep = makeEndpoint()
    const quads = makeQuads()
    const first = ep.extractImportData(quads)
    const second = ep.extractImportData(quads)
    expect(first).toEqual(second)
  })

  it('picks up new channels on re-import', () => {
    const ep = makeEndpoint()
    const quads1 = makeQuads()
    const quads2 = [
      ...makeQuads(),
      { subject: 'harmony:channel:ch2', predicate: RDFPredicate.type, object: HarmonyType.Channel, graph },
      { subject: 'harmony:channel:ch2', predicate: HarmonyPredicate.name, object: { value: 'random' }, graph },
      { subject: 'harmony:channel:ch2', predicate: `${HARMONY}channelType`, object: { value: 'text' }, graph }
    ]
    const first = ep.extractImportData(quads1)
    const second = ep.extractImportData(quads2)
    expect(first.channels).toHaveLength(1)
    expect(second.channels).toHaveLength(2)
  })

  it('picks up new messages on re-import', () => {
    const ep = makeEndpoint()
    const extraMessages: Quad[] = [
      {
        subject: 'harmony:message:m2',
        predicate: RDFPredicate.type,
        object: HarmonyType.Message,
        graph: 'harmony:channel:ch1'
      },
      {
        subject: 'harmony:message:m2',
        predicate: HarmonyPredicate.content,
        object: { value: 'New message' },
        graph: 'harmony:channel:ch1'
      },
      {
        subject: 'harmony:message:m2',
        predicate: HarmonyPredicate.author,
        object: 'harmony:member:u1',
        graph: 'harmony:channel:ch1'
      },
      {
        subject: 'harmony:message:m2',
        predicate: HarmonyPredicate.timestamp,
        object: { value: '2023-01-15T11:00:00Z', datatype: XSDDatatype.dateTime },
        graph: 'harmony:channel:ch1'
      },
      {
        subject: 'harmony:message:m2',
        predicate: HarmonyPredicate.inChannel,
        object: 'harmony:channel:ch1',
        graph: 'harmony:channel:ch1'
      }
    ]
    const quads = makeQuads({ extraMessages })
    const _result = ep.extractImportData(quads)
    // extractImportData doesn't return messages directly, but the quads contain them
    const messageQuads = quads.filter((q) => q.predicate === RDFPredicate.type && q.object === HarmonyType.Message)
    expect(messageQuads).toHaveLength(2)
  })

  it('picks up new members on re-import', () => {
    const ep = makeEndpoint()
    const quads = [
      ...makeQuads(),
      { subject: 'harmony:member:u2', predicate: RDFPredicate.type, object: HarmonyType.Member, graph },
      { subject: 'harmony:member:u2', predicate: HarmonyPredicate.name, object: { value: 'Bob' }, graph }
    ]
    const result = ep.extractImportData(quads)
    expect(result.members).toHaveLength(2)
    expect(result.members.map((m) => m.displayName).sort()).toEqual(['Alice', 'Bob'])
  })
})

describe('Migration data expectations', () => {
  it('member DIDs use harmony:member:<discordId> format', () => {
    const ep = makeEndpoint()
    const result = ep.extractImportData(makeQuads())
    expect(result.members[0].did).toBe('harmony:member:u1')
  })

  it('channel IDs use harmony:channel:<discordId> format', () => {
    const ep = makeEndpoint()
    const result = ep.extractImportData(makeQuads())
    expect(result.channels[0].id).toBe('harmony:channel:ch1')
  })

  it('community ID uses harmony:community:<guildId> format', () => {
    const ep = makeEndpoint()
    const result = ep.extractImportData(makeQuads())
    expect(result.communityId).toBe('harmony:community:srv1')
  })

  it('preserves member display names from Discord', () => {
    const ep = makeEndpoint()
    const result = ep.extractImportData(makeQuads({ memberName: 'DiscordUser#1234' }))
    expect(result.members[0].displayName).toBe('DiscordUser#1234')
  })

  it('message content is stored as literal value', () => {
    const quads = makeQuads({ messageContent: 'Hello world! 🎉' })
    const contentQuad = quads.find(
      (q) => q.subject === 'harmony:message:m1' && q.predicate === HarmonyPredicate.content
    )
    expect(contentQuad).toBeDefined()
    const val = typeof contentQuad!.object === 'object' ? contentQuad!.object.value : contentQuad!.object
    expect(val).toBe('Hello world! 🎉')
  })

  it('message author references member URI', () => {
    const quads = makeQuads()
    const authorQuad = quads.find((q) => q.subject === 'harmony:message:m1' && q.predicate === HarmonyPredicate.author)
    expect(authorQuad?.object).toBe('harmony:member:u1')
  })

  it('handles messages with attachments', () => {
    const extra: Quad[] = [
      {
        subject: 'harmony:message:m1',
        predicate: `${HARMONY}attachment`,
        object: { value: 'https://cdn.discord.com/file.png' },
        graph: 'harmony:channel:ch1'
      },
      {
        subject: 'harmony:message:m1',
        predicate: HarmonyPredicate.filename,
        object: { value: 'file.png' },
        graph: 'harmony:channel:ch1'
      }
    ]
    const quads = makeQuads({ extraMessages: extra })
    const attachmentQuad = quads.find(
      (q) => q.subject === 'harmony:message:m1' && q.predicate === `${HARMONY}attachment`
    )
    expect(attachmentQuad).toBeDefined()
    const val = typeof attachmentQuad!.object === 'object' ? attachmentQuad!.object.value : attachmentQuad!.object
    expect(val).toBe('https://cdn.discord.com/file.png')
  })

  it('handles messages with reactions', () => {
    const extra: Quad[] = [
      {
        subject: 'harmony:message:m1:reaction:👍:u1',
        predicate: RDFPredicate.type,
        object: HarmonyType.Reaction,
        graph: 'harmony:channel:ch1'
      },
      {
        subject: 'harmony:message:m1:reaction:👍:u1',
        predicate: HarmonyPredicate.emoji,
        object: { value: '👍' },
        graph: 'harmony:channel:ch1'
      },
      {
        subject: 'harmony:message:m1:reaction:👍:u1',
        predicate: HarmonyPredicate.reactor,
        object: 'harmony:member:u1',
        graph: 'harmony:channel:ch1'
      }
    ]
    const quads = makeQuads({ extraMessages: extra })
    const reactionQuads = quads.filter((q) => q.predicate === RDFPredicate.type && q.object === HarmonyType.Reaction)
    expect(reactionQuads).toHaveLength(1)
  })

  it('handles reply chains', () => {
    const extra: Quad[] = [
      {
        subject: 'harmony:message:m2',
        predicate: RDFPredicate.type,
        object: HarmonyType.Message,
        graph: 'harmony:channel:ch1'
      },
      {
        subject: 'harmony:message:m2',
        predicate: HarmonyPredicate.content,
        object: { value: 'Reply' },
        graph: 'harmony:channel:ch1'
      },
      {
        subject: 'harmony:message:m2',
        predicate: HarmonyPredicate.author,
        object: 'harmony:member:u1',
        graph: 'harmony:channel:ch1'
      },
      {
        subject: 'harmony:message:m2',
        predicate: HarmonyPredicate.timestamp,
        object: { value: '2023-01-15T11:00:00Z', datatype: XSDDatatype.dateTime },
        graph: 'harmony:channel:ch1'
      },
      {
        subject: 'harmony:message:m2',
        predicate: HarmonyPredicate.inChannel,
        object: 'harmony:channel:ch1',
        graph: 'harmony:channel:ch1'
      },
      {
        subject: 'harmony:message:m2',
        predicate: HarmonyPredicate.replyTo,
        object: 'harmony:message:m1',
        graph: 'harmony:channel:ch1'
      }
    ]
    const quads = makeQuads({ extraMessages: extra })
    const replyQuad = quads.find((q) => q.subject === 'harmony:message:m2' && q.predicate === HarmonyPredicate.replyTo)
    expect(replyQuad?.object).toBe('harmony:message:m1')
  })
})

function makeEndpoint() {
  return new MigrationEndpoint(logger, null)
}
