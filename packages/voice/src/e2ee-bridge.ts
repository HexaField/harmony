/**
 * E2EE Bridge — bridges MLS group keys to voice encryption.
 * Derives AES-256-GCM frame keys from MLS epoch secrets via HKDF.
 */
export class E2EEBridge {
  private currentKey: Uint8Array | null = null
  private currentCryptoKey: CryptoKey | null = null
  private epoch = 0
  private onEpochChangeCbs: Array<(epoch: number) => void> = []

  setGroupKey(key: Uint8Array, epoch: number): void {
    this.currentKey = key
    this.epoch = epoch
    this.currentCryptoKey = null // invalidate derived key
  }

  getEncryptionKey(): Uint8Array | null {
    return this.currentKey
  }

  getCurrentEpoch(): number {
    return this.epoch
  }

  onEpochChange(newKey: Uint8Array, newEpoch: number): void {
    this.currentKey = newKey
    this.epoch = newEpoch
    this.currentCryptoKey = null
    for (const cb of this.onEpochChangeCbs) cb(newEpoch)
  }

  addEpochChangeListener(cb: (epoch: number) => void): void {
    this.onEpochChangeCbs.push(cb)
  }

  hasKey(): boolean {
    return this.currentKey !== null
  }

  /**
   * Derives an AES-256-GCM CryptoKey from the MLS epoch secret using HKDF.
   * info = "harmony-voice-e2ee"
   */
  async deriveFrameKey(mlsEpochSecret?: Uint8Array): Promise<CryptoKey> {
    const secret = mlsEpochSecret ?? this.currentKey
    if (!secret) throw new Error('No epoch secret available')

    if (this.currentCryptoKey && !mlsEpochSecret) return this.currentCryptoKey

    const crypto = getCrypto()
    // Import the epoch secret as HKDF key material
    const keyMaterial = await crypto.subtle.importKey('raw', secret.buffer as ArrayBuffer, 'HKDF', false, ['deriveKey'])

    const info = new TextEncoder().encode('harmony-voice-e2ee')
    const salt = new Uint8Array(32) // zero salt, epoch secret has enough entropy

    const derivedKey = await crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt, info },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    )

    if (!mlsEpochSecret) this.currentCryptoKey = derivedKey
    return derivedKey
  }

  /**
   * Encrypts a media frame payload using AES-256-GCM.
   * Returns: IV (12 bytes) || ciphertext || tag
   */
  async encryptFrame(payload: Uint8Array, key?: CryptoKey): Promise<Uint8Array> {
    const cryptoKey = key ?? (await this.deriveFrameKey())
    const crypto = getCrypto()
    const iv = crypto.getRandomValues(new Uint8Array(12))

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: new Uint8Array(0) },
      cryptoKey,
      payload.buffer as ArrayBuffer
    )

    // IV (12) + ciphertext+tag
    const result = new Uint8Array(12 + encrypted.byteLength)
    result.set(iv, 0)
    result.set(new Uint8Array(encrypted), 12)
    return result
  }

  /**
   * Decrypts a media frame payload. Input: IV (12 bytes) || ciphertext || tag
   */
  async decryptFrame(data: Uint8Array, key?: CryptoKey): Promise<Uint8Array> {
    const cryptoKey = key ?? (await this.deriveFrameKey())
    const crypto = getCrypto()
    const iv = data.slice(0, 12)
    const ciphertext = data.slice(12)

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: new Uint8Array(0) },
      cryptoKey,
      ciphertext
    )

    return new Uint8Array(decrypted)
  }

  /**
   * Creates metadata about an encoded transform for WebRTC Insertable Streams.
   * In a real browser, this would return RTCRtpScriptTransform instances.
   * For non-browser environments, returns metadata.
   */
  createEncodedTransform(direction: 'sender' | 'receiver', key?: Uint8Array): { direction: string; hasKey: boolean } {
    const activeKey = key ?? this.currentKey
    return {
      direction,
      hasKey: activeKey !== null
    }
  }
}

/** Get Web Crypto API (works in Node 20+, browsers, CF Workers) */
function getCrypto(): Crypto {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    return globalThis.crypto
  }
  throw new Error('Web Crypto API not available')
}
