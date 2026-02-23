import { randomBytes } from '@harmony/crypto'
import type { Quad, QuadStore } from '@harmony/quads'
import { HarmonyType, HarmonyPredicate, RDFPredicate, XSDDatatype } from '@harmony/vocab'
import { AuditLog } from './audit.js'

export interface AgentConstraints {
  maxActionsPerHour: number
  allowedActions: string[]
  allowedChannels?: string[]
  requireHumanApproval?: string[]
  auditLevel: 'full' | 'summary' | 'none'
}

export interface AgentAuth {
  id: string
  agentDID: string
  communityId: string
  capabilities: string[]
  constraints: AgentConstraints
  authorizedBy: string
  authorizedAt: string
  expiresAt?: string
  active: boolean
  actionCount: number
}

export interface AuditEntry {
  agentDID: string
  action: string
  target: string
  timestamp: string
  zcapProof: string
  result: 'allowed' | 'denied' | 'rate-limited'
  humanApproval?: { approverDID: string; approvedAt: string }
}

export interface AuditLogQuery {
  since?: string
  until?: string
  action?: string
  result?: 'allowed' | 'denied' | 'rate-limited'
  limit?: number
}

function generateId(): string {
  const bytes = randomBytes(16)
  return 'agent-auth-' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export class AgentAuthManager {
  private agents = new Map<string, AgentAuth>()
  private actionCounts = new Map<string, { count: number; windowStart: number }>()
  private store: QuadStore
  private auditLog: AuditLog
  private pendingApprovals = new Map<string, { action: string; target: string; resolve: (approved: boolean) => void }>()

  constructor(store: QuadStore) {
    this.store = store
    this.auditLog = new AuditLog()
  }

  async authorizeAgent(
    agentDID: string,
    communityId: string,
    capabilities: string[],
    constraints: AgentConstraints,
    authorizedBy: string,
    expiresIn?: number
  ): Promise<AgentAuth> {
    const id = generateId()
    const now = new Date()

    const auth: AgentAuth = {
      id,
      agentDID,
      communityId,
      capabilities,
      constraints,
      authorizedBy,
      authorizedAt: now.toISOString(),
      expiresAt: expiresIn !== undefined ? new Date(now.getTime() + expiresIn * 1000).toISOString() : undefined,
      active: true,
      actionCount: 0
    }

    this.agents.set(id, auth)

    // Store as RDF
    const graph = `community:${communityId}`
    const subject = `harmony:${id}`
    const quads: Quad[] = [
      { subject, predicate: RDFPredicate.type, object: HarmonyType.AgentAuth, graph },
      { subject, predicate: HarmonyPredicate.agentDID, object: agentDID, graph },
      {
        subject,
        predicate: HarmonyPredicate.auditLevel,
        object: { value: constraints.auditLevel, datatype: XSDDatatype.string },
        graph
      },
      {
        subject,
        predicate: HarmonyPredicate.maxActionsPerHour,
        object: { value: String(constraints.maxActionsPerHour), datatype: XSDDatatype.integer },
        graph
      }
    ]
    await this.store.addAll(quads)

    return auth
  }

  async revokeAgent(agentAuthId: string): Promise<void> {
    const auth = this.agents.get(agentAuthId)
    if (auth) auth.active = false
  }

  async listAuthorizedAgents(communityId: string): Promise<AgentAuth[]> {
    return Array.from(this.agents.values()).filter((a) => a.communityId === communityId && a.active)
  }

  async performAction(
    agentDID: string,
    action: string,
    target: string,
    proofId = 'default-proof'
  ): Promise<'allowed' | 'denied' | 'rate-limited'> {
    const auth = this.findActiveAuth(agentDID)
    if (!auth) {
      this.auditLog.log({
        agentDID,
        action,
        target,
        timestamp: new Date().toISOString(),
        zcapProof: proofId,
        result: 'denied'
      })
      return 'denied'
    }

    // Check expiry
    if (auth.expiresAt && new Date(auth.expiresAt) < new Date()) {
      auth.active = false
      this.auditLog.log({
        agentDID,
        action,
        target,
        timestamp: new Date().toISOString(),
        zcapProof: proofId,
        result: 'denied'
      })
      return 'denied'
    }

    // Check allowed actions
    if (!auth.constraints.allowedActions.includes(action)) {
      this.auditLog.log({
        agentDID,
        action,
        target,
        timestamp: new Date().toISOString(),
        zcapProof: proofId,
        result: 'denied'
      })
      return 'denied'
    }

    // Check allowed channels
    if (auth.constraints.allowedChannels && !auth.constraints.allowedChannels.includes(target)) {
      this.auditLog.log({
        agentDID,
        action,
        target,
        timestamp: new Date().toISOString(),
        zcapProof: proofId,
        result: 'denied'
      })
      return 'denied'
    }

    // Check rate limit
    const now = Date.now()
    const tracker = this.actionCounts.get(agentDID) ?? { count: 0, windowStart: now }
    if (now - tracker.windowStart > 3600000) {
      tracker.count = 0
      tracker.windowStart = now
    }
    if (tracker.count >= auth.constraints.maxActionsPerHour) {
      this.auditLog.log({
        agentDID,
        action,
        target,
        timestamp: new Date().toISOString(),
        zcapProof: proofId,
        result: 'rate-limited'
      })
      return 'rate-limited'
    }

    tracker.count++
    this.actionCounts.set(agentDID, tracker)
    auth.actionCount++

    this.auditLog.log({
      agentDID,
      action,
      target,
      timestamp: new Date().toISOString(),
      zcapProof: proofId,
      result: 'allowed'
    })
    return 'allowed'
  }

  requiresHumanApproval(agentDID: string, action: string): boolean {
    const auth = this.findActiveAuth(agentDID)
    if (!auth) return false
    return auth.constraints.requireHumanApproval?.includes(action) ?? false
  }

  getAuditLog(agentDID: string, query?: AuditLogQuery): AuditEntry[] {
    return this.auditLog.query(agentDID, query)
  }

  private findActiveAuth(agentDID: string): AgentAuth | null {
    for (const [, auth] of this.agents) {
      if (auth.agentDID === agentDID && auth.active) return auth
    }
    return null
  }
}
