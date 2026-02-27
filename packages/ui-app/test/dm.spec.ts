import { describe, it, expect } from 'vitest'
import { createAppStore } from '../src/store.tsx'
import { en, t } from '../src/i18n/strings.js'
import type { DMConversationInfo, MessageData } from '../src/types.js'

// Mock localStorage
const storage = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => storage.set(k, v),
  removeItem: (k: string) => storage.delete(k),
  clear: () => storage.clear(),
  length: 0,
  key: () => null
} as any

function makeStore() {
  storage.clear()
  return createAppStore()
}

function makeConvo(overrides?: Partial<DMConversationInfo>): DMConversationInfo {
  return {
    id: 'dm:did:test:alice',
    participantDid: 'did:test:alice',
    participantName: 'Alice',
    unreadCount: 0,
    ...overrides
  }
}

function makeMsg(overrides?: Partial<MessageData>): MessageData {
  return {
    id: 'msg-' + Math.random().toString(36).slice(2),
    content: 'Hello!',
    authorDid: 'did:test:alice',
    authorName: 'Alice',
    timestamp: new Date().toISOString(),
    reactions: [],
    ...overrides
  }
}

describe('DM Store', () => {
  it('starts with empty DM state', () => {
    const store = makeStore()
    expect(store.dmConversations()).toEqual([])
    expect(store.activeDMRecipient()).toBeNull()
    expect(store.showDMView()).toBe(false)
    expect(store.showNewDMModal()).toBe(false)
    expect(store.dmTypingUsers()).toEqual([])
  })

  it('adds a DM conversation', () => {
    const store = makeStore()
    const convo = makeConvo()
    store.addDMConversation(convo)
    expect(store.dmConversations()).toHaveLength(1)
    expect(store.dmConversations()[0].participantDid).toBe('did:test:alice')
  })

  it('does not duplicate conversations', () => {
    const store = makeStore()
    const convo = makeConvo()
    store.addDMConversation(convo)
    store.addDMConversation(convo)
    expect(store.dmConversations()).toHaveLength(1)
  })

  it('sets and clears active DM recipient', () => {
    const store = makeStore()
    store.setActiveDMRecipient('did:test:alice')
    expect(store.activeDMRecipient()).toBe('did:test:alice')
    store.setActiveDMRecipient(null)
    expect(store.activeDMRecipient()).toBeNull()
  })

  it('adds DM messages per recipient', () => {
    const store = makeStore()
    const msg1 = makeMsg({ content: 'Hello Alice' })
    const msg2 = makeMsg({ content: 'Hello Bob' })

    store.addDMMessage('did:test:alice', msg1)
    store.addDMMessage('did:test:bob', msg2)

    expect(store.dmMessages('did:test:alice')).toHaveLength(1)
    expect(store.dmMessages('did:test:alice')[0].content).toBe('Hello Alice')
    expect(store.dmMessages('did:test:bob')).toHaveLength(1)
    expect(store.dmMessages('did:test:bob')[0].content).toBe('Hello Bob')
  })

  it('does not duplicate DM messages', () => {
    const store = makeStore()
    const msg = makeMsg()
    store.addDMMessage('did:test:alice', msg)
    store.addDMMessage('did:test:alice', msg)
    expect(store.dmMessages('did:test:alice')).toHaveLength(1)
  })

  it('auto-creates conversation when adding DM message', () => {
    const store = makeStore()
    store.setDid('did:test:me')
    const msg = makeMsg({ authorDid: 'did:test:alice' })
    store.addDMMessage('did:test:alice', msg)
    expect(store.dmConversations()).toHaveLength(1)
    expect(store.dmConversations()[0].participantDid).toBe('did:test:alice')
    expect(store.dmConversations()[0].unreadCount).toBe(1)
  })

  it('increments unread count for incoming messages', () => {
    const store = makeStore()
    store.setDid('did:test:me')
    const convo = makeConvo()
    store.addDMConversation(convo)

    const msg = makeMsg({ authorDid: 'did:test:alice' })
    store.addDMMessage('did:test:alice', msg)
    expect(store.dmConversations()[0].unreadCount).toBe(1)

    const msg2 = makeMsg({ authorDid: 'did:test:alice' })
    store.addDMMessage('did:test:alice', msg2)
    expect(store.dmConversations()[0].unreadCount).toBe(2)
  })

  it('does not increment unread for own messages', () => {
    const store = makeStore()
    store.setDid('did:test:me')
    const convo = makeConvo()
    store.addDMConversation(convo)

    const msg = makeMsg({ authorDid: 'did:test:me' })
    store.addDMMessage('did:test:alice', msg)
    expect(store.dmConversations()[0].unreadCount).toBe(0)
  })

  it('marks DM as read', () => {
    const store = makeStore()
    store.setDid('did:test:me')
    store.addDMConversation(makeConvo({ unreadCount: 5 }))
    store.markDMRead('did:test:alice')
    expect(store.dmConversations()[0].unreadCount).toBe(0)
  })

  it('updates DM message content', () => {
    const store = makeStore()
    const msg = makeMsg({ id: 'msg-1', content: 'old' })
    store.addDMMessage('did:test:alice', msg)
    store.updateDMMessage('did:test:alice', 'msg-1', 'new')
    expect(store.dmMessages('did:test:alice')[0].content).toBe('new')
    expect(store.dmMessages('did:test:alice')[0].edited).toBe(true)
  })

  it('removes DM message', () => {
    const store = makeStore()
    const msg = makeMsg({ id: 'msg-1' })
    store.addDMMessage('did:test:alice', msg)
    store.removeDMMessage('did:test:alice', 'msg-1')
    expect(store.dmMessages('did:test:alice')).toHaveLength(0)
  })

  it('sets DM messages in bulk', () => {
    const store = makeStore()
    const msgs = [makeMsg({ id: 'a' }), makeMsg({ id: 'b' })]
    store.setDMMessages('did:test:alice', msgs)
    expect(store.dmMessages('did:test:alice')).toHaveLength(2)
  })

  it('toggles showDMView', () => {
    const store = makeStore()
    store.setShowDMView(true)
    expect(store.showDMView()).toBe(true)
    store.setShowDMView(false)
    expect(store.showDMView()).toBe(false)
  })

  it('toggles showNewDMModal', () => {
    const store = makeStore()
    store.setShowNewDMModal(true)
    expect(store.showNewDMModal()).toBe(true)
    store.setShowNewDMModal(false)
    expect(store.showNewDMModal()).toBe(false)
  })

  it('returns empty array for unknown recipient DM messages', () => {
    const store = makeStore()
    expect(store.dmMessages('did:test:unknown')).toEqual([])
  })

  it('updates last message in conversation on addDMMessage', () => {
    const store = makeStore()
    store.setDid('did:test:me')
    store.addDMConversation(makeConvo())
    const msg = makeMsg({ content: 'Latest!', authorDid: 'did:test:me' })
    store.addDMMessage('did:test:alice', msg)
    expect(store.dmConversations()[0].lastMessage).toBe('Latest!')
  })

  it('sets multiple conversations via setDMConversations', () => {
    const store = makeStore()
    const convos = [
      makeConvo({ participantDid: 'did:test:alice', participantName: 'Alice' }),
      makeConvo({ id: 'dm:did:test:bob', participantDid: 'did:test:bob', participantName: 'Bob' })
    ]
    store.setDMConversations(convos)
    expect(store.dmConversations()).toHaveLength(2)
  })
})

