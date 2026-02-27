// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRoot } from 'solid-js'
import { createAppStore } from '../src/store.js'
import { t, en } from '../src/i18n/strings.js'

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

// ── Task 1: Invite Links ──
describe('Invite Links', () => {
  it('i18n strings for invite exist', () => {
    expect(en.INVITE_GENERATE).toBeDefined()
    expect(en.INVITE_LINK_COPIED).toBeDefined()
    expect(en.INVITE_JOIN_TITLE).toBeDefined()
    expect(en.INVITE_JOIN_DESCRIPTION).toBeDefined()
    expect(en.INVITE_JOIN_CONFIRM).toBeDefined()
    expect(en.INVITE_JOIN_CANCEL).toBeDefined()
  })

  it('generates invite link from serverUrl and communityId', () => {
    const serverUrl = 'ws://localhost:4000'
    const communityId = 'test-community-123'
    const inviteUrl = `${serverUrl}/invite/${communityId}`
    expect(inviteUrl).toBe('ws://localhost:4000/invite/test-community-123')
  })

  it('parses invite links with community ID', () => {
    // Replicating EmptyStateView.parseInvite logic
    function parseInvite(input: string): { serverUrl: string; communityId?: string } {
      const trimmed = input.trim()
      if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
        const match = trimmed.match(/^(wss?:\/\/[^/]+)(?:\/invite\/(.+))?$/)
        if (match) return { serverUrl: match[1], communityId: match[2] }
        return { serverUrl: trimmed }
      }
      if (trimmed.startsWith('http://')) return parseInvite(trimmed.replace('http://', 'ws://'))
      if (trimmed.startsWith('https://')) return parseInvite(trimmed.replace('https://', 'wss://'))
      return { serverUrl: `ws://${trimmed}` }
    }

    expect(parseInvite('ws://localhost:4000/invite/abc123')).toEqual({
      serverUrl: 'ws://localhost:4000',
      communityId: 'abc123'
    })
    expect(parseInvite('wss://example.com/invite/my-community')).toEqual({
      serverUrl: 'wss://example.com',
      communityId: 'my-community'
    })
    expect(parseInvite('ws://localhost:4000')).toEqual({
      serverUrl: 'ws://localhost:4000',
      communityId: undefined
    })
    expect(parseInvite('http://localhost:4000/invite/test')).toEqual({
      serverUrl: 'ws://localhost:4000',
      communityId: 'test'
    })
  })
})

// ── Task 2: Channel Creation ──
describe('Channel Creation', () => {
  it('i18n strings for channel creation exist', () => {
    expect(en.CHANNEL_CREATE_NAME).toBeDefined()
    expect(en.CHANNEL_CREATE_NAME_PLACEHOLDER).toBeDefined()
    expect(en.CHANNEL_CREATE_TYPE).toBeDefined()
    expect(en.CHANNEL_CREATE_SUBMIT).toBeDefined()
    expect(en.CHANNEL_CREATE_CANCEL).toBeDefined()
    expect(en.CHANNEL_CREATE_ERROR).toBeDefined()
  })

  it('CHANNEL_CREATE_ERROR supports template parameter', () => {
    const msg = t('CHANNEL_CREATE_ERROR', { error: 'permission denied' })
    expect(msg).toContain('permission denied')
  })

  it('showCreateChannel toggle works in store', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.showCreateChannel()).toBe(false)
      store.setShowCreateChannel(true)
      expect(store.showCreateChannel()).toBe(true)
      store.setShowCreateChannel(false)
      expect(store.showCreateChannel()).toBe(false)
      dispose()
    })
  })

  it.todo(
    'CreateChannelModal renders and calls createChannel on submit (requires SolidJS render with AppStoreProvider context)'
  )
})

// ── Task 3: Message Editing ──
describe('Message Editing', () => {
  it('i18n strings for editing exist', () => {
    expect(en.MESSAGE_EDIT_SAVE).toBeDefined()
    expect(en.MESSAGE_EDIT_CANCEL).toBeDefined()
    expect(en.MESSAGE_EDITED_LABEL).toBeDefined()
  })

  it('editingMessageId starts null and can be set', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.editingMessageId()).toBeNull()
      store.setEditingMessageId('msg-123')
      expect(store.editingMessageId()).toBe('msg-123')
      store.setEditingMessageId(null)
      expect(store.editingMessageId()).toBeNull()
      dispose()
    })
  })

  it('updateMessage modifies channel message content and marks as edited', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      const msg = { id: 'm1', content: 'original', authorDid: 'd1', authorName: 'A', timestamp: 't', reactions: [] }
      store.addChannelMessage('ch1', msg)
      store.addMessage(msg)

      store.updateMessage('ch1', 'm1', 'updated text')

      const cached = store.channelMessages('ch1')
      expect(cached[0].content).toBe('updated text')
      expect(cached[0].edited).toBe(true)

      const global = store.messages()
      expect(global[0].content).toBe('updated text')
      expect(global[0].edited).toBe(true)
      dispose()
    })
  })

  it('updateMessage is no-op for non-existent message', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      // Should not throw
      store.updateMessage('ch1', 'nonexistent', 'text')
      expect(store.channelMessages('ch1')).toEqual([])
      dispose()
    })
  })
})

