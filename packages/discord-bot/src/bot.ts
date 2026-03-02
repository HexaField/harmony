// DiscordJS adapter implementing DiscordAPI from @harmony/migration-bot
import type { DiscordAPI } from '@harmony/migration-bot'
import type { DiscordChannel, DiscordRole, DiscordMember, DiscordMessage, DiscordServer } from '@harmony/migration'
import { t } from './strings.js'

// Slash command definitions
export interface SlashCommand {
  name: string
  description: string
  subcommands?: SlashCommand[]
  options?: CommandOption[]
  requiredPermissions?: string[]
}

export interface CommandOption {
  name: string
  description: string
  type: 'string' | 'boolean' | 'integer'
  required?: boolean
}

export const HARMONY_COMMANDS: SlashCommand[] = [
  {
    name: 'harmony',
    description: 'Harmony community platform commands',
    subcommands: [
      { name: 'setup', description: 'Configure Harmony for this server', requiredPermissions: ['Administrator'] },
      { name: 'export', description: 'Export this server to Harmony (legacy)', requiredPermissions: ['Administrator'] },
      {
        name: 'migrate',
        description: 'Migrate this server to Harmony (hash-based)',
        requiredPermissions: ['Administrator']
      },
      { name: 'link', description: 'Link your Discord account to a DID' },
      { name: 'identity', description: 'Show your linked Harmony identity' },
      { name: 'info', description: 'Show Harmony info and invite link' }
    ]
  }
]

// Export progress tracking
export interface ExportState {
  guildId: string
  phase: 'channels' | 'roles' | 'members' | 'messages' | 'encrypting' | 'uploading' | 'complete'
  current: number
  total: number
  channelName: string
  startedAt: number
  channelsExported: number
  messagesExported: number
}

// Migrate progress tracking (hash-based)
export interface MigrateState {
  guildId: string
  phase: 'structure' | 'hashing' | 'uploading' | 'announcing' | 'complete'
  current: number
  total: number
  channelName: string
  startedAt: number
  hashCount: number
}

// Bot configuration
export interface BotConfig {
  token: string
  portalUrl: string
  serverUrl?: string
}

// Guild configuration stored per server
export interface GuildConfig {
  guildId: string
  configuredBy: string
  configuredAt: string
  inviteLink?: string
  harmonyEndpoint?: string
}

// Mock DiscordJS client for our adapter
export interface DiscordJSGuild {
  id: string
  name: string
  ownerId: string
  channels: DiscordJSChannel[]
  roles: DiscordJSRole[]
  members: DiscordJSMember[]
  messages: Map<string, DiscordJSMessage[]>
}

export interface DiscordJSChannel {
  id: string
  name: string
  type: 'text' | 'voice' | 'category' | 'thread'
  categoryId?: string
}

export interface DiscordJSRole {
  id: string
  name: string
  permissions: string[]
}

export interface DiscordJSMember {
  userId: string
  username: string
  roles: string[]
  joinedAt: string
}

export interface DiscordJSMessage {
  id: string
  channelId: string
  author: { id: string; username: string }
  content: string
  timestamp: string
  replyTo?: string
  reactions?: Array<{ emoji: string; users: string[] }>
  attachments?: Array<{ url: string; filename: string }>
}

// DiscordJS adapter that implements the DiscordAPI interface
export class DiscordJSAdapter implements DiscordAPI {
  private guild: DiscordJSGuild
  private rateLimitDelay: number

  constructor(guild: DiscordJSGuild, rateLimitDelay = 0) {
    this.guild = guild
    this.rateLimitDelay = rateLimitDelay
  }

