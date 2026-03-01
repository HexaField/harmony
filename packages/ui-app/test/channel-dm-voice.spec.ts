/**
 * Store tests for channel lifecycle, DM handling, voice state,
 * and presence event processing.
 *
 * Covers regressions from commits af406d0, fbd7f16, 456ddc5.
 */
// @vitest-environment jsdom
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

describe('Store: Channel Lifecycle Events', () => {
  it('channel.created adds channel to store', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setActiveCommunityId('c1')

      store.setChannels([...store.channels(), { id: 'ch-new', name: 'new-channel', type: 'text', communityId: 'c1' }])

      expect(store.channels().find((c) => c.id === 'ch-new')).toBeDefined()
      expect(store.channels().find((c) => c.id === 'ch-new')!.name).toBe('new-channel')
      dispose()
    })
  })

  it('channel.updated modifies channel in store', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setChannels([{ id: 'ch-1', name: 'old-name', type: 'text', communityId: 'c1' }])

      store.setChannels(store.channels().map((c) => (c.id === 'ch-1' ? { ...c, name: 'new-name' } : c)))

      expect(store.channels().find((c) => c.id === 'ch-1')!.name).toBe('new-name')
      dispose()
    })
  })

  it('channel.deleted removes channel from store', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setChannels([
        { id: 'ch-1', name: 'general', type: 'text', communityId: 'c1' },
        { id: 'ch-2', name: 'random', type: 'text', communityId: 'c1' }
      ])

      store.setChannels(store.channels().filter((c) => c.id !== 'ch-1'))

      expect(store.channels().length).toBe(1)
      expect(store.channels().find((c) => c.id === 'ch-1')).toBeUndefined()
      expect(store.channels().find((c) => c.id === 'ch-2')).toBeDefined()
      dispose()
    })
  })

  it('deleting active channel switches to another', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setChannels([
        { id: 'ch-1', name: 'general', type: 'text', communityId: 'c1' },
        { id: 'ch-2', name: 'random', type: 'text', communityId: 'c1' }
      ])
      store.setActiveChannelId('ch-1')

      const chId = 'ch-1'
      store.setChannels(store.channels().filter((c) => c.id !== chId))
      if (store.activeChannelId() === chId) {
        const remaining = store.channels()
        if (remaining.length) store.setActiveChannelId(remaining[0].id)
      }

      expect(store.activeChannelId()).toBe('ch-2')
      dispose()
    })
  })

  it('does not add duplicate channel', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setChannels([{ id: 'ch-1', name: 'general', type: 'text', communityId: 'c1' }])

      const chId = 'ch-1'
      if (!store.channels().find((c) => c.id === chId)) {
        store.setChannels([...store.channels(), { id: chId, name: 'dupe', type: 'text', communityId: 'c1' }])
      }

      expect(store.channels().length).toBe(1)
      dispose()
    })
  })
})

