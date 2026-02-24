import { createSignal, createContext, useContext } from 'solid-js'
import type { KeyPair } from '@harmony/crypto'
import type { Identity } from '@harmony/identity'
import { HarmonyClient } from '@harmony/client'
import type { CommunityInfo, ChannelInfo, MessageData, MemberData, DMConversationInfo } from './types.js'

export interface ServerEntry {
  url: string
  name: string
  status: 'connected' | 'connecting' | 'disconnected' | 'error'
  client: HarmonyClient | null
  error?: string
}

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

  // Harmony client (legacy single-client accessor)
  client: () => HarmonyClient | null
  setClient: (c: HarmonyClient | null) => void

  // Multi-server
  servers: () => ServerEntry[]
  setServers: (s: ServerEntry[]) => void
  updateServer: (url: string, patch: Partial<ServerEntry>) => void
  getServerClient: (url: string) => HarmonyClient | null

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

  // Connection
  connectionState: () => 'connected' | 'disconnected' | 'reconnecting'
  setConnectionState: (s: 'connected' | 'disconnected' | 'reconnecting') => void
  connectionError: () => string
  setConnectionError: (e: string) => void

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
  const [client, setClient] = createSignal<HarmonyClient | null>(null)
  const [servers, setServers] = createSignal<ServerEntry[]>([])
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
    // Avoid duplicates
    if (existing.some((e) => e.id === m.id)) return
    channelMessageCache.set(channelId, [...existing, m])
  }

  const setChannelMessages = (channelId: string, msgs: MessageData[]) => {
    channelMessageCache.set(channelId, msgs)
  }

  const updateServer = (url: string, patch: Partial<ServerEntry>) => {
    setServers((prev) => prev.map((s) => (s.url === url ? { ...s, ...patch } : s)))
  }

  const getServerClient = (url: string): HarmonyClient | null => {
    const server = servers().find((s) => s.url === url)
    return server?.client ?? null
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
    client,
    setClient,
    servers,
    setServers,
    updateServer,
    getServerClient,
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
