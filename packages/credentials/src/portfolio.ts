import type { VerifiableCredential, VerifiablePresentation } from '@harmony/vc'
import { VCService } from '@harmony/vc'
import type { CryptoProvider, KeyPair } from '@harmony/crypto'
import type { Quad } from '@harmony/quads'

export interface HeldCredential {
  id: string
  type: string
  typeName: string
  issuer: string
  issuedAt: string
  expiresAt?: string
  status: 'active' | 'expired' | 'revoked'
  community?: string
  fields: Record<string, unknown>
  transferable: boolean
}

export class VCPortfolio {
  private credentials = new Map<string, { vc: VerifiableCredential; held: HeldCredential }>()
  private revokedIds = new Set<string>()
  private vcService: VCService

  constructor(crypto: CryptoProvider) {
    this.vcService = new VCService(crypto)
  }

  async listCredentials(did: string): Promise<HeldCredential[]> {
    const results: HeldCredential[] = []
    for (const [, entry] of this.credentials) {
      if (entry.vc.credentialSubject.id === did) {
        // Update status
        entry.held.status = this.getStatus(entry.vc, entry.held.id)
        results.push(entry.held)
      }
    }
    return results
  }

  async presentCredentials(
    credentialIds: string[],
    holderDID: string,
    holderKeyPair: KeyPair
  ): Promise<VerifiablePresentation> {
    const vcs: VerifiableCredential[] = []
    for (const id of credentialIds) {
      const entry = this.credentials.get(id)
      if (!entry) throw new Error(`Credential ${id} not found`)
      vcs.push(entry.vc)
    }

    return this.vcService.present({
      holderDID,
      holderKeyPair,
      credentials: vcs
    })
  }

  async importCredential(vc: VerifiableCredential): Promise<void> {
    const held: HeldCredential = {
      id: vc.id,
      type: vc.type.join(','),
      typeName: vc.type[vc.type.length - 1] || 'Unknown',
      issuer: vc.issuer,
      issuedAt: vc.issuanceDate,
      expiresAt: vc.expirationDate,
      status: this.getStatus(vc, vc.id),
      community: vc.credentialSubject.communityId as string | undefined,
      fields: vc.credentialSubject,
      transferable: (vc.credentialSubject.transferable as boolean) ?? false
    }
    this.credentials.set(vc.id, { vc, held })
  }

  async exportPortfolio(did: string, format: 'json-ld' | 'n-quads'): Promise<string> {
    const creds = await this.listCredentials(did)
    const vcs = creds.map((c) => this.credentials.get(c.id)!.vc)

    if (format === 'json-ld') {
      return JSON.stringify(
        {
          '@context': ['https://www.w3.org/2018/credentials/v1'],
          type: 'VerifiableCredentialPortfolio',
          holder: did,
          credentials: vcs
        },
        null,
        2
      )
    }

    // N-Quads format
    const lines: string[] = []
    for (const vc of vcs) {
      lines.push(
        `<${vc.id}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://www.w3.org/2018/credentials#VerifiableCredential> .`
      )
      lines.push(`<${vc.id}> <https://www.w3.org/2018/credentials#issuer> <${vc.issuer}> .`)
      lines.push(
        `<${vc.id}> <https://www.w3.org/2018/credentials#issuanceDate> "${vc.issuanceDate}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .`
      )
    }
    return lines.join('\n')
  }

  async revokeCredential(credentialId: string): Promise<void> {
    this.revokedIds.add(credentialId)
    const entry = this.credentials.get(credentialId)
    if (entry) {
      entry.held.status = 'revoked'
    }
  }

  async filterByStatus(did: string, status: 'active' | 'expired' | 'revoked'): Promise<HeldCredential[]> {
    const all = await this.listCredentials(did)
    return all.filter((c) => c.status === status)
  }

  private getStatus(vc: VerifiableCredential, id: string): 'active' | 'expired' | 'revoked' {
    if (this.revokedIds.has(id)) return 'revoked'
    if (vc.expirationDate && new Date(vc.expirationDate) < new Date()) return 'expired'
    return 'active'
  }
}
