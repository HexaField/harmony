// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createRoot } from 'solid-js'
import { createAppStore } from '../src/store.js'
import { en } from '../src/i18n/strings.js'

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

describe('Threads — Store', () => {
  it('activeThread starts as null', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.activeThread()).toBeNull()
      dispose()
    })
  })

  it('setActiveThread opens and closes thread panel', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      const thread = {
        threadId: 't1',
        parentMessageId: 'm1',
        channelId: 'ch1',
        communityId: 'c1',
        name: 'Test Thread'
      }
      store.setActiveThread(thread)
      expect(store.activeThread()).toEqual(thread)
      store.setActiveThread(null)
      expect(store.activeThread()).toBeNull()
      dispose()
    })
  })

  it('addThreadMessage stores messages by threadId', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.threadMessages('t1')).toEqual([])

      const msg = {
        id: 'msg1',
        content: 'Hello thread',
        authorDid: 'did:key:abc',
        authorName: 'Alice',
        timestamp: new Date().toISOString(),
        reactions: []
      }
      store.addThreadMessage('t1', msg)
      expect(store.threadMessages('t1')).toHaveLength(1)
      expect(store.threadMessages('t1')[0].content).toBe('Hello thread')

      // Different thread
      expect(store.threadMessages('t2')).toEqual([])
      dispose()
    })
  })

  it('does not add duplicate thread messages', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      const msg = {
        id: 'msg1',
        content: 'Hello',
        authorDid: 'did:key:abc',
        authorName: 'Alice',
        timestamp: new Date().toISOString(),
        reactions: []
      }
      store.addThreadMessage('t1', msg)
      store.addThreadMessage('t1', msg)
      expect(store.threadMessages('t1')).toHaveLength(1)
      dispose()
    })
  })

  it('addThreadMeta and threadMetaForMessage track thread info on messages', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.threadMetaForMessage('m1')).toBeNull()

      store.addThreadMeta('m1', 't1', 'Thread on m1')
      const meta = store.threadMetaForMessage('m1')
      expect(meta).not.toBeNull()
      expect(meta!.threadId).toBe('t1')
      expect(meta!.name).toBe('Thread on m1')
      expect(meta!.replyCount).toBe(0)
      dispose()
    })
  })

  it('threadCounts returns reply counts per message', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.addThreadMeta('m1', 't1', 'Thread')
      store.addThreadMessage('t1', {
        id: 'r1',
        content: 'Reply',
        authorDid: 'did:key:abc',
        authorName: 'Alice',
        timestamp: new Date().toISOString(),
        reactions: []
      })
      const counts = store.threadCounts()
      expect(counts.get('m1')).toBe(1)
      dispose()
    })
  })
})

describe('Threads — i18n strings', () => {
  it('has all thread strings', () => {
    expect(en.THREAD_START).toBeDefined()
    expect(en.THREAD_NAME_PROMPT).toBeDefined()
    expect(en.THREAD_CREATE).toBeDefined()
    expect(en.THREAD_REPLIES).toBeDefined()
    expect(en.THREAD_CLOSE).toBeDefined()
    expect(en.THREAD_MESSAGE_PLACEHOLDER).toBeDefined()
  })
})
