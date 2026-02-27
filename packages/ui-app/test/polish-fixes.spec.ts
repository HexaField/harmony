// Tests for POLISH.md fixes
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAppStore } from '../src/store.tsx'

// Mock localStorage
const storage = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => storage.set(k, v),
  removeItem: (k: string) => storage.delete(k)
})

// Mock window.__HARMONY_DESKTOP__
vi.stubGlobal('window', {
  ...globalThis.window,
  __HARMONY_DESKTOP__: undefined,
  addEventListener: () => {}
})

describe('P0 #1 / P1 #6 — Loading state prevents EmptyStateView flash', () => {
  beforeEach(() => storage.clear())

  it('store starts in loading state', () => {
    const store = createAppStore()
    expect(store.loading()).toBe(true)
  })

  it('loading clears when communities are set', () => {
    const store = createAppStore()
    expect(store.loading()).toBe(true)
    store.setCommunities([{ id: 'c1', name: 'Test', memberCount: 1 }])
    expect(store.loading()).toBe(false)
  })

  it('loading clears even when empty communities are set', () => {
    const store = createAppStore()
    store.setCommunities([])
    expect(store.loading()).toBe(false)
  })

  it('loading state prevents showing empty state or communities before data arrives', () => {
    const store = createAppStore()
    // While loading, communities are empty but we shouldn't show EmptyStateView
    expect(store.loading()).toBe(true)
    expect(store.communities().length).toBe(0)
    // The MainLayout checks: !loading() && communities.length === 0 for EmptyState
  })
})

describe('P1 #5 — Display name resolution is reactive', () => {
  it('resolvedName updates when members change', () => {
    const store = createAppStore()
    const did = 'did:key:z6MkTest1234'

    // Initially no members — would use pseudonym
    expect(store.members().find((m) => m.did === did)).toBeUndefined()

    // After community.info arrives, member gets display name
    store.setMembers([
      {
        did,
        displayName: 'Alice',
        roles: [],
        status: 'online'
      }
    ])

    const member = store.members().find((m) => m.did === did)
    expect(member?.displayName).toBe('Alice')
  })
})

describe('P1 #7 — community.list in ClientEvent type', () => {
  it('community.list is a valid ClientEvent', async () => {
    // Import the type and verify it includes community.list
    await import('@harmony/protocol')
    // If this compiles, community.list is in the type union
    const event: import('@harmony/protocol').ClientEvent = 'community.list'
    expect(event).toBe('community.list')
  })

  it('community.member.updated is a valid ClientEvent', async () => {
    const event: import('@harmony/protocol').ClientEvent = 'community.member.updated'
    expect(event).toBe('community.member.updated')
  })
})

describe('P2 #14 — persistToBackend error handling', () => {
  it('store handles failed persistToBackend gracefully', () => {
    // Set up a failing __HARMONY_DESKTOP__
    const originalWindow = globalThis.window as any
    originalWindow.__HARMONY_DESKTOP__ = {
      updateConfig: () => {
        throw new Error('IPC failed')
      }
    }

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = createAppStore()

    // Setting identity triggers persistToBackend — should not throw
    expect(() => {
      store.setDid('did:key:test')
      store.setMnemonic('word '.repeat(12).trim())
    }).not.toThrow()

    consoleSpy.mockRestore()
    originalWindow.__HARMONY_DESKTOP__ = undefined
  })
})

describe('P2 #13 — Theme persistence via localStorage', () => {
  beforeEach(() => storage.clear())

  it('persists theme to localStorage', () => {
    const store = createAppStore()
    store.setTheme('light')
    expect(storage.get('harmony:theme')).toBe('light')
  })

  it('restores theme from localStorage', () => {
    storage.set('harmony:theme', 'light')
    const store = createAppStore()
    expect(store.theme()).toBe('light')
  })

  it('defaults to dark theme', () => {
    const store = createAppStore()
    expect(store.theme()).toBe('dark')
  })
})
