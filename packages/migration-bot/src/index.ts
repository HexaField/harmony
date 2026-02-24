export { DiscordRESTAPI } from './discord-api.js'
import type { KeyPair, CryptoProvider } from '@harmony/crypto'
import {
  MigrationService,
  type DiscordServerExport,
  type DiscordServer,
  type DiscordChannel,
  type DiscordRole,
  type DiscordMember,
  type DiscordMessage,
  type EncryptedExportBundle
} from '@harmony/migration'

export interface ExportProgress {
  phase: 'channels' | 'roles' | 'members' | 'messages' | 'encrypting'
  current: number
  total: number
  channelName?: string
}

export interface LinkToken {
  token: string
  discordUserId: string
  expiresAt: number
}

export interface DiscordAPI {
  getGuildChannels(guildId: string): Promise<DiscordChannel[]>
  getGuildRoles(guildId: string): Promise<DiscordRole[]>
  getGuildMembers(guildId: string): Promise<DiscordMember[]>
  getChannelMessages(channelId: string, options?: { before?: string; limit?: number }): Promise<DiscordMessage[]>
  getGuild(guildId: string): Promise<DiscordServer>
}

export class MigrationBot {
  private migration: MigrationService
  private linkTokens: Map<string, LinkToken> = new Map()
  private api: DiscordAPI
  private running = false

  constructor(crypto: CryptoProvider, api: DiscordAPI) {
    this.api = api
    this.migration = new MigrationService(crypto)
  }

  async start(_token: string): Promise<void> {
    if (this.running) throw new Error('Bot is already running')
    this.running = true
  }

  async stop(): Promise<void> {
    if (!this.running) throw new Error('Bot is not running')
    this.running = false
  }

  isRunning(): boolean {
    return this.running
  }

  async pushToPortal(bundle: EncryptedExportBundle, portalUrl: string): Promise<void> {
    const response = await fetch(`${portalUrl}/api/storage/exports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ciphertext: Array.from(bundle.ciphertext),
        nonce: Array.from(bundle.nonce),
        metadata: bundle.metadata
      })
    })
    if (!response.ok) {
      throw new Error(`Portal push failed: ${response.status} ${response.statusText}`)
    }
  }

  // Node.js APIs acceptable here — migration-bot is inherently server-side (Discord API)
  async pushToLocal(bundle: EncryptedExportBundle, outputPath: string): Promise<void> {
    const { writeFile } = await import('fs/promises')
    const data = JSON.stringify(
      {
        ciphertext: Buffer.from(bundle.ciphertext).toString('base64'),
        nonce: Buffer.from(bundle.nonce).toString('base64'),
        metadata: bundle.metadata
      },
      null,
      2
    )
    await writeFile(outputPath, data, 'utf-8')
  }

  async exportServer(params: {
    serverId: string
    adminDID: string
    adminKeyPair: KeyPair
    options?: {
      channels?: string[]
      excludeUsers?: string[]
      afterDate?: string
      beforeDate?: string
    }
    onProgress?: (progress: ExportProgress) => void
  }): Promise<EncryptedExportBundle> {
    const { serverId, adminDID, adminKeyPair, options, onProgress } = params

    // Fetch server info
    const server = await this.api.getGuild(serverId)

    // Fetch channels
    onProgress?.({ phase: 'channels', current: 0, total: 1 })
    const allChannels = await this.api.getGuildChannels(serverId)
    const channels = options?.channels ? allChannels.filter((c) => options.channels!.includes(c.id)) : allChannels
    onProgress?.({ phase: 'channels', current: 1, total: 1 })

    // Fetch roles
    onProgress?.({ phase: 'roles', current: 0, total: 1 })
    const roles = await this.api.getGuildRoles(serverId)
    onProgress?.({ phase: 'roles', current: 1, total: 1 })

    // Fetch members
    onProgress?.({ phase: 'members', current: 0, total: 1 })
    const members = await this.api.getGuildMembers(serverId)
    onProgress?.({ phase: 'members', current: 1, total: 1 })

    // Fetch messages per channel (paginated)
    const messages = new Map<string, DiscordMessage[]>()
    const textChannels = channels.filter((c) => c.type === 'text' || c.type === 'thread')
    let msgCount = 0

    for (let i = 0; i < textChannels.length; i++) {
      const channel = textChannels[i]
      onProgress?.({ phase: 'messages', current: i, total: textChannels.length, channelName: channel.name })

      const channelMessages: DiscordMessage[] = []
      let before: string | undefined
      let hasMore = true

      while (hasMore) {
        const batch = await this.api.getChannelMessages(channel.id, { before, limit: 100 })
        if (batch.length === 0) {
          hasMore = false
          break
        }

        for (const msg of batch) {
          // Filter by date if specified
          if (options?.afterDate && msg.timestamp < options.afterDate) continue
          if (options?.beforeDate && msg.timestamp > options.beforeDate) continue
          channelMessages.push(msg)
        }

        before = batch[batch.length - 1].id
        if (batch.length < 100) hasMore = false
        msgCount += batch.length
      }

      messages.set(channel.id, channelMessages)
    }

    onProgress?.({ phase: 'messages', current: textChannels.length, total: textChannels.length })

    const serverExport: DiscordServerExport = {
      server,
      channels,
      roles,
      members,
      messages,
      pins: new Map()
    }

    // Transform and encrypt
    onProgress?.({ phase: 'encrypting', current: 0, total: 1 })
    const { quads } = this.migration.transformServerExport(serverExport, adminDID, {
      excludeUsers: options?.excludeUsers
    })

    const bundle = await this.migration.encryptExport(quads, adminKeyPair, {
      exportDate: new Date().toISOString(),
      sourceServerId: server.id,
      sourceServerName: server.name,
      adminDID,
      channelCount: channels.length,
      messageCount: msgCount,
      memberCount: members.length
    })

    onProgress?.({ phase: 'encrypting', current: 1, total: 1 })
    return bundle
  }

  generateLinkToken(discordUserId: string): LinkToken {
    const bytes = new Uint8Array(16)
    globalThis.crypto.getRandomValues(bytes)
    const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    const linkToken: LinkToken = {
      token,
      discordUserId,
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
    }
    this.linkTokens.set(token, linkToken)
    return linkToken
  }

  verifyLinkToken(token: string): LinkToken | null {
    const lt = this.linkTokens.get(token)
    if (!lt) return null
    if (Date.now() > lt.expiresAt) {
      this.linkTokens.delete(token)
      return null
    }
    this.linkTokens.delete(token) // one-time use
    return lt
  }
}
