// VP verification using WebCrypto (no node:crypto)
// Verifies Verifiable Presentations for WebSocket authentication

import { base64ToUint8Array } from '@harmony/protocol'

export interface VerifiablePresentation {
  '@context': string[]
  type: string[]
  verifiableCredential: VerifiableCredential[]
  holder: string
  proof: VPProof
}

export interface VerifiableCredential {
  '@context': string[]
  type: string[]
  issuer: string
  issuanceDate: string
  credentialSubject: {
    id: string
    [key: string]: unknown
  }
  proof?: {
    type: string
    created: string
    verificationMethod: string
    proofPurpose: string
    proofValue: string
  }
}

export interface VPProof {
  type: string
  created: string
  verificationMethod: string
  proofPurpose: string
  proofValue: string
}

/**
 * Extract the DID from a VP's holder field.
 */
export function extractDID(vp: VerifiablePresentation): string | null {
  return vp.holder || null
}

/**
 * Parse a VP from a JSON string.
 */
export function parseVP(json: string): VerifiablePresentation | null {
  try {
    const parsed = JSON.parse(json)
    if (parsed.type?.includes('VerifiablePresentation') && parsed.holder) {
      return parsed as VerifiablePresentation
    }
    return null
  } catch {
    return null
  }
}

/**
 * Extract public key bytes from a did:key DID.
 * Supports Ed25519 (multicodec prefix 0xed01).
 */
export function extractPublicKeyFromDIDKey(did: string): Uint8Array | null {
  if (!did.startsWith('did:key:z')) return null
  try {
    // Remove 'did:key:' prefix, decode multibase (z = base58btc)
    const multibaseEncoded = did.slice(8) // after 'did:key:'
    const decoded = base58Decode(multibaseEncoded.slice(1)) // skip 'z' multibase prefix
    // Skip multicodec prefix (0xed 0x01 for Ed25519)
    if (decoded[0] === 0xed && decoded[1] === 0x01) {
      return decoded.slice(2)
    }
    return null
  } catch {
    return null
  }
}

/**
 * Verify an Ed25519 signature using WebCrypto.
 */
export async function verifyEd25519Signature(
  publicKeyBytes: Uint8Array,
  signatureBytes: Uint8Array,
  messageBytes: Uint8Array
): Promise<boolean> {
  try {
    const keyBuffer = publicKeyBytes.buffer.slice(
      publicKeyBytes.byteOffset,
      publicKeyBytes.byteOffset + publicKeyBytes.byteLength
    ) as ArrayBuffer
    const key = await crypto.subtle.importKey('raw', keyBuffer, { name: 'Ed25519' }, false, ['verify'])
    const sigBuffer = signatureBytes.buffer.slice(
      signatureBytes.byteOffset,
      signatureBytes.byteOffset + signatureBytes.byteLength
    ) as ArrayBuffer
    const msgBuffer = messageBytes.buffer.slice(
      messageBytes.byteOffset,
      messageBytes.byteOffset + messageBytes.byteLength
    ) as ArrayBuffer
    return await crypto.subtle.verify('Ed25519', key, sigBuffer, msgBuffer)
  } catch {
    return false
  }
}

/**
 * Verify a VP's proof signature.
 * Returns the holder DID if valid, null otherwise.
 */
export async function verifyVP(vp: VerifiablePresentation): Promise<string | null> {
  const did = extractDID(vp)
  if (!did) return null

  const proof = vp.proof
  if (!proof || proof.type !== 'Ed25519Signature2020') return null

  const publicKeyBytes = extractPublicKeyFromDIDKey(did)
  if (!publicKeyBytes) return null

  const signatureBytes = base64ToUint8Array(proof.proofValue)

  // Create the verification message (simplified: hash of VP without proof)
  const vpWithoutProof = { ...vp, proof: undefined }
  const messageBytes = new TextEncoder().encode(JSON.stringify(vpWithoutProof))

  const valid = await verifyEd25519Signature(publicKeyBytes, signatureBytes, messageBytes)
  return valid ? did : null
}

// Base58btc decode (minimal implementation)
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function base58Decode(input: string): Uint8Array {
  const bytes: number[] = [0]
  for (const char of input) {
    const carry = BASE58_ALPHABET.indexOf(char)
    if (carry < 0) throw new Error('Invalid base58 character')
    for (let j = 0; j < bytes.length; j++) {
      const x = bytes[j] * 58 + carry
      bytes[j] = x & 0xff
      if (j + 1 === bytes.length && x > 0xff) bytes.push(0)
      // propagate carry
      if (j + 1 < bytes.length) bytes[j + 1] += x >> 8
      bytes[j] = x & 0xff
    }
    // Re-do properly
  }
  // Simpler approach
  let num = BigInt(0)
  for (const char of input) {
    const idx = BASE58_ALPHABET.indexOf(char)
    if (idx < 0) throw new Error('Invalid base58 character')
    num = num * 58n + BigInt(idx)
  }

  const hex = num.toString(16).padStart(2, '0')
  const paddedHex = hex.length % 2 ? '0' + hex : hex
  const result: number[] = []

  // Leading zeros
  for (const char of input) {
    if (char === '1') result.push(0)
    else break
  }

  for (let i = 0; i < paddedHex.length; i += 2) {
    result.push(parseInt(paddedHex.slice(i, i + 2), 16))
  }

  return new Uint8Array(result)
}
