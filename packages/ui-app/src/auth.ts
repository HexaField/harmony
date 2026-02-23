import type { KeyPair } from '@harmony/crypto'
import { createCryptoProvider } from '@harmony/crypto'
import { VCService } from '@harmony/vc'
import type { VerifiablePresentation } from '@harmony/vc'

/**
 * Create a Verifiable Presentation for server authentication.
 * Issues a self-signed IdentityAssertion VC and wraps it in a VP.
 */
export async function createAuthVP(did: string, keyPair: KeyPair): Promise<VerifiablePresentation> {
  const crypto = createCryptoProvider()
  const vcService = new VCService(crypto)

  // Issue self-signed identity assertion
  const vc = await vcService.issue({
    issuerDID: did,
    issuerKeyPair: keyPair,
    subjectDID: did,
    type: 'IdentityAssertion',
    claims: { type: 'IdentityAssertion' }
  })

  // Wrap in a VP
  const vp = await vcService.present({
    holderDID: did,
    holderKeyPair: keyPair,
    credentials: [vc]
  })

  return vp
}
