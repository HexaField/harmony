// D1 Identity Store implementation
import type { D1Database } from './types.js'

export interface D1IdentityStore {
  linkIdentity(discordUserId: string, did: string, proof: string): Promise<void>
  getByDiscordId(discordUserId: string): Promise<string | null>
  getByDID(did: string): Promise<string | null>
  findFriends(discordUserIds: string[]): Promise<Array<{ discordId: string; did: string }>>
}

export function createIdentityStore(db: D1Database): D1IdentityStore {
  return {
    async linkIdentity(discordUserId: string, did: string, proof: string): Promise<void> {
      // Check for existing Discord ID
      const existingDiscord = await db
        .prepare('SELECT did FROM identity_links WHERE discord_user_id = ?')
        .bind(discordUserId)
        .first<{ did: string }>()
      if (existingDiscord) {
        throw new Error('DUPLICATE_DISCORD_ID')
      }

      // Check for existing DID
      const existingDID = await db
        .prepare('SELECT discord_user_id FROM identity_links WHERE did = ?')
        .bind(did)
        .first<{ discord_user_id: string }>()
      if (existingDID) {
        throw new Error('DUPLICATE_DID')
      }

      await db
        .prepare('INSERT INTO identity_links (discord_user_id, did, proof, verified) VALUES (?, ?, ?, 1)')
        .bind(discordUserId, did, proof)
        .run()
    },

    async getByDiscordId(discordUserId: string): Promise<string | null> {
      const row = await db
        .prepare('SELECT did FROM identity_links WHERE discord_user_id = ?')
        .bind(discordUserId)
        .first<{ did: string }>()
      return row?.did ?? null
    },

    async getByDID(did: string): Promise<string | null> {
      const row = await db
        .prepare('SELECT discord_user_id FROM identity_links WHERE did = ?')
        .bind(did)
        .first<{ discord_user_id: string }>()
      return row?.discord_user_id ?? null
    },

    async findFriends(discordUserIds: string[]): Promise<Array<{ discordId: string; did: string }>> {
      if (discordUserIds.length === 0) return []
      const placeholders = discordUserIds.map(() => '?').join(',')
      const result = await db
        .prepare(`SELECT discord_user_id, did FROM identity_links WHERE discord_user_id IN (${placeholders})`)
        .bind(...discordUserIds)
        .all<{ discord_user_id: string; did: string }>()
      return result.results.map((r) => ({ discordId: r.discord_user_id, did: r.did }))
    }
  }
}
