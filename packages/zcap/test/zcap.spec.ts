import { describe, it, expect } from 'vitest'
import { createCryptoProvider } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import { MemoryRevocationStore } from '@harmony/vc'
import { ZCAPService, capabilityToQuads, invocationToQuads } from '../src/index.js'

const crypto = createCryptoProvider()
const didProvider = new DIDKeyProvider(crypto)
const zcapService = new ZCAPService(crypto)

async function createTestIdentity() {
  const kp = await crypto.generateSigningKeyPair()
  const doc = await didProvider.create(kp)
  return { kp, doc, did: doc.id }
}

const resolver = (did: string) => didProvider.resolve(did)

describe('@harmony/zcap', () => {
  describe('Root Capability', () => {
    it('MUST create root with owner as both invoker and delegator', async () => {
      const owner = await createTestIdentity()
      const root = await zcapService.createRoot({
        ownerDID: owner.did,
        ownerKeyPair: owner.kp,
        scope: { community: 'test' },
        allowedAction: ['harmony:SendMessage']
      })
      expect(root.invoker).toBe(owner.did)
      expect(root.delegator).toBe(owner.did)
    })

    it('MUST include allowed actions and scope', async () => {
      const owner = await createTestIdentity()
      const root = await zcapService.createRoot({
        ownerDID: owner.did,
        ownerKeyPair: owner.kp,
        scope: { community: 'test' },
        allowedAction: ['harmony:SendMessage', 'harmony:AddReaction']
      })
      expect(root.allowedAction).toContain('harmony:SendMessage')
      expect(root.scope.community).toBe('test')
    })

    it('MUST include valid proof signed by owner', async () => {
      const owner = await createTestIdentity()
      const root = await zcapService.createRoot({
        ownerDID: owner.did,
        ownerKeyPair: owner.kp,
        scope: {},
        allowedAction: ['harmony:SendMessage']
      })
      expect(root.proof.type).toBe('Ed25519Signature2020')
      expect(root.proof.proofValue).toMatch(/^z/)
    })
  })

  describe('Delegation', () => {
    it('MUST reference parent capability', async () => {
      const owner = await createTestIdentity()
      const delegate = await createTestIdentity()
      const root = await zcapService.createRoot({
        ownerDID: owner.did,
        ownerKeyPair: owner.kp,
        scope: { community: 'test' },
        allowedAction: ['harmony:SendMessage']
      })
      const child = await zcapService.delegate({
        parentCapability: root,
        delegatorKeyPair: owner.kp,
        invokerDID: delegate.did,
        allowedAction: ['harmony:SendMessage'],
        scope: { community: 'test' }
      })
      expect(child.parentCapability).toBe(root.id)
    })

    it('MUST allow subset of parent actions (attenuation)', async () => {
      const owner = await createTestIdentity()
      const delegate = await createTestIdentity()
      const root = await zcapService.createRoot({
        ownerDID: owner.did,
        ownerKeyPair: owner.kp,
        scope: { community: 'test' },
        allowedAction: ['harmony:SendMessage', 'harmony:AddReaction']
      })
      const child = await zcapService.delegate({
        parentCapability: root,
        delegatorKeyPair: owner.kp,
        invokerDID: delegate.did,
        allowedAction: ['harmony:SendMessage'],
        scope: { community: 'test' }
      })
      expect(child.allowedAction).toEqual(['harmony:SendMessage'])
    })

    it('MUST reject delegation that widens actions', async () => {
      const owner = await createTestIdentity()
      const delegate = await createTestIdentity()
      const root = await zcapService.createRoot({
        ownerDID: owner.did,
        ownerKeyPair: owner.kp,
        scope: {},
        allowedAction: ['harmony:SendMessage']
      })
      await expect(
        zcapService.delegate({
          parentCapability: root,
          delegatorKeyPair: owner.kp,
          invokerDID: delegate.did,
          allowedAction: ['harmony:SendMessage', 'harmony:BanUser'],
          scope: {}
        })
      ).rejects.toThrow('Cannot widen actions')
    })

    it('MUST support caveats (expiry)', async () => {
      const owner = await createTestIdentity()
      const delegate = await createTestIdentity()
      const root = await zcapService.createRoot({
        ownerDID: owner.did,
        ownerKeyPair: owner.kp,
        scope: {},
        allowedAction: ['harmony:SendMessage']
      })
      const child = await zcapService.delegate({
        parentCapability: root,
        delegatorKeyPair: owner.kp,
        invokerDID: delegate.did,
        allowedAction: ['harmony:SendMessage'],
        scope: {},
        caveats: [{ type: 'harmony:Expiry', value: '2030-01-01T00:00:00Z' }]
      })
      expect(child.caveats).toHaveLength(1)
    })

    it('MUST support multi-level delegation chains', async () => {
      const owner = await createTestIdentity()
      const mid = await createTestIdentity()
      const leaf = await createTestIdentity()
      const root = await zcapService.createRoot({
        ownerDID: owner.did,
        ownerKeyPair: owner.kp,
        scope: { community: 'test' },
        allowedAction: ['harmony:SendMessage', 'harmony:AddReaction']
      })
      const level1 = await zcapService.delegate({
        parentCapability: root,
        delegatorKeyPair: owner.kp,
        invokerDID: mid.did,
        allowedAction: ['harmony:SendMessage', 'harmony:AddReaction'],
        scope: { community: 'test' }
      })
      const level2 = await zcapService.delegate({
        parentCapability: level1,
        delegatorKeyPair: mid.kp,
        invokerDID: leaf.did,
        allowedAction: ['harmony:SendMessage'],
        scope: { community: 'test' }
      })
      expect(level2.parentCapability).toBe(level1.id)
    })
  })

  describe('Invocation', () => {
    it('MUST be signed by the capability invoker', async () => {
      const owner = await createTestIdentity()
      const root = await zcapService.createRoot({
        ownerDID: owner.did,
        ownerKeyPair: owner.kp,
        scope: {},
        allowedAction: ['harmony:SendMessage']
      })
      const inv = await zcapService.invoke({
        capability: root,
        invokerKeyPair: owner.kp,
        action: 'harmony:SendMessage',
        target: 'channel:general'
      })
      expect(inv.invoker).toBe(owner.did)
      expect(inv.proof.proofValue).toMatch(/^z/)
    })

    it('MUST specify action and target', async () => {
      const owner = await createTestIdentity()
      const root = await zcapService.createRoot({
        ownerDID: owner.did,
        ownerKeyPair: owner.kp,
        scope: {},
        allowedAction: ['harmony:SendMessage']
      })
      const inv = await zcapService.invoke({
        capability: root,
        invokerKeyPair: owner.kp,
        action: 'harmony:SendMessage',
        target: 'channel:general'
      })
      expect(inv.action).toBe('harmony:SendMessage')
      expect(inv.target).toBe('channel:general')
    })
  })

  describe('Verification', () => {
    it('MUST verify full delegation chain from root', async () => {
      const owner = await createTestIdentity()
      const delegate = await createTestIdentity()
      const root = await zcapService.createRoot({
        ownerDID: owner.did,
        ownerKeyPair: owner.kp,
        scope: { community: 'test' },
        allowedAction: ['harmony:SendMessage']
      })
      const child = await zcapService.delegate({
        parentCapability: root,
        delegatorKeyPair: owner.kp,
        invokerDID: delegate.did,
        allowedAction: ['harmony:SendMessage'],
        scope: { community: 'test' }
      })
      const inv = await zcapService.invoke({
        capability: child,
        invokerKeyPair: delegate.kp,
        action: 'harmony:SendMessage',
        target: 'channel:general'
      })
      const result = await zcapService.verifyInvocation(inv, [root, child], resolver)
      expect(result.valid).toBe(true)
    })

    it('MUST reject action not in allowed actions', async () => {
      const owner = await createTestIdentity()
      const root = await zcapService.createRoot({
        ownerDID: owner.did,
        ownerKeyPair: owner.kp,
        scope: {},
        allowedAction: ['harmony:SendMessage']
      })
      const inv = await zcapService.invoke({
        capability: root,
        invokerKeyPair: owner.kp,
        action: 'harmony:BanUser',
        target: 'user:1'
      })
      const result = await zcapService.verifyInvocation(inv, [root], resolver)
      expect(result.valid).toBe(false)
    })

    it('MUST reject expired capability (expiry caveat)', async () => {
      const owner = await createTestIdentity()
      const delegate = await createTestIdentity()
      const root = await zcapService.createRoot({
        ownerDID: owner.did,
        ownerKeyPair: owner.kp,
        scope: {},
        allowedAction: ['harmony:SendMessage']
      })
      const child = await zcapService.delegate({
        parentCapability: root,
        delegatorKeyPair: owner.kp,
        invokerDID: delegate.did,
        allowedAction: ['harmony:SendMessage'],
        scope: {},
        caveats: [{ type: 'harmony:Expiry', value: '2020-01-01T00:00:00Z' }]
      })
      const inv = await zcapService.invoke({
        capability: child,
        invokerKeyPair: delegate.kp,
        action: 'harmony:SendMessage',
        target: 'ch:1'
      })
      const result = await zcapService.verifyInvocation(inv, [root, child], resolver)
      expect(result.valid).toBe(false)
    })

    it('MUST reject revoked capability', async () => {
      const owner = await createTestIdentity()
      const root = await zcapService.createRoot({
        ownerDID: owner.did,
        ownerKeyPair: owner.kp,
        scope: {},
        allowedAction: ['harmony:SendMessage']
      })
      const store = new MemoryRevocationStore()
      await zcapService.revoke(root.id, owner.kp, store)
      const inv = await zcapService.invoke({
        capability: root,
        invokerKeyPair: owner.kp,
        action: 'harmony:SendMessage',
        target: 'ch:1'
      })
      const result = await zcapService.verifyInvocation(inv, [root], resolver, store)
      expect(result.valid).toBe(false)
    })

    it('MUST reject invocation by non-invoker', async () => {
      const owner = await createTestIdentity()
      const delegate = await createTestIdentity()
      const wrong = await createTestIdentity()
      const root = await zcapService.createRoot({
        ownerDID: owner.did,
        ownerKeyPair: owner.kp,
        scope: {},
        allowedAction: ['harmony:SendMessage']
      })
      const child = await zcapService.delegate({
        parentCapability: root,
        delegatorKeyPair: owner.kp,
        invokerDID: delegate.did,
        allowedAction: ['harmony:SendMessage'],
        scope: {}
      })
      // Wrong person invokes
      const inv = await zcapService.invoke({
        capability: child,
        invokerKeyPair: wrong.kp,
        action: 'harmony:SendMessage',
        target: 'ch:1'
      })
      const result = await zcapService.verifyInvocation(inv, [root, child], resolver)
      expect(result.valid).toBe(false)
    })
  })

  describe('Quad Representation', () => {
    it('MUST serialise capability as RDF quads', async () => {
      const owner = await createTestIdentity()
      const root = await zcapService.createRoot({
        ownerDID: owner.did,
        ownerKeyPair: owner.kp,
        scope: {},
        allowedAction: ['harmony:SendMessage']
      })
      const quads = capabilityToQuads(root)
      expect(quads.length).toBeGreaterThan(0)
    })

    it('MUST serialise invocation as RDF quads', async () => {
      const owner = await createTestIdentity()
      const root = await zcapService.createRoot({
        ownerDID: owner.did,
        ownerKeyPair: owner.kp,
        scope: {},
        allowedAction: ['harmony:SendMessage']
      })
      const inv = await zcapService.invoke({
        capability: root,
        invokerKeyPair: owner.kp,
        action: 'harmony:SendMessage',
        target: 'ch:1'
      })
      const quads = invocationToQuads(inv)
      expect(quads.length).toBeGreaterThan(0)
    })
  })
})
