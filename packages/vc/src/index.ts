import type { KeyPair, CryptoProvider } from '@harmony/crypto'
import type { DIDDocument } from '@harmony/did'
import { base58btcEncode, base58btcDecode } from '@harmony/did'
import type { Quad } from '@harmony/quads'

export interface Proof {
  type: string
  created: string
  verificationMethod: string
  proofPurpose: string
  proofValue: string
}

export interface VerifiableCredential {
  '@context': string[]
  id: string
  type: string[]
  issuer: string
  issuanceDate: string
  expirationDate?: string
  credentialSubject: Record<string, unknown> & { id: string }
  proof: Proof
}

export interface VerifiablePresentation {
  '@context': string[]
  type: ['VerifiablePresentation']
  holder: string
  verifiableCredential: VerifiableCredential[]
  proof: Proof
}

export interface VerificationResult {
  valid: boolean
  checks: { name: string; passed: boolean; error?: string }[]
}

export interface RevocationEntry {
  credentialId: string
  reason?: string
  revokedAt: string
}

export interface RevocationStore {
  revoke(credentialId: string, reason?: string): Promise<void>
  isRevoked(credentialId: string): Promise<boolean>
  list(): Promise<RevocationEntry[]>
}

export type DIDResolver = (did: string) => Promise<DIDDocument | null>

export class MemoryRevocationStore implements RevocationStore {
  private entries: RevocationEntry[] = []

  async revoke(credentialId: string, reason?: string): Promise<void> {
    if (!this.entries.find((e) => e.credentialId === credentialId)) {
      this.entries.push({ credentialId, reason, revokedAt: new Date().toISOString() })
    }
  }

  async isRevoked(credentialId: string): Promise<boolean> {
    return this.entries.some((e) => e.credentialId === credentialId)
  }

  async list(): Promise<RevocationEntry[]> {
    return [...this.entries]
  }
}

