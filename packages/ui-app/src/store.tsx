import { createSignal, createContext, useContext } from 'solid-js'
import { pseudonymFromDid } from './utils/pseudonym.js'
import type { KeyPair } from '@harmony/crypto'
import type { Identity } from '@harmony/identity'
import { HarmonyClient, LocalStoragePersistence } from '@harmony/client'
import type { ServerConnection } from '@harmony/client'
import type {
  CommunityInfo,
  ChannelInfo,
  MessageData,
  MemberData,
  DMConversationInfo,
  RoleInfo,
  DelegationInfo
} from './types.js'

export interface FriendData {
  did: string
  discordUsername: string
  harmonyName: string
  status: 'on-harmony' | 'not-migrated'
}

export interface AppStore {
  // Identity
  did: () => string
  setDid: (d: string) => void
  mnemonic: () => string
  setMnemonic: (m: string) => void
  isOnboarded: () => boolean
  needsSetup: () => boolean

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
  setDMConversations: (c: DMConversationInfo[]) => void
  addDMConversation: (c: DMConversationInfo) => void
  activeDMRecipient: () => string | null
  setActiveDMRecipient: (did: string | null) => void
  dmMessages: (recipientDid: string) => MessageData[]
  addDMMessage: (recipientDid: string, m: MessageData) => void
  setDMMessages: (recipientDid: string, msgs: MessageData[]) => void
  updateDMMessage: (recipientDid: string, messageId: string, newContent: string) => void
  removeDMMessage: (recipientDid: string, messageId: string) => void
  markDMRead: (recipientDid: string) => void
  showDMView: () => boolean
  setShowDMView: (s: boolean) => void
  showNewDMModal: () => boolean
  setShowNewDMModal: (s: boolean) => void
  dmTypingUsers: () => string[]

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

  // Roles
  roles: () => RoleInfo[]
  setRoles: (r: RoleInfo[]) => void
  addRole: (r: RoleInfo) => void
  updateRole: (id: string, r: Partial<RoleInfo>) => void
  removeRole: (id: string) => void
  showRoleManager: () => boolean
  setShowRoleManager: (s: boolean) => void

  // Channel settings
  showChannelSettings: () => string | null
  setShowChannelSettings: (channelId: string | null) => void
  channelPermissions: () => Map<string, Map<string, { read: boolean; send: boolean; manage: boolean }>>
  setChannelPermission: (
    channelId: string,
    roleId: string,
    perms: { read: boolean; send: boolean; manage: boolean }
  ) => void

  // Delegations
  delegations: () => DelegationInfo[]
  setDelegations: (d: DelegationInfo[]) => void
  addDelegation: (d: DelegationInfo) => void
  removeDelegation: (id: string) => void
  showDelegationView: () => boolean
  setShowDelegationView: (s: boolean) => void

  // Voice
  voiceChannelId: () => string | null
  setVoiceChannelId: (id: string | null) => void
  voiceUsers: () => string[]
  setVoiceUsers: (users: string[]) => void
  isMuted: () => boolean
  setMuted: (m: boolean) => void
  isDeafened: () => boolean
  setDeafened: (d: boolean) => void
  speakingUsers: () => Set<string>
  setSpeaking: (did: string, isSpeaking: boolean) => void

  // Friends
  friends: () => FriendData[]
  setFriends: (f: FriendData[]) => void
  showFriendFinder: () => boolean
  setShowFriendFinder: (s: boolean) => void
  autoJoinedCommunities: () => Array<{ communityId: string; communityName: string }>
  addAutoJoinedCommunity: (c: { communityId: string; communityName: string }) => void

