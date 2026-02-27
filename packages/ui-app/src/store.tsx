import { createSignal, createContext, useContext } from 'solid-js'
import { pseudonymFromDid } from './utils/pseudonym.js'
import type { KeyPair } from '@harmony/crypto'
import type { Identity } from '@harmony/identity'
import { HarmonyClient, LocalStoragePersistence } from '@harmony/client'
import { VoiceClient } from '@harmony/voice'
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

  // Loading state — true until first community data arrives
  loading: () => boolean

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
  showCommunitySettings: () => boolean
  setShowCommunitySettings: (s: boolean) => void
  showSettings: () => boolean
  setShowSettings: (s: boolean) => void
  showMigrationWizard: () => boolean
  setShowMigrationWizard: (s: boolean) => void
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
  /** Per-channel voice participant tracking for sidebar display */
  channelVoiceParticipants: (channelId: string) => string[]
  isMuted: () => boolean
  setMuted: (m: boolean) => void
  isDeafened: () => boolean
  setDeafened: (d: boolean) => void
  isVideoEnabled: () => boolean
  setVideoEnabled: (v: boolean) => void
  isScreenSharing: () => boolean
  setScreenSharing: (s: boolean) => void
  speakingUsers: () => Set<string>
  setSpeaking: (did: string, isSpeaking: boolean) => void

  // Friends
  friends: () => FriendData[]
  setFriends: (f: FriendData[]) => void
  showFriendFinder: () => boolean
  setShowFriendFinder: (s: boolean) => void
  autoJoinedCommunities: () => Array<{ communityId: string; communityName: string }>
  addAutoJoinedCommunity: (c: { communityId: string; communityName: string }) => void

  // Threads
  activeThread: () => {
    threadId: string
    parentMessageId: string
    channelId: string
    communityId: string
    name: string
  } | null
  setActiveThread: (
    thread: {
      threadId: string
      parentMessageId: string
      channelId: string
      communityId: string
      name: string
    } | null
  ) => void
  threadMessages: (threadId: string) => MessageData[]
  addThreadMessage: (threadId: string, msg: MessageData) => void
  threadCounts: () => Map<string, number>
  addThreadMeta: (parentMessageId: string, threadId: string, name: string) => void
  threadMetaForMessage: (messageId: string) => { threadId: string; name: string; replyCount: number } | null

  // Recovery
  recoveryStatus: () => {
    configured: boolean
    trustedDIDs?: string[]
    threshold?: number
  } | null
  setRecoveryStatus: (s: { configured: boolean; trustedDIDs?: string[]; threshold?: number } | null) => void

  // Mobile
  mobileApp: () => import('@harmony/mobile').MobileApp | null
  setMobileApp: (app: import('@harmony/mobile').MobileApp | null) => void
  biometricEnabled: () => boolean
  setBiometricEnabled: (b: boolean) => void
  pendingRecoveryRequests: () => Array<{
    requestId: string
    claimedDID: string
    createdAt: string
    approvalsCount: number
    threshold: number
    alreadyApproved: boolean
  }>
  setPendingRecoveryRequests: (
    r: Array<{
      requestId: string
      claimedDID: string
      createdAt: string
      approvalsCount: number
      threshold: number
      alreadyApproved: boolean
    }>
  ) => void

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

// ── localStorage persistence helpers (UI preferences ONLY) ──────────────
const STORAGE_PREFIX = 'harmony:'

function persistUI(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(STORAGE_PREFIX + key)
    else localStorage.setItem(STORAGE_PREFIX + key, value)
  } catch {
    /* quota / SSR */
  }
}

function restoreUI(key: string): string | null {
  try {
    return localStorage.getItem(STORAGE_PREFIX + key)
  } catch {
    return null
  }
}

/** Save identity + servers to Electron backend (disk), fallback to localStorage in browser */
async function persistToBackend(patch: Record<string, unknown>): Promise<void> {
  if (window.__HARMONY_DESKTOP__?.updateConfig) {
    try {
      await window.__HARMONY_DESKTOP__.updateConfig(patch as any)
    } catch (err) {
      console.error('[Harmony] Failed to persist config to backend:', err)
    }
  } else if (patch.identity) {
    // Browser-only fallback: persist identity to localStorage
    try {
      localStorage.setItem(STORAGE_PREFIX + 'identity', JSON.stringify(patch.identity))
    } catch {
      /* quota / SSR */
    }
  }
}

