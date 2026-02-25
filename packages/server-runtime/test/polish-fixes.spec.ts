// Tests for server-runtime POLISH.md fixes (P1 #4 — migration import creates community)
import { describe, it, expect } from 'vitest'
import { MigrationEndpoint } from '../src/migration-endpoint.js'
import { HarmonyType, HarmonyPredicate, RDFPredicate, HARMONY } from '@harmony/vocab'
import type { Quad } from '@harmony/quads'

describe('P1 #4 — MigrationEndpoint.extractImportData', () => {
  function makeQuads(): Quad[] {
    const communityId = 'harmony:community:123'
    const g = communityId
    return [
      { subject: communityId, predicate: RDFPredicate.type, object: HarmonyType.Community, graph: g },
      { subject: communityId, predicate: HarmonyPredicate.name, object: { value: 'Test Server' }, graph: g },
      {
        subject: `${communityId}:channel:general`,
        predicate: RDFPredicate.type,
        object: HarmonyType.Channel,
        graph: g
      },
      {
        subject: `${communityId}:channel:general`,
        predicate: HarmonyPredicate.name,
        object: { value: 'general' },
        graph: g
      },
      {
        subject: `${communityId}:channel:general`,
        predicate: `${HARMONY}channelType`,
        object: { value: 'text' },
        graph: g
      },
      { subject: 'harmony:member:alice', predicate: RDFPredicate.type, object: HarmonyType.Member, graph: g },
      { subject: 'harmony:member:alice', predicate: HarmonyPredicate.name, object: { value: 'Alice' }, graph: g },
      { subject: 'role:admin', predicate: RDFPredicate.type, object: HarmonyType.Role, graph: g },
      { subject: 'role:admin', predicate: HarmonyPredicate.name, object: { value: 'Admin' }, graph: g },
      { subject: 'role:admin', predicate: HarmonyPredicate.permission, object: { value: 'manage_channels' }, graph: g }
    ]
  }

  it('extracts community ID from quads', () => {
    const logger = { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} } as any
    const endpoint = new MigrationEndpoint(logger, null)
    const result = endpoint.extractImportData(makeQuads())
    expect(result.communityId).toBe('harmony:community:123')
  })

  it('extracts channels from quads', () => {
    const logger = { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} } as any
    const endpoint = new MigrationEndpoint(logger, null)
    const result = endpoint.extractImportData(makeQuads())
    expect(result.channels).toHaveLength(1)
    expect(result.channels[0].name).toBe('general')
    expect(result.channels[0].type).toBe('text')
  })

  it('extracts members from quads', () => {
    const logger = { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} } as any
    const endpoint = new MigrationEndpoint(logger, null)
    const result = endpoint.extractImportData(makeQuads())
    expect(result.members).toHaveLength(1)
    expect(result.members[0].displayName).toBe('Alice')
  })

  it('extracts roles with permissions from quads', () => {
    const logger = { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} } as any
    const endpoint = new MigrationEndpoint(logger, null)
    const result = endpoint.extractImportData(makeQuads())
    expect(result.roles).toHaveLength(1)
    expect(result.roles[0].name).toBe('Admin')
    expect(result.roles[0].permissions).toContain('manage_channels')
  })

  it('handles quads with no community', () => {
    const logger = { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} } as any
    const endpoint = new MigrationEndpoint(logger, null)
    const result = endpoint.extractImportData([])
    expect(result.communityId).toBe('')
    expect(result.channels).toHaveLength(0)
  })
})
