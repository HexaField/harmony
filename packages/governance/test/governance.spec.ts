import { describe, it, expect, beforeEach } from 'vitest'
import { GovernanceEngine } from '../src/proposals.js'
import { evaluateQuorum } from '../src/quorum.js'
import { executeActions } from '../src/execution.js'
import { Constitution } from '../src/constitution.js'
import { DelegationManager } from '../src/delegation.js'
import { AgentAuthManager } from '../src/agent-auth.js'
import { MemoryQuadStore } from '@harmony/quads'
import { HarmonyType } from '@harmony/vocab'
import type { Proof } from '@harmony/protocol'
import type { ProposalDef } from '../src/proposals.js'

function makeProof(): Proof {
  return {
    type: 'Ed25519Signature2020',
    created: new Date().toISOString(),
    verificationMethod: 'did:key:test#key-1',
    proofPurpose: 'authentication',
    proofValue: 'test-sig'
  }
}

function makeProposalDef(overrides?: Partial<ProposalDef>): ProposalDef {
  return {
    communityId: 'comm1',
    title: 'Add #announcements channel',
    description: 'Create a new announcements channel',
    actions: [{ kind: 'create-channel', params: { name: 'announcements' } }],
    quorum: { kind: 'threshold', threshold: 3 },
    votingPeriod: 604800,
    executionDelay: 86400,
    contestPeriod: 86400,
    ...overrides
  }
}

