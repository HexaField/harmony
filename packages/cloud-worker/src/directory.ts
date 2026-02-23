// Community directory
import type { D1Database, DirectoryEntry } from './types.js'

export interface DirectoryStore {
  register(entry: DirectoryEntry): Promise<void>
  list(): Promise<DirectoryEntry[]>
  getByOwner(ownerDID: string): Promise<DirectoryEntry[]>
}

export function createDirectoryStore(db: D1Database): DirectoryStore {
  return {
    async register(entry: DirectoryEntry): Promise<void> {
      await db
        .prepare(
          'INSERT OR REPLACE INTO directory (community_id, name, description, endpoint, member_count, invite_code, owner_did, listed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(
          entry.communityId,
          entry.name,
          entry.description ?? null,
          entry.endpoint,
          entry.memberCount,
          entry.inviteCode ?? null,
          entry.ownerDID,
          entry.listedAt
        )
        .run()
    },

    async list(): Promise<DirectoryEntry[]> {
      const result = await db
        .prepare(
          'SELECT community_id, name, description, endpoint, member_count, invite_code, owner_did, listed_at FROM directory'
        )
        .all<{
          community_id: string
          name: string
          description: string | null
          endpoint: string
          member_count: number
          invite_code: string | null
          owner_did: string
          listed_at: string
        }>()

      return result.results.map((r) => ({
        communityId: r.community_id,
        name: r.name,
        description: r.description ?? undefined,
        endpoint: r.endpoint,
        memberCount: r.member_count,
        inviteCode: r.invite_code ?? undefined,
        ownerDID: r.owner_did,
        listedAt: r.listed_at
      }))
    },

    async getByOwner(ownerDID: string): Promise<DirectoryEntry[]> {
      const result = await db
        .prepare(
          'SELECT community_id, name, description, endpoint, member_count, invite_code, owner_did, listed_at FROM directory WHERE owner_did = ?'
        )
        .bind(ownerDID)
        .all<{
          community_id: string
          name: string
          description: string | null
          endpoint: string
          member_count: number
          invite_code: string | null
          owner_did: string
          listed_at: string
        }>()

      return result.results.map((r) => ({
        communityId: r.community_id,
        name: r.name,
        description: r.description ?? undefined,
        endpoint: r.endpoint,
        memberCount: r.member_count,
        inviteCode: r.invite_code ?? undefined,
        ownerDID: r.owner_did,
        listedAt: r.listed_at
      }))
    }
  }
}
