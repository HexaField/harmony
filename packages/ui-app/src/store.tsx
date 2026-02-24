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
  displayName: () => string
  setDisplayName: (n: string) => void
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
  const [communities, setCommunities] = createSignal<CommunityInfo[]>([])
  const [activeCommunityId, setActiveCommunityId] = createSignal('')
  const [channels, setChannels] = createSignal<ChannelInfo[]>([])
  const [activeChannelId, setActiveChannelId] = createSignal('')
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
  const [displayName, _setDisplayName] = createSignal(savedDisplayName)

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
    displayName,
    setDisplayName
  }
}

export const AppContext = createContext<AppStore>()

export function useAppStore(): AppStore {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('AppContext not found')
  return ctx
}
