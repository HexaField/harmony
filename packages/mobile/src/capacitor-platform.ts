import type { MobileAppConfig } from './platform.js'
import { MobileApp } from './platform.js'

async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

async function detectPlatform(): Promise<'ios' | 'android' | 'web' | 'desktop'> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    const p = Capacitor.getPlatform()
    if (p === 'ios' || p === 'android') return p
    return 'web'
  } catch {
    return 'web'
  }
}

export class CapacitorMobileApp extends MobileApp {
  private nativeChecked = false
  private isNativePlatform = false

  static async create(config: MobileAppConfig): Promise<CapacitorMobileApp> {
    const platform = await detectPlatform()
    const app = new CapacitorMobileApp({ ...config, platform })
    app.isNativePlatform = await isNative()
    app.nativeChecked = true
    return app
  }

  hapticFeedback(style: 'light' | 'medium' | 'heavy'): void {
    super.hapticFeedback(style)
    if (!this.isNativePlatform) return
    import('@capacitor/haptics')
      .then(({ Haptics, ImpactStyle }) => {
        const map = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy }
        Haptics.impact({ style: map[style] }).catch(() => {})
      })
      .catch(() => {})
  }

  setStatusBarStyle(style: 'light' | 'dark'): void {
    super.setStatusBarStyle(style)
    if (!this.isNativePlatform) return
    import('@capacitor/status-bar')
      .then(({ StatusBar, Style }) => {
        StatusBar.setStyle({ style: style === 'dark' ? Style.Dark : Style.Light }).catch(() => {})
      })
      .catch(() => {})
  }

  keepScreenAwake(enabled: boolean): void {
    super.keepScreenAwake(enabled)
    if (!this.isNativePlatform) return
    import('@capacitor/keep-awake')
      .then(({ KeepAwake }) => {
        if (enabled) KeepAwake.keepAwake().catch(() => {})
        else KeepAwake.allowSleep().catch(() => {})
      })
      .catch(() => {})
  }
}

export async function createMobileApp(config: MobileAppConfig): Promise<MobileApp> {
  try {
    return await CapacitorMobileApp.create(config)
  } catch {
    return new MobileApp(config)
  }
}
