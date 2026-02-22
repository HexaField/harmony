import { describe, it, expect } from 'vitest'
import { createCryptoProvider } from '@harmony/crypto'
import { MemoryQuadStore } from '@harmony/quads'
import { DIDKeyProvider, didDocumentToQuads, didDocumentFromQuads } from '../src/index.js'

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
})
