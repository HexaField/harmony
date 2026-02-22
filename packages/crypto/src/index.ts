import { ed25519, x25519, edwardsToMontgomeryPub, edwardsToMontgomeryPriv } from '@noble/curves/ed25519'
import { xchacha20poly1305 } from '@noble/ciphers/chacha'
import { randomBytes } from '@noble/ciphers/webcrypto'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { generateMnemonic, mnemonicToSeedSync } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'

export interface KeyPair {
  publicKey: Uint8Array
  secretKey: Uint8Array
  type: KeyType
}

export type KeyType = 'Ed25519' | 'X25519'

export interface EncryptedPayload {
  ciphertext: Uint8Array
  nonce: Uint8Array
}

export interface CryptoProvider {
  generateSigningKeyPair(): Promise<KeyPair>
  generateEncryptionKeyPair(): Promise<KeyPair>
  deriveEncryptionKeyPair(signingKeyPair: KeyPair): Promise<KeyPair>
  sign(data: Uint8Array, secretKey: Uint8Array): Promise<Uint8Array>
  verify(data: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): Promise<boolean>
  encrypt(plaintext: Uint8Array, recipientPublicKey: Uint8Array, senderSecretKey: Uint8Array): Promise<EncryptedPayload>
  decrypt(payload: EncryptedPayload, senderPublicKey: Uint8Array, recipientSecretKey: Uint8Array): Promise<Uint8Array>
  symmetricEncrypt(plaintext: Uint8Array, key: Uint8Array): Promise<EncryptedPayload>
  symmetricDecrypt(payload: EncryptedPayload, key: Uint8Array): Promise<Uint8Array>
  deriveKey(secret: Uint8Array, salt: Uint8Array, info: string): Promise<Uint8Array>
  generateMnemonic(): string
  mnemonicToSeed(mnemonic: string): Promise<Uint8Array>
  seedToKeyPair(seed: Uint8Array): Promise<KeyPair>
}

export class NobleCryptoProvider implements CryptoProvider {
  async generateSigningKeyPair(): Promise<KeyPair> {
    const secretKey = ed25519.utils.randomPrivateKey()
    const publicKey = ed25519.getPublicKey(secretKey)
    return { publicKey, secretKey, type: 'Ed25519' }
  }

  async generateEncryptionKeyPair(): Promise<KeyPair> {
    const secretKey = x25519.utils.randomPrivateKey()
    const publicKey = x25519.getPublicKey(secretKey)
    return { publicKey, secretKey, type: 'X25519' }
  }

  async deriveEncryptionKeyPair(signingKeyPair: KeyPair): Promise<KeyPair> {
    const secretKey = edwardsToMontgomeryPriv(signingKeyPair.secretKey)
    const publicKey = edwardsToMontgomeryPub(signingKeyPair.publicKey)
    return { publicKey, secretKey, type: 'X25519' }
  }

  async sign(data: Uint8Array, secretKey: Uint8Array): Promise<Uint8Array> {
    return ed25519.sign(data, secretKey)
  }

  async verify(data: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): Promise<boolean> {
    try {
      return ed25519.verify(signature, data, publicKey)
    } catch {
      return false
    }
  }

  async encrypt(
    plaintext: Uint8Array,
    recipientPublicKey: Uint8Array,
    senderSecretKey: Uint8Array
  ): Promise<EncryptedPayload> {
    const sharedSecret = x25519.getSharedSecret(senderSecretKey, recipientPublicKey)
    const key = hkdf(sha256, sharedSecret, undefined, new TextEncoder().encode('harmony-encrypt'), 32)
    return this.symmetricEncrypt(plaintext, key)
  }

  async decrypt(
    payload: EncryptedPayload,
    senderPublicKey: Uint8Array,
    recipientSecretKey: Uint8Array
  ): Promise<Uint8Array> {
    const sharedSecret = x25519.getSharedSecret(recipientSecretKey, senderPublicKey)
    const key = hkdf(sha256, sharedSecret, undefined, new TextEncoder().encode('harmony-encrypt'), 32)
    return this.symmetricDecrypt(payload, key)
  }

  async symmetricEncrypt(plaintext: Uint8Array, key: Uint8Array): Promise<EncryptedPayload> {
    const nonce = randomBytes(24)
    const cipher = xchacha20poly1305(key, nonce)
    const ciphertext = cipher.encrypt(plaintext)
    return { ciphertext, nonce }
  }

  async symmetricDecrypt(payload: EncryptedPayload, key: Uint8Array): Promise<Uint8Array> {
    const cipher = xchacha20poly1305(key, payload.nonce)
    return cipher.decrypt(payload.ciphertext)
  }

  async deriveKey(secret: Uint8Array, salt: Uint8Array, info: string): Promise<Uint8Array> {
    return hkdf(sha256, secret, salt, new TextEncoder().encode(info), 32)
  }

  generateMnemonic(): string {
    return generateMnemonic(wordlist, 128)
  }

  async mnemonicToSeed(mnemonic: string): Promise<Uint8Array> {
    return mnemonicToSeedSync(mnemonic).slice(0, 32)
  }

  async seedToKeyPair(seed: Uint8Array): Promise<KeyPair> {
    const secretKey = seed.slice(0, 32)
    const publicKey = ed25519.getPublicKey(secretKey)
    return { publicKey, secretKey, type: 'Ed25519' }
  }
}

export function createCryptoProvider(): CryptoProvider {
  return new NobleCryptoProvider()
}
