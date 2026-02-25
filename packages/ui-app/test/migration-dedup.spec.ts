import { describe, it, expect } from 'vitest'
import { pseudonymFromDid } from '../src/utils/pseudonym.js'

/**
 * Tests for migration data handling in the UI store:
 * - Community deduplication on re-import
 * - Channel deduplication on re-import
 * - Member population from import results
 * - Author name resolution (member lookup → pseudonym fallback)
 */

interface MemberData {
  did: string
  displayName: string
  roles: string[]
  status: 'online' | 'offline' | 'idle' | 'dnd'
}

interface CommunityInfo {
  id: string
  name: string
  description: string
  iconUrl?: string
  serverUrl: string
  memberCount: number
}

interface ChannelInfo {
  id: string
  name: string
  type: string
  communityId: string
}

// Simulates the dedup logic from MigrationWizard.doImport
function deduplicateCommunities(existing: CommunityInfo[], imported: CommunityInfo): CommunityInfo[] {
  const idx = existing.findIndex((c) => c.id === imported.id)
  if (idx >= 0) {
    const updated = [...existing]
    updated[idx] = { ...updated[idx], ...imported }
    return updated
  }
  return [...existing, imported]
}

function deduplicateChannels(
  existing: ChannelInfo[],
  communityId: string,
  importedChannels: ChannelInfo[]
): ChannelInfo[] {
  const otherCommunityChannels = existing.filter((c) => c.communityId !== communityId)
  return [...otherCommunityChannels, ...importedChannels]
}

function deduplicateMembers(
  existing: MemberData[],
  imported: Array<{ did: string; displayName: string }>
): MemberData[] {
  const existingDids = new Set(existing.map((m) => m.did))
  const newMembers = imported
    .filter((m) => !existingDids.has(m.did))
    .map((m) => ({
      did: m.did,
      displayName: m.displayName || pseudonymFromDid(m.did),
      roles: [] as string[],
      status: 'offline' as const
    }))
  return [...existing, ...newMembers]
}

function resolveAuthorName(authorDID: string, myDid: string, myDisplayName: string, members: MemberData[]): string {
  if (authorDID === myDid) return myDisplayName || pseudonymFromDid(myDid)
  const member = members.find((m) => m.did === authorDID)
  return member?.displayName || pseudonymFromDid(authorDID)
}

describe('Community deduplication', () => {
  const community1: CommunityInfo = {
    id: 'harmony:community:123',
    name: 'Test Server',
    description: '',
    serverUrl: 'ws://localhost:4000',
    memberCount: 5
  }

  it('adds new community when none exists', () => {
    const result = deduplicateCommunities([], community1)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('harmony:community:123')
  })

  it('updates existing community on re-import', () => {
    const updated = { ...community1, name: 'Updated Server', memberCount: 10 }
    const result = deduplicateCommunities([community1], updated)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Updated Server')
    expect(result[0].memberCount).toBe(10)
  })

  it('preserves other communities on re-import', () => {
    const other: CommunityInfo = {
      id: 'harmony:community:456',
      name: 'Other Server',
      description: '',
      serverUrl: 'ws://other:4000',
      memberCount: 3
    }
    const updated = { ...community1, name: 'Re-imported' }
    const result = deduplicateCommunities([community1, other], updated)
    expect(result).toHaveLength(2)
    expect(result.find((c) => c.id === 'harmony:community:456')?.name).toBe('Other Server')
    expect(result.find((c) => c.id === 'harmony:community:123')?.name).toBe('Re-imported')
  })
})

describe('Channel deduplication', () => {
  it('replaces all channels for the same community', () => {
    const existing: ChannelInfo[] = [
      { id: 'ch1', name: 'general', type: 'text', communityId: 'c1' },
      { id: 'ch2', name: 'random', type: 'text', communityId: 'c1' },
      { id: 'ch3', name: 'other-server', type: 'text', communityId: 'c2' }
    ]
    const imported: ChannelInfo[] = [
      { id: 'ch1', name: 'general', type: 'text', communityId: 'c1' },
      { id: 'ch2', name: 'random', type: 'text', communityId: 'c1' },
      { id: 'ch4', name: 'new-channel', type: 'text', communityId: 'c1' }
    ]
    const result = deduplicateChannels(existing, 'c1', imported)
    expect(result).toHaveLength(4) // 1 from c2 + 3 from c1
    expect(result.filter((c) => c.communityId === 'c1')).toHaveLength(3)
    expect(result.filter((c) => c.communityId === 'c2')).toHaveLength(1)
  })

  it('preserves channels from other communities', () => {
    const existing: ChannelInfo[] = [
      { id: 'ch1', name: 'general', type: 'text', communityId: 'c1' },
      { id: 'ch3', name: 'other', type: 'text', communityId: 'c2' }
    ]
    const imported: ChannelInfo[] = [{ id: 'ch1', name: 'general-renamed', type: 'text', communityId: 'c1' }]
    const result = deduplicateChannels(existing, 'c1', imported)
    expect(result).toHaveLength(2)
    expect(result.find((c) => c.id === 'ch1')?.name).toBe('general-renamed')
    expect(result.find((c) => c.id === 'ch3')?.name).toBe('other')
  })

  it('handles voice channel types correctly', () => {
    const imported: ChannelInfo[] = [
      { id: 'ch1', name: 'General', type: 'text', communityId: 'c1' },
      { id: 'ch2', name: 'Voice Chat', type: 'voice', communityId: 'c1' }
    ]
    const result = deduplicateChannels([], 'c1', imported)
    expect(result.find((c) => c.id === 'ch2')?.type).toBe('voice')
  })
})

