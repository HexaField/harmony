import type { KeyPair, CryptoProvider } from '@harmony/crypto'
import type { Quad } from '@harmony/quads'
import { MemoryQuadStore } from '@harmony/quads'
import type { VerifiableCredential } from '@harmony/vc'
import { VCService } from '@harmony/vc'
import type { Capability } from '@harmony/zcap'
import { ZCAPService } from '@harmony/zcap'
import { HarmonyType, HarmonyPredicate, RDFPredicate, XSDDatatype, HARMONY } from '@harmony/vocab'

// Discord types
export interface DiscordAccount {
  id: string
  username: string
  discriminator: string
  email?: string
}

export interface DiscordEmbed {
  type?: string
  url?: string
  title?: string
  description?: string
  thumbnail?: { url: string }
}

export interface DiscordMessage {
  id: string
  channelId: string
  author: { id: string; username: string }
  content: string
  timestamp: string
  replyTo?: string
  reactions?: Array<{ emoji: string; users: string[] }>
  attachments?: Array<{ url: string; filename: string; localPath?: string }>
  stickers?: Array<{ id: string; name: string; formatType: number }>
  embeds?: DiscordEmbed[]
}

export interface DiscordChannel {
  id: string
  name: string
  type: 'text' | 'voice' | 'category' | 'thread'
  categoryId?: string
  parentMessageId?: string
}

export interface DiscordRole {
  id: string
  name: string
  permissions: string[]
}

export interface DiscordMember {
  userId: string
  username: string
  roles: string[]
  joinedAt: string
}

export interface DiscordServer {
  id: string
  name: string
  ownerId: string
}

export interface DiscordServerExport {
  server: DiscordServer
  channels: DiscordChannel[]
  roles: DiscordRole[]
  members: DiscordMember[]
  messages: Map<string, DiscordMessage[]>
  pins: Map<string, string[]>
}

export interface DiscordExport {
  account: DiscordAccount
  messages: DiscordMessage[]
  servers: Array<{ id: string; name: string }>
  connections: Array<{ type: string; id: string; name: string }>
}

export interface EncryptedExportBundle {
  ciphertext: Uint8Array
  nonce: Uint8Array
  metadata: {
    exportDate: string
    sourceServerId: string
    sourceServerName: string
    adminDID: string
    channelCount: number
    messageCount: number
    memberCount: number
  }
}

export class MigrationService {
  private crypto: CryptoProvider
  private zcapService: ZCAPService
  private vcService: VCService

  constructor(crypto: CryptoProvider) {
    this.crypto = crypto
    this.zcapService = new ZCAPService(crypto)
    this.vcService = new VCService(crypto)
  }

  parsePersonalExport(data: DiscordExport): DiscordExport {
    // Validate required structure
    if (!data.account) throw new Error('Missing account in personal export')
    if (!data.account.id || typeof data.account.id !== 'string') throw new Error('Missing or invalid account.id')
    if (!data.account.username || typeof data.account.username !== 'string')
      throw new Error('Missing or invalid account.username')

    // Normalize fields
    const account = {
      ...data.account,
      discriminator: data.account.discriminator || '0',
      username: data.account.username.trim()
    }

    const messages = (data.messages || []).map((m) => ({
      ...m,
      content: m.content ?? '',
      timestamp: m.timestamp || new Date().toISOString()
    }))

    const servers = data.servers || []
    const connections = data.connections || []

    return { account, messages, servers, connections }
  }

  parseServerExport(data: DiscordServerExport): DiscordServerExport {
    return data
  }

  transformPersonalExport(export_: DiscordExport, _ownerDID: string): Quad[] {
    const quads: Quad[] = []
    const userURI = `harmony:user:${export_.account.id}`
    const g = `harmony:personal:${export_.account.id}`

    quads.push({ subject: userURI, predicate: RDFPredicate.type, object: HarmonyType.Member, graph: g })
    quads.push({
      subject: userURI,
      predicate: HarmonyPredicate.name,
      object: { value: export_.account.username },
      graph: g
    })

    for (const msg of export_.messages) {
      const msgURI = `harmony:message:${msg.id}`
      quads.push({ subject: msgURI, predicate: RDFPredicate.type, object: HarmonyType.Message, graph: g })
      quads.push({ subject: msgURI, predicate: HarmonyPredicate.content, object: { value: msg.content }, graph: g })
      quads.push({
        subject: msgURI,
        predicate: HarmonyPredicate.timestamp,
        object: { value: msg.timestamp, datatype: XSDDatatype.dateTime },
        graph: g
      })
      quads.push({ subject: msgURI, predicate: HarmonyPredicate.author, object: userURI, graph: g })
    }

    return quads
  }

