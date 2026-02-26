import { describe, it, expect } from 'vitest'
import { createCryptoProvider } from '@harmony/crypto'
import { MemoryQuadStore } from '@harmony/quads'
import {
  DIDKeyProvider,
  didDocumentToQuads,
  didDocumentFromQuads,
  base58btcEncode,
  base58btcDecode,
  encodeMultibase,
  decodeMultibase,
  ED25519_MULTICODEC,
  X25519_MULTICODEC
} from '../src/index.js'

const crypto = createCryptoProvider()
const didProvider = new DIDKeyProvider(crypto)

describe('@harmony/did', () => {
  describe('did:key', () => {
    it('MUST create valid did:key from Ed25519 public key', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      expect(doc.id).toMatch(/^did:key:z[1-9A-HJ-NP-Za-km-z]+$/)
    })

    it('MUST encode using multibase (base58btc, z-prefix)', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      expect(doc.id.startsWith('did:key:z')).toBe(true)
    })

    it('MUST produce deterministic DID from same key', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc1 = await didProvider.create(kp)
      const doc2 = await didProvider.create(kp)
      expect(doc1.id).toBe(doc2.id)
    })

    it('MUST resolve did:key to valid DID Document', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const resolved = await didProvider.resolve(doc.id)
      expect(resolved).not.toBeNull()
      expect(resolved!.id).toBe(doc.id)
    })

    it('DID Document MUST include Ed25519 verification method', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const edVM = doc.verificationMethod.find((vm) => vm.type === 'Ed25519VerificationKey2020')
      expect(edVM).toBeDefined()
      expect(edVM!.publicKeyMultibase).toMatch(/^z/)
    })

    it('DID Document MUST include X25519 key agreement (derived)', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const x25519VM = doc.verificationMethod.find((vm) => vm.type === 'X25519KeyAgreementKey2020')
      expect(x25519VM).toBeDefined()
      expect(doc.keyAgreement).toContain(x25519VM!.id)
    })

    it('DID Document MUST list authentication and assertionMethod', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      expect(doc.authentication).toHaveLength(1)
      expect(doc.assertionMethod).toHaveLength(1)
    })

    it('MUST reject invalid did:key strings', async () => {
      expect(await didProvider.resolve('did:key:invalid')).toBeNull()
      expect(await didProvider.resolve('did:web:example.com')).toBeNull()
    })
  })

  describe('DID Document', () => {
    it('MUST include @context', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      expect(doc['@context']).toContain('https://www.w3.org/ns/did/v1')
    })

    it('MUST add service endpoints', async () => {
      const kp = await crypto.generateSigningKeyPair()
      let doc = await didProvider.create(kp)
      doc = didProvider.addService(doc, {
        id: `${doc.id}#linked-domain`,
        type: 'LinkedDomains',
        serviceEndpoint: 'https://example.com'
      })
      expect(doc.service).toHaveLength(1)
      expect(doc.service![0].type).toBe('LinkedDomains')
    })

    it('MUST add additional verification methods', async () => {
      const kp = await crypto.generateSigningKeyPair()
      let doc = await didProvider.create(kp)
      const initialCount = doc.verificationMethod.length
      doc = didProvider.addVerificationMethod(doc, {
        id: `${doc.id}#extra`,
        type: 'Ed25519VerificationKey2020',
        controller: doc.id,
        publicKeyMultibase: 'zExtra'
      })
      expect(doc.verificationMethod).toHaveLength(initialCount + 1)
    })
  })

  describe('DID from mnemonic', () => {
    it('MUST create deterministic identity from mnemonic', async () => {
      const mnemonic = crypto.generateMnemonic()
      const r1 = await didProvider.createFromMnemonic(mnemonic)
      const r2 = await didProvider.createFromMnemonic(mnemonic)
      expect(r1.document.id).toBe(r2.document.id)
    })
  })

  describe('Quad Representation', () => {
    it('MUST serialise DID Document as RDF quads', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const quads = didDocumentToQuads(doc)
      expect(quads.length).toBeGreaterThan(0)
      expect(quads.some((q) => q.subject === doc.id)).toBe(true)
    })

    it('MUST round-trip DID Document through quads', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const quads = didDocumentToQuads(doc)
      const restored = didDocumentFromQuads(quads)
      expect(restored).not.toBeNull()
      expect(restored!.id).toBe(doc.id)
      expect(restored!.verificationMethod).toHaveLength(doc.verificationMethod.length)
    })

    it('MUST store in quad store with DID as graph', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const quads = didDocumentToQuads(doc)
      const store = new MemoryQuadStore()
      await store.addAll(quads)
      const graphs = await store.graphs()
      expect(graphs).toContain(doc.id)
    })
  })

  describe('Base58btc & Multibase', () => {
    it('MUST round-trip base58btc encode/decode', () => {
      const data = new Uint8Array([0, 1, 2, 3, 255, 128, 64])
      const encoded = base58btcEncode(data)
      const decoded = base58btcDecode(encoded)
      expect(decoded).toEqual(data)
    })

    it('MUST handle single byte in base58btc', () => {
      const data = new Uint8Array([42])
      const encoded = base58btcEncode(data)
      const decoded = base58btcDecode(encoded)
      expect(decoded).toEqual(data)
    })

    it('MUST handle leading zeros in base58btc', () => {
      const data = new Uint8Array([0, 0, 0, 1])
      const encoded = base58btcEncode(data)
      expect(encoded.startsWith('111')).toBe(true)
      const decoded = base58btcDecode(encoded)
      expect(decoded).toEqual(data)
    })

    it('base58btcDecode MUST throw on invalid characters', () => {
      expect(() => base58btcDecode('0OIl')).toThrow('Invalid base58')
    })

    it('MUST round-trip multibase encode/decode for Ed25519', () => {
      const key = new Uint8Array(32).fill(42)
      const mb = encodeMultibase(ED25519_MULTICODEC, key)
      expect(mb.startsWith('z')).toBe(true)
      const { prefix, key: decoded } = decodeMultibase(mb)
      expect(prefix).toBe(ED25519_MULTICODEC)
      expect(decoded).toEqual(key)
    })

    it('MUST round-trip multibase encode/decode for X25519', () => {
      const key = new Uint8Array(32).fill(99)
      const mb = encodeMultibase(X25519_MULTICODEC, key)
      const { prefix, key: decoded } = decodeMultibase(mb)
      expect(prefix).toBe(X25519_MULTICODEC)
      expect(decoded).toEqual(key)
    })

    it('decodeMultibase MUST throw for non-z prefix', () => {
      expect(() => decodeMultibase('m12345')).toThrow('Only base58btc')
    })
  })

  describe('Resolution Edge Cases', () => {
    it('MUST return null for did:web method', async () => {
      expect(await didProvider.resolve('did:web:example.com')).toBeNull()
    })

    it('MUST return null for empty string', async () => {
      expect(await didProvider.resolve('')).toBeNull()
    })

    it('MUST return null for malformed did:key', async () => {
      expect(await didProvider.resolve('did:key:z!!invalid!!')).toBeNull()
    })

    it('create → resolve roundtrip MUST produce matching document', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const created = await didProvider.create(kp)
      const resolved = await didProvider.resolve(created.id)
      expect(resolved).not.toBeNull()
      expect(resolved!.id).toBe(created.id)
      expect(resolved!.verificationMethod).toHaveLength(created.verificationMethod.length)
      expect(resolved!.authentication).toEqual(created.authentication)
      expect(resolved!.keyAgreement).toEqual(created.keyAgreement)
    })

    it('resolved doc verification method IDs MUST match created', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const created = await didProvider.create(kp)
      const resolved = await didProvider.resolve(created.id)
      for (let i = 0; i < created.verificationMethod.length; i++) {
        expect(resolved!.verificationMethod[i].id).toBe(created.verificationMethod[i].id)
        expect(resolved!.verificationMethod[i].publicKeyMultibase).toBe(
          created.verificationMethod[i].publicKeyMultibase
        )
      }
    })
  })

  describe('DID Document Mutation', () => {
    it('addService MUST not mutate original document', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const original = await didProvider.create(kp)
      const modified = didProvider.addService(original, {
        id: `${original.id}#svc`,
        type: 'Test',
        serviceEndpoint: 'https://example.com'
      })
      expect(original.service).toBeUndefined()
      expect(modified.service).toHaveLength(1)
    })

    it('addVerificationMethod MUST not mutate original document', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const original = await didProvider.create(kp)
      const originalLen = original.verificationMethod.length
      didProvider.addVerificationMethod(original, {
        id: `${original.id}#extra`,
        type: 'Test',
        controller: original.id,
        publicKeyMultibase: 'zTest'
      })
      expect(original.verificationMethod).toHaveLength(originalLen)
    })

    it('addService MUST support multiple services', async () => {
      const kp = await crypto.generateSigningKeyPair()
      let doc = await didProvider.create(kp)
      doc = didProvider.addService(doc, { id: `${doc.id}#s1`, type: 'A', serviceEndpoint: 'https://a.com' })
      doc = didProvider.addService(doc, { id: `${doc.id}#s2`, type: 'B', serviceEndpoint: 'https://b.com' })
      expect(doc.service).toHaveLength(2)
    })
  })

  describe('Quad Representation Edge Cases', () => {
    it('didDocumentFromQuads MUST return null for empty quads', () => {
      expect(didDocumentFromQuads([])).toBeNull()
    })

    it('didDocumentFromQuads MUST return null for quads without DIDDocument type', () => {
      const quads = [{ subject: 'did:key:z1', predicate: 'http://ex.org/p', object: 'o', graph: 'g' }]
      expect(didDocumentFromQuads(quads)).toBeNull()
    })

    it('didDocumentToQuads MUST include type quad', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const quads = didDocumentToQuads(doc)
      const typeQuad = quads.find(
        (q) =>
          q.predicate === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' &&
          q.object === 'https://www.w3.org/ns/did#DIDDocument'
      )
      expect(typeQuad).toBeDefined()
    })
  })

  describe('DID Method Expansion', () => {
    it.todo('MUST support did:web method resolution')
    it.todo('MUST support did:plc method resolution')
    it.todo('MAY support custom DID methods via plugin interface')
  })
})
