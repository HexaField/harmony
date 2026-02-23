import type { VerifiableCredential, DIDResolver } from '@harmony/vc'
import { VCService } from '@harmony/vc'
import type { CryptoProvider } from '@harmony/crypto'

export class CrossCommunityService {
  private vcService: VCService

  constructor(crypto: CryptoProvider) {
    this.vcService = new VCService(crypto)
  }

  isTransferable(vc: VerifiableCredential): boolean {
    return (vc.credentialSubject.transferable as boolean) ?? false
  }

  async verifyTransferredCredential(
    vc: VerifiableCredential,
    resolver: DIDResolver
  ): Promise<{ valid: boolean; recognized: boolean }> {
    const result = await this.vcService.verify(vc, resolver)
    const recognized = vc.credentialSubject.communityId !== undefined

    return {
      valid: result.valid,
      recognized
    }
  }

  filterTransferable(vcs: VerifiableCredential[]): VerifiableCredential[] {
    return vcs.filter((vc) => this.isTransferable(vc))
  }
}
