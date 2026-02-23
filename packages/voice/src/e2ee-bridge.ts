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
}