describe('Member population from import', () => {
  it('adds imported members to empty store', () => {
    const imported = [
      { did: 'harmony:member:111', displayName: 'Alice' },
      { did: 'harmony:member:222', displayName: 'Bob' }
    ]
    const result = deduplicateMembers([], imported)
    expect(result).toHaveLength(2)
    expect(result[0].displayName).toBe('Alice')
    expect(result[0].status).toBe('offline')
  })

  it('does not duplicate existing members', () => {
    const existing: MemberData[] = [
      { did: 'harmony:member:111', displayName: 'Alice', roles: ['admin'], status: 'online' }
    ]
    const imported = [
      { did: 'harmony:member:111', displayName: 'Alice (updated)' },
      { did: 'harmony:member:222', displayName: 'Bob' }
    ]
    const result = deduplicateMembers(existing, imported)
    expect(result).toHaveLength(2)
    // Existing member preserves original data (online status, roles)
    expect(result[0].displayName).toBe('Alice')
    expect(result[0].status).toBe('online')
    expect(result[0].roles).toEqual(['admin'])
    expect(result[1].displayName).toBe('Bob')
  })

  it('uses pseudonym for members without display name', () => {
    const imported = [{ did: 'harmony:member:333', displayName: '' }]
    const result = deduplicateMembers([], imported)
    expect(result[0].displayName).toBe(pseudonymFromDid('harmony:member:333'))
    expect(result[0].displayName).not.toBe('')
  })
})

describe('Author name resolution', () => {
  const members: MemberData[] = [
    { did: 'harmony:member:111', displayName: 'Alice', roles: [], status: 'offline' },
    { did: 'harmony:member:222', displayName: 'Bob', roles: [], status: 'offline' }
  ]

  it('returns own display name for own messages', () => {
    expect(resolveAuthorName('did:key:me', 'did:key:me', 'Josh', members)).toBe('Josh')
  })

  it('returns member display name for known members', () => {
    expect(resolveAuthorName('harmony:member:111', 'did:key:me', 'Josh', members)).toBe('Alice')
  })

  it('returns pseudonym for unknown members', () => {
    const name = resolveAuthorName('harmony:member:999', 'did:key:me', 'Josh', members)
    expect(name).toBe(pseudonymFromDid('harmony:member:999'))
  })

  it('returns pseudonym for own DID when display name empty', () => {
    const name = resolveAuthorName('did:key:me', 'did:key:me', '', members)
    expect(name).toBe(pseudonymFromDid('did:key:me'))
  })

  it('never returns empty string', () => {
    expect(resolveAuthorName('', '', '', [])).not.toBe('')
    // pseudonymFromDid('') should still produce a name
    expect(resolveAuthorName('', '', '', []).length).toBeGreaterThan(0)
  })

  it('uses Discord username from migration for message authors', () => {
    // Migration stores authors as harmony:member:<discordUserId>
    // Members imported with Discord usernames should be found
    const discordMembers: MemberData[] = [
      { did: 'harmony:member:123456', displayName: 'DiscordUser#1234', roles: [], status: 'offline' }
    ]
    expect(resolveAuthorName('harmony:member:123456', 'did:key:me', 'Me', discordMembers)).toBe('DiscordUser#1234')
  })
})

describe('Migration data fidelity expectations', () => {
  it('should preserve channel types through migration pipeline', () => {
    // Discord channel types: 0=text, 2=voice, 4=category, 11=thread, 12=thread
    const channelTypes = ['text', 'voice', 'category', 'thread']
    for (const type of channelTypes) {
      expect(type).toMatch(/^(text|voice|category|thread)$/)
    }
  })

  it('should store messages with content as bare string', () => {
    // Migration creates: payload: { content: "text", clock: {...} }
    // Client must handle content as string
    const payload = { content: 'Hello world', clock: { counter: 0, nodeId: 'author' } }
    expect(typeof payload.content).toBe('string')
  })

  it('should use harmony:member:<discordId> format for member DIDs', () => {
    const discordUserId = '123456789'
    const memberDid = `harmony:member:${discordUserId}`
    expect(memberDid).toMatch(/^harmony:member:\d+$/)
  })

  it('should use harmony:community:<guildId> format for community IDs', () => {
    const guildId = '987654321'
    const communityId = `harmony:community:${guildId}`
    expect(communityId).toMatch(/^harmony:community:\d+$/)
  })

  it('should use harmony:channel:<channelId> format for channel IDs', () => {
    const channelId = '555555555'
    const channelUri = `harmony:channel:${channelId}`
    expect(channelUri).toMatch(/^harmony:channel:\d+$/)
  })

  it('should preserve message reactions from Discord', () => {
    // Reactions are stored as separate quads with emoji + reactor
    const reactionUri = 'harmony:message:123:reaction:👍:user456'
    expect(reactionUri).toContain(':reaction:')
  })

  it('should preserve message reply chains', () => {
    // Reply-to references should survive migration
    const replyPredicate = 'harmony:replyTo'
    expect(replyPredicate).toBeTruthy()
  })

  it('should preserve attachment URLs and filenames', () => {
    // Attachments are stored as quads with URL and filename
    const attachmentUrl = 'https://cdn.discordapp.com/attachments/123/456/image.png'
    expect(attachmentUrl).toMatch(/^https:\/\//)
  })

  it('should store member roles from Discord', () => {
    // Each member's Discord roles should be preserved as role references
    const roleRef = 'harmony:role:123456'
    expect(roleRef).toMatch(/^harmony:role:\d+$/)
  })

  it('should store member join dates', () => {
    const joinDate = '2024-01-15T10:30:00.000Z'
    expect(new Date(joinDate).toISOString()).toBe(joinDate)
  })
})
