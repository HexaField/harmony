import type { QuorumRequirement, ProposalSignature } from './proposals.js'

export interface QuorumContext {
  totalEligible: number
  roleWeights?: Record<string, number>
  voterRoles?: Map<string, string[]>
}

export function evaluateQuorum(
  requirement: QuorumRequirement,
  signatures: ProposalSignature[],
  context: QuorumContext
): boolean {
  const approvals = signatures.filter((s) => s.vote === 'approve')

  switch (requirement.kind) {
    case 'threshold':
      return approvals.length >= (requirement.threshold ?? 1)

    case 'percentage': {
      const pct = (approvals.length / context.totalEligible) * 100
      return pct >= (requirement.percentage ?? 50)
    }

    case 'role-weighted': {
      if (!requirement.weights || !context.voterRoles) return false
      let totalWeight = 0
      for (const sig of approvals) {
        const roles = context.voterRoles.get(sig.signerDID) ?? []
        for (const role of roles) {
          totalWeight += requirement.weights[role] ?? 0
        }
      }
      return totalWeight >= (requirement.threshold ?? 1)
    }

    default:
      return false
  }
}
