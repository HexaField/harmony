// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createRoot } from 'solid-js'
import { createAppStore, type FriendData } from '../src/store.js'

beforeEach(() => {
  try {
    localStorage.clear()
  } catch {
    /* SSR */
  }
})

describe('Migration Store — autoJoinedCommunities', () => {
  it('addAutoJoinedCommunity appends to list', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.autoJoinedCommunities()).toEqual([])

      store.addAutoJoinedCommunity({ communityId: 'c1', communityName: 'Test' })
      expect(store.autoJoinedCommunities()).toHaveLength(1)
      expect(store.autoJoinedCommunities()[0].communityId).toBe('c1')

      store.addAutoJoinedCommunity({ communityId: 'c2', communityName: 'Test 2' })
      expect(store.autoJoinedCommunities()).toHaveLength(2)
      dispose()
    })
  })
})

describe('Migration Store — friends', () => {
  it('setFriends sets the friends list', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.friends()).toEqual([])

      const friendList: FriendData[] = [
        { did: 'did:key:z1', discordUsername: 'alice', harmonyName: 'Alice', status: 'on-harmony' },
        { did: 'did:key:z2', discordUsername: 'bob', harmonyName: 'Bob', status: 'not-migrated' }
      ]
      store.setFriends(friendList)
      expect(store.friends()).toHaveLength(2)
      expect(store.friends()[0].discordUsername).toBe('alice')
      dispose()
    })
  })

  it('setFriends can update/replace the list', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setFriends([{ did: 'did:key:z1', discordUsername: 'alice', harmonyName: 'Alice', status: 'on-harmony' }])
      expect(store.friends()).toHaveLength(1)

      store.setFriends([])
      expect(store.friends()).toEqual([])
      dispose()
    })
  })
})

describe('Migration Store — showFriendFinder', () => {
  it('toggles showFriendFinder', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.showFriendFinder()).toBe(false)
      store.setShowFriendFinder(true)
      expect(store.showFriendFinder()).toBe(true)
      store.setShowFriendFinder(false)
      expect(store.showFriendFinder()).toBe(false)
      dispose()
    })
  })
})

describe('Migration Store — hasClaimedData', () => {
  it('defaults to false and can be set', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.hasClaimedData()).toBe(false)
      store.setHasClaimedData(true)
      expect(store.hasClaimedData()).toBe(true)
      dispose()
    })
  })

  it('does not persist to localStorage (server is source of truth)', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setHasClaimedData(true)
      expect(localStorage.getItem('harmony:hasClaimedData')).toBeNull()
      dispose()
    })
  })

  it('defaults to false on fresh store', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.hasClaimedData()).toBe(false)
      dispose()
    })
  })
})

describe('Migration Store — claimedDataMeta', () => {
  it('defaults to null and can be set/get', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.claimedDataMeta()).toBeNull()

      const meta = {
        messageCount: 100,
        channelCount: 5,
        serverCount: 2,
        dateRange: { earliest: '2023-01-01', latest: '2024-01-01' }
      }
      store.setClaimedDataMeta(meta)
      expect(store.claimedDataMeta()).toEqual(meta)
      dispose()
    })
  })

  it('does not persist to localStorage (server is source of truth)', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      const meta = { messageCount: 10, channelCount: 1, serverCount: 1, dateRange: null }
      store.setClaimedDataMeta(meta)
      expect(localStorage.getItem('harmony:claimedDataMeta')).toBeNull()
      dispose()
    })
  })

  it('can be cleared by setting null', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setClaimedDataMeta({ messageCount: 1, channelCount: 1, serverCount: 1, dateRange: null })
      store.setClaimedDataMeta(null)
      expect(store.claimedDataMeta()).toBeNull()
      dispose()
    })
  })
})

describe('Migration Store — showDataClaim / showDataBrowser', () => {
  it('toggles showDataClaim', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.showDataClaim()).toBe(false)
      store.setShowDataClaim(true)
      expect(store.showDataClaim()).toBe(true)
      store.setShowDataClaim(false)
      expect(store.showDataClaim()).toBe(false)
      dispose()
    })
  })

  it('toggles showDataBrowser', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.showDataBrowser()).toBe(false)
      store.setShowDataBrowser(true)
      expect(store.showDataBrowser()).toBe(true)
      store.setShowDataBrowser(false)
      expect(store.showDataBrowser()).toBe(false)
      dispose()
    })
  })
})