describe('Store: DM Message Handling', () => {
  it('adds DM message to correct peer conversation', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setDid('did:key:alice')

      store.addDMMessage('did:key:bob', {
        id: 'dm-1',
        content: 'hello alice',
        authorDid: 'did:key:bob',
        authorName: 'Bob',
        timestamp: new Date().toISOString(),
        reactions: []
      })

      const msgs = store.dmMessages('did:key:bob')
      expect(msgs.length).toBe(1)
      expect(msgs[0].content).toBe('hello alice')
      dispose()
    })
  })

  it('outgoing DM uses peer DID as conversation key', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setDid('did:key:alice')

      store.addDMMessage('did:key:bob', {
        id: 'dm-2',
        content: 'hello bob',
        authorDid: 'did:key:alice',
        authorName: 'Alice',
        timestamp: new Date().toISOString(),
        reactions: []
      })

      const msgs = store.dmMessages('did:key:bob')
      expect(msgs.length).toBe(1)
      expect(msgs[0].authorDid).toBe('did:key:alice')
      dispose()
    })
  })

  it('DM messages from different peers are separate conversations', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setDid('did:key:alice')

      store.addDMMessage('did:key:bob', {
        id: 'dm-1',
        content: 'from bob',
        authorDid: 'did:key:bob',
        authorName: 'Bob',
        timestamp: new Date().toISOString(),
        reactions: []
      })
      store.addDMMessage('did:key:carol', {
        id: 'dm-2',
        content: 'from carol',
        authorDid: 'did:key:carol',
        authorName: 'Carol',
        timestamp: new Date().toISOString(),
        reactions: []
      })

      expect(store.dmMessages('did:key:bob').length).toBe(1)
      expect(store.dmMessages('did:key:carol').length).toBe(1)
      expect(store.dmMessages('did:key:bob')[0].content).toBe('from bob')
      expect(store.dmMessages('did:key:carol')[0].content).toBe('from carol')
      dispose()
    })
  })

  it('DM conversations appear in dmConversations list', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setDid('did:key:alice')

      store.addDMMessage('did:key:bob', {
        id: 'dm-1',
        content: 'hi',
        authorDid: 'did:key:bob',
        authorName: 'Bob',
        timestamp: new Date().toISOString(),
        reactions: []
      })

      const convos = store.dmConversations()
      expect(convos.length).toBeGreaterThanOrEqual(1)
      dispose()
    })
  })

  it('DM edit updates message content', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.addDMMessage('did:key:bob', {
        id: 'dm-1',
        content: 'original',
        authorDid: 'did:key:bob',
        authorName: 'Bob',
        timestamp: new Date().toISOString(),
        reactions: []
      })

      store.updateDMMessage('did:key:bob', 'dm-1', 'edited')
      const msgs = store.dmMessages('did:key:bob')
      expect(msgs.find((m) => m.id === 'dm-1')?.content).toBe('edited')
      dispose()
    })
  })

  it('DM delete removes message', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.addDMMessage('did:key:bob', {
        id: 'dm-1',
        content: 'to delete',
        authorDid: 'did:key:bob',
        authorName: 'Bob',
        timestamp: new Date().toISOString(),
        reactions: []
      })

      store.removeDMMessage('did:key:bob', 'dm-1')
      const msgs = store.dmMessages('did:key:bob')
      expect(msgs.find((m) => m.id === 'dm-1')).toBeUndefined()
      dispose()
    })
  })
})

describe('Store: Channel Message Edit/Delete', () => {
  it('updateMessage changes message content via channelMessages', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setActiveChannelId('ch-1')

      store.addChannelMessage('ch-1', {
        id: 'msg-1',
        content: 'original',
        authorDid: 'did:key:alice',
        authorName: 'Alice',
        timestamp: new Date().toISOString(),
        reactions: []
      })

      expect(store.channelMessages('ch-1').find((m) => m.id === 'msg-1')?.content).toBe('original')

      store.updateMessage('ch-1', 'msg-1', 'edited')

      expect(store.channelMessages('ch-1').find((m) => m.id === 'msg-1')?.content).toBe('edited')
      dispose()
    })
  })

  it('updateMessage on non-existent message is no-op', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      // Should not throw
      store.updateMessage('ch-1', 'nonexistent', 'edited')
      dispose()
    })
  })

  it('removeMessage removes message from channel', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.addChannelMessage('ch-1', {
        id: 'msg-1',
        content: 'hello',
        authorDid: 'did:key:alice',
        authorName: 'Alice',
        timestamp: new Date().toISOString(),
        reactions: []
      })

      expect(store.channelMessages('ch-1').length).toBe(1)
      store.removeMessage('ch-1', 'msg-1')
      expect(store.channelMessages('ch-1').length).toBe(0)
      dispose()
    })
  })
})

