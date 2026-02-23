import type { BotPermission, BotEventType, BotEvent } from './bot-host.js'
import type { ZCAPBotAuth } from './zcap-bot-auth.js'
import type { SandboxEnforcer } from './sandbox.js'

export interface ChannelInfo {
  id: string
  name: string
  communityId: string
  type: string
}

export interface MemberInfo {
  did: string
  displayName?: string
  roles: string[]
}

export interface BotContext {
  readonly botDID: string
  readonly communityId: string
  readonly capabilities: string[]

  sendMessage(channelId: string, content: string): Promise<string>
  editMessage(channelId: string, messageId: string, content: string): Promise<void>
  deleteMessage(channelId: string, messageId: string): Promise<void>
  addReaction(channelId: string, messageId: string, emoji: string): Promise<void>
  getChannel(channelId: string): Promise<ChannelInfo>
  getMembers(communityId: string): Promise<MemberInfo[]>
  getMember(communityId: string, did: string): Promise<MemberInfo | null>

  on(event: BotEventType, handler: (event: BotEvent) => void | Promise<void>): void
  off(event: BotEventType, handler: (event: BotEvent) => void | Promise<void>): void
}

export function createBotContext(
  botDID: string,
  communityId: string,
  capabilities: string[],
  auth: ZCAPBotAuth,
  sandbox: SandboxEnforcer,
  storage: {
    messages: Map<string, { channelId: string; content: string; authorDID: string }>
    channels: Map<string, ChannelInfo>
    members: Map<string, MemberInfo[]>
  }
): BotContext {
  const handlers = new Map<BotEventType, Set<(event: BotEvent) => void | Promise<void>>>()
  let msgCounter = 0

  return {
    botDID,
    communityId,
    capabilities,

    async sendMessage(channelId: string, content: string): Promise<string> {
      if (!auth.hasBotPermission(botDID, communityId, 'SendMessage')) {
        throw new Error('Unauthorized: bot lacks SendMessage capability')
      }
      sandbox.trackApiCall(botDID)
      sandbox.trackMessage(botDID)

      const msgId = `msg-bot-${++msgCounter}`
      storage.messages.set(msgId, { channelId, content, authorDID: botDID })
      return msgId
    },

    async editMessage(channelId: string, messageId: string, content: string): Promise<void> {
      if (!auth.hasBotPermission(botDID, communityId, 'SendMessage')) {
        throw new Error('Unauthorized: bot lacks SendMessage capability')
      }
      sandbox.trackApiCall(botDID)
      const msg = storage.messages.get(messageId)
      if (msg && msg.authorDID === botDID) {
        msg.content = content
      }
    },

    async deleteMessage(channelId: string, messageId: string): Promise<void> {
      if (!auth.hasBotPermission(botDID, communityId, 'SendMessage')) {
        throw new Error('Unauthorized: bot lacks SendMessage capability')
      }
      sandbox.trackApiCall(botDID)
      const msg = storage.messages.get(messageId)
      if (msg && msg.authorDID === botDID) {
        storage.messages.delete(messageId)
      }
    },

    async addReaction(channelId: string, messageId: string, emoji: string): Promise<void> {
      if (!auth.hasBotPermission(botDID, communityId, 'SendMessage')) {
        throw new Error('Unauthorized: bot lacks SendMessage capability')
      }
      sandbox.trackApiCall(botDID)
    },

    async getChannel(channelId: string): Promise<ChannelInfo> {
      if (!auth.hasBotPermission(botDID, communityId, 'ReadMessage')) {
        throw new Error('Unauthorized: bot lacks ReadMessage capability')
      }
      sandbox.trackApiCall(botDID)
      const ch = storage.channels.get(channelId)
      if (!ch) throw new Error('Channel not found')
      return ch
    },

    async getMembers(communityId: string): Promise<MemberInfo[]> {
      if (!auth.hasBotPermission(botDID, communityId, 'ReadPresence')) {
        throw new Error('Unauthorized: bot lacks ReadPresence capability')
      }
      sandbox.trackApiCall(botDID)
      return storage.members.get(communityId) ?? []
    },

    async getMember(communityId: string, did: string): Promise<MemberInfo | null> {
      sandbox.trackApiCall(botDID)
      const members = storage.members.get(communityId) ?? []
      return members.find((m) => m.did === did) ?? null
    },

    on(event: BotEventType, handler: (event: BotEvent) => void | Promise<void>): void {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event)!.add(handler)
    },

    off(event: BotEventType, handler: (event: BotEvent) => void | Promise<void>): void {
      handlers.get(event)?.delete(handler)
    },

    // Internal: dispatch events
    ...({
      _dispatch: async (event: BotEvent) => {
        const eventHandlers = handlers.get(event.type)
        if (eventHandlers) {
          for (const h of eventHandlers) {
            await h(event)
          }
        }
      },
      _handlers: handlers
    } as any)
  }
}
