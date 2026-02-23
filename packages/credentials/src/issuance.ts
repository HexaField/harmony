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
    communityId: string
  ): Promise<VerifiableCredential> {
    const credType = await this.registry.getType(typeId)
    if (!credType) throw new Error('Credential type not found')
    if (!credType.active) throw new Error('Credential type is deactivated')

    // Validate fields against schema
    this.validateFields(fields, credType)

    // Check issuer policy
    this.checkIssuerPolicy(credType, issuerDID)

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

  private checkIssuerPolicy(credType: CredentialType, _issuerDID: string): void {
    // In production, verify issuer has the appropriate role/capability
    // For now, we trust the caller to provide proper authorization
    const policy = credType.def.issuerPolicy
    if (policy.kind === 'admin-only' || policy.kind === 'role-based') {
      // Caller must have verified admin/role ZCAP before calling
    }
  }
}
