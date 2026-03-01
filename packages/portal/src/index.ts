import type { KeyPair, CryptoProvider } from '@harmony/crypto'
import { randomBytes } from 'crypto'
import type { VerifiableCredential } from '@harmony/vc'
import { VCService } from '@harmony/vc'
import type { Invocation } from '@harmony/zcap'
import { DIDKeyProvider } from '@harmony/did'
import { IdentityManager, type Identity } from '@harmony/identity'
import type { EncryptedExportBundle } from '@harmony/migration'
import type Database from 'better-sqlite3'

export interface ExportMetadata {
  exportId: string
  metadata: EncryptedExportBundle['metadata']
  storedAt: string
}

export class PortalService {
  private identityManager: IdentityManager
  private vcService: VCService
  private didProvider: DIDKeyProvider
  private db: Database.Database

  private portalKeyPair!: KeyPair
  private portalDID!: string

  private crypto: CryptoProvider
  constructor(crypto: CryptoProvider, db: Database.Database) {
    this.crypto = crypto
    this.db = db
    this.identityManager = new IdentityManager(crypto)
    this.vcService = new VCService(crypto)
    this.didProvider = new DIDKeyProvider(crypto)
  }

  async initialize(): Promise<void> {
    this.portalKeyPair = await this.crypto.generateSigningKeyPair()
    const doc = await this.didProvider.create(this.portalKeyPair)
    this.portalDID = doc.id
  }

  async createIdentity(): Promise<{ identity: Identity; keyPair: KeyPair; mnemonic: string }> {
    const result = await this.identityManager.create()
    this.db
      .prepare('INSERT OR REPLACE INTO identities (did, identity_json, keypair_json) VALUES (?, ?, ?)')
      .run(result.identity.did, JSON.stringify(result.identity), JSON.stringify(result.keyPair))
    return result
  }

  async resolveIdentity(did: string): Promise<Identity | null> {
    const row = this.db.prepare('SELECT identity_json FROM identities WHERE did = ?').get(did) as
      | { identity_json: string }
      | undefined
    if (!row) return null
    return JSON.parse(row.identity_json)
  }

