import { describe, it, expect } from 'vitest'
import { createAuthStore } from '../src/stores/auth.js'
import { createCommunityStore } from '../src/stores/community.js'
import { createChannelStore } from '../src/stores/channel.js'
import { LoginView } from '../src/components/Auth/LoginView.js'
import { CommunityList } from '../src/components/Community/CommunityList.js'
import { CommunityHeader } from '../src/components/Community/CommunityHeader.js'
import { MemberList } from '../src/components/Community/MemberList.js'
import { ChannelList } from '../src/components/Channel/ChannelList.js'
import { MessageList } from '../src/components/Channel/MessageList.js'
import { MessageComposer } from '../src/components/Channel/MessageComposer.js'
import { Message } from '../src/components/Channel/Message.js'
import { TypingIndicator } from '../src/components/Channel/TypingIndicator.js'
import { DMList } from '../src/components/DM/DMList.js'
import { Avatar } from '../src/components/Shared/Avatar.js'
import { App } from '../src/App.js'
import type { CommunityState, DecryptedMessage, ChannelInfo, MemberInfo, DMChannelState } from '@harmony/client'

describe('@harmony/ui', () => {
  describe('Auth Store', () => {
    it('MUST create auth store with initial state', () => {
      const store = createAuthStore()
      expect(store.state().authenticated).toBe(false)
      expect(store.state().identity).toBeNull()
    })

    it('MUST set identity on login', () => {
      const store = createAuthStore()
      const mockIdentity = { did: 'did:key:test', document: {} as any, credentials: [], capabilities: [] }
      const mockKeyPair = { publicKey: new Uint8Array(32), secretKey: new Uint8Array(32), type: 'Ed25519' as const }
      store.setIdentity(mockIdentity, mockKeyPair, 'test mnemonic')
      expect(store.state().authenticated).toBe(true)
      expect(store.state().identity?.did).toBe('did:key:test')
      expect(store.state().mnemonic).toBe('test mnemonic')
    })

    it('MUST clear state on logout', () => {
      const store = createAuthStore()
      const mockIdentity = { did: 'did:key:test', document: {} as any, credentials: [], capabilities: [] }
      const mockKeyPair = { publicKey: new Uint8Array(32), secretKey: new Uint8Array(32), type: 'Ed25519' as const }
      store.setIdentity(mockIdentity, mockKeyPair)
      store.logout()
      expect(store.state().authenticated).toBe(false)
      expect(store.state().identity).toBeNull()
    })
  })

  describe('Community Store', () => {
    it('MUST track communities', () => {
      const store = createCommunityStore()
      expect(store.communities()).toEqual([])

      const community: CommunityState = {
        id: 'c1',
        info: { id: 'c1', name: 'Test', creatorDID: '', createdAt: '', memberCount: 1 },
        channels: [],
        members: [],
        myRoles: [],
        myCapabilities: []
      }
      store.addCommunity(community)
      expect(store.communities().length).toBe(1)
    })

    it('MUST set active community', () => {
      const store = createCommunityStore()
      store.setActiveCommunity('c1')
      expect(store.activeCommunityId()).toBe('c1')
    })

    it('MUST remove community', () => {
      const store = createCommunityStore()
      const community: CommunityState = {
        id: 'c1',
        info: { id: 'c1', name: 'Test', creatorDID: '', createdAt: '', memberCount: 1 },
        channels: [],
        members: [],
        myRoles: [],
        myCapabilities: []
      }
      store.addCommunity(community)
      store.removeCommunity('c1')
      expect(store.communities().length).toBe(0)
    })
  })

  describe('Channel Store', () => {
    it('MUST track active channel', () => {
      const store = createChannelStore()
      store.setActiveChannel('ch1')
      expect(store.activeChannelId()).toBe('ch1')
    })

    it('MUST track messages', () => {
      const store = createChannelStore()
      const msg: DecryptedMessage = {
        id: 'm1',
        channelId: 'ch1',
        authorDID: 'did:key:test',
        content: { text: 'hello' },
        timestamp: new Date().toISOString(),
        clock: { counter: 1, authorDID: 'did:key:test' },
        reactions: new Map(),
        edited: false
      }
      store.setMessages([msg])
      expect(store.messages().length).toBe(1)
    })

    it('MUST track typing users', () => {
      const store = createChannelStore()
      store.addTypingUser('did:key:alice')
      expect(store.typingUsers()).toContain('did:key:alice')
      store.removeTypingUser('did:key:alice')
      expect(store.typingUsers()).not.toContain('did:key:alice')
    })
  })

  describe('App', () => {
    it('MUST initialise with login view', () => {
      const app = App()
      expect(app.view()).toBe('login')
    })

    it('MUST switch to chat view', () => {
      const app = App()
      app.setView('chat')
      expect(app.view()).toBe('chat')
    })
  })

  describe('LoginView', () => {
    it('MUST handle create action', () => {
      let created = false
      const view = LoginView({
        onLogin: () => {},
        onCreate: () => {
          created = true
        }
      })
      view.handleCreate()
      expect(created).toBe(true)
    })

    it('MUST handle recover action', () => {
      let receivedMnemonic = ''
      const view = LoginView({
        onLogin: (m) => {
          receivedMnemonic = m
        },
        onCreate: () => {}
      })
      view.setMnemonic('test words here')
      view.handleRecover()
      expect(receivedMnemonic).toBe('test words here')
    })
  })

  describe('CommunityList', () => {
    it('MUST list communities', () => {
      const communities: CommunityState[] = [
        {
          id: 'c1',
          info: { id: 'c1', name: 'A', creatorDID: '', createdAt: '', memberCount: 1 },
          channels: [],
          members: [],
          myRoles: [],
          myCapabilities: []
        },
        {
          id: 'c2',
          info: { id: 'c2', name: 'B', creatorDID: '', createdAt: '', memberCount: 2 },
          channels: [],
          members: [],
          myRoles: [],
          myCapabilities: []
        }
      ]
      const list = CommunityList({ communities, activeCommunityId: 'c1', onSelect: () => {} })
      expect(list.communities().length).toBe(2)
    })

    it('MUST select community', () => {
      let selected = ''
      const list = CommunityList({
        communities: [],
        activeCommunityId: null,
        onSelect: (id) => {
          selected = id
        }
      })
      list.select('c1')
      expect(selected).toBe('c1')
    })
  })

  describe('CommunityHeader', () => {
    it('MUST display community name', () => {
      const community: CommunityState = {
        id: 'c1',
        info: { id: 'c1', name: 'Test Community', creatorDID: '', createdAt: '', memberCount: 5 },
        channels: [],
        members: [],
        myRoles: [],
        myCapabilities: []
      }
      const header = CommunityHeader({ community })
      expect(header.name()).toBe('Test Community')
      expect(header.memberCount()).toBe(5)
    })
  })

  describe('MemberList', () => {
    it('MUST count online/offline members', () => {
      const members: MemberInfo[] = [
        { did: 'did:key:a', roles: [], joinedAt: '', presence: { status: 'online' } },
        { did: 'did:key:b', roles: [], joinedAt: '', presence: { status: 'offline' } },
        { did: 'did:key:c', roles: [], joinedAt: '', presence: { status: 'idle' } }
      ]
      const list = MemberList({ members })
      expect(list.onlineCount()).toBe(2)
      expect(list.offlineCount()).toBe(1)
    })
  })

  describe('ChannelList', () => {
    it('MUST filter by channel type', () => {
      const channels: ChannelInfo[] = [
        { id: 'ch1', communityId: 'c1', name: 'general', type: 'text', createdAt: '' },
        { id: 'ch2', communityId: 'c1', name: 'voice', type: 'voice', createdAt: '' },
        { id: 'ch3', communityId: 'c1', name: 'news', type: 'announcement', createdAt: '' }
      ]
      const list = ChannelList({ channels, activeChannelId: null, onSelect: () => {} })
      expect(list.textChannels().length).toBe(1)
      expect(list.voiceChannels().length).toBe(1)
      expect(list.announcementChannels().length).toBe(1)
    })
  })

  describe('MessageList', () => {
    it('MUST report message count', () => {
      const messages: DecryptedMessage[] = [
        {
          id: 'm1',
          channelId: 'ch1',
          authorDID: 'did:key:a',
          content: { text: 'hi' },
          timestamp: '',
          clock: { counter: 1, authorDID: 'did:key:a' },
          reactions: new Map(),
          edited: false
        }
      ]
      const list = MessageList({ messages, loading: false, hasMore: false, onLoadMore: () => {} })
      expect(list.messageCount()).toBe(1)
    })
  })

  describe('MessageComposer', () => {
    it('MUST send message and clear input', () => {
      let sent = ''
      const composer = MessageComposer({
        onSend: (text) => {
          sent = text
        },
        onTyping: () => {}
      })
      composer.setText('hello')
      composer.send()
      expect(sent).toBe('hello')
      expect(composer.text()).toBe('')
    })

    it('MUST not send empty messages', () => {
      let sent = false
      const composer = MessageComposer({
        onSend: () => {
          sent = true
        },
        onTyping: () => {}
      })
      composer.send()
      expect(sent).toBe(false)
    })
  })

  describe('Message', () => {
    it('MUST expose message properties', () => {
      const msg: DecryptedMessage = {
        id: 'm1',
        channelId: 'ch1',
        authorDID: 'did:key:alice',
        content: { text: 'hello world' },
        timestamp: '2026-02-22T10:00:00Z',
        clock: { counter: 1, authorDID: 'did:key:alice' },
        reactions: new Map([['👍', ['did:key:bob']]]),
        edited: true,
        editedAt: '2026-02-22T10:01:00Z'
      }
      const component = Message({ message: msg, isOwn: true })
      expect(component.authorDID()).toBe('did:key:alice')
      expect(component.content().text).toBe('hello world')
      expect(component.edited()).toBe(true)
      expect(component.isOwn()).toBe(true)
    })
  })

  describe('TypingIndicator', () => {
    it('MUST show typing text for one user', () => {
      const indicator = TypingIndicator({ typingUsers: ['did:key:alice123'] })
      expect(indicator.isTyping()).toBe(true)
      expect(indicator.text()).toContain('is typing')
    })

    it('MUST show typing text for multiple users', () => {
      const indicator = TypingIndicator({ typingUsers: ['did:key:a', 'did:key:b'] })
      expect(indicator.text()).toContain('are typing')
    })

    it('MUST show count for 3+ users', () => {
      const indicator = TypingIndicator({ typingUsers: ['a', 'b', 'c'] })
      expect(indicator.text()).toContain('3 people')
    })
  })

  describe('DMList', () => {
    it('MUST calculate total unread', () => {
      const channels: DMChannelState[] = [
        { recipientDID: 'did:key:a', messages: [], unreadCount: 3 },
        { recipientDID: 'did:key:b', messages: [], unreadCount: 2 }
      ]
      const list = DMList({ channels, activeRecipientDID: null, onSelect: () => {} })
      expect(list.totalUnread()).toBe(5)
    })
  })

  describe('Avatar', () => {
    it('MUST generate initials from DID', () => {
      const avatar = Avatar({ did: 'did:key:z6MkTest' })
      expect(avatar.initials()).toBe('ST')
    })

    it('MUST generate deterministic background color', () => {
      const avatar1 = Avatar({ did: 'did:key:same' })
      const avatar2 = Avatar({ did: 'did:key:same' })
      expect(avatar1.backgroundColor()).toBe(avatar2.backgroundColor())
    })

    it('MUST default to md size', () => {
      const avatar = Avatar({ did: 'did:key:test' })
      expect(avatar.size()).toBe('md')
    })
  })
})
