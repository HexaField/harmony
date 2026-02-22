import type { ProtocolMessage, ZCAPInvocationProof, DecryptedContent } from '@harmony/protocol'
import type { VerifiableCredential } from '@harmony/vc'
import type { QuadStore } from '@harmony/quads'
import { HARMONY, RDFPredicate, XSDDatatype } from '@harmony/vocab'

// ── Moderation Rule Types ──

export interface SlowModeRule {
  id: string
  type: 'slowMode'
  channelId: string
  intervalSeconds: number
}

export interface RateLimitRule {
  id: string
  type: 'rateLimit'
  scope: 'community' | 'channel'
  scopeId: string
  maxMessages: number
  windowSeconds: number
}

export interface AccountAgeRule {
  id: string
  type: 'accountAge'
  minAgeSeconds: number
  action: 'block' | 'flag'
}

export interface RaidDetectionRule {
  id: string
  type: 'raidDetection'
  joinThreshold: number
  windowSeconds: number
  lockdownDurationSeconds: number
  action: 'lockdown' | 'alert'
}

export interface VCRequirementRule {
  id: string
  type: 'vcRequirement'
  requiredVCTypes: string[]
  action: 'block' | 'flag'
}

export type ModerationRule = SlowModeRule | RateLimitRule | AccountAgeRule | RaidDetectionRule | VCRequirementRule

// ── Moderation Decision ──

export interface ModerationDecision {
  allowed: boolean
  reason?: string
  action?: 'none' | 'block' | 'flag' | 'slowMode' | 'rateLimit' | 'lockdown'
  rule?: ModerationRule
}

// ── Content Filter ──

export interface ContentFlag {
  type: 'spam' | 'nsfw' | 'toxic' | 'custom'
  confidence: number
  rule: string
}

export interface ContentFilterResult {
  passed: boolean
  flags: ContentFlag[]
}

export interface ContentFilterRule {
  type: 'spam' | 'nsfw' | 'toxic' | 'custom'
  pattern: RegExp
  confidence: number
  label: string
}

// ── Moderation Log ──

export interface ModerationLogEntry {
  id: string
  communityId: string
  moderatorDID: string
  targetDID: string
  action: 'kick' | 'ban' | 'mute' | 'warn' | 'slowMode' | 'raidLockdown'
  reason?: string
  timestamp: string
  expiresAt?: string
  zcapProof?: ZCAPInvocationProof
}

// ── Moderation Plugin ──

export class ModerationPlugin {
  private rules: Map<string, ModerationRule[]> = new Map() // communityId → rules
  private slowModeTrackers: Map<string, Map<string, number>> = new Map() // channelId → (did → lastMsgTime)
  private rateLimitTrackers: Map<string, Map<string, { count: number; windowStart: number }>> = new Map()
  private joinTrackers: Map<string, number[]> = new Map() // communityId → join timestamps
  private lockdowns: Map<string, number> = new Map() // communityId → lockdown end timestamp
  private alertCallbacks: Map<string, ((communityId: string, rule: RaidDetectionRule) => void)[]> = new Map()

  addRule(communityId: string, rule: ModerationRule): void {
    if (!this.rules.has(communityId)) this.rules.set(communityId, [])
    this.rules.get(communityId)!.push(rule)
  }

  removeRule(communityId: string, ruleId: string): void {
    const rules = this.rules.get(communityId)
    if (rules) {
      const idx = rules.findIndex((r) => r.id === ruleId)
      if (idx >= 0) rules.splice(idx, 1)
    }
  }

  getRules(communityId: string): ModerationRule[] {
    return this.rules.get(communityId) ?? []
  }

  onRaidAlert(communityId: string, callback: (communityId: string, rule: RaidDetectionRule) => void): void {
    if (!this.alertCallbacks.has(communityId)) this.alertCallbacks.set(communityId, [])
    this.alertCallbacks.get(communityId)!.push(callback)
  }

  async handleMessage(communityId: string, message: ProtocolMessage): Promise<ModerationDecision> {
    const rules = this.rules.get(communityId) ?? []
    const now = Date.now()

    // Check lockdown
    const lockdownEnd = this.lockdowns.get(communityId)
    if (lockdownEnd && now < lockdownEnd) {
      return { allowed: false, reason: 'Community is in lockdown', action: 'lockdown' }
    }

    const payload = message.payload as { channelId?: string }

    for (const rule of rules) {
      if (rule.type === 'slowMode') {
        if (payload?.channelId !== rule.channelId) continue
        if (!this.slowModeTrackers.has(rule.channelId)) {
          this.slowModeTrackers.set(rule.channelId, new Map())
        }
        const tracker = this.slowModeTrackers.get(rule.channelId)!
        const lastTime = tracker.get(message.sender)
        if (lastTime && now - lastTime < rule.intervalSeconds * 1000) {
          return {
            allowed: false,
            reason: `Slow mode: wait ${rule.intervalSeconds}s between messages`,
            action: 'slowMode',
            rule
          }
        }
        tracker.set(message.sender, now)
      }

      if (rule.type === 'rateLimit') {
        const scopeKey = `${rule.scope}:${rule.scopeId}`
        if (!this.rateLimitTrackers.has(scopeKey)) {
          this.rateLimitTrackers.set(scopeKey, new Map())
        }
        const tracker = this.rateLimitTrackers.get(scopeKey)!
        const entry = tracker.get(message.sender)
        if (!entry || now - entry.windowStart > rule.windowSeconds * 1000) {
          tracker.set(message.sender, { count: 1, windowStart: now })
        } else {
          entry.count++
          if (entry.count > rule.maxMessages) {
            return {
              allowed: false,
              reason: `Rate limited: max ${rule.maxMessages} messages per ${rule.windowSeconds}s`,
              action: 'rateLimit',
              rule
            }
          }
        }
      }

      if (rule.type === 'accountAge') {
        // Check DID creation age from VC issuance dates
        // In simplified implementation, use message sender's proof timestamp
        const proof = message.proof
        if (proof?.invocation?.proof?.created) {
          const created = new Date(proof.invocation.proof.created).getTime()
          const age = (now - created) / 1000
          if (age < rule.minAgeSeconds) {
            return {
              allowed: rule.action === 'flag',
              reason: `Account too new: ${Math.round(age)}s < ${rule.minAgeSeconds}s required`,
              action: rule.action,
              rule
            }
          }
        }
      }
    }

    return { allowed: true, action: 'none' }
  }

