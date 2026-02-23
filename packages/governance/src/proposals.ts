import { randomBytes } from '@harmony/crypto'
import type { Quad, QuadStore } from '@harmony/quads'
import { HarmonyType, HarmonyPredicate, RDFPredicate, XSDDatatype } from '@harmony/vocab'
import type { Proof } from '@harmony/protocol'
import { evaluateQuorum } from './quorum.js'
import { executeActions } from './execution.js'

export interface ProposalDef {
  communityId: string
  title: string
  description: string
  actions: ProposedAction[]
  quorum: QuorumRequirement
  votingPeriod: number
  executionDelay: number
  contestPeriod: number
}

export interface ProposedAction {
  kind:
    | 'delegate-capability'
    | 'revoke-capability'
    | 'create-role'
    | 'update-rule'
    | 'create-channel'
    | 'delete-channel'
    | 'update-constitution'
  params: Record<string, unknown>
}

export type ProposalStatus = 'pending' | 'active' | 'passed' | 'executed' | 'rejected' | 'cancelled' | 'contested'

export interface Proposal {
  id: string
  communityId: string
  def: ProposalDef
  status: ProposalStatus
  createdBy: string
  createdAt: string
  signatures: ProposalSignature[]
  quorumMet: boolean
  quorumMetAt?: string
  executionScheduledAt?: string
  executedAt?: string
  result?: ExecutionResult
}

export interface ProposalSignature {
  signerDID: string
  signedAt: string
  proof: Proof
  vote: 'approve' | 'reject'
}

export interface QuorumRequirement {
  kind: 'threshold' | 'percentage' | 'role-weighted'
  threshold?: number
  percentage?: number
  eligibleRole?: string
  weights?: Record<string, number>
}

export interface ExecutionResult {
  success: boolean
  actionsExecuted: number
  actionsTotal: number
  errors?: string[]
  capabilitiesCreated?: string[]
  capabilitiesRevoked?: string[]
}

function generateId(): string {
  const bytes = randomBytes(16)
  return 'proposal-' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export class GovernanceEngine {
  private proposals = new Map<string, Proposal>()
  private store: QuadStore
  private totalEligible: number
  private voterRoles: Map<string, string[]>

  constructor(store: QuadStore, opts?: { totalEligible?: number; voterRoles?: Map<string, string[]> }) {
    this.store = store
    this.totalEligible = opts?.totalEligible ?? 10
    this.voterRoles = opts?.voterRoles ?? new Map()
  }

  async createProposal(def: ProposalDef, creatorDID: string): Promise<Proposal> {
    const id = generateId()
    const now = new Date().toISOString()

    const proposal: Proposal = {
      id,
      communityId: def.communityId,
      def,
      status: 'active',
      createdBy: creatorDID,
      createdAt: now,
      signatures: [],
      quorumMet: false
    }

    this.proposals.set(id, proposal)

    // Store as RDF
    const graph = `community:${def.communityId}`
    const subject = `harmony:${id}`
    const quads: Quad[] = [
      { subject, predicate: RDFPredicate.type, object: HarmonyType.Proposal, graph },
      { subject, predicate: HarmonyPredicate.name, object: { value: def.title, datatype: XSDDatatype.string }, graph },
      {
        subject,
        predicate: HarmonyPredicate.proposalStatus,
        object: { value: 'active', datatype: XSDDatatype.string },
        graph
      },
      {
        subject,
        predicate: HarmonyPredicate.quorumKind,
        object: { value: def.quorum.kind, datatype: XSDDatatype.string },
        graph
      },
      {
        subject,
        predicate: HarmonyPredicate.votingPeriod,
        object: { value: String(def.votingPeriod), datatype: XSDDatatype.integer },
        graph
      }
    ]
    if (def.quorum.threshold) {
      quads.push({
        subject,
        predicate: HarmonyPredicate.quorumThreshold,
        object: { value: String(def.quorum.threshold), datatype: XSDDatatype.integer },
        graph
      })
    }
    await this.store.addAll(quads)

    return proposal
  }

  async getProposal(proposalId: string): Promise<Proposal | null> {
    return this.proposals.get(proposalId) ?? null
  }

  async listProposals(communityId: string, status?: ProposalStatus): Promise<Proposal[]> {
    return Array.from(this.proposals.values()).filter(
      (p) => p.communityId === communityId && (!status || p.status === status)
    )
  }

  async signProposal(proposalId: string, signerDID: string, proof: Proof, vote: 'approve' | 'reject'): Promise<void> {
    const proposal = this.proposals.get(proposalId)
    if (!proposal) throw new Error('Proposal not found')
    if (proposal.status !== 'active') throw new Error('Proposal is not active')

    // Reject duplicates
    if (proposal.signatures.find((s) => s.signerDID === signerDID)) {
      throw new Error('Already signed')
    }

    proposal.signatures.push({
      signerDID,
      signedAt: new Date().toISOString(),
      proof,
      vote
    })

    // Check quorum
    const met = evaluateQuorum(proposal.def.quorum, proposal.signatures, {
      totalEligible: this.totalEligible,
      voterRoles: this.voterRoles
    })

    if (met && !proposal.quorumMet) {
      proposal.quorumMet = true
      proposal.quorumMetAt = new Date().toISOString()
      proposal.status = 'passed'

      if (proposal.def.executionDelay > 0) {
        proposal.executionScheduledAt = new Date(Date.now() + proposal.def.executionDelay * 1000).toISOString()
      }
    }
  }

  async executeProposal(proposalId: string): Promise<ExecutionResult> {
    const proposal = this.proposals.get(proposalId)
    if (!proposal) throw new Error('Proposal not found')
    if (proposal.status !== 'passed') throw new Error('Proposal is not passed')

    const result = executeActions(proposal.def.actions)
    proposal.result = result
    proposal.status = 'executed'
    proposal.executedAt = new Date().toISOString()

    return result
  }

  async cancelProposal(proposalId: string): Promise<void> {
    const proposal = this.proposals.get(proposalId)
    if (!proposal) throw new Error('Proposal not found')
    proposal.status = 'cancelled'
  }

  async contestProposal(proposalId: string): Promise<void> {
    const proposal = this.proposals.get(proposalId)
    if (!proposal) throw new Error('Proposal not found')
    if (proposal.status !== 'passed') throw new Error('Can only contest passed proposals')
    proposal.status = 'contested'
  }

  rejectExpiredProposals(): void {
    const now = Date.now()
    for (const [, proposal] of this.proposals) {
      if (proposal.status === 'active') {
        const createdTime = new Date(proposal.createdAt).getTime()
        if (now - createdTime > proposal.def.votingPeriod * 1000) {
          proposal.status = 'rejected'
        }
      }
    }
  }

  setTotalEligible(n: number): void {
    this.totalEligible = n
  }

  setVoterRoles(roles: Map<string, string[]>): void {
    this.voterRoles = roles
  }
}
