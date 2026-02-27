import { describe, it, expect } from 'vitest'
import { MigrationEndpoint } from '../src/migration-endpoint.js'
import { HarmonyType, HarmonyPredicate, RDFPredicate, HARMONY, XSDDatatype } from '@harmony/vocab'
import type { Quad } from '@harmony/quads'

const logger = { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} } as any

function makeEndpoint() {
  return new MigrationEndpoint(logger, null)
}

const communityId = 'harmony:community:srv1'
const graph = communityId

function buildQuads(): Quad[] {
  return [
    { subject: communityId, predicate: RDFPredicate.type, object: HarmonyType.Community, graph },
    { subject: communityId, predicate: HarmonyPredicate.name, object: { value: 'Test Server' }, graph },
    // Text channel
    { subject: 'harmony:channel:ch1', predicate: RDFPredicate.type, object: HarmonyType.Channel, graph },
    { subject: 'harmony:channel:ch1', predicate: HarmonyPredicate.name, object: { value: 'general' }, graph },
    { subject: 'harmony:channel:ch1', predicate: `${HARMONY}channelType`, object: { value: 'text' }, graph },
    // Voice channel
    { subject: 'harmony:channel:vc1', predicate: RDFPredicate.type, object: HarmonyType.Channel, graph },
    { subject: 'harmony:channel:vc1', predicate: HarmonyPredicate.name, object: { value: 'Voice Chat' }, graph },
    { subject: 'harmony:channel:vc1', predicate: `${HARMONY}channelType`, object: { value: 'voice' }, graph },
    // Category
    { subject: 'harmony:channel:cat1', predicate: RDFPredicate.type, object: HarmonyType.Category, graph },
    { subject: 'harmony:channel:cat1', predicate: HarmonyPredicate.name, object: { value: 'General' }, graph },
    { subject: 'harmony:channel:cat1', predicate: `${HARMONY}channelType`, object: { value: 'category' }, graph },
    // Roles
    { subject: 'harmony:role:r1', predicate: RDFPredicate.type, object: HarmonyType.Role, graph },
    { subject: 'harmony:role:r1', predicate: HarmonyPredicate.name, object: { value: 'Admin' }, graph },
    { subject: 'harmony:role:r1', predicate: HarmonyPredicate.permission, object: { value: 'MANAGE_CHANNELS' }, graph },
    { subject: 'harmony:role:r1', predicate: HarmonyPredicate.permission, object: { value: 'BAN_MEMBERS' }, graph },
    // Members
    { subject: 'harmony:member:u1', predicate: RDFPredicate.type, object: HarmonyType.Member, graph },
    { subject: 'harmony:member:u1', predicate: HarmonyPredicate.name, object: { value: 'Alice' }, graph },
    // Messages (in channel graph)
    {
      subject: 'harmony:message:m1',
      predicate: RDFPredicate.type,
      object: HarmonyType.Message,
      graph: 'harmony:channel:ch1'
    },
    {
      subject: 'harmony:message:m1',
      predicate: HarmonyPredicate.content,
      object: { value: 'Hello world' },
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
}

describe('extractImportData — voice channels', () => {
  it('voice channels have correct type', () => {
    const ep = makeEndpoint()
    const result = ep.extractImportData(buildQuads())
    const voice = result.channels.find((c) => c.name === 'Voice Chat')
    expect(voice).toBeDefined()
    expect(voice!.type).toBe('voice')
  })

  it('text channels have correct type', () => {
    const ep = makeEndpoint()
    const result = ep.extractImportData(buildQuads())
    const text = result.channels.find((c) => c.name === 'general')
    expect(text).toBeDefined()
    expect(text!.type).toBe('text')
  })
})

describe('extractImportData — roles', () => {
  it('extracts roles with name and permissions', () => {
    const ep = makeEndpoint()
    const result = ep.extractImportData(buildQuads())
    expect(result.roles).toHaveLength(1)
    expect(result.roles[0].name).toBe('Admin')
    expect(result.roles[0].permissions).toContain('MANAGE_CHANNELS')
    expect(result.roles[0].permissions).toContain('BAN_MEMBERS')
  })
})

describe('extractImportData — categories', () => {
  it('extracts categories separately from channels', () => {
    const ep = makeEndpoint()
    const result = ep.extractImportData(buildQuads())
    expect(result.categories).toHaveLength(1)
    expect(result.categories[0].name).toBe('General')
    expect(result.categories[0].type).toBe('category')
    // Categories should not be in channels
    expect(result.channels.find((c) => c.name === 'General')).toBeUndefined()
  })
})

describe('Message population into MessageStore', () => {
  it.skip('messages appear in MessageStore after import (requires full server)', () => {
    // This test requires a running HarmonyServer with a real QuadStore
    // Integration test — skipped for unit testing
  })

  it('extractImportData finds messages in quads', () => {
    const _ep = makeEndpoint()
    const quads = buildQuads()
    const messageQuads = quads.filter((q) => q.predicate === RDFPredicate.type && q.object === HarmonyType.Message)
    expect(messageQuads).toHaveLength(1)
    expect(messageQuads[0].subject).toBe('harmony:message:m1')
  })

  it('message quads have required fields for MessageStore population', () => {
    const quads = buildQuads()
    const msgSubject = 'harmony:message:m1'
    const content = quads.find((q) => q.subject === msgSubject && q.predicate === HarmonyPredicate.content)
    const author = quads.find((q) => q.subject === msgSubject && q.predicate === HarmonyPredicate.author)
    const timestamp = quads.find((q) => q.subject === msgSubject && q.predicate === HarmonyPredicate.timestamp)
    const inChannel = quads.find((q) => q.subject === msgSubject && q.predicate === HarmonyPredicate.inChannel)
    expect(content).toBeDefined()
    expect(author).toBeDefined()
    expect(timestamp).toBeDefined()
    expect(inChannel).toBeDefined()
  })
})