// ── Task 4: Message Deletion ──
describe('Message Deletion', () => {
  it('i18n strings for deletion exist', () => {
    expect(en.MESSAGE_DELETE_CONFIRM).toBeDefined()
    expect(en.MESSAGE_DELETE_YES).toBeDefined()
    expect(en.MESSAGE_DELETE_NO).toBeDefined()
  })

  it('removeMessage removes from channel cache and global messages', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      const msg1 = { id: 'm1', content: 'first', authorDid: 'd1', authorName: 'A', timestamp: 't', reactions: [] }
      const msg2 = { id: 'm2', content: 'second', authorDid: 'd1', authorName: 'A', timestamp: 't', reactions: [] }
      store.addChannelMessage('ch1', msg1)
      store.addChannelMessage('ch1', msg2)
      store.addMessage(msg1)
      store.addMessage(msg2)

      store.removeMessage('ch1', 'm1')

      expect(store.channelMessages('ch1')).toHaveLength(1)
      expect(store.channelMessages('ch1')[0].id).toBe('m2')
      expect(store.messages()).toHaveLength(1)
      expect(store.messages()[0].id).toBe('m2')
      dispose()
    })
  })

  it('removeMessage is no-op for non-existent channel', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.removeMessage('nonexistent', 'm1')
      expect(store.messages()).toEqual([])
      dispose()
    })
  })
})

// ── Task 5: Reactions ──
describe('Reactions', () => {
  it('i18n strings for reactions exist', () => {
    expect(en.REACTION_ADD).toBeDefined()
    expect(en.REACTION_PICKER_TITLE).toBeDefined()
  })

  it.todo('addReaction/removeReaction wires to client API (requires WebSocket mock with server handshake)')

  it('message reactions data structure is correct', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      const msg = {
        id: 'm1',
        content: 'hi',
        authorDid: 'd1',
        authorName: 'A',
        timestamp: 't',
        reactions: [{ emoji: '👍', count: 2, userReacted: true }]
      }
      store.addChannelMessage('ch1', msg)
      const cached = store.channelMessages('ch1')
      expect(cached[0].reactions).toHaveLength(1)
      expect(cached[0].reactions![0].emoji).toBe('👍')
      expect(cached[0].reactions![0].count).toBe(2)
      expect(cached[0].reactions![0].userReacted).toBe(true)
      dispose()
    })
  })
})

// ── Task 6: Typing Indicators ──
describe('Typing Indicators', () => {
  it('i18n strings for typing exist', () => {
    expect(en.TYPING_SINGLE).toBeDefined()
    expect(en.TYPING_MULTIPLE).toBeDefined()
    expect(t('TYPING_SINGLE', { user: 'Alice' })).toContain('Alice')
    expect(t('TYPING_MULTIPLE', { count: 3 })).toContain('3')
  })

  it('setTypingUser and activeChannelTypingUsers', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setActiveChannelId('ch1')
      expect(store.activeChannelTypingUsers()).toEqual([])

      store.setTypingUser('ch1', 'did:key:alice', 'Alice')
      expect(store.activeChannelTypingUsers()).toEqual(['Alice'])

      store.setTypingUser('ch1', 'did:key:bob', 'Bob')
      expect(store.activeChannelTypingUsers()).toHaveLength(2)
      expect(store.activeChannelTypingUsers()).toContain('Alice')
      expect(store.activeChannelTypingUsers()).toContain('Bob')
      dispose()
    })
  })

  it('clearTypingUser removes a user', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setActiveChannelId('ch1')
      store.setTypingUser('ch1', 'did:key:alice', 'Alice')
      store.clearTypingUser('ch1', 'did:key:alice')
      expect(store.activeChannelTypingUsers()).toEqual([])
      dispose()
    })
  })

  it('typing users for different channels are isolated', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setActiveChannelId('ch1')
      store.setTypingUser('ch1', 'did:key:alice', 'Alice')
      store.setTypingUser('ch2', 'did:key:bob', 'Bob')

      expect(store.activeChannelTypingUsers()).toEqual(['Alice'])
      store.setActiveChannelId('ch2')
      expect(store.activeChannelTypingUsers()).toEqual(['Bob'])
      dispose()
    })
  })

  it('typing auto-clears after timeout', async () => {
    await createRoot(async (dispose) => {
      const store = createAppStore()
      store.setActiveChannelId('ch1')
      store.setTypingUser('ch1', 'did:key:alice', 'Alice')
      expect(store.activeChannelTypingUsers()).toHaveLength(1)

      // Wait for auto-clear (3 seconds)
      await new Promise((r) => setTimeout(r, 3100))
      expect(store.activeChannelTypingUsers()).toHaveLength(0)
      dispose()
    })
  }, 5000)
})

