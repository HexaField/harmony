import { x25519 } from '@noble/curves/ed25519'
import { xchacha20poly1305 } from '@noble/ciphers/chacha'
import { randomBytes } from '@noble/ciphers/webcrypto'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import type { KeyPair } from '@harmony/crypto'
import type { DMChannel, DMCiphertext, DMProvider } from './keypackage.js'

// ── DM Channel Implementation ──

class SimplifiedDMChannel implements DMChannel {
  recipientDID: string
  senderDID: string
  private sharedKey: Uint8Array
  private myPublicKey: Uint8Array

  constructor(senderDID: string, recipientDID: string, sharedKey: Uint8Array, myPublicKey: Uint8Array) {
    this.senderDID = senderDID
    this.recipientDID = recipientDID
    this.sharedKey = sharedKey
    this.myPublicKey = myPublicKey
  }

  async encrypt(plaintext: Uint8Array): Promise<DMCiphertext> {
    const nonce = randomBytes(24)
    const cipher = xchacha20poly1305(this.sharedKey, nonce)
    const ciphertext = cipher.encrypt(plaintext)
    return {
      ciphertext,
      nonce,
      senderPublicKey: this.myPublicKey
    }
  }

  async decrypt(ciphertext: DMCiphertext): Promise<Uint8Array> {
    const cipher = xchacha20poly1305(this.sharedKey, ciphertext.nonce)
    return cipher.decrypt(ciphertext.ciphertext)
  }
}

// ── DM Provider Implementation ──

export class SimplifiedDMProvider implements DMProvider {
  async createChannel(params: {
    senderDID: string
    senderKeyPair: KeyPair
    recipientDID: string
    recipientPublicKey: Uint8Array
  }): Promise<DMChannel> {
    const sharedSecret = x25519.getSharedSecret(params.senderKeyPair.secretKey, params.recipientPublicKey)
    const sharedKey = hkdf(sha256, sharedSecret, undefined, new TextEncoder().encode('harmony-dm-key'), 32)
    return new SimplifiedDMChannel(params.senderDID, params.recipientDID, sharedKey, params.senderKeyPair.publicKey)
  }

  async openChannel(params: {
    recipientDID: string
    recipientKeyPair: KeyPair
    senderDID: string
    senderPublicKey: Uint8Array
  }): Promise<DMChannel> {
    const sharedSecret = x25519.getSharedSecret(params.recipientKeyPair.secretKey, params.senderPublicKey)
    const sharedKey = hkdf(sha256, sharedSecret, undefined, new TextEncoder().encode('harmony-dm-key'), 32)
    return new SimplifiedDMChannel(params.recipientDID, params.senderDID, sharedKey, params.recipientKeyPair.publicKey)
  }
}
