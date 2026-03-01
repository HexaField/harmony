import type { KeyPair, CryptoProvider } from '@harmony/crypto'
import type { Quad } from '@harmony/quads'

export interface VerificationMethod {
  id: string
  type: string
  controller: string
  publicKeyMultibase: string
}

export interface ServiceEndpoint {
  id: string
  type: string
  serviceEndpoint: string
}

export interface DIDDocument {
  '@context': string[]
  id: string
  verificationMethod: VerificationMethod[]
  authentication: string[]
  assertionMethod: string[]
  keyAgreement: string[]
  service?: ServiceEndpoint[]
}

export interface DIDProvider {
  create(keyPair: KeyPair): Promise<DIDDocument>
  createFromMnemonic(mnemonic: string): Promise<{ document: DIDDocument; keyPair: KeyPair }>
  resolve(did: string): Promise<DIDDocument | null>
  addService(document: DIDDocument, service: ServiceEndpoint): DIDDocument
  addVerificationMethod(document: DIDDocument, method: VerificationMethod): DIDDocument
}

export type DIDResolver = (did: string) => Promise<DIDDocument | null>

// Multicodec prefixes
const ED25519_MULTICODEC = 0xed
const X25519_MULTICODEC = 0xec

// Base58btc alphabet
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function base58btcEncode(bytes: Uint8Array): string {
  const digits = [0]
  for (const byte of bytes) {
    let carry = byte
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8
      digits[j] = carry % 58
      carry = (carry / 58) | 0
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = (carry / 58) | 0
    }
  }
  let result = ''
  for (const byte of bytes) {
    if (byte === 0) result += '1'
    else break
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    result += BASE58_ALPHABET[digits[i]]
  }
  return result
}

function base58btcDecode(str: string): Uint8Array {
  const bytes = [0]
  for (const char of str) {
    const value = BASE58_ALPHABET.indexOf(char)
    if (value < 0) throw new Error(`Invalid base58 character: ${char}`)
    let carry = value
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58
      bytes[j] = carry & 0xff
      carry >>= 8
    }
    while (carry > 0) {
      bytes.push(carry & 0xff)
      carry >>= 8
    }
  }
  let numLeadingZeros = 0
  for (const char of str) {
    if (char === '1') numLeadingZeros++
    else break
  }
  const result = new Uint8Array(numLeadingZeros + bytes.length)
  for (let i = 0; i < bytes.length; i++) {
    result[numLeadingZeros + bytes.length - 1 - i] = bytes[i]
  }
  return result
}

function encodeMultibase(prefix: number, publicKey: Uint8Array): string {
  const multicodec = new Uint8Array(2 + publicKey.length)
  multicodec[0] = prefix
  multicodec[1] = prefix >> 8 || publicKey.length // varint for single-byte prefixes
  // Actually multicodec uses unsigned varint. For 0xed and 0xec, it's a 2-byte varint
  const varint = encodeVarint(prefix)
  const buf = new Uint8Array(varint.length + publicKey.length)
  buf.set(varint)
  buf.set(publicKey, varint.length)
  return 'z' + base58btcEncode(buf)
}

function encodeVarint(n: number): Uint8Array {
  const bytes: number[] = []
  while (n > 0x7f) {
    bytes.push((n & 0x7f) | 0x80)
    n >>>= 7
  }
  bytes.push(n & 0x7f)
  return new Uint8Array(bytes)
}

function decodeVarint(bytes: Uint8Array, offset: number = 0): [number, number] {
  let result = 0
  let shift = 0
  let pos = offset
  while (pos < bytes.length) {
    const byte = bytes[pos]
    result |= (byte & 0x7f) << shift
    pos++
    if ((byte & 0x80) === 0) break
    shift += 7
  }
  return [result, pos]
}