  private async respectRateLimit(): Promise<void> {
    if (this.rateLimitDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.rateLimitDelay))
    }
  }

  async getGuild(guildId: string): Promise<DiscordServer> {
    await this.respectRateLimit()
    if (this.guild.id !== guildId) throw new Error('Guild not found')
    return { id: this.guild.id, name: this.guild.name, ownerId: this.guild.ownerId }
  }

  async getGuildChannels(guildId: string): Promise<DiscordChannel[]> {
    await this.respectRateLimit()
    if (this.guild.id !== guildId) return []
    return this.guild.channels.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      categoryId: c.categoryId
    }))
  }

  async getGuildRoles(guildId: string): Promise<DiscordRole[]> {
    await this.respectRateLimit()
    if (this.guild.id !== guildId) return []
    return this.guild.roles.map((r) => ({
      id: r.id,
      name: r.name,
      permissions: r.permissions
    }))
  }

  async getGuildMembers(guildId: string): Promise<DiscordMember[]> {
    await this.respectRateLimit()
    if (this.guild.id !== guildId) return []
    return this.guild.members.map((m) => ({
      userId: m.userId,
      username: m.username,
      roles: m.roles,
      joinedAt: m.joinedAt
    }))
  }

  async getChannelMessages(
    channelId: string,
    options?: { before?: string; limit?: number }
  ): Promise<DiscordMessage[]> {
    await this.respectRateLimit()
    const messages = this.guild.messages.get(channelId) ?? []
    const limit = options?.limit ?? 100
    let filtered = messages

    if (options?.before) {
      const idx = messages.findIndex((m) => m.id === options.before)
      if (idx > 0) {
        filtered = messages.slice(0, idx)
      }
    }

    return filtered.slice(-limit).map((m) => ({
      id: m.id,
      channelId: m.channelId,
      author: m.author,
      content: m.content,
      timestamp: m.timestamp,
      replyTo: m.replyTo,
      reactions: m.reactions,
      attachments: m.attachments
    }))
  }
}

// Bot instance manager
export class HarmonyDiscordBot {
  private config: BotConfig
  private guildConfigs: Map<string, GuildConfig> = new Map()
  private activeExports: Map<string, ExportState> = new Map()
  private activeMigrations: Map<string, MigrateState> = new Map()
  private linkedIdentities: Map<string, string> = new Map() // userId → DID
  private running = false
  private reconnectCount = 0

  constructor(config: BotConfig) {
    this.config = config
  }

  async start(): Promise<void> {
    if (this.running) throw new Error('Bot is already running')
    this.running = true
    this.reconnectCount = 0
  }

  async stop(): Promise<void> {
    if (!this.running) throw new Error('Bot is not running')
    this.running = false
  }

  isRunning(): boolean {
    return this.running
  }

  async reconnect(): Promise<void> {
    this.reconnectCount++
    // Simulate reconnection
    if (this.running) {
      this.running = true
    }
  }

  getReconnectCount(): number {
    return this.reconnectCount
  }

  // Command handlers
  async handleSetup(guildId: string, userId: string, isAdmin: boolean): Promise<{ success: boolean; message: string }> {
    if (!isAdmin) {
      return { success: false, message: t('SETUP_REQUIRES_ADMIN') }
    }

    this.guildConfigs.set(guildId, {
      guildId,
      configuredBy: userId,
      configuredAt: new Date().toISOString()
    })

    return { success: true, message: t('SETUP_CONFIGURED') }
  }

  async handleExport(
    guildId: string,
    adapter: DiscordAPI,
    _adminKeyPair: { publicKey: Uint8Array; secretKey: Uint8Array; type: 'Ed25519' },
    onProgress?: (state: ExportState) => void
  ): Promise<{ success: boolean; message: string; bundle?: unknown }> {
    if (this.activeExports.has(guildId)) {
      return { success: false, message: t('EXPORT_IN_PROGRESS') }
    }

    const state: ExportState = {
      guildId,
      phase: 'channels',
      current: 0,
      total: 0,
      channelName: '',
      startedAt: Date.now(),
      channelsExported: 0,
      messagesExported: 0
    }

    this.activeExports.set(guildId, state)

    try {
      // Get guild info
      const guild = await adapter.getGuild(guildId)

      // Export channels
      state.phase = 'channels'
      const channels = await adapter.getGuildChannels(guildId)
      state.total = channels.length
      onProgress?.(state)

      // Export roles
      state.phase = 'roles'
      const roles = await adapter.getGuildRoles(guildId)
      onProgress?.(state)

      // Export members
      state.phase = 'members'
      const members = await adapter.getGuildMembers(guildId)
      onProgress?.(state)

      // Export messages per channel
      state.phase = 'messages'
      const allMessages = new Map<string, DiscordMessage[]>()
      let totalMessages = 0

      for (const channel of channels.filter((c) => c.type === 'text')) {
        state.channelName = channel.name
        state.current++
        onProgress?.(state)

        const messages = await adapter.getChannelMessages(channel.id)
        allMessages.set(channel.id, messages)
        totalMessages += messages.length
        state.messagesExported = totalMessages
      }

      state.channelsExported = channels.filter((c) => c.type === 'text').length

      // Encrypt
      state.phase = 'encrypting'
      onProgress?.(state)

      const bundle = {
        guild,
        channels,
        roles,
        members,
        messages: Object.fromEntries(allMessages),
        exportDate: new Date().toISOString()
      }

      state.phase = 'complete'
      onProgress?.(state)

      return {
        success: true,
        message: t('EXPORT_COMPLETE', { channels: state.channelsExported, messages: totalMessages }),
        bundle
      }
    } finally {
      this.activeExports.delete(guildId)
    }
  }