/** Load identity from localStorage (browser-only fallback) */
export function restoreIdentityFromLocalStorage(): {
  did: string
  mnemonic: string
  displayName: string
  createdAt: string
} | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + 'identity')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.did === 'string' && typeof parsed.mnemonic === 'string') {
      return parsed
    }
  } catch {
    /* corrupt data / SSR */
  }
  return null
}

export function createAppStore(): AppStore {
  // UI preferences from localStorage (safe — these are ephemeral display prefs)
  const savedTheme = (restoreUI('theme') as 'dark' | 'light') ?? 'dark'
  const savedActiveCommunity = restoreUI('activeCommunityId') ?? ''
  const savedActiveChannel = restoreUI('activeChannelId') ?? ''

  // Identity and data signals — populated from backend config on mount
  const [did, _setDid] = createSignal('')
  const [mnemonic, _setMnemonic] = createSignal('')
  const [displayName, _setDisplayName] = createSignal('')
  const [identity, setIdentity] = createSignal<Identity | null>(null)
  const [keyPair, setKeyPair] = createSignal<KeyPair | null>(null)
  const [_client, _setClient] = createSignal<HarmonyClient | null>(null)
  const [servers, setServers] = createSignal<ServerConnection[]>([])

  // Loading state — true until first community.list response or timeout
  const [loading, _setLoading] = createSignal(true)
  let loadingTimerId: ReturnType<typeof setTimeout> | undefined

  // Data signals — populated from server on connect, NOT persisted to localStorage
  const [communities, _setCommunities] = createSignal<CommunityInfo[]>([])
  const [activeCommunityId, _setActiveCommunityId] = createSignal(savedActiveCommunity)
  const [channels, _setChannels] = createSignal<ChannelInfo[]>([])
  const [activeChannelId, _setActiveChannelId] = createSignal(savedActiveChannel)

  function setCommunities(c: CommunityInfo[]) {
    _setCommunities(c)
    // Communities arrived — no longer loading
    if (loadingTimerId) clearTimeout(loadingTimerId)
    _setLoading(false)
  }
  function setActiveCommunityId(id: string) {
    _setActiveCommunityId(id)
    persistUI('activeCommunityId', id)
  }
  function setChannels(c: ChannelInfo[]) {
    _setChannels(c)
  }
  function setActiveChannelId(id: string) {
    _setActiveChannelId(id)
    persistUI('activeChannelId', id)
  }
  const [messages, setMessages] = createSignal<MessageData[]>([])
  const [members, _setMembers] = createSignal<MemberData[]>([])
  function setMembers(m: MemberData[]) {
    _setMembers(m)
  }
  const [dmConversations, setDMConversations] = createSignal<DMConversationInfo[]>([])
  const [activeDMRecipient, setActiveDMRecipient] = createSignal<string | null>(null)
  const [showDMView, setShowDMView] = createSignal(false)
  const [showNewDMModal, setShowNewDMModal] = createSignal(false)
  const dmMessageCache = new Map<string, MessageData[]>()
  const [dmMsgVersion, setDmMsgVersion] = createSignal(0)
  // DM typing: recipientDid -> Map<did, { displayName, timestamp }>
  const dmTypingMap = new Map<string, Map<string, { displayName: string; timestamp: number }>>()
  const [dmTypingVersion, setDMTypingVersion] = createSignal(0)

  const addDMConversation = (c: DMConversationInfo) => {
    const existing = dmConversations()
    if (existing.some((e) => e.participantDid === c.participantDid)) return
    setDMConversations([c, ...existing])
  }

  const dmMessages = (recipientDid: string): MessageData[] => {
    dmMsgVersion() // track reactivity
    return dmMessageCache.get(recipientDid) ?? []
  }

  const addDMMessage = (recipientDid: string, m: MessageData) => {
    const existing = dmMessageCache.get(recipientDid) ?? []
    if (existing.some((e) => e.id === m.id)) return
    dmMessageCache.set(recipientDid, [...existing, m])
    setDmMsgVersion((v) => v + 1)
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
    setDmMsgVersion((v) => v + 1)
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
    setDmMsgVersion((v) => v + 1)
  }

  const removeDMMessage = (recipientDid: string, messageId: string) => {
    const msgs = dmMessageCache.get(recipientDid)
    if (msgs) {
      dmMessageCache.set(
        recipientDid,
        msgs.filter((m) => m.id !== messageId)
      )
    }
    setDmMsgVersion((v) => v + 1)
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
  const [showCommunitySettings, setShowCommunitySettings] = createSignal(false)
  const [showSettings, setShowSettings] = createSignal(false)
  const [showMigrationWizard, setShowMigrationWizard] = createSignal(false)
  const [showCreateChannel, setShowCreateChannel] = createSignal(false)
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
  const voiceParticipantsMap = new Map<string, string[]>()
  const [voiceParticipantsVersion, setVoiceParticipantsVersion] = createSignal(0)
  const channelVoiceParticipants = (channelId: string): string[] => {
    voiceParticipantsVersion() // track reactivity
    return voiceParticipantsMap.get(channelId) ?? []
  }
  const [isMuted, setMuted] = createSignal(false)
  const [isDeafened, setDeafened] = createSignal(false)
  const [isVideoEnabled, setVideoEnabled] = createSignal(false)
  const [isScreenSharing, setScreenSharing] = createSignal(false)
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
  } | null = null
  const [hasClaimedData, setHasClaimedData] = createSignal(false)
  const [claimedDataMeta, setClaimedDataMeta] = createSignal<{
    messageCount: number
    channelCount: number
    serverCount: number
    dateRange: { earliest: string; latest: string } | null
  } | null>(_savedClaimedMeta)
  const [showDataClaim, setShowDataClaim] = createSignal(false)
  const [showDataBrowser, setShowDataBrowser] = createSignal(false)

  // Thread state
  const [activeThread, setActiveThread] = createSignal<{
    threadId: string
    parentMessageId: string
    channelId: string
    communityId: string
    name: string
  } | null>(null)
  const threadMessageCache = new Map<string, MessageData[]>()
  const [threadVersion, setThreadVersion] = createSignal(0)
  // parentMessageId → { threadId, name, replyCount }
  const threadMetaMap = new Map<string, { threadId: string; name: string; replyCount: number }>()
  const [threadMetaVersion, setThreadMetaVersion] = createSignal(0)

  const threadMessages = (threadId: string): MessageData[] => {
    threadVersion() // track reactivity
    return threadMessageCache.get(threadId) ?? []
  }

  const addThreadMessage = (threadId: string, msg: MessageData) => {
    const existing = threadMessageCache.get(threadId) ?? []
    if (existing.some((e) => e.id === msg.id)) return
    threadMessageCache.set(threadId, [...existing, msg])
    setThreadVersion((v) => v + 1)
    // Update reply count in meta
    for (const [, meta] of threadMetaMap) {
      if (meta.threadId === threadId) {
        meta.replyCount++
        setThreadMetaVersion((v) => v + 1)
        break
      }
    }
  }

  const threadCounts = (): Map<string, number> => {
    threadMetaVersion() // track reactivity
    const counts = new Map<string, number>()
    for (const [msgId, meta] of threadMetaMap) {
      counts.set(msgId, meta.replyCount)
    }
    return counts
  }

  const addThreadMeta = (parentMessageId: string, threadId: string, name: string) => {
    if (!threadMetaMap.has(parentMessageId)) {
      threadMetaMap.set(parentMessageId, { threadId, name, replyCount: 0 })
      setThreadMetaVersion((v) => v + 1)
    }
  }

  const threadMetaForMessage = (messageId: string): { threadId: string; name: string; replyCount: number } | null => {
    threadMetaVersion() // track reactivity
    return threadMetaMap.get(messageId) ?? null
  }

  // Recovery state
  const [recoveryStatus, setRecoveryStatus] = createSignal<{
    configured: boolean
    trustedDIDs?: string[]
    threshold?: number
  } | null>(null)
  const [pendingRecoveryRequests, setPendingRecoveryRequests] = createSignal<
    Array<{
      requestId: string
      claimedDID: string
      createdAt: string
      approvalsCount: number
      threshold: number
      alreadyApproved: boolean
    }>
  >([])

  // Mobile
  const [mobileApp, setMobileApp] = createSignal<import('@harmony/mobile').MobileApp | null>(null)
  const [biometricEnabled, setBiometricEnabled] = createSignal(false)
  // Wrap setters (no localStorage — claimed data state comes from server)
  const _setHasClaimedData = (v: boolean) => {
    setHasClaimedData(v)
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

  // Persisted setters — identity persists to backend (disk), UI prefs to localStorage
  const persistIdentity = () => {
    const d = did()
    const m = mnemonic()
    if (d && m) {
      persistToBackend({
        identity: { did: d, mnemonic: m, displayName: displayName(), createdAt: '' }
      })
    }
  }
  const setDid = (d: string) => {
    _setDid(d)
    persistIdentity()
  }
  const setMnemonic = (m: string) => {
    _setMnemonic(m)
    persistIdentity()
  }
  const setDisplayName = (n: string) => {
    _setDisplayName(n)
    persistIdentity()
    // Update member list entry for local user
    const myDid = did()
    if (myDid) {
      setMembers(members().map((m) => (m.did === myDid ? { ...m, displayName: n || pseudonymFromDid(myDid) } : m)))
    }
  }
  const setTheme = (t: 'dark' | 'light') => {
    _setTheme(t)
    persistUI('theme', t)
  }

  const addMessage = (m: MessageData) => {
    setMessages((prev) => [...prev, m])
  }

  // Per-channel message cache
  const channelMessageCache = new Map<string, MessageData[]>()
  const [channelMsgVersion, setChannelMsgVersion] = createSignal(0)

  const channelMessages = (channelId: string): MessageData[] => {
    channelMsgVersion() // track reactivity
    return channelMessageCache.get(channelId) ?? []
  }

  const addChannelMessage = (channelId: string, m: MessageData) => {
    const existing = channelMessageCache.get(channelId) ?? []
    if (existing.some((e) => e.id === m.id)) return
    channelMessageCache.set(channelId, [...existing, m])
    setChannelMsgVersion((v) => v + 1)
  }

  const setChannelMessages = (channelId: string, msgs: MessageData[]) => {
    channelMessageCache.set(channelId, msgs)
    setChannelMsgVersion((v) => v + 1)
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
    setChannelMsgVersion((v) => v + 1)
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
    setChannelMsgVersion((v) => v + 1)
  }

  const searchMessages = (query: string): MessageData[] => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    const results: MessageData[] = []
    // Search channel messages
    for (const [channelId, msgs] of channelMessageCache) {
      for (const m of msgs) {
        if (m.content.toLowerCase().includes(q) || m.authorName.toLowerCase().includes(q)) {
          results.push({ ...m, channelId })
        }
      }
    }
    // Search DM messages
    for (const [recipientDid, msgs] of dmMessageCache) {
      for (const m of msgs) {
        if (m.content.toLowerCase().includes(q) || m.authorName.toLowerCase().includes(q)) {
          results.push({ ...m, channelId: `dm:${recipientDid}` })
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
    client.on('connected', () => {
      updateConnectionStateFromClient(client)
      refreshServers()

      // Send display name to server so it knows our name for community.info responses
      const name = displayName()
      if (name) {
        client.updateDisplayName(name)
      }

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
      // Request community list from server (source of truth)
      client.requestCommunityList()
      // Also request info for any communities we already know about
      for (const c of communities()) {
        client.requestCommunityInfo(c.id)
      }
    })

    client.on('disconnected', () => {
      updateConnectionStateFromClient(client)
      refreshServers()
    })

    client.on('reconnecting', () => {
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
          authorName: (() => {
            const member = members().find((mb) => mb.did === msg.authorDID)
            return member?.displayName || pseudonymFromDid(msg.authorDID)
          })(),
          timestamp: msg.timestamp,
          reactions: [] as Array<{ emoji: string; count: number; userReacted: boolean }>
        }
        addMessage(data)
        addChannelMessage(msg.channelId, data)
      }
    })

    client.on('reaction.added' as any, (...args: unknown[]) => {
      const evt = args[0] as { channelId: string; messageId: string; emoji: string; memberDID: string }
      if (!evt?.messageId) return
      const myDid = did()
      const updateReactions = (msgs: MessageData[]) =>
        msgs.map((m) => {
          if (m.id !== evt.messageId) return m
          const reactions = [...(m.reactions || [])]
          const existing = reactions.find((r) => r.emoji === evt.emoji)
          if (existing) {
            existing.count++
            if (evt.memberDID === myDid) existing.userReacted = true
          } else {
            reactions.push({ emoji: evt.emoji, count: 1, userReacted: evt.memberDID === myDid })
          }
          return { ...m, reactions }
        })
      setMessages(updateReactions(messages()))
      const cached = channelMessageCache.get(evt.channelId)
      if (cached) setChannelMessages(evt.channelId, updateReactions(cached))
    })

    client.on('reaction.removed' as any, (...args: unknown[]) => {
      const evt = args[0] as { channelId: string; messageId: string; emoji: string; memberDID: string }
      if (!evt?.messageId) return
      const myDid = did()
      const updateReactions = (msgs: MessageData[]) =>
        msgs.map((m) => {
          if (m.id !== evt.messageId) return m
          let reactions = [...(m.reactions || [])]
          const existing = reactions.find((r) => r.emoji === evt.emoji)
          if (existing) {
            existing.count--
            if (evt.memberDID === myDid) existing.userReacted = false
            if (existing.count <= 0) reactions = reactions.filter((r) => r.emoji !== evt.emoji)
          }
          return { ...m, reactions }
        })
      setMessages(updateReactions(messages()))
      const cached = channelMessageCache.get(evt.channelId)
      if (cached) setChannelMessages(evt.channelId, updateReactions(cached))
    })

    client.on('sync', (...args: unknown[]) => {
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
            authorName: (() => {
              if (m.authorDID === did()) return displayName() || pseudonymFromDid(did())
              const member = members().find((mb) => mb.did === m.authorDID)
              return member?.displayName || pseudonymFromDid(m.authorDID)
            })(),
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

    // Handle community list from server — populate communities and channels from server data
    client.on('community.list', (...args: unknown[]) => {
      const event = args[0] as {
        communities: Array<{
          id: string
          name: string
          channels?: Array<{ id: string; name: string; type: string }>
        }>
      }
      if (event?.communities) {
        const communityInfos: CommunityInfo[] = event.communities.map((c) => ({
          id: c.id,
          name: c.name,
          icon: '',
          memberCount: 0
        }))
        setCommunities(communityInfos)

        // Collect channels from all communities
        const allChannels: ChannelInfo[] = []
        for (const c of event.communities) {
          if (c.channels) {
            for (const ch of c.channels) {
              allChannels.push({ id: ch.id, name: ch.name, type: ch.type as any, communityId: c.id })
            }
          }
          // Request full member info for each community
          client.requestCommunityInfo(c.id)
        }
        if (allChannels.length > 0) setChannels(allChannels)

        // Auto-select first community/channel if none active
        if (!activeCommunityId() && communityInfos.length > 0) {
          setActiveCommunityId(communityInfos[0].id)
          if (allChannels.length > 0) {
            const firstChannel = allChannels.find((ch) => ch.communityId === communityInfos[0].id)
            if (firstChannel) {
              setActiveChannelId(firstChannel.id)
              client.syncChannel(communityInfos[0].id, firstChannel.id).catch(() => {})
            }
          }
        } else if (activeCommunityId() && activeChannelId()) {
          // Re-sync active channel
          client.syncChannel(activeCommunityId(), activeChannelId()).catch(() => {})
        }
      }
    })

    client.on('community.info', (...args: unknown[]) => {
      const event = args[0] as {
        communityId: string
        members?: Array<{ did: string; displayName: string; status: string; linked: boolean }>
        onlineMembers?: Array<{ did: string; status: string }>
      }
      if (event?.members) {
        // Full member list from server — use it directly
        const current = members()
        const updated: typeof current = []
        for (const m of event.members) {
          const existing = current.find((e) => e.did === m.did)
          // If this member is the current user, prefer local display name
          const isCurrentUser = m.did === did()
          const serverName = m.displayName && m.displayName !== m.did ? m.displayName : undefined
          const resolvedName = isCurrentUser
            ? displayName() || serverName || pseudonymFromDid(m.did)
            : serverName || existing?.displayName || pseudonymFromDid(m.did)
          updated.push({
            did: m.did,
            displayName: resolvedName,
            roles: existing?.roles ?? [],
            status: (m.status as 'online' | 'offline' | 'idle' | 'dnd') ?? 'offline',
            linked: m.linked
          })
        }
        // Keep any members not in server response (e.g. self)
        for (const c of current) {
          if (!updated.find((u) => u.did === c.did)) {
            updated.push(c)
          }
        }
        setMembers(updated)
      } else if (event?.onlineMembers) {
        // Legacy: only online members
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
          authorName: (() => {
            const member = members().find((mb) => mb.did === senderDid)
            return member?.displayName || pseudonymFromDid(senderDid)
          })(),
          timestamp: event.timestamp,
          reactions: []
        }
        addDMMessage(senderDid, data)
      }
    })

    client.on('dm.edited', (...args: unknown[]) => {
      const event = args[0] as { messageId?: string; newText?: string; senderDID?: string }
      if (event?.messageId && event?.newText && event?.senderDID) {
        updateDMMessage(event.senderDID, event.messageId, event.newText)
      }
    })

    client.on('dm.deleted', (...args: unknown[]) => {
      const event = args[0] as { messageId?: string; senderDID?: string }
      if (event?.messageId && event?.senderDID) {
        removeDMMessage(event.senderDID, event.messageId)
      }
    })

    client.on('role.created', (...args: unknown[]) => {
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

    client.on('role.updated', (...args: unknown[]) => {
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

    client.on('role.deleted', (...args: unknown[]) => {
      const event = args[0] as { roleId?: string }
      if (event?.roleId) {
        removeRole(event.roleId)
      }
    })

    client.on('community.member.updated', (...args: unknown[]) => {
      const event = args[0] as { memberDID?: string; roles?: string[] }
      if (event?.memberDID && event?.roles) {
        setMembers(members().map((m) => (m.did === event.memberDID ? { ...m, roles: event.roles! } : m)))
      }
    })

    client.on('voice.state', (...args: unknown[]) => {
      const event = args[0] as { channelId?: string; participants?: string[] }
      if (event?.channelId) {
        // Always update per-channel map for sidebar display
        const participants = event.participants ?? []
        if (participants.length > 0) {
          voiceParticipantsMap.set(event.channelId, participants)
        } else {
          voiceParticipantsMap.delete(event.channelId)
        }
        setVoiceParticipantsVersion((v) => v + 1)
        // Update current voice users if this is our active voice channel
        if (event.channelId === voiceChannelId()) {
          setVoiceUsers(participants)
        }
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

    client.on('community.auto-joined', (...args: unknown[]) => {
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

    // Thread events
    client.on('thread.created', (...args: unknown[]) => {
      const event = args[0] as {
        threadId: string
        parentMessageId: string
        channelId: string
        communityId: string
        name: string
        creatorDID: string
        content: { text?: string }
      }
      if (event?.threadId) {
        addThreadMeta(event.parentMessageId, event.threadId, event.name)
        if (event.content?.text) {
          addThreadMessage(event.threadId, {
            id: `${event.threadId}-0`,
            content: event.content.text,
            authorDid: event.creatorDID,
            authorName: (() => {
              const member = members().find((mb) => mb.did === event.creatorDID)
              return member?.displayName || pseudonymFromDid(event.creatorDID)
            })(),
            timestamp: new Date().toISOString(),
            reactions: []
          })
        }
      }
    })

    client.on('thread.message', (...args: unknown[]) => {
      const event = args[0] as {
        threadId: string
        content: { text?: string }
        nonce: string
      }
      // msg.sender is on the outer message, not the payload — we get it from args
      const rawMsg = args[1] as { sender?: string } | undefined
      const sender = rawMsg?.sender ?? 'unknown'
      if (event?.threadId && event.content?.text) {
        addThreadMessage(event.threadId, {
          id: `thread-${event.threadId}-${Date.now()}-${event.nonce}`,
          content: event.content.text,
          authorDid: sender,
          authorName: (() => {
            const member = members().find((mb) => mb.did === sender)
            return member?.displayName || pseudonymFromDid(sender)
          })(),
          timestamp: new Date().toISOString(),
          reactions: []
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
      keyPair: kp,
      voiceClient: new VoiceClient({ mode: 'mediasoup' })
    })

    _setClient(client)
    setupClientListeners(client)
    updateConnectionStateFromClient(client)
    refreshServers()

    // Start a loading timeout — if no community.list arrives within 3s, stop loading
    if (loadingTimerId) clearTimeout(loadingTimerId)
    loadingTimerId = setTimeout(() => _setLoading(false), 3000)

    // If client already connected during create() (persistence adapter auto-connect),
    // the 'connected' event fired before listeners were set up. Manually trigger
    // community list request so communities load on page refresh.
    if (client.isConnected()) {
      client.requestCommunityList()
    }

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
    loading,
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
    showCommunitySettings,
    setShowCommunitySettings,
    showSettings,
    setShowSettings,
    showMigrationWizard,
    setShowMigrationWizard,
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
    channelVoiceParticipants,
    isMuted,
    setMuted,
    isDeafened,
    setDeafened,
    isVideoEnabled,
    setVideoEnabled,
    isScreenSharing,
    setScreenSharing,
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
    setShowDataBrowser,
    activeThread,
    setActiveThread,
    threadMessages,
    addThreadMessage,
    threadCounts,
    addThreadMeta,
    threadMetaForMessage,
    recoveryStatus,
    setRecoveryStatus,
    pendingRecoveryRequests,
    setPendingRecoveryRequests,
    mobileApp,
    setMobileApp,
    biometricEnabled,
    setBiometricEnabled
  }
}

export const AppContext = createContext<AppStore>()

export function useAppStore(): AppStore {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('AppContext not found')
  return ctx
}