describe('DM i18n strings', () => {
  it('has all DM-related strings', () => {
    expect(en.DM_NEW).toBeDefined()
    expect(en.DM_EMPTY).toBeDefined()
    expect(en.DM_SECTION_TITLE).toBeDefined()
    expect(en.DM_SEND_PLACEHOLDER).toBeDefined()
    expect(en.DM_NEW_TITLE).toBeDefined()
    expect(en.DM_NEW_RECIPIENT_LABEL).toBeDefined()
    expect(en.DM_NEW_RECIPIENT_PLACEHOLDER).toBeDefined()
    expect(en.DM_NEW_START).toBeDefined()
    expect(en.DM_NEW_CANCEL).toBeDefined()
    expect(en.DM_NEW_INVALID_DID).toBeDefined()
    expect(en.DM_CONVERSATION_EMPTY).toBeDefined()
    expect(en.DM_TYPING_SINGLE).toBeDefined()
    expect(en.DM_TYPING_MULTIPLE).toBeDefined()
    expect(en.DM_BACK_TO_COMMUNITY).toBeDefined()
    expect(en.DM_UNREAD_COUNT).toBeDefined()
    expect(en.DM_OR_SELECT_MEMBER).toBeDefined()
  })

  it('interpolates DM_SEND_PLACEHOLDER', () => {
    expect(t('DM_SEND_PLACEHOLDER', { recipient: 'Alice' })).toBe('Message Alice')
  })

  it('interpolates DM_TYPING_SINGLE', () => {
    expect(t('DM_TYPING_SINGLE', { user: 'Bob' })).toBe('Bob is typing...')
  })

  it('interpolates DM_TYPING_MULTIPLE', () => {
    expect(t('DM_TYPING_MULTIPLE', { count: 3 })).toBe('3 people are typing...')
  })

  it('interpolates DM_UNREAD_COUNT', () => {
    expect(t('DM_UNREAD_COUNT', { count: 5 })).toBe('5 unread')
  })
})

describe('DM message sorting', () => {
  it('messages maintain insertion order', () => {
    const store = makeStore()
    const msg1 = makeMsg({ id: 'a', timestamp: '2024-01-01T00:00:00Z' })
    const msg2 = makeMsg({ id: 'b', timestamp: '2024-01-01T00:01:00Z' })
    const msg3 = makeMsg({ id: 'c', timestamp: '2024-01-01T00:02:00Z' })
    store.addDMMessage('did:test:alice', msg1)
    store.addDMMessage('did:test:alice', msg2)
    store.addDMMessage('did:test:alice', msg3)
    const msgs = store.dmMessages('did:test:alice')
    expect(msgs[0].id).toBe('a')
    expect(msgs[1].id).toBe('b')
    expect(msgs[2].id).toBe('c')
  })
})

describe('DM UI components', () => {
  it.todo('DMListView renders conversation list (needs DOM)', () => {
    // Needs jsdom/happy-dom and SolidJS rendering context
  })

  it.todo('DMConversationView renders messages (needs DOM)', () => {
    // Needs jsdom/happy-dom and SolidJS rendering context
  })

  it.todo('NewDMModal allows selecting member (needs DOM)', () => {
    // Needs jsdom/happy-dom and SolidJS rendering context
  })

  it.todo('DMConversationView sends message via client (needs server mock)', () => {
    // Needs mock HarmonyClient with sendDM method
  })

  it.todo('typing indicator shows in DM conversation (needs DOM)', () => {
    // Needs jsdom/happy-dom and SolidJS rendering context
  })
})