  // Data Claim
  hasClaimedData: () => boolean
  setHasClaimedData: (v: boolean) => void
  claimedDataMeta: () => {
    messageCount: number
    channelCount: number
    serverCount: number
    dateRange: { earliest: string; latest: string } | null
  } | null
  setClaimedDataMeta: (
    m: {
      messageCount: number
      channelCount: number
      serverCount: number
      dateRange: { earliest: string; latest: string } | null
    } | null
  ) => void
  showDataClaim: () => boolean
  setShowDataClaim: (s: boolean) => void
  showDataBrowser: () => boolean
  setShowDataBrowser: (s: boolean) => void
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
  const [dmConversations, setDMConversations] = createSignal<DMConversationInfo[]>([])
  const [activeDMRecipient, setActiveDMRecipient] = createSignal<string | null>(null)
  const [showDMView, setShowDMView] = createSignal(false)
  const [showNewDMModal, setShowNewDMModal] = createSignal(false)
  const dmMessageCache = new Map<string, MessageData[]>()
  // DM typing: recipientDid -> Map<did, { displayName, timestamp }>
  const dmTypingMap = new Map<string, Map<string, { displayName: string; timestamp: number }>>()
  const [dmTypingVersion, setDMTypingVersion] = createSignal(0)

  const addDMConversation = (c: DMConversationInfo) => {
    const existing = dmConversations()
    if (existing.some((e) => e.participantDid === c.participantDid)) return
    setDMConversations([c, ...existing])
  }

  const dmMessages = (recipientDid: string): MessageData[] => {
    return dmMessageCache.get(recipientDid) ?? []
  }

  const addDMMessage = (recipientDid: string, m: MessageData) => {
    const existing = dmMessageCache.get(recipientDid) ?? []
    if (existing.some((e) => e.id === m.id)) return
    dmMessageCache.set(recipientDid, [...existing, m])
    // Update conversation list
    const convos = dmConversations()
    const idx = convos.findIndex((c) => c.participantDid === recipientDid)
    if (idx >= 0) {
      const updated = [...convos]
      updated[idx] = {
        ...updated[idx],
        lastMessage: m.content,
        lastMessageAt: m.timestamp,
        unreadCount: updated[idx].unreadCount + (m.authorDid !== did() ? 1 : 0)
      }
      setDMConversations(updated)
    } else {
      setDMConversations([
        {
          id: `dm:${recipientDid}`,
          participantDid: recipientDid,
          participantName: pseudonymFromDid(recipientDid),
          lastMessage: m.content,
          lastMessageAt: m.timestamp,
          unreadCount: m.authorDid !== did() ? 1 : 0
        },
        ...convos
      ])
    }
  }

  const setDMMessages = (recipientDid: string, msgs: MessageData[]) => {
    dmMessageCache.set(recipientDid, msgs)
  }

  const updateDMMessage = (recipientDid: string, messageId: string, newContent: string) => {
    const msgs = dmMessageCache.get(recipientDid)
    if (msgs) {
      const idx = msgs.findIndex((m) => m.id === messageId)
      if (idx >= 0) {
        msgs[idx] = { ...msgs[idx], content: newContent, edited: true }
        dmMessageCache.set(recipientDid, [...msgs])
      }
    }
  }

  const removeDMMessage = (recipientDid: string, messageId: string) => {
    const msgs = dmMessageCache.get(recipientDid)
    if (msgs) {
      dmMessageCache.set(
        recipientDid,
        msgs.filter((m) => m.id !== messageId)
      )
    }
  }

  const markDMRead = (recipientDid: string) => {
    const convos = dmConversations()
    const idx = convos.findIndex((c) => c.participantDid === recipientDid)
    if (idx >= 0) {
      const updated = [...convos]
      updated[idx] = { ...updated[idx], unreadCount: 0 }
      setDMConversations(updated)
    }
  }

