import { describe, it, expect } from 'vitest'
import { MigrationEndpoint } from '../src/migration-endpoint.js'
import { HarmonyType, HarmonyPredicate, RDFPredicate } from '@harmony/vocab'
import type { Quad } from '@harmony/quads'

// Minimal logger stub
const logger = { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} } as any

describe('MigrationEndpoint.extractImportData', () => {
  function makeEndpoint() {
    return new MigrationEndpoint(logger, null)
  }

  const communityId = 'harmony:community:123'
  const graph = communityId

  function buildQuads(): Quad[] {
    return [
      { subject: communityId, predicate: RDFPredicate.type, object: HarmonyType.Community, graph },
      { subject: communityId, predicate: HarmonyPredicate.name, object: { value: 'Test Server' }, graph },
      // Channels
      { subject: 'harmony:channel:456', predicate: RDFPredicate.type, object: HarmonyType.Channel, graph },
      { subject: 'harmony:channel:456', predicate: HarmonyPredicate.name, object: { value: 'general' }, graph },
      { subject: 'harmony:channel:789', predicate: RDFPredicate.type, object: HarmonyType.Channel, graph },
      { subject: 'harmony:channel:789', predicate: HarmonyPredicate.name, object: { value: 'random' }, graph },
      // Thread
      { subject: 'harmony:channel:thread1', predicate: RDFPredicate.type, object: HarmonyType.Thread, graph },
      { subject: 'harmony:channel:thread1', predicate: HarmonyPredicate.name, object: { value: 'a thread' }, graph },
      // Category (should NOT appear in channels)
      { subject: 'harmony:channel:cat1', predicate: RDFPredicate.type, object: HarmonyType.Category, graph },
      { subject: 'harmony:channel:cat1', predicate: HarmonyPredicate.name, object: { value: 'Category' }, graph },
      // Members
      { subject: 'harmony:member:user1', predicate: RDFPredicate.type, object: HarmonyType.Member, graph },
      { subject: 'harmony:member:user1', predicate: HarmonyPredicate.name, object: { value: 'Alice' }, graph },
      { subject: 'harmony:member:user2', predicate: RDFPredicate.type, object: HarmonyType.Member, graph },
      { subject: 'harmony:member:user2', predicate: HarmonyPredicate.name, object: { value: 'Bob' }, graph }
    ]
  }

  it('extracts communityId', () => {
    const ep = makeEndpoint()
    const result = ep.extractImportData(buildQuads())
    expect(result.communityId).toBe(communityId)
  })

  it('extracts channels (excluding categories)', () => {
    const ep = makeEndpoint()
    const result = ep.extractImportData(buildQuads())
    expect(result.channels).toHaveLength(3) // 2 channels + 1 thread
    expect(result.channels.map((c) => c.name)).toContain('general')
    expect(result.channels.map((c) => c.name)).toContain('random')
    expect(result.channels.map((c) => c.name)).toContain('a thread')
    expect(result.channels.map((c) => c.name)).not.toContain('Category')
  })

  it('sets thread type correctly', () => {
    const ep = makeEndpoint()
    const result = ep.extractImportData(buildQuads())
    const thread = result.channels.find((c) => c.name === 'a thread')
    expect(thread?.type).toBe('thread')
    const general = result.channels.find((c) => c.name === 'general')
    expect(general?.type).toBe('text')
  })

  it('extracts members', () => {
    const ep = makeEndpoint()
    const result = ep.extractImportData(buildQuads())
    expect(result.members).toHaveLength(2)
    expect(result.members.map((m) => m.displayName)).toContain('Alice')
    expect(result.members.map((m) => m.displayName)).toContain('Bob')
  })

  it('returns empty communityId when no community quad exists', () => {
    const ep = makeEndpoint()
    const result = ep.extractImportData([])
    expect(result.communityId).toBe('')
    expect(result.channels).toEqual([])
    expect(result.members).toEqual([])
  })

  it('result matches ImportResult interface shape', () => {
    const ep = makeEndpoint()
    const result = ep.extractImportData(buildQuads())
    // Verify shape
    expect(result).toHaveProperty('communityId')
    expect(result).toHaveProperty('channels')
    expect(result).toHaveProperty('members')
    expect(typeof result.communityId).toBe('string')
    expect(Array.isArray(result.channels)).toBe(true)
    expect(Array.isArray(result.members)).toBe(true)
    // Each channel has id, name, type
    for (const ch of result.channels) {
      expect(ch).toHaveProperty('id')
      expect(ch).toHaveProperty('name')
      expect(ch).toHaveProperty('type')
    }
    // Each member has did, displayName
    for (const m of result.members) {
      expect(m).toHaveProperty('did')
      expect(m).toHaveProperty('displayName')
    }
  })
})
