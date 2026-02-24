import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryQuadStore } from '@harmony/quads'
import { HarmonyPredicate, HarmonyType, RDFPredicate, XSDDatatype } from '@harmony/vocab'
import { ReconciliationService } from '../src/reconciliation.js'

function createGhostMember(
  store: MemoryQuadStore,
  discordUserId: string,
  username: string,
  communityURI: string,
  roles: string[] = []
) {
  const memberURI = `harmony:member:${discordUserId}`
  const quads = [
    { subject: memberURI, predicate: RDFPredicate.type, object: HarmonyType.Member, graph: communityURI },
    { subject: memberURI, predicate: HarmonyPredicate.name, object: { value: username }, graph: communityURI },
    {
      subject: memberURI,
      predicate: HarmonyPredicate.discordId,
      object: { value: discordUserId },
      graph: communityURI
    },
    {
      subject: memberURI,
      predicate: HarmonyPredicate.discordUsername,
      object: { value: username },
      graph: communityURI
    },
    { subject: memberURI, predicate: HarmonyPredicate.community, object: communityURI, graph: communityURI },
    {
      subject: memberURI,
      predicate: HarmonyPredicate.joinedAt,
      object: { value: '2024-01-01T00:00:00Z', datatype: XSDDatatype.dateTime },
      graph: communityURI
    }
  ]
  for (const roleId of roles) {
    quads.push({
      subject: memberURI,
      predicate: HarmonyPredicate.role,
      object: `harmony:role:${roleId}`,
      graph: communityURI
    })
  }
  return store.addAll(quads)
}

describe('ReconciliationService', () => {
  let store: MemoryQuadStore
  let service: ReconciliationService

  beforeEach(() => {
    store = new MemoryQuadStore()
    service = new ReconciliationService(store)
  })

  it('should reconcile ghost member with DID and preserve roles', async () => {
    const communityURI = 'harmony:community:server1'
    await createGhostMember(store, '123456', 'testuser', communityURI, ['admin', 'mod'])

    const result = await service.onDiscordLinked('123456', 'testuser_updated', 'did:key:z6Mk...')

    expect(result.reconciledCommunities).toEqual([communityURI])
    expect(result.rolesPreserved.get(communityURI)).toEqual(['harmony:role:admin', 'harmony:role:mod'])

    // Verify DID was added
    const didQuads = await store.match({
      subject: 'harmony:member:123456',
      predicate: HarmonyPredicate.did
    })
    expect(didQuads).toHaveLength(1)
    expect((didQuads[0].object as { value: string }).value).toBe('did:key:z6Mk...')
  })

  it('should maintain bidirectional reference after reconciliation', async () => {
    const communityURI = 'harmony:community:server1'
    await createGhostMember(store, '789', 'oldname', communityURI)

    await service.onDiscordLinked('789', 'newname', 'did:key:abc')

    // discordId still queryable
    const discordIdQuads = await store.match({
      subject: 'harmony:member:789',
      predicate: HarmonyPredicate.discordId
    })
    expect(discordIdQuads).toHaveLength(1)
    expect((discordIdQuads[0].object as { value: string }).value).toBe('789')

    // DID is set
    const resolved = await service.resolveDiscordUser('789')
    expect(resolved).toBe('did:key:abc')

    // Username updated
    const usernameQuads = await store.match({
      subject: 'harmony:member:789',
      predicate: HarmonyPredicate.discordUsername
    })
    expect(usernameQuads).toHaveLength(1)
    expect((usernameQuads[0].object as { value: string }).value).toBe('newname')
  })

  it('should sync display name on reconciliation', async () => {
    const communityURI = 'harmony:community:server1'
    await createGhostMember(store, '555', 'oldname', communityURI)

    await service.onDiscordLinked('555', 'newdisplayname', 'did:key:xyz')

    const nameQuads = await store.match({
      subject: 'harmony:member:555',
      predicate: HarmonyPredicate.name,
      graph: communityURI
    })
    expect(nameQuads).toHaveLength(1)
    expect((nameQuads[0].object as { value: string }).value).toBe('newdisplayname')
  })

  it('should return empty when Discord user has no ghost records', async () => {
    const result = await service.onDiscordLinked('nonexistent', 'user', 'did:key:abc')
    expect(result.reconciledCommunities).toEqual([])
    expect(result.rolesPreserved.size).toBe(0)
  })

  it('should reconcile across multiple communities at once', async () => {
    const community1 = 'harmony:community:server1'
    const community2 = 'harmony:community:server2'
    await createGhostMember(store, '999', 'multiuser', community1, ['member'])
    await createGhostMember(store, '999', 'multiuser', community2, ['admin'])

    const result = await service.onDiscordLinked('999', 'multiuser', 'did:key:multi')

    expect(result.reconciledCommunities).toHaveLength(2)
    expect(result.reconciledCommunities).toContain(community1)
    expect(result.reconciledCommunities).toContain(community2)
    expect(result.rolesPreserved.get(community1)).toEqual(['harmony:role:member'])
    expect(result.rolesPreserved.get(community2)).toEqual(['harmony:role:admin'])

    // Both records have DID set
    const resolved = await service.resolveDiscordUser('999')
    expect(resolved).toBe('did:key:multi')
  })

  it('findCommunitiesForDiscordUser returns matching communities', async () => {
    const community1 = 'harmony:community:a'
    await createGhostMember(store, '111', 'user1', community1)

    const communities = await service.findCommunitiesForDiscordUser('111')
    expect(communities).toEqual([community1])

    const none = await service.findCommunitiesForDiscordUser('222')
    expect(none).toEqual([])
  })

  it('resolveDiscordUser returns null when not linked', async () => {
    const community = 'harmony:community:x'
    await createGhostMember(store, '333', 'ghost', community)

    const result = await service.resolveDiscordUser('333')
    expect(result).toBeNull()
  })
})
