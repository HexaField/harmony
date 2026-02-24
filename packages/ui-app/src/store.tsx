import { createSignal, createContext, useContext } from 'solid-js'
import type { KeyPair } from '@harmony/crypto'
import type { Identity } from '@harmony/identity'
import { HarmonyClient, LocalStoragePersistence } from '@harmony/client'
import type { ServerConnection } from '@harmony/client'
import type { CommunityInfo, ChannelInfo, MessageData, MemberData, DMConversationInfo } from './types.js'

export interface AppStore {
  // Identity
  did: () => string
  setDid: (d: string) => void
  mnemonic: () => string
  setMnemonic: (m: string) => void
  isOnboarded: () => boolean

  // Identity objects (for client connection)
  identity: () => Identity | null
  setIdentity: (i: Identity | null) => void
  keyPair: () => KeyPair | null
  setKeyPair: (k: KeyPair | null) => void

  // Harmony client — single instance, delegates all connection management
  client: () => HarmonyClient | null
  initClient: (identity: Identity, keyPair: KeyPair) => Promise<void>
  addServer: (url: string) => void

  // Connection state — derived from client
  connectionState: () => 'connected' | 'disconnected' | 'reconnecting'
  setConnectionState: (s: 'connected' | 'disconnected' | 'reconnecting') => void
  connectionError: () => string
  setConnectionError: (e: string) => void

  // Multi-server — reactive mirror of client.servers()
  servers: () => ServerConnection[]
  refreshServers: () => void

  // Communities
  communities: () => CommunityInfo[]
  setCommunities: (c: CommunityInfo[]) => void
  activeCommunityId: () => string
  setActiveCommunityId: (id: string) => void

  // Channels
  channels: () => ChannelInfo[]
  setChannels: (c: ChannelInfo[]) => void
  activeChannelId: () => string
  setActiveChannelId: (id: string) => void

  // Messages
  messages: () => MessageData[]
  setMessages: (m: MessageData[]) => void
  addMessage: (m: MessageData) => void

  // Per-channel message cache
  channelMessages: (channelId: string) => MessageData[]
  addChannelMessage: (channelId: string, m: MessageData) => void
  setChannelMessages: (channelId: string, msgs: MessageData[]) => void

  // Members
  members: () => MemberData[]
  setMembers: (m: MemberData[]) => void

  // DMs
  dmConversations: () => DMConversationInfo[]

  // Theme
  theme: () => 'dark' | 'light'
  setTheme: (t: 'dark' | 'light') => void

  // UI state
  showMemberSidebar: () => boolean
  setShowMemberSidebar: (s: boolean) => void
  showSearch: () => boolean
  setShowSearch: (s: boolean) => void
  showCreateCommunity: () => boolean
  setShowCreateCommunity: (s: boolean) => void
  showSettings: () => boolean
  setShowSettings: (s: boolean) => void
  showCreateChannel: () => boolean
  setShowCreateChannel: (s: boolean) => void
  displayName: () => string
  setDisplayName: (n: string) => void

  // Typing indicators
  typingUsers: () => Map<string, { displayName: string; timestamp: number }>
  setTypingUser: (channelId: string, did: string, displayName: string) => void
  clearTypingUser: (channelId: string, did: string) => void
  activeChannelTypingUsers: () => string[]

  // Message editing
  editingMessageId: () => string | null
  setEditingMessageId: (id: string | null) => void
  updateMessage: (channelId: string, messageId: string, newContent: string) => void
  removeMessage: (channelId: string, messageId: string) => void

  // Search
  searchMessages: (query: string) => MessageData[]
}

// ── localStorage persistence helpers ──────────────────────────────
const STORAGE_PREFIX = 'harmony:'

function persist(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(STORAGE_PREFIX + key)
    else localStorage.setItem(STORAGE_PREFIX + key, value)
  } catch {
    /* quota / SSR */
  }
}

function restore(key: string): string | null {
  try {
    return localStorage.getItem(STORAGE_PREFIX + key)
  } catch {
    return null
  }
}

