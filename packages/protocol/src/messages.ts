// ── Message Types ──

export type MessageType =
  // Client → Server
  | 'channel.send'
  | 'channel.edit'
  | 'channel.delete'
  | 'channel.typing'
  | 'channel.reaction.add'
  | 'channel.reaction.remove'
  | 'dm.send'
  | 'dm.edit'
  | 'dm.delete'
  | 'dm.typing'
  | 'thread.create'
  | 'thread.send'
  | 'community.create'
  | 'community.update'
  | 'community.join'
  | 'community.leave'
  | 'channel.create'
  | 'channel.update'
  | 'channel.delete.admin'
  | 'role.create'
  | 'role.update'
  | 'role.delete'
  | 'member.update'
  | 'member.kick'
  | 'member.ban'
  | 'presence.update'
  | 'sync.request'
  | 'sync.state'
  // Server → Client
  | 'channel.message'
  | 'channel.message.updated'
  | 'channel.message.deleted'
  | 'channel.typing.indicator'
  | 'channel.reaction.added'
  | 'channel.reaction.removed'
  | 'dm.message'
  | 'dm.message.updated'
  | 'dm.message.deleted'
  | 'dm.typing.indicator'
  | 'thread.message'
  | 'thread.created'
  | 'community.updated'
  | 'community.member.joined'
  | 'community.member.left'
  | 'community.member.updated'
  | 'community.member.kicked'
  | 'community.member.banned'
  | 'channel.created'
  | 'channel.updated'
  | 'channel.deleted'
  | 'role.created'
  | 'role.updated'
  | 'role.deleted'
  | 'presence.changed'
  | 'sync.response'
  | 'error'
  // Federation
  | 'federation.relay'
  | 'federation.sync'
  | 'federation.presence'

export const CLIENT_TO_SERVER_TYPES: MessageType[] = [
  'channel.send',
  'channel.edit',
  'channel.delete',
  'channel.typing',
  'channel.reaction.add',
  'channel.reaction.remove',
  'dm.send',
  'dm.edit',
  'dm.delete',
  'dm.typing',
  'thread.create',
  'thread.send',
  'community.create',
  'community.update',
  'community.join',
  'community.leave',
  'channel.create',
  'channel.update',
  'channel.delete.admin',
  'role.create',
  'role.update',
  'role.delete',
  'member.update',
  'member.kick',
  'member.ban',
  'presence.update',
  'sync.request',
  'sync.state'
]

export const SERVER_TO_CLIENT_TYPES: MessageType[] = [
  'channel.message',
  'channel.message.updated',
  'channel.message.deleted',
  'channel.typing.indicator',
  'channel.reaction.added',
  'channel.reaction.removed',
  'dm.message',
  'dm.message.updated',
  'dm.message.deleted',
  'dm.typing.indicator',
  'thread.message',
  'thread.created',
  'community.updated',
  'community.member.joined',
  'community.member.left',
  'community.member.updated',
  'community.member.kicked',
  'community.member.banned',
  'channel.created',
  'channel.updated',
  'channel.deleted',
  'role.created',
  'role.updated',
  'role.deleted',
  'presence.changed',
  'sync.response',
  'error'
]

export const FEDERATION_TYPES: MessageType[] = ['federation.relay', 'federation.sync', 'federation.presence']

export const ALL_MESSAGE_TYPES: MessageType[] = [
  ...CLIENT_TO_SERVER_TYPES,
  ...SERVER_TO_CLIENT_TYPES,
  ...FEDERATION_TYPES
]
