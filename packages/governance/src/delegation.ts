import { randomBytes } from '@harmony/crypto'
import type { Quad, QuadStore } from '@harmony/quads'
import { HarmonyType, HarmonyPredicate, RDFPredicate, XSDDatatype } from '@harmony/vocab'

export interface UserDelegation {
  id: string
  fromDID: string
  toDID: string
  capabilities: string[]
  createdAt: string
  expiresAt?: string
  revocable: boolean
  reason?: string
  active: boolean
}

export interface DelegationOptions {
  expiresIn?: number
  reason?: string
  attenuate?: string[]
}

function generateId(): string {
  const bytes = randomBytes(16)
  return 'delegation-' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export class DelegationManager {
  private delegations = new Map<string, UserDelegation>()
  private store: QuadStore
  private userCapabilities: Map<string, Set<string>>

  constructor(store: QuadStore, userCapabilities?: Map<string, Set<string>>) {
    this.store = store
    this.userCapabilities = userCapabilities ?? new Map()
  }

  async createDelegation(
    fromDID: string,
    toDID: string,
    capabilities: string[],
    opts?: DelegationOptions
  ): Promise<UserDelegation> {
    // Verify delegator has the capabilities
    const held = this.userCapabilities.get(fromDID) ?? new Set()
    for (const cap of capabilities) {
      if (!held.has(cap)) {
        throw new Error(`Cannot delegate capability not held: ${cap}`)
      }
    }

    // Apply attenuation
    let delegatedCaps = capabilities
    if (opts?.attenuate) {
      delegatedCaps = capabilities.filter((c) => opts.attenuate!.includes(c))
    }

    const id = generateId()
    const now = new Date()

    const delegation: UserDelegation = {
      id,
      fromDID,
      toDID,
      capabilities: delegatedCaps,
      createdAt: now.toISOString(),
      expiresAt:
        opts?.expiresIn !== undefined ? new Date(now.getTime() + opts.expiresIn * 1000).toISOString() : undefined,
      revocable: true,
      reason: opts?.reason,
      active: true
    }

    this.delegations.set(id, delegation)

    // Add capabilities to delegatee
    if (!this.userCapabilities.has(toDID)) {
      this.userCapabilities.set(toDID, new Set())
    }
    for (const cap of delegatedCaps) {
      this.userCapabilities.get(toDID)!.add(cap)
    }

    // Store as RDF
    const graph = `community:default`
    const subject = `harmony:${id}`
    const quads: Quad[] = [
      { subject, predicate: RDFPredicate.type, object: HarmonyType.UserDelegation, graph },
      { subject, predicate: HarmonyPredicate.fromDID, object: fromDID, graph },
      { subject, predicate: HarmonyPredicate.toDID, object: toDID, graph }
    ]
    if (delegation.reason) {
      quads.push({
        subject,
        predicate: HarmonyPredicate.reason,
        object: { value: delegation.reason, datatype: XSDDatatype.string },
        graph
      })
    }
    await this.store.addAll(quads)

    return delegation
  }

  async revokeDelegation(delegationId: string): Promise<void> {
    const delegation = this.delegations.get(delegationId)
    if (!delegation) throw new Error('Delegation not found')
    delegation.active = false

    // Remove capabilities from delegatee
    const caps = this.userCapabilities.get(delegation.toDID)
    if (caps) {
      for (const cap of delegation.capabilities) {
        caps.delete(cap)
      }
    }
  }

  async listDelegationsFrom(did: string): Promise<UserDelegation[]> {
    return Array.from(this.delegations.values()).filter((d) => d.fromDID === did)
  }

  async listDelegationsTo(did: string): Promise<UserDelegation[]> {
    return Array.from(this.delegations.values()).filter((d) => d.toDID === did)
  }

  async getActiveDelegation(delegationId: string): Promise<UserDelegation | null> {
    const d = this.delegations.get(delegationId)
    if (!d || !d.active) return null
    if (d.expiresAt && new Date(d.expiresAt) < new Date()) {
      d.active = false
      return null
    }
    return d
  }

  hasCapability(did: string, capability: string): boolean {
    return this.userCapabilities.get(did)?.has(capability) ?? false
  }
}
