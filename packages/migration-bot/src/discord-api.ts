import type { DiscordAPI } from './index.js'
import type {
  DiscordChannel,
  DiscordRole,
  DiscordMember,
  DiscordMessage,
  DiscordServer,
  DiscordEmbed
} from '@harmony/migration'

const BASE_URL = 'https://discord.com/api/v10'

const CHANNEL_TYPE_MAP: Record<number, DiscordChannel['type']> = {
  0: 'text',
  2: 'voice',
  4: 'category',
  11: 'thread',
  12: 'thread'
}

export class DiscordRESTAPI implements DiscordAPI {
  private token: string

  constructor(botToken: string) {
    this.token = botToken
  }

  private async request<T>(path: string, retries = 3): Promise<T> {
    const url = `${BASE_URL}${path}`
    for (let attempt = 0; attempt < retries; attempt++) {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bot ${this.token}`,
          'Content-Type': 'application/json'
        }
      })

      if (res.status === 429) {
        const retryAfter = parseFloat(res.headers.get('X-RateLimit-Reset-After') ?? '1')
        await new Promise((r) => setTimeout(r, retryAfter * 1000))
        continue
      }

      if (res.status === 401) throw new Error('Invalid bot token')
      if (res.status === 403) throw new Error(`Forbidden: insufficient permissions for ${path}`)
      if (!res.ok) throw new Error(`Discord API error ${res.status}: ${res.statusText} (${path})`)

      // Check rate limit headers for preemptive backoff
      const remaining = res.headers.get('X-RateLimit-Remaining')
      const resetAfter = res.headers.get('X-RateLimit-Reset-After')
      if (remaining === '0' && resetAfter) {
        await new Promise((r) => setTimeout(r, parseFloat(resetAfter) * 1000))
      }

      return (await res.json()) as T
    }
    throw new Error(`Rate limited after ${retries} retries: ${path}`)
  }

  /** Fetch active threads in a guild */
  async getActiveThreads(guildId: string): Promise<DiscordChannel[]> {
    const data = await this.request<{
      threads: Array<{ id: string; name: string; type: number; parent_id?: string | null }>
    }>(`/guilds/${guildId}/threads/active`)

    return data.threads
      .filter((t) => t.type in CHANNEL_TYPE_MAP)
      .map((t) => ({
        id: t.id,
        name: t.name,
        type: CHANNEL_TYPE_MAP[t.type],
        parentChannelId: t.parent_id ?? undefined
      }))
  }

  /** Fetch archived public threads in a channel */
  async getArchivedThreads(channelId: string): Promise<DiscordChannel[]> {
    try {
      const data = await this.request<{
        threads: Array<{ id: string; name: string; type: number; parent_id?: string | null }>
      }>(`/channels/${channelId}/threads/archived/public`)

      return data.threads
        .filter((t) => t.type in CHANNEL_TYPE_MAP)
        .map((t) => ({
          id: t.id,
          name: t.name,
          type: CHANNEL_TYPE_MAP[t.type],
          parentChannelId: t.parent_id ?? undefined
        }))
    } catch {
      return [] // Channel may not support threads
    }
  }

  /** Fetch users who reacted with a specific emoji on a message */
  async getReactionUsers(channelId: string, messageId: string, emoji: string): Promise<string[]> {
    try {
      const encoded = encodeURIComponent(emoji)
      const data = await this.request<Array<{ id: string }>>(
        `/channels/${channelId}/messages/${messageId}/reactions/${encoded}?limit=100`
      )
      return data.map((u) => u.id)
    } catch {
      return [] // Reaction may have been removed
    }
  }

  /** Download a Discord CDN attachment, returning the raw bytes */
  async downloadAttachment(url: string): Promise<{ data: Uint8Array; contentType: string }> {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Failed to download attachment: ${res.status} ${url}`)
    const data = new Uint8Array(await res.arrayBuffer())
    const contentType = res.headers.get('content-type') ?? 'application/octet-stream'
    return { data, contentType }
  }

  async getGuild(guildId: string): Promise<DiscordServer> {
    const data = await this.request<{ id: string; name: string; owner_id: string }>(`/guilds/${guildId}`)
    return { id: data.id, name: data.name, ownerId: data.owner_id }
  }

