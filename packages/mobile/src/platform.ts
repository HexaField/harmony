import { InMemoryPushService } from './push.js'
import { InMemoryBackgroundSync } from './background-sync.js'
import { InMemoryBiometricAuth } from './biometric.js'
import { InMemoryShareTarget } from './share-target.js'
import type { PushNotificationService } from './push.js'
import type { BackgroundSyncService } from './background-sync.js'
import type { BiometricAuth } from './biometric.js'
import type { ShareTarget } from './share-target.js'

export interface MobileAppConfig {
  appVersion: string
  platform?: 'ios' | 'android' | 'web' | 'desktop'
}

export class MobileApp {
  notifications: PushNotificationService
  backgroundSync: BackgroundSyncService
  biometric: BiometricAuth
  shareTarget: ShareTarget

  private platform: 'ios' | 'android' | 'web' | 'desktop'
  private version: string
  private screenAwake = false
  private statusBarStyle: 'light' | 'dark' = 'light'
  private hapticEvents: string[] = []

  constructor(config: MobileAppConfig) {
    this.platform = config.platform ?? 'web'
    this.version = config.appVersion
    this.notifications = new InMemoryPushService()
    this.backgroundSync = new InMemoryBackgroundSync()
    this.biometric = new InMemoryBiometricAuth()
    this.shareTarget = new InMemoryShareTarget()
  }

  getPlatform(): 'ios' | 'android' | 'web' | 'desktop' {
    return this.platform
  }

  getVersion(): string {
    return this.version
  }

  async openSettings(): Promise<void> {
    // In production, opens native settings
  }

  hapticFeedback(style: 'light' | 'medium' | 'heavy'): void {
    this.hapticEvents.push(style)
  }

  setStatusBarStyle(style: 'light' | 'dark'): void {
    this.statusBarStyle = style
  }

  keepScreenAwake(enabled: boolean): void {
    this.screenAwake = enabled
  }

  isScreenAwake(): boolean {
    return this.screenAwake
  }

  getStatusBarStyle(): 'light' | 'dark' {
    return this.statusBarStyle
  }

  getHapticEvents(): string[] {
    return this.hapticEvents
  }
}
