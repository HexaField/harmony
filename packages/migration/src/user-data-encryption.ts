// User data encryption — client-side encrypt/decrypt for personal data claims
// Server never sees plaintext. Key derived from user's mnemonic.

import type { CryptoProvider, EncryptedPayload } from '@harmony/crypto'

const STORAGE_KEY_SALT = 'harmony-user-data-v1'

export interface UserDataPayload {
  ciphertext: Uint8Array
  nonce: Uint8Array
  version: number
}

/**
 * Derive a deterministic symmetric key from the user's mnemonic.
 * Uses HKDF via the CryptoProvider with a fixed salt and info string.
 */
export async function deriveStorageKey(crypto: CryptoProvider, mnemonic: string): Promise<Uint8Array> {
  const seed = await crypto.mnemonicToSeed(mnemonic)
  const salt = new TextEncoder().encode(STORAGE_KEY_SALT)
  return crypto.deriveKey(seed, salt, 'harmony-user-data-encryption')
}

/**
 * Encrypt user data (serialized N-Quads string) with the storage key.
 */
export async function encryptUserData(crypto: CryptoProvider, data: string, key: Uint8Array): Promise<UserDataPayload> {
  const plaintext = new TextEncoder().encode(data)
  const encrypted = await crypto.symmetricEncrypt(plaintext, key)
  return {
    ciphertext: encrypted.ciphertext,
    nonce: encrypted.nonce,
    version: 1
  }
}

/**
 * Decrypt user data back to an N-Quads string.
 */
export async function decryptUserData(
  crypto: CryptoProvider,
  payload: UserDataPayload,
  key: Uint8Array
): Promise<string> {
  const encrypted: EncryptedPayload = {
    ciphertext: payload.ciphertext,
    nonce: payload.nonce
  }
  const plaintext = await crypto.symmetricDecrypt(encrypted, key)
  return new TextDecoder().decode(plaintext)
}
