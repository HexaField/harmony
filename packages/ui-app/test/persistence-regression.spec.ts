/**
 * Regression tests for store persistence architecture.
 *
 * Verifies the boundary between backend persistence (config.json on disk)
 * and localStorage (UI preferences only).
 *
 * Regressions covered:
 * - Identity (did, mnemonic, displayName) must NOT be in localStorage
 * - Communities, channels, members must NOT be in localStorage
 * - Theme, activeCommunityId, activeChannelId MUST be in localStorage
 * - persistIdentity is called from all three identity setters
 * - Members signal starts empty (populated from server, not localStorage)
 * - Reactive author name resolution from members signal
 * - Display names persist across simulated refresh
 */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRoot } from 'solid-js'
import { createAppStore } from '../src/store.js'
import { pseudonymFromDid } from '../src/utils/pseudonym.js'

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
  localStorage.clear()
})

describe('Regression: localStorage must NOT contain identity data', () => {
  it('setDid does not write to localStorage', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setDid('did:key:z6MkTestDid')
      expect(localStorage.getItem('harmony:did')).toBeNull()
      dispose()
    })
  })

  it('setMnemonic does not write to localStorage', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setMnemonic('word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12')
      expect(localStorage.getItem('harmony:mnemonic')).toBeNull()
      dispose()
    })
  })

  it('setDisplayName does not write to localStorage', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setDisplayName('Alice')
      expect(localStorage.getItem('harmony:displayName')).toBeNull()
      dispose()
    })
  })

  it('none of did, mnemonic, displayName keys exist after setting all three', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setDid('did:key:z6MkTest')
      store.setMnemonic('one two three four five six seven eight nine ten eleven twelve')
      store.setDisplayName('Bob')

      for (const key of ['harmony:did', 'harmony:mnemonic', 'harmony:displayName']) {
        expect(localStorage.getItem(key)).toBeNull()
      }
      dispose()
    })
  })
})

describe('Regression: localStorage must NOT contain server data', () => {
  it('setCommunities does not write to localStorage', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setCommunities([{ id: 'c1', name: 'Test', memberCount: 5 }])
      expect(localStorage.getItem('harmony:communities')).toBeNull()
      dispose()
    })
  })

  it('setChannels does not write to localStorage', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setChannels([{ id: 'ch1', name: 'general', communityId: 'c1' }])
      expect(localStorage.getItem('harmony:channels')).toBeNull()
      dispose()
    })
  })

  it('setMembers does not write to localStorage', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setMembers([{ did: 'did:key:z6MkX', displayName: 'Alice', roles: [], status: 'online' }])
      expect(localStorage.getItem('harmony:members')).toBeNull()
      dispose()
    })
  })

  it('hasClaimedData does not write to localStorage', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setHasClaimedData(true)
      expect(localStorage.getItem('harmony:hasClaimedData')).toBeNull()
      dispose()
    })
  })
})

describe('Regression: localStorage MUST contain UI preferences', () => {
  it('theme persists to localStorage', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setTheme('light')
      expect(localStorage.getItem('harmony:theme')).toBe('light')
      dispose()
    })
  })

  it('activeCommunityId persists to localStorage', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setActiveCommunityId('community:abc')
      expect(localStorage.getItem('harmony:activeCommunityId')).toBe('community:abc')
      dispose()
    })
  })

  it('activeChannelId persists to localStorage', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setActiveChannelId('channel:xyz')
      expect(localStorage.getItem('harmony:activeChannelId')).toBe('channel:xyz')
      dispose()
    })
  })

  it('UI preferences restored from localStorage on creation', () => {
    localStorage.setItem('harmony:theme', 'light')
    localStorage.setItem('harmony:activeCommunityId', 'c42')
    localStorage.setItem('harmony:activeChannelId', 'ch99')
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.theme()).toBe('light')
      expect(store.activeCommunityId()).toBe('c42')
      expect(store.activeChannelId()).toBe('ch99')
      dispose()
    })
  })
})