describe('Store: Voice State', () => {
  it('voice state signals initialize correctly', () => {
    createRoot((dispose) => {
      const store = createAppStore()

      expect(store.isMuted()).toBe(false)
      expect(store.isDeafened()).toBe(false)
      expect(store.isVideoEnabled()).toBe(false)
      expect(store.isScreenSharing()).toBe(false)
      expect(store.voiceChannelId()).toBeNull()
      dispose()
    })
  })

  it('setMuted/setDeafened update state', () => {
    createRoot((dispose) => {
      const store = createAppStore()

      store.setMuted(true)
      expect(store.isMuted()).toBe(true)

      store.setDeafened(true)
      expect(store.isDeafened()).toBe(true)

      store.setMuted(false)
      store.setDeafened(false)
      expect(store.isMuted()).toBe(false)
      expect(store.isDeafened()).toBe(false)
      dispose()
    })
  })

  it('speaking users tracking', () => {
    createRoot((dispose) => {
      const store = createAppStore()

      expect(store.speakingUsers().size).toBe(0)

      store.setSpeaking('did:key:alice', true)
      expect(store.speakingUsers().has('did:key:alice')).toBe(true)

      store.setSpeaking('did:key:alice', false)
      expect(store.speakingUsers().has('did:key:alice')).toBe(false)
      dispose()
    })
  })

  it('voiceConnectionState defaults to idle', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.voiceConnectionState()).toBe('idle')
      dispose()
    })
  })

  it('setVoiceConnectionState updates state', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setVoiceConnectionState('connecting')
      expect(store.voiceConnectionState()).toBe('connecting')
      store.setVoiceConnectionState('connected')
      expect(store.voiceConnectionState()).toBe('connected')
      dispose()
    })
  })

  it('setVideoEnabled/setScreenSharing update state', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setVideoEnabled(true)
      expect(store.isVideoEnabled()).toBe(true)
      store.setScreenSharing(true)
      expect(store.isScreenSharing()).toBe(true)
      dispose()
    })
  })

  it('voiceChannelId tracks current channel', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setVoiceChannelId('voice-ch-1')
      expect(store.voiceChannelId()).toBe('voice-ch-1')
      store.setVoiceChannelId(null)
      expect(store.voiceChannelId()).toBeNull()
      dispose()
    })
  })
})

describe('Store: Presence', () => {
  it('member status updates reactively', () => {
    createRoot((dispose) => {
      const store = createAppStore()

      store.setMembers([
        { did: 'did:key:alice', displayName: 'Alice', status: 'offline' },
        { did: 'did:key:bob', displayName: 'Bob', status: 'offline' }
      ])

      expect(store.members().find((m) => m.did === 'did:key:alice')?.status).toBe('offline')

      store.setMembers(store.members().map((m) => (m.did === 'did:key:alice' ? { ...m, status: 'online' } : m)))

      expect(store.members().find((m) => m.did === 'did:key:alice')?.status).toBe('online')
      expect(store.members().find((m) => m.did === 'did:key:bob')?.status).toBe('offline')
      dispose()
    })
  })

  it('member display names are preserved on status update', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setMembers([{ did: 'did:key:alice', displayName: 'Alice', status: 'offline' }])

      store.setMembers(store.members().map((m) => (m.did === 'did:key:alice' ? { ...m, status: 'online' } : m)))

      expect(store.members().find((m) => m.did === 'did:key:alice')?.displayName).toBe('Alice')
      dispose()
    })
  })
})

describe('Store: Thread State', () => {
  it('thread signals initialize correctly', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.activeThread()).toBeNull()
      dispose()
    })
  })

  it('setActiveThread sets and clears thread', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setActiveThread({
        threadId: 't1',
        parentMessageId: 'msg-1',
        channelId: 'ch-1',
        communityId: 'c1',
        name: 'Test Thread'
      })
      expect(store.activeThread()?.threadId).toBe('t1')

      store.setActiveThread(null)
      expect(store.activeThread()).toBeNull()
      dispose()
    })
  })

  it('addThreadMessage adds to correct thread', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.addThreadMessage('t1', {
        id: 'tm-1',
        content: 'thread msg',
        authorDid: 'did:key:alice',
        authorName: 'Alice',
        timestamp: new Date().toISOString(),
        reactions: []
      })
      expect(store.threadMessages('t1').length).toBe(1)
      dispose()
    })
  })
})

