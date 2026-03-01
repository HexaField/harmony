import type { KeyPair, CryptoProvider, EncryptedPayload } from '@harmony/crypto'
import type { DIDDocument } from '@harmony/did'
import { DIDKeyProvider, didDocumentToQuads, didDocumentFromQuads } from '@harmony/did'
import type { VerifiableCredential, Proof } from '@harmony/vc'
import { VCService } from '@harmony/vc'
import type { Capability } from '@harmony/zcap'
import type { Quad } from '@harmony/quads'

export interface Identity {
  did: string
  document: DIDDocument
  credentials: VerifiableCredential[]
  capabilities: Capability[]
}

export interface RecoveryConfig {
  trustedDIDs: string[]
  threshold: number
  configuredBy: string
  configuredAt: string
}

export interface RecoveryRequest {
  id: string
  claimedDID: string
  recovererDID: string
  config: RecoveryConfig
  createdAt: string
}

export interface RecoveryApproval {
  requestId: string
  approverDID: string
  approvedAt: string
  proof: Proof
}

export class IdentityManager {
  private didProvider: DIDKeyProvider
  private vcService: VCService

  private crypto: CryptoProvider
  constructor(crypto: CryptoProvider) {
    this.crypto = crypto
    this.didProvider = new DIDKeyProvider(crypto)
    this.vcService = new VCService(crypto)
  }

  async create(): Promise<{ identity: Identity; keyPair: KeyPair; encryptionKeyPair: KeyPair; mnemonic: string }> {
    const mnemonic = this.crypto.generateMnemonic()
    const seed = await this.crypto.mnemonicToSeed(mnemonic)
    const keyPair = await this.crypto.seedToKeyPair(seed)
    const encryptionKeyPair = await this.crypto.deriveEncryptionKeyPair(keyPair)
    const document = await this.didProvider.create(keyPair)
    return {
      identity: { did: document.id, document, credentials: [], capabilities: [] },
      keyPair,
      encryptionKeyPair,
      mnemonic
    }
  }

  async createFromMnemonic(
    mnemonic: string
  ): Promise<{ identity: Identity; keyPair: KeyPair; encryptionKeyPair: KeyPair }> {
    const seed = await this.crypto.mnemonicToSeed(mnemonic)
    const keyPair = await this.crypto.seedToKeyPair(seed)
    const encryptionKeyPair = await this.crypto.deriveEncryptionKeyPair(keyPair)
    const document = await this.didProvider.create(keyPair)
    return {
      identity: { did: document.id, document, credentials: [], capabilities: [] },
      keyPair,
      encryptionKeyPair
    }
  }

  async createFromOAuthRecovery(provider: string, token: string): Promise<{ identity: Identity; keyPair: KeyPair }> {
    // Derive a deterministic keypair from the provider + token combination
    const data = new TextEncoder().encode(`oauth-recovery:${provider}:${token}`)
    const salt = new TextEncoder().encode('harmony-oauth-recovery')
    const seed = await this.crypto.deriveKey(data, salt, `${provider}-recovery`)
    const keyPair = await this.crypto.seedToKeyPair(seed)
    const document = await this.didProvider.create(keyPair)

    // Issue a self-signed OAuth credential
    const credential = await this.vcService.issue({
      issuerDID: document.id,
      issuerKeyPair: keyPair,
      subjectDID: document.id,
      type: 'OAuthIdentityCredential',
      claims: { provider, recoveredViaOAuth: true }
    })

    return {
      identity: {
        did: document.id,
        document,
        credentials: [credential],
        capabilities: []
      },
      keyPair
    }
  }

  async addCredential(identity: Identity, credential: VerifiableCredential): Promise<Identity> {
    return { ...identity, credentials: [...identity.credentials, credential] }
  }

  async removeCredential(identity: Identity, credentialId: string): Promise<Identity> {
    return { ...identity, credentials: identity.credentials.filter((c) => c.id !== credentialId) }
  }

  getCredentials(identity: Identity, type?: string): VerifiableCredential[] {
    if (!type) return identity.credentials
    return identity.credentials.filter((c) => c.type.includes(type))
  }

  async addCapability(identity: Identity, capability: Capability): Promise<Identity> {
    return { ...identity, capabilities: [...identity.capabilities, capability] }
  }

  getCapabilities(identity: Identity, action?: string): Capability[] {
    if (!action) return identity.capabilities
    return identity.capabilities.filter((c) => c.allowedAction.includes(action))
  }

