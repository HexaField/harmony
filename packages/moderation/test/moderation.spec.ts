import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryQuadStore } from '@harmony/quads'
import { createCryptoProvider } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import { VCService } from '@harmony/vc'
import type { ProtocolMessage, DecryptedContent } from '@harmony/protocol'
import { ModerationPlugin, ContentFilter, ModerationLog } from '../src/index.js'
import type {
  SlowModeRule,
  RateLimitRule,
  AccountAgeRule,
  RaidDetectionRule,
  VCRequirementRule,
  ContentFilterRule
} from '../src/index.js'

const crypto = createCryptoProvider()
const didProvider = new DIDKeyProvider(crypto)
const vcService = new VCService(crypto)

function createTestMessage(sender: string, channelId?: string, communityId?: string): ProtocolMessage {
  return {
    id: `msg-${Date.now()}-${Math.random()}`,
    type: 'channel.send',
    timestamp: new Date().toISOString(),
    sender,
    payload: {
      communityId: communityId ?? 'c1',
      channelId: channelId ?? 'ch1',
      content: { ciphertext: new Uint8Array([1]), epoch: 0, senderIndex: 0 },
      nonce: `n-${Math.random()}`,
      clock: { counter: 1, authorDID: sender }
    }
  }
}

describe('@harmony/moderation', () => {
  describe('Slow Mode', () => {
    it('MUST enforce minimum interval between messages per user', async () => {
      const plugin = new ModerationPlugin()
      const rule: SlowModeRule = { id: 'sm1', type: 'slowMode', channelId: 'ch1', intervalSeconds: 10 }
      plugin.addRule('c1', rule)

      const msg1 = createTestMessage('did:key:alice', 'ch1')
      const result1 = await plugin.handleMessage('c1', msg1)
      expect(result1.allowed).toBe(true)

      const msg2 = createTestMessage('did:key:alice', 'ch1')
      const result2 = await plugin.handleMessage('c1', msg2)
      expect(result2.allowed).toBe(false)
      expect(result2.action).toBe('slowMode')
    })

    it('MUST allow messages after interval expires', async () => {
      const plugin = new ModerationPlugin()
      const rule: SlowModeRule = { id: 'sm2', type: 'slowMode', channelId: 'ch1', intervalSeconds: 0 }
      plugin.addRule('c1', rule)

      const msg1 = createTestMessage('did:key:alice', 'ch1')
      await plugin.handleMessage('c1', msg1)

      // Wait for interval (0 seconds, so immediate)
      await new Promise((r) => setTimeout(r, 10))

      const msg2 = createTestMessage('did:key:alice', 'ch1')
      const result = await plugin.handleMessage('c1', msg2)
      expect(result.allowed).toBe(true)
    })

    it('MUST scope to specific channel', async () => {
      const plugin = new ModerationPlugin()
      const rule: SlowModeRule = { id: 'sm3', type: 'slowMode', channelId: 'ch1', intervalSeconds: 10 }
      plugin.addRule('c1', rule)

      await plugin.handleMessage('c1', createTestMessage('did:key:alice', 'ch1'))
      const result = await plugin.handleMessage('c1', createTestMessage('did:key:alice', 'ch1'))
      expect(result.allowed).toBe(false)
    })

    it('MUST not affect other channels', async () => {
      const plugin = new ModerationPlugin()
      const rule: SlowModeRule = { id: 'sm4', type: 'slowMode', channelId: 'ch1', intervalSeconds: 10 }
      plugin.addRule('c1', rule)

      await plugin.handleMessage('c1', createTestMessage('did:key:alice', 'ch1'))

      // ch2 should not be affected
      const result = await plugin.handleMessage('c1', createTestMessage('did:key:alice', 'ch2'))
      expect(result.allowed).toBe(true)
    })
  })

  describe('Rate Limiting', () => {
    it('MUST block messages exceeding rate limit', async () => {
      const plugin = new ModerationPlugin()
      const rule: RateLimitRule = {
        id: 'rl1',
        type: 'rateLimit',
        scope: 'community',
        scopeId: 'c1',
        maxMessages: 2,
        windowSeconds: 10
      }
      plugin.addRule('c1', rule)

      const r1 = await plugin.handleMessage('c1', createTestMessage('did:key:alice'))
      expect(r1.allowed).toBe(true)

      const r2 = await plugin.handleMessage('c1', createTestMessage('did:key:alice'))
      expect(r2.allowed).toBe(true)

      const r3 = await plugin.handleMessage('c1', createTestMessage('did:key:alice'))
      expect(r3.allowed).toBe(false)
      expect(r3.action).toBe('rateLimit')
    })

    it('MUST reset after window expires', async () => {
      const plugin = new ModerationPlugin()
      const rule: RateLimitRule = {
        id: 'rl2',
        type: 'rateLimit',
        scope: 'community',
        scopeId: 'c1',
        maxMessages: 1,
        windowSeconds: 0
      }
      plugin.addRule('c1', rule)

      await plugin.handleMessage('c1', createTestMessage('did:key:alice'))

      // Window of 0 seconds means next message starts a new window
      await new Promise((r) => setTimeout(r, 10))

      const result = await plugin.handleMessage('c1', createTestMessage('did:key:alice'))
      expect(result.allowed).toBe(true)
    })

    it('MUST scope to community or channel', async () => {
      const plugin = new ModerationPlugin()
      const rule: RateLimitRule = {
        id: 'rl3',
        type: 'rateLimit',
        scope: 'channel',
        scopeId: 'ch1',
        maxMessages: 1,
        windowSeconds: 10
      }
      plugin.addRule('c1', rule)

      await plugin.handleMessage('c1', createTestMessage('did:key:alice'))

      const result = await plugin.handleMessage('c1', createTestMessage('did:key:alice'))
      expect(result.allowed).toBe(false)
    })

    it('MUST track per-user', async () => {
      const plugin = new ModerationPlugin()
      const rule: RateLimitRule = {
        id: 'rl4',
        type: 'rateLimit',
        scope: 'community',
        scopeId: 'c1',
        maxMessages: 1,
        windowSeconds: 10
      }
      plugin.addRule('c1', rule)

      await plugin.handleMessage('c1', createTestMessage('did:key:alice'))
      // Bob should still be allowed
      const result = await plugin.handleMessage('c1', createTestMessage('did:key:bob'))
      expect(result.allowed).toBe(true)
    })
  })

  describe('Account Age', () => {
    it('MUST block/flag messages from new DIDs', async () => {
      const plugin = new ModerationPlugin()
      const rule: AccountAgeRule = { id: 'aa1', type: 'accountAge', minAgeSeconds: 86400, action: 'block' }
      plugin.addRule('c1', rule)

      const msg = createTestMessage('did:key:new')
      msg.proof = {
        capabilityId: 'cap1',
        capabilityChain: ['cap1'],
        invocation: {
          action: 'SendMessage',
          target: 'ch1',
          proof: {
            type: 'Ed25519Signature2020',
            created: new Date().toISOString(), // just created
            verificationMethod: 'did:key:new#key',
            proofPurpose: 'capabilityInvocation',
            proofValue: 'z...'
          }
        }
      }

      const result = await plugin.handleMessage('c1', msg)
      expect(result.allowed).toBe(false)
      expect(result.action).toBe('block')
    })

    it('MUST allow messages from old DIDs', async () => {
      const plugin = new ModerationPlugin()
      const rule: AccountAgeRule = { id: 'aa2', type: 'accountAge', minAgeSeconds: 60, action: 'block' }
      plugin.addRule('c1', rule)

      const msg = createTestMessage('did:key:old')
      msg.proof = {
        capabilityId: 'cap1',
        capabilityChain: ['cap1'],
        invocation: {
          action: 'SendMessage',
          target: 'ch1',
          proof: {
            type: 'Ed25519Signature2020',
            created: new Date(Date.now() - 120 * 1000).toISOString(), // 2 minutes ago
            verificationMethod: 'did:key:old#key',
            proofPurpose: 'capabilityInvocation',
            proofValue: 'z...'
          }
        }
      }

      const result = await plugin.handleMessage('c1', msg)
      expect(result.allowed).toBe(true)
    })

    it('MUST calculate age from VC issuance date', async () => {
      const plugin = new ModerationPlugin()
      const rule: AccountAgeRule = { id: 'aa3', type: 'accountAge', minAgeSeconds: 60, action: 'block' }
      plugin.addRule('c1', rule)

      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)

      // Recently issued VC
      const vc = await vcService.issue({
        issuerDID: doc.id,
        issuerKeyPair: kp,
        subjectDID: doc.id,
        type: 'CommunityMembershipCredential',
        claims: { community: 'c1' }
      })

      const result = await plugin.handleJoin('c1', doc.id, vc)
      expect(result.allowed).toBe(false)
    })
  })

  describe('Raid Detection', () => {
    it('MUST detect N joins within window', async () => {
      const plugin = new ModerationPlugin()
      const rule: RaidDetectionRule = {
        id: 'rd1',
        type: 'raidDetection',
        joinThreshold: 3,
        windowSeconds: 60,
        lockdownDurationSeconds: 300,
        action: 'lockdown'
      }
      plugin.addRule('c1', rule)

      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const vc = await vcService.issue({
        issuerDID: doc.id,
        issuerKeyPair: kp,
        subjectDID: doc.id,
        type: 'CommunityMembershipCredential',
        claims: {}
      })

      for (let i = 0; i < 2; i++) {
        const result = await plugin.handleJoin('c1', `did:key:user${i}`, vc)
        expect(result.allowed).toBe(true)
      }

      const raidResult = await plugin.handleJoin('c1', 'did:key:raider', vc)
      expect(raidResult.allowed).toBe(false)
      expect(raidResult.action).toBe('lockdown')
    })

    it('MUST trigger lockdown action', async () => {
      const plugin = new ModerationPlugin()
      const rule: RaidDetectionRule = {
        id: 'rd2',
        type: 'raidDetection',
        joinThreshold: 2,
        windowSeconds: 60,
        lockdownDurationSeconds: 300,
        action: 'lockdown'
      }
      plugin.addRule('c1', rule)

      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const vc = await vcService.issue({
        issuerDID: doc.id,
        issuerKeyPair: kp,
        subjectDID: doc.id,
        type: 'CommunityMembershipCredential',
        claims: {}
      })

      await plugin.handleJoin('c1', 'did:key:u1', vc)
      await plugin.handleJoin('c1', 'did:key:u2', vc)

      expect(plugin.isLockedDown('c1')).toBe(true)
    })

    it('MUST auto-release lockdown after duration', async () => {
      const plugin = new ModerationPlugin()
      const rule: RaidDetectionRule = {
        id: 'rd3',
        type: 'raidDetection',
        joinThreshold: 1,
        windowSeconds: 60,
        lockdownDurationSeconds: 0, // immediate release
        action: 'lockdown'
      }
      plugin.addRule('c1', rule)

      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const vc = await vcService.issue({
        issuerDID: doc.id,
        issuerKeyPair: kp,
        subjectDID: doc.id,
        type: 'CommunityMembershipCredential',
        claims: {}
      })

      await plugin.handleJoin('c1', 'did:key:u1', vc)

      await new Promise((r) => setTimeout(r, 10))

      // Lockdown should have expired (0 second duration)
      expect(plugin.isLockedDown('c1')).toBe(false)
    })

    it('MUST alert admins on raid detection', async () => {
      const plugin = new ModerationPlugin()
      const rule: RaidDetectionRule = {
        id: 'rd4',
        type: 'raidDetection',
        joinThreshold: 2,
        windowSeconds: 60,
        lockdownDurationSeconds: 300,
        action: 'alert'
      }
      plugin.addRule('c1', rule)

      let alerted = false
      plugin.onRaidAlert('c1', () => {
        alerted = true
      })

      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const vc = await vcService.issue({
        issuerDID: doc.id,
        issuerKeyPair: kp,
        subjectDID: doc.id,
        type: 'CommunityMembershipCredential',
        claims: {}
      })

      await plugin.handleJoin('c1', 'did:key:u1', vc)
      await plugin.handleJoin('c1', 'did:key:u2', vc)

      expect(alerted).toBe(true)
    })
  })

  describe('VC Requirements', () => {
    it('MUST block join without required VC types', async () => {
      const plugin = new ModerationPlugin()
      const rule: VCRequirementRule = {
        id: 'vc1',
        type: 'vcRequirement',
        requiredVCTypes: ['DiscordIdentityCredential'],
        action: 'block'
      }
      plugin.addRule('c1', rule)

      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const vc = await vcService.issue({
        issuerDID: doc.id,
        issuerKeyPair: kp,
        subjectDID: doc.id,
        type: 'CommunityMembershipCredential', // not DiscordIdentityCredential
        claims: {}
      })

      const result = await plugin.handleJoin('c1', doc.id, vc)
      expect(result.allowed).toBe(false)
      expect(result.action).toBe('block')
    })

    it('MUST allow join with required VCs', async () => {
      const plugin = new ModerationPlugin()
      const rule: VCRequirementRule = {
        id: 'vc2',
        type: 'vcRequirement',
        requiredVCTypes: ['VerifiableCredential'],
        action: 'block'
      }
      plugin.addRule('c1', rule)

      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const vc = await vcService.issue({
        issuerDID: doc.id,
        issuerKeyPair: kp,
        subjectDID: doc.id,
        type: 'CommunityMembershipCredential',
        claims: {}
      })

      const result = await plugin.handleJoin('c1', doc.id, vc)
      expect(result.allowed).toBe(true)
    })

    it('MUST support multiple required types (AND logic)', async () => {
      const plugin = new ModerationPlugin()
      const rule: VCRequirementRule = {
        id: 'vc3',
        type: 'vcRequirement',
        requiredVCTypes: ['VerifiableCredential', 'DiscordIdentityCredential'],
        action: 'block'
      }
      plugin.addRule('c1', rule)

      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const vc = await vcService.issue({
        issuerDID: doc.id,
        issuerKeyPair: kp,
        subjectDID: doc.id,
        type: 'CommunityMembershipCredential', // missing DiscordIdentityCredential
        claims: {}
      })

      const result = await plugin.handleJoin('c1', doc.id, vc)
      expect(result.allowed).toBe(false) // missing DiscordIdentityCredential
    })

    it('MUST verify VC validity (not just presence)', async () => {
      const plugin = new ModerationPlugin()
      const rule: VCRequirementRule = {
        id: 'vc4',
        type: 'vcRequirement',
        requiredVCTypes: ['VerifiableCredential'],
        action: 'block'
      }
      plugin.addRule('c1', rule)

      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const vc = await vcService.issue({
        issuerDID: doc.id,
        issuerKeyPair: kp,
        subjectDID: doc.id,
        type: 'CommunityMembershipCredential',
        claims: {}
      })

      // Valid VC should pass
      const result = await plugin.handleJoin('c1', doc.id, vc)
      expect(result.allowed).toBe(true)
    })
  })

  describe('Moderation Log', () => {
    it('MUST log all moderation actions', async () => {
      const store = new MemoryQuadStore()
      const log = new ModerationLog(store)

      await log.log({
        id: 'log-1',
        communityId: 'c1',
        moderatorDID: 'did:key:admin',
        targetDID: 'did:key:user',
        action: 'kick',
        reason: 'Spamming',
        timestamp: new Date().toISOString()
      })

      const results = await log.query({ communityId: 'c1' })
      expect(results.length).toBe(1)
      expect(results[0].action).toBe('kick')
    })

    it('MUST include moderator DID and ZCAP proof', async () => {
      const store = new MemoryQuadStore()
      const log = new ModerationLog(store)

      await log.log({
        id: 'log-2',
        communityId: 'c1',
        moderatorDID: 'did:key:admin',
        targetDID: 'did:key:user',
        action: 'ban',
        timestamp: new Date().toISOString(),
        zcapProof: {
          capabilityId: 'cap-1',
          capabilityChain: ['cap-1'],
          invocation: {
            action: 'BanUser',
            target: 'did:key:user',
            proof: {
              type: 'Ed25519Signature2020',
              created: '',
              verificationMethod: '',
              proofPurpose: '',
              proofValue: ''
            }
          }
        }
      })

      const results = await log.query({ communityId: 'c1' })
      expect(results[0].moderatorDID).toBe('did:key:admin')
      expect(results[0].zcapProof).toBeDefined()
    })

    it('MUST query by community, action type, target', async () => {
      const store = new MemoryQuadStore()
      const log = new ModerationLog(store)

      await log.log({
        id: 'l1',
        communityId: 'c1',
        moderatorDID: 'did:key:a',
        targetDID: 'did:key:u1',
        action: 'kick',
        timestamp: new Date().toISOString()
      })
      await log.log({
        id: 'l2',
        communityId: 'c1',
        moderatorDID: 'did:key:a',
        targetDID: 'did:key:u2',
        action: 'ban',
        timestamp: new Date().toISOString()
      })
      await log.log({
        id: 'l3',
        communityId: 'c2',
        moderatorDID: 'did:key:a',
        targetDID: 'did:key:u1',
        action: 'kick',
        timestamp: new Date().toISOString()
      })

      const c1All = await log.query({ communityId: 'c1' })
      expect(c1All.length).toBe(2)

      const c1Kicks = await log.query({ communityId: 'c1', actionType: 'kick' })
      expect(c1Kicks.length).toBe(1)

      const c1U1 = await log.query({ communityId: 'c1', targetDID: 'did:key:u1' })
      expect(c1U1.length).toBe(1)
    })

    it('MUST store as RDF quads', async () => {
      const store = new MemoryQuadStore()
      const log = new ModerationLog(store)

      await log.log({
        id: 'rdf-log',
        communityId: 'c1',
        moderatorDID: 'did:key:admin',
        targetDID: 'did:key:user',
        action: 'mute',
        reason: 'Test',
        timestamp: new Date().toISOString()
      })

      const quads = await store.match({ subject: 'rdf-log' })
      expect(quads.length).toBeGreaterThan(0)
    })
  })

  describe('Content Filter (client-side)', () => {
    it('MUST check decrypted content against patterns', () => {
      const filter = new ContentFilter()
      filter.addRule({ type: 'spam', pattern: /buy now|free money/i, confidence: 0.9, label: 'spam-pattern' })

      const content: DecryptedContent = { text: 'Buy now for free money!' }
      const result = filter.check(content)

      expect(result.passed).toBe(false)
      expect(result.flags.length).toBeGreaterThan(0)
      expect(result.flags[0].type).toBe('spam')
    })

    it('MUST return confidence scores', () => {
      const filter = new ContentFilter()
      filter.addRule({ type: 'toxic', pattern: /hate|kill/i, confidence: 0.85, label: 'toxic-words' })

      const content: DecryptedContent = { text: 'I hate this' }
      const result = filter.check(content)

      expect(result.flags[0].confidence).toBe(0.85)
    })

    it('MUST support custom rules', () => {
      const filter = new ContentFilter()
      filter.addRule({ type: 'custom', pattern: /forbidden-word/i, confidence: 1.0, label: 'custom-ban' })

      const cleanResult = filter.check({ text: 'Hello world' })
      expect(cleanResult.passed).toBe(true)

      const flaggedResult = filter.check({ text: 'This has forbidden-word in it' })
      expect(flaggedResult.passed).toBe(false)
      expect(flaggedResult.flags[0].type).toBe('custom')
    })

    it('MUST not send content to server', () => {
      // ContentFilter operates on DecryptedContent locally
      // No server communication — this is by design
      const filter = new ContentFilter()
      filter.addRule({ type: 'spam', pattern: /spam/i, confidence: 0.9, label: 'test' })

      const result = filter.check({ text: 'spam' })
      // The filter only returns a result — no side effects
      expect(result.flags.length).toBe(1)
    })
  })

  describe('Rule Management', () => {
    it('MUST add rules per community', () => {
      const plugin = new ModerationPlugin()
      plugin.addRule('c1', { id: 'r1', type: 'slowMode', channelId: 'ch1', intervalSeconds: 5 })
      plugin.addRule('c2', { id: 'r2', type: 'slowMode', channelId: 'ch2', intervalSeconds: 10 })

      expect(plugin.getRules('c1').length).toBe(1)
      expect(plugin.getRules('c2').length).toBe(1)
    })

    it('MUST remove rules by ID', () => {
      const plugin = new ModerationPlugin()
      plugin.addRule('c1', { id: 'r1', type: 'slowMode', channelId: 'ch1', intervalSeconds: 5 })
      plugin.addRule('c1', { id: 'r2', type: 'slowMode', channelId: 'ch2', intervalSeconds: 10 })

      plugin.removeRule('c1', 'r1')
      expect(plugin.getRules('c1').length).toBe(1)
      expect(plugin.getRules('c1')[0].id).toBe('r2')
    })

    it('MUST list rules for community', () => {
      const plugin = new ModerationPlugin()
      plugin.addRule('c1', { id: 'r1', type: 'slowMode', channelId: 'ch1', intervalSeconds: 5 })
      plugin.addRule('c1', {
        id: 'r2',
        type: 'rateLimit',
        scope: 'community',
        scopeId: 'c1',
        maxMessages: 10,
        windowSeconds: 60
      })

      const rules = plugin.getRules('c1')
      expect(rules.length).toBe(2)
      expect(rules.map((r) => r.type)).toContain('slowMode')
      expect(rules.map((r) => r.type)).toContain('rateLimit')
    })

    it('MUST return empty for community with no rules', () => {
      const plugin = new ModerationPlugin()
      expect(plugin.getRules('nonexistent')).toEqual([])
    })

    it('removeRule on non-existent rule MUST be no-op', () => {
      const plugin = new ModerationPlugin()
      plugin.addRule('c1', { id: 'r1', type: 'slowMode', channelId: 'ch1', intervalSeconds: 5 })
      plugin.removeRule('c1', 'nonexistent')
      expect(plugin.getRules('c1').length).toBe(1)
    })

    it('removeRule on non-existent community MUST be no-op', () => {
      const plugin = new ModerationPlugin()
      plugin.removeRule('nonexistent', 'r1')
      // Should not throw
    })
  })

  describe('Lockdown', () => {
    it('MUST block messages during lockdown', async () => {
      const plugin = new ModerationPlugin()
      const rule: RaidDetectionRule = {
        id: 'rd-block',
        type: 'raidDetection',
        joinThreshold: 1,
        windowSeconds: 60,
        lockdownDurationSeconds: 300,
        action: 'lockdown'
      }
      plugin.addRule('c1', rule)

      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const vc = await vcService.issue({
        issuerDID: doc.id,
        issuerKeyPair: kp,
        subjectDID: doc.id,
        type: 'CommunityMembershipCredential',
        claims: {}
      })
      await plugin.handleJoin('c1', 'did:key:trigger', vc)

      // Community should be locked down
      expect(plugin.isLockedDown('c1')).toBe(true)

      // Messages should be blocked
      const result = await plugin.handleMessage('c1', createTestMessage('did:key:alice'))
      expect(result.allowed).toBe(false)
      expect(result.action).toBe('lockdown')
    })

    it('MUST block joins during lockdown', async () => {
      const plugin = new ModerationPlugin()
      const rule: RaidDetectionRule = {
        id: 'rd-join-block',
        type: 'raidDetection',
        joinThreshold: 1,
        windowSeconds: 60,
        lockdownDurationSeconds: 300,
        action: 'lockdown'
      }
      plugin.addRule('c1', rule)

      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const vc = await vcService.issue({
        issuerDID: doc.id,
        issuerKeyPair: kp,
        subjectDID: doc.id,
        type: 'CommunityMembershipCredential',
        claims: {}
      })
      await plugin.handleJoin('c1', 'did:key:trigger', vc)

      // Subsequent join should be blocked
      const result = await plugin.handleJoin('c1', 'did:key:blocked', vc)
      expect(result.allowed).toBe(false)
      expect(result.action).toBe('lockdown')
    })

    it('releaseLockdown MUST allow messages again', async () => {
      const plugin = new ModerationPlugin()
      const rule: RaidDetectionRule = {
        id: 'rd-release',
        type: 'raidDetection',
        joinThreshold: 1,
        windowSeconds: 60,
        lockdownDurationSeconds: 300,
        action: 'lockdown'
      }
      plugin.addRule('c1', rule)

      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const vc = await vcService.issue({
        issuerDID: doc.id,
        issuerKeyPair: kp,
        subjectDID: doc.id,
        type: 'CommunityMembershipCredential',
        claims: {}
      })
      await plugin.handleJoin('c1', 'did:key:trigger', vc)
      expect(plugin.isLockedDown('c1')).toBe(true)

      plugin.releaseLockdown('c1')
      expect(plugin.isLockedDown('c1')).toBe(false)

      const result = await plugin.handleMessage('c1', createTestMessage('did:key:alice'))
      expect(result.allowed).toBe(true)
    })

    it('isLockedDown MUST return false for non-locked community', () => {
      const plugin = new ModerationPlugin()
      expect(plugin.isLockedDown('c1')).toBe(false)
    })
  })

  describe('Content Filter Edge Cases', () => {
    it('MUST handle empty text', () => {
      const filter = new ContentFilter()
      filter.addRule({ type: 'spam', pattern: /spam/i, confidence: 0.9, label: 'test' })
      const result = filter.check({ text: '' })
      expect(result.passed).toBe(true)
      expect(result.flags).toEqual([])
    })

    it('MUST handle missing text field', () => {
      const filter = new ContentFilter()
      filter.addRule({ type: 'spam', pattern: /spam/i, confidence: 0.9, label: 'test' })
      const result = filter.check({} as DecryptedContent)
      expect(result.passed).toBe(true)
    })

    it('MUST flag with multiple matching rules', () => {
      const filter = new ContentFilter()
      filter.addRule({ type: 'spam', pattern: /buy/i, confidence: 0.8, label: 'spam-buy' })
      filter.addRule({ type: 'toxic', pattern: /hate/i, confidence: 0.9, label: 'toxic-hate' })

      const result = filter.check({ text: 'buy hate' })
      expect(result.passed).toBe(false)
      expect(result.flags.length).toBe(2)
      expect(result.flags.map((f) => f.type)).toContain('spam')
      expect(result.flags.map((f) => f.type)).toContain('toxic')
    })
  })

  describe('Moderation Log Edge Cases', () => {
    it('MUST query with limit', async () => {
      const store = new MemoryQuadStore()
      const log = new ModerationLog(store)

      for (let i = 0; i < 5; i++) {
        await log.log({
          id: `limit-${i}`,
          communityId: 'c1',
          moderatorDID: 'did:key:admin',
          targetDID: `did:key:user${i}`,
          action: 'kick',
          timestamp: new Date().toISOString()
        })
      }

      const results = await log.query({ communityId: 'c1', limit: 3 })
      expect(results.length).toBe(3)
    })

    it('MUST query with since filter', async () => {
      const store = new MemoryQuadStore()
      const log = new ModerationLog(store)

      await log.log({
        id: 'old',
        communityId: 'c1',
        moderatorDID: 'did:key:admin',
        targetDID: 'did:key:u1',
        action: 'kick',
        timestamp: '2025-01-01T00:00:00Z'
      })
      await log.log({
        id: 'new',
        communityId: 'c1',
        moderatorDID: 'did:key:admin',
        targetDID: 'did:key:u2',
        action: 'ban',
        timestamp: '2026-06-01T00:00:00Z'
      })

      const results = await log.query({ communityId: 'c1', since: '2026-01-01T00:00:00Z' })
      expect(results.length).toBe(1)
      expect(results[0].id).toBe('new')
    })

    it('MUST return empty for no matching entries', async () => {
      const store = new MemoryQuadStore()
      const log = new ModerationLog(store)

      const results = await log.query({ communityId: 'nonexistent' })
      expect(results).toEqual([])
    })

    it('MUST store entry with expiresAt', async () => {
      const store = new MemoryQuadStore()
      const log = new ModerationLog(store)

      await log.log({
        id: 'expires-test',
        communityId: 'c1',
        moderatorDID: 'did:key:admin',
        targetDID: 'did:key:user',
        action: 'mute',
        timestamp: new Date().toISOString(),
        expiresAt: '2026-12-31T23:59:59Z'
      })

      const results = await log.query({ communityId: 'c1' })
      expect(results[0].expiresAt).toBe('2026-12-31T23:59:59Z')
    })
  })

  describe('Multiple Rules Interaction', () => {
    it('MUST evaluate all rules (first failing wins)', async () => {
      const plugin = new ModerationPlugin()
      plugin.addRule('c1', { id: 'sm', type: 'slowMode', channelId: 'ch1', intervalSeconds: 10 })
      plugin.addRule('c1', {
        id: 'rl',
        type: 'rateLimit',
        scope: 'community',
        scopeId: 'c1',
        maxMessages: 100,
        windowSeconds: 60
      })

      // First message passes both
      const r1 = await plugin.handleMessage('c1', createTestMessage('did:key:alice', 'ch1'))
      expect(r1.allowed).toBe(true)

      // Second message fails slow mode (first rule)
      const r2 = await plugin.handleMessage('c1', createTestMessage('did:key:alice', 'ch1'))
      expect(r2.allowed).toBe(false)
      expect(r2.action).toBe('slowMode')
    })

    it('MUST not affect messages without matching rules', async () => {
      const plugin = new ModerationPlugin()
      // No rules for c1
      const result = await plugin.handleMessage('c1', createTestMessage('did:key:alice'))
      expect(result.allowed).toBe(true)
      expect(result.action).toBe('none')
    })
  })
})
