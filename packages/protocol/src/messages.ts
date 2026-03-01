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
  | 'role.assign'
  | 'role.remove'
  | 'channel.pin'
  | 'channel.unpin'
  | 'channel.pins.list'
  | 'member.update'
  | 'member.kick'
  | 'member.ban'
  | 'community.ban'
  | 'community.unban'
  | 'presence.update'
  | 'sync.request'
  | 'sync.state'
  | 'community.info'
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
  | 'community.ban.applied'
  | 'community.unban.applied'
  | 'community.member.reconciled'
  | 'community.auto-joined'
  | 'channel.created'
  | 'channel.updated'
  | 'channel.deleted'
  | 'role.created'
  | 'role.updated'
  | 'role.deleted'
  | 'channel.message.pinned'
  | 'channel.message.unpinned'
  | 'channel.pins.response'
  | 'presence.changed'
  | 'sync.response'
  | 'community.info.response'
  | 'error'
  // Voice
  | 'voice.join'
  | 'voice.leave'
  | 'voice.state'
  | 'voice.participant.joined'
  | 'voice.participant.left'
  | 'voice.speaking'
  | 'voice.offer'
  | 'voice.answer'
  | 'voice.ice'
  | 'voice.mute'
  | 'voice.unmute'
  | 'voice.video'
  | 'voice.screen'
  | 'voice.token'
  | 'voice.token.response'
  | 'voice.transport.connect'
  | 'voice.transport.connect.response'
  | 'voice.transport.connect-recv'
  | 'voice.transport.connect-recv.response'
  | 'voice.transport.connected'
  | 'voice.transport.create-recv'
  | 'voice.transport.create-recv.response'
  | 'voice.produce'
  | 'voice.produce.response'
  | 'voice.consume'
  | 'voice.consume.response'
  | 'voice.consumer.resume'
  | 'voice.consumer.resume.response'
  | 'voice.get-producers'
  | 'voice.get-producers.response'
  | 'voice.new-producer'
  | 'voice.producer-closed'
  // Voice — CF SFU signaling
  | 'voice.session.create'
  | 'voice.session.created'
  | 'voice.tracks.push'
  | 'voice.tracks.pushed'
  | 'voice.tracks.pull'
  | 'voice.tracks.pulled'
  | 'voice.renegotiate'
  | 'voice.renegotiated'
  | 'voice.track.published'
  | 'voice.track.removed'
  // Files
  | 'media.upload.request'
  | 'media.upload.complete'
  | 'media.delete'
  // Search
  | 'search.metadata'
  | 'search.metadata.result'
  // Bots
  | 'bot.install'
  | 'bot.uninstall'
  | 'bot.event'
  | 'bot.action'
  // Governance
  | 'governance.propose'
  | 'governance.sign'
  | 'governance.execute'
  | 'governance.contest'
  | 'governance.cancel'
  // Delegation
  | 'delegation.create'
  | 'delegation.revoke'
  // Credentials
  | 'credential.issue'
  | 'credential.present'
  | 'credential.verify'
  // E2EE / MLS
  | 'mls.keypackage.upload'
  | 'mls.keypackage.fetch'
  | 'mls.keypackage.response'
  | 'mls.welcome'
  | 'mls.commit'
  | 'mls.group.setup'
  | 'mls.member.joined'
  // Notifications
  | 'notification.list'
  | 'notification.mark-read'
  | 'notification.count'
  | 'notification.list.response'
  | 'notification.count.response'
  | 'notification.new'
  // Search & History
  | 'search.query'
  | 'search.results'
  | 'channel.history'
  | 'channel.history.response'
  // Moderation
  | 'moderation.config.update'
  | 'moderation.config.get'
  | 'moderation.config.response'
  | 'moderation.raid-detected'
  // Community management
  | 'community.kick'
  | 'community.list'
  | 'community.list.response'
  // Media
  | 'media.upload.request'
  | 'media.upload.complete'
  | 'media.delete'
  // DM
  | 'dm.edited'
  | 'dm.deleted'
  // Federation
  | 'federation.relay'
  | 'federation.sync'
  | 'federation.presence'
  // DM key exchange
  | 'dm.keyexchange'
  // MLS membership
  | 'mls.member.joined'
  // Voice transport
  | 'voice.transport.connected'
  | 'voice.produced'
  | 'voice.consumed'
  | 'voice.new-producer'
  // Voice client→server
  | 'voice.transport.connect'
  | 'voice.produce'
  | 'voice.consume'
  | 'voice.consumer.resume'
  // Server→client membership
  | 'member.kicked'

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
  'role.assign',
  'role.remove',
  'channel.pin',
  'channel.unpin',
  'channel.pins.list',
  'member.update',
  'member.kick',
  'member.ban',
  'community.ban',
  'community.unban',
  'presence.update',
  'sync.request',
  'sync.state',
  'community.info',
  // Phase 3
  'voice.join',
  'voice.leave',
  'voice.state',
  'voice.mute',
  'voice.unmute',
  'voice.video',
  'voice.screen',
  'voice.token',
  'media.upload.request',
  'media.upload.complete',
  'media.delete',
  'search.metadata',
  'bot.install',
  'bot.uninstall',
  'bot.action',
  'governance.propose',
  'governance.sign',
  'governance.execute',
  'governance.contest',
  'governance.cancel',
  'delegation.create',
  'delegation.revoke',
  'credential.issue',
  'credential.present',
  'credential.verify',
  // E2EE / MLS
  'mls.keypackage.upload',
  'mls.keypackage.fetch',
  'mls.commit',
  'mls.group.setup',
  // Notifications
  'notification.list',
  'notification.mark-read',
  'notification.count',
  // Moderation
  'moderation.config.update',
  'moderation.config.get',
  // Voice — CF SFU
  'voice.session.create',
  'voice.tracks.push',
  'voice.tracks.pull',
  'voice.renegotiate'
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
  'community.ban.applied',
  'community.unban.applied',
  'community.member.reconciled',
  'community.auto-joined',
  'channel.created',
  'channel.updated',
  'channel.deleted',
  'role.created',
  'role.updated',
  'role.deleted',
  'channel.message.pinned',
  'channel.message.unpinned',
  'channel.pins.response',
  'presence.changed',
  'sync.response',
  'community.info.response',
  'error',
  // Phase 3
  'voice.participant.joined',
  'voice.participant.left',
  'voice.speaking',
  'voice.offer',
  'voice.answer',
  'voice.ice',
  'voice.token.response',
  'search.metadata.result',
  'bot.event',
  // E2EE / MLS
  'mls.keypackage.response',
  'mls.welcome',
  // Notifications
  'notification.list.response',
  'notification.count.response',
  'notification.new',
  // Moderation
  'moderation.config.response',
  'moderation.raid-detected',
  // Voice — CF SFU
  'voice.session.created',
  'voice.tracks.pushed',
  'voice.tracks.pulled',
  'voice.renegotiated',
  'voice.track.published',
  'voice.track.removed'
]

export const FEDERATION_TYPES: MessageType[] = ['federation.relay', 'federation.sync', 'federation.presence']

export const ALL_MESSAGE_TYPES: MessageType[] = [
  ...CLIENT_TO_SERVER_TYPES,
  ...SERVER_TO_CLIENT_TYPES,
  ...FEDERATION_TYPES
]
