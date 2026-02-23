import { randomBytes } from '@harmony/crypto'
import type { Quad, QuadStore } from '@harmony/quads'
import { HarmonyType, HarmonyPredicate, RDFPredicate, XSDDatatype } from '@harmony/vocab'
import type { ZCAPBotAuth } from './zcap-bot-auth.js'
import type { SandboxEnforcer } from './sandbox.js'

export type BotPermission =
  | 'SendMessage'
  | 'ReadMessage'
  | 'ManageChannels'
  | 'ManageMembers'
  | 'ManageRoles'
  | 'UseWebhooks'
  | 'ReadPresence'
  | 'JoinVoice'

export type BotEventType =
  | 'message.created'
  | 'message.updated'
  | 'message.deleted'
  | 'message.reaction'
  | 'member.joined'
  | 'member.left'
  | 'channel.created'
  | 'channel.updated'
  | 'channel.deleted'
  | 'community.updated'
  | 'voice.participant.joined'
  | 'voice.participant.left'

export interface BotManifest {
  did: string
  name: string
  description: string
  version: string
  permissions: BotPermission[]
  events: BotEventType[]
  entrypoint: string
}

export interface BotEvent {
  type: BotEventType
  communityId: string
  channelId?: string
  actorDID: string
  timestamp: string
  data: unknown
}

export type BotStatus = 'running' | 'stopped' | 'errored' | 'starting'

export interface ResourceUsage {
  memoryMB: number
  cpuPercent: number
  messagesPerMinute: number
  apiCallsPerMinute: number
}

export interface BotSandbox {
  memoryLimitMB: number
  cpuPercent: number
  maxMessagesPerMinute: number
  maxApiCallsPerMinute: number
  networkAccess: boolean
  allowedHosts?: string[]
}

export interface RegisteredBot {
  id: string
  manifest: BotManifest
  communityId: string
  status: BotStatus
  installedBy: string
  installedAt: string
  capabilities: string[]
  resourceUsage: ResourceUsage
  sandbox: BotSandbox
}

function generateId(): string {
  const bytes = randomBytes(16)
  return 'bot-' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export class BotHost {
  private bots = new Map<string, RegisteredBot>()
  private store: QuadStore
  private auth: ZCAPBotAuth
  private sandboxEnforcer: SandboxEnforcer

  constructor(store: QuadStore, auth: ZCAPBotAuth, sandboxEnforcer: SandboxEnforcer) {
    this.store = store
    this.auth = auth
    this.sandboxEnforcer = sandboxEnforcer
  }

  async registerBot(
    manifest: BotManifest,
    communityId: string,
    installerDID: string,
    capabilityIds: string[]
  ): Promise<string> {
    // Verify installer has admin-level capability
    if (!this.auth.hasAdminCapability(installerDID, communityId)) {
      throw new Error('Unauthorized: installer lacks admin ZCAP')
    }

    // Check that requested permissions don't exceed delegation
    for (const perm of manifest.permissions) {
      if (!this.auth.hasPermission(installerDID, communityId, perm)) {
        throw new Error(`Permission ${perm} exceeds delegation`)
      }
    }

    const id = generateId()
    const defaultSandbox: BotSandbox = {
      memoryLimitMB: 128,
      cpuPercent: 10,
      maxMessagesPerMinute: 60,
      maxApiCallsPerMinute: 120,
      networkAccess: false
    }

    const bot: RegisteredBot = {
      id,
      manifest,
      communityId,
      status: 'stopped',
      installedBy: installerDID,
      installedAt: new Date().toISOString(),
      capabilities: capabilityIds,
      resourceUsage: { memoryMB: 0, cpuPercent: 0, messagesPerMinute: 0, apiCallsPerMinute: 0 },
      sandbox: defaultSandbox
    }

    this.bots.set(id, bot)

    // Store as RDF
    const graph = `community:${communityId}`
    const subject = `harmony:${id}`
    const quads: Quad[] = [
      { subject, predicate: RDFPredicate.type, object: HarmonyType.Bot, graph },
      { subject, predicate: HarmonyPredicate.botDID, object: manifest.did, graph },
      {
        subject,
        predicate: HarmonyPredicate.name,
        object: { value: manifest.name, datatype: XSDDatatype.string },
        graph
      },
      { subject, predicate: HarmonyPredicate.installedBy, object: installerDID, graph },
      {
        subject,
        predicate: HarmonyPredicate.botStatus,
        object: { value: 'stopped', datatype: XSDDatatype.string },
        graph
      }
    ]
    await this.store.addAll(quads)

    return id
  }

  async unregisterBot(botId: string): Promise<void> {
    const bot = this.bots.get(botId)
    if (!bot) throw new Error('Bot not found')

    if (bot.status === 'running') {
      await this.stopBot(botId)
    }

    // Clean up RDF
    const graph = `community:${bot.communityId}`
    const subject = `harmony:${botId}`
    const quads = await this.store.match({ subject, graph })
    for (const q of quads) {
      await this.store.remove(q)
    }

    this.bots.delete(botId)
  }

  async listBots(communityId: string): Promise<RegisteredBot[]> {
    return Array.from(this.bots.values()).filter((b) => b.communityId === communityId)
  }

  async getBot(botId: string): Promise<RegisteredBot | null> {
    return this.bots.get(botId) ?? null
  }

  async startBot(botId: string): Promise<void> {
    const bot = this.bots.get(botId)
    if (!bot) throw new Error('Bot not found')
    bot.status = 'running'
  }

  async stopBot(botId: string): Promise<void> {
    const bot = this.bots.get(botId)
    if (!bot) throw new Error('Bot not found')
    bot.status = 'stopped'
  }

  async setBotErrored(botId: string): Promise<void> {
    const bot = this.bots.get(botId)
    if (!bot) throw new Error('Bot not found')
    bot.status = 'errored'
  }

  getBotStatus(botId: string): BotStatus {
    const bot = this.bots.get(botId)
    if (!bot) throw new Error('Bot not found')
    return bot.status
  }

  updateResourceUsage(botId: string, usage: Partial<ResourceUsage>): void {
    const bot = this.bots.get(botId)
    if (bot) {
      Object.assign(bot.resourceUsage, usage)
    }
  }
}
