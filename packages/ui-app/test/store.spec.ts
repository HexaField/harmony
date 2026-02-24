import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRoot } from 'solid-js'
import { createAppStore } from '../src/store.js'

// Mock WebSocket for tests that init the client
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
  // Clear localStorage between tests to avoid cross-contamination
  try {
    localStorage.clear()
  } catch {
    /* ignore */
  }
})

describe('AppStore', () => {
  it('initializes with default values', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.did()).toBe('')
      expect(store.mnemonic()).toBe('')
      expect(store.isOnboarded()).toBe(false)
      expect(store.servers()).toEqual([])
      expect(store.communities()).toEqual([])
      expect(store.connectionState()).toBe('disconnected')
      expect(store.theme()).toBe('dark')
      expect(store.displayName()).toBe('')
      expect(store.showSettings()).toBe(false)
      dispose()
    })
  })

  it('isOnboarded becomes true when DID is set', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.isOnboarded()).toBe(false)
      store.setDid('did:key:z6MkTest')
      expect(store.isOnboarded()).toBe(true)
      dispose()
    })
  })

  it('client is null before initClient', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.client()).toBeNull()
      dispose()
    })
  })

  it('initClient creates a HarmonyClient instance', async () => {
    let storeRef: ReturnType<typeof createAppStore>
    let disposeRef: () => void
    createRoot((dispose) => {
      storeRef = createAppStore()
      disposeRef = dispose
    })

    const mockIdentity = { did: 'did:key:z6MkTest', document: {} } as any
    const mockKeyPair = { publicKey: new Uint8Array(32), secretKey: new Uint8Array(64) } as any

    await storeRef!.initClient(mockIdentity, mockKeyPair)
    expect(storeRef!.client()).not.toBeNull()
    expect(storeRef!.client()!.myDID()).toBe('did:key:z6MkTest')
    disposeRef!()
  })

  it('initClient is idempotent — does not create a second client', async () => {
    let storeRef: ReturnType<typeof createAppStore>
    let disposeRef: () => void
    createRoot((dispose) => {
      storeRef = createAppStore()
      disposeRef = dispose
    })

    const mockIdentity = { did: 'did:key:z6MkTest', document: {} } as any
    const mockKeyPair = { publicKey: new Uint8Array(32), secretKey: new Uint8Array(64) } as any

    await storeRef!.initClient(mockIdentity, mockKeyPair)
    const firstClient = storeRef!.client()

    await storeRef!.initClient(mockIdentity, mockKeyPair)
    expect(storeRef!.client()).toBe(firstClient)
    disposeRef!()
  })

  it('addServer delegates to client.addServer', async () => {
    let storeRef: ReturnType<typeof createAppStore>
    let disposeRef: () => void
    createRoot((dispose) => {
      storeRef = createAppStore()
      disposeRef = dispose
    })

    const mockIdentity = { did: 'did:key:z6MkTest', document: {} } as any
    const mockKeyPair = { publicKey: new Uint8Array(32), secretKey: new Uint8Array(64) } as any

    await storeRef!.initClient(mockIdentity, mockKeyPair)
    storeRef!.addServer('ws://localhost:4000')

    const client = storeRef!.client()!
    const serverUrls = client.servers().map((s: any) => s.url)
    expect(serverUrls).toContain('ws://localhost:4000')

    // Store's reactive servers mirror should also be updated
    expect(storeRef!.servers().map((s: any) => s.url)).toContain('ws://localhost:4000')
    disposeRef!()
  })

  it('addServer is a no-op when client is null', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      // Should not throw
      store.addServer('ws://localhost:4000')
      expect(store.servers()).toEqual([])
      dispose()
    })
  })

  it('connectionState reflects client state', async () => {
    let storeRef: ReturnType<typeof createAppStore>
    let disposeRef: () => void
    createRoot((dispose) => {
      storeRef = createAppStore()
      disposeRef = dispose
    })

    const mockIdentity = { did: 'did:key:z6MkTest', document: {} } as any
    const mockKeyPair = { publicKey: new Uint8Array(32), secretKey: new Uint8Array(64) } as any

    // Before init — disconnected
    expect(storeRef!.connectionState()).toBe('disconnected')

    await storeRef!.initClient(mockIdentity, mockKeyPair)

    // After init with no servers — still disconnected
    expect(storeRef!.connectionState()).toBe('disconnected')
    disposeRef!()
  })

  it('messages: add and retrieve', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      const msg = { id: 'm1', content: 'hi', authorDid: 'd1', authorName: 'A', timestamp: 't', reactions: [] }
      store.addMessage(msg)
      expect(store.messages()).toHaveLength(1)
      expect(store.messages()[0].content).toBe('hi')
      dispose()
    })
  })

  it('channelMessages: add, dedup, set', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      const msg = { id: 'm1', content: 'hi', authorDid: 'd1', authorName: 'A', timestamp: 't', reactions: [] }
      store.addChannelMessage('ch1', msg)
      expect(store.channelMessages('ch1')).toHaveLength(1)

      store.addChannelMessage('ch1', msg)
      expect(store.channelMessages('ch1')).toHaveLength(1)

      expect(store.channelMessages('ch2')).toHaveLength(0)

      store.setChannelMessages('ch1', [])
      expect(store.channelMessages('ch1')).toHaveLength(0)
      dispose()
    })
  })

  it('connection state transitions', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.connectionState()).toBe('disconnected')
      store.setConnectionState('reconnecting')
      expect(store.connectionState()).toBe('reconnecting')
      store.setConnectionState('connected')
      expect(store.connectionState()).toBe('connected')
      dispose()
    })
  })

  it('theme toggle', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.theme()).toBe('dark')
      store.setTheme('light')
      expect(store.theme()).toBe('light')
      dispose()
    })
  })

  it('display name', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setDisplayName('Alice')
      expect(store.displayName()).toBe('Alice')
      dispose()
    })
  })

  it('communities and active selection', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setCommunities([{ id: 'c1', name: 'Test', memberCount: 5 }])
      store.setActiveCommunityId('c1')
      expect(store.activeCommunityId()).toBe('c1')
      expect(store.communities()[0].name).toBe('Test')
      dispose()
    })
  })

  it('UI toggles: settings, search, createCommunity, memberSidebar', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setShowSettings(true)
      expect(store.showSettings()).toBe(true)
      store.setShowSearch(true)
      expect(store.showSearch()).toBe(true)
      store.setShowCreateCommunity(true)
      expect(store.showCreateCommunity()).toBe(true)
      store.setShowMemberSidebar(false)
      expect(store.showMemberSidebar()).toBe(false)
      dispose()
    })
  })
})
