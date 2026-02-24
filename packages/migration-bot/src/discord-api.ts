import type { DiscordAPI } from './index.js'
import type { DiscordChannel, DiscordRole, DiscordMember, DiscordMessage, DiscordServer } from '@harmony/migration'

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
        reactions?: Array<{ emoji: { name: string }; count: number }>
        attachments?: Array<{ url: string; filename: string }>
      }>
    >(path)

    return data.map((msg) => ({
      id: msg.id,
      channelId: msg.channel_id,
      author: { id: msg.author.id, username: msg.author.username },
      content: msg.content,
      timestamp: msg.timestamp,
      replyTo: msg.message_reference?.message_id,
      attachments: msg.attachments?.map((a) => ({ url: a.url, filename: a.filename }))
    }))
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
