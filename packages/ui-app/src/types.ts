// Component type definitions for all 73 components
import type { JSX } from 'solid-js'

// Props types for all components

// Shell
export interface AppRootProps {
  children?: JSX.Element
}
export interface OnboardingProps {
  onComplete: (did: string) => void
}
export interface CommunityLayoutProps {
  communityId: string
  children?: JSX.Element
}
export interface ChannelSidebarProps {
  communityId: string
  channels: ChannelInfo[]
  activeChannelId?: string
  onSelect: (id: string) => void
}
export interface ServerListProps {
  communities: CommunityInfo[]
  activeCommunityId?: string
  onSelect: (id: string) => void
}
export interface TitleBarProps {
  communityName?: string
  userName?: string
}

// Messaging
export interface MessageListProps {
  channelId: string
  messages: MessageData[]
}
export interface MessageItemProps {
  message: MessageData
  onEdit?: () => void
  onDelete?: () => void
  onReply?: () => void
  onThread?: () => void
}
export interface MessageInputProps {
  channelId: string
  onSend: (content: string) => void
  placeholder?: string
}
export interface MessageEditorProps {
  message: MessageData
  onSave: (content: string) => void
  onCancel: () => void
}
export interface ThreadViewProps {
  parentMessage: MessageData
  replies: MessageData[]
}
export interface ReactionPickerProps {
  onSelect: (emoji: string) => void
}
export interface EmbedRendererProps {
  url: string
  title?: string
  description?: string
}
export interface TypingIndicatorProps {
  users: string[]
}

// Channel
export interface ChannelHeaderProps {
  channel: ChannelInfo
}
export interface PinnedMessagesProps {
  messages: MessageData[]
}
export interface ChannelSettingsProps {
  channel: ChannelInfo
}

// Voice
export interface VoiceChannelProps {
  channelId: string
  participants: VoiceParticipantInfo[]
}
export interface VoiceControlsProps {
  muted: boolean
  deafened: boolean
  videoOn: boolean
  onToggleMute: () => void
  onToggleDeafen: () => void
  onToggleVideo: () => void
  onLeave: () => void
}
export interface VoiceParticipantProps {
  participant: VoiceParticipantInfo
}
export interface VoicePipProps {
  channelName: string
  participants: VoiceParticipantInfo[]
}

// Members
export interface MemberListProps {
  members: MemberData[]
  onSelect: (did: string) => void
}
export interface MemberCardProps {
  member: MemberData
}
export interface MemberProfileProps {
  member: MemberData
}

// DMs
export interface DMListProps {
  conversations: DMConversationInfo[]
  onSelect: (id: string) => void
}
export interface DMConversationProps {
  conversationId: string
  messages: MessageData[]
}
export interface DMComposeProps {
  onSend: (recipientDid: string, content: string) => void
}

// Community Management
export interface CommunitySettingsFormProps {
  communityId: string
}
export interface RoleManagerProps {
  communityId: string
  roles: RoleData[]
}
export interface MemberManagerProps {
  communityId: string
  members: MemberData[]
}
export interface InviteManagerProps {
  communityId: string
}
export interface AuditLogProps {
  communityId: string
  entries: AuditEntry[]
}

// Bots
export interface BotStoreProps {
  bots: BotInfo[]
}
export interface BotSettingsProps {
  botId: string
}
export interface BotDashboardProps {
  bots: BotInfo[]
}

// Governance
export interface ProposalListProps {
  proposals: ProposalInfo[]
}
export interface ProposalDetailProps {
  proposal: ProposalInfo
}
export interface ProposalCreateProps {
  communityId: string
  onSubmit: (proposal: ProposalDraft) => void
}
export interface ConstitutionViewProps {
  communityId: string
}

// Credentials
export interface CredentialPortfolioProps {
  credentials: CredentialInfo[]
}
export interface CredentialDetailProps {
  credential: CredentialInfo
}
export interface CredentialIssueProps {
  onIssue: (type: string, claims: Record<string, unknown>) => void
}

// Search
export interface SearchOverlayProps {
  onClose: () => void
  onSelect: (result: SearchResultItem) => void
}
export interface SearchResultsProps {
  results: SearchResultItem[]
  onSelect: (result: SearchResultItem) => void
}

// Settings
export interface UserSettingsProps {}
export interface IdentitySettingsProps {
  did: string
}
export interface DeviceSettingsProps {
  devices: DeviceInfo[]
}
export interface RecoverySettingsProps {}
export interface AppearanceSettingsProps {
  theme: 'dark' | 'light'
  onThemeChange: (theme: 'dark' | 'light') => void
}
export interface NotificationSettingsProps {}
export interface NodeSettingsProps {}