function decodeMultibase(multibase: string): { prefix: number; key: Uint8Array } {
  if (multibase[0] !== 'z') throw new Error('Only base58btc (z) supported')
  const bytes = base58btcDecode(multibase.slice(1))
  const [prefix, offset] = decodeVarint(bytes)
  return { prefix, key: bytes.slice(offset) }
}

export class DIDKeyProvider implements DIDProvider {
  method = 'key' as const

  private crypto: CryptoProvider

  constructor(crypto: CryptoProvider) {
    this.crypto = crypto
  }

  async create(keyPair: KeyPair): Promise<DIDDocument> {
    const multibase = encodeMultibase(ED25519_MULTICODEC, keyPair.publicKey)
    const did = `did:key:${multibase}`
    const encKP = await this.crypto.deriveEncryptionKeyPair(keyPair)
    const encMultibase = encodeMultibase(X25519_MULTICODEC, encKP.publicKey)

    const edVM: VerificationMethod = {
      id: `${did}#${multibase}`,
      type: 'Ed25519VerificationKey2020',
      controller: did,
      publicKeyMultibase: multibase
    }

    const x25519VM: VerificationMethod = {
      id: `${did}#${encMultibase}`,
      type: 'X25519KeyAgreementKey2020',
      controller: did,
      publicKeyMultibase: encMultibase
    }

    return {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1',
        'https://w3id.org/security/suites/x25519-2020/v1'
      ],
      id: did,
      verificationMethod: [edVM, x25519VM],
      authentication: [edVM.id],
      assertionMethod: [edVM.id],
      keyAgreement: [x25519VM.id]
    }
  }

  async createFromMnemonic(mnemonic: string): Promise<{ document: DIDDocument; keyPair: KeyPair }> {
    const seed = await this.crypto.mnemonicToSeed(mnemonic)
    const keyPair = await this.crypto.seedToKeyPair(seed)
    const document = await this.create(keyPair)
    return { document, keyPair }
  }

  async resolve(did: string): Promise<DIDDocument | null> {
    if (!did.startsWith('did:key:z')) return null
    try {
      const multibase = did.replace('did:key:', '')
      const { prefix, key } = decodeMultibase(multibase)
      if (prefix !== ED25519_MULTICODEC) return null
      const RESOLVE_ONLY_MARKER = new Uint8Array(32)
      RESOLVE_ONLY_MARKER[0] = 0xff // Marker: this key pair is resolve-only, secretKey must never be used for signing
      const keyPair: KeyPair = {
        publicKey: key,
        secretKey: RESOLVE_ONLY_MARKER,
        type: 'Ed25519'
      }
      // We need to derive X25519 from ed25519 public key
      const encKP = await this.crypto.deriveEncryptionKeyPair(keyPair)
      const encMultibase = encodeMultibase(X25519_MULTICODEC, encKP.publicKey)

      const edVM: VerificationMethod = {
        id: `${did}#${multibase}`,
        type: 'Ed25519VerificationKey2020',
        controller: did,
        publicKeyMultibase: multibase
      }
      const x25519VM: VerificationMethod = {
        id: `${did}#${encMultibase}`,
        type: 'X25519KeyAgreementKey2020',
        controller: did,
        publicKeyMultibase: encMultibase
      }
      return {
        '@context': [
          'https://www.w3.org/ns/did/v1',
          'https://w3id.org/security/suites/ed25519-2020/v1',
          'https://w3id.org/security/suites/x25519-2020/v1'
        ],
        id: did,
        verificationMethod: [edVM, x25519VM],
        authentication: [edVM.id],
        assertionMethod: [edVM.id],
        keyAgreement: [x25519VM.id]
      }
    } catch {
      return null
    }
  }

  addService(document: DIDDocument, service: ServiceEndpoint): DIDDocument {
    return {
      ...document,
      service: [...(document.service || []), service]
    }
  }

  addVerificationMethod(document: DIDDocument, method: VerificationMethod): DIDDocument {
    return {
      ...document,
      verificationMethod: [...document.verificationMethod, method]
    }
  }
}