  transformServerExport(
    export_: DiscordServerExport,
    _adminDID: string,
    options?: { excludeUsers?: string[]; anonymiseFormerMembers?: boolean }
  ): {
    quads: Quad[]
    pendingMemberMap: Map<string, string>
  } {
    const quads: Quad[] = []
    const communityURI = `harmony:community:${export_.server.id}`
    const g = communityURI

    quads.push({ subject: communityURI, predicate: RDFPredicate.type, object: HarmonyType.Community, graph: g })
    quads.push({
      subject: communityURI,
      predicate: HarmonyPredicate.name,
      object: { value: export_.server.name },
      graph: g
    })

    // Roles
    for (const role of export_.roles) {
      const roleURI = `harmony:role:${role.id}`
      quads.push({ subject: roleURI, predicate: RDFPredicate.type, object: HarmonyType.Role, graph: g })
      quads.push({ subject: roleURI, predicate: HarmonyPredicate.name, object: { value: role.name }, graph: g })
      for (const perm of role.permissions) {
        quads.push({ subject: roleURI, predicate: HarmonyPredicate.permission, object: { value: perm }, graph: g })
      }
    }

    // Channels
    for (const channel of export_.channels) {
      const channelURI = `harmony:channel:${channel.id}`
      if (channel.type === 'category') {
        quads.push({ subject: channelURI, predicate: RDFPredicate.type, object: HarmonyType.Category, graph: g })
      } else if (channel.type === 'thread') {
        quads.push({ subject: channelURI, predicate: RDFPredicate.type, object: HarmonyType.Thread, graph: g })
        if (channel.parentMessageId) {
          quads.push({
            subject: channelURI,
            predicate: HarmonyPredicate.parentThread,
            object: `harmony:message:${channel.parentMessageId}`,
            graph: g
          })
        }
      } else {
        quads.push({ subject: channelURI, predicate: RDFPredicate.type, object: HarmonyType.Channel, graph: g })
      }
      // Store channel type predicate for all channels
      quads.push({
        subject: channelURI,
        predicate: `${HARMONY}channelType`,
        object: { value: channel.type },
        graph: g
      })
      quads.push({ subject: channelURI, predicate: HarmonyPredicate.name, object: { value: channel.name }, graph: g })
      if (channel.categoryId) {
        quads.push({
          subject: channelURI,
          predicate: HarmonyPredicate.inCategory,
          object: `harmony:channel:${channel.categoryId}`,
          graph: g
        })
      }
    }

    // Members
    const pendingMemberMap = new Map<string, string>()
    const excludeSet = new Set(options?.excludeUsers || [])

    for (const member of export_.members) {
      if (excludeSet.has(member.userId)) continue
      const memberURI = `harmony:member:${member.userId}`
      pendingMemberMap.set(member.userId, memberURI)

      quads.push({ subject: memberURI, predicate: RDFPredicate.type, object: HarmonyType.Member, graph: g })
      quads.push({ subject: memberURI, predicate: HarmonyPredicate.name, object: { value: member.username }, graph: g })
      quads.push({
        subject: memberURI,
        predicate: HarmonyPredicate.discordId,
        object: { value: member.userId },
        graph: g
      })
      quads.push({
        subject: memberURI,
        predicate: HarmonyPredicate.discordUsername,
        object: { value: member.username },
        graph: g
      })
      quads.push({ subject: memberURI, predicate: HarmonyPredicate.community, object: communityURI, graph: g })
      quads.push({
        subject: memberURI,
        predicate: HarmonyPredicate.joinedAt,
        object: { value: member.joinedAt, datatype: XSDDatatype.dateTime },
        graph: g
      })

      for (const roleId of member.roles) {
        quads.push({ subject: memberURI, predicate: HarmonyPredicate.role, object: `harmony:role:${roleId}`, graph: g })
      }
    }

    // Messages per channel
    for (const [channelId, messages] of export_.messages) {
      const channelGraph = `harmony:channel:${channelId}`
      for (const msg of messages) {
        if (excludeSet.has(msg.author.id)) continue
        const msgURI = `harmony:message:${msg.id}`
        quads.push({ subject: msgURI, predicate: RDFPredicate.type, object: HarmonyType.Message, graph: channelGraph })
        quads.push({
          subject: msgURI,
          predicate: HarmonyPredicate.content,
          object: { value: msg.content },
          graph: channelGraph
        })
        quads.push({
          subject: msgURI,
          predicate: HarmonyPredicate.timestamp,
          object: { value: msg.timestamp, datatype: XSDDatatype.dateTime },
          graph: channelGraph
        })
        quads.push({
          subject: msgURI,
          predicate: HarmonyPredicate.author,
          object: `harmony:member:${msg.author.id}`,
          graph: channelGraph
        })
        quads.push({
          subject: msgURI,
          predicate: HarmonyPredicate.inChannel,
          object: `harmony:channel:${channelId}`,
          graph: channelGraph
        })

        if (msg.replyTo) {
          quads.push({
            subject: msgURI,
            predicate: HarmonyPredicate.replyTo,
            object: `harmony:message:${msg.replyTo}`,
            graph: channelGraph
          })
        }

        if (msg.attachments) {
          for (const attachment of msg.attachments) {
            quads.push({
              subject: msgURI,
              predicate: `${HARMONY}attachment`,
              object: { value: attachment.url },
              graph: channelGraph
            })
            quads.push({
              subject: msgURI,
              predicate: HarmonyPredicate.filename,
              object: { value: attachment.filename },
              graph: channelGraph
            })
          }
        }

        if (msg.stickers) {
          for (const sticker of msg.stickers) {
            const stickerURI = `${msgURI}:sticker:${sticker.id}`
            quads.push({
              subject: msgURI,
              predicate: `${HARMONY}sticker`,
              object: stickerURI,
              graph: channelGraph
            })
            quads.push({
              subject: stickerURI,
              predicate: `${HARMONY}stickerName`,
              object: { value: sticker.name },
              graph: channelGraph
            })
            quads.push({
              subject: stickerURI,
              predicate: `${HARMONY}stickerFormat`,
              object: { value: String(sticker.formatType) },
              graph: channelGraph
            })
          }
        }

        if (msg.embeds) {
          for (let ei = 0; ei < msg.embeds.length; ei++) {
            const embed = msg.embeds[ei]
            const embedURI = `${msgURI}:embed:${ei}`
            quads.push({
              subject: msgURI,
              predicate: `${HARMONY}embed`,
              object: embedURI,
              graph: channelGraph
            })
            quads.push({
              subject: embedURI,
              predicate: RDFPredicate.type,
              object: `${HARMONY}Embed`,
              graph: channelGraph
            })
            if (embed.url) {
              quads.push({
                subject: embedURI,
                predicate: `${HARMONY}embedUrl`,
                object: { value: embed.url },
                graph: channelGraph
              })
            }
            if (embed.title) {
              quads.push({
                subject: embedURI,
                predicate: `${HARMONY}embedTitle`,
                object: { value: embed.title },
                graph: channelGraph
              })
            }
            if (embed.description) {
              quads.push({
                subject: embedURI,
                predicate: `${HARMONY}embedDescription`,
                object: { value: embed.description },
                graph: channelGraph
              })
            }
            if (embed.thumbnail?.url) {
              quads.push({
                subject: embedURI,
                predicate: `${HARMONY}embedThumbnail`,
                object: { value: embed.thumbnail.url },
                graph: channelGraph
              })
            }
          }
        }

        if (msg.reactions) {
          for (const reaction of msg.reactions) {
            for (const userId of reaction.users) {
              if (excludeSet.has(userId)) continue
              const reactionURI = `${msgURI}:reaction:${reaction.emoji}:${userId}`
              quads.push({
                subject: reactionURI,
                predicate: RDFPredicate.type,
                object: HarmonyType.Reaction,
                graph: channelGraph
              })
              quads.push({
                subject: reactionURI,
                predicate: HarmonyPredicate.emoji,
                object: { value: reaction.emoji },
                graph: channelGraph
              })
              quads.push({
                subject: reactionURI,
                predicate: HarmonyPredicate.reactor,
                object: `harmony:member:${userId}`,
                graph: channelGraph
              })
              quads.push({
                subject: reactionURI,
                predicate: HarmonyPredicate.onMessage,
                object: msgURI,
                graph: channelGraph
              })
            }
          }
        }
      }
    }

    return { quads, pendingMemberMap }
  }

