import type { QuadStore, Quad } from '@harmony/quads'
import { HarmonyType, HarmonyPredicate, RDFPredicate, XSDDatatype } from '@harmony/vocab'

export interface ReputationProfile {
  did: string
  communities: CommunityReputation[]
  credentials: PortableCredential[]
  aggregateScore: number
  lastUpdated: string
}

export interface CommunityReputation {
  communityId: string
  communityName: string
  memberSince: string
  roles: string[]
  credentials: string[]
  messageCount: number
  contributionScore: number
}

export interface PortableCredential {
  credentialId: string
  typeId: string
  typeName: string
  issuingCommunity: string
  issuedAt: string
  transferable: boolean
  verified: boolean
}

export class ReputationEngine {
  private profiles = new Map<string, ReputationProfile>()
  private communityData = new Map<string, Map<string, CommunityReputation>>()
  private store: QuadStore

  constructor(store: QuadStore) {
    this.store = store
  }

  async getReputation(did: string): Promise<ReputationProfile> {
    let profile = this.profiles.get(did)
    if (!profile) {
      profile = {
        did,
        communities: [],
        credentials: [],
        aggregateScore: 0,
        lastUpdated: new Date().toISOString()
      }

      // Aggregate from community data
      const communityMap = this.communityData.get(did)
      if (communityMap) {
        profile.communities = Array.from(communityMap.values())
      }

      profile.aggregateScore = this.computeAggregateScore(profile)
      this.profiles.set(did, profile)
    }

    // Return a snapshot (not a reference)
    return {
      did: profile.did,
      communities: [...profile.communities],
      credentials: [...profile.credentials],
      aggregateScore: profile.aggregateScore,
      lastUpdated: profile.lastUpdated
    }
  }

  async getReputationInCommunity(did: string, communityId: string): Promise<CommunityReputation> {
    const communityMap = this.communityData.get(did)
    if (communityMap) {
      const rep = communityMap.get(communityId)
      if (rep) return rep
    }

    return {
      communityId,
      communityName: '',
      memberSince: new Date().toISOString(),
      roles: [],
      credentials: [],
      messageCount: 0,
      contributionScore: 0
    }
  }

  async computeScore(did: string, _communityId: string): Promise<number> {
    const profile = await this.getReputation(did)
    return profile.aggregateScore
  }

  setCommunityReputation(did: string, rep: CommunityReputation): void {
    if (!this.communityData.has(did)) {
      this.communityData.set(did, new Map())
    }
    this.communityData.get(did)!.set(rep.communityId, rep)

    // Update profile
    const profile = this.profiles.get(did)
    if (profile) {
      profile.communities = Array.from(this.communityData.get(did)!.values())
      profile.aggregateScore = this.computeAggregateScore(profile)
      profile.lastUpdated = new Date().toISOString()
    }

    // Store as RDF
    this.storeReputationQuads(did, rep).catch((err) => {
      console.debug('[Reputation] failed to store quads:', err)
    })
  }

  addCredential(did: string, cred: PortableCredential): void {
    if (!this.profiles.has(did)) {
      this.profiles.set(did, {
        did,
        communities: Array.from(this.communityData.get(did)?.values() ?? []),
        credentials: [],
        aggregateScore: 0,
        lastUpdated: new Date().toISOString()
      })
    }
    const profile = this.profiles.get(did)!
    profile.credentials.push(cred)
    profile.aggregateScore = this.computeAggregateScore(profile)
    profile.lastUpdated = new Date().toISOString()
  }

  removeCredential(did: string, credentialId: string): void {
    const profile = this.profiles.get(did)
    if (profile) {
      profile.credentials = profile.credentials.filter((c) => c.credentialId !== credentialId)
      profile.aggregateScore = this.computeAggregateScore(profile)
      profile.lastUpdated = new Date().toISOString()
    }
  }

  private computeAggregateScore(profile: ReputationProfile): number {
    let score = 0

    // Credentials contribute
    const activeCredentials = profile.credentials.filter((c) => c.verified)
    score += activeCredentials.length * 10

    // Community participation
    for (const comm of profile.communities) {
      score += Math.min(comm.messageCount * 0.01, 20) // Cap at 20 per community
      score += comm.contributionScore * 0.5
      score += comm.roles.length * 5
      score += comm.credentials.length * 3
    }

    // Normalize to 0-100
    return Math.min(100, Math.max(0, Math.round(score)))
  }

  private async storeReputationQuads(did: string, rep: CommunityReputation): Promise<void> {
    const graph = `community:${rep.communityId}`
    const subject = `harmony:reputation-${did.replace(/[^a-zA-Z0-9]/g, '-')}`
    const quads: Quad[] = [
      { subject, predicate: RDFPredicate.type, object: HarmonyType.Reputation, graph },
      { subject, predicate: HarmonyPredicate.subject, object: did, graph },
      {
        subject,
        predicate: HarmonyPredicate.score,
        object: { value: String(rep.contributionScore), datatype: XSDDatatype.integer },
        graph
      },
      {
        subject,
        predicate: HarmonyPredicate.messageCount,
        object: { value: String(rep.messageCount), datatype: XSDDatatype.integer },
        graph
      }
    ]
    await this.store.addAll(quads)
  }
}
