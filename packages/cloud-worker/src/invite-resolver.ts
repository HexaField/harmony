// Invite resolution
import type { D1Database, CommunityPreview, InviteTarget, InviteStats } from './types.js'

export interface InviteResolver {
  create(
    communityId: string,
    endpoint: string,
    metadata: CommunityPreview,
    createdBy: string,
    options?: { maxUses?: number; expiresAt?: string }
  ): Promise<string>
  resolve(code: string): Promise<InviteTarget | null>
  revoke(code: string): Promise<void>
  stats(code: string): Promise<InviteStats | null>
  checkValidity(code: string): Promise<{ valid: boolean; reason?: string }>
}

export function createInviteResolver(db: D1Database): InviteResolver {
  return {
    async create(communityId, endpoint, metadata, createdBy, options?): Promise<string> {
      const code = Math.random().toString(36).substring(2, 10)
      await db
        .prepare(
          'INSERT INTO invites (code, community_id, endpoint, community_name, community_description, member_count, created_by, max_uses, expires_at, uses, revoked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(
          code,
          communityId,
          endpoint,
          metadata.name,
          metadata.description ?? null,
          metadata.memberCount,
          createdBy,
          options?.maxUses ?? null,
          options?.expiresAt ?? null,
          0,
          0
        )
        .run()
      return code
    },

    async resolve(code: string): Promise<InviteTarget | null> {
      const row = await db.prepare('SELECT * FROM invites WHERE code = ?').bind(code).first<{
        code: string
        community_id: string
        endpoint: string
        community_name: string
        community_description: string | null
        member_count: number
        revoked: number
        uses: number
        max_uses: number | null
        expires_at: string | null
      }>()

      if (!row) return null
      if (row.revoked) return null

      // Check expiry
      if (row.expires_at && new Date(row.expires_at) < new Date()) return null

      // Check max uses
      if (row.max_uses !== null && row.uses >= row.max_uses) return null

      // Increment use count
      await db.prepare('UPDATE invites SET uses = uses + 1 WHERE code = ?').bind(code).run()

      return {
        communityId: row.community_id,
        endpoint: row.endpoint,
        preview: {
          name: row.community_name,
          description: row.community_description ?? undefined,
          memberCount: row.member_count
        }
      }
    },

    async revoke(code: string): Promise<void> {
      await db.prepare('UPDATE invites SET revoked = 1 WHERE code = ?').bind(code).run()
    },

    async stats(code: string): Promise<InviteStats | null> {
      const row = await db
        .prepare('SELECT code, uses, max_uses, created_at, expires_at FROM invites WHERE code = ?')
        .bind(code)
        .first<{
          code: string
          uses: number
          max_uses: number | null
          created_at: string
          expires_at: string | null
        }>()

      if (!row) return null
      return {
        code: row.code,
        uses: row.uses,
        maxUses: row.max_uses ?? undefined,
        createdAt: row.created_at,
        expiresAt: row.expires_at ?? undefined
      }
    },

    async checkValidity(code: string): Promise<{ valid: boolean; reason?: string }> {
      const row = await db
        .prepare('SELECT revoked, uses, max_uses, expires_at FROM invites WHERE code = ?')
        .bind(code)
        .first<{
          revoked: number
          uses: number
          max_uses: number | null
          expires_at: string | null
        }>()

      if (!row) return { valid: false, reason: 'not_found' }
      if (row.revoked) return { valid: false, reason: 'revoked' }
      if (row.expires_at && new Date(row.expires_at) < new Date()) return { valid: false, reason: 'expired' }
      if (row.max_uses !== null && row.uses >= row.max_uses) return { valid: false, reason: 'max_uses' }
      return { valid: true }
    }
  }
}