  async exportSyncPayload(identity: Identity, keyPair: KeyPair): Promise<EncryptedPayload> {
    const payload = JSON.stringify({
      did: identity.did,
      document: identity.document,
      credentials: identity.credentials,
      capabilities: identity.capabilities
    })
    const seed = keyPair.secretKey
    const key = await this.crypto.deriveKey(seed, new TextEncoder().encode('harmony-sync-salt-v1'), 'harmony-sync')
    return this.crypto.symmetricEncrypt(new TextEncoder().encode(payload), key)
  }

  async importSyncPayload(
    payload: EncryptedPayload,
    mnemonic: string
  ): Promise<{ identity: Identity; keyPair: KeyPair }> {
    const seed = await this.crypto.mnemonicToSeed(mnemonic)
    const keyPair = await this.crypto.seedToKeyPair(seed)
    const key = await this.crypto.deriveKey(
      keyPair.secretKey,
      new TextEncoder().encode('harmony-sync-salt-v1'),
      'harmony-sync'
    )
    const decrypted = await this.crypto.symmetricDecrypt(payload, key)
    const data = JSON.parse(new TextDecoder().decode(decrypted))
    return {
      identity: {
        did: data.did,
        document: data.document,
        credentials: data.credentials || [],
        capabilities: data.capabilities || []
      },
      keyPair
    }
  }

  async setupRecovery(params: {
    identity: Identity
    trustedDIDs: string[]
    threshold: number
    keyPair: KeyPair
  }): Promise<RecoveryConfig> {
    return {
      trustedDIDs: params.trustedDIDs,
      threshold: params.threshold,
      configuredBy: params.identity.did,
      configuredAt: new Date().toISOString()
    }
  }

  async initiateRecovery(params: {
    claimedDID: string
    recovererDID: string
    recoveryConfig: RecoveryConfig
  }): Promise<RecoveryRequest> {
    const id = 'recovery:' + Array.from(new Uint8Array(8), () => Math.random().toString(36)[2]).join('')
    return {
      id,
      claimedDID: params.claimedDID,
      recovererDID: params.recovererDID,
      config: params.recoveryConfig,
      createdAt: new Date().toISOString()
    }
  }

  async approveRecovery(params: {
    request: RecoveryRequest
    approverDID: string
    approverKeyPair: KeyPair
  }): Promise<RecoveryApproval> {
    if (!params.request.config.trustedDIDs.includes(params.approverDID)) {
      throw new Error('Approver is not a trusted DID')
    }

    const data = { requestId: params.request.id, approverDID: params.approverDID }
    const payload = JSON.stringify(data)
    const sig = await this.crypto.sign(new TextEncoder().encode(payload), params.approverKeyPair.secretKey)
    const { base58btcEncode } = await import('@harmony/did')

    return {
      requestId: params.request.id,
      approverDID: params.approverDID,
      approvedAt: new Date().toISOString(),
      proof: {
        type: 'Ed25519Signature2020',
        created: new Date().toISOString(),
        verificationMethod: `${params.approverDID}#${params.approverDID.replace('did:key:', '')}`,
        proofPurpose: 'authentication',
        proofValue: 'z' + base58btcEncode(sig)
      }
    }
  }

  async completeRecovery(params: {
    request: RecoveryRequest
    approvals: RecoveryApproval[]
    newKeyPair: KeyPair
  }): Promise<{ identity: Identity; keyPair: KeyPair }> {
    // Check threshold
    const uniqueApprovers = new Set(params.approvals.map((a) => a.approverDID))
    if (uniqueApprovers.size < params.request.config.threshold) {
      throw new Error('Insufficient approvals')
    }

    // Check all approvers are trusted
    for (const did of uniqueApprovers) {
      if (!params.request.config.trustedDIDs.includes(did)) {
        throw new Error(`Approver ${did} is not trusted`)
      }
    }

    // Check no duplicates
    if (params.approvals.length !== uniqueApprovers.size) {
      throw new Error('Duplicate approvals detected')
    }

    const document = await this.didProvider.create(params.newKeyPair)
    return {
      identity: { did: document.id, document, credentials: [], capabilities: [] },
      keyPair: params.newKeyPair
    }
  }

  toQuads(identity: Identity): Quad[] {
    const quads: Quad[] = []
    quads.push(...didDocumentToQuads(identity.document))
    // Add credential references
    for (const cred of identity.credentials) {
      quads.push({
        subject: identity.did,
        predicate: 'https://harmony.example/vocab#hasCredential',
        object: cred.id,
        graph: identity.did
      })
    }
    return quads
  }

  fromQuads(quads: Quad[]): Identity {
    const doc = didDocumentFromQuads(quads)
    if (!doc) throw new Error('Could not reconstruct DID Document from quads')
    return { did: doc.id, document: doc, credentials: [], capabilities: [] }
  }
}