  const setDMTypingUser = (recipientDid: string, senderDid: string, displayName: string) => {
    if (!dmTypingMap.has(recipientDid)) dmTypingMap.set(recipientDid, new Map())
    dmTypingMap.get(recipientDid)!.set(senderDid, { displayName, timestamp: Date.now() })
    setDMTypingVersion((v) => v + 1)
    setTimeout(() => {
      const m = dmTypingMap.get(recipientDid)
      if (m) {
        const entry = m.get(senderDid)
        if (entry && Date.now() - entry.timestamp >= 2900) {
          m.delete(senderDid)
          setDMTypingVersion((v) => v + 1)
        }
      }
    }, 3000)
  }

  const dmTypingUsers = (): string[] => {
    dmTypingVersion() // track reactivity
    const recipient = activeDMRecipient()
    if (!recipient) return []
    const m = dmTypingMap.get(recipient) ?? new Map()
    return Array.from(m.values()).map((v) => v.displayName)
  }

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
  const [showRoleManager, setShowRoleManager] = createSignal(false)

  // Channel settings state
  const [showChannelSettings, setShowChannelSettings] = createSignal<string | null>(null)
  const [channelPermissionsVersion, setChannelPermissionsVersion] = createSignal(0)
  const channelPermsMap = new Map<string, Map<string, { read: boolean; send: boolean; manage: boolean }>>()
  const channelPermissions = () => {
    channelPermissionsVersion()
    return channelPermsMap
  }
  const setChannelPermission = (
    channelId: string,
    roleId: string,
    perms: { read: boolean; send: boolean; manage: boolean }
  ) => {
    if (!channelPermsMap.has(channelId)) channelPermsMap.set(channelId, new Map())
    channelPermsMap.get(channelId)!.set(roleId, perms)
    setChannelPermissionsVersion((v) => v + 1)
  }

  // Delegation state
  const [delegations, setDelegations] = createSignal<DelegationInfo[]>([])
  const addDelegation = (d: DelegationInfo) => setDelegations((prev) => [...prev, d])
  const removeDelegation = (id: string) => setDelegations((prev) => prev.filter((d) => d.id !== id))
  const [showDelegationView, setShowDelegationView] = createSignal(false)

  // Voice state
  const [voiceChannelId, setVoiceChannelId] = createSignal<string | null>(null)
  const [voiceUsers, setVoiceUsers] = createSignal<string[]>([])
  const [isMuted, setMuted] = createSignal(false)
  const [isDeafened, setDeafened] = createSignal(false)
  const [speakingUsers, _setSpeakingUsers] = createSignal<Set<string>>(new Set())
  const setSpeaking = (did: string, isSpeaking: boolean) => {
    _setSpeakingUsers((prev) => {
      const next = new Set(prev)
      if (isSpeaking) next.add(did)
      else next.delete(did)
      return next
    })
  }

  // Friends state
  const [friends, setFriends] = createSignal<FriendData[]>([])
  const [showFriendFinder, setShowFriendFinder] = createSignal(false)
  const [autoJoinedCommunities, setAutoJoinedCommunities] = createSignal<
    Array<{ communityId: string; communityName: string }>
  >([])
  const addAutoJoinedCommunity = (c: { communityId: string; communityName: string }) => {
    setAutoJoinedCommunities((prev) => [...prev, c])
  }