export function didDocumentToQuads(doc: DIDDocument): Quad[] {
  const quads: Quad[] = []
  const g = doc.id

  quads.push({
    subject: doc.id,
    predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
    object: 'https://www.w3.org/ns/did#DIDDocument',
    graph: g
  })

  for (const vm of doc.verificationMethod) {
    quads.push({ subject: doc.id, predicate: 'https://www.w3.org/ns/did#verificationMethod', object: vm.id, graph: g })
    quads.push({
      subject: vm.id,
      predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
      object: vm.type,
      graph: g
    })
    quads.push({ subject: vm.id, predicate: 'https://www.w3.org/ns/did#controller', object: vm.controller, graph: g })
    quads.push({
      subject: vm.id,
      predicate: 'https://www.w3.org/ns/did#publicKeyMultibase',
      object: { value: vm.publicKeyMultibase },
      graph: g
    })
  }

  for (const auth of doc.authentication) {
    quads.push({ subject: doc.id, predicate: 'https://www.w3.org/ns/did#authentication', object: auth, graph: g })
  }
  for (const am of doc.assertionMethod) {
    quads.push({ subject: doc.id, predicate: 'https://www.w3.org/ns/did#assertionMethod', object: am, graph: g })
  }
  for (const ka of doc.keyAgreement) {
    quads.push({ subject: doc.id, predicate: 'https://www.w3.org/ns/did#keyAgreement', object: ka, graph: g })
  }

  return quads
}

export function didDocumentFromQuads(quads: Quad[]): DIDDocument | null {
  const docQuad = quads.find(
    (q) =>
      q.predicate === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' &&
      q.object === 'https://www.w3.org/ns/did#DIDDocument'
  )
  if (!docQuad) return null
  const did = docQuad.subject

  const vmIds = quads
    .filter((q) => q.subject === did && q.predicate === 'https://www.w3.org/ns/did#verificationMethod')
    .map((q) => (typeof q.object === 'string' ? q.object : q.object.value))

  const verificationMethod: VerificationMethod[] = vmIds.map((vmId) => {
    const typeQ = quads.find(
      (q) => q.subject === vmId && q.predicate === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
    )
    const controllerQ = quads.find((q) => q.subject === vmId && q.predicate === 'https://www.w3.org/ns/did#controller')
    const pkQ = quads.find((q) => q.subject === vmId && q.predicate === 'https://www.w3.org/ns/did#publicKeyMultibase')
    return {
      id: vmId,
      type: typeQ ? (typeof typeQ.object === 'string' ? typeQ.object : typeQ.object.value) : '',
      controller: controllerQ
        ? typeof controllerQ.object === 'string'
          ? controllerQ.object
          : controllerQ.object.value
        : '',
      publicKeyMultibase: pkQ ? (typeof pkQ.object === 'string' ? pkQ.object : pkQ.object.value) : ''
    }
  })

  const authentication = quads
    .filter((q) => q.subject === did && q.predicate === 'https://www.w3.org/ns/did#authentication')
    .map((q) => (typeof q.object === 'string' ? q.object : q.object.value))
  const assertionMethod = quads
    .filter((q) => q.subject === did && q.predicate === 'https://www.w3.org/ns/did#assertionMethod')
    .map((q) => (typeof q.object === 'string' ? q.object : q.object.value))
  const keyAgreement = quads
    .filter((q) => q.subject === did && q.predicate === 'https://www.w3.org/ns/did#keyAgreement')
    .map((q) => (typeof q.object === 'string' ? q.object : q.object.value))

  return {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/ed25519-2020/v1',
      'https://w3id.org/security/suites/x25519-2020/v1'
    ],
    id: did,
    verificationMethod,
    authentication,
    assertionMethod,
    keyAgreement
  }
}

export { encodeMultibase, decodeMultibase, base58btcEncode, base58btcDecode, ED25519_MULTICODEC, X25519_MULTICODEC }
