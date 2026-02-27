import type { MessageType } from './messages.js'
export type { MessageType } from './messages.js'
export { CLIENT_TO_SERVER_TYPES, SERVER_TO_CLIENT_TYPES, FEDERATION_TYPES, ALL_MESSAGE_TYPES } from './messages.js'
export type { ErrorCode, ErrorPayload } from './errors.js'
export type { ClientEvent, FederationEvent } from './events.js'
export { uint8ArrayToBase64, base64ToUint8Array, serialise, deserialise, isValidISO8601 } from './serialisation.js'

// ── Proof ──

export interface Proof {
  type: string
  created: string
  verificationMethod: string
  proofPurpose: string
  proofValue: string
}

// ── ZCAP Proof ──

export interface ZCAPInvocationProof {
  capabilityId: string
  capabilityChain: string[]
  invocation: {
    action: string
    target: string
    proof: Proof
  }
}

// ── Lamport Clock ──

export interface LamportClock {
  counter: number
  authorDID: string
}

// ── Encrypted Content ──

export interface EncryptedContent {
  ciphertext: Uint8Array
  epoch: number
  senderIndex: number
}

export interface DecryptedContent {
  text: string
  attachments?: AttachmentRef[]
  embeds?: Embed[]
  mentions?: string[]
}

export interface AttachmentRef {
  id: string
  filename: string
  contentType: string
  size: number
  url: string
  encrypted: boolean
}

export interface Embed {
  type: 'link' | 'image' | 'video' | 'rich'
  url?: string
  title?: string
  description?: string
  thumbnail?: string
}

// ── Protocol Message Envelope ──

export interface ProtocolMessage {
  id: string
  type: MessageType
  timestamp: string
  sender: string
  payload: unknown
  proof?: ZCAPInvocationProof
}

// ── Channel Messages ──

export interface ChannelSendPayload {
  communityId: string
  channelId: string
  content: EncryptedContent
  nonce: string
  replyTo?: string
  clock: LamportClock
}

export interface ChannelEditPayload {
  communityId: string
  channelId: string
  messageId: string
  content: EncryptedContent
  clock: LamportClock
}

export interface ChannelDeletePayload {
  communityId: string
  channelId: string
  messageId: string
  clock: LamportClock
}

export interface ChannelTypingPayload {
  communityId: string
  channelId: string
}

export interface ReactionPayload {
  communityId: string
  channelId: string
  messageId: string
  emoji: string
}

// ── Direct Messages ──

export interface DMSendPayload {
  recipientDID: string
  content: EncryptedContent
  nonce: string
  replyTo?: string
  clock: LamportClock
}

export interface DMEditPayload {
  recipientDID: string
  messageId: string
  content: EncryptedContent
  clock: LamportClock
}

export interface DMDeletePayload {
  recipientDID: string
  messageId: string
  clock: LamportClock
}

export interface DMTypingPayload {
  recipientDID: string
}

// ── Threads ──

export interface ThreadCreatePayload {
  communityId: string
  channelId: string
  parentMessageId: string
  name: string
  content: EncryptedContent
  clock: LamportClock
}

export interface ThreadSendPayload {
  threadId: string
  content: EncryptedContent
  nonce: string
  replyTo?: string
  clock: LamportClock
}

// ── Community Management ──

export interface CommunityCreatePayload {
  name: string
  description?: string
  icon?: AttachmentRef
  defaultChannels: string[]
}

export interface CommunityUpdatePayload {
  communityId: string
  name?: string
  description?: string
  icon?: AttachmentRef
}

export interface CommunityJoinPayload {
  communityId: string
  membershipVC: unknown // VerifiableCredential
  encryptionPublicKey: Uint8Array
}

export interface CommunityLeavePayload {
  communityId: string
}

// ── Channel Management ──

export interface ChannelCreatePayload {
  communityId: string
  name: string
  type: 'text' | 'voice' | 'announcement'
  categoryId?: string
  topic?: string
}

export interface ChannelUpdatePayload {
  communityId: string
  channelId: string
  name?: string
  topic?: string
  type?: 'text' | 'voice' | 'announcement'
  slowMode?: number
}

export interface ChannelDeleteAdminPayload {
  communityId: string
  channelId: string
}

// ── Roles ──

export interface RoleCreatePayload {
  communityId: string
  name: string
  color?: string
  permissions: string[]
  position: number
}

export interface RoleUpdatePayload {
  communityId: string
  roleId: string
  name?: string
  color?: string
  permissions?: string[]
  position?: number
}

export interface RoleDeletePayload {
  communityId: string
  roleId: string
}

// ── Members ──

export interface MemberUpdatePayload {
  communityId: string
  memberDID: string
  roles?: string[]
  displayName?: string
}

export interface MemberKickPayload {
  communityId: string
  memberDID: string
  reason?: string
}

export interface MemberBanPayload {
  communityId: string
  memberDID: string
  reason?: string
}

// ── Presence ──

export interface PresenceUpdatePayload {
  status: 'online' | 'idle' | 'dnd' | 'offline'
  customStatus?: string
  activeChannelId?: string
}

// ── Sync ──

export interface SyncRequestPayload {
  communityId: string
  channelId: string
  since?: string
  clock?: LamportClock
  limit?: number
}

export interface SyncResponsePayload {
  communityId: string
  channelId: string
  messages: ProtocolMessage[]
  hasMore: boolean
  latestClock: LamportClock
}

// ── Sync State ──

export interface SyncStatePayload {
  communityId: string
  channelId: string
  clock: LamportClock
}

// ── Moderation ──

export interface ModerationConfigUpdatePayload {
  communityId: string
  rules: Array<{
    type: 'rateLimit' | 'accountAge' | 'raidDetection' | 'vcRequirement'
    config: Record<string, unknown>
  }>
}

export interface ModerationConfigGetPayload {
  communityId: string
}

// ── Notifications ──

export interface Notification {
  id: string
  type: 'mention' | 'dm' | 'reply'
  fromDID: string
  communityId?: string
  channelId?: string
  messageId: string
  content: string
  read: boolean
  createdAt: string
}

export interface NotificationListPayload {
  limit?: number
  offset?: number
  unreadOnly?: boolean
}

export interface NotificationListResponsePayload {
  notifications: Notification[]
  total: number
}

export interface NotificationMarkReadPayload {
  notificationIds: string[]
}

export interface NotificationCountResponsePayload {
  unread: number
  byChannel: Record<string, number>
}