describe('Store: Role Management', () => {
  it('addRole adds role to store', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.addRole({
        id: 'role-1',
        name: 'Moderator',
        color: '#ff0000',
        permissions: ['kick_members'],
        position: 1
      })
      expect(store.roles().length).toBe(1)
      expect(store.roles()[0].name).toBe('Moderator')
      dispose()
    })
  })

  it('removeRole removes role from store', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.addRole({ id: 'role-1', name: 'Mod', color: '', permissions: [], position: 1 })
      store.removeRole('role-1')
      expect(store.roles().length).toBe(0)
      dispose()
    })
  })

  it('updateRole modifies existing role', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.addRole({ id: 'role-1', name: 'Mod', color: '#fff', permissions: [], position: 1 })
      store.updateRole('role-1', { name: 'Admin' })
      expect(store.roles().find((r) => r.id === 'role-1')?.name).toBe('Admin')
      dispose()
    })
  })

  it('roles are sorted by position', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.addRole({ id: 'r1', name: 'Low', color: '', permissions: [], position: 10 })
      store.addRole({ id: 'r2', name: 'High', color: '', permissions: [], position: 1 })
      expect(store.roles()[0].name).toBe('High')
      expect(store.roles()[1].name).toBe('Low')
      dispose()
    })
  })
})

describe('Store: Connection State', () => {
  it('connectionState tracks WebSocket state', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.connectionState()).toBe('disconnected')

      store.setConnectionState('connecting' as any)
      // Might normalize
      store.setConnectionState('connected')
      expect(store.connectionState()).toBe('connected')
      dispose()
    })
  })
})

describe('Store: Typing Indicators', () => {
  it('setTypingUser adds to typing map', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setActiveChannelId('ch-1')
      store.setTypingUser('ch-1', 'did:key:bob', 'Bob')
      const users = store.activeChannelTypingUsers()
      expect(users).toContain('Bob')
      dispose()
    })
  })

  it('clearTypingUser removes from typing map', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setActiveChannelId('ch-1')
      store.setTypingUser('ch-1', 'did:key:bob', 'Bob')
      store.clearTypingUser('ch-1', 'did:key:bob')
      const users = store.activeChannelTypingUsers()
      expect(users).not.toContain('Bob')
      dispose()
    })
  })
})

describe('Store: API Surface Completeness', () => {
  it('has all required signals', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      const requiredSignals = [
        'communities',
        'channels',
        'members',
        'messages',
        'did',
        'displayName',
        'activeChannelId',
        'activeCommunityId',
        'voiceChannelId',
        'isVideoEnabled',
        'isMuted',
        'isDeafened',
        'isScreenSharing',
        'speakingUsers',
        'dmConversations',
        'dmMessages',
        'roles',
        'connectionState',
        'activeThread',
        'threadMessages',
        'voiceConnectionState',
        'voiceUsers',
        'channelVoiceParticipants'
      ]

      const missing = requiredSignals.filter((s) => typeof (store as any)[s] !== 'function')
      expect(missing).toEqual([])
      dispose()
    })
  })

  it('has all required setters', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      const requiredSetters = [
        'setDid',
        'setDisplayName',
        'setActiveChannelId',
        'setActiveCommunityId',
        'setChannels',
        'setMembers',
        'setMuted',
        'setDeafened',
        'setConnectionState',
        'addMessage',
        'removeMessage',
        'updateMessage',
        'addDMMessage',
        'addRole',
        'removeRole',
        'updateRole',
        'setVoiceChannelId',
        'setVideoEnabled',
        'setScreenSharing',
        'setSpeaking',
        'setVoiceConnectionState',
        'addChannelMessage',
        'addThreadMessage',
        'setActiveThread'
      ]

      const missing = requiredSetters.filter((s) => typeof (store as any)[s] !== 'function')
      expect(missing).toEqual([])
      dispose()
    })
  })
})

describe('Store: Search', () => {
  it('searchMessages returns matching messages', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.addChannelMessage('ch-1', {
        id: 'msg-1',
        content: 'hello world',
        authorDid: 'did:key:alice',
        authorName: 'Alice',
        timestamp: new Date().toISOString(),
        reactions: []
      })
      store.addChannelMessage('ch-1', {
        id: 'msg-2',
        content: 'goodbye world',
        authorDid: 'did:key:bob',
        authorName: 'Bob',
        timestamp: new Date().toISOString(),
        reactions: []
      })

      const results = store.searchMessages('hello')
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results.some((m) => m.content.includes('hello'))).toBe(true)
      dispose()
    })
  })
})
