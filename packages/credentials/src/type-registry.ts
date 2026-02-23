import { randomBytes } from '@harmony/crypto'
import type { Quad, QuadStore } from '@harmony/quads'
import { HarmonyType, HarmonyPredicate, RDFPredicate, XSDDatatype } from '@harmony/vocab'

export interface CredentialTypeDef {
  name: string
  description: string
  schema: CredentialSchema
  issuerPolicy: IssuerPolicy
  displayConfig: DisplayConfig
  revocable: boolean
  transferable: boolean
}

export interface CredentialSchema {
  fields: SchemaField[]
}

export interface SchemaField {
  name: string
  type: 'string' | 'number' | 'boolean' | 'date' | 'did' | 'url'
  required: boolean
  description?: string
}

export interface IssuerPolicy {
  kind: 'admin-only' | 'role-based' | 'self-attest' | 'peer-attest'
  requiredRole?: string
  requiredAttestations?: number
}

export interface DisplayConfig {
  badgeEmoji?: string
  badgeColor?: string
  showInMemberList: boolean
  showOnMessages: boolean
  priority: number
}

export interface CredentialType {
  id: string
  communityId: string
  def: CredentialTypeDef
  createdAt: string
  createdBy: string
  active: boolean
  issuedCount: number
}

function generateId(): string {
  const bytes = randomBytes(16)
  return 'cred-type-' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export class CredentialTypeRegistry {
  private types = new Map<string, CredentialType>()
  private store: QuadStore

  constructor(store: QuadStore) {
    this.store = store
  }

  async registerType(communityId: string, typeDef: CredentialTypeDef, creatorDID: string): Promise<CredentialType> {
    this.validateSchema(typeDef.schema)

    const id = generateId()
    const credType: CredentialType = {
      id,
      communityId,
      def: typeDef,
      createdAt: new Date().toISOString(),
      createdBy: creatorDID,
      active: true,
      issuedCount: 0
    }

    this.types.set(id, credType)

    // Store as RDF
    const graph = `community:${communityId}`
    const subject = `harmony:${id}`
    const quads: Quad[] = [
      { subject, predicate: RDFPredicate.type, object: HarmonyType.CredentialType, graph },
      {
        subject,
        predicate: HarmonyPredicate.name,
        object: { value: typeDef.name, datatype: XSDDatatype.string },
        graph
      },
      {
        subject,
        predicate: HarmonyPredicate.issuerPolicy,
        object: { value: typeDef.issuerPolicy.kind, datatype: XSDDatatype.string },
        graph
      },
      {
        subject,
        predicate: HarmonyPredicate.transferable,
        object: { value: String(typeDef.transferable), datatype: XSDDatatype.boolean },
        graph
      }
    ]
    if (typeDef.displayConfig.badgeEmoji) {
      quads.push({
        subject,
        predicate: HarmonyPredicate.badgeEmoji,
        object: { value: typeDef.displayConfig.badgeEmoji, datatype: XSDDatatype.string },
        graph
      })
    }
    await this.store.addAll(quads)

    return credType
  }

  async getType(typeId: string): Promise<CredentialType | null> {
    return this.types.get(typeId) ?? null
  }

  async listTypes(communityId: string): Promise<CredentialType[]> {
    return Array.from(this.types.values()).filter((t) => t.communityId === communityId)
  }

  async deactivateType(typeId: string): Promise<void> {
    const t = this.types.get(typeId)
    if (t) t.active = false
  }

  incrementIssuedCount(typeId: string): void {
    const t = this.types.get(typeId)
    if (t) t.issuedCount++
  }

  private validateSchema(schema: CredentialSchema): void {
    const validTypes = ['string', 'number', 'boolean', 'date', 'did', 'url']
    for (const field of schema.fields) {
      if (!validTypes.includes(field.type)) {
        throw new Error(`Invalid field type: ${field.type}`)
      }
      if (!field.name || field.name.trim() === '') {
        throw new Error('Field name is required')
      }
    }
  }
}
