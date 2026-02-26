/**
 * E2EE Bridge — bridges MLS group keys to LiveKit E2EE.
 * In production, this derives the LiveKit E2EE key from the MLS epoch secret.
 * Tests verify the bridge interface.
 */
export class E2EEBridge {
  private currentKey: Uint8Array | null = null
  private epoch = 0

  setGroupKey(key: Uint8Array, epoch: number): void {
    this.currentKey = key
    this.epoch = epoch
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
  }

  hasKey(): boolean {
    return this.currentKey !== null
  }

  /**
   * Creates an encoded transform for WebRTC Insertable Streams.
   * In production, this encrypts/decrypts media frames using the MLS group key.
   * Requires browser support for RTCRtpScriptTransform / Insertable Streams API.
   */
  createEncodedTransform(direction: 'sender' | 'receiver', key?: Uint8Array): { direction: string; hasKey: boolean } {
    const activeKey = key ?? this.currentKey
    // In production: return a TransformStream that encrypts/decrypts frames
    // For MVP: return metadata indicating transform readiness
    return {
      direction,
      hasKey: activeKey !== null
    }
  }
}
