/**
 * Recovery service — wraps @harmony/identity recovery methods with localStorage persistence.
 * Server-side relay (approve, status check, completion) is not yet available.
 */
import { IdentityManager } from '@harmony/identity'
import type { RecoveryConfig } from '@harmony/identity'
import { createCryptoProvider } from '@harmony/crypto'
import type { KeyPair } from '@harmony/crypto'
import type { Identity } from '@harmony/identity'

const STORAGE_KEY = 'harmony:recovery:config'

export interface RecoveryServiceResult<T> {
  ok: boolean
  data?: T
  error?: string
}

/** Load persisted recovery config from localStorage */
export function loadRecoveryConfig(): RecoveryConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Persist recovery config to localStorage */
function saveRecoveryConfig(config: RecoveryConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

/** Remove recovery config from localStorage */
export function clearRecoveryConfig(): void {
  localStorage.removeItem(STORAGE_KEY)
}

/**
 * Set up social recovery for the current identity.
 * Validates inputs, calls IdentityManager.setupRecovery, persists config.
 */
export async function setupRecovery(params: {
  identity: Identity
  trustedDIDs: string[]
  threshold: number
  keyPair: KeyPair
}): Promise<RecoveryServiceResult<RecoveryConfig>> {
  // Validation
  if (!params.identity?.did) {
    return { ok: false, error: 'No identity available' }
  }
  if (params.trustedDIDs.length === 0) {
    return { ok: false, error: 'At least one trusted DID is required' }
  }
  const invalidDIDs = params.trustedDIDs.filter((d) => !d.startsWith('did:key:z'))
  if (invalidDIDs.length > 0) {
    return { ok: false, error: `Invalid DID format: ${invalidDIDs[0]}` }
  }
  const uniqueDIDs = [...new Set(params.trustedDIDs)]
  if (uniqueDIDs.length !== params.trustedDIDs.length) {
    return { ok: false, error: 'Duplicate trusted DIDs' }
  }
  if (params.trustedDIDs.some((d) => d === params.identity.did)) {
    return { ok: false, error: 'Cannot add yourself as a trusted recovery contact' }
  }
  if (params.threshold < 1) {
    return { ok: false, error: 'Threshold must be at least 1' }
  }
  if (params.threshold > params.trustedDIDs.length) {
    return {
      ok: false,
      error: `Threshold (${params.threshold}) cannot exceed number of trusted contacts (${params.trustedDIDs.length})`
    }
  }

  try {
    const crypto = createCryptoProvider()
    const idMgr = new IdentityManager(crypto)
    const config = await idMgr.setupRecovery({
      identity: params.identity,
      trustedDIDs: uniqueDIDs,
      threshold: params.threshold,
      keyPair: params.keyPair
    })
    saveRecoveryConfig(config)
    return { ok: true, data: config }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Setup failed' }
  }
}

/**
 * Initiate a recovery request (onboarding flow).
 * Creates a local RecoveryRequest — sharing with trustees requires server relay (not yet available).
 */
export async function initiateRecovery(params: {
  claimedDID: string
  recovererDID: string
}): Promise<RecoveryServiceResult<{ requestId: string }>> {
  if (!params.claimedDID.startsWith('did:key:z')) {
    return { ok: false, error: 'Invalid DID format' }
  }

  try {
    const crypto = createCryptoProvider()
    const idMgr = new IdentityManager(crypto)
    // We need a recovery config to initiate — load from claimed identity's config
    // In practice this would come from the server, but for now we create a placeholder
    const request = await idMgr.initiateRecovery({
      claimedDID: params.claimedDID,
      recovererDID: params.recovererDID,
      recoveryConfig: {
        trustedDIDs: [],
        threshold: 1,
        configuredBy: params.claimedDID,
        configuredAt: new Date().toISOString()
      }
    })
    return { ok: true, data: { requestId: request.id } }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Initiation failed' }
  }
}

/** Feature flags for what's available without server relay */
export const RECOVERY_FEATURES = {
  /** Setup: fully local, persists to localStorage */
  setup: true,
  /** Initiate: creates local request ID, but can't notify trustees without server */
  initiate: true,
  /** Approve: requires server relay to receive and respond to requests */
  approve: false,
  /** Status check: requires server to aggregate approvals */
  statusCheck: false,
  /** Complete: requires server to verify approvals and issue new credentials */
  complete: false
} as const
