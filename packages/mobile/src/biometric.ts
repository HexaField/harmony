export interface BiometricAuth {
  isAvailable(): Promise<boolean>
  authenticate(reason: string): Promise<boolean>
  enableForKeyAccess(): Promise<void>
  disableForKeyAccess(): Promise<void>
}

export class InMemoryBiometricAuth implements BiometricAuth {
  private available = true
  private keyAccessEnabled = false
  private shouldSucceed = true

  async isAvailable(): Promise<boolean> {
    return this.available
  }

  async authenticate(reason: string): Promise<boolean> {
    if (!this.available) return false
    return this.shouldSucceed
  }

  async enableForKeyAccess(): Promise<void> {
    this.keyAccessEnabled = true
  }

  async disableForKeyAccess(): Promise<void> {
    this.keyAccessEnabled = false
  }

  isKeyAccessEnabled(): boolean {
    return this.keyAccessEnabled
  }

  // Test helpers
  setAvailable(available: boolean): void {
    this.available = available
  }

  setShouldSucceed(succeed: boolean): void {
    this.shouldSucceed = succeed
  }
}
