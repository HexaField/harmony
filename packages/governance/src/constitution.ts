import type { QuadStore, Quad } from '@harmony/quads'
import { HarmonyType, HarmonyPredicate, RDFPredicate, XSDDatatype } from '@harmony/vocab'
import type { ProposedAction } from './proposals.js'

export interface ConstitutionDoc {
  communityId: string
  rules: ConstitutionRule[]
  ratifiedAt: string
  ratifiedBy: string[]
  version: number
}

export interface ConstitutionRule {
  id: string
  description: string
  constraint: Constraint
  immutable: boolean
}

export interface Constraint {
  kind: 'require-quorum' | 'forbid-action' | 'require-role' | 'rate-limit' | 'max-count'
  params: Record<string, unknown>
}

export interface ConstitutionCheck {
  allowed: boolean
  violations: string[]
  warnings: string[]
}

export interface ConstitutionUpdate {
  addRules?: ConstitutionRule[]
  removeRuleIds?: string[]
  modifyRules?: { id: string; updates: Partial<ConstitutionRule> }[]
}

export class Constitution {
  private constitutions = new Map<string, ConstitutionDoc>()
  private store: QuadStore

  constructor(store: QuadStore) {
    this.store = store
  }

  async createConstitution(
    communityId: string,
    rules: ConstitutionRule[],
    ratifiedBy: string[]
  ): Promise<ConstitutionDoc> {
    const doc: ConstitutionDoc = {
      communityId,
      rules,
      ratifiedAt: new Date().toISOString(),
      ratifiedBy,
      version: 1
    }
    this.constitutions.set(communityId, doc)

    // Store as RDF
    const graph = `community:${communityId}`
    const subject = `harmony:constitution-${communityId}`
    const quads: Quad[] = [
      { subject, predicate: RDFPredicate.type, object: HarmonyType.Constitution, graph },
      { subject, predicate: HarmonyPredicate.version, object: { value: '1', datatype: XSDDatatype.integer }, graph }
    ]
    await this.store.addAll(quads)

    return doc
  }

  async getCommunityConstitution(communityId: string): Promise<ConstitutionDoc | null> {
    return this.constitutions.get(communityId) ?? null
  }

  async updateConstitution(communityId: string, update: ConstitutionUpdate): Promise<void> {
    const doc = this.constitutions.get(communityId)
    if (!doc) throw new Error('Constitution not found')

    if (update.removeRuleIds) {
      for (const ruleId of update.removeRuleIds) {
        const rule = doc.rules.find((r) => r.id === ruleId)
        if (rule?.immutable) {
          throw new Error(`Cannot remove immutable rule: ${ruleId}`)
        }
        doc.rules = doc.rules.filter((r) => r.id !== ruleId)
      }
    }

    if (update.modifyRules) {
      for (const mod of update.modifyRules) {
        const rule = doc.rules.find((r) => r.id === mod.id)
        if (rule) {
          if (rule.immutable) throw new Error(`Cannot modify immutable rule: ${mod.id}`)
          Object.assign(rule, mod.updates)
        }
      }
    }

    if (update.addRules) {
      doc.rules.push(...update.addRules)
    }

    doc.version++
  }

  validateAction(communityId: string, action: ProposedAction): ConstitutionCheck {
    const doc = this.constitutions.get(communityId)
    if (!doc) return { allowed: true, violations: [], warnings: [] }

    const violations: string[] = []
    const warnings: string[] = []

    for (const rule of doc.rules) {
      switch (rule.constraint.kind) {
        case 'forbid-action':
          if (rule.constraint.params.action === action.kind) {
            violations.push(rule.id)
          }
          break
        case 'require-role':
          // Would check if actor has required role
          break
        case 'require-quorum':
          warnings.push(rule.id)
          break
        case 'rate-limit': {
          // Would check rate
          break
        }
        case 'max-count': {
          const max = rule.constraint.params.max as number
          const current = (rule.constraint.params.current as number) ?? 0
          if (action.kind === 'create-channel' && current >= max) {
            violations.push(rule.id)
          }
          break
        }
      }
    }

    return {
      allowed: violations.length === 0,
      violations,
      warnings
    }
  }
}
