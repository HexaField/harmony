export interface PushRegistration {
  token: string
  platform: 'ios' | 'android' | 'web'
  registeredAt: string
}

export interface PushNotification {
  id: string
  title: string
  body: string
  data: {
    communityId?: string
    channelId?: string
    messageId?: string
    dmDID?: string
    type: 'message' | 'dm' | 'mention' | 'reaction' | 'invite' | 'voice'
  }
  receivedAt: string
}

type NotificationCb = (notification: PushNotification) => void

export interface PushNotificationService {
  register(): Promise<PushRegistration>
  unregister(): Promise<void>
  getPermissionStatus(): Promise<'granted' | 'denied' | 'prompt'>
  requestPermission(): Promise<'granted' | 'denied'>
  onNotificationReceived(cb: NotificationCb): void
  onNotificationTapped(cb: NotificationCb): void
  setBadgeCount(count: number): Promise<void>
}

export class InMemoryPushService implements PushNotificationService {
  private registration: PushRegistration | null = null
  private permission: 'granted' | 'denied' | 'prompt' = 'prompt'
  private badgeCount = 0
  private receivedCbs: NotificationCb[] = []
  private tappedCbs: NotificationCb[] = []

  async register(): Promise<PushRegistration> {
    this.registration = {
      token: 'test-push-token-' + Date.now(),
      platform: 'web',
      registeredAt: new Date().toISOString()
    }
    this.permission = 'granted'
    return this.registration
  }

  async unregister(): Promise<void> {
    this.registration = null
  }

  async getPermissionStatus(): Promise<'granted' | 'denied' | 'prompt'> {
    return this.permission
  }

  async requestPermission(): Promise<'granted' | 'denied'> {
    this.permission = 'granted'
    return 'granted'
  }

  onNotificationReceived(cb: NotificationCb): void {
    this.receivedCbs.push(cb)
  }

  onNotificationTapped(cb: NotificationCb): void {
    this.tappedCbs.push(cb)
  }

  async setBadgeCount(count: number): Promise<void> {
    this.badgeCount = count
  }

  getBadgeCount(): number {
    return this.badgeCount
  }

  isRegistered(): boolean {
    return this.registration !== null
  }

  getToken(): string | null {
    return this.registration?.token ?? null
  }

  // Test helpers
  simulateNotificationReceived(n: PushNotification): void {
    for (const cb of this.receivedCbs) cb(n)
  }

  simulateNotificationTapped(n: PushNotification): void {
    for (const cb of this.tappedCbs) cb(n)
  }
}