  // Data Claim state
  const _savedClaimedMeta: {
    messageCount: number
    channelCount: number
    serverCount: number
    dateRange: { earliest: string; latest: string } | null
  } | null = (() => {
    try {
      const raw = restore('claimedDataMeta')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })()
  const [hasClaimedData, setHasClaimedData] = createSignal(restore('hasClaimedData') === 'true')
  const [claimedDataMeta, setClaimedDataMeta] = createSignal<{
    messageCount: number
    channelCount: number
    serverCount: number
    dateRange: { earliest: string; latest: string } | null
  } | null>(_savedClaimedMeta)
  const [showDataClaim, setShowDataClaim] = createSignal(false)
  const [showDataBrowser, setShowDataBrowser] = createSignal(false)

  // Wrap setters to persist
  const _setHasClaimedData = (v: boolean) => {
    setHasClaimedData(v)
    persist('hasClaimedData', String(v))
  }
  const _setClaimedDataMeta = (
    m: {
      messageCount: number
      channelCount: number
      serverCount: number
      dateRange: { earliest: string; latest: string } | null
    } | null
  ) => {
    setClaimedDataMeta(m)
    persist('claimedDataMeta', m ? JSON.stringify(m) : null)
  }

  const [roles, _setRoles] = createSignal<RoleInfo[]>([])

  const setRoles = (r: RoleInfo[]) => _setRoles([...r].sort((a, b) => a.position - b.position))
  const addRole = (r: RoleInfo) => _setRoles((prev) => [...prev, r].sort((a, b) => a.position - b.position))
  const storeUpdateRole = (id: string, partial: Partial<RoleInfo>) => {
    _setRoles((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...partial } : r)).sort((a, b) => a.position - b.position)
    )
  }
  const removeRole = (id: string) => {
    _setRoles((prev) => prev.filter((r) => r.id !== id))
    // Remove from members too
    setMembers(members().map((m) => ({ ...m, roles: m.roles.filter((r) => r !== id) })))
  }

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
            displayName: displayName() || pseudonymFromDid(myDid),
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
          authorName: pseudonymFromDid(msg.authorDID),
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
            authorName:
              m.authorDID === did() ? displayName() || pseudonymFromDid(did()) : pseudonymFromDid(m.authorDID),
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
              displayName: pseudonymFromDid(om.did),
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
            displayName: pseudonymFromDid(event.memberDID),
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
      const event = args[0] as { channelId?: string; communityId?: string; senderDID?: string; did?: string } & Record<
        string,
        unknown
      >
      const senderDID = event.senderDID ?? event.did ?? ''
      const channelId = event?.channelId
      if (channelId && senderDID && senderDID !== did()) {
        // Check if this is a DM typing indicator (channelId starts with 'dm:')
        if (channelId.startsWith('dm:')) {
          setDMTypingUser(senderDID, senderDID, pseudonymFromDid(senderDID))
        } else {
          setTypingUser(channelId, senderDID, pseudonymFromDid(senderDID))
        }
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

    client.on('dm', (...args: unknown[]) => {
      const event = args[0] as {
        id: string
        channelId?: string
        authorDID: string
        content: { text?: string }
        timestamp: string
      }
      if (event) {
        const senderDid = event.authorDID
        const data: MessageData = {
          id: event.id,
          content: event.content?.text ?? '[encrypted]',
          authorDid: senderDid,
          authorName: pseudonymFromDid(senderDid),
          timestamp: event.timestamp,
          reactions: []
        }
        addDMMessage(senderDid, data)
      }
    })

    client.on('dm.edited' as any, (...args: unknown[]) => {
      const event = args[0] as { messageId?: string; newText?: string; senderDID?: string }
      if (event?.messageId && event?.newText && event?.senderDID) {
        updateDMMessage(event.senderDID, event.messageId, event.newText)
      }
    })

    client.on('dm.deleted' as any, (...args: unknown[]) => {
      const event = args[0] as { messageId?: string; senderDID?: string }
      if (event?.messageId && event?.senderDID) {
        removeDMMessage(event.senderDID, event.messageId)
      }
    })

    client.on('role.created' as any, (...args: unknown[]) => {
      const event = args[0] as {
        roleId?: string
        name?: string
        color?: string
        permissions?: string[]
        position?: number
      }
      if (event?.roleId && event?.name) {
        addRole({
          id: event.roleId,
          name: event.name,
          color: event.color,
          permissions: event.permissions ?? [],
          position: event.position ?? 0
        })
      }
    })

    client.on('role.updated' as any, (...args: unknown[]) => {
      const event = args[0] as {
        roleId?: string
        name?: string
        color?: string
        permissions?: string[]
        position?: number
      }
      if (event?.roleId) {
        storeUpdateRole(event.roleId, {
          name: event.name,
          color: event.color,
          permissions: event.permissions,
          position: event.position
        })
      }
    })

    client.on('role.deleted' as any, (...args: unknown[]) => {
      const event = args[0] as { roleId?: string }
      if (event?.roleId) {
        removeRole(event.roleId)
      }
    })

    client.on('community.member.updated' as any, (...args: unknown[]) => {
      const event = args[0] as { memberDID?: string; roles?: string[] }
      if (event?.memberDID && event?.roles) {
        setMembers(members().map((m) => (m.did === event.memberDID ? { ...m, roles: event.roles! } : m)))
      }
    })

    client.on('voice.state', (...args: unknown[]) => {
      const event = args[0] as { channelId?: string; participants?: string[] }
      if (event?.channelId && event.channelId === voiceChannelId()) {
        setVoiceUsers(event.participants ?? [])
      }
    })

    client.on('voice.joined', (...args: unknown[]) => {
      const event = args[0] as { channelId?: string }
      if (event?.channelId) {
        setVoiceChannelId(event.channelId)
      }
    })

    client.on('voice.left', () => {
      setVoiceChannelId(null)
      setVoiceUsers([])
    })

    client.on('community.auto-joined' as any, (...args: unknown[]) => {
      const event = args[0] as {
        communityId: string
        communityName: string
        description?: string
        channels?: Array<{ id: string; name: string; type: string }>
      }
      if (event?.communityId) {
        // Skip if community already exists in store
        const existing = communities().find((c) => c.id === event.communityId)
        if (existing) return

        // Add community to store
        const communityInfo: CommunityInfo = {
          id: event.communityId,
          name: event.communityName || 'Community',
          description: event.description,
          memberCount: 0
        }
        setCommunities([...communities(), communityInfo])

        // Add channels
        if (event.channels) {
          const channelInfos = event.channels.map((ch) => ({
            id: ch.id,
            name: ch.name,
            type: ch.type as 'text' | 'voice' | 'announcement',
            communityId: event.communityId
          }))
          setChannels([...channels(), ...channelInfos])
        }

        addAutoJoinedCommunity({
          communityId: event.communityId,
          communityName: event.communityName
        })
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
            displayName: displayName() || pseudonymFromDid(myDid),
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
    needsSetup: () => did().length > 0 && displayName().length === 0,
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
    setDMConversations,
    addDMConversation,
    activeDMRecipient,
    setActiveDMRecipient,
    dmMessages,
    addDMMessage,
    setDMMessages,
    updateDMMessage,
    removeDMMessage,
    markDMRead,
    showDMView,
    setShowDMView,
    showNewDMModal,
    setShowNewDMModal,
    dmTypingUsers,
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
    searchMessages,
    roles,
    setRoles,
    addRole,
    updateRole: storeUpdateRole,
    removeRole,
    showRoleManager,
    setShowRoleManager,
    showChannelSettings,
    setShowChannelSettings,
    channelPermissions,
    setChannelPermission,
    delegations,
    setDelegations,
    addDelegation,
    removeDelegation,
    showDelegationView,
    setShowDelegationView,
    voiceChannelId,
    setVoiceChannelId,
    voiceUsers,
    setVoiceUsers,
    isMuted,
    setMuted,
    isDeafened,
    setDeafened,
    speakingUsers,
    setSpeaking,
    friends,
    setFriends,
    showFriendFinder,
    setShowFriendFinder,
    autoJoinedCommunities,
    addAutoJoinedCommunity,
    hasClaimedData,
    setHasClaimedData: _setHasClaimedData,
    claimedDataMeta,
    setClaimedDataMeta: _setClaimedDataMeta,
    showDataClaim,
    setShowDataClaim,
    showDataBrowser,
    setShowDataBrowser
  }
}

export const AppContext = createContext<AppStore>()

export function useAppStore(): AppStore {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('AppContext not found')
  return ctx
}
