import type { QuadStore } from '@harmony/quads'
import { HarmonyPredicate } from '@harmony/vocab'

export interface ReconciliationResult {
  reconciledCommunities: string[]
  rolesPreserved: Map<string, string[]> // communityId → role URIs
}

export class ReconciliationService {
  private store: QuadStore

  constructor(store: QuadStore) {
    this.store = store
  }

  /**
   * Called when a user links their Discord account via OAuth.
   * Finds all ghost member records with the matching discordId,
   * adds the real DID, and preserves roles.
   */
  async onDiscordLinked(discordUserId: string, discordUsername: string, did: string): Promise<ReconciliationResult> {
    const communities = await this.findCommunitiesForDiscordUser(discordUserId)
    const rolesPreserved = new Map<string, string[]>()

    for (const communityURI of communities) {
      const ghostURI = `harmony:member:${discordUserId}`

      // Get role assignments from ghost record
      const roleQuads = await this.store.match({
        subject: ghostURI,
        predicate: HarmonyPredicate.role,
        graph: communityURI
      })
      const roles = roleQuads.map((q) => (typeof q.object === 'string' ? q.object : q.object.value))
      rolesPreserved.set(communityURI, roles)

      // Add DID predicate to the ghost member record (bidirectional link)
      await this.store.add({
        subject: ghostURI,
        predicate: HarmonyPredicate.did,
        object: { value: did },
        graph: communityURI
      })

      // Update discord username (may have changed)
      const oldUsernameQuads = await this.store.match({
        subject: ghostURI,
        predicate: HarmonyPredicate.discordUsername,
        graph: communityURI
      })
      for (const q of oldUsernameQuads) await this.store.remove(q)
      await this.store.add({
        subject: ghostURI,
        predicate: HarmonyPredicate.discordUsername,
        object: { value: discordUsername },
        graph: communityURI
      })

      // Update display name to Discord username
      const oldNameQuads = await this.store.match({
        subject: ghostURI,
        predicate: HarmonyPredicate.name,
        graph: communityURI
      })
      for (const q of oldNameQuads) await this.store.remove(q)
      await this.store.add({
        subject: ghostURI,
        predicate: HarmonyPredicate.name,
        object: { value: discordUsername },
        graph: communityURI
      })
    }

    return { reconciledCommunities: communities, rolesPreserved }
  }

  /**
   * Find all communities that have a ghost member for this Discord ID.
   */
  async findCommunitiesForDiscordUser(discordUserId: string): Promise<string[]> {
    const ghostURI = `harmony:member:${discordUserId}`
    const communityQuads = await this.store.match({
      subject: ghostURI,
      predicate: HarmonyPredicate.community
    })
    return communityQuads.map((q) => (typeof q.object === 'string' ? q.object : q.object.value))
  }

  /**
   * Get the DID for a Discord user (if linked via reconciliation).
   */
  async resolveDiscordUser(discordUserId: string): Promise<string | null> {
    const ghostURI = `harmony:member:${discordUserId}`
    const didQuads = await this.store.match({
      subject: ghostURI,
      predicate: HarmonyPredicate.did
    })
    if (didQuads.length === 0) return null
    const obj = didQuads[0].object
    return typeof obj === 'string' ? obj : obj.value
  }
}