export function createAppStore(): AppStore {
  // Restore persisted state
  const savedDid = restore('did') ?? ''
  const savedMnemonic = restore('mnemonic') ?? ''
  const savedDisplayName = restore('displayName') ?? ''
  const savedTheme = (restore('theme') as 'dark' | 'light') ?? 'dark'

  const [did, _setDid] = createSignal(savedDid)
  const [mnemonic, _setMnemonic] = createSignal(savedMnemonic)
  const [identity, setIdentity] = createSignal<Identity | null>(null)
  const [keyPair, setKeyPair] = createSignal<KeyPair | null>(null)
  const [_client, _setClient] = createSignal<HarmonyClient | null>(null)
  const [servers, setServers] = createSignal<ServerConnection[]>([])
  const savedCommunities: CommunityInfo[] = (() => {
    try {
      const raw = localStorage.getItem('harmony:communities')
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })()
  const savedChannels: ChannelInfo[] = (() => {
    try {
      const raw = localStorage.getItem('harmony:channels')
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })()
  const savedActiveCommunity = localStorage.getItem('harmony:activeCommunityId') ?? ''
  const savedActiveChannel = localStorage.getItem('harmony:activeChannelId') ?? ''

  const [communities, _setCommunities] = createSignal<CommunityInfo[]>(savedCommunities)
  const [activeCommunityId, _setActiveCommunityId] = createSignal(savedActiveCommunity)
  const [channels, _setChannels] = createSignal<ChannelInfo[]>(savedChannels)
  const [activeChannelId, _setActiveChannelId] = createSignal(savedActiveChannel)

  function setCommunities(c: CommunityInfo[]) {
    _setCommunities(c)
    localStorage.setItem('harmony:communities', JSON.stringify(c))
  }
  function setActiveCommunityId(id: string) {
    _setActiveCommunityId(id)
    localStorage.setItem('harmony:activeCommunityId', id)
  }
  function setChannels(c: ChannelInfo[]) {
    _setChannels(c)
    localStorage.setItem('harmony:channels', JSON.stringify(c))
  }
  function setActiveChannelId(id: string) {
    _setActiveChannelId(id)
    localStorage.setItem('harmony:activeChannelId', id)
  }
  const [messages, setMessages] = createSignal<MessageData[]>([])
  const [members, setMembers] = createSignal<MemberData[]>([])
  const [dmConversations] = createSignal<DMConversationInfo[]>([])
  const [connectionState, setConnectionState] = createSignal<'connected' | 'disconnected' | 'reconnecting'>(
    'disconnected'
  )
  const [connectionError, setConnectionError] = createSignal('')
  const [theme, _setTheme] = createSignal<'dark' | 'light'>(savedTheme)
  const [showMemberSidebar, setShowMemberSidebar] = createSignal(true)
  const [showSearch, setShowSearch] = createSignal(false)
  const [showCreateCommunity, setShowCreateCommunity] = createSignal(false)
  const [showSettings, setShowSettings] = createSignal(false)
  const [showCreateChannel, setShowCreateChannel] = createSignal(false)
  const [displayName, _setDisplayName] = createSignal(savedDisplayName)
  const [editingMessageId, setEditingMessageId] = createSignal<string | null>(null)

  // Typing indicators: channelId -> Map<did, { displayName, timestamp }>
  const typingUsersMap = new Map<string, Map<string, { displayName: string; timestamp: number }>>()
  const [typingVersion, setTypingVersion] = createSignal(0)
  const typingUsers = () => {
    typingVersion() // track reactivity
    const channelId = activeChannelId()
    return typingUsersMap.get(channelId) ?? new Map()
  }
  const setTypingUser = (channelId: string, did: string, dn: string) => {
    if (!typingUsersMap.has(channelId)) typingUsersMap.set(channelId, new Map())
    typingUsersMap.get(channelId)!.set(did, { displayName: dn, timestamp: Date.now() })
    setTypingVersion((v) => v + 1)
    setTimeout(() => {
      const m = typingUsersMap.get(channelId)
      if (m) {
        const entry = m.get(did)
        if (entry && Date.now() - entry.timestamp >= 2900) {
          m.delete(did)
          setTypingVersion((v) => v + 1)
        }
      }
    }, 3000)
  }
  const clearTypingUser = (channelId: string, did: string) => {
    typingUsersMap.get(channelId)?.delete(did)
    setTypingVersion((v) => v + 1)
  }
  const activeChannelTypingUsers = (): string[] => {
    const m = typingUsers()
    return Array.from(m.values()).map((v) => v.displayName)
  }

  // Persisted setters — write to signal + localStorage
  const setDid = (d: string) => {
    _setDid(d)
    persist('did', d || null)
  }
  const setMnemonic = (m: string) => {
    _setMnemonic(m)
    persist('mnemonic', m || null)
  }
  const setDisplayName = (n: string) => {
    _setDisplayName(n)
    persist('displayName', n || null)
  }
  const setTheme = (t: 'dark' | 'light') => {
    _setTheme(t)
    persist('theme', t)
  }

  const addMessage = (m: MessageData) => {
    setMessages((prev) => [...prev, m])
  }

  // Per-channel message cache
  const channelMessageCache = new Map<string, MessageData[]>()

  const channelMessages = (channelId: string): MessageData[] => {
    return channelMessageCache.get(channelId) ?? []
  }

  const addChannelMessage = (channelId: string, m: MessageData) => {
    const existing = channelMessageCache.get(channelId) ?? []
    if (existing.some((e) => e.id === m.id)) return
    channelMessageCache.set(channelId, [...existing, m])
  }

  const setChannelMessages = (channelId: string, msgs: MessageData[]) => {
    channelMessageCache.set(channelId, msgs)
  }

  const updateMessage = (channelId: string, messageId: string, newContent: string) => {
    const msgs = channelMessageCache.get(channelId)
    if (msgs) {
      const idx = msgs.findIndex((m) => m.id === messageId)
      if (idx >= 0) {
        msgs[idx] = { ...msgs[idx], content: newContent, edited: true }
        channelMessageCache.set(channelId, [...msgs])
      }
    }
    // Also update global messages
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, content: newContent, edited: true } : m)))
  }

  const removeMessage = (channelId: string, messageId: string) => {
    const msgs = channelMessageCache.get(channelId)
    if (msgs) {
      channelMessageCache.set(
        channelId,
        msgs.filter((m) => m.id !== messageId)
      )
    }
    setMessages((prev) => prev.filter((m) => m.id !== messageId))
  }

  const searchMessages = (query: string): MessageData[] => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    const results: MessageData[] = []
    for (const [, msgs] of channelMessageCache) {
      for (const m of msgs) {
        if (m.content.toLowerCase().includes(q) || m.authorName.toLowerCase().includes(q)) {
          results.push(m)
        }
      }
    }
    return results
  }

  const refreshServers = () => {
    const c = _client()
    if (c) {
      setServers(c.servers())
    }
  }

  /** Subscribe to client events to keep store in sync */
  function setupClientListeners(client: HarmonyClient) {
    client.on('connected' as any, () => {
      updateConnectionStateFromClient(client)
      refreshServers()

      // Ensure current user appears in member list
      const myDid = did()
      if (myDid && !members().some((m) => m.did === myDid)) {
        setMembers([
          ...members(),
          {
            did: myDid,
            displayName: displayName() || did().substring(0, 16),
            roles: ['admin'],
            status: 'online'
          }
        ])
      }

      // After reconnect, sync the active channel to load message history
      const communityId = activeCommunityId()
      const channelId = activeChannelId()
      if (communityId && channelId) {
        client.syncChannel(communityId, channelId).catch(() => {
          /* ignore sync errors */
        })
      }
      // Request community info for member/presence data
      for (const c of communities()) {
        client.requestCommunityInfo(c.id)
      }
    })

    client.on('disconnected' as any, () => {
      updateConnectionStateFromClient(client)
      refreshServers()
    })

    client.on('reconnecting' as any, () => {
      setConnectionState('reconnecting')
      refreshServers()
    })

    client.on('message', (...args: unknown[]) => {
      const msg = args[0] as {
        id: string
        channelId: string
        authorDID: string
        content: { text?: string }
        timestamp: string
      }
      if (msg?.content?.text) {
        const data = {
          id: msg.id,
          content: msg.content.text,
          authorDid: msg.authorDID,
          authorName: msg.authorDID.substring(0, 12),
          timestamp: msg.timestamp,
          reactions: [] as Array<{ emoji: string; count: number; userReacted: boolean }>
        }
        addMessage(data)
        addChannelMessage(msg.channelId, data)
      }
    })

    client.on('sync' as any, (...args: unknown[]) => {
      const event = args[0] as {
        communityId: string
        channelId: string
        messages: Array<{
          id: string
          channelId: string
          authorDID: string
          content: { text?: string }
          timestamp: string
        }>
      }
      if (event?.channelId && event.messages) {
        const mapped = event.messages
          .filter((m) => m.content?.text)
          .map((m) => ({
            id: m.id,
            content: m.content.text ?? '',
            authorDid: m.authorDID,
            authorName: m.authorDID === did() ? displayName() || did().substring(0, 16) : m.authorDID.substring(0, 16),
            timestamp: m.timestamp,
            reactions: [] as Array<{ emoji: string; count: number; userReacted: boolean }>
          }))
        setChannelMessages(event.channelId, mapped)
        // If this is the active channel, update displayed messages too
        if (event.channelId === activeChannelId()) {
          setMessages(mapped)
        }
      }
    })

    client.on('community.info', (...args: unknown[]) => {
      const event = args[0] as {
        communityId: string
        onlineMembers?: Array<{ did: string; status: string }>
      }
      if (event?.onlineMembers) {
        const current = members()
        const updated = [...current]
        for (const om of event.onlineMembers) {
          const existing = updated.find((m) => m.did === om.did)
          if (existing) {
            existing.status = om.status as 'online' | 'idle' | 'dnd' | 'offline'
          } else {
            updated.push({
              did: om.did,
              displayName: om.did.substring(0, 12),
              roles: [],
              status: om.status as 'online' | 'idle' | 'dnd' | 'offline'
            })
          }
        }
        setMembers(updated)
      }
    })

    client.on('member.joined', (...args: unknown[]) => {
      const event = args[0] as { communityId: string; memberDID: string }
      if (event) {
        setMembers([
          ...members(),
          {
            did: event.memberDID,
            displayName: event.memberDID.substring(0, 12),
            roles: [],
            status: 'online'
          }
        ])
      }
    })

    client.on('member.left', (...args: unknown[]) => {
      const event = args[0] as { memberDID: string }
      if (event) {
        setMembers(members().filter((m) => m.did !== event.memberDID))
      }
    })

    client.on('error', (...args: unknown[]) => {
      const err = args[0] as { message?: string }
      setConnectionError(err?.message ?? 'Unknown error')
    })

    client.on('typing', (...args: unknown[]) => {
      const event = args[0] as { channelId?: string; communityId?: string } & Record<string, unknown>
      const senderDID = (event as any).senderDID ?? (event as any).did ?? ''
      const channelId = event?.channelId
      if (channelId && senderDID && senderDID !== did()) {
        setTypingUser(channelId, senderDID, senderDID.substring(0, 12))
      }
    })

    client.on('message.edited', (...args: unknown[]) => {
      const event = args[0] as { messageId?: string; newText?: string; channelId?: string }
      if (event?.messageId && event?.newText) {
        const chId = event.channelId ?? activeChannelId()
        if (chId) updateMessage(chId, event.messageId, event.newText)
      }
    })

    client.on('message.deleted', (...args: unknown[]) => {
      const event = args[0] as { messageId?: string; channelId?: string }
      if (event?.messageId) {
        const chId = event.channelId ?? activeChannelId()
        if (chId) removeMessage(chId, event.messageId)
      }
    })
  }

  function updateConnectionStateFromClient(client: HarmonyClient) {
    const state = client.connectionState()
    if (state === 'connected') {
      setConnectionState('connected')
      setConnectionError('')
    } else if (state === 'partial') {
      setConnectionState('reconnecting')
    } else {
      setConnectionState('disconnected')
    }
  }

  /** Create & initialize the single HarmonyClient instance */
  async function initClient(id: Identity, kp: KeyPair): Promise<void> {
    // If client already exists, skip
    if (_client()) return

    const client = await HarmonyClient.create({
      persistenceAdapter: new LocalStoragePersistence(),
      wsFactory: (url: string) => new WebSocket(url) as any,
      identity: id,
      keyPair: kp
    })

    _setClient(client)
    setupClientListeners(client)
    updateConnectionStateFromClient(client)
    refreshServers()

    // Ensure current user appears in member list when connected
    if (client.isConnected()) {
      const myDid = did()
      if (myDid && !members().some((m) => m.did === myDid)) {
        setMembers([
          ...members(),
          {
            did: myDid,
            displayName: displayName() || did().substring(0, 16),
            roles: ['admin'],
            status: 'online'
          }
        ])
      }
    }

    // If already connected and we have an active channel, sync immediately
    const communityId = activeCommunityId()
    const channelId = activeChannelId()
    if (client.isConnected() && communityId && channelId) {
      client.syncChannel(communityId, channelId).catch(() => {
        /* ignore */
      })
    }
  }

  function addServer(url: string) {
    const c = _client()
    if (!c) return
    c.addServer(url)
    refreshServers()
  }

  return {
    did,
    setDid,
    mnemonic,
    setMnemonic,
    isOnboarded: () => did().length > 0,
    identity,
    setIdentity,
    keyPair,
    setKeyPair,
    client: _client,
    initClient,
    addServer,
    servers,
    refreshServers,
    communities,
    setCommunities,
    activeCommunityId,
    setActiveCommunityId,
    channels,
    setChannels,
    activeChannelId,
    setActiveChannelId,
    messages,
    setMessages,
    addMessage,
    channelMessages,
    addChannelMessage,
    setChannelMessages,
    members,
    setMembers,
    dmConversations,
    connectionState,
    setConnectionState,
    connectionError,
    setConnectionError,
    theme,
    setTheme,
    showMemberSidebar,
    setShowMemberSidebar,
    showSearch,
    setShowSearch,
    showCreateCommunity,
    setShowCreateCommunity,
    showSettings,
    setShowSettings,
    showCreateChannel,
    setShowCreateChannel,
    displayName,
    setDisplayName,
    typingUsers,
    setTypingUser,
    clearTypingUser,
    activeChannelTypingUsers,
    editingMessageId,
    setEditingMessageId,
    updateMessage,
    removeMessage,
    searchMessages
  }
}

export const AppContext = createContext<AppStore>()

export function useAppStore(): AppStore {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('AppContext not found')
  return ctx
}
