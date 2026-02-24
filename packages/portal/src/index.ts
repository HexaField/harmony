import type { KeyPair, CryptoProvider } from '@harmony/crypto'
import type { VerifiableCredential } from '@harmony/vc'
import { VCService } from '@harmony/vc'
import type { Invocation } from '@harmony/zcap'
import { DIDKeyProvider } from '@harmony/did'
import { IdentityManager, type Identity } from '@harmony/identity'
import type { EncryptedExportBundle } from '@harmony/migration'

export interface ExportMetadata {
  exportId: string
  metadata: EncryptedExportBundle['metadata']
  storedAt: string
}

export class PortalService {
  private identityManager: IdentityManager
  private vcService: VCService
  private didProvider: DIDKeyProvider
  private exports: Map<string, { bundle: EncryptedExportBundle; storedAt: string }> = new Map()
  private identities: Map<string, { identity: Identity; keyPair: KeyPair }> = new Map()
  private discordLinks: Map<string, string> = new Map() // discordId → DID
  private discordProfiles: Map<string, { discordId: string; username: string }> = new Map() // DID → discord profile
  private friendsLists: Map<string, string[]> = new Map() // DID → Discord friend IDs

  private portalKeyPair!: KeyPair
  private portalDID!: string

  private crypto: CryptoProvider
  constructor(crypto: CryptoProvider) {
    this.crypto = crypto
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
    this.identities.set(result.identity.did, { identity: result.identity, keyPair: result.keyPair })
    return result
  }

  async resolveIdentity(did: string): Promise<Identity | null> {
    const entry = this.identities.get(did)
    return entry?.identity ?? null
  }

  async initiateOAuthLink(params: {
    provider: 'discord' | 'github' | 'google'
    userDID: string
  }): Promise<{ redirectUrl: string; state: string }> {
    const state = Array.from(new Uint8Array(16), () => Math.random().toString(36)[2]).join('')
    const redirectUrl = `https://oauth.example.com/${params.provider}/authorize?state=${state}&did=${params.userDID}`
    return { redirectUrl, state }
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
      this.discordLinks.set(params.providerUserId, params.userDID)
      this.discordProfiles.set(params.userDID, {
        discordId: params.providerUserId,
        username: params.providerUsername
      })
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
    this.exports.set(exportId, { bundle, storedAt: new Date().toISOString() })
    return { exportId }
  }

  async retrieveExport(exportId: string, adminDID: string): Promise<EncryptedExportBundle> {
    const entry = this.exports.get(exportId)
    if (!entry) throw new Error('Export not found')
    if (entry.bundle.metadata.adminDID !== adminDID) throw new Error('Unauthorized')
    return entry.bundle
  }

  async deleteExport(exportId: string, adminDID: string, _proof?: Invocation): Promise<void> {
    const entry = this.exports.get(exportId)
    if (!entry) throw new Error('Export not found')
    if (entry.bundle.metadata.adminDID !== adminDID) throw new Error('Unauthorized')
    this.exports.delete(exportId)
  }

  async listExports(adminDID: string): Promise<ExportMetadata[]> {
    const results: ExportMetadata[] = []
    for (const [exportId, entry] of this.exports) {
      if (entry.bundle.metadata.adminDID === adminDID) {
        results.push({ exportId, metadata: entry.bundle.metadata, storedAt: entry.storedAt })
      }
    }
    return results
  }

  getDiscordProfile(did: string): { discordId: string; username: string } | null {
    return this.discordProfiles.get(did) ?? null
  }

  async findLinkedIdentities(discordUserIds: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>()
    for (const id of discordUserIds) {
      const did = this.discordLinks.get(id)
      if (did) result.set(id, did)
    }
    return result
  }

  storeFriendsList(did: string, discordFriendIds: string[]): void {
    this.friendsLists.set(did, discordFriendIds)
  }

  getStoredFriendIds(did: string): string[] {
    return this.friendsLists.get(did) ?? []
  }

  async discoverFriends(did: string): Promise<Array<{ discordId: string; did: string; username: string }>> {
    const friendIds = this.friendsLists.get(did) ?? []
    if (friendIds.length === 0) return []
    const linked = await this.findLinkedIdentities(friendIds)
    const results: Array<{ discordId: string; did: string; username: string }> = []
    for (const [discordId, friendDid] of linked) {
      const profile = this.discordProfiles.get(friendDid)
      results.push({
        discordId,
        did: friendDid,
        username: profile?.username ?? discordId
      })
    }
    return results
  }
}
