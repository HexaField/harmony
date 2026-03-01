// @vitest-environment jsdom
/**
 * Store integration tests: cross-cutting behaviour across
 * communities, channels, messages, and unread tracking.
 */
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
  } catch {
    /* ignore */
  }
})

function makeMsg(
  id: string,
  content: string,
  authorDid = 'did:key:other',
  clock?: { counter: number; authorDID: string }
) {
  return {
    id,
    content,
    authorDid,
    authorName: 'Test',
    timestamp: new Date().toISOString(),
    reactions: [] as any[],
    ...(clock ? { clock } : {})
  }
}

describe('Store Integration: Community add/remove', () => {
  it('setCommunities replaces community list', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setCommunities([
        { id: 'c1', name: 'Alpha', memberCount: 3 },
        { id: 'c2', name: 'Beta', memberCount: 7 }
      ])
      expect(store.communities()).toHaveLength(2)
      expect(store.communities().map((c: any) => c.id)).toEqual(['c1', 'c2'])

      // Remove one by setting without it
      store.setCommunities([{ id: 'c2', name: 'Beta', memberCount: 7 }])
      expect(store.communities()).toHaveLength(1)
      expect(store.communities()[0].id).toBe('c2')

      // Clear all
      store.setCommunities([])
      expect(store.communities()).toEqual([])
      dispose()
    })
  })

  it('adding a community preserves existing ones', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setCommunities([{ id: 'c1', name: 'First', memberCount: 1 }])
      store.setCommunities([...store.communities(), { id: 'c2', name: 'Second', memberCount: 2 }])
      expect(store.communities()).toHaveLength(2)
      expect(store.communities()[0].name).toBe('First')
      expect(store.communities()[1].name).toBe('Second')
      dispose()
    })
  })
})

describe('Store Integration: Channel switching + markChannelRead', () => {
  it('switching channel and marking read clears unreads', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setDid('did:key:me')
      store.setActiveChannelId('ch-1')

      // Message to inactive channel increments unread
      store.addChannelMessage('ch-2', makeMsg('m1', 'hello'))
      store.addChannelMessage('ch-2', makeMsg('m2', 'world'))
      expect(store.channelUnreadCount('ch-2')).toBe(2)

      // Switch to ch-2 and mark read
      store.setActiveChannelId('ch-2')
      store.markChannelRead('ch-2')
      expect(store.channelUnreadCount('ch-2')).toBe(0)
      dispose()
    })
  })

  it('messages to active channel do not increment unreads', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setDid('did:key:me')
      store.setActiveChannelId('ch-1')

      store.addChannelMessage('ch-1', makeMsg('m1', 'active msg'))
      expect(store.channelUnreadCount('ch-1')).toBe(0)
      dispose()
    })
  })

  it('own messages do not increment unreads', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setDid('did:key:me')
      store.setActiveChannelId('ch-1')

      store.addChannelMessage('ch-2', makeMsg('m1', 'my msg', 'did:key:me'))
      expect(store.channelUnreadCount('ch-2')).toBe(0)
      dispose()
    })
  })
})

describe('Store Integration: Message storage with Lamport clocks', () => {
  it('messages are appended in insertion order (store does not sort by clock)', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setDid('did:key:me')
      store.setActiveChannelId('ch-1')

      // Add messages with out-of-order Lamport counters
      store.addChannelMessage('ch-1', makeMsg('m1', 'third', 'did:key:a', { counter: 30, authorDID: 'did:key:a' }))
      store.addChannelMessage('ch-1', makeMsg('m2', 'first', 'did:key:b', { counter: 10, authorDID: 'did:key:b' }))
      store.addChannelMessage('ch-1', makeMsg('m3', 'second', 'did:key:c', { counter: 20, authorDID: 'did:key:c' }))

      const msgs = store.channelMessages('ch-1')
      expect(msgs).toHaveLength(3)
      // Store appends in order received
      expect(msgs[0].id).toBe('m1')
      expect(msgs[1].id).toBe('m2')
      expect(msgs[2].id).toBe('m3')

      // Clock data is preserved
      expect(msgs[0].clock?.counter).toBe(30)
      expect(msgs[1].clock?.counter).toBe(10)
      expect(msgs[2].clock?.counter).toBe(20)
      dispose()
    })
  })
})

describe('Store Integration: totalUnreadCount across channels', () => {
  it('sums unreads from multiple channels', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setDid('did:key:me')
      store.setActiveChannelId('ch-active')

      // 2 unreads in ch-1
      store.addChannelMessage('ch-1', makeMsg('m1', 'a'))
      store.addChannelMessage('ch-1', makeMsg('m2', 'b'))
      // 1 unread in ch-2
      store.addChannelMessage('ch-2', makeMsg('m3', 'c'))
      // 3 unreads in ch-3
      store.addChannelMessage('ch-3', makeMsg('m4', 'd'))
      store.addChannelMessage('ch-3', makeMsg('m5', 'e'))
      store.addChannelMessage('ch-3', makeMsg('m6', 'f'))

      expect(store.totalUnreadCount()).toBe(6)

      // Mark one channel read
      store.markChannelRead('ch-1')
      expect(store.totalUnreadCount()).toBe(4)

      // Mark all read
      store.markChannelRead('ch-2')
      store.markChannelRead('ch-3')
      expect(store.totalUnreadCount()).toBe(0)
      dispose()
    })
  })

  it('totalUnreadCount is zero with no messages', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.totalUnreadCount()).toBe(0)
      dispose()
    })
  })
})

describe('Store Integration: Concurrent addChannelMessage', () => {
  it('rapid sequential adds to same channel do not lose messages', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setDid('did:key:me')
      store.setActiveChannelId('ch-1')

      const count = 50
      for (let i = 0; i < count; i++) {
        store.addChannelMessage('ch-1', makeMsg(`m${i}`, `msg ${i}`))
      }

      expect(store.channelMessages('ch-1')).toHaveLength(count)
      dispose()
    })
  })

  it('rapid adds to multiple channels do not lose messages', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setDid('did:key:me')
      store.setActiveChannelId('ch-active')

      const channels = ['ch-a', 'ch-b', 'ch-c']
      const perChannel = 20

      for (let i = 0; i < perChannel; i++) {
        for (const ch of channels) {
          store.addChannelMessage(ch, makeMsg(`${ch}-m${i}`, `msg ${i}`))
        }
      }

      for (const ch of channels) {
        expect(store.channelMessages(ch)).toHaveLength(perChannel)
      }
      dispose()
    })
  })

  it('deduplication prevents double-add under rapid calls', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setDid('did:key:me')
      store.setActiveChannelId('ch-1')

      // Add same message ID multiple times rapidly
      for (let i = 0; i < 10; i++) {
        store.addChannelMessage('ch-1', makeMsg('same-id', `attempt ${i}`))
      }

      expect(store.channelMessages('ch-1')).toHaveLength(1)
      dispose()
    })
  })
})
