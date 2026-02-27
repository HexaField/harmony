import type { BiometricAuth } from './biometric.js'
import { InMemoryBiometricAuth } from './biometric.js'

async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export class CapacitorBiometricAuth implements BiometricAuth {
  private fallback = new InMemoryBiometricAuth()
  private native: boolean | null = null
  // @ts-expect-error keyAccessEnabled is set but read only by native bridge
  private keyAccessEnabled = false

  private async useNative(): Promise<boolean> {
    if (this.native === null) this.native = await isNative()
    return this.native
  }

  async isAvailable(): Promise<boolean> {
    if (!(await this.useNative())) return this.fallback.isAvailable()
    try {
      const { NativeBiometric } = await import('capacitor-native-biometric')
      const result = await NativeBiometric.isAvailable()
      return result.isAvailable
    } catch {
      return false
    }
  }

  async authenticate(reason: string): Promise<boolean> {
    if (!(await this.useNative())) return this.fallback.authenticate(reason)
    try {
      const { NativeBiometric } = await import('capacitor-native-biometric')
      await NativeBiometric.verifyIdentity({ reason, title: 'Harmony' })
      return true
    } catch {
      return false
    }
  }

  async enableForKeyAccess(): Promise<void> {
    this.keyAccessEnabled = true
  }

  async disableForKeyAccess(): Promise<void> {
    this.keyAccessEnabled = false
  }
}

export function createBiometricAuth(): BiometricAuth {
  return new CapacitorBiometricAuth()
}
