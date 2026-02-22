import type { KeyPair, CryptoProvider } from '@harmony/crypto'
import type { Quad } from '@harmony/quads'
import { MemoryQuadStore } from '@harmony/quads'
import type { VerifiableCredential } from '@harmony/vc'
import type { Capability } from '@harmony/zcap'
import { ZCAPService } from '@harmony/zcap'
import { HarmonyType, HarmonyPredicate, RDFPredicate, XSDDatatype } from '@harmony/vocab'

// Discord types
export interface DiscordAccount {
  id: string
  username: string
  discriminator: string
  email?: string
}

export interface DiscordMessage {
  id: string
  channelId: string
  author: { id: string; username: string }
  content: string
  timestamp: string
  replyTo?: string
  reactions?: Array<{ emoji: string; users: string[] }>
  attachments?: Array<{ url: string; filename: string }>
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

  constructor(crypto: CryptoProvider) {
    this.crypto = crypto
    this.zcapService = new ZCAPService(crypto)
  }

  parsePersonalExport(data: DiscordExport): DiscordExport {
    return data
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

    return {
      quads: params.quads,
      reissuedVCs: [],
      reissuedRootCapability
    }
  }
}
