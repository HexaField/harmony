import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryPushService } from '../src/push.js'
import { InMemoryBackgroundSync } from '../src/background-sync.js'
import { InMemoryBiometricAuth } from '../src/biometric.js'
import { InMemoryShareTarget } from '../src/share-target.js'
import { MobileApp } from '../src/platform.js'
import type { PushNotification } from '../src/push.js'
import type { SharedContent } from '../src/share-target.js'

function makeNotification(type: PushNotification['data']['type'] = 'message'): PushNotification {
  return {
    id: 'notif-1',
    title: 'New Message',
    body: 'Hello from Alice',
    data: {
      communityId: 'comm1',
      channelId: 'ch1',
      messageId: 'msg-1',
      type
    },
    receivedAt: new Date().toISOString()
  }
}

describe('@harmony/mobile', () => {
  describe('Push Notifications', () => {
    let push: InMemoryPushService

    beforeEach(() => {
      push = new InMemoryPushService()
    })

    it('MUST register for push notifications', async () => {
      const reg = await push.register()
      expect(reg.token).toBeTruthy()
      expect(reg.platform).toBe('web')
      expect(push.isRegistered()).toBe(true)
    })

    it('MUST unregister and clear token', async () => {
      await push.register()
      await push.unregister()
      expect(push.isRegistered()).toBe(false)
      expect(push.getToken()).toBeNull()
    })

    it('MUST check permission status', async () => {
      expect(await push.getPermissionStatus()).toBe('prompt')
      await push.register()
      expect(await push.getPermissionStatus()).toBe('granted')
    })

    it('MUST request permission', async () => {
      const result = await push.requestPermission()
      expect(result).toBe('granted')
    })

    it('MUST fire callback on notification received (foreground)', async () => {
      const received: PushNotification[] = []
      push.onNotificationReceived((n) => received.push(n))
      push.simulateNotificationReceived(makeNotification())
      expect(received).toHaveLength(1)
      expect(received[0].title).toBe('New Message')
    })

    it('MUST fire callback on notification tapped (background)', async () => {
      const tapped: PushNotification[] = []
      push.onNotificationTapped((n) => tapped.push(n))
      push.simulateNotificationTapped(makeNotification())
      expect(tapped).toHaveLength(1)
    })

    it('MUST update badge count', async () => {
      await push.setBadgeCount(5)
      expect(push.getBadgeCount()).toBe(5)
    })

    it('MUST route notification tap to correct channel/DM', () => {
      const tapped: PushNotification[] = []
      push.onNotificationTapped((n) => tapped.push(n))
      push.simulateNotificationTapped(makeNotification('dm'))
      expect(tapped[0].data.type).toBe('dm')
    })
  })

  describe('Background Sync', () => {
    let sync: InMemoryBackgroundSync

    beforeEach(() => {
      sync = new InMemoryBackgroundSync()
    })

    it('MUST register background sync task', async () => {
      await sync.registerSync('message-sync')
      expect(sync.isRegistered('message-sync')).toBe(true)
    })

    it('MUST execute sync callback when triggered', async () => {
      let synced = false
      sync.onSync('message-sync', async () => {
        synced = true
      })
      await sync.triggerSync('message-sync')
      expect(synced).toBe(true)
    })

    it('MUST track last sync time', async () => {
      expect(await sync.getLastSyncTime()).toBeNull()
      sync.onSync('test', async () => {})
      await sync.triggerSync('test')
      expect(await sync.getLastSyncTime()).toBeTruthy()
    })

    it('MUST respect minimum sync interval', () => {
      sync.setMinSyncInterval(600)
      expect(sync.getMinInterval()).toBe(600)
    })
  })

  describe('Biometric Auth', () => {
    let bio: InMemoryBiometricAuth

    beforeEach(() => {
      bio = new InMemoryBiometricAuth()
    })

    it('MUST check biometric availability', async () => {
      expect(await bio.isAvailable()).toBe(true)
      bio.setAvailable(false)
      expect(await bio.isAvailable()).toBe(false)
    })

    it('MUST authenticate with biometric', async () => {
      expect(await bio.authenticate('Unlock keys')).toBe(true)
    })

    it('MUST gate key access behind biometric', async () => {
      await bio.enableForKeyAccess()
      expect(bio.isKeyAccessEnabled()).toBe(true)
    })

    it('MUST fall back to passcode if biometric fails', async () => {
      bio.setShouldSucceed(false)
      expect(await bio.authenticate('Unlock')).toBe(false)
    })

    it('MUST allow disabling biometric key access', async () => {
      await bio.enableForKeyAccess()
      await bio.disableForKeyAccess()
      expect(bio.isKeyAccessEnabled()).toBe(false)
    })
  })

  describe('Share Target', () => {
    let share: InMemoryShareTarget

    beforeEach(() => {
      share = new InMemoryShareTarget()
    })

    it('MUST register as share target', async () => {
      await share.register()
      expect(share.isRegistered()).toBe(true)
    })

    it('MUST receive shared text', () => {
      const received: SharedContent[] = []
      share.onShareReceived((s) => received.push(s))
      share.simulateShare({ text: 'Check this out!' })
      expect(received).toHaveLength(1)
      expect(received[0].text).toBe('Check this out!')
    })

    it('MUST receive shared URL', () => {
      const received: SharedContent[] = []
      share.onShareReceived((s) => received.push(s))
      share.simulateShare({ url: 'https://example.com' })
      expect(received[0].url).toBe('https://example.com')
    })

    it('MUST receive shared files', () => {
      const received: SharedContent[] = []
      share.onShareReceived((s) => received.push(s))
      share.simulateShare({
        files: [{ name: 'photo.jpg', type: 'image/jpeg', uri: 'file://photo.jpg', size: 1024 }]
      })
      expect(received[0].files).toHaveLength(1)
      expect(received[0].files![0].name).toBe('photo.jpg')
    })
  })

  describe('Platform Integration', () => {
    let app: MobileApp

    beforeEach(() => {
      app = new MobileApp({ appVersion: '1.0.0', platform: 'android' })
    })

    it('MUST report correct platform', () => {
      expect(app.getPlatform()).toBe('android')
    })

    it('MUST report app version', () => {
      expect(app.getVersion()).toBe('1.0.0')
    })

    it('MUST open native settings', async () => {
      await app.openSettings() // Should not throw
    })

    it('MUST trigger haptic feedback', () => {
      app.hapticFeedback('medium')
      expect(app.getHapticEvents()).toContain('medium')
    })

    it('MUST set status bar style', () => {
      app.setStatusBarStyle('dark')
      expect(app.getStatusBarStyle()).toBe('dark')
    })

    it('MUST keep screen awake during voice calls', () => {
      app.keepScreenAwake(true)
      expect(app.isScreenAwake()).toBe(true)
      app.keepScreenAwake(false)
      expect(app.isScreenAwake()).toBe(false)
    })
  })
})
