import type { KeyPair, CryptoProvider } from '@harmony/crypto'
import type { Identity, RecoveryConfig, RecoveryRequest, RecoveryApproval } from '@harmony/identity'
import { IdentityManager } from '@harmony/identity'

export interface RecoverySetup {
  config: RecoveryConfig
  ownerDID: string
}

export interface OAuthRecoveryToken {
  provider: string
  providerUserId: string
  tokenHash: Uint8Array
}

export class RecoveryService {
  private identityManager: IdentityManager
  private recoveryConfigs: Map<string, RecoveryConfig> = new Map() // DID → config
  private oauthTokens: Map<string, OAuthRecoveryToken> = new Map() // DID → token
  private activeRequests: Map<string, { request: RecoveryRequest; approvals: RecoveryApproval[] }> = new Map()
  private crypto: CryptoProvider

  constructor(crypto: CryptoProvider) {
    this.crypto = crypto
    this.identityManager = new IdentityManager(crypto)
  }

  async setupSocialRecovery(params: {
    identity: Identity
    trustedDIDs: string[]
    threshold: number
    keyPair: KeyPair
  }): Promise<RecoveryConfig> {
    if (params.trustedDIDs.length === 0) throw new Error('Must have at least one trusted DID')
    if (params.threshold < 1) throw new Error('Threshold must be at least 1')
    if (params.threshold > params.trustedDIDs.length) {
      throw new Error('Threshold cannot exceed number of trusted DIDs')
    }

    const config = await this.identityManager.setupRecovery(params)
    this.recoveryConfigs.set(params.identity.did, config)
    return config
  }

  getRecoveryConfig(did: string): RecoveryConfig | null {
    return this.recoveryConfigs.get(did) ?? null
  }

  async registerOAuthRecovery(params: { did: string; provider: string; providerUserId: string }): Promise<void> {
    const data = new TextEncoder().encode(`${params.provider}:${params.providerUserId}`)
    const salt = new TextEncoder().encode('harmony-oauth-recovery-hash')
    const tokenHash = await this.crypto.deriveKey(data, salt, 'oauth-hash')
    this.oauthTokens.set(params.did, {
      provider: params.provider,
      providerUserId: params.providerUserId,
      tokenHash
    })
  }

  async initiateRecovery(params: { claimedDID: string; recovererKeyPair: KeyPair }): Promise<RecoveryRequest> {
    const config = this.recoveryConfigs.get(params.claimedDID)
    if (!config) throw new Error('No recovery config found for this DID')

    const { DIDKeyProvider } = await import('@harmony/did')
    const didProvider = new DIDKeyProvider(this.crypto)
    const recovererDoc = await didProvider.create(params.recovererKeyPair)

    const request = await this.identityManager.initiateRecovery({
      claimedDID: params.claimedDID,
      recovererDID: recovererDoc.id,
      recoveryConfig: config
    })

    this.activeRequests.set(request.id, { request, approvals: [] })
    return request
  }

  async submitApproval(
    approval: RecoveryApproval
  ): Promise<{ approved: boolean; approvalsCount: number; threshold: number }> {
    const entry = this.activeRequests.get(approval.requestId)
    if (!entry) throw new Error('Recovery request not found')

    if (!entry.request.config.trustedDIDs.includes(approval.approverDID)) {
      throw new Error('Approver is not a trusted DID')
    }

    // Prevent duplicate approvals
    if (entry.approvals.some((a) => a.approverDID === approval.approverDID)) {
      throw new Error('Duplicate approval')
    }

    entry.approvals.push(approval)
    const threshold = entry.request.config.threshold
    return {
      approved: entry.approvals.length >= threshold,
      approvalsCount: entry.approvals.length,
      threshold
    }
  }

  async completeRecovery(params: {
    requestId: string
    newKeyPair: KeyPair
  }): Promise<{ identity: Identity; keyPair: KeyPair }> {
    const entry = this.activeRequests.get(params.requestId)
    if (!entry) throw new Error('Recovery request not found')

    const result = await this.identityManager.completeRecovery({
      request: entry.request,
      approvals: entry.approvals,
      newKeyPair: params.newKeyPair
    })

    this.activeRequests.delete(params.requestId)
    return result
  }

  async recoverViaOAuth(params: {
    provider: string
    providerUserId: string
  }): Promise<{ identity: Identity; keyPair: KeyPair } | null> {
    // Find the DID associated with this OAuth
    for (const [_did, token] of this.oauthTokens) {
      if (token.provider === params.provider && token.providerUserId === params.providerUserId) {
        // Derive deterministic identity from OAuth
        return this.identityManager.createFromOAuthRecovery(
          params.provider,
          `${params.provider}:${params.providerUserId}`
        )
      }
    }
    return null
  }

  getActiveRequests(): Map<string, { request: RecoveryRequest; approvals: RecoveryApproval[] }> {
    return new Map(this.activeRequests)
  }
}