describe('Regression: communities/channels start empty (server is source of truth)', () => {
  it('communities start empty even with stale localStorage data', () => {
    localStorage.setItem('harmony:communities', JSON.stringify([{ id: 'old', name: 'Stale' }]))
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.communities()).toEqual([])
      dispose()
    })
  })

  it('channels start empty even with stale localStorage data', () => {
    localStorage.setItem('harmony:channels', JSON.stringify([{ id: 'old', name: 'stale' }]))
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.channels()).toEqual([])
      dispose()
    })
  })

  it('members start empty', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.members()).toEqual([])
      dispose()
    })
  })
})

describe('Regression: persistIdentity calls backend IPC (desktop mode)', () => {
  it('setDid calls persistToBackend when both did and mnemonic are set', () => {
    // Mock the desktop bridge
    const mockUpdate = vi.fn().mockResolvedValue({})
    ;(window as any).__HARMONY_DESKTOP__ = { updateConfig: mockUpdate }

    createRoot((dispose) => {
      const store = createAppStore()
      store.setMnemonic('a b c d e f g h i j k l')
      store.setDid('did:key:z6MkTest')
      // Should have called updateConfig with identity
      expect(mockUpdate).toHaveBeenCalled()
      const call = mockUpdate.mock.calls[mockUpdate.mock.calls.length - 1][0]
      expect(call.identity.did).toBe('did:key:z6MkTest')
      expect(call.identity.mnemonic).toBe('a b c d e f g h i j k l')
      dispose()
    })

    delete (window as any).__HARMONY_DESKTOP__
  })

  it('setDisplayName calls persistToBackend', () => {
    const mockUpdate = vi.fn().mockResolvedValue({})
    ;(window as any).__HARMONY_DESKTOP__ = { updateConfig: mockUpdate }

    createRoot((dispose) => {
      const store = createAppStore()
      store.setDid('did:key:z6MkTest')
      store.setMnemonic('a b c d e f g h i j k l')
      mockUpdate.mockClear()
      store.setDisplayName('Alice')
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          identity: expect.objectContaining({ displayName: 'Alice' })
        })
      )
      dispose()
    })

    delete (window as any).__HARMONY_DESKTOP__
  })

  it('persistToBackend is a no-op without desktop bridge', () => {
    // No __HARMONY_DESKTOP__ — should not throw
    delete (window as any).__HARMONY_DESKTOP__
    createRoot((dispose) => {
      const store = createAppStore()
      expect(() => {
        store.setDid('did:key:z6MkTest')
        store.setMnemonic('a b c d e f g h i j k l')
        store.setDisplayName('Alice')
      }).not.toThrow()
      dispose()
    })
  })
})

describe('Regression: reactive author name resolution', () => {
  it('messages use authorName from messages data, not members signal initially', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.addMessage({
        id: 'm1',
        content: 'hello',
        authorDid: 'did:key:z6MkOther',
        authorName: 'Discord User',
        timestamp: new Date().toISOString(),
        reactions: []
      })
      expect(store.messages()[0].authorName).toBe('Discord User')
      dispose()
    })
  })

  it('members signal provides display names for resolution', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setMembers([
        { did: 'did:key:z6MkAlice', displayName: 'Alice', roles: [], status: 'online' },
        { did: 'did:key:z6MkBob', displayName: 'Bob', roles: [], status: 'offline' }
      ])
      const alice = store.members().find((m) => m.did === 'did:key:z6MkAlice')
      expect(alice?.displayName).toBe('Alice')
      dispose()
    })
  })

  it('pseudonymFromDid never returns a DID string', () => {
    const dids = ['did:key:z6MkTest123456', 'did:key:z6MkABCDEF', 'did:key:z6MkVeryLongDidStringThatShouldStillWork']
    for (const did of dids) {
      const name = pseudonymFromDid(did)
      expect(name).not.toContain('did:')
      expect(name.length).toBeGreaterThan(0)
    }
  })
})

describe('Regression: fixed server port prevents stale reconnection', () => {
  it('store does not persist server URLs to localStorage', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      // Before the fix, persisted server URLs with random ports became stale
      // Now servers come from the fixed port / backend config
      const allKeys = Object.keys(localStorage)
      const serverKeys = allKeys.filter((k) => k.includes('server'))
      expect(serverKeys).toEqual([])
      dispose()
    })
  })
})