function generateId(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function createProof(
  data: Record<string, unknown>,
  keyPair: KeyPair,
  verificationMethod: string,
  proofPurpose: string,
  crypto: CryptoProvider
): Promise<Proof> {
  const created = new Date().toISOString()
  const payload = JSON.stringify({ ...data, proofPurpose, created, verificationMethod })
  const signature = await crypto.sign(new TextEncoder().encode(payload), keyPair.secretKey)
  return {
    type: 'Ed25519Signature2020',
    created,
    verificationMethod,
    proofPurpose,
    proofValue: 'z' + base58btcEncode(signature)
  }
}

async function verifyProof(
  data: Record<string, unknown>,
  proof: Proof,
  publicKey: Uint8Array,
  crypto: CryptoProvider
): Promise<boolean> {
  const payload = JSON.stringify({
    ...data,
    proofPurpose: proof.proofPurpose,
    created: proof.created,
    verificationMethod: proof.verificationMethod
  })
  try {
    const sigBytes = base58btcDecode(proof.proofValue.slice(1))
    return crypto.verify(new TextEncoder().encode(payload), sigBytes, publicKey)
  } catch {
    return false
  }
}

function getPublicKeyFromDocument(doc: DIDDocument, vmId: string): Uint8Array | null {
  const vm = doc.verificationMethod.find((v) => v.id === vmId)
  if (!vm) return null
  if (!vm.publicKeyMultibase.startsWith('z')) return null
  const decoded = base58btcDecode(vm.publicKeyMultibase.slice(1))
  // Skip multicodec prefix (varint)
  let offset = 0
  while (offset < decoded.length && (decoded[offset] & 0x80) !== 0) offset++
  offset++ // skip last varint byte
  return decoded.slice(offset)
}

export class VCService {
  constructor(private crypto: CryptoProvider) {}

  async issue(params: {
    issuerDID: string
    issuerKeyPair: KeyPair
    subjectDID: string
    type: string
    claims: Record<string, unknown>
    expirationDate?: string
  }): Promise<VerifiableCredential> {
    const id = `urn:uuid:${generateId()}`
    const credential: Omit<VerifiableCredential, 'proof'> = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      id,
      type: ['VerifiableCredential', params.type],
      issuer: params.issuerDID,
      issuanceDate: new Date().toISOString(),
      credentialSubject: { id: params.subjectDID, ...params.claims }
    }
    if (params.expirationDate) {
      ;(credential as VerifiableCredential).expirationDate = params.expirationDate
    }

    const vmId = `${params.issuerDID}#${params.issuerDID.replace('did:key:', '')}`
    const proof = await createProof(
      credential as unknown as Record<string, unknown>,
      params.issuerKeyPair,
      vmId,
      'assertionMethod',
      this.crypto
    )

    return { ...credential, proof }
  }

  async verify(
    credential: VerifiableCredential,
    resolverFn: DIDResolver,
    revocationStore?: RevocationStore
  ): Promise<VerificationResult> {
    const checks: VerificationResult['checks'] = []

    // Check structure
    checks.push({
      name: 'structure',
      passed: !!(
        credential['@context'] &&
        credential.type?.includes('VerifiableCredential') &&
        credential.issuer &&
        credential.issuanceDate &&
        credential.credentialSubject?.id
      )
    })

    // Check expiration
    if (credential.expirationDate) {
      const expired = new Date(credential.expirationDate) < new Date()
      checks.push({ name: 'expiration', passed: !expired, error: expired ? 'Credential expired' : undefined })
    } else {
      checks.push({ name: 'expiration', passed: true })
    }

    // Resolve issuer DID
    const issuerDoc = await resolverFn(credential.issuer)
    if (!issuerDoc) {
      checks.push({ name: 'issuerResolution', passed: false, error: 'Could not resolve issuer DID' })
      return { valid: false, checks }
    }
    checks.push({ name: 'issuerResolution', passed: true })

    // Verify proof
    const publicKey = getPublicKeyFromDocument(issuerDoc, credential.proof.verificationMethod)
    if (!publicKey) {
      checks.push({ name: 'proofVerification', passed: false, error: 'Verification method not found' })
      return { valid: false, checks }
    }

    const { proof, ...dataWithoutProof } = credential
    const proofValid = await verifyProof(dataWithoutProof, proof, publicKey, this.crypto)
    checks.push({ name: 'proofVerification', passed: proofValid, error: proofValid ? undefined : 'Invalid signature' })

    // Check revocation
    if (revocationStore) {
      const revoked = await revocationStore.isRevoked(credential.id)
      checks.push({ name: 'revocation', passed: !revoked, error: revoked ? 'Credential revoked' : undefined })
    }

    return { valid: checks.every((c) => c.passed), checks }
  }

  async present(params: {
    holderDID: string
    holderKeyPair: KeyPair
    credentials: VerifiableCredential[]
  }): Promise<VerifiablePresentation> {
    const presentation: Omit<VerifiablePresentation, 'proof'> = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiablePresentation'],
      holder: params.holderDID,
      verifiableCredential: params.credentials
    }

    const vmId = `${params.holderDID}#${params.holderDID.replace('did:key:', '')}`
    const proof = await createProof(
      presentation as unknown as Record<string, unknown>,
      params.holderKeyPair,
      vmId,
      'authentication',
      this.crypto
    )

    return { ...presentation, proof }
  }

  async verifyPresentation(presentation: VerifiablePresentation, resolverFn: DIDResolver): Promise<VerificationResult> {
    const checks: VerificationResult['checks'] = []

    const holderDoc = await resolverFn(presentation.holder)
    if (!holderDoc) {
      checks.push({ name: 'holderResolution', passed: false, error: 'Could not resolve holder DID' })
      return { valid: false, checks }
    }
    checks.push({ name: 'holderResolution', passed: true })

    const publicKey = getPublicKeyFromDocument(holderDoc, presentation.proof.verificationMethod)
    if (!publicKey) {
      checks.push({ name: 'proofVerification', passed: false, error: 'Verification method not found' })
      return { valid: false, checks }
    }

    const { proof, ...dataWithoutProof } = presentation
    const proofValid = await verifyProof(dataWithoutProof, proof, publicKey, this.crypto)
    checks.push({ name: 'proofVerification', passed: proofValid, error: proofValid ? undefined : 'Invalid signature' })

    return { valid: checks.every((c) => c.passed), checks }
  }

  async revoke(
    credential: VerifiableCredential,
    _revokerKeyPair: KeyPair,
    revocationStore: RevocationStore
  ): Promise<void> {
    await revocationStore.revoke(credential.id)
  }

  async isRevoked(credential: VerifiableCredential, revocationStore: RevocationStore): Promise<boolean> {
    return revocationStore.isRevoked(credential.id)
  }
}

export function vcToQuads(vc: VerifiableCredential): Quad[] {
  const quads: Quad[] = []
  const g = vc.id
  const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'

  quads.push({
    subject: vc.id,
    predicate: RDF_TYPE,
    object: 'https://www.w3.org/2018/credentials#VerifiableCredential',
    graph: g
  })
  quads.push({ subject: vc.id, predicate: 'https://www.w3.org/2018/credentials#issuer', object: vc.issuer, graph: g })
  quads.push({
    subject: vc.id,
    predicate: 'https://www.w3.org/2018/credentials#issuanceDate',
    object: { value: vc.issuanceDate, datatype: 'http://www.w3.org/2001/XMLSchema#dateTime' },
    graph: g
  })

  for (const [key, value] of Object.entries(vc.credentialSubject)) {
    if (key === 'id') {
      quads.push({
        subject: vc.id,
        predicate: 'https://www.w3.org/2018/credentials#credentialSubject',
        object: vc.credentialSubject.id,
        graph: g
      })
    } else {
      quads.push({
        subject: vc.credentialSubject.id,
        predicate: `https://harmony.example/vocab#${key}`,
        object: { value: String(value) },
        graph: g
      })
    }
  }

  return quads
}

export { createProof, verifyProof, getPublicKeyFromDocument }