  async encryptExport(
    quads: Quad[],
    adminKeyPair: KeyPair,
    metadata: EncryptedExportBundle['metadata']
  ): Promise<EncryptedExportBundle> {
    const store = new MemoryQuadStore()
    await store.addAll(quads)
    const nquads = await store.exportNQuads()
    const key = await this.crypto.deriveKey(adminKeyPair.secretKey, new Uint8Array(16), 'harmony-export')
    const encrypted = await this.crypto.symmetricEncrypt(new TextEncoder().encode(nquads), key)
    return {
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      metadata
    }
  }

  async decryptExport(bundle: EncryptedExportBundle, adminKeyPair: KeyPair): Promise<Quad[]> {
    const key = await this.crypto.deriveKey(adminKeyPair.secretKey, new Uint8Array(16), 'harmony-export')
    const decrypted = await this.crypto.symmetricDecrypt({ ciphertext: bundle.ciphertext, nonce: bundle.nonce }, key)
    const nquads = new TextDecoder().decode(decrypted)
    const store = new MemoryQuadStore()
    await store.importNQuads(nquads)
    return store.export()
  }

  async resignCommunityCredentials(params: {
    quads: Quad[]
    adminDID: string
    adminKeyPair: KeyPair
    newServiceEndpoint: string
  }): Promise<{
    quads: Quad[]
    reissuedVCs: VerifiableCredential[]
    reissuedRootCapability: Capability
  }> {
    // Re-issue root capability
    const reissuedRootCapability = await this.zcapService.createRoot({
      ownerDID: params.adminDID,
      ownerKeyPair: params.adminKeyPair,
      scope: { serviceEndpoint: params.newServiceEndpoint },
      allowedAction: ['harmony:SendMessage', 'harmony:ManageChannel', 'harmony:ManageRoles']
    })

    // Scan quads for members and re-issue membership VCs
    const reissuedVCs: VerifiableCredential[] = []
    const memberQuads = params.quads.filter((q) => q.predicate === RDFPredicate.type && q.object === HarmonyType.Member)

    // Find community URI from quads
    const communityQuad = params.quads.find(
      (q) => q.predicate === RDFPredicate.type && q.object === HarmonyType.Community
    )
    const communityId = communityQuad?.subject || 'unknown'

    for (const mq of memberQuads) {
      const memberURI = mq.subject

      // Get member name
      const nameQuad = params.quads.find((q) => q.subject === memberURI && q.predicate === HarmonyPredicate.name)
      const memberName = nameQuad && typeof nameQuad.object === 'object' ? nameQuad.object.value : 'unknown'

      // Get joinedAt
      const joinedQuad = params.quads.find((q) => q.subject === memberURI && q.predicate === HarmonyPredicate.joinedAt)
      const joinedAt =
        joinedQuad && typeof joinedQuad.object === 'object' ? joinedQuad.object.value : new Date().toISOString()

      // Get roles
      const roleQuads = params.quads.filter((q) => q.subject === memberURI && q.predicate === HarmonyPredicate.role)
      const roles = roleQuads.map((q) => (typeof q.object === 'string' ? q.object : ''))

      // Issue a CommunityMembershipCredential
      const vc = await this.vcService.issue({
        issuerDID: params.adminDID,
        issuerKeyPair: params.adminKeyPair,
        subjectDID: memberURI, // placeholder URI until DID linked
        type: 'CommunityMembershipCredential',
        claims: {
          communityId,
          roles,
          joinedAt,
          memberName,
          serviceEndpoint: params.newServiceEndpoint
        }
      })
      reissuedVCs.push(vc)
    }

    return {
      quads: params.quads,
      reissuedVCs,
      reissuedRootCapability
    }
  }
}

// Data claim exports
export {
  parseDiscordExport,
  type DiscordDataPackage,
  type ParsedMessage,
  type ParseProgress
} from './discord-export-parser.js'
export { deriveStorageKey, encryptUserData, decryptUserData, type UserDataPayload } from './user-data-encryption.js'
export { transformDiscordExportToQuads, computeDataMeta } from './user-data-transform.js'