  async getGuildChannels(guildId: string): Promise<DiscordChannel[]> {
    const data = await this.request<Array<{ id: string; name: string; type: number; parent_id?: string | null }>>(
      `/guilds/${guildId}/channels`
    )

    return data
      .filter((ch) => ch.type in CHANNEL_TYPE_MAP)
      .map((ch) => ({
        id: ch.id,
        name: ch.name,
        type: CHANNEL_TYPE_MAP[ch.type],
        categoryId: ch.parent_id ?? undefined
      }))
  }

  async getGuildRoles(guildId: string): Promise<DiscordRole[]> {
    const data = await this.request<Array<{ id: string; name: string; permissions: string }>>(
      `/guilds/${guildId}/roles`
    )

    return data.map((role) => ({
      id: role.id,
      name: role.name,
      permissions: this.parsePermissions(BigInt(role.permissions))
    }))
  }

  async getGuildMembers(guildId: string): Promise<DiscordMember[]> {
    const members: DiscordMember[] = []
    let after = '0'

    while (true) {
      const batch = await this.request<
        Array<{
          user: { id: string; username: string }
          roles: string[]
          joined_at: string
        }>
      >(`/guilds/${guildId}/members?limit=1000&after=${after}`)

      if (batch.length === 0) break

      for (const m of batch) {
        members.push({
          userId: m.user.id,
          username: m.user.username,
          roles: m.roles,
          joinedAt: m.joined_at
        })
      }

      if (batch.length < 1000) break
      after = batch[batch.length - 1].user.id
    }

    return members
  }

  async getChannelMessages(
    channelId: string,
    options?: { before?: string; limit?: number }
  ): Promise<DiscordMessage[]> {
    const limit = options?.limit ?? 100
    let path = `/channels/${channelId}/messages?limit=${limit}`
    if (options?.before) path += `&before=${options.before}`

    const data = await this.request<
      Array<{
        id: string
        channel_id: string
        author: { id: string; username: string }
        content: string
        timestamp: string
        message_reference?: { message_id?: string }
        reactions?: Array<{ emoji: { name: string; id: string | null }; count: number }>
        attachments?: Array<{ url: string; filename: string }>
        sticker_items?: Array<{ id: string; name: string; format_type: number }>
        embeds?: Array<{
          type?: string
          url?: string
          title?: string
          description?: string
          thumbnail?: { url: string }
        }>
      }>
    >(path)

    const messages: DiscordMessage[] = []
    for (const msg of data) {
      // Fetch reaction users for each reaction (Discord API only gives count, not users)
      let reactions: DiscordMessage['reactions'] | undefined
      if (msg.reactions && msg.reactions.length > 0) {
        reactions = []
        for (const r of msg.reactions) {
          const emojiStr = r.emoji.id ? `${r.emoji.name}:${r.emoji.id}` : r.emoji.name
          const users = await this.getReactionUsers(channelId, msg.id, emojiStr)
          if (users.length > 0) {
            reactions.push({ emoji: r.emoji.name, users })
          }
        }
        if (reactions.length === 0) reactions = undefined
      }

      const embeds: DiscordEmbed[] | undefined =
        msg.embeds && msg.embeds.length > 0
          ? msg.embeds.map((e) => ({
              type: e.type,
              url: e.url,
              title: e.title,
              description: e.description,
              thumbnail: e.thumbnail
            }))
          : undefined

      messages.push({
        id: msg.id,
        channelId: msg.channel_id,
        author: { id: msg.author.id, username: msg.author.username },
        content: msg.content,
        timestamp: msg.timestamp,
        replyTo: msg.message_reference?.message_id,
        reactions,
        attachments: msg.attachments?.map((a) => ({ url: a.url, filename: a.filename })),
        stickers: msg.sticker_items?.map((s) => ({ id: s.id, name: s.name, formatType: s.format_type })),
        embeds
      })
    }

    return messages
  }

  private parsePermissions(bits: bigint): string[] {
    const perms: string[] = []
    const flags: Record<string, bigint> = {
      ADMINISTRATOR: 1n << 3n,
      MANAGE_CHANNELS: 1n << 4n,
      MANAGE_GUILD: 1n << 5n,
      MANAGE_MESSAGES: 1n << 13n,
      MANAGE_ROLES: 1n << 28n,
      MANAGE_WEBHOOKS: 1n << 29n,
      SEND_MESSAGES: 1n << 11n,
      READ_MESSAGES: 1n << 10n,
      MENTION_EVERYONE: 1n << 17n,
      BAN_MEMBERS: 1n << 2n,
      KICK_MEMBERS: 1n << 1n
    }
    for (const [name, flag] of Object.entries(flags)) {
      if (bits & flag) perms.push(name)
    }
    return perms
  }
}
