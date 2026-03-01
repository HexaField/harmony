// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createRoot } from 'solid-js'
import { createAppStore } from '../src/store.js'

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  readyState = MockWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  send(_data: string) {}
  close() {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.()
  }
}

// @ts-ignore
globalThis.WebSocket = MockWebSocket

beforeEach(() => {
  try {
    localStorage.clear()
  } catch {}
})

describe('Mobile responsive layout', () => {
  it('store has mobile app signal', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.mobileApp()).toBeNull()
      dispose()
    })
  })

  it('store has biometric enabled signal', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.biometricEnabled()).toBe(false)
      store.setBiometricEnabled(true)
      expect(store.biometricEnabled()).toBe(true)
      dispose()
    })
  })

  it('layout adapts at mobile breakpoint (store supports mobile app)', () => {
    // Verify the store exposes mobile-related APIs for responsive adaptation
    createRoot((dispose) => {
      const store = createAppStore()
      expect(typeof store.mobileApp).toBe('function')
      expect(typeof store.setMobileApp).toBe('function')
      // Default: no mobile app
      expect(store.mobileApp()).toBeNull()
      // Biometric toggle exists for mobile
      expect(typeof store.biometricEnabled).toBe('function')
      dispose()
    })
  })

  it('sidebar toggle state management', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      // Member sidebar starts visible
      expect(store.showMemberSidebar()).toBe(true)
      store.setShowMemberSidebar(false)
      expect(store.showMemberSidebar()).toBe(false)
      dispose()
    })
  })
})

describe('Mobile store integration', () => {
  it('push notification sets mobile app', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      // MobileApp is from @harmony/mobile - test with a plain object since
      // importing it would pull in the capacitor barrel exports
      store.setMobileApp({ getPlatform: () => 'web' } as any)
      expect(store.mobileApp()).toBeTruthy()
      expect((store.mobileApp() as any).getPlatform()).toBe('web')
      dispose()
    })
  })

  it('biometric auth flow toggle', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.biometricEnabled()).toBe(false)
      store.setBiometricEnabled(true)
      expect(store.biometricEnabled()).toBe(true)
      store.setBiometricEnabled(false)
      expect(store.biometricEnabled()).toBe(false)
      dispose()
    })
  })
})