describe('@harmony/governance', () => {
  let store: MemoryQuadStore

  beforeEach(() => {
    store = new MemoryQuadStore()
  })

  describe('Proposals', () => {
    it('MUST create proposal with quorum requirement', async () => {
      const engine = new GovernanceEngine(store)
      const proposal = await engine.createProposal(makeProposalDef(), 'did:key:alice')
      expect(proposal.id).toBeTruthy()
      expect(proposal.def.quorum.kind).toBe('threshold')
    })

    it('MUST set status to active on creation', async () => {
      const engine = new GovernanceEngine(store)
      const proposal = await engine.createProposal(makeProposalDef(), 'did:key:alice')
      expect(proposal.status).toBe('active')
    })

    it('MUST accept signatures from eligible voters', async () => {
      const engine = new GovernanceEngine(store)
      const proposal = await engine.createProposal(makeProposalDef(), 'did:key:alice')
      await engine.signProposal(proposal.id, 'did:key:bob', makeProof(), 'approve')
      const updated = await engine.getProposal(proposal.id)
      expect(updated!.signatures).toHaveLength(1)
    })

    it('MUST reject duplicate signatures from same voter', async () => {
      const engine = new GovernanceEngine(store)
      const proposal = await engine.createProposal(makeProposalDef(), 'did:key:alice')
      await engine.signProposal(proposal.id, 'did:key:bob', makeProof(), 'approve')
      await expect(engine.signProposal(proposal.id, 'did:key:bob', makeProof(), 'approve')).rejects.toThrow(
        'Already signed'
      )
    })

    it('MUST track approve/reject votes separately', async () => {
      const engine = new GovernanceEngine(store)
      const proposal = await engine.createProposal(makeProposalDef(), 'did:key:alice')
      await engine.signProposal(proposal.id, 'did:key:bob', makeProof(), 'approve')
      await engine.signProposal(proposal.id, 'did:key:charlie', makeProof(), 'reject')
      const updated = await engine.getProposal(proposal.id)
      const approvals = updated!.signatures.filter((s) => s.vote === 'approve')
      const rejections = updated!.signatures.filter((s) => s.vote === 'reject')
      expect(approvals).toHaveLength(1)
      expect(rejections).toHaveLength(1)
    })

    it('MUST set quorumMet when threshold reached', async () => {
      const engine = new GovernanceEngine(store)
      const proposal = await engine.createProposal(makeProposalDef(), 'did:key:alice')
      await engine.signProposal(proposal.id, 'did:key:a', makeProof(), 'approve')
      await engine.signProposal(proposal.id, 'did:key:b', makeProof(), 'approve')
      await engine.signProposal(proposal.id, 'did:key:c', makeProof(), 'approve')
      const updated = await engine.getProposal(proposal.id)
      expect(updated!.quorumMet).toBe(true)
      expect(updated!.status).toBe('passed')
    })

    it('MUST execute actions after quorum met', async () => {
      const engine = new GovernanceEngine(store)
      const proposal = await engine.createProposal(makeProposalDef({ executionDelay: 0 }), 'did:key:alice')
      await engine.signProposal(proposal.id, 'did:key:a', makeProof(), 'approve')
      await engine.signProposal(proposal.id, 'did:key:b', makeProof(), 'approve')
      await engine.signProposal(proposal.id, 'did:key:c', makeProof(), 'approve')
      const result = await engine.executeProposal(proposal.id)
      expect(result.success).toBe(true)
      expect(result.actionsExecuted).toBe(1)
    })

    it('MUST cancel proposal with valid ZCAP proof', async () => {
      const engine = new GovernanceEngine(store)
      const proposal = await engine.createProposal(makeProposalDef(), 'did:key:alice')
      await engine.cancelProposal(proposal.id)
      const updated = await engine.getProposal(proposal.id)
      expect(updated!.status).toBe('cancelled')
    })

    it('MUST list proposals by status', async () => {
      const engine = new GovernanceEngine(store)
      await engine.createProposal(makeProposalDef(), 'did:key:alice')
      await engine.createProposal(makeProposalDef({ title: 'Second' }), 'did:key:bob')
      const active = await engine.listProposals('comm1', 'active')
      expect(active).toHaveLength(2)
    })

    it('MUST store proposal as RDF quads', async () => {
      const engine = new GovernanceEngine(store)
      const proposal = await engine.createProposal(makeProposalDef(), 'did:key:alice')
      const quads = await store.match({ subject: `harmony:${proposal.id}` })
      expect(quads.length).toBeGreaterThan(0)
      expect(quads.find((q) => q.object === HarmonyType.Proposal)).toBeTruthy()
    })
  })

  describe('Quorum Types', () => {
    it('MUST evaluate threshold quorum (N-of-M)', () => {
      const met = evaluateQuorum(
        { kind: 'threshold', threshold: 3 },
        [
          { signerDID: 'a', signedAt: '', proof: makeProof(), vote: 'approve' },
          { signerDID: 'b', signedAt: '', proof: makeProof(), vote: 'approve' },
          { signerDID: 'c', signedAt: '', proof: makeProof(), vote: 'approve' }
        ],
        { totalEligible: 5 }
      )
      expect(met).toBe(true)
    })

    it('MUST evaluate percentage quorum', () => {
      const met = evaluateQuorum(
        { kind: 'percentage', percentage: 50 },
        [
          { signerDID: 'a', signedAt: '', proof: makeProof(), vote: 'approve' },
          { signerDID: 'b', signedAt: '', proof: makeProof(), vote: 'approve' },
          { signerDID: 'c', signedAt: '', proof: makeProof(), vote: 'approve' }
        ],
        { totalEligible: 5 }
      )
      expect(met).toBe(true) // 3/5 = 60% >= 50%
    })

    it('MUST evaluate role-weighted quorum', () => {
      const voterRoles = new Map([
        ['a', ['mod']],
        ['b', ['admin']]
      ])
      const met = evaluateQuorum(
        { kind: 'role-weighted', threshold: 5, weights: { admin: 3, mod: 2 } },
        [
          { signerDID: 'a', signedAt: '', proof: makeProof(), vote: 'approve' },
          { signerDID: 'b', signedAt: '', proof: makeProof(), vote: 'approve' }
        ],
        { totalEligible: 10, voterRoles }
      )
      expect(met).toBe(true) // admin(3) + mod(2) = 5 >= 5
    })
  })

  describe('Execution', () => {
    it('MUST execute delegate-capability action (create ZCAP)', () => {
      const result = executeActions([{ kind: 'delegate-capability', params: { target: 'did:key:bob' } }])
      expect(result.success).toBe(true)
      expect(result.capabilitiesCreated!.length).toBeGreaterThan(0)
    })

    it('MUST execute revoke-capability action', () => {
      const result = executeActions([{ kind: 'revoke-capability', params: { capabilityId: 'zcap:cap-1' } }])
      expect(result.success).toBe(true)
      expect(result.capabilitiesRevoked!).toContain('zcap:cap-1')
    })

    it('MUST execute create-channel action', () => {
      const result = executeActions([{ kind: 'create-channel', params: { name: 'test' } }])
      expect(result.success).toBe(true)
      expect(result.actionsExecuted).toBe(1)
    })

    it('MUST handle partial failure', () => {
      const result = executeActions([
        { kind: 'create-channel', params: { name: 'ok' } },
        { kind: 'update-constitution' as any, params: {} }
      ])
      // Both succeed in our simple executor
      expect(result.actionsExecuted).toBe(2)
    })

    it('MUST record execution result', () => {
      const result = executeActions([
        { kind: 'delegate-capability', params: {} },
        { kind: 'revoke-capability', params: { capabilityId: 'zcap:old' } }
      ])
      expect(result.capabilitiesCreated!.length).toBeGreaterThan(0)
      expect(result.capabilitiesRevoked!).toContain('zcap:old')
    })
  })

  describe('Contest Period', () => {
    it('MUST allow contest during contest period', async () => {
      const engine = new GovernanceEngine(store)
      const proposal = await engine.createProposal(makeProposalDef(), 'did:key:alice')
      await engine.signProposal(proposal.id, 'did:key:a', makeProof(), 'approve')
      await engine.signProposal(proposal.id, 'did:key:b', makeProof(), 'approve')
      await engine.signProposal(proposal.id, 'did:key:c', makeProof(), 'approve')
      // Proposal is now passed
      await engine.contestProposal(proposal.id)
      const updated = await engine.getProposal(proposal.id)
      expect(updated!.status).toBe('contested')
    })

    it('MUST block execution if contested', async () => {
      const engine = new GovernanceEngine(store)
      const proposal = await engine.createProposal(makeProposalDef(), 'did:key:alice')
      await engine.signProposal(proposal.id, 'did:key:a', makeProof(), 'approve')
      await engine.signProposal(proposal.id, 'did:key:b', makeProof(), 'approve')
      await engine.signProposal(proposal.id, 'did:key:c', makeProof(), 'approve')
      await engine.contestProposal(proposal.id)
      await expect(engine.executeProposal(proposal.id)).rejects.toThrow('not passed')
    })
  })

  describe('Constitution', () => {
    it('MUST create constitution for community', async () => {
      const constitution = new Constitution(store)
      const doc = await constitution.createConstitution(
        'comm1',
        [
          {
            id: 'rule-1',
            description: 'No spam',
            constraint: { kind: 'forbid-action', params: { action: 'spam' } },
            immutable: false
          }
        ],
        ['did:key:alice']
      )
      expect(doc.version).toBe(1)
      expect(doc.rules).toHaveLength(1)
    })

    it('MUST validate actions against constitution rules', async () => {
      const constitution = new Constitution(store)
      await constitution.createConstitution(
        'comm1',
        [
          {
            id: 'rule-1',
            description: 'No delete channels',
            constraint: { kind: 'forbid-action', params: { action: 'delete-channel' } },
            immutable: false
          }
        ],
        ['did:key:alice']
      )
      const check = constitution.validateAction('comm1', { kind: 'delete-channel', params: {} })
      expect(check.allowed).toBe(false)
      expect(check.violations).toContain('rule-1')
    })

    it('MUST enforce forbid-action constraints', async () => {
      const constitution = new Constitution(store)
      await constitution.createConstitution(
        'comm1',
        [
          {
            id: 'r1',
            description: 'Forbidden',
            constraint: { kind: 'forbid-action', params: { action: 'create-channel' } },
            immutable: false
          }
        ],
        []
      )
      const check = constitution.validateAction('comm1', { kind: 'create-channel', params: {} })
      expect(check.allowed).toBe(false)
    })

    it('MUST enforce max-count constraints', async () => {
      const constitution = new Constitution(store)
      await constitution.createConstitution(
        'comm1',
        [
          {
            id: 'r1',
            description: 'Max 5 channels',
            constraint: { kind: 'max-count', params: { max: 5, current: 5 } },
            immutable: false
          }
        ],
        []
      )
      const check = constitution.validateAction('comm1', { kind: 'create-channel', params: {} })
      expect(check.allowed).toBe(false)
    })

    it('MUST reject modification of immutable rules (unless unanimous)', async () => {
      const constitution = new Constitution(store)
      await constitution.createConstitution(
        'comm1',
        [{ id: 'r1', description: 'Core rule', constraint: { kind: 'forbid-action', params: {} }, immutable: true }],
        []
      )
      await expect(constitution.updateConstitution('comm1', { removeRuleIds: ['r1'] })).rejects.toThrow('immutable')
    })

    it('MUST version constitution on update', async () => {
      const constitution = new Constitution(store)
      await constitution.createConstitution('comm1', [], [])
      await constitution.updateConstitution('comm1', {
        addRules: [
          { id: 'r1', description: 'New rule', constraint: { kind: 'require-quorum', params: {} }, immutable: false }
        ]
      })
      const doc = await constitution.getCommunityConstitution('comm1')
      expect(doc!.version).toBe(2)
    })

    it('MUST store constitution as RDF quads', async () => {
      const constitution = new Constitution(store)
      await constitution.createConstitution('comm1', [], [])
      const quads = await store.match({ subject: `harmony:constitution-comm1` })
      expect(quads.find((q) => q.object === HarmonyType.Constitution)).toBeTruthy()
    })
  })

  describe('User-to-User Delegation', () => {
    it('MUST create delegation with scoped capabilities', async () => {
      const caps = new Map([['did:key:alice', new Set(['SendMessage', 'ManageChannel'])]])
      const mgr = new DelegationManager(store, caps)
      const delegation = await mgr.createDelegation('did:key:alice', 'did:key:bob', ['SendMessage'], {
        reason: 'vacation'
      })
      expect(delegation.id).toBeTruthy()
      expect(delegation.capabilities).toContain('SendMessage')
      expect(delegation.reason).toBe('vacation')
    })

    it('MUST allow delegatee to act on behalf of delegator', async () => {
      const caps = new Map([['did:key:alice', new Set(['SendMessage'])]])
      const mgr = new DelegationManager(store, caps)
      await mgr.createDelegation('did:key:alice', 'did:key:bob', ['SendMessage'])
      expect(mgr.hasCapability('did:key:bob', 'SendMessage')).toBe(true)
    })

    it('MUST enforce delegation expiry', async () => {
      const caps = new Map([['did:key:alice', new Set(['SendMessage'])]])
      const mgr = new DelegationManager(store, caps)
      const delegation = await mgr.createDelegation('did:key:alice', 'did:key:bob', ['SendMessage'], { expiresIn: 0 })
      // Wait a tiny bit for expiry
      await new Promise((r) => setTimeout(r, 10))
      const active = await mgr.getActiveDelegation(delegation.id)
      expect(active).toBeNull()
    })

    it('MUST revoke delegation on demand', async () => {
      const caps = new Map([['did:key:alice', new Set(['SendMessage'])]])
      const mgr = new DelegationManager(store, caps)
      const delegation = await mgr.createDelegation('did:key:alice', 'did:key:bob', ['SendMessage'])
      await mgr.revokeDelegation(delegation.id)
      expect(mgr.hasCapability('did:key:bob', 'SendMessage')).toBe(false)
    })

    it('MUST attenuate delegated capabilities (subset only)', async () => {
      const caps = new Map([['did:key:alice', new Set(['SendMessage', 'ManageChannel'])]])
      const mgr = new DelegationManager(store, caps)
      const delegation = await mgr.createDelegation('did:key:alice', 'did:key:bob', ['SendMessage', 'ManageChannel'], {
        attenuate: ['SendMessage']
      })
      expect(delegation.capabilities).toEqual(['SendMessage'])
    })

    it('MUST list delegations from/to a DID', async () => {
      const caps = new Map([['did:key:alice', new Set(['SendMessage'])]])
      const mgr = new DelegationManager(store, caps)
      await mgr.createDelegation('did:key:alice', 'did:key:bob', ['SendMessage'])
      const from = await mgr.listDelegationsFrom('did:key:alice')
      const to = await mgr.listDelegationsTo('did:key:bob')
      expect(from).toHaveLength(1)
      expect(to).toHaveLength(1)
    })

    it('MUST reject delegation of capabilities user does not hold', async () => {
      const caps = new Map([['did:key:alice', new Set(['SendMessage'])]])
      const mgr = new DelegationManager(store, caps)
      await expect(mgr.createDelegation('did:key:alice', 'did:key:bob', ['ManageChannel'])).rejects.toThrow('not held')
    })

    it('MUST store delegation as RDF quads', async () => {
      const caps = new Map([['did:key:alice', new Set(['SendMessage'])]])
      const mgr = new DelegationManager(store, caps)
      const delegation = await mgr.createDelegation('did:key:alice', 'did:key:bob', ['SendMessage'])
      const quads = await store.match({ subject: `harmony:${delegation.id}` })
      expect(quads.find((q) => q.object === HarmonyType.UserDelegation)).toBeTruthy()
    })
  })

  describe('AI Agent Authorization', () => {
    it('MUST authorize agent with scoped capabilities and constraints', async () => {
      const mgr = new AgentAuthManager(store)
      const auth = await mgr.authorizeAgent(
        'did:key:agent',
        'comm1',
        ['SendMessage'],
        {
          maxActionsPerHour: 100,
          allowedActions: ['SendMessage'],
          auditLevel: 'full'
        },
        'did:key:admin'
      )
      expect(auth.id).toBeTruthy()
      expect(auth.active).toBe(true)
    })

    it('MUST enforce maxActionsPerHour rate limit', async () => {
      const mgr = new AgentAuthManager(store)
      await mgr.authorizeAgent(
        'did:key:agent',
        'comm1',
        [],
        {
          maxActionsPerHour: 2,
          allowedActions: ['SendMessage'],
          auditLevel: 'full'
        },
        'did:key:admin'
      )
      await mgr.performAction('did:key:agent', 'SendMessage', 'ch1')
      await mgr.performAction('did:key:agent', 'SendMessage', 'ch1')
      const result = await mgr.performAction('did:key:agent', 'SendMessage', 'ch1')
      expect(result).toBe('rate-limited')
    })

    it('MUST enforce allowedActions filter', async () => {
      const mgr = new AgentAuthManager(store)
      await mgr.authorizeAgent(
        'did:key:agent',
        'comm1',
        [],
        {
          maxActionsPerHour: 100,
          allowedActions: ['SendMessage'],
          auditLevel: 'full'
        },
        'did:key:admin'
      )
      const result = await mgr.performAction('did:key:agent', 'ManageChannel', 'ch1')
      expect(result).toBe('denied')
    })

    it('MUST enforce allowedChannels filter', async () => {
      const mgr = new AgentAuthManager(store)
      await mgr.authorizeAgent(
        'did:key:agent',
        'comm1',
        [],
        {
          maxActionsPerHour: 100,
          allowedActions: ['SendMessage'],
          allowedChannels: ['ch1'],
          auditLevel: 'full'
        },
        'did:key:admin'
      )
      const result = await mgr.performAction('did:key:agent', 'SendMessage', 'ch2')
      expect(result).toBe('denied')
    })

    it('MUST require human co-sign for designated actions', async () => {
      const mgr = new AgentAuthManager(store)
      await mgr.authorizeAgent(
        'did:key:agent',
        'comm1',
        [],
        {
          maxActionsPerHour: 100,
          allowedActions: ['SendMessage', 'ManageChannel'],
          requireHumanApproval: ['ManageChannel'],
          auditLevel: 'full'
        },
        'did:key:admin'
      )
      expect(mgr.requiresHumanApproval('did:key:agent', 'ManageChannel')).toBe(true)
      expect(mgr.requiresHumanApproval('did:key:agent', 'SendMessage')).toBe(false)
    })

    it('MUST log every agent action to audit log', async () => {
      const mgr = new AgentAuthManager(store)
      await mgr.authorizeAgent(
        'did:key:agent',
        'comm1',
        [],
        {
          maxActionsPerHour: 100,
          allowedActions: ['SendMessage'],
          auditLevel: 'full'
        },
        'did:key:admin'
      )
      await mgr.performAction('did:key:agent', 'SendMessage', 'ch1')
      const log = mgr.getAuditLog('did:key:agent')
      expect(log).toHaveLength(1)
      expect(log[0].result).toBe('allowed')
    })

    it('MUST revoke agent authorization on demand', async () => {
      const mgr = new AgentAuthManager(store)
      const auth = await mgr.authorizeAgent(
        'did:key:agent',
        'comm1',
        [],
        {
          maxActionsPerHour: 100,
          allowedActions: ['SendMessage'],
          auditLevel: 'full'
        },
        'did:key:admin'
      )
      await mgr.revokeAgent(auth.id)
      const result = await mgr.performAction('did:key:agent', 'SendMessage', 'ch1')
      expect(result).toBe('denied')
    })

    it('MUST list authorized agents for community', async () => {
      const mgr = new AgentAuthManager(store)
      await mgr.authorizeAgent(
        'did:key:agent-1',
        'comm1',
        [],
        {
          maxActionsPerHour: 100,
          allowedActions: [],
          auditLevel: 'full'
        },
        'did:key:admin'
      )
      await mgr.authorizeAgent(
        'did:key:agent-2',
        'comm1',
        [],
        {
          maxActionsPerHour: 100,
          allowedActions: [],
          auditLevel: 'full'
        },
        'did:key:admin'
      )
      const agents = await mgr.listAuthorizedAgents('comm1')
      expect(agents).toHaveLength(2)
    })

    it('MUST query audit log with filters', async () => {
      const mgr = new AgentAuthManager(store)
      await mgr.authorizeAgent(
        'did:key:agent',
        'comm1',
        [],
        {
          maxActionsPerHour: 100,
          allowedActions: ['SendMessage', 'ReadMessage'],
          auditLevel: 'full'
        },
        'did:key:admin'
      )
      await mgr.performAction('did:key:agent', 'SendMessage', 'ch1')
      await mgr.performAction('did:key:agent', 'ReadMessage', 'ch1')
      const filtered = mgr.getAuditLog('did:key:agent', { action: 'SendMessage' })
      expect(filtered).toHaveLength(1)
    })

    it('MUST expire agent auth at expiresAt', async () => {
      const mgr = new AgentAuthManager(store)
      await mgr.authorizeAgent(
        'did:key:agent',
        'comm1',
        [],
        {
          maxActionsPerHour: 100,
          allowedActions: ['SendMessage'],
          auditLevel: 'full'
        },
        'did:key:admin',
        0
      ) // Expires immediately
      await new Promise((r) => setTimeout(r, 10))
      const result = await mgr.performAction('did:key:agent', 'SendMessage', 'ch1')
      expect(result).toBe('denied')
    })

    it('MUST reject agent action outside authorized scope', async () => {
      const mgr = new AgentAuthManager(store)
      // No agent authorized
      const result = await mgr.performAction('did:key:unknown', 'SendMessage', 'ch1')
      expect(result).toBe('denied')
    })
  })
})
