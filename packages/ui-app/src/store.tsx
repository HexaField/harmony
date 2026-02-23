import { createSignal, createContext, useContext, type JSX } from 'solid-js'
import type {
  CommunityInfo,
  ChannelInfo,
  MessageData,
  MemberData,
  DMConversationInfo,
  ProposalInfo,
  CredentialInfo,
  BotInfo,
  FriendInfo,
  FriendRequest,
  DeviceInfo
} from './types.js'

export interface AppStore {
  // Identity
  did: () => string
  setDid: (d: string) => void
  mnemonic: () => string
  setMnemonic: (m: string) => void
  isOnboarded: () => boolean

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

  // Members
  members: () => MemberData[]
  setMembers: (m: MemberData[]) => void

  // DMs
  dmConversations: () => DMConversationInfo[]

  // Connection
  connectionState: () => 'connected' | 'disconnected' | 'reconnecting'
  setConnectionState: (s: 'connected' | 'disconnected' | 'reconnecting') => void

  // Theme
  theme: () => 'dark' | 'light'
  setTheme: (t: 'dark' | 'light') => void

  // UI state
  showMemberSidebar: () => boolean
  setShowMemberSidebar: (s: boolean) => void
  showSearch: () => boolean
  setShowSearch: (s: boolean) => void
}

export function createAppStore(): AppStore {
  const [did, setDid] = createSignal('')
  const [mnemonic, setMnemonic] = createSignal('')
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
  const [theme, setTheme] = createSignal<'dark' | 'light'>('dark')
  const [showMemberSidebar, setShowMemberSidebar] = createSignal(true)
  const [showSearch, setShowSearch] = createSignal(false)

  const addMessage = (m: MessageData) => {
    setMessages((prev) => [...prev, m])
  }

  return {
    did,
    setDid,
    mnemonic,
    setMnemonic,
    isOnboarded: () => did().length > 0,
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
    members,
    setMembers,
    dmConversations,
    connectionState,
    setConnectionState,
    theme,
    setTheme,
    showMemberSidebar,
    setShowMemberSidebar,
    showSearch,
    setShowSearch
  }
}

export const AppContext = createContext<AppStore>()

export function useAppStore(): AppStore {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('AppContext not found')
  return ctx
}