  async handleJoin(
    communityId: string,
    memberDID: string,
    membershipVC: VerifiableCredential
  ): Promise<ModerationDecision> {
    const rules = this.rules.get(communityId) ?? []
    const now = Date.now()

    // Check lockdown
    const lockdownEnd = this.lockdowns.get(communityId)
    if (lockdownEnd && now < lockdownEnd) {
      return { allowed: false, reason: 'Community is in lockdown', action: 'lockdown' }
    }

    for (const rule of rules) {
      if (rule.type === 'vcRequirement') {
        const hasAllTypes = rule.requiredVCTypes.every((t) => membershipVC.type.includes(t))
        if (!hasAllTypes) {
          return {
            allowed: rule.action === 'flag',
            reason: `Missing required VC types: ${rule.requiredVCTypes.join(', ')}`,
            action: rule.action,
            rule
          }
        }
      }

      if (rule.type === 'raidDetection') {
        if (!this.joinTrackers.has(communityId)) {
          this.joinTrackers.set(communityId, [])
        }
        const joins = this.joinTrackers.get(communityId)!

        // Clean old entries
        const windowStart = now - rule.windowSeconds * 1000
        while (joins.length > 0 && joins[0] < windowStart) joins.shift()

        joins.push(now)

        if (joins.length >= rule.joinThreshold) {
          if (rule.action === 'lockdown') {
            this.lockdowns.set(communityId, now + rule.lockdownDurationSeconds * 1000)
          }
          // Alert
          const callbacks = this.alertCallbacks.get(communityId) ?? []
          for (const cb of callbacks) cb(communityId, rule)

          return {
            allowed: false,
            reason: `Raid detected: ${joins.length} joins in ${rule.windowSeconds}s`,
            action: rule.action,
            rule
          }
        }
      }

      if (rule.type === 'accountAge') {
        const issuanceDate = membershipVC.issuanceDate
        if (issuanceDate) {
          const created = new Date(issuanceDate).getTime()
          const age = (now - created) / 1000
          if (age < rule.minAgeSeconds) {
            return {
              allowed: rule.action === 'flag',
              reason: `Account too new: ${Math.round(age)}s < ${rule.minAgeSeconds}s`,
              action: rule.action,
              rule
            }
          }
        }
      }
    }

    return { allowed: true, action: 'none' }
  }

  // Check lockdown status
  isLockedDown(communityId: string): boolean {
    const lockdownEnd = this.lockdowns.get(communityId)
    return lockdownEnd ? Date.now() < lockdownEnd : false
  }

  // Release lockdown
  releaseLockdown(communityId: string): void {
    this.lockdowns.delete(communityId)
  }
}

// ── Content Filter (client-side) ──

export class ContentFilter {
  private rules: ContentFilterRule[] = []

  addRule(rule: ContentFilterRule): void {
    this.rules.push(rule)
  }

  check(content: DecryptedContent): ContentFilterResult {
    const flags: ContentFlag[] = []
    const text = content.text ?? ''

    for (const rule of this.rules) {
      if (rule.pattern.test(text)) {
        flags.push({
          type: rule.type,
          confidence: rule.confidence,
          rule: rule.label
        })
      }
    }

    return {
      passed: flags.length === 0,
      flags
    }
  }
}

// ── Moderation Log ──

export class ModerationLog {
  private store: QuadStore
  private entries: ModerationLogEntry[] = []

  constructor(store: QuadStore) {
    this.store = store
  }

  async log(entry: ModerationLogEntry): Promise<void> {
    this.entries.push(entry)

    // Store as RDF quads
    const graph = `moderation:${entry.communityId}`
    await this.store.addAll([
      { subject: entry.id, predicate: RDFPredicate.type, object: `${HARMONY}ModerationAction`, graph },
      { subject: entry.id, predicate: `${HARMONY}moderator`, object: entry.moderatorDID, graph },
      { subject: entry.id, predicate: `${HARMONY}moderationTarget`, object: entry.targetDID, graph },
      { subject: entry.id, predicate: `${HARMONY}moderationAction`, object: { value: entry.action }, graph },
      {
        subject: entry.id,
        predicate: `${HARMONY}timestamp`,
        object: { value: entry.timestamp, datatype: XSDDatatype.dateTime },
        graph
      }
    ])

    if (entry.reason) {
      await this.store.add({
        subject: entry.id,
        predicate: `${HARMONY}moderationReason`,
        object: { value: entry.reason },
        graph
      })
    }
  }

  async query(params: {
    communityId: string
    actionType?: string
    targetDID?: string
    since?: string
    limit?: number
  }): Promise<ModerationLogEntry[]> {
    let results = this.entries.filter((e) => e.communityId === params.communityId)
    if (params.actionType) results = results.filter((e) => e.action === params.actionType)
    if (params.targetDID) results = results.filter((e) => e.targetDID === params.targetDID)
    if (params.since) results = results.filter((e) => e.timestamp >= params.since!)
    return results.slice(0, params.limit ?? 100)
  }
}
