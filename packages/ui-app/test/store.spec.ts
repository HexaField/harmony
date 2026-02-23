import { describe, it, expect } from 'vitest'
// We need to test createAppStore in a SolidJS reactive context
// Since vitest doesn't have DOM by default, we test the store logic directly
// by running inside createRoot
import { createRoot } from 'solid-js'
import { createAppStore, type ServerEntry } from '../src/store.js'

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

  it('servers: add, update, getClient', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      const entry: ServerEntry = { url: 'ws://localhost:4000', name: 'local', status: 'connecting', client: null }
      store.setServers([entry])
      expect(store.servers()).toHaveLength(1)

      store.updateServer('ws://localhost:4000', { status: 'connected' })
      expect(store.servers()[0].status).toBe('connected')

      expect(store.getServerClient('ws://localhost:4000')).toBeNull()
      expect(store.getServerClient('ws://nonexistent')).toBeNull()
      dispose()
    })
  })

  it('updateServer does not affect unmatched entries', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setServers([
        { url: 'ws://a', name: 'a', status: 'connected', client: null },
        { url: 'ws://b', name: 'b', status: 'disconnected', client: null }
      ])
      store.updateServer('ws://a', { status: 'error', error: 'fail' })
      expect(store.servers()[0].status).toBe('error')
      expect(store.servers()[1].status).toBe('disconnected')
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

      // Duplicate should be ignored
      store.addChannelMessage('ch1', msg)
      expect(store.channelMessages('ch1')).toHaveLength(1)

      // Different channel
      expect(store.channelMessages('ch2')).toHaveLength(0)

      // setChannelMessages replaces
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
