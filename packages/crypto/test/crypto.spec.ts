import { describe, it, expect } from 'vitest'
import { createCryptoProvider } from '../src/index.js'

const crypto = createCryptoProvider()

describe('@harmony/crypto', () => {
  describe('Key Generation', () => {
    it('MUST generate unique Ed25519 keypairs', async () => {
      const kp1 = await crypto.generateSigningKeyPair()
      const kp2 = await crypto.generateSigningKeyPair()
      expect(kp1.type).toBe('Ed25519')
      expect(kp1.publicKey).toHaveLength(32)
      expect(kp1.secretKey).toHaveLength(32)
      expect(kp1.publicKey).not.toEqual(kp2.publicKey)
    })

    it('MUST generate unique X25519 keypairs', async () => {
      const kp1 = await crypto.generateEncryptionKeyPair()
      const kp2 = await crypto.generateEncryptionKeyPair()
      expect(kp1.type).toBe('X25519')
      expect(kp1.publicKey).toHaveLength(32)
      expect(kp1.publicKey).not.toEqual(kp2.publicKey)
    })

    it('MUST derive X25519 from Ed25519 deterministically', async () => {
      const signing = await crypto.generateSigningKeyPair()
      const enc1 = await crypto.deriveEncryptionKeyPair(signing)
      const enc2 = await crypto.deriveEncryptionKeyPair(signing)
      expect(enc1.type).toBe('X25519')
      expect(enc1.publicKey).toEqual(enc2.publicKey)
      expect(enc1.secretKey).toEqual(enc2.secretKey)
    })
  })

  describe('Signing', () => {
    it('MUST produce valid Ed25519 signatures', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const data = new TextEncoder().encode('hello')
      const sig = await crypto.sign(data, kp.secretKey)
      expect(sig).toHaveLength(64)
    })

    it('MUST verify valid signatures', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const data = new TextEncoder().encode('hello')
      const sig = await crypto.sign(data, kp.secretKey)
      expect(await crypto.verify(data, sig, kp.publicKey)).toBe(true)
    })

    it('MUST reject invalid signatures', async () => {
      const kp = await crypto.generateSigningKeyPair()
      const data = new TextEncoder().encode('hello')
      const sig = await crypto.sign(data, kp.secretKey)
      sig[0] ^= 0xff
      expect(await crypto.verify(data, sig, kp.publicKey)).toBe(false)
    })

    it('MUST reject signatures from wrong key', async () => {
      const kp1 = await crypto.generateSigningKeyPair()
      const kp2 = await crypto.generateSigningKeyPair()
      const data = new TextEncoder().encode('hello')
      const sig = await crypto.sign(data, kp1.secretKey)
      expect(await crypto.verify(data, sig, kp2.publicKey)).toBe(false)
    })
  })

  describe('Encryption', () => {
    it('MUST encrypt/decrypt with X25519 + XChaCha20-Poly1305', async () => {
      const sender = await crypto.generateEncryptionKeyPair()
      const recipient = await crypto.generateEncryptionKeyPair()
      const plaintext = new TextEncoder().encode('secret message')
      const encrypted = await crypto.encrypt(plaintext, recipient.publicKey, sender.secretKey)
      const decrypted = await crypto.decrypt(encrypted, sender.publicKey, recipient.secretKey)
      expect(decrypted).toEqual(plaintext)
    })

    it('MUST fail decryption with wrong key', async () => {
      const sender = await crypto.generateEncryptionKeyPair()
      const recipient = await crypto.generateEncryptionKeyPair()
      const wrong = await crypto.generateEncryptionKeyPair()
      const plaintext = new TextEncoder().encode('secret')
      const encrypted = await crypto.encrypt(plaintext, recipient.publicKey, sender.secretKey)
      await expect(crypto.decrypt(encrypted, sender.publicKey, wrong.secretKey)).rejects.toThrow()
    })

    it('MUST fail decryption with tampered ciphertext', async () => {
      const sender = await crypto.generateEncryptionKeyPair()
      const recipient = await crypto.generateEncryptionKeyPair()
      const plaintext = new TextEncoder().encode('secret')
      const encrypted = await crypto.encrypt(plaintext, recipient.publicKey, sender.secretKey)
      encrypted.ciphertext[0] ^= 0xff
      await expect(crypto.decrypt(encrypted, sender.publicKey, recipient.secretKey)).rejects.toThrow()
    })

    it('MUST produce unique nonces per encryption', async () => {
      const sender = await crypto.generateEncryptionKeyPair()
      const recipient = await crypto.generateEncryptionKeyPair()
      const plaintext = new TextEncoder().encode('same')
      const e1 = await crypto.encrypt(plaintext, recipient.publicKey, sender.secretKey)
      const e2 = await crypto.encrypt(plaintext, recipient.publicKey, sender.secretKey)
      expect(e1.nonce).not.toEqual(e2.nonce)
    })
  })

  describe('Symmetric Encryption', () => {
    it('MUST encrypt/decrypt with XChaCha20-Poly1305', async () => {
      const key = new Uint8Array(32)
      key.fill(1)
      const plaintext = new TextEncoder().encode('symmetric test')
      const encrypted = await crypto.symmetricEncrypt(plaintext, key)
      const decrypted = await crypto.symmetricDecrypt(encrypted, key)
      expect(decrypted).toEqual(plaintext)
    })

    it('MUST fail decryption with wrong key', async () => {
      const key = new Uint8Array(32).fill(1)
      const wrongKey = new Uint8Array(32).fill(2)
      const plaintext = new TextEncoder().encode('test')
      const encrypted = await crypto.symmetricEncrypt(plaintext, key)
      await expect(crypto.symmetricDecrypt(encrypted, wrongKey)).rejects.toThrow()
    })
  })

  describe('Key Derivation', () => {
    it('MUST derive deterministic keys from same input', async () => {
      const secret = new Uint8Array(32).fill(1)
      const salt = new Uint8Array(16).fill(2)
      const k1 = await crypto.deriveKey(secret, salt, 'test')
      const k2 = await crypto.deriveKey(secret, salt, 'test')
      expect(k1).toEqual(k2)
    })

    it('MUST derive different keys from different salts/info', async () => {
      const secret = new Uint8Array(32).fill(1)
      const salt1 = new Uint8Array(16).fill(2)
      const salt2 = new Uint8Array(16).fill(3)
      const k1 = await crypto.deriveKey(secret, salt1, 'test')
      const k2 = await crypto.deriveKey(secret, salt2, 'test')
      const k3 = await crypto.deriveKey(secret, salt1, 'other')
      expect(k1).not.toEqual(k2)
      expect(k1).not.toEqual(k3)
    })
  })

  describe('Mnemonic', () => {
    it('MUST generate valid BIP-39 mnemonics', () => {
      const mnemonic = crypto.generateMnemonic()
      expect(mnemonic.split(' ')).toHaveLength(12)
    })

    it('MUST derive deterministic seed from mnemonic', async () => {
      const mnemonic = crypto.generateMnemonic()
      const s1 = await crypto.mnemonicToSeed(mnemonic)
      const s2 = await crypto.mnemonicToSeed(mnemonic)
      expect(s1).toEqual(s2)
      expect(s1).toHaveLength(32)
    })

    it('MUST derive deterministic keypair from seed', async () => {
      const mnemonic = crypto.generateMnemonic()
      const seed = await crypto.mnemonicToSeed(mnemonic)
      const kp1 = await crypto.seedToKeyPair(seed)
      const kp2 = await crypto.seedToKeyPair(seed)
      expect(kp1.publicKey).toEqual(kp2.publicKey)
      expect(kp1.secretKey).toEqual(kp2.secretKey)
      expect(kp1.type).toBe('Ed25519')
    })
  })
})
