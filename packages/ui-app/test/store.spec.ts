import { describe, it, expect, vi } from 'vitest'
import { createRoot } from 'solid-js'
import { createAppStore } from '../src/store.js'

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
    await createRoot(async (dispose) => {
      const store = createAppStore()
      const mockIdentity = { did: 'did:key:z6MkTest', document: {} } as any
      const mockKeyPair = { publicKey: new Uint8Array(32), secretKey: new Uint8Array(64) } as any

      await store.initClient(mockIdentity, mockKeyPair)
      expect(store.client()).not.toBeNull()
      expect(store.client()!.myDID()).toBe('did:key:z6MkTest')
      dispose()
    })
  })

  it('initClient is idempotent — does not create a second client', async () => {
    await createRoot(async (dispose) => {
      const store = createAppStore()
      const mockIdentity = { did: 'did:key:z6MkTest', document: {} } as any
      const mockKeyPair = { publicKey: new Uint8Array(32), secretKey: new Uint8Array(64) } as any

      await store.initClient(mockIdentity, mockKeyPair)
      const firstClient = store.client()

      await store.initClient(mockIdentity, mockKeyPair)
      expect(store.client()).toBe(firstClient)
      dispose()
    })
  })

  it('addServer delegates to client.addServer', async () => {
    await createRoot(async (dispose) => {
      const store = createAppStore()
      const mockIdentity = { did: 'did:key:z6MkTest', document: {} } as any
      const mockKeyPair = { publicKey: new Uint8Array(32), secretKey: new Uint8Array(64) } as any

      await store.initClient(mockIdentity, mockKeyPair)
      store.addServer('ws://localhost:4000')

      const client = store.client()!
      const serverUrls = client.servers().map((s) => s.url)
      expect(serverUrls).toContain('ws://localhost:4000')

      // Store's reactive servers mirror should also be updated
      expect(store.servers().map((s) => s.url)).toContain('ws://localhost:4000')
      dispose()
    })
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
    await createRoot(async (dispose) => {
      const store = createAppStore()
      const mockIdentity = { did: 'did:key:z6MkTest', document: {} } as any
      const mockKeyPair = { publicKey: new Uint8Array(32), secretKey: new Uint8Array(64) } as any

      // Before init — disconnected
      expect(store.connectionState()).toBe('disconnected')

      await store.initClient(mockIdentity, mockKeyPair)

      // After init with no servers — still disconnected
      expect(store.connectionState()).toBe('disconnected')
      dispose()
    })
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
