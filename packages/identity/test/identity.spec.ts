import { describe, it, expect } from 'vitest'
import { createCryptoProvider } from '@harmony/crypto'
import { IdentityManager } from '../src/index.js'

const crypto = createCryptoProvider()
const manager = new IdentityManager(crypto)

describe('@harmony/identity', () => {
  describe('Creation', () => {
    it('MUST generate DID, keypair, and mnemonic', async () => {
      const { identity, keyPair, mnemonic } = await manager.create()
      expect(identity.did).toMatch(/^did:key:z/)
      expect(keyPair.publicKey).toHaveLength(32)
      expect(mnemonic.split(' ')).toHaveLength(12)
    })

    it('MUST create deterministic identity from mnemonic', async () => {
      const { mnemonic } = await manager.create()
      const r1 = await manager.createFromMnemonic(mnemonic)
      const r2 = await manager.createFromMnemonic(mnemonic)
      expect(r1.identity.did).toBe(r2.identity.did)
    })

    it('MUST initialise with empty credentials and capabilities', async () => {
      const { identity } = await manager.create()
      expect(identity.credentials).toEqual([])
      expect(identity.capabilities).toEqual([])
    })
  })

  describe('Credential Portfolio', () => {
    it('MUST add and retrieve credentials', async () => {
      const { identity } = await manager.create()
      const mockVC = { id: 'vc:1', type: ['VerifiableCredential', 'TestCred'] } as any
      const updated = await manager.addCredential(identity, mockVC)
      expect(manager.getCredentials(updated)).toHaveLength(1)
    })

    it('MUST filter credentials by type', async () => {
      const { identity } = await manager.create()
      const vc1 = { id: 'vc:1', type: ['VerifiableCredential', 'TypeA'] } as any
      const vc2 = { id: 'vc:2', type: ['VerifiableCredential', 'TypeB'] } as any
      let id = await manager.addCredential(identity, vc1)
      id = await manager.addCredential(id, vc2)
      expect(manager.getCredentials(id, 'TypeA')).toHaveLength(1)
    })

    it('MUST remove credentials by ID', async () => {
      const { identity } = await manager.create()
      const vc = { id: 'vc:1', type: ['VerifiableCredential'] } as any
      let id = await manager.addCredential(identity, vc)
      id = await manager.removeCredential(id, 'vc:1')
      expect(manager.getCredentials(id)).toHaveLength(0)
    })
  })

  describe('Sync Chain', () => {
    it('MUST export and import identity', async () => {
      const { identity, keyPair, mnemonic } = await manager.create()
      const payload = await manager.exportSyncPayload(identity, keyPair)
      const imported = await manager.importSyncPayload(payload, mnemonic)
      expect(imported.identity.did).toBe(identity.did)
    })

    it('MUST round-trip identity without data loss', async () => {
      const { identity, keyPair, mnemonic } = await manager.create()
      const vc = { id: 'vc:1', type: ['VerifiableCredential'], credentialSubject: { id: 'sub' } } as any
      const withVC = await manager.addCredential(identity, vc)
      const payload = await manager.exportSyncPayload(withVC, keyPair)
      const imported = await manager.importSyncPayload(payload, mnemonic)
      expect(imported.identity.credentials).toHaveLength(1)
    })

    it('MUST fail import with wrong mnemonic', async () => {
      const { identity, keyPair } = await manager.create()
      const payload = await manager.exportSyncPayload(identity, keyPair)
      const wrongMnemonic = crypto.generateMnemonic()
      await expect(manager.importSyncPayload(payload, wrongMnemonic)).rejects.toThrow()
    })
  })

  describe('Social Recovery', () => {
    it('MUST configure with N trusted DIDs and threshold', async () => {
      const { identity, keyPair } = await manager.create()
      const trustedDIDs = ['did:key:z1', 'did:key:z2', 'did:key:z3', 'did:key:z4', 'did:key:z5']
      const config = await manager.setupRecovery({ identity, trustedDIDs, threshold: 3, keyPair })
      expect(config.trustedDIDs).toHaveLength(5)
      expect(config.threshold).toBe(3)
    })

    it('MUST require threshold approvals to complete', async () => {
      const { identity, keyPair } = await manager.create()
      const friends = await Promise.all([1, 2, 3, 4, 5].map(() => manager.create()))
      const trustedDIDs = friends.map((f) => f.identity.did)
      const config = await manager.setupRecovery({ identity, trustedDIDs, threshold: 3, keyPair })
      const request = await manager.initiateRecovery({
        claimedDID: identity.did,
        recovererDID: 'did:key:znew',
        recoveryConfig: config
      })

      // Only 2 approvals — should fail
      const approvals = await Promise.all(
        [0, 1].map((i) =>
          manager.approveRecovery({
            request,
            approverDID: friends[i].identity.did,
            approverKeyPair: friends[i].keyPair
          })
        )
      )
      const newKP = await crypto.generateSigningKeyPair()
      await expect(manager.completeRecovery({ request, approvals, newKeyPair: newKP })).rejects.toThrow('Insufficient')
    })

    it('MUST complete with sufficient approvals', async () => {
      const { identity, keyPair } = await manager.create()
      const friends = await Promise.all([1, 2, 3, 4, 5].map(() => manager.create()))
      const trustedDIDs = friends.map((f) => f.identity.did)
      const config = await manager.setupRecovery({ identity, trustedDIDs, threshold: 3, keyPair })
      const request = await manager.initiateRecovery({
        claimedDID: identity.did,
        recovererDID: 'did:key:znew',
        recoveryConfig: config
      })

      const approvals = await Promise.all(
        [0, 1, 2].map((i) =>
          manager.approveRecovery({
            request,
            approverDID: friends[i].identity.did,
            approverKeyPair: friends[i].keyPair
          })
        )
      )
      const newKP = await crypto.generateSigningKeyPair()
      const result = await manager.completeRecovery({ request, approvals, newKeyPair: newKP })
      expect(result.identity.did).toMatch(/^did:key:z/)
      expect(result.identity.did).not.toBe(identity.did)
    })

    it('MUST reject approvals from non-trusted DIDs', async () => {
      const { identity, keyPair } = await manager.create()
      const config = await manager.setupRecovery({ identity, trustedDIDs: ['did:key:z1'], threshold: 1, keyPair })
      const request = await manager.initiateRecovery({
        claimedDID: identity.did,
        recovererDID: 'did:key:znew',
        recoveryConfig: config
      })
      const untrusted = await manager.create()
      await expect(
        manager.approveRecovery({ request, approverDID: untrusted.identity.did, approverKeyPair: untrusted.keyPair })
      ).rejects.toThrow('not a trusted')
    })
  })

  describe('Quad Serialisation', () => {
    it('MUST serialise and round-trip through quads', async () => {
      const { identity } = await manager.create()
      const quads = manager.toQuads(identity)
      expect(quads.length).toBeGreaterThan(0)
      const restored = manager.fromQuads(quads)
      expect(restored.did).toBe(identity.did)
    })
  })
})