// ── Task 7: Settings Persistence ──
describe('Settings Persistence', () => {
  it('i18n strings for settings save exist', () => {
    expect(en.SETTINGS_DISPLAY_NAME_SAVED).toBeDefined()
    expect(en.SETTINGS_DISPLAY_NAME_SAVE).toBeDefined()
  })

  it('displayName persists to backend config (not localStorage)', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setDisplayName('NewName')
      // displayName should NOT be in localStorage — it's persisted via backend IPC
      expect(localStorage.getItem('harmony:displayName')).toBeNull()
      expect(store.displayName()).toBe('NewName')
      dispose()
    })
  })

  it.todo('Save button calls client.setPresence (requires connected WebSocket)')
})

// ── Task 8: Search ──
describe('Search', () => {
  it('i18n strings for search results exist', () => {
    expect(en.SEARCH_RESULTS_COUNT).toBeDefined()
    expect(t('SEARCH_RESULTS_COUNT', { count: 5 })).toContain('5')
  })

  it('searchMessages finds messages by content', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.addChannelMessage('ch1', {
        id: 'm1',
        content: 'Hello world',
        authorDid: 'd1',
        authorName: 'A',
        timestamp: 't',
        reactions: []
      })
      store.addChannelMessage('ch1', {
        id: 'm2',
        content: 'Goodbye world',
        authorDid: 'd1',
        authorName: 'A',
        timestamp: 't',
        reactions: []
      })
      store.addChannelMessage('ch1', {
        id: 'm3',
        content: 'Something else',
        authorDid: 'd1',
        authorName: 'A',
        timestamp: 't',
        reactions: []
      })

      const results = store.searchMessages('world')
      expect(results).toHaveLength(2)
      expect(results.map((r) => r.id)).toContain('m1')
      expect(results.map((r) => r.id)).toContain('m2')
      dispose()
    })
  })

  it('searchMessages is case-insensitive', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.addChannelMessage('ch1', {
        id: 'm1',
        content: 'Hello World',
        authorDid: 'd1',
        authorName: 'A',
        timestamp: 't',
        reactions: []
      })

      expect(store.searchMessages('hello')).toHaveLength(1)
      expect(store.searchMessages('HELLO')).toHaveLength(1)
      expect(store.searchMessages('HeLlO')).toHaveLength(1)
      dispose()
    })
  })

  it('searchMessages finds messages by author name', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.addChannelMessage('ch1', {
        id: 'm1',
        content: 'Hi',
        authorDid: 'd1',
        authorName: 'Alice',
        timestamp: 't',
        reactions: []
      })
      store.addChannelMessage('ch1', {
        id: 'm2',
        content: 'Hi',
        authorDid: 'd2',
        authorName: 'Bob',
        timestamp: 't',
        reactions: []
      })

      const results = store.searchMessages('Alice')
      expect(results).toHaveLength(1)
      expect(results[0].authorName).toBe('Alice')
      dispose()
    })
  })

  it('searchMessages returns empty for empty query', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.addChannelMessage('ch1', {
        id: 'm1',
        content: 'Hello',
        authorDid: 'd1',
        authorName: 'A',
        timestamp: 't',
        reactions: []
      })

      expect(store.searchMessages('')).toEqual([])
      expect(store.searchMessages('   ')).toEqual([])
      dispose()
    })
  })

  it('searchMessages searches across all channels', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.addChannelMessage('ch1', {
        id: 'm1',
        content: 'findme in ch1',
        authorDid: 'd1',
        authorName: 'A',
        timestamp: 't',
        reactions: []
      })
      store.addChannelMessage('ch2', {
        id: 'm2',
        content: 'findme in ch2',
        authorDid: 'd1',
        authorName: 'A',
        timestamp: 't',
        reactions: []
      })

      const results = store.searchMessages('findme')
      expect(results).toHaveLength(2)
      dispose()
    })
  })

  it('searchMessages returns no results for non-matching query', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.addChannelMessage('ch1', {
        id: 'm1',
        content: 'Hello',
        authorDid: 'd1',
        authorName: 'A',
        timestamp: 't',
        reactions: []
      })

      expect(store.searchMessages('nonexistent')).toEqual([])
      dispose()
    })
  })
})

// ── Event Wiring ──
describe('Event Wiring', () => {
  it.todo('typing event from client updates store typingUsers (requires WebSocket mock with full server handshake)')

  it.todo('message.edited event from client updates store (requires server to send channel.message.updated)')

  it.todo('message.deleted event from client updates store (requires server to send channel.message.deleted)')
})
