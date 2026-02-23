import type { KeyPair, CryptoProvider } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import type { VerifiableCredential } from '@harmony/vc'
import { VCService } from '@harmony/vc'
import { IdentityManager, type Identity } from '@harmony/identity'

export interface CloudIdentityResult {
  identity: Identity
  keyPair: KeyPair
  mnemonic: string
}

export class CloudIdentityService {
  private identityManager: IdentityManager
  private vcService: VCService
  private didProvider: DIDKeyProvider
  private crypto: CryptoProvider

  private cloudKeyPair!: KeyPair
  private cloudDID!: string
  private identities: Map<string, { identity: Identity; keyPair: KeyPair }> = new Map()

  constructor(crypto: CryptoProvider) {
    this.crypto = crypto
    this.identityManager = new IdentityManager(crypto)
    this.vcService = new VCService(crypto)
    this.didProvider = new DIDKeyProvider(crypto)
  }

  async initialize(): Promise<void> {
    this.cloudKeyPair = await this.crypto.generateSigningKeyPair()
    const doc = await this.didProvider.create(this.cloudKeyPair)
    this.cloudDID = doc.id
  }

  getCloudDID(): string {
    return this.cloudDID
  }

  getCloudKeyPair(): KeyPair {
    return this.cloudKeyPair
  }

  async createIdentity(): Promise<CloudIdentityResult> {
    const result = await this.identityManager.create()
    this.identities.set(result.identity.did, { identity: result.identity, keyPair: result.keyPair })
    return result
  }

  async resolveIdentity(did: string): Promise<Identity | null> {
    return this.identities.get(did)?.identity ?? null
  }

  async issueIdentityCredential(params: {
    subjectDID: string
    type: string
    claims: Record<string, unknown>
    expirationDate?: string
  }): Promise<VerifiableCredential> {
    if (!this.cloudKeyPair) throw new Error('Cloud identity service not initialized')
    return this.vcService.issue({
      issuerDID: this.cloudDID,
      issuerKeyPair: this.cloudKeyPair,
      subjectDID: params.subjectDID,
      type: params.type,
      claims: params.claims,
      expirationDate: params.expirationDate
    })
  }

  async verifyCredential(vc: VerifiableCredential): Promise<boolean> {
    const result = await this.vcService.verify(vc, (did) => this.didProvider.resolve(did))
    return result.valid
  }

  getIdentityManager(): IdentityManager {
    return this.identityManager
  }

  getVCService(): VCService {
    return this.vcService
  }

  getDIDProvider(): DIDKeyProvider {
    return this.didProvider
  }
}