  async handleMigrate(
    guildId: string,
    adapter: DiscordAPI,
    _params: {
      serverUrl: string
      adminDID: string
      authHeader: string
    },
    onProgress?: (state: MigrateState) => void
  ): Promise<{ success: boolean; message: string; hashCount?: number }> {
    if (this.activeMigrations.has(guildId)) {
      return { success: false, message: t('MIGRATE_IN_PROGRESS') }
    }

    const state: MigrateState = {
      guildId,
      phase: 'structure',
      current: 0,
      total: 0,
      channelName: '',
      startedAt: Date.now(),
      hashCount: 0
    }

    this.activeMigrations.set(guildId, state)

    try {
      // Fetch server structure
      await adapter.getGuild(guildId)
      state.phase = 'structure'
      onProgress?.(state)

      const channels = await adapter.getGuildChannels(guildId)
      await adapter.getGuildRoles(guildId)
      await adapter.getGuildMembers(guildId)

      // Build hash index from messages (without storing content)
      state.phase = 'hashing'
      const textChannels = channels.filter((c) => c.type === 'text')
      state.total = textChannels.length

      const hashIndex = new Map<string, { channelId: string; messageId: string }>()

      for (let i = 0; i < textChannels.length; i++) {
        const channel = textChannels[i]
        state.current = i
        state.channelName = channel.name
        onProgress?.(state)

        const messages = await adapter.getChannelMessages(channel.id)
        // Import hash function dynamically to keep this file light
        const { computeMessageHash } = await import('@harmony/migration')
        for (const msg of messages) {
          const hash = await computeMessageHash({
            serverId: guildId,
            channelId: channel.id,
            messageId: msg.id,
            authorId: msg.author.id,
            timestamp: msg.timestamp
          })
          hashIndex.set(hash, { channelId: channel.id, messageId: msg.id })
        }
      }

      state.hashCount = hashIndex.size
      state.phase = 'complete'
      onProgress?.(state)

      return {
        success: true,
        message: t('MIGRATE_COMPLETE', { channels: textChannels.length, hashCount: hashIndex.size }),
        hashCount: hashIndex.size
      }
    } finally {
      this.activeMigrations.delete(guildId)
    }
  }

  getMigrateStatus(guildId: string): MigrateState | null {
    return this.activeMigrations.get(guildId) ?? null
  }

  getExportStatus(guildId: string): ExportState | null {
    return this.activeExports.get(guildId) ?? null
  }

  async handleLink(userId: string, did?: string): Promise<{ success: boolean; message: string }> {
    if (this.linkedIdentities.has(userId)) {
      const existingDid = this.linkedIdentities.get(userId)!
      return { success: true, message: t('LINK_ALREADY', { did: existingDid }) }
    }

    if (did) {
      this.linkedIdentities.set(userId, did)
      return { success: true, message: t('IDENTITY_SHOW', { did }) }
    }

    const linkUrl = `${this.config.portalUrl}/api/oauth/discord?user=${userId}`
    return { success: true, message: t('LINK_DM', { url: linkUrl }) }
  }

  async handleIdentity(userId: string): Promise<{ success: boolean; message: string }> {
    const did = this.linkedIdentities.get(userId)
    if (!did) {
      return { success: true, message: t('IDENTITY_NOT_LINKED') }
    }
    return { success: true, message: t('IDENTITY_SHOW', { did }) }
  }

  async handleInfo(): Promise<{ success: boolean; message: string }> {
    return {
      success: true,
      message: t('INFO_DESCRIPTION')
    }
  }

  async dmIdentityTokens(members: DiscordJSMember[]): Promise<number> {
    let sent = 0
    for (const _member of members) {
      // In production, would send DM via Discord API
      sent++
    }
    return sent
  }

  getRegisteredCommands(): SlashCommand[] {
    return HARMONY_COMMANDS
  }
}
