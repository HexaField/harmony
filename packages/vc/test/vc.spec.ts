import { describe, it, expect } from 'vitest'
import { createCryptoProvider } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import { VCService, MemoryRevocationStore, vcToQuads } from '../src/index.js'

const crypto = createCryptoProvider()
const didProvider = new DIDKeyProvider(crypto)
const vcService = new VCService(crypto)

async function createTestIdentity() {
  const kp = await crypto.generateSigningKeyPair()
  const doc = await didProvider.create(kp)
  return { kp, doc, did: doc.id }
}

const resolver = (did: string) => didProvider.resolve(did)

describe('@harmony/vc', () => {
  describe('Issuance', () => {
    it('MUST include @context with VC context URL', async () => {
      const issuer = await createTestIdentity()
      const subject = await createTestIdentity()
      const vc = await vcService.issue({
        issuerDID: issuer.did,
        issuerKeyPair: issuer.kp,
        subjectDID: subject.did,
        type: 'TestCredential',
        claims: { name: 'Alice' }
      })
      expect(vc['@context']).toContain('https://www.w3.org/2018/credentials/v1')
    })

    it('MUST include type array with VerifiableCredential', async () => {
      const issuer = await createTestIdentity()
      const subject = await createTestIdentity()
      const vc = await vcService.issue({
        issuerDID: issuer.did,
        issuerKeyPair: issuer.kp,
        subjectDID: subject.did,
        type: 'TestCredential',
        claims: {}
      })
      expect(vc.type).toContain('VerifiableCredential')
      expect(vc.type).toContain('TestCredential')
    })

    it('MUST include issuer as DID string', async () => {
      const issuer = await createTestIdentity()
      const subject = await createTestIdentity()
      const vc = await vcService.issue({
        issuerDID: issuer.did,
        issuerKeyPair: issuer.kp,
        subjectDID: subject.did,
        type: 'Test',
        claims: {}
      })
      expect(vc.issuer).toBe(issuer.did)
    })

    it('MUST include issuanceDate as ISO 8601', async () => {
      const issuer = await createTestIdentity()
      const subject = await createTestIdentity()
      const vc = await vcService.issue({
        issuerDID: issuer.did,
        issuerKeyPair: issuer.kp,
        subjectDID: subject.did,
        type: 'Test',
        claims: {}
      })
      expect(new Date(vc.issuanceDate).toISOString()).toBe(vc.issuanceDate)
    })

    it('MUST include credentialSubject with id', async () => {
      const issuer = await createTestIdentity()
      const subject = await createTestIdentity()
      const vc = await vcService.issue({
        issuerDID: issuer.did,
        issuerKeyPair: issuer.kp,
        subjectDID: subject.did,
        type: 'Test',
        claims: { name: 'Bob' }
      })
      expect(vc.credentialSubject.id).toBe(subject.did)
      expect(vc.credentialSubject.name).toBe('Bob')
    })

    it('MUST include proof with valid signature', async () => {
      const issuer = await createTestIdentity()
      const subject = await createTestIdentity()
      const vc = await vcService.issue({
        issuerDID: issuer.did,
        issuerKeyPair: issuer.kp,
        subjectDID: subject.did,
        type: 'Test',
        claims: {}
      })
      expect(vc.proof.type).toBe('Ed25519Signature2020')
      expect(vc.proof.proofPurpose).toBe('assertionMethod')
      expect(vc.proof.proofValue).toMatch(/^z/)
    })

    it('MUST produce unique credential IDs', async () => {
      const issuer = await createTestIdentity()
      const subject = await createTestIdentity()
      const vc1 = await vcService.issue({
        issuerDID: issuer.did,
        issuerKeyPair: issuer.kp,
        subjectDID: subject.did,
        type: 'Test',
        claims: {}
      })
      const vc2 = await vcService.issue({
        issuerDID: issuer.did,
        issuerKeyPair: issuer.kp,
        subjectDID: subject.did,
        type: 'Test',
        claims: {}
      })
      expect(vc1.id).not.toBe(vc2.id)
    })
  })

  describe('Verification', () => {
    it('MUST verify valid credential', async () => {
      const issuer = await createTestIdentity()
      const subject = await createTestIdentity()
      const vc = await vcService.issue({
        issuerDID: issuer.did,
        issuerKeyPair: issuer.kp,
        subjectDID: subject.did,
        type: 'Test',
        claims: { x: 1 }
      })
      const result = await vcService.verify(vc, resolver)
      expect(result.valid).toBe(true)
    })

    it('MUST reject credential with tampered claims', async () => {
      const issuer = await createTestIdentity()
      const subject = await createTestIdentity()
      const vc = await vcService.issue({
        issuerDID: issuer.did,
        issuerKeyPair: issuer.kp,
        subjectDID: subject.did,
        type: 'Test',
        claims: { x: 1 }
      })
      vc.credentialSubject.x = 999
      const result = await vcService.verify(vc, resolver)
      expect(result.valid).toBe(false)
    })

    it('MUST reject credential signed by wrong key', async () => {
      const issuer = await createTestIdentity()
      const wrong = await createTestIdentity()
      const subject = await createTestIdentity()
      // Issue with wrong key but claim issuer DID
      const vc = await vcService.issue({
        issuerDID: issuer.did,
        issuerKeyPair: wrong.kp,
        subjectDID: subject.did,
        type: 'Test',
        claims: {}
      })
      const result = await vcService.verify(vc, resolver)
      expect(result.valid).toBe(false)
    })

    it('MUST reject expired credential', async () => {
      const issuer = await createTestIdentity()
      const subject = await createTestIdentity()
      const vc = await vcService.issue({
        issuerDID: issuer.did,
        issuerKeyPair: issuer.kp,
        subjectDID: subject.did,
        type: 'Test',
        claims: {},
        expirationDate: '2020-01-01T00:00:00Z'
      })
      const result = await vcService.verify(vc, resolver)
      expect(result.valid).toBe(false)
      expect(result.checks.find((c) => c.name === 'expiration')?.passed).toBe(false)
    })

    it('MUST reject credential with unresolvable issuer DID', async () => {
      const issuer = await createTestIdentity()
      const subject = await createTestIdentity()
      const vc = await vcService.issue({
        issuerDID: issuer.did,
        issuerKeyPair: issuer.kp,
        subjectDID: subject.did,
        type: 'Test',
        claims: {}
      })
      const failResolver = async () => null
      const result = await vcService.verify(vc, failResolver)
      expect(result.valid).toBe(false)
    })

    it('MUST check revocation status', async () => {
      const issuer = await createTestIdentity()
      const subject = await createTestIdentity()
      const vc = await vcService.issue({
        issuerDID: issuer.did,
        issuerKeyPair: issuer.kp,
        subjectDID: subject.did,
        type: 'Test',
        claims: {}
      })
      const store = new MemoryRevocationStore()
      await store.revoke(vc.id)
      const result = await vcService.verify(vc, resolver, store)
      expect(result.valid).toBe(false)
    })
  })

  describe('Presentation', () => {
    it('MUST wrap credentials in VerifiablePresentation', async () => {
      const issuer = await createTestIdentity()
      const holder = await createTestIdentity()
      const vc = await vcService.issue({
        issuerDID: issuer.did,
        issuerKeyPair: issuer.kp,
        subjectDID: holder.did,
        type: 'Test',
        claims: {}
      })
      const vp = await vcService.present({ holderDID: holder.did, holderKeyPair: holder.kp, credentials: [vc] })
      expect(vp.type).toContain('VerifiablePresentation')
      expect(vp.verifiableCredential).toHaveLength(1)
    })

    it('MUST verify valid presentation', async () => {
      const issuer = await createTestIdentity()
      const holder = await createTestIdentity()
      const vc = await vcService.issue({
        issuerDID: issuer.did,
        issuerKeyPair: issuer.kp,
        subjectDID: holder.did,
        type: 'Test',
        claims: {}
      })
      const vp = await vcService.present({ holderDID: holder.did, holderKeyPair: holder.kp, credentials: [vc] })
      const result = await vcService.verifyPresentation(vp, resolver)
      expect(result.valid).toBe(true)
    })

    it('MUST reject presentation with tampered proof', async () => {
      const issuer = await createTestIdentity()
      const holder = await createTestIdentity()
      const vc = await vcService.issue({
        issuerDID: issuer.did,
        issuerKeyPair: issuer.kp,
        subjectDID: holder.did,
        type: 'Test',
        claims: {}
      })
      const vp = await vcService.present({ holderDID: holder.did, holderKeyPair: holder.kp, credentials: [vc] })
      vp.proof.proofValue = 'zinvalid'
      const result = await vcService.verifyPresentation(vp, resolver)
      expect(result.valid).toBe(false)
    })
  })

  describe('Revocation', () => {
    it('MUST mark credential as revoked', async () => {
      const issuer = await createTestIdentity()
      const subject = await createTestIdentity()
      const vc = await vcService.issue({
        issuerDID: issuer.did,
        issuerKeyPair: issuer.kp,
        subjectDID: subject.did,
        type: 'Test',
        claims: {}
      })
      const store = new MemoryRevocationStore()
      await vcService.revoke(vc, issuer.kp, store)
      expect(await vcService.isRevoked(vc, store)).toBe(true)
    })

    it('MUST list all revocations', async () => {
      const store = new MemoryRevocationStore()
      await store.revoke('cred:1')
      await store.revoke('cred:2')
      const list = await store.list()
      expect(list).toHaveLength(2)
    })
  })

  describe('Quad Representation', () => {
    it('MUST serialise VC as RDF quads', async () => {
      const issuer = await createTestIdentity()
      const subject = await createTestIdentity()
      const vc = await vcService.issue({
        issuerDID: issuer.did,
        issuerKeyPair: issuer.kp,
        subjectDID: subject.did,
        type: 'Test',
        claims: { role: 'admin' }
      })
      const quads = vcToQuads(vc)
      expect(quads.length).toBeGreaterThan(0)
      expect(quads.some((q) => q.graph === vc.id)).toBe(true)
    })
  })
})