  async initiateOAuthLink(params: {
    provider: 'discord' | 'github' | 'google'
    userDID: string
  }): Promise<{ redirectUrl: string; state: string }> {
    const state = randomBytes(32).toString('hex')
    const clientId = process.env[`${params.provider.toUpperCase()}_CLIENT_ID`] ?? ''
    const redirectUri = process.env[`${params.provider.toUpperCase()}_REDIRECT_URI`] ?? ''

    const urls: Record<string, string> = {
      discord: `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify&state=${state}`,
      github: `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`,
      google: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid+profile&state=${state}`
    }

    return { redirectUrl: urls[params.provider] ?? '', state }
  }

  async completeOAuthLink(params: {
    provider: string
    code: string
    state: string
    userDID: string
    userKeyPair: KeyPair
    providerUserId: string
    providerUsername: string
  }): Promise<VerifiableCredential> {
    if (!this.portalKeyPair) throw new Error('Portal service not initialized')

    const claims: Record<string, unknown> = {
      provider: params.provider,
      providerUserId: params.providerUserId,
      providerUsername: params.providerUsername
    }

    if (params.provider === 'discord') {
      claims.discordUserId = params.providerUserId
      claims.discordUsername = params.providerUsername
      this.db
        .prepare('INSERT OR REPLACE INTO discord_links (discord_id, did) VALUES (?, ?)')
        .run(params.providerUserId, params.userDID)
      this.db
        .prepare('INSERT OR REPLACE INTO discord_profiles (did, discord_id, username) VALUES (?, ?, ?)')
        .run(params.userDID, params.providerUserId, params.providerUsername)
    }

    const vc = await this.vcService.issue({
      issuerDID: this.portalDID,
      issuerKeyPair: this.portalKeyPair,
      subjectDID: params.userDID,
      type: params.provider === 'discord' ? 'DiscordIdentityCredential' : 'OAuthIdentityCredential',
      claims
    })

    return vc
  }

  async storeExport(bundle: EncryptedExportBundle): Promise<{ exportId: string }> {
    const exportId = Array.from(new Uint8Array(8), () => Math.random().toString(36)[2]).join('')
    this.db
      .prepare('INSERT INTO exports (export_id, admin_did, bundle_json, stored_at) VALUES (?, ?, ?, ?)')
      .run(exportId, bundle.metadata.adminDID, JSON.stringify(bundle), new Date().toISOString())
    return { exportId }
  }

  async retrieveExport(exportId: string, adminDID: string): Promise<EncryptedExportBundle> {
    const row = this.db.prepare('SELECT admin_did, bundle_json FROM exports WHERE export_id = ?').get(exportId) as
      | { admin_did: string; bundle_json: string }
      | undefined
    if (!row) throw new Error('Export not found')
    if (row.admin_did !== adminDID) throw new Error('Unauthorized')
    return JSON.parse(row.bundle_json)
  }

  async deleteExport(exportId: string, adminDID: string, _proof?: Invocation): Promise<void> {
    const row = this.db.prepare('SELECT admin_did FROM exports WHERE export_id = ?').get(exportId) as
      | { admin_did: string }
      | undefined
    if (!row) throw new Error('Export not found')
    if (row.admin_did !== adminDID) throw new Error('Unauthorized')
    this.db.prepare('DELETE FROM exports WHERE export_id = ?').run(exportId)
  }

  async listExports(adminDID: string): Promise<ExportMetadata[]> {
    const rows = this.db
      .prepare('SELECT export_id, bundle_json, stored_at FROM exports WHERE admin_did = ?')
      .all(adminDID) as Array<{ export_id: string; bundle_json: string; stored_at: string }>
    return rows.map((row) => {
      const bundle = JSON.parse(row.bundle_json)
      return { exportId: row.export_id, metadata: bundle.metadata, storedAt: row.stored_at }
    })
  }

  getDiscordProfile(did: string): { discordId: string; username: string } | null {
    const row = this.db.prepare('SELECT discord_id, username FROM discord_profiles WHERE did = ?').get(did) as
      | { discord_id: string; username: string }
      | undefined
    if (!row) return null
    return { discordId: row.discord_id, username: row.username }
  }

  resolveDiscordUser(discordId: string): string | null {
    const row = this.db.prepare('SELECT did FROM discord_links WHERE discord_id = ?').get(discordId) as
      | { did: string }
      | undefined
    return row?.did ?? null
  }

  async findLinkedIdentities(discordUserIds: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>()
    if (discordUserIds.length === 0) return result
    const placeholders = discordUserIds.map(() => '?').join(',')
    const rows = this.db
      .prepare(`SELECT discord_id, did FROM discord_links WHERE discord_id IN (${placeholders})`)
      .all(...discordUserIds) as Array<{ discord_id: string; did: string }>
    for (const row of rows) {
      result.set(row.discord_id, row.did)
    }
    return result
  }

  storeFriendsList(did: string, discordFriendIds: string[]): void {
    const deleteStmt = this.db.prepare('DELETE FROM friends_lists WHERE did = ?')
    const insertStmt = this.db.prepare('INSERT INTO friends_lists (did, friend_discord_id) VALUES (?, ?)')
    const tx = this.db.transaction(() => {
      deleteStmt.run(did)
      for (const friendId of discordFriendIds) {
        insertStmt.run(did, friendId)
      }
    })
    tx()
  }

  getStoredFriendIds(did: string): string[] {
    const rows = this.db.prepare('SELECT friend_discord_id FROM friends_lists WHERE did = ?').all(did) as Array<{
      friend_discord_id: string
    }>
    return rows.map((r) => r.friend_discord_id)
  }

  async discoverFriends(did: string): Promise<Array<{ discordId: string; did: string; username: string }>> {
    const friendIds = this.getStoredFriendIds(did)
    if (friendIds.length === 0) return []
    const linked = await this.findLinkedIdentities(friendIds)
    const results: Array<{ discordId: string; did: string; username: string }> = []
    for (const [discordId, friendDid] of linked) {
      const profile = this.getDiscordProfile(friendDid)
      results.push({
        discordId,
        did: friendDid,
        username: profile?.username ?? discordId
      })
    }
    return results
  }

  /** Search for linked identities by Discord username (case-insensitive partial match) */
  searchByDiscordUsername(query: string): Array<{ did: string; discordId: string; username: string }> {
    const rows = this.db
      .prepare('SELECT did, discord_id, username FROM discord_profiles WHERE username LIKE ?')
      .all(`%${query}%`) as Array<{ did: string; discord_id: string; username: string }>
    return rows.map((r) => ({ did: r.did, discordId: r.discord_id, username: r.username }))
  }
}
