import type { CryptoProvider, KeyPair } from '@harmony/crypto'
import type { VerifiableCredential } from '@harmony/vc'
import { VCService } from '@harmony/vc'
import type { CredentialTypeRegistry, CredentialType, SchemaField } from './type-registry.js'

export class CredentialIssuer {
  private vcService: VCService
  private registry: CredentialTypeRegistry

  constructor(crypto: CryptoProvider, registry: CredentialTypeRegistry) {
    this.vcService = new VCService(crypto)
    this.registry = registry
  }

  async issueCredential(
    typeId: string,
    fields: Record<string, unknown>,
    issuerDID: string,
    issuerKeyPair: KeyPair,
    subjectDID: string,
    communityId: string,
    issuerRoles?: string[]
  ): Promise<VerifiableCredential> {
    const credType = await this.registry.getType(typeId)
    if (!credType) throw new Error('Credential type not found')
    if (!credType.active) throw new Error('Credential type is deactivated')

    // Validate fields against schema
    this.validateFields(fields, credType)

    // Check issuer policy
    this.checkIssuerPolicy(credType, issuerDID, issuerRoles)

    const vc = await this.vcService.issue({
      issuerDID,
      issuerKeyPair,
      subjectDID,
      type: credType.def.name.replace(/\s+/g, ''),
      claims: {
        ...fields,
        credentialTypeId: typeId,
        communityId,
        transferable: credType.def.transferable
      }
    })

    this.registry.incrementIssuedCount(typeId)

    return vc
  }

  private validateFields(fields: Record<string, unknown>, credType: CredentialType): void {
    const schema = credType.def.schema

    for (const field of schema.fields) {
      if (field.required && !(field.name in fields)) {
        throw new Error(`Missing required field: ${field.name}`)
      }
      if (field.name in fields) {
        this.validateFieldType(field, fields[field.name])
      }
    }
  }

  private validateFieldType(field: SchemaField, value: unknown): void {
    switch (field.type) {
      case 'string':
        if (typeof value !== 'string') throw new Error(`Field ${field.name} must be a string`)
        break
      case 'number':
        if (typeof value !== 'number') throw new Error(`Field ${field.name} must be a number`)
        break
      case 'boolean':
        if (typeof value !== 'boolean') throw new Error(`Field ${field.name} must be a boolean`)
        break
      case 'date':
        if (typeof value !== 'string' || isNaN(Date.parse(value as string)))
          throw new Error(`Field ${field.name} must be a valid date`)
        break
      case 'did':
        if (typeof value !== 'string' || !value.startsWith('did:')) throw new Error(`Field ${field.name} must be a DID`)
        break
      case 'url':
        if (typeof value !== 'string') throw new Error(`Field ${field.name} must be a URL`)
        try {
          new URL(value as string)
        } catch {
          throw new Error(`Field ${field.name} must be a valid URL`)
        }
        break
    }
  }

  private checkIssuerPolicy(credType: CredentialType, issuerDID: string, issuerRoles?: string[]): void {
    const policy = credType.def.issuerPolicy
    if (policy.kind === 'admin-only') {
      if (!issuerRoles || !issuerRoles.includes('admin')) {
        throw new Error('Only admins can issue this credential type')
      }
    } else if (policy.kind === 'role-based') {
      const requiredRole = policy.requiredRole
      if (requiredRole && (!issuerRoles || !issuerRoles.includes(requiredRole))) {
        throw new Error(`Issuer must have role: ${requiredRole}`)
      }
    } else if (policy.kind === 'self-attest') {
      // Self-attestation: anyone can self-attest, no role check needed
      void issuerDID // Will be used to verify issuer === subject when enforcement is added
    } else if (policy.kind === 'peer-attest') {
      // Peer attestation: issuer must be a community member (not self)
      // requiredAttestations is enforced at presentation time, not issuance
      void issuerDID
    }
    // 'anyone' policies pass through
  }
}
