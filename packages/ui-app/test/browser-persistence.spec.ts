// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createRoot } from 'solid-js'
import { createAppStore, restoreIdentityFromLocalStorage } from '../src/store.js'

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
  } catch {
    /* ignore */
  }
  // Ensure no desktop bridge
  delete (window as any).__HARMONY_DESKTOP__
})

describe('Browser Persistence (localStorage fallback)', () => {
  it('stores identity to localStorage when no desktop bridge', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setDid('did:key:z6MkTest123')
      store.setMnemonic('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about')

      const raw = localStorage.getItem('harmony:identity')
      expect(raw).toBeTruthy()
      const parsed = JSON.parse(raw!)
      expect(parsed.did).toBe('did:key:z6MkTest123')
      expect(parsed.mnemonic).toBe(
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
      )
      dispose()
    })
  })

  it('restores identity from localStorage on page load', () => {
    // Simulate previous session saving identity
    localStorage.setItem(
      'harmony:identity',
      JSON.stringify({
        did: 'did:key:z6MkRestored',
        mnemonic: 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong',
        displayName: 'TestUser',
        createdAt: '2025-01-01T00:00:00Z'
      })
    )

    const restored = restoreIdentityFromLocalStorage()
    expect(restored).not.toBeNull()
    expect(restored!.did).toBe('did:key:z6MkRestored')
    expect(restored!.mnemonic).toBe('zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong')
    expect(restored!.displayName).toBe('TestUser')
  })

  it('display name persists via localStorage', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setDid('did:key:z6MkDN')
      store.setMnemonic('test mnemonic phrase here')
      store.setDisplayName('Alice')

      const raw = localStorage.getItem('harmony:identity')
      expect(raw).toBeTruthy()
      const parsed = JSON.parse(raw!)
      expect(parsed.displayName).toBe('Alice')
      dispose()
    })
  })

  it('mnemonic persists and can be used to recreate identity', () => {
    const testMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

    createRoot((dispose) => {
      const store = createAppStore()
      store.setDid('did:key:z6MkMnTest')
      store.setMnemonic(testMnemonic)

      const restored = restoreIdentityFromLocalStorage()
      expect(restored).not.toBeNull()
      expect(restored!.mnemonic).toBe(testMnemonic)
      dispose()
    })
  })

  it('falls back gracefully when localStorage is empty', () => {
    const restored = restoreIdentityFromLocalStorage()
    expect(restored).toBeNull()
  })

  it('falls back gracefully with corrupt localStorage data', () => {
    localStorage.setItem('harmony:identity', 'not-json')
    const restored = restoreIdentityFromLocalStorage()
    expect(restored).toBeNull()
  })

  it('falls back gracefully with incomplete localStorage data', () => {
    localStorage.setItem('harmony:identity', JSON.stringify({ did: 'test' }))
    const restored = restoreIdentityFromLocalStorage()
    // mnemonic missing, should return null
    expect(restored).toBeNull()
  })

  it('does NOT use localStorage when desktop bridge is available', () => {
    ;(window as any).__HARMONY_DESKTOP__ = {
      updateConfig: async () => {},
      getConfig: async () => null
    }

    createRoot((dispose) => {
      const store = createAppStore()
      store.setDid('did:key:z6MkDesktop')
      store.setMnemonic('desktop mnemonic here')

      // Should NOT be in localStorage since desktop bridge exists
      const raw = localStorage.getItem('harmony:identity')
      expect(raw).toBeNull()
      dispose()
    })

    delete (window as any).__HARMONY_DESKTOP__
  })
})
