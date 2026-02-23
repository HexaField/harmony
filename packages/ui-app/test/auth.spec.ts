import { describe, it, expect } from 'vitest'
import { createCryptoProvider } from '@harmony/crypto'
import { IdentityManager } from '@harmony/identity'
import { VCService } from '@harmony/vc'
import { createAuthVP } from '../src/auth.js'

describe('createAuthVP', () => {
  it('returns a VerifiablePresentation with correct structure', async () => {
    const crypto = createCryptoProvider()
    const idMgr = new IdentityManager(crypto)
    const { identity, keyPair } = await idMgr.create()

    const vp = await createAuthVP(identity.did, keyPair)

    expect(vp['@context']).toBeDefined()
    expect(vp.type).toEqual(['VerifiablePresentation'])
    expect(vp.holder).toBe(identity.did)
    expect(vp.verifiableCredential).toHaveLength(1)
    expect(vp.proof).toBeDefined()
    expect(vp.proof.proofValue).toBeTruthy()
  })

  it('VC has IdentityAssertion type', async () => {
    const crypto = createCryptoProvider()
    const idMgr = new IdentityManager(crypto)
    const { identity, keyPair } = await idMgr.create()

    const vp = await createAuthVP(identity.did, keyPair)
    const vc = vp.verifiableCredential[0]

    expect(vc.type).toContain('IdentityAssertion')
    expect(vc.issuer).toBe(identity.did)
    expect(vc.credentialSubject.id).toBe(identity.did)
    expect(vc.credentialSubject.type).toBe('IdentityAssertion')
  })

  it('VP signature is verifiable', async () => {
    const crypto = createCryptoProvider()
    const idMgr = new IdentityManager(crypto)
    const vcService = new VCService(crypto)
    const { identity, keyPair } = await idMgr.create()

    const vp = await createAuthVP(identity.did, keyPair)

    // Create a DID resolver for verification
    const { DIDKeyProvider } = await import('@harmony/did')
    const didProvider = new DIDKeyProvider(crypto)
    const resolver = async (did: string) => didProvider.resolve(did)

    const result = await vcService.verifyPresentation(vp, resolver)
    expect(result.valid).toBe(true)
  })

  it('VC is self-signed (issuer == subject)', async () => {
    const crypto = createCryptoProvider()
    const idMgr = new IdentityManager(crypto)
    const { identity, keyPair } = await idMgr.create()

    const vp = await createAuthVP(identity.did, keyPair)
    const vc = vp.verifiableCredential[0]

    expect(vc.issuer).toBe(vc.credentialSubject.id)
  })

  it('different identities produce different VPs', async () => {
    const crypto = createCryptoProvider()
    const idMgr = new IdentityManager(crypto)
    const r1 = await idMgr.create()
    const r2 = await idMgr.create()

    const vp1 = await createAuthVP(r1.identity.did, r1.keyPair)
    const vp2 = await createAuthVP(r2.identity.did, r2.keyPair)

    expect(vp1.holder).not.toBe(vp2.holder)
    expect(vp1.proof.proofValue).not.toBe(vp2.proof.proofValue)
  })
})