// Friends
export interface FriendListProps {
  friends: FriendInfo[]
}
export interface FriendRequestsProps {
  requests: FriendRequest[]
}
export interface DiscordFriendFinderProps {}

// Migration
export interface MigrationWizardProps {
  onComplete: () => void
}
export interface MigrationProgressProps {
  phase: string
  current: number
  total: number
  channelName?: string
}
export interface MigrationCompleteProps {
  summary: MigrationSummary
}

// Shared
export interface AvatarProps {
  did?: string
  name?: string
  size?: 'sm' | 'md' | 'lg'
}
export interface BadgeProps {
  text: string
  variant?: 'default' | 'success' | 'warning' | 'error'
}
export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children?: JSX.Element
}
export interface TooltipProps {
  text: string
  children: JSX.Element
}
export interface ContextMenuProps {
  items: MenuItem[]
  x: number
  y: number
  onClose: () => void
}
export interface ToastNotification {
  id: string
  message: string
  type: 'info' | 'success' | 'error'
  duration?: number
}
export interface DropdownProps {
  items: MenuItem[]
  trigger: JSX.Element
}
export interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
}
export interface SkeletonProps {
  width?: string
  height?: string
  rounded?: boolean
}
export interface ErrorBoundaryProps {
  fallback: JSX.Element
  children: JSX.Element
}
export interface FileUploadProps {
  onUpload: (files: File[]) => void
  accept?: string
  multiple?: boolean
}
export interface ImageViewerProps {
  src: string
  alt?: string
  onClose: () => void
}
export interface MarkdownRendererProps {
  content: string
}
export interface RelativeTimeProps {
  timestamp: string
}
export interface InfiniteScrollProps {
  onLoadMore: () => void
  hasMore: boolean
  children: JSX.Element
}
export interface VirtualListProps<T> {
  items: T[]
  itemHeight: number
  renderItem: (item: T, index: number) => JSX.Element
  overscan?: number
}

// Data types
export interface CommunityInfo {
  id: string
  name: string
  description?: string
  memberCount: number
  iconUrl?: string
  serverUrl?: string
}
export interface ChannelInfo {
  id: string
  name: string
  type: 'text' | 'voice' | 'announcement'
  topic?: string
  communityId: string
}
export interface MessageData {
  id: string
  content: string
  authorDid: string
  authorName: string
  timestamp: string
  edited?: boolean
  replyTo?: string
  reactions?: Array<{ emoji: string; count: number; userReacted: boolean }>
  attachments?: AttachmentData[]
}
export interface AttachmentData {
  id: string
  filename: string
  url: string
  mimeType: string
  size: number
}
export interface MemberData {
  did: string
  displayName: string
  roles: string[]
  status: 'online' | 'offline' | 'idle' | 'dnd'
  avatarUrl?: string
}
export interface VoiceParticipantInfo {
  did: string
  displayName: string
  muted: boolean
  deafened: boolean
  speaking: boolean
}
export interface DMConversationInfo {
  id: string
  participantDid: string
  participantName: string
  lastMessage?: string
  lastMessageAt?: string
  unreadCount: number
}
export interface RoleData {
  id: string
  name: string
  color?: string
  permissions: string[]
}
export interface RoleInfo {
  id: string
  name: string
  color?: string
  permissions: string[]
  position: number
}
export interface AuditEntry {
  id: string
  action: string
  actorDid: string
  actorName: string
  timestamp: string
  details?: string
}
export interface BotInfo {
  id: string
  name: string
  description: string
  installed: boolean
}
export interface ProposalInfo {
  id: string
  title: string
  description: string
  status: 'active' | 'passed' | 'rejected' | 'expired'
  votes: { yes: number; no: number; abstain: number }
}
export interface ProposalDraft {
  title: string
  description: string
  options: string[]
}
export interface CredentialInfo {
  id: string
  type: string
  issuer: string
  issuedAt: string
  status: 'valid' | 'expired' | 'revoked'
}
export interface SearchResultItem {
  id: string
  type: 'message' | 'channel' | 'member'
  title: string
  preview: string
  channelId?: string
}
export interface DeviceInfo {
  id: string
  name: string
  type: string
  lastSeen: string
  current: boolean
}
export interface FriendInfo {
  did: string
  displayName: string
  status: 'online' | 'offline'
}
export interface FriendRequest {
  id: string
  fromDid: string
  fromName: string
  receivedAt: string
}
export interface MigrationSummary {
  channels: number
  messages: number
  members: number
  roles: number
}
export interface MenuItem {
  label: string
  action: () => void
  icon?: string
  disabled?: boolean
}
