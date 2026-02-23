import type { KeyPair, CryptoProvider } from '@harmony/crypto'
import type { VerifiableCredential } from '@harmony/vc'
import { VCService } from '@harmony/vc'

export interface DiscordLinkRequest {
  userDID: string
  redirectUrl: string
  state: string
}

export interface DiscordProfile {
  userId: string
  username: string
  discriminator?: string
}

export class DiscordLinkService {
  private vcService: VCService
  private pendingStates: Map<string, { userDID: string; createdAt: number }> = new Map()
  private discordLinks: Map<string, string> = new Map() // discordUserId → DID
  private didToDiscord: Map<string, string> = new Map() // DID → discordUserId

  private issuerDID!: string
  private issuerKeyPair!: KeyPair

  constructor(crypto: CryptoProvider) {
    this.vcService = new VCService(crypto)
  }

  async initialize(issuerDID: string, issuerKeyPair: KeyPair): Promise<void> {
    this.issuerDID = issuerDID
    this.issuerKeyPair = issuerKeyPair
  }

  initiateLink(params: { userDID: string; clientId: string; redirectUri: string }): DiscordLinkRequest {
    const stateBytes = new Uint8Array(16)
    for (let i = 0; i < 16; i++) stateBytes[i] = Math.floor(Math.random() * 256)
    const state = Array.from(stateBytes, (b) => b.toString(16).padStart(2, '0')).join('')

    this.pendingStates.set(state, { userDID: params.userDID, createdAt: Date.now() })

    const redirectUrl = `https://discord.com/api/oauth2/authorize?client_id=${params.clientId}&redirect_uri=${encodeURIComponent(params.redirectUri)}&response_type=code&scope=identify&state=${state}`

    return { userDID: params.userDID, redirectUrl, state }
  }

  async completeLink(params: {
    state: string
    discordProfile: DiscordProfile
  }): Promise<{ vc: VerifiableCredential; userDID: string }> {
    const pending = this.pendingStates.get(params.state)
    if (!pending) throw new Error('Invalid or expired OAuth state')

    // Expire after 10 minutes
    if (Date.now() - pending.createdAt > 10 * 60 * 1000) {
      this.pendingStates.delete(params.state)
      throw new Error('OAuth state expired')
    }

    this.pendingStates.delete(params.state)

    const vc = await this.vcService.issue({
      issuerDID: this.issuerDID,
      issuerKeyPair: this.issuerKeyPair,
      subjectDID: pending.userDID,
      type: 'DiscordIdentityCredential',
      claims: {
        discordUserId: params.discordProfile.userId,
        discordUsername: params.discordProfile.username,
        provider: 'discord'
      }
    })

    this.discordLinks.set(params.discordProfile.userId, pending.userDID)
    this.didToDiscord.set(pending.userDID, params.discordProfile.userId)

    return { vc, userDID: pending.userDID }
  }

  lookupByDiscordId(discordUserId: string): string | null {
    return this.discordLinks.get(discordUserId) ?? null
  }

  lookupByDID(did: string): string | null {
    return this.didToDiscord.get(did) ?? null
  }

  getPendingStateCount(): number {
    return this.pendingStates.size
  }
}
