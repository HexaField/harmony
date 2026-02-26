import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryPushService } from '../src/push.js'
import { InMemoryBackgroundSync } from '../src/background-sync.js'
import { InMemoryBiometricAuth } from '../src/biometric.js'
import { InMemoryShareTarget } from '../src/share-target.js'
import { MobileApp } from '../src/platform.js'
import type { PushNotification } from '../src/push.js'

function makeNotification(type: PushNotification['data']['type'] = 'message'): PushNotification {
  return {
    id: 'cap-notif-1',
    title: 'Test',
    body: 'Hello',
    data: { communityId: 'c1', channelId: 'ch1', messageId: 'm1', type },
    receivedAt: new Date().toISOString()
  }
}

describe('Capacitor implementations (InMemory fallback)', () => {
  describe('Push notifications', () => {
    let push: InMemoryPushService

    beforeEach(() => {
      push = new InMemoryPushService()
    })

    it('register returns token', async () => {
      const reg = await push.register()
      expect(reg.token).toBeTruthy()
      expect(reg.platform).toBe('web')
    })

    it('receive notification fires callback', () => {
      const received: PushNotification[] = []
      push.onNotificationReceived((n) => received.push(n))
      push.simulateNotificationReceived(makeNotification())
      expect(received).toHaveLength(1)
    })

    it('tap notification fires callback', () => {
      const tapped: PushNotification[] = []
      push.onNotificationTapped((n) => tapped.push(n))
      push.simulateNotificationTapped(makeNotification('dm'))
      expect(tapped).toHaveLength(1)
      expect(tapped[0].data.type).toBe('dm')
    })
  })

  describe('Biometric auth', () => {
    let bio: InMemoryBiometricAuth

    beforeEach(() => {
      bio = new InMemoryBiometricAuth()
    })

    it('available check', async () => {
      expect(await bio.isAvailable()).toBe(true)
    })

    it('authenticate success', async () => {
      expect(await bio.authenticate('Unlock')).toBe(true)
    })

    it('authenticate failure', async () => {
      bio.setShouldSucceed(false)
      expect(await bio.authenticate('Unlock')).toBe(false)
    })
  })

  describe('Share target', () => {
    let share: InMemoryShareTarget

    beforeEach(() => {
      share = new InMemoryShareTarget()
    })

    it('receive invite link', () => {
      const received: { url?: string }[] = []
      share.onShareReceived((s) => received.push(s))
      share.simulateShare({ url: 'https://harmony.chat/invite/abc' })
      expect(received[0].url).toContain('invite')
    })

    it('receive shared text', () => {
      const received: { text?: string }[] = []
      share.onShareReceived((s) => received.push(s))
      share.simulateShare({ text: 'Hello world' })
      expect(received[0].text).toBe('Hello world')
    })
  })

  describe('Platform', () => {
    let app: MobileApp

    beforeEach(() => {
      app = new MobileApp({ appVersion: '1.0.0', platform: 'ios' })
    })

    it('detect platform', () => {
      expect(app.getPlatform()).toBe('ios')
    })

    it('haptic feedback', () => {
      app.hapticFeedback('light')
      expect(app.getHapticEvents()).toContain('light')
    })
  })

  describe('Background sync', () => {
    let sync: InMemoryBackgroundSync

    beforeEach(() => {
      sync = new InMemoryBackgroundSync()
    })

    it('register sync tag', async () => {
      await sync.registerSync('test-sync')
      expect(sync.isRegistered('test-sync')).toBe(true)
    })

    it('trigger sync', async () => {
      let synced = false
      sync.onSync('test', async () => {
        synced = true
      })
      await sync.triggerSync('test')
      expect(synced).toBe(true)
    })
  })
})
