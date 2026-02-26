import type { PushNotificationService, PushRegistration, PushNotification } from './push.js'
import { InMemoryPushService } from './push.js'

async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export class CapacitorPushService implements PushNotificationService {
  private fallback = new InMemoryPushService()
  private receivedCbs: ((n: PushNotification) => void)[] = []
  private tappedCbs: ((n: PushNotification) => void)[] = []
  private native: boolean | null = null

  private async useNative(): Promise<boolean> {
    if (this.native === null) this.native = await isNative()
    return this.native
  }

  async register(): Promise<PushRegistration> {
    if (!(await this.useNative())) return this.fallback.register()
    const { PushNotifications } = await import('@capacitor/push-notifications')
    const { Capacitor } = await import('@capacitor/core')
    await PushNotifications.register()
    return new Promise((resolve) => {
      PushNotifications.addListener('registration', (token) => {
        resolve({
          token: token.value,
          platform: Capacitor.getPlatform() as 'ios' | 'android',
          registeredAt: new Date().toISOString()
        })
      })
    })
  }

  async unregister(): Promise<void> {
    if (!(await this.useNative())) return this.fallback.unregister()
    const { PushNotifications } = await import('@capacitor/push-notifications')
    await PushNotifications.removeAllListeners()
  }

  async getPermissionStatus(): Promise<'granted' | 'denied' | 'prompt'> {
    if (!(await this.useNative())) return this.fallback.getPermissionStatus()
    const { PushNotifications } = await import('@capacitor/push-notifications')
    const result = await PushNotifications.checkPermissions()
    return result.receive as 'granted' | 'denied' | 'prompt'
  }

  async requestPermission(): Promise<'granted' | 'denied'> {
    if (!(await this.useNative())) return this.fallback.requestPermission()
    const { PushNotifications } = await import('@capacitor/push-notifications')
    const result = await PushNotifications.requestPermissions()
    return result.receive === 'granted' ? 'granted' : 'denied'
  }

  onNotificationReceived(cb: (n: PushNotification) => void): void {
    this.receivedCbs.push(cb)
    this.useNative().then(async (native) => {
      if (!native) {
        this.fallback.onNotificationReceived(cb)
        return
      }
      const { PushNotifications } = await import('@capacitor/push-notifications')
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        const n: PushNotification = {
          id: notification.id ?? crypto.randomUUID(),
          title: notification.title ?? '',
          body: notification.body ?? '',
          data: notification.data as PushNotification['data'],
          receivedAt: new Date().toISOString()
        }
        cb(n)
      })
    })
  }

  onNotificationTapped(cb: (n: PushNotification) => void): void {
    this.tappedCbs.push(cb)
    this.useNative().then(async (native) => {
      if (!native) {
        this.fallback.onNotificationTapped(cb)
        return
      }
      const { PushNotifications } = await import('@capacitor/push-notifications')
      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const notification = action.notification
        const n: PushNotification = {
          id: notification.id ?? crypto.randomUUID(),
          title: notification.title ?? '',
          body: notification.body ?? '',
          data: notification.data as PushNotification['data'],
          receivedAt: new Date().toISOString()
        }
        cb(n)
      })
    })
  }

  async setBadgeCount(count: number): Promise<void> {
    if (!(await this.useNative())) return this.fallback.setBadgeCount(count)
    try {
      const { Badge } = await import('@capawesome/capacitor-badge')
      await Badge.set({ count })
    } catch {
      /* badge plugin not available */
    }
  }
}

export function createPushService(): PushNotificationService {
  return new CapacitorPushService()
}
