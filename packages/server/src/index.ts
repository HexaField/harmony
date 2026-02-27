import { WebSocketServer, WebSocket } from 'ws'
import type { IncomingMessage } from 'node:http'
import type { QuadStore } from '@harmony/quads'
import type { VerifiablePresentation, VerifiableCredential, DIDResolver, RevocationStore } from '@harmony/vc'
import { VCService } from '@harmony/vc'
import type { Capability } from '@harmony/zcap'
import { ZCAPService } from '@harmony/zcap'
import type { CryptoProvider, KeyPair } from '@harmony/crypto'
import { createCryptoProvider, randomBytes } from '@harmony/crypto'
import type { ProtocolMessage, PresenceUpdatePayload, LamportClock, MessageType } from '@harmony/protocol'
import { serialise, deserialise } from '@harmony/protocol'
import { HarmonyPredicate, HarmonyType, HarmonyAction, HARMONY, RDFPredicate, XSDDatatype } from '@harmony/vocab'
import type { DIDDocument } from '@harmony/did'
import type { SFUAdapter } from '@harmony/voice'
import { MetadataSearchIndex, type MetadataResult } from '@harmony/search'

// ── Server Config ──

export interface ServerConfig {
  port: number
  host?: string
  store: QuadStore
  didResolver: DIDResolver
  revocationStore: RevocationStore
  cryptoProvider?: CryptoProvider
  maxConnections?: number
  rateLimit?: RateLimitConfig
  sfuAdapter?: SFUAdapter
}

export interface RateLimitConfig {
  windowMs: number
  maxMessages: number
}

// ── Server Connection ──

export interface ServerConnection {
  id: string
  did: string
  displayName?: string
  authenticatedAt: string
  communities: string[]
  presence: PresenceUpdatePayload
  ws: WebSocket
  rateLimitCounter: number
  rateLimitWindowStart: number
}

// ── Community & Channel Info ──

export interface CommunityInfo {
  id: string
  name: string
  description?: string
  creatorDID: string
  createdAt: string
  memberCount: number
}

export interface ChannelInfo {
  id: string
  communityId: string
  name: string
  type: 'text' | 'voice' | 'announcement'
  categoryId?: string
  topic?: string
  createdAt: string
}

export interface MemberInfo {
  did: string
  displayName?: string
  roles: string[]
  joinedAt: string
  presence: PresenceUpdatePayload
}

// ── Message Store ──

export class MessageStore {
  readonly store: QuadStore

  constructor(store: QuadStore) {
    this.store = store
  }

  async storeMessage(communityId: string, channelId: string, message: ProtocolMessage): Promise<void> {
    const subject = message.id
    const graph = `${communityId}:${channelId}`

    await this.store.addAll([
      { subject, predicate: RDFPredicate.type, object: HarmonyType.Message, graph },
      { subject, predicate: HarmonyPredicate.author, object: message.sender, graph },
      {
        subject,
        predicate: HarmonyPredicate.timestamp,
        object: { value: message.timestamp, datatype: XSDDatatype.dateTime },
        graph
      },
      { subject, predicate: HarmonyPredicate.inChannel, object: channelId, graph },
      { subject, predicate: HarmonyPredicate.community, object: communityId, graph },
      { subject, predicate: `${HARMONY}messageType`, object: { value: message.type }, graph },
      { subject, predicate: `${HARMONY}payload`, object: { value: serialise(message.payload) }, graph }
    ])

    // Store clock if present in payload
    const payload = message.payload as { clock?: LamportClock }
    if (payload?.clock) {
      await this.store.add({
        subject,
        predicate: `${HARMONY}clock`,
        object: { value: String(payload.clock.counter), datatype: XSDDatatype.integer },
        graph
      })
    }
  }

  async getHistory(params: {
    communityId: string
    channelId: string
    before?: LamportClock
    after?: LamportClock
    limit: number
  }): Promise<ProtocolMessage[]> {
    const graph = `${params.communityId}:${params.channelId}`
    const quads = await this.store.match({ graph, predicate: RDFPredicate.type, object: HarmonyType.Message })
    const messages: ProtocolMessage[] = []

    for (const q of quads) {
      const subject = q.subject
      const authorQuads = await this.store.match({ subject, predicate: HarmonyPredicate.author, graph })
      const tsQuads = await this.store.match({ subject, predicate: HarmonyPredicate.timestamp, graph })
      const typeQuads = await this.store.match({ subject, predicate: `${HARMONY}messageType`, graph })
      const payloadQuads = await this.store.match({ subject, predicate: `${HARMONY}payload`, graph })

      if (authorQuads.length && tsQuads.length && typeQuads.length && payloadQuads.length) {
        const ts = typeof tsQuads[0].object === 'string' ? tsQuads[0].object : tsQuads[0].object.value
        const msgType = typeof typeQuads[0].object === 'string' ? typeQuads[0].object : typeQuads[0].object.value
        const payloadStr =
          typeof payloadQuads[0].object === 'string' ? payloadQuads[0].object : payloadQuads[0].object.value
        const author = typeof authorQuads[0].object === 'string' ? authorQuads[0].object : authorQuads[0].object.value

        const msg: ProtocolMessage = {
          id: subject,
          type: msgType as MessageType,
          timestamp: ts,
          sender: author,
          payload: deserialise(payloadStr)
        }

        // Filter by clock if needed
        const payload = msg.payload as { clock?: LamportClock }
        if (params.after && payload?.clock) {
          if (payload.clock.counter <= params.after.counter) continue
        }
        if (params.before && payload?.clock) {
          if (payload.clock.counter >= params.before.counter) continue
        }

        messages.push(msg)
      }
    }

    // Sort by clock
    messages.sort((a, b) => {
      const ca = (a.payload as { clock?: LamportClock })?.clock?.counter ?? 0
      const cb = (b.payload as { clock?: LamportClock })?.clock?.counter ?? 0
      return ca - cb
    })

    return messages.slice(0, params.limit)
  }

  async getMessage(messageId: string): Promise<ProtocolMessage | null> {
    const quads = await this.store.match({
      subject: messageId,
      predicate: RDFPredicate.type,
      object: HarmonyType.Message
    })
    if (quads.length === 0) return null
    const authorQuads = await this.store.match({ subject: messageId, predicate: HarmonyPredicate.author })
    const tsQuads = await this.store.match({ subject: messageId, predicate: HarmonyPredicate.timestamp })
    const typeQuads = await this.store.match({ subject: messageId, predicate: `${HARMONY}messageType` })
    const payloadQuads = await this.store.match({ subject: messageId, predicate: `${HARMONY}payload` })

    if (!authorQuads.length || !tsQuads.length || !typeQuads.length || !payloadQuads.length) return null

    return {
      id: messageId,
      type: (typeof typeQuads[0].object === 'string' ? typeQuads[0].object : typeQuads[0].object.value) as MessageType,
      timestamp: typeof tsQuads[0].object === 'string' ? tsQuads[0].object : tsQuads[0].object.value,
      sender: typeof authorQuads[0].object === 'string' ? authorQuads[0].object : authorQuads[0].object.value,
      payload: deserialise(
        typeof payloadQuads[0].object === 'string' ? payloadQuads[0].object : payloadQuads[0].object.value
      )
    }
  }

  async deleteMessage(messageId: string): Promise<void> {
    const quads = await this.store.match({ subject: messageId })
    for (const q of quads) await this.store.remove(q)
  }

  async search(params: {
    communityId: string
    channelId?: string
    channelIds?: string[]
    authorDID?: string
    query?: string
    before?: string
    after?: string
    limit: number
  }): Promise<ProtocolMessage[]> {
    // Single channel search
    if (params.channelId) {
      let results = await this.getHistory({
        communityId: params.communityId,
        channelId: params.channelId,
        limit: params.limit * 10
      })
      if (params.authorDID) {
        results = results.filter((m) => m.sender === params.authorDID)
      }
      if (params.query) {
        const q = params.query.toLowerCase()
        results = results.filter((m) => {
          const text = String((m.payload as any)?.text || (m.payload as any)?.content || '')
          return text.toLowerCase().includes(q)
        })
      }
      return results.slice(0, params.limit)
    }
    // Cross-channel search (caller provides channelIds)
    if (params.query && params.channelIds) {
      const allResults: ProtocolMessage[] = []
      const q = params.query.toLowerCase()
      for (const chId of params.channelIds) {
        const msgs = await this.getHistory({
          communityId: params.communityId,
          channelId: chId,
          limit: 100
        })
        for (const m of msgs) {
          const text = String((m.payload as any)?.text || (m.payload as any)?.content || '')
          if (text.toLowerCase().includes(q)) {
            allResults.push(m)
          }
        }
      }
      return allResults.slice(0, params.limit)
    }
    return []
  }
}

// ── Community Manager ──

export class CommunityManager {
  private store: QuadStore
  private crypto: CryptoProvider
  private zcapService: ZCAPService
  private vcService: VCService

  constructor(store: QuadStore, cryptoProvider?: CryptoProvider) {
    this.store = store
    this.crypto = cryptoProvider ?? createCryptoProvider()
    this.zcapService = new ZCAPService(this.crypto)
    this.vcService = new VCService(this.crypto)
  }

  async create(params: {
    name: string
    description?: string
    creatorDID: string
    creatorKeyPair: KeyPair
    defaultChannels?: string[]
  }): Promise<{
    communityId: string
    rootCapability: Capability
    membershipVC: VerifiableCredential
    defaultChannels: ChannelInfo[]
  }> {
    const idBytes = randomBytes(16)
    const communityId = 'community:' + Array.from(idBytes, (b) => b.toString(16).padStart(2, '0')).join('')
    const now = new Date().toISOString()

    // Store community metadata
    await this.store.addAll([
      { subject: communityId, predicate: RDFPredicate.type, object: HarmonyType.Community, graph: communityId },
      { subject: communityId, predicate: HarmonyPredicate.name, object: { value: params.name }, graph: communityId },
      { subject: communityId, predicate: HarmonyPredicate.author, object: params.creatorDID, graph: communityId },
      {
        subject: communityId,
        predicate: HarmonyPredicate.timestamp,
        object: { value: now, datatype: XSDDatatype.dateTime },
        graph: communityId
      }
    ])

    if (params.description) {
      await this.store.add({
        subject: communityId,
        predicate: `${HARMONY}description`,
        object: { value: params.description },
        graph: communityId
      })
    }

    // Create root capability
    const rootCapability = await this.zcapService.createRoot({
      ownerDID: params.creatorDID,
      ownerKeyPair: params.creatorKeyPair,
      scope: { community: communityId },
      allowedAction: Object.values(HarmonyAction)
    })

    // Issue membership VC
    const membershipVC = await this.vcService.issue({
      issuerDID: params.creatorDID,
      issuerKeyPair: params.creatorKeyPair,
      subjectDID: params.creatorDID,
      type: 'CommunityMembershipCredential',
      claims: { community: communityId, role: 'admin' }
    })

    // Store member
    const memberSubject = `${communityId}:member:${params.creatorDID}`
    await this.store.addAll([
      { subject: memberSubject, predicate: RDFPredicate.type, object: HarmonyType.Member, graph: communityId },
      { subject: memberSubject, predicate: HarmonyPredicate.author, object: params.creatorDID, graph: communityId },
      { subject: memberSubject, predicate: HarmonyPredicate.community, object: communityId, graph: communityId },
      {
        subject: memberSubject,
        predicate: HarmonyPredicate.joinedAt,
        object: { value: now, datatype: XSDDatatype.dateTime },
        graph: communityId
      }
    ])

    // Create default channels
    const channelNames = params.defaultChannels ?? ['general']
    const defaultChannels: ChannelInfo[] = []
    for (const name of channelNames) {
      const channelInfo = await this.createChannel(communityId, { name, type: 'text' })
      defaultChannels.push(channelInfo)
    }

    return { communityId, rootCapability, membershipVC, defaultChannels }
  }

  async createChannel(
    communityId: string,
    params: { name: string; type: 'text' | 'voice' | 'announcement'; categoryId?: string; topic?: string }
  ): Promise<ChannelInfo> {
    const idBytes = randomBytes(8)
    const channelId = `${communityId}:channel:${Array.from(idBytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
    const now = new Date().toISOString()

    await this.store.addAll([
      { subject: channelId, predicate: RDFPredicate.type, object: HarmonyType.Channel, graph: communityId },
      { subject: channelId, predicate: HarmonyPredicate.name, object: { value: params.name }, graph: communityId },
      { subject: channelId, predicate: HarmonyPredicate.community, object: communityId, graph: communityId },
      { subject: channelId, predicate: `${HARMONY}channelType`, object: { value: params.type }, graph: communityId },
      {
        subject: channelId,
        predicate: HarmonyPredicate.timestamp,
        object: { value: now, datatype: XSDDatatype.dateTime },
        graph: communityId
      }
    ])

    if (params.topic) {
      await this.store.add({
        subject: channelId,
        predicate: `${HARMONY}topic`,
        object: { value: params.topic },
        graph: communityId
      })
    }

    return {
      id: channelId,
      communityId,
      name: params.name,
      type: params.type,
      categoryId: params.categoryId,
      topic: params.topic,
      createdAt: now
    }
  }

  async join(params: {
    communityId: string
    memberDID: string
    membershipVC: VerifiableCredential
    encryptionPublicKey?: Uint8Array
  }): Promise<{
    channels: ChannelInfo[]
    members: MemberInfo[]
  }> {
    const now = new Date().toISOString()
    const memberSubject = `${params.communityId}:member:${params.memberDID}`
    await this.store.addAll([
      { subject: memberSubject, predicate: RDFPredicate.type, object: HarmonyType.Member, graph: params.communityId },
      {
        subject: memberSubject,
        predicate: HarmonyPredicate.author,
        object: params.memberDID,
        graph: params.communityId
      },
      {
        subject: memberSubject,
        predicate: HarmonyPredicate.community,
        object: params.communityId,
        graph: params.communityId
      },
      {
        subject: memberSubject,
        predicate: HarmonyPredicate.joinedAt,
        object: { value: now, datatype: XSDDatatype.dateTime },
        graph: params.communityId
      }
    ])

    const channels = await this.getChannels(params.communityId)
    const members = await this.getMembers(params.communityId)
    return { channels, members }
  }

  async leave(communityId: string, memberDID: string): Promise<void> {
    const memberSubject = `${communityId}:member:${memberDID}`
    const quads = await this.store.match({ subject: memberSubject, graph: communityId })
    for (const q of quads) await this.store.remove(q)
  }

  async listAll(): Promise<CommunityInfo[]> {
    const typeQuads = await this.store.match({
      predicate: RDFPredicate.type,
      object: HarmonyType.Community
    })
    const results: CommunityInfo[] = []
    for (const q of typeQuads) {
      const info = await this.getInfo(q.subject)
      if (info) results.push(info)
    }
    return results
  }

  async getInfo(communityId: string): Promise<CommunityInfo | null> {
    const typeQuads = await this.store.match({
      subject: communityId,
      predicate: RDFPredicate.type,
      object: HarmonyType.Community
    })
    if (typeQuads.length === 0) return null

    const nameQuads = await this.store.match({
      subject: communityId,
      predicate: HarmonyPredicate.name,
      graph: communityId
    })
    const authorQuads = await this.store.match({
      subject: communityId,
      predicate: HarmonyPredicate.author,
      graph: communityId
    })
    const tsQuads = await this.store.match({
      subject: communityId,
      predicate: HarmonyPredicate.timestamp,
      graph: communityId
    })
    const descQuads = await this.store.match({
      subject: communityId,
      predicate: `${HARMONY}description`,
      graph: communityId
    })
    const members = await this.getMembers(communityId)

    return {
      id: communityId,
      name: nameQuads.length
        ? typeof nameQuads[0].object === 'string'
          ? nameQuads[0].object
          : nameQuads[0].object.value
        : '',
      description: descQuads.length
        ? typeof descQuads[0].object === 'string'
          ? descQuads[0].object
          : descQuads[0].object.value
        : undefined,
      creatorDID: authorQuads.length
        ? typeof authorQuads[0].object === 'string'
          ? authorQuads[0].object
          : authorQuads[0].object.value
        : '',
      createdAt: tsQuads.length
        ? typeof tsQuads[0].object === 'string'
          ? tsQuads[0].object
          : tsQuads[0].object.value
        : '',
      memberCount: members.length
    }
  }

  async getMembers(communityId: string): Promise<MemberInfo[]> {
    const memberQuads = await this.store.match({
      predicate: RDFPredicate.type,
      object: HarmonyType.Member,
      graph: communityId
    })
    const members: MemberInfo[] = []
    for (const mq of memberQuads) {
      const authorQuads = await this.store.match({
        subject: mq.subject,
        predicate: HarmonyPredicate.author,
        graph: communityId
      })
      const joinedQuads = await this.store.match({
        subject: mq.subject,
        predicate: HarmonyPredicate.joinedAt,
        graph: communityId
      })
      if (authorQuads.length) {
        const did = typeof authorQuads[0].object === 'string' ? authorQuads[0].object : authorQuads[0].object.value
        const joinedAt = joinedQuads.length
          ? typeof joinedQuads[0].object === 'string'
            ? joinedQuads[0].object
            : joinedQuads[0].object.value
          : ''
        members.push({
          did,
          roles: [],
          joinedAt,
          presence: { status: 'offline' }
        })
      }
    }
    return members
  }

  async getChannels(communityId: string): Promise<ChannelInfo[]> {
    const channelQuads = await this.store.match({
      predicate: RDFPredicate.type,
      object: HarmonyType.Channel,
      graph: communityId
    })
    const channels: ChannelInfo[] = []
    for (const cq of channelQuads) {
      const nameQuads = await this.store.match({
        subject: cq.subject,
        predicate: HarmonyPredicate.name,
        graph: communityId
      })
      const typeQuads = await this.store.match({
        subject: cq.subject,
        predicate: `${HARMONY}channelType`,
        graph: communityId
      })
      const tsQuads = await this.store.match({
        subject: cq.subject,
        predicate: HarmonyPredicate.timestamp,
        graph: communityId
      })
      const topicQuads = await this.store.match({
        subject: cq.subject,
        predicate: `${HARMONY}topic`,
        graph: communityId
      })

      channels.push({
        id: cq.subject,
        communityId,
        name: nameQuads.length
          ? typeof nameQuads[0].object === 'string'
            ? nameQuads[0].object
            : nameQuads[0].object.value
          : '',
        type: (typeQuads.length
          ? typeof typeQuads[0].object === 'string'
            ? typeQuads[0].object
            : typeQuads[0].object.value
          : 'text') as 'text' | 'voice' | 'announcement',
        topic: topicQuads.length
          ? typeof topicQuads[0].object === 'string'
            ? topicQuads[0].object
            : topicQuads[0].object.value
          : undefined,
        createdAt: tsQuads.length
          ? typeof tsQuads[0].object === 'string'
            ? tsQuads[0].object
            : tsQuads[0].object.value
          : ''
      })
    }
    return channels
  }

  async updateChannel(
    communityId: string,
    channelId: string,
    params: { name?: string; topic?: string }
  ): Promise<ChannelInfo | null> {
    if (params.name) {
      const oldNameQuads = await this.store.match({
        subject: channelId,
        predicate: HarmonyPredicate.name,
        graph: communityId
      })
      for (const q of oldNameQuads) await this.store.remove(q)
      await this.store.add({
        subject: channelId,
        predicate: HarmonyPredicate.name,
        object: { value: params.name },
        graph: communityId
      })
    }
    if (params.topic) {
      const oldTopicQuads = await this.store.match({
        subject: channelId,
        predicate: `${HARMONY}topic`,
        graph: communityId
      })
      for (const q of oldTopicQuads) await this.store.remove(q)
      await this.store.add({
        subject: channelId,
        predicate: `${HARMONY}topic`,
        object: { value: params.topic },
        graph: communityId
      })
    }
    const channels = await this.getChannels(communityId)
    return channels.find((c) => c.id === channelId) ?? null
  }

  async deleteChannel(communityId: string, channelId: string): Promise<void> {
    const quads = await this.store.match({ subject: channelId, graph: communityId })
    for (const q of quads) await this.store.remove(q)
  }
}

// ── Harmony Server ──

// Thread state (in-memory MVP)
interface ThreadState {
  threadId: string
  parentMessageId: string
  channelId: string
  communityId: string
  name: string
  creatorDID: string
  createdAt: string
  messageCount: number
}

// Role state (in-memory MVP)
interface Role {
  id: string
  communityId: string
  name: string
  color?: string
  permissions: string[]
  position: number
  createdBy: string
}

export class HarmonyServer {
  private wss: WebSocketServer | null = null
  private _connections: Map<string, ServerConnection> = new Map()
  private messageStore: MessageStore
  private communityManager: CommunityManager
  private config: ServerConfig
  private crypto: CryptoProvider
  private vcService: VCService
  private communitySubscriptions: Map<string, Set<string>> = new Map() // communityId → connection IDs
  private keyPackages: Map<string, Uint8Array[]> = new Map() // DID → key packages (serialized)
  private e2eeGroups: Map<string, { creatorDID: string; communityId: string; channelId: string; groupId: string }> =
    new Map() // groupId → metadata
  private _threads: Map<string, ThreadState> = new Map()
  private voiceChannelParticipants: Map<string, Set<string>> = new Map() // channelId → Set<connId>
  private voiceParticipantState: Map<
    string,
    { muted: boolean; deafened: boolean; videoEnabled: boolean; screenSharing: boolean }
  > = new Map() // connId → state
  private bannedUsers: Map<string, Set<string>> = new Map() // communityId → Set<DID>
  private mediaStore: Map<
    string,
    {
      id: string
      filename: string
      mimeType: string
      size: number
      data: string
      uploadedBy: string
      communityId: string
      channelId: string
      uploadedAt: string
    }
  > = new Map()
  private zcapService: ZCAPService
  private capabilityStore: Map<string, Capability> = new Map() // capabilityId → Capability
  private roles: Map<string, Map<string, Role>> = new Map() // communityId → roleId → Role
  private memberRoles: Map<string, Map<string, Set<string>>> = new Map() // communityId → DID → Set<roleId>
  private pins: Map<string, Set<string>> = new Map() // channelKey → Set<messageId>
  private sfuAdapter: SFUAdapter | null = null
  private sfuRooms: Set<string> = new Set() // channelIds with SFU rooms created
  private metadataIndex: MetadataSearchIndex

  constructor(config: ServerConfig) {
    this.config = config
    this.crypto = config.cryptoProvider ?? createCryptoProvider()
    this.messageStore = new MessageStore(config.store)
    this.communityManager = new CommunityManager(config.store, this.crypto)
    this.vcService = new VCService(this.crypto)
    this.zcapService = new ZCAPService(this.crypto)
    this.sfuAdapter = config.sfuAdapter ?? null
    this.metadataIndex = new MetadataSearchIndex(config.store)
  }

  get messageStoreInstance(): MessageStore {
    return this.messageStore
  }
  private get store(): QuadStore {
    return this.messageStore.store
  }
  get communityManagerInstance(): CommunityManager {
    return this.communityManager
  }

  setSFUAdapter(adapter: SFUAdapter): void {
    this.sfuAdapter = adapter
  }

  async start(): Promise<void> {
    this.wss = new WebSocketServer({ port: this.config.port, host: this.config.host })

    this.wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
      const connId = 'conn:' + Array.from(randomBytes(8), (b) => b.toString(16).padStart(2, '0')).join('')

      // Connection must authenticate within timeout
      let authenticated = false
      const authTimeout = setTimeout(() => {
        if (!authenticated) {
          ws.close(4001, 'Authentication timeout')
        }
      }, 30000)

      ws.on('message', async (data: Buffer) => {
        try {
          const msg = deserialise<ProtocolMessage>(data.toString())

          if (!authenticated) {
            // First message must be auth (VP presentation)
            if (msg.type === 'sync.state' && msg.payload) {
              const vp = msg.payload as VerifiablePresentation
              const result = await this.authenticateConnection(vp)
              if (result.authenticated && result.did) {
                authenticated = true
                clearTimeout(authTimeout)
                const conn: ServerConnection = {
                  id: connId,
                  did: result.did,
                  authenticatedAt: new Date().toISOString(),
                  communities: [],
                  presence: { status: 'online' },
                  ws,
                  rateLimitCounter: 0,
                  rateLimitWindowStart: Date.now()
                }
                this._connections.set(connId, conn)
                this.sendToConnection(conn, {
                  id: 'auth-ok',
                  type: 'sync.response',
                  timestamp: new Date().toISOString(),
                  sender: 'server',
                  payload: { authenticated: true, did: result.did }
                })
              } else {
                this.sendRaw(ws, {
                  id: 'auth-fail',
                  type: 'error',
                  timestamp: new Date().toISOString(),
                  sender: 'server',
                  payload: { code: 'AUTH_INVALID', message: result.error ?? 'Authentication failed' }
                })
                ws.close(4002, 'Authentication failed')
              }
            } else {
              this.sendRaw(ws, {
                id: 'auth-required',
                type: 'error',
                timestamp: new Date().toISOString(),
                sender: 'server',
                payload: { code: 'AUTH_REQUIRED', message: 'Must authenticate first' }
              })
            }
            return
          }

          const conn = this._connections.get(connId)
          if (!conn) return

          // Rate limiting
          if (this.config.rateLimit) {
            const now = Date.now()
            if (now - conn.rateLimitWindowStart > this.config.rateLimit.windowMs) {
              conn.rateLimitCounter = 0
              conn.rateLimitWindowStart = now
            }
            conn.rateLimitCounter++
            if (conn.rateLimitCounter > this.config.rateLimit.maxMessages) {
              this.sendToConnection(conn, {
                id: `rl-${Date.now()}`,
                type: 'error',
                timestamp: new Date().toISOString(),
                sender: 'server',
                payload: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' }
              })
              return
            }
          }

          await this.handleMessage(conn, msg)
        } catch (err) {
          // Silently ignore parse errors
        }
      })

      ws.on('close', () => {
        clearTimeout(authTimeout)
        const conn = this._connections.get(connId)
        if (conn) {
          conn.presence = { status: 'offline' }
          // Broadcast offline presence
          for (const communityId of conn.communities) {
            this.broadcastToCommunity(
              communityId,
              {
                id: `presence-${Date.now()}`,
                type: 'presence.changed',
                timestamp: new Date().toISOString(),
                sender: conn.did,
                payload: { status: 'offline' }
              },
              connId
            )
          }
          // Clean up subscriptions
          for (const communityId of conn.communities) {
            this.communitySubscriptions.get(communityId)?.delete(connId)
          }
          // Clean up voice channels
          for (const [channelId, participants] of this.voiceChannelParticipants) {
            if (participants.has(connId)) {
              participants.delete(connId)
              this.voiceParticipantState.delete(connId)
              // Broadcast participant left
              this.broadcastVoiceState(channelId, conn.did, 'voice.participant.left')
            }
          }
          this._connections.delete(connId)
        }
      })
    })
  }

  async stop(): Promise<void> {
    if (this.wss) {
      for (const conn of this._connections.values()) {
        conn.ws.close()
      }
      this._connections.clear()
      await new Promise<void>((resolve) => this.wss!.close(() => resolve()))
      this.wss = null
    }
  }

  connections(): ServerConnection[] {
    return Array.from(this._connections.values())
  }

  communities(): string[] {
    return Array.from(this.communitySubscriptions.keys())
  }

  /** Register a community so it appears in the communities list (e.g. after import).
   *  Optionally notifies all connected clients about the new community. */
  registerCommunity(communityId: string, options?: { notify?: boolean }): void {
    if (!this.communitySubscriptions.has(communityId)) {
      this.communitySubscriptions.set(communityId, new Set())
    }
    // Notify all connected clients so they refresh their community list
    if (options?.notify !== false) {
      for (const conn of this._connections.values()) {
        this.handleCommunityList(conn, {
          id: `list-refresh-${Date.now()}`,
          type: 'community.list' as any,
          timestamp: new Date().toISOString(),
          sender: conn.did,
          payload: {}
        }).catch(() => {
          /* ignore */
        })
      }
    }
  }

  private async authenticateConnection(
    vp: VerifiablePresentation
  ): Promise<{ authenticated: boolean; did?: string; error?: string }> {
    try {
      const result = await this.vcService.verifyPresentation(vp, this.config.didResolver)
      if (!result.valid) {
        return { authenticated: false, error: 'Invalid VP' }
      }

      // Verify embedded credentials
      for (const vc of vp.verifiableCredential) {
        const vcResult = await this.vcService.verify(vc, this.config.didResolver, this.config.revocationStore)
        if (!vcResult.valid) {
          const failedCheck = vcResult.checks.find((c) => !c.passed)
          if (failedCheck?.name === 'expiration') {
            return { authenticated: false, error: 'Expired VC' }
          }
          if (failedCheck?.name === 'revocation') {
            return { authenticated: false, error: 'Revoked VC' }
          }
          return { authenticated: false, error: 'Invalid VC' }
        }
      }

      return { authenticated: true, did: vp.holder }
    } catch {
      return { authenticated: false, error: 'Authentication error' }
    }
  }

  // ── Input Validation Helpers ──

  private static readonly MAX_CONTENT_LENGTH = 4000
  private static readonly MAX_NAME_LENGTH = 100
  private static readonly MAX_DESCRIPTION_LENGTH = 1000
  private static readonly MAX_TOPIC_LENGTH = 500
  private static readonly MAX_QUERY_LENGTH = 200

  private sendError(conn: ServerConnection, code: string, message: string): void {
    this.sendToConnection(conn, {
      id: `err-${Date.now()}`,
      type: 'error',
      timestamp: new Date().toISOString(),
      sender: 'server',
      payload: { code, message }
    })
  }

  /** Validate that required string fields exist and are non-empty strings */
  private validateRequiredStrings(conn: ServerConnection, payload: Record<string, unknown>, fields: string[]): boolean {
    for (const field of fields) {
      if (typeof payload[field] !== 'string' || (payload[field] as string).trim() === '') {
        this.sendError(conn, 'INVALID_INPUT', `Missing or invalid field: ${field}`)
        return false
      }
    }
    return true
  }

  /** Validate string length */
  private validateStringLength(conn: ServerConnection, value: unknown, fieldName: string, maxLength: number): boolean {
    if (typeof value === 'string' && value.length > maxLength) {
      this.sendError(conn, 'INVALID_INPUT', `${fieldName} exceeds maximum length of ${maxLength}`)
      return false
    }
    return true
  }

  /** Validate community membership */
  private validateMembership(conn: ServerConnection, communityId: string): boolean {
    if (!conn.communities.includes(communityId)) {
      this.sendError(conn, 'NOT_MEMBER', 'Not a member of this community')
      return false
    }
    return true
  }

  /** Sanitize filename — strip path traversal */
  private static sanitizeFilename(filename: string): string {
    // Remove path separators and traversal sequences
    return filename.replace(/[/\\]/g, '_').replace(/\.\./g, '_')
  }

  private async handleMessage(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    switch (msg.type) {
      case 'channel.send':
        await this.handleChannelSend(conn, msg)
        break
      case 'channel.edit':
        await this.handleChannelEdit(conn, msg)
        break
      case 'channel.delete':
        await this.handleChannelDelete(conn, msg)
        break
      case 'channel.typing':
        await this.handleChannelTyping(conn, msg)
        break
      case 'channel.reaction.add':
        await this.handleReactionAdd(conn, msg)
        break
      case 'channel.reaction.remove':
        await this.handleReactionRemove(conn, msg)
        break
      case 'dm.send':
        await this.handleDMSend(conn, msg)
        break
      case 'dm.edit':
        await this.handleDMEdit(conn, msg)
        break
      case 'dm.delete':
        await this.handleDMDelete(conn, msg)
        break
      case 'dm.typing':
        await this.handleDMTyping(conn, msg)
        break
      case 'dm.keyexchange':
        await this.handleDMKeyExchange(conn, msg)
        break
      case 'community.create':
        await this.handleCommunityCreate(conn, msg)
        break
      case 'community.join':
        await this.handleCommunityJoin(conn, msg)
        break
      case 'community.leave':
        await this.handleCommunityLeave(conn, msg)
        break
      case 'community.update':
        await this.handleCommunityUpdate(conn, msg)
        break
      case 'community.ban':
        await this.handleCommunityBan(conn, msg)
        break
      case 'community.unban':
        await this.handleCommunityUnban(conn, msg)
        break
      case 'community.kick':
        await this.handleCommunityKick(conn, msg)
        break
      case 'channel.create':
        await this.handleChannelCreate(conn, msg)
        break
      case 'channel.update':
        await this.handleChannelUpdate(conn, msg)
        break
      case 'channel.delete.admin':
        await this.handleChannelDeleteAdmin(conn, msg)
        break
      case 'presence.update':
        await this.handlePresenceUpdate(conn, msg)
        break
      case 'member.update':
        await this.handleMemberUpdate(conn, msg)
        break
      case 'sync.request':
        await this.handleSyncRequest(conn, msg)
        break
      case 'community.info':
        await this.handleCommunityInfo(conn, msg)
        break
      case 'community.list':
        await this.handleCommunityList(conn, msg)
        break
      case 'community.member.reconciled' as any:
        await this.handleReconciliation(conn, msg)
        break
      case 'mls.keypackage.upload':
        await this.handleMLSKeyPackageUpload(conn, msg)
        break
      case 'mls.keypackage.fetch':
        await this.handleMLSKeyPackageFetch(conn, msg)
        break
      case 'mls.welcome':
        await this.handleMLSWelcome(conn, msg)
        break
      case 'mls.commit':
        await this.handleMLSCommit(conn, msg)
        break
      case 'mls.group.setup':
        await this.handleMLSGroupSetup(conn, msg)
        break
      case 'mls.member.joined':
        // Client-to-client: just forwarded by server, no handler needed
        break
      case 'voice.join':
        await this.handleVoiceJoin(conn, msg)
        break
      case 'voice.leave':
        await this.handleVoiceLeave(conn, msg)
        break
      case 'voice.offer':
      case 'voice.answer':
      case 'voice.ice':
        await this.handleVoiceSignaling(conn, msg)
        break
      case 'voice.mute':
      case 'voice.unmute':
        await this.handleVoiceMuteToggle(conn, msg)
        break
      case 'voice.video':
        await this.handleVoiceVideo(conn, msg)
        break
      case 'voice.screen':
        await this.handleVoiceScreen(conn, msg)
        break
      case 'voice.speaking':
        await this.handleVoiceSpeaking(conn, msg)
        break
      case 'voice.token':
        await this.handleVoiceToken(conn, msg)
        break
      case 'voice.transport.connect':
        await this.handleVoiceTransportConnect(conn, msg)
        break
      case 'voice.produce':
        await this.handleVoiceProduce(conn, msg)
        break
      case 'voice.consume':
        await this.handleVoiceConsume(conn, msg)
        break
      case 'voice.consumer.resume':
        await this.handleVoiceConsumerResume(conn, msg)
        break
      case 'thread.create':
        await this.handleThreadCreate(conn, msg)
        break
      case 'thread.send':
        await this.handleThreadSend(conn, msg)
        break
      case 'role.create':
        await this.handleRoleCreate(conn, msg)
        break
      case 'role.update':
        await this.handleRoleUpdate(conn, msg)
        break
      case 'role.delete':
        await this.handleRoleDelete(conn, msg)
        break
      case 'role.assign':
        await this.handleRoleAssign(conn, msg)
        break
      case 'role.remove':
        await this.handleRoleRemove(conn, msg)
        break
      case 'channel.pin':
        await this.handleChannelPin(conn, msg)
        break
      case 'channel.unpin':
        await this.handleChannelUnpin(conn, msg)
        break
      case 'channel.pins.list':
        await this.handleChannelPinsList(conn, msg)
        break
      case 'media.upload.request':
        await this.handleMediaUploadRequest(conn, msg)
        break
      case 'media.delete':
        await this.handleMediaDelete(conn, msg)
        break
      case 'search.query':
        await this.handleSearchQuery(conn, msg)
        break
      case 'channel.history':
        await this.handleChannelHistory(conn, msg)
        break
      default:
        // Unknown message type — ignore
        break
    }
  }

  private async handleChannelSend(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const _raw = msg.payload as Record<string, unknown>
    if (!this.validateRequiredStrings(conn, _raw, ['communityId', 'channelId'])) return

    // Content length check (content may be encrypted object, check if string)
    if (
      typeof _raw.content === 'string' &&
      !this.validateStringLength(conn, _raw.content, 'content', HarmonyServer.MAX_CONTENT_LENGTH)
    )
      return

    // After validation, use typed payload
    const payload = _raw as unknown as {
      communityId: string
      channelId: string
      content: unknown
      nonce: string
      clock: LamportClock
    }

    // Check ban list first
    if (this.isUserBanned(payload.communityId, conn.did)) {
      this.sendToConnection(conn, {
        id: `ban-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'BANNED', message: 'You are banned from this community' }
      })
      conn.ws.close(4003, 'Banned')
      return
    }

    // Verify ZCAP if proof is present (primary authorization mechanism)
    if (msg.proof) {
      const valid = await this.verifyZCAPProof(msg)
      if (!valid) {
        this.sendToConnection(conn, {
          id: `err-${Date.now()}`,
          type: 'error',
          timestamp: new Date().toISOString(),
          sender: 'server',
          payload: { code: 'ZCAP_INVALID', message: 'Invalid ZCAP proof' }
        })
        return
      }
    }

    // Verify membership (after ZCAP — ZCAP is the primary auth check)
    if (!this.validateMembership(conn, payload.communityId as string)) return

    // Store message
    await this.messageStore.storeMessage(payload.communityId, payload.channelId, msg)

    // Index metadata for search (server can only index metadata, not E2EE content)
    this.metadataIndex.indexMessageMeta({
      id: msg.id,
      channelId: payload.channelId,
      communityId: payload.communityId,
      authorDID: conn.did,
      timestamp: msg.timestamp,
      hasAttachment: !!(payload as any).attachments?.length,
      clock: payload.clock?.counter ?? 0
    })

    // Broadcast to channel subscribers
    const broadcastMsg: ProtocolMessage = {
      id: msg.id,
      type: 'channel.message',
      timestamp: msg.timestamp,
      sender: conn.did,
      payload: msg.payload
    }
    this.broadcastToCommunity(payload.communityId, broadcastMsg)
  }

  private async handleChannelEdit(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const _raw = msg.payload as Record<string, unknown>
    if (!this.validateRequiredStrings(conn, _raw, ['communityId', 'channelId', 'messageId'])) return
    if (!this.validateMembership(conn, _raw.communityId as string)) return
    const payload = _raw as unknown as { communityId: string; channelId: string; messageId: string }

    this.broadcastToCommunity(payload.communityId, {
      ...msg,
      type: 'channel.message.updated',
      sender: conn.did
    })
  }

  private async handleChannelDelete(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const _raw = msg.payload as Record<string, unknown>
    if (!this.validateRequiredStrings(conn, _raw, ['communityId', 'channelId', 'messageId'])) return
    if (!this.validateMembership(conn, _raw.communityId as string)) return
    const payload = _raw as unknown as { communityId: string; channelId: string; messageId: string }

    await this.messageStore.deleteMessage(payload.messageId)
    this.broadcastToCommunity(payload.communityId, {
      ...msg,
      type: 'channel.message.deleted',
      sender: conn.did
    })
  }

  private async handleChannelTyping(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as Record<string, unknown>
    if (!this.validateRequiredStrings(conn, payload, ['communityId', 'channelId'])) return
    if (!this.validateMembership(conn, payload.communityId as string)) return

    this.broadcastToCommunity(
      payload.communityId as string,
      {
        ...msg,
        type: 'channel.typing.indicator',
        sender: conn.did
      },
      conn.id
    )
  }

  private async handleReactionAdd(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as Record<string, unknown>
    if (!this.validateRequiredStrings(conn, payload, ['communityId'])) return
    if (!this.validateMembership(conn, payload.communityId as string)) return

    this.broadcastToCommunity(payload.communityId as string, {
      ...msg,
      type: 'channel.reaction.added',
      sender: conn.did
    })
  }

  private async handleReactionRemove(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as Record<string, unknown>
    if (!this.validateRequiredStrings(conn, payload, ['communityId'])) return
    if (!this.validateMembership(conn, payload.communityId as string)) return

    this.broadcastToCommunity(payload.communityId as string, {
      ...msg,
      type: 'channel.reaction.removed',
      sender: conn.did
    })
  }

  private async handleDMSend(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as Record<string, unknown>
    if (!this.validateRequiredStrings(conn, payload, ['recipientDID'])) return

    // Content length check
    if (
      typeof payload.content === 'string' &&
      !this.validateStringLength(conn, payload.content, 'content', HarmonyServer.MAX_CONTENT_LENGTH)
    )
      return

    // Find recipient connection
    for (const [_id, otherConn] of this._connections) {
      if (otherConn.did === (payload.recipientDID as string)) {
        this.sendToConnection(otherConn, {
          ...msg,
          type: 'dm.message',
          sender: conn.did
        })
      }
    }
    // Store DM
    await this.messageStore.storeMessage('dm', `${conn.did}:${payload.recipientDID}`, msg)
  }

  private async handleDMEdit(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as Record<string, unknown>
    if (!this.validateRequiredStrings(conn, payload, ['recipientDID', 'messageId'])) return

    for (const [_id, otherConn] of this._connections) {
      if (otherConn.did === (payload.recipientDID as string)) {
        this.sendToConnection(otherConn, {
          ...msg,
          type: 'dm.edited',
          sender: conn.did
        })
      }
    }
  }

  private async handleDMDelete(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as Record<string, unknown>
    if (!this.validateRequiredStrings(conn, payload, ['recipientDID', 'messageId'])) return

    for (const [_id, otherConn] of this._connections) {
      if (otherConn.did === (payload.recipientDID as string)) {
        this.sendToConnection(otherConn, {
          ...msg,
          type: 'dm.deleted',
          sender: conn.did
        })
      }
    }
  }

  private async handleDMTyping(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as Record<string, unknown>
    if (!this.validateRequiredStrings(conn, payload, ['recipientDID'])) return

    for (const [_id, otherConn] of this._connections) {
      if (otherConn.did === (payload.recipientDID as string)) {
        this.sendToConnection(otherConn, {
          ...msg,
          type: 'dm.typing.indicator',
          sender: conn.did
        })
      }
    }
  }

  private async handleDMKeyExchange(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as Record<string, unknown>
    if (!this.validateRequiredStrings(conn, payload, ['recipientDID'])) return

    for (const [_id, otherConn] of this._connections) {
      if (otherConn.did === (payload.recipientDID as string)) {
        this.sendToConnection(otherConn, {
          ...msg,
          type: 'dm.keyexchange',
          sender: conn.did
        })
      }
    }
  }

  private async handleCommunityCreate(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as Record<string, unknown>
    if (!this.validateRequiredStrings(conn, payload, ['name'])) return
    if (!this.validateStringLength(conn, payload.name, 'name', HarmonyServer.MAX_NAME_LENGTH)) return
    if (
      payload.description !== undefined &&
      !this.validateStringLength(conn, payload.description, 'description', HarmonyServer.MAX_DESCRIPTION_LENGTH)
    )
      return

    // Note: in production, the client would send a ZCAP-signed community creation.
    // For simplicity, we use the server's crypto provider to create it.
    const signingKP = (payload.creatorKeyPair as KeyPair | undefined) ?? (await this.crypto.generateSigningKeyPair())
    const result = await this.communityManager.create({
      name: payload.name,
      description: payload.description,
      creatorDID: conn.did,
      creatorKeyPair: signingKP,
      defaultChannels: payload.defaultChannels ?? ['general']
    })

    // Subscribe connection to community
    conn.communities.push(result.communityId)
    if (!this.communitySubscriptions.has(result.communityId)) {
      this.communitySubscriptions.set(result.communityId, new Set())
    }
    this.communitySubscriptions.get(result.communityId)!.add(conn.id)

    // Store the root capability for ZCAP verification
    this.capabilityStore.set(result.rootCapability.id, result.rootCapability)

    this.sendToConnection(conn, {
      id: `cc-${Date.now()}`,
      type: 'community.updated',
      timestamp: new Date().toISOString(),
      sender: 'server',
      payload: {
        communityId: result.communityId,
        rootCapability: result.rootCapability,
        membershipVC: result.membershipVC,
        channels: result.defaultChannels
      }
    })
  }

  private async handleCommunityJoin(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { communityId: string; membershipVC: VerifiableCredential }

    // Check ban list
    if (this.isUserBanned(payload.communityId, conn.did)) {
      this.sendToConnection(conn, {
        id: `ban-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'BANNED', message: 'You are banned from this community' }
      })
      conn.ws.close(4003, 'Banned')
      return
    }

    const result = await this.communityManager.join({
      communityId: payload.communityId,
      memberDID: conn.did,
      membershipVC: payload.membershipVC
    })

    conn.communities.push(payload.communityId)
    if (!this.communitySubscriptions.has(payload.communityId)) {
      this.communitySubscriptions.set(payload.communityId, new Set())
    }
    this.communitySubscriptions.get(payload.communityId)!.add(conn.id)

    this.sendToConnection(conn, {
      id: `cj-${Date.now()}`,
      type: 'community.updated',
      timestamp: new Date().toISOString(),
      sender: 'server',
      payload: { communityId: payload.communityId, channels: result.channels, members: result.members }
    })

    // Broadcast join to existing members
    this.broadcastToCommunity(
      payload.communityId,
      {
        id: `cmj-${Date.now()}`,
        type: 'community.member.joined',
        timestamp: new Date().toISOString(),
        sender: conn.did,
        payload: { communityId: payload.communityId, memberDID: conn.did }
      },
      conn.id
    )
  }

  private async handleCommunityUpdate(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { communityId: string; name?: string; description?: string }

    // Admin check
    if (!(await this.isAdmin(payload.communityId, conn.did))) {
      this.sendToConnection(conn, {
        id: `err-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'FORBIDDEN', message: 'Only admins can update community settings' }
      })
      return
    }

    // Update name/description in RDF store
    if (payload.name) {
      const existingName = await this.store.match({ subject: payload.communityId, predicate: HarmonyPredicate.name })
      for (const q of existingName) await this.store.remove(q)
      await this.store.add({
        subject: payload.communityId,
        predicate: HarmonyPredicate.name,
        object: payload.name,
        graph: payload.communityId
      })
    }
    if (payload.description !== undefined) {
      const existingDesc = await this.store.match({
        subject: payload.communityId,
        predicate: HarmonyPredicate.description
      })
      for (const q of existingDesc) await this.store.remove(q)
      await this.store.add({
        subject: payload.communityId,
        predicate: HarmonyPredicate.description,
        object: payload.description,
        graph: payload.communityId
      })
    }

    // Broadcast update to community
    this.broadcastToCommunity(payload.communityId, {
      id: `cu-${Date.now()}`,
      type: 'community.updated',
      timestamp: new Date().toISOString(),
      sender: conn.did,
      payload: { communityId: payload.communityId, name: payload.name, description: payload.description }
    })
  }

  private async handleCommunityLeave(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { communityId: string }
    await this.communityManager.leave(payload.communityId, conn.did)
    conn.communities = conn.communities.filter((c) => c !== payload.communityId)
    this.communitySubscriptions.get(payload.communityId)?.delete(conn.id)

    this.broadcastToCommunity(payload.communityId, {
      id: `cml-${Date.now()}`,
      type: 'community.member.left',
      timestamp: new Date().toISOString(),
      sender: conn.did,
      payload: { communityId: payload.communityId, memberDID: conn.did }
    })
  }

  // ── Ban Management ──

  private isUserBanned(communityId: string, did: string): boolean {
    return this.bannedUsers.get(communityId)?.has(did) ?? false
  }

  private async isAdmin(communityId: string, did: string): Promise<boolean> {
    const info = await this.communityManager.getInfo(communityId)
    if (!info) return false
    if (info.creatorDID === did) return true
    // Check for admin role in member quads
    const members = await this.communityManager.getMembers(communityId)
    const member = members.find((m) => m.did === did)
    return member?.roles.includes('admin') ?? false
  }

  private async handleCommunityBan(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { communityId: string; targetDID: string; reason?: string }

    // Admin check
    if (!(await this.isAdmin(payload.communityId, conn.did))) {
      this.sendToConnection(conn, {
        id: `err-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'FORBIDDEN', message: 'Only admins can ban users' }
      })
      return
    }

    // Cannot ban yourself
    if (payload.targetDID === conn.did) {
      this.sendToConnection(conn, {
        id: `err-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'INVALID', message: 'Cannot ban yourself' }
      })
      return
    }

    // Add to ban list
    if (!this.bannedUsers.has(payload.communityId)) {
      this.bannedUsers.set(payload.communityId, new Set())
    }
    this.bannedUsers.get(payload.communityId)!.add(payload.targetDID)

    // Confirm ban to admin
    this.sendToConnection(conn, {
      id: `ban-ok-${Date.now()}`,
      type: 'community.ban.applied',
      timestamp: new Date().toISOString(),
      sender: 'server',
      payload: { communityId: payload.communityId, targetDID: payload.targetDID }
    })

    // Disconnect banned user if currently connected
    for (const [connId, otherConn] of this._connections) {
      if (otherConn.did === payload.targetDID && otherConn.communities.includes(payload.communityId)) {
        this.sendToConnection(otherConn, {
          id: `banned-${Date.now()}`,
          type: 'error',
          timestamp: new Date().toISOString(),
          sender: 'server',
          payload: { code: 'BANNED', message: 'You are banned from this community' }
        })
        // Remove from community subscriptions
        otherConn.communities = otherConn.communities.filter((c) => c !== payload.communityId)
        this.communitySubscriptions.get(payload.communityId)?.delete(connId)
        otherConn.ws.close(4003, 'Banned')
      }
    }
  }

  private async handleCommunityUnban(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { communityId: string; targetDID: string }

    // Admin check
    if (!(await this.isAdmin(payload.communityId, conn.did))) {
      this.sendToConnection(conn, {
        id: `err-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'FORBIDDEN', message: 'Only admins can unban users' }
      })
      return
    }

    // Remove from ban list
    this.bannedUsers.get(payload.communityId)?.delete(payload.targetDID)

    // Confirm unban
    this.sendToConnection(conn, {
      id: `unban-ok-${Date.now()}`,
      type: 'community.unban.applied',
      timestamp: new Date().toISOString(),
      sender: 'server',
      payload: { communityId: payload.communityId, targetDID: payload.targetDID }
    })
  }

  private async handleCommunityKick(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { communityId: string; targetDID: string; reason?: string }

    // Admin check
    if (!(await this.isAdmin(payload.communityId, conn.did))) {
      this.sendToConnection(conn, {
        id: `err-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'FORBIDDEN', message: 'Only admins can kick users' }
      })
      return
    }

    if (payload.targetDID === conn.did) {
      this.sendToConnection(conn, {
        id: `err-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'INVALID', message: 'Cannot kick yourself' }
      })
      return
    }

    // Remove member from community (but don't ban — they can rejoin)
    await this.communityManager.leave(payload.communityId, payload.targetDID)

    // Broadcast kick
    this.broadcastToCommunity(payload.communityId, {
      id: `kick-${Date.now()}`,
      type: 'member.kicked',
      timestamp: new Date().toISOString(),
      sender: conn.did,
      payload: { communityId: payload.communityId, targetDID: payload.targetDID, reason: payload.reason }
    })

    // Disconnect kicked user if currently connected
    for (const [connId, otherConn] of this._connections) {
      if (otherConn.did === payload.targetDID && otherConn.communities.includes(payload.communityId)) {
        this.sendToConnection(otherConn, {
          id: `kicked-${Date.now()}`,
          type: 'error',
          timestamp: new Date().toISOString(),
          sender: 'server',
          payload: { code: 'KICKED', message: payload.reason ?? 'You have been kicked from this community' }
        })
        otherConn.communities = otherConn.communities.filter((c) => c !== payload.communityId)
        this.communitySubscriptions.get(payload.communityId)?.delete(connId)
      }
    }
  }

  private async handleChannelCreate(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as {
      communityId: string
      name: string
      type: 'text' | 'voice' | 'announcement'
      topic?: string
    }
    const channel = await this.communityManager.createChannel(payload.communityId, {
      name: payload.name,
      type: payload.type,
      topic: payload.topic
    })

    this.broadcastToCommunity(payload.communityId, {
      id: `chc-${Date.now()}`,
      type: 'channel.created',
      timestamp: new Date().toISOString(),
      sender: conn.did,
      payload: channel
    })
  }

  private async handleChannelUpdate(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { communityId: string; channelId: string; name?: string; topic?: string }
    await this.communityManager.updateChannel(payload.communityId, payload.channelId, {
      name: payload.name,
      topic: payload.topic
    })

    this.broadcastToCommunity(payload.communityId, {
      ...msg,
      type: 'channel.updated',
      sender: conn.did
    })
  }

  private async handleChannelDeleteAdmin(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { communityId: string; channelId: string }
    await this.communityManager.deleteChannel(payload.communityId, payload.channelId)

    this.broadcastToCommunity(payload.communityId, {
      ...msg,
      type: 'channel.deleted',
      sender: conn.did
    })
  }

  private async handleMemberUpdate(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { displayName?: string }
    if (payload.displayName) {
      conn.displayName = payload.displayName

      // Store display name in quad store for each community this member belongs to
      for (const communityId of conn.communities) {
        const memberSubject = `${communityId}:member:${conn.did}`
        // Remove existing name quads
        const existingNames = await this.config.store.match({
          subject: memberSubject,
          predicate: HarmonyPredicate.name,
          graph: communityId
        })
        if (existingNames.length) {
          for (const q of existingNames) await this.config.store.remove(q)
        }
        // Add new name quad
        await this.config.store.addAll([
          { subject: memberSubject, predicate: HarmonyPredicate.name, object: payload.displayName, graph: communityId }
        ])

        // Broadcast to community
        this.broadcastToCommunity(
          communityId,
          {
            id: `member-update-${Date.now()}`,
            type: 'community.member.updated',
            timestamp: new Date().toISOString(),
            sender: conn.did,
            payload: { did: conn.did, displayName: payload.displayName }
          },
          conn.id
        )
      }
    }
  }

  private async handlePresenceUpdate(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as PresenceUpdatePayload
    conn.presence = payload

    for (const communityId of conn.communities) {
      this.broadcastToCommunity(
        communityId,
        {
          id: `pres-${Date.now()}`,
          type: 'presence.changed',
          timestamp: new Date().toISOString(),
          sender: conn.did,
          payload
        },
        conn.id
      )
    }
  }

  private async handleCommunityList(conn: ServerConnection, _msg: ProtocolMessage): Promise<void> {
    const infos = await this.communityManager.listAll()
    const communities = await Promise.all(
      infos.map(async (info) => {
        const channels = await this.communityManager.getChannels(info.id)
        return { ...info, channels: channels.map((ch) => ({ id: ch.id, name: ch.name, type: ch.type })) }
      })
    )
    this.sendToConnection(conn, {
      id: `list-${Date.now()}`,
      type: 'community.list.response' as any,
      timestamp: new Date().toISOString(),
      sender: 'server',
      payload: { communities }
    })
  }

  private async handleCommunityInfo(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { communityId: string }
    const info = await this.communityManager.getInfo(payload.communityId)

    // Gather all members from quad store (imported members)
    const allMembers: Array<{ did: string; displayName: string; status: string; linked: boolean }> = []
    const memberQuads = await this.config.store.match({
      predicate: RDFPredicate.type,
      object: HarmonyType.Member,
      graph: payload.communityId
    })
    for (const mq of memberQuads) {
      // Get the actual DID from the author quad
      const authorQuads = await this.config.store.match({
        subject: mq.subject,
        predicate: HarmonyPredicate.author,
        graph: payload.communityId
      })
      const memberDid = authorQuads.length
        ? typeof authorQuads[0].object === 'string'
          ? authorQuads[0].object
          : authorQuads[0].object.value
        : mq.subject

      const nameQuads = await this.config.store.match({
        subject: mq.subject,
        predicate: HarmonyPredicate.name,
        graph: payload.communityId
      })
      const displayName = nameQuads.length
        ? typeof nameQuads[0].object === 'string'
          ? nameQuads[0].object
          : nameQuads[0].object.value
        : memberDid
      // Members with harmony:member: prefix are unlinked (imported from Discord, no real DID yet)
      const linked = !mq.subject.startsWith('harmony:member:')
      allMembers.push({ did: memberDid, displayName, status: 'offline', linked })
    }

    // Update online presence from connected members
    const connIds = this.communitySubscriptions.get(payload.communityId)
    const onlineDids = new Set<string>()
    if (connIds) {
      for (const cid of connIds) {
        const c = this._connections.get(cid)
        if (c) {
          onlineDids.add(c.did)
          const existing = allMembers.find((m) => m.did === c.did)
          if (existing) {
            existing.status = c.presence?.status ?? 'online'
          } else {
            allMembers.push({
              did: c.did,
              displayName: c.displayName || c.did,
              status: c.presence?.status ?? 'online',
              linked: true
            })
          }
        }
      }
    }

    this.sendToConnection(conn, {
      id: `info-${Date.now()}`,
      type: 'community.info.response',
      timestamp: new Date().toISOString(),
      sender: 'server',
      payload: {
        communityId: payload.communityId,
        info: info ?? null,
        members: allMembers,
        onlineMembers: allMembers.filter((m) => m.status !== 'offline')
      }
    })
  }

  private async handleSyncRequest(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { communityId: string; channelId: string; clock?: LamportClock; limit?: number }

    // Ensure connection is subscribed to this community
    if (payload.communityId && !conn.communities.includes(payload.communityId)) {
      conn.communities.push(payload.communityId)
    }
    if (payload.communityId) {
      if (!this.communitySubscriptions.has(payload.communityId)) {
        this.communitySubscriptions.set(payload.communityId, new Set())
      }
      this.communitySubscriptions.get(payload.communityId)!.add(conn.id)
    }

    const messages = await this.messageStore.getHistory({
      communityId: payload.communityId,
      channelId: payload.channelId,
      after: payload.clock,
      limit: payload.limit ?? 50
    })

    const latestClock: LamportClock =
      messages.length > 0
        ? ((messages[messages.length - 1].payload as { clock?: LamportClock })?.clock ?? { counter: 0, authorDID: '' })
        : { counter: 0, authorDID: '' }

    this.sendToConnection(conn, {
      id: `sync-${Date.now()}`,
      type: 'sync.response',
      timestamp: new Date().toISOString(),
      sender: 'server',
      payload: {
        communityId: payload.communityId,
        channelId: payload.channelId,
        messages,
        hasMore: messages.length >= (payload.limit ?? 50),
        latestClock
      }
    })
  }

  private async verifyZCAPProof(msg: ProtocolMessage): Promise<boolean> {
    if (!msg.proof) return false

    const { capabilityId, capabilityChain, invocation } = msg.proof as {
      capabilityId?: string
      capabilityChain?: string[]
      invocation?: import('@harmony/zcap').Invocation
    }
    if (!capabilityId || !invocation) return false

    // Build capability chain from stored capabilities
    const chainIds = capabilityChain || [capabilityId]
    const capabilities = this.resolveCapabilityChain(chainIds)
    if (capabilities.length === 0) return false

    // Use the real ZCAPService verification
    const result = await this.zcapService.verifyInvocation(
      invocation,
      capabilities,
      async (did: string) => this.resolveDID(did),
      this.config.revocationStore
    )

    return result.valid
  }

  private resolveCapabilityChain(chainIds: string[]): Capability[] {
    const capabilities: Capability[] = []
    for (const id of chainIds) {
      const cap = this.capabilityStore.get(id)
      if (cap) capabilities.push(cap)
    }
    return capabilities
  }

  private async resolveDID(did: string): Promise<DIDDocument | null> {
    // Try the configured DID resolver first
    try {
      const doc = await this.config.didResolver(did)
      if (doc) return doc
    } catch {
      // Fall through to manual resolution
    }

    // For did:key, construct a minimal DID document
    if (did.startsWith('did:key:')) {
      const multibaseKey = did.replace('did:key:', '')
      return {
        '@context': ['https://www.w3.org/ns/did/v1'],
        id: did,
        verificationMethod: [
          {
            id: `${did}#${multibaseKey}`,
            type: 'Ed25519VerificationKey2020',
            controller: did,
            publicKeyMultibase: multibaseKey
          }
        ],
        authentication: [`${did}#${multibaseKey}`],
        assertionMethod: [`${did}#${multibaseKey}`],
        capabilityDelegation: [`${did}#${multibaseKey}`],
        capabilityInvocation: [`${did}#${multibaseKey}`],
        keyAgreement: []
      } as DIDDocument
    }

    return null
  }

  storeCapability(cap: Capability): void {
    this.capabilityStore.set(cap.id, cap)
  }

  getCapability(id: string): Capability | undefined {
    return this.capabilityStore.get(id)
  }

  // ── MLS / E2EE Handlers ──

  private async handleMLSKeyPackageUpload(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { keyPackage: unknown }
    const serialized = new TextEncoder().encode(serialise(payload.keyPackage))
    if (!this.keyPackages.has(conn.did)) {
      this.keyPackages.set(conn.did, [])
    }
    this.keyPackages.get(conn.did)!.push(serialized)

    // Notify E2EE group creators that this member has a key package ready
    for (const [, groupMeta] of this.e2eeGroups) {
      // Check if the uploader is NOT the creator (creator doesn't need to add themselves)
      if (groupMeta.creatorDID === conn.did) continue

      // Check if this member is in the community
      const memberCommunities = conn.communities ?? []
      if (!memberCommunities.includes(groupMeta.communityId)) continue

      // Send mls.member.joined to the group creator
      for (const [, otherConn] of this._connections) {
        if (otherConn.did === groupMeta.creatorDID) {
          this.sendToConnection(otherConn, {
            id: `mls-mj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'mls.member.joined' as ProtocolMessage['type'],
            timestamp: new Date().toISOString(),
            sender: conn.did,
            payload: {
              communityId: groupMeta.communityId,
              channelId: groupMeta.channelId,
              groupId: groupMeta.groupId,
              memberDID: conn.did
            }
          })
        }
      }
    }
  }

  private async handleMLSKeyPackageFetch(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { dids: string[] }
    const result: Record<string, unknown[]> = {}
    for (const did of payload.dids) {
      const packages = this.keyPackages.get(did) ?? []
      result[did] = packages.map((p) => deserialise(new TextDecoder().decode(p)))
    }
    this.sendToConnection(conn, {
      id: `mls-kp-${Date.now()}`,
      type: 'mls.keypackage.response' as ProtocolMessage['type'],
      timestamp: new Date().toISOString(),
      sender: 'server',
      payload: { keyPackages: result }
    })
  }

  private async handleMLSWelcome(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { recipientDID: string; communityId?: string }
    // Forward welcome to the specific recipient
    for (const [, otherConn] of this._connections) {
      if (otherConn.did === payload.recipientDID) {
        this.sendToConnection(otherConn, {
          id: msg.id,
          type: 'mls.welcome' as ProtocolMessage['type'],
          timestamp: msg.timestamp,
          sender: conn.did,
          payload: msg.payload
        })
      }
    }
  }

  private async handleMLSCommit(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { communityId?: string; channelId?: string }
    if (payload.communityId) {
      // Broadcast commit to all community members except sender
      this.broadcastToCommunity(
        payload.communityId,
        {
          id: msg.id,
          type: 'mls.commit' as ProtocolMessage['type'],
          timestamp: msg.timestamp,
          sender: conn.did,
          payload: msg.payload
        },
        conn.id
      )
    }
  }

  private async handleMLSGroupSetup(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { communityId?: string; channelId?: string; groupId?: string }
    if (payload.communityId) {
      // Track E2EE group metadata
      if (payload.groupId) {
        this.e2eeGroups.set(payload.groupId, {
          creatorDID: conn.did,
          communityId: payload.communityId,
          channelId: payload.channelId ?? '',
          groupId: payload.groupId
        })
      }
      this.broadcastToCommunity(
        payload.communityId,
        {
          id: msg.id,
          type: 'mls.group.setup' as ProtocolMessage['type'],
          timestamp: msg.timestamp,
          sender: conn.did,
          payload: msg.payload
        },
        conn.id
      )
    }
  }

  // ── Voice Handlers ──

  private async handleVoiceJoin(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { channelId: string }
    const channelId = payload.channelId
    if (!this.voiceChannelParticipants.has(channelId)) {
      this.voiceChannelParticipants.set(channelId, new Set())
    }
    this.voiceChannelParticipants.get(channelId)!.add(conn.id)
    this.voiceParticipantState.set(conn.id, {
      muted: false,
      deafened: false,
      videoEnabled: false,
      screenSharing: false
    })

    // Broadcast to all in channel that this user joined
    this.broadcastVoiceState(channelId, conn.did, 'voice.participant.joined')

    // Send current voice state to the joining user
    const participants = this.getVoiceChannelParticipants(channelId)
    const participantDetails = this.getVoiceChannelParticipantDetails(channelId)
    this.sendToConnection(conn, {
      id: `vs-${Date.now()}`,
      type: 'voice.state',
      timestamp: new Date().toISOString(),
      sender: 'server',
      payload: { channelId, participants, participantDetails }
    })
  }

  private async handleVoiceLeave(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { channelId: string }
    const channelId = payload.channelId
    const participants = this.voiceChannelParticipants.get(channelId)
    if (participants) {
      participants.delete(conn.id)
      this.voiceParticipantState.delete(conn.id)
      if (participants.size === 0) {
        this.voiceChannelParticipants.delete(channelId)
      }
    }
    this.broadcastVoiceState(channelId, conn.did, 'voice.participant.left')
  }

  private async handleVoiceSignaling(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { targetDID: string; channelId: string }
    // Forward signaling message to the target peer
    for (const [, otherConn] of this._connections) {
      if (otherConn.did === payload.targetDID) {
        this.sendToConnection(otherConn, {
          id: msg.id,
          type: msg.type,
          timestamp: msg.timestamp,
          sender: conn.did,
          payload: msg.payload
        })
      }
    }
  }

  private broadcastVoiceState(
    channelId: string,
    did: string,
    type: 'voice.participant.joined' | 'voice.participant.left'
  ): void {
    const participants = this.voiceChannelParticipants.get(channelId)
    if (!participants) return
    const participantList = this.getVoiceChannelParticipants(channelId)
    const msg: ProtocolMessage = {
      id: `vs-${Date.now()}`,
      type,
      timestamp: new Date().toISOString(),
      sender: did,
      payload: { channelId, did, participants: participantList }
    }
    for (const connId of participants) {
      const conn = this._connections.get(connId)
      if (conn) this.sendToConnection(conn, msg)
    }
  }

  private getVoiceChannelParticipants(channelId: string): string[] {
    const connIds = this.voiceChannelParticipants.get(channelId)
    if (!connIds) return []
    const dids: string[] = []
    for (const connId of connIds) {
      const conn = this._connections.get(connId)
      if (conn) dids.push(conn.did)
    }
    return dids
  }

  private getVoiceChannelParticipantDetails(
    channelId: string
  ): Array<{ did: string; muted: boolean; deafened: boolean; videoEnabled: boolean; screenSharing: boolean }> {
    const connIds = this.voiceChannelParticipants.get(channelId)
    if (!connIds) return []
    const result: Array<{
      did: string
      muted: boolean
      deafened: boolean
      videoEnabled: boolean
      screenSharing: boolean
    }> = []
    for (const connId of connIds) {
      const conn = this._connections.get(connId)
      const state = this.voiceParticipantState.get(connId)
      if (conn) {
        result.push({
          did: conn.did,
          muted: state?.muted ?? false,
          deafened: state?.deafened ?? false,
          videoEnabled: state?.videoEnabled ?? false,
          screenSharing: state?.screenSharing ?? false
        })
      }
    }
    return result
  }

  private findVoiceChannelForConn(connId: string): string | null {
    for (const [channelId, participants] of this.voiceChannelParticipants) {
      if (participants.has(connId)) return channelId
    }
    return null
  }

  private broadcastVoiceUpdate(channelId: string, senderDid: string, updatePayload: Record<string, unknown>): void {
    const participants = this.voiceChannelParticipants.get(channelId)
    if (!participants) return
    const msg: ProtocolMessage = {
      id: `vs-${Date.now()}`,
      type: 'voice.state' as ProtocolMessage['type'],
      timestamp: new Date().toISOString(),
      sender: senderDid,
      payload: { channelId, ...updatePayload, participants: this.getVoiceChannelParticipantDetails(channelId) }
    }
    for (const connId of participants) {
      const conn = this._connections.get(connId)
      if (conn) this.sendToConnection(conn, msg)
    }
  }

  private async handleVoiceMuteToggle(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const channelId = this.findVoiceChannelForConn(conn.id)
    if (!channelId) return
    const state = this.voiceParticipantState.get(conn.id)
    if (!state) return
    state.muted = msg.type === 'voice.mute'
    this.broadcastVoiceUpdate(channelId, conn.did, { action: msg.type, did: conn.did })
  }

  private async handleVoiceVideo(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const channelId = this.findVoiceChannelForConn(conn.id)
    if (!channelId) return
    const state = this.voiceParticipantState.get(conn.id)
    if (!state) return
    const payload = msg.payload as { enabled: boolean }
    state.videoEnabled = payload.enabled
    this.broadcastVoiceUpdate(channelId, conn.did, {
      action: 'voice.video',
      did: conn.did,
      videoEnabled: payload.enabled
    })
  }

  private async handleVoiceScreen(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const channelId = this.findVoiceChannelForConn(conn.id)
    if (!channelId) return
    const state = this.voiceParticipantState.get(conn.id)
    if (!state) return
    const payload = msg.payload as { sharing: boolean }
    state.screenSharing = payload.sharing
    this.broadcastVoiceUpdate(channelId, conn.did, {
      action: 'voice.screen',
      did: conn.did,
      screenSharing: payload.sharing
    })
  }

  private async handleVoiceSpeaking(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const channelId = this.findVoiceChannelForConn(conn.id)
    if (!channelId) return
    const payload = msg.payload as { speaking: boolean }
    const participants = this.voiceChannelParticipants.get(channelId)
    if (!participants) return
    const speakingMsg: ProtocolMessage = {
      id: `vs-${Date.now()}`,
      type: 'voice.speaking' as ProtocolMessage['type'],
      timestamp: new Date().toISOString(),
      sender: conn.did,
      payload: { channelId, did: conn.did, speaking: payload.speaking }
    }
    for (const connId of participants) {
      if (connId === conn.id) continue // don't echo back to sender
      const c = this._connections.get(connId)
      if (c) this.sendToConnection(c, speakingMsg)
    }
  }

  private async handleVoiceToken(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { channelId: string }

    if (this.sfuAdapter) {
      // Real SFU mode — create room if needed, generate real token
      if (!this.sfuRooms.has(payload.channelId)) {
        await this.sfuAdapter.createRoom(payload.channelId, {})
        this.sfuRooms.add(payload.channelId)
      }
      const token = await this.sfuAdapter.generateToken(payload.channelId, conn.did, { did: conn.did })
      this.sendToConnection(conn, {
        id: `vt-${Date.now()}`,
        type: 'voice.token.response' as ProtocolMessage['type'],
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { channelId: payload.channelId, token, mode: 'sfu' }
      })
    } else {
      // No SFU — generate a basic signaling-only token
      const token = Buffer.from(
        JSON.stringify({
          room: payload.channelId,
          participant: conn.did,
          iat: Date.now()
        })
      ).toString('base64')
      this.sendToConnection(conn, {
        id: `vt-${Date.now()}`,
        type: 'voice.token.response' as ProtocolMessage['type'],
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { channelId: payload.channelId, token, mode: 'signaling' }
      })
    }
  }

  private async handleVoiceTransportConnect(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { channelId: string; dtlsParameters: unknown }
    if (!this.sfuAdapter || !('connectTransport' in this.sfuAdapter)) {
      this.sendToConnection(conn, {
        id: `err-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'NO_SFU', message: 'SFU adapter does not support transport connect' }
      })
      return
    }
    try {
      await (this.sfuAdapter as any).connectTransport(payload.channelId, conn.did, payload.dtlsParameters)
      this.sendToConnection(conn, {
        id: `vtc-${Date.now()}`,
        type: 'voice.transport.connected' as ProtocolMessage['type'],
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { channelId: payload.channelId }
      })
    } catch (err) {
      this.sendToConnection(conn, {
        id: `err-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'TRANSPORT_CONNECT_FAILED', message: String(err) }
      })
    }
  }

  private async handleVoiceProduce(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { channelId: string; kind: 'audio' | 'video'; rtpParameters: unknown }
    if (!this.sfuAdapter || !('produce' in this.sfuAdapter)) {
      this.sendToConnection(conn, {
        id: `err-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'NO_SFU', message: 'SFU adapter does not support produce' }
      })
      return
    }
    try {
      const producerId = await (this.sfuAdapter as any).produce(
        payload.channelId,
        conn.did,
        payload.rtpParameters,
        payload.kind
      )
      this.sendToConnection(conn, {
        id: `vp-${Date.now()}`,
        type: 'voice.produced' as ProtocolMessage['type'],
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { channelId: payload.channelId, producerId, kind: payload.kind }
      })

      // Notify other participants about the new producer so they can consume
      const participants = this.voiceChannelParticipants.get(payload.channelId)
      if (participants) {
        for (const connId of participants) {
          if (connId === conn.id) continue
          const otherConn = this._connections.get(connId)
          if (otherConn) {
            this.sendToConnection(otherConn, {
              id: `vnp-${Date.now()}`,
              type: 'voice.new-producer' as ProtocolMessage['type'],
              timestamp: new Date().toISOString(),
              sender: conn.did,
              payload: { channelId: payload.channelId, producerId, kind: payload.kind, producerDid: conn.did }
            })
          }
        }
      }
    } catch (err) {
      this.sendToConnection(conn, {
        id: `err-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'PRODUCE_FAILED', message: String(err) }
      })
    }
  }

  private async handleVoiceConsume(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { channelId: string; producerId: string; rtpCapabilities: unknown }
    if (!this.sfuAdapter || !('consume' in this.sfuAdapter)) {
      this.sendToConnection(conn, {
        id: `err-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'NO_SFU', message: 'SFU adapter does not support consume' }
      })
      return
    }
    try {
      const result = await (this.sfuAdapter as any).consume(
        payload.channelId,
        conn.did,
        payload.producerId,
        payload.rtpCapabilities
      )
      this.sendToConnection(conn, {
        id: `vc-${Date.now()}`,
        type: 'voice.consumed' as ProtocolMessage['type'],
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: {
          channelId: payload.channelId,
          consumerId: result.consumerId,
          producerId: result.producerId,
          kind: result.kind,
          rtpParameters: result.rtpParameters
        }
      })
    } catch (err) {
      this.sendToConnection(conn, {
        id: `err-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'CONSUME_FAILED', message: String(err) }
      })
    }
  }

  private async handleVoiceConsumerResume(_conn: ServerConnection, _msg: ProtocolMessage): Promise<void> {
    // Consumer resume is a client-side operation; server acknowledges
    // In a full implementation, this would resume the server-side consumer
  }

  private async handleReconciliation(_conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as {
      did: string
      reconciledCommunities: string[]
    }
    // For each reconciled community, auto-join the user
    for (const communityId of payload.reconciledCommunities) {
      await this.autoJoinCommunity(payload.did, communityId)
    }
  }

  private async handleThreadCreate(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as {
      communityId: string
      channelId: string
      parentMessageId: string
      name: string
      content: unknown
      clock: LamportClock
    }

    const threadId = msg.id
    const thread: ThreadState = {
      threadId,
      parentMessageId: payload.parentMessageId,
      channelId: payload.channelId,
      communityId: payload.communityId,
      name: payload.name,
      creatorDID: conn.did,
      createdAt: msg.timestamp,
      messageCount: 1
    }
    this._threads.set(threadId, thread)

    this.broadcastToCommunity(payload.communityId, {
      id: msg.id,
      type: 'thread.created',
      timestamp: msg.timestamp,
      sender: conn.did,
      payload: {
        threadId,
        parentMessageId: payload.parentMessageId,
        channelId: payload.channelId,
        communityId: payload.communityId,
        name: payload.name,
        creatorDID: conn.did,
        content: payload.content,
        clock: payload.clock
      }
    })
  }

  private async handleThreadSend(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as {
      threadId: string
      content: unknown
      nonce: string
      replyTo?: string
      clock: LamportClock
    }

    const thread = this._threads.get(payload.threadId)
    if (!thread) {
      this.sendToConnection(conn, {
        id: `err-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'THREAD_NOT_FOUND', message: 'Thread not found' }
      })
      return
    }

    thread.messageCount++

    this.broadcastToCommunity(thread.communityId, {
      id: msg.id,
      type: 'thread.message',
      timestamp: msg.timestamp,
      sender: conn.did,
      payload: {
        threadId: payload.threadId,
        content: payload.content,
        nonce: payload.nonce,
        replyTo: payload.replyTo,
        clock: payload.clock,
        messageCount: thread.messageCount
      }
    })
  }

  /** Auto-join a user to a community after reconciliation (ghost → real DID) */
  async autoJoinCommunity(did: string, communityId: string): Promise<void> {
    // Add as a real member
    const info = await this.communityManager.getInfo(communityId)
    const channels = await this.communityManager.getChannels(communityId)

    // Subscribe any connected WebSocket for this DID
    for (const [connId, conn] of this._connections) {
      if (conn.did === did) {
        if (!conn.communities.includes(communityId)) {
          conn.communities.push(communityId)
        }
        if (!this.communitySubscriptions.has(communityId)) {
          this.communitySubscriptions.set(communityId, new Set())
        }
        this.communitySubscriptions.get(communityId)!.add(connId)

        // Send auto-joined message
        this.sendToConnection(conn, {
          id: `auto-join-${Date.now()}`,
          type: 'community.auto-joined' as ProtocolMessage['type'],
          timestamp: new Date().toISOString(),
          sender: 'server',
          payload: {
            communityId,
            communityName: info?.name ?? 'Community',
            description: info?.description,
            channels: channels.map((ch) => ({ id: ch.id, name: ch.name, type: ch.type }))
          }
        })
      }
    }
  }

  // ── Role Handlers ──

  private hasPermission(conn: ServerConnection, communityId: string, action: string): boolean {
    // Check if admin (community creator or admin role)
    // We do a synchronous check here using member roles
    const memberRoleIds = this.memberRoles.get(communityId)?.get(conn.did)
    if (memberRoleIds) {
      const communityRoles = this.roles.get(communityId)
      if (communityRoles) {
        for (const roleId of memberRoleIds) {
          const role = communityRoles.get(roleId)
          if (role && role.permissions.includes(action)) return true
        }
      }
    }
    return false
  }

  private async handleRoleCreate(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as {
      communityId: string
      name: string
      color?: string
      permissions: string[]
      position: number
    }

    if (!(await this.isAdmin(payload.communityId, conn.did))) {
      this.sendToConnection(conn, {
        id: `err-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'FORBIDDEN', message: 'Only admins can create roles' }
      })
      return
    }

    const roleId = 'role:' + Array.from(randomBytes(8), (b) => b.toString(16).padStart(2, '0')).join('')
    const role: Role = {
      id: roleId,
      communityId: payload.communityId,
      name: payload.name,
      color: payload.color,
      permissions: payload.permissions,
      position: payload.position,
      createdBy: conn.did
    }

    if (!this.roles.has(payload.communityId)) {
      this.roles.set(payload.communityId, new Map())
    }
    this.roles.get(payload.communityId)!.set(roleId, role)

    this.broadcastToCommunity(payload.communityId, {
      id: `rc-${Date.now()}`,
      type: 'role.created',
      timestamp: new Date().toISOString(),
      sender: conn.did,
      payload: role
    })
  }

  private async handleRoleUpdate(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as {
      communityId: string
      roleId: string
      name?: string
      color?: string
      permissions?: string[]
      position?: number
    }

    if (!(await this.isAdmin(payload.communityId, conn.did))) {
      this.sendToConnection(conn, {
        id: `err-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'FORBIDDEN', message: 'Only admins can update roles' }
      })
      return
    }

    const communityRoles = this.roles.get(payload.communityId)
    const role = communityRoles?.get(payload.roleId)
    if (!role) {
      this.sendToConnection(conn, {
        id: `err-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'NOT_FOUND', message: 'Role not found' }
      })
      return
    }

    if (payload.name !== undefined) role.name = payload.name
    if (payload.color !== undefined) role.color = payload.color
    if (payload.permissions !== undefined) role.permissions = payload.permissions
    if (payload.position !== undefined) role.position = payload.position

    this.broadcastToCommunity(payload.communityId, {
      id: `ru-${Date.now()}`,
      type: 'role.updated',
      timestamp: new Date().toISOString(),
      sender: conn.did,
      payload: role
    })
  }

  private async handleRoleDelete(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { communityId: string; roleId: string }

    if (!(await this.isAdmin(payload.communityId, conn.did))) {
      this.sendToConnection(conn, {
        id: `err-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'FORBIDDEN', message: 'Only admins can delete roles' }
      })
      return
    }

    const communityRoles = this.roles.get(payload.communityId)
    if (!communityRoles?.has(payload.roleId)) {
      this.sendToConnection(conn, {
        id: `err-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'NOT_FOUND', message: 'Role not found' }
      })
      return
    }

    communityRoles.delete(payload.roleId)

    // Remove role from all members
    const communityMembers = this.memberRoles.get(payload.communityId)
    if (communityMembers) {
      for (const [, memberRoleSet] of communityMembers) {
        memberRoleSet.delete(payload.roleId)
      }
    }

    this.broadcastToCommunity(payload.communityId, {
      id: `rd-${Date.now()}`,
      type: 'role.deleted',
      timestamp: new Date().toISOString(),
      sender: conn.did,
      payload: { communityId: payload.communityId, roleId: payload.roleId }
    })
  }

  private async handleRoleAssign(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { communityId: string; memberDID: string; roleId: string }

    if (!(await this.isAdmin(payload.communityId, conn.did))) {
      this.sendToConnection(conn, {
        id: `err-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'FORBIDDEN', message: 'Only admins can assign roles' }
      })
      return
    }

    // Verify role exists
    const communityRoles = this.roles.get(payload.communityId)
    if (!communityRoles?.has(payload.roleId)) {
      this.sendToConnection(conn, {
        id: `err-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'NOT_FOUND', message: 'Role not found' }
      })
      return
    }

    if (!this.memberRoles.has(payload.communityId)) {
      this.memberRoles.set(payload.communityId, new Map())
    }
    const communityMembers = this.memberRoles.get(payload.communityId)!
    if (!communityMembers.has(payload.memberDID)) {
      communityMembers.set(payload.memberDID, new Set())
    }
    communityMembers.get(payload.memberDID)!.add(payload.roleId)

    this.broadcastToCommunity(payload.communityId, {
      id: `ra-${Date.now()}`,
      type: 'community.member.updated',
      timestamp: new Date().toISOString(),
      sender: conn.did,
      payload: {
        communityId: payload.communityId,
        did: payload.memberDID,
        roleId: payload.roleId,
        action: 'role.assigned'
      }
    })
  }

  private async handleRoleRemove(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { communityId: string; memberDID: string; roleId: string }

    if (!(await this.isAdmin(payload.communityId, conn.did))) {
      this.sendToConnection(conn, {
        id: `err-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'FORBIDDEN', message: 'Only admins can remove roles' }
      })
      return
    }

    const communityMembers = this.memberRoles.get(payload.communityId)
    communityMembers?.get(payload.memberDID)?.delete(payload.roleId)

    this.broadcastToCommunity(payload.communityId, {
      id: `rr-${Date.now()}`,
      type: 'community.member.updated',
      timestamp: new Date().toISOString(),
      sender: conn.did,
      payload: {
        communityId: payload.communityId,
        did: payload.memberDID,
        roleId: payload.roleId,
        action: 'role.removed'
      }
    })
  }

  // ── Pin Handlers ──

  private async handleChannelPin(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { communityId: string; channelId: string; messageId: string }

    if (
      !(await this.isAdmin(payload.communityId, conn.did)) &&
      !this.hasPermission(conn, payload.communityId, 'channel.pin')
    ) {
      this.sendToConnection(conn, {
        id: `err-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'FORBIDDEN', message: 'You do not have permission to pin messages' }
      })
      return
    }

    const channelKey = `${payload.communityId}:${payload.channelId}`
    if (!this.pins.has(channelKey)) {
      this.pins.set(channelKey, new Set())
    }
    const channelPins = this.pins.get(channelKey)!

    if (channelPins.size >= 50) {
      this.sendToConnection(conn, {
        id: `err-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'PIN_LIMIT', message: 'Maximum of 50 pinned messages per channel' }
      })
      return
    }

    channelPins.add(payload.messageId)

    this.broadcastToCommunity(payload.communityId, {
      id: `pin-${Date.now()}`,
      type: 'channel.message.pinned',
      timestamp: new Date().toISOString(),
      sender: conn.did,
      payload: {
        communityId: payload.communityId,
        channelId: payload.channelId,
        messageId: payload.messageId,
        pinnedBy: conn.did
      }
    })
  }

  private async handleChannelUnpin(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { communityId: string; channelId: string; messageId: string }

    if (
      !(await this.isAdmin(payload.communityId, conn.did)) &&
      !this.hasPermission(conn, payload.communityId, 'channel.pin')
    ) {
      this.sendToConnection(conn, {
        id: `err-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'FORBIDDEN', message: 'You do not have permission to unpin messages' }
      })
      return
    }

    const channelKey = `${payload.communityId}:${payload.channelId}`
    this.pins.get(channelKey)?.delete(payload.messageId)

    this.broadcastToCommunity(payload.communityId, {
      id: `unpin-${Date.now()}`,
      type: 'channel.message.unpinned',
      timestamp: new Date().toISOString(),
      sender: conn.did,
      payload: {
        communityId: payload.communityId,
        channelId: payload.channelId,
        messageId: payload.messageId,
        unpinnedBy: conn.did
      }
    })
  }

  private async handleChannelPinsList(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { communityId: string; channelId: string }
    const channelKey = `${payload.communityId}:${payload.channelId}`
    const pinnedIds = Array.from(this.pins.get(channelKey) ?? [])

    this.sendToConnection(conn, {
      id: `pins-${Date.now()}`,
      type: 'channel.pins.response',
      timestamp: new Date().toISOString(),
      sender: 'server',
      payload: {
        communityId: payload.communityId,
        channelId: payload.channelId,
        messageIds: pinnedIds
      }
    })
  }

  broadcastToCommunity(communityId: string, msg: ProtocolMessage, excludeConnId?: string): void {
    const connIds = this.communitySubscriptions.get(communityId)
    if (!connIds) return
    for (const connId of connIds) {
      if (connId === excludeConnId) continue
      const conn = this._connections.get(connId)
      if (conn) this.sendToConnection(conn, msg)
    }
  }

  private sendToConnection(conn: ServerConnection, msg: ProtocolMessage): void {
    if (conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(serialise(msg))
    }
  }

  private sendRaw(ws: WebSocket, msg: ProtocolMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(serialise(msg))
    }
  }

  sendToConnectionById(connId: string, msg: ProtocolMessage): void {
    const conn = this._connections.get(connId)
    if (conn) this.sendToConnection(conn, msg)
  }

  subscribeToCommunity(connId: string, communityId: string): void {
    const conn = this._connections.get(connId)
    if (conn && !conn.communities.includes(communityId)) {
      conn.communities.push(communityId)
      if (!this.communitySubscriptions.has(communityId)) {
        this.communitySubscriptions.set(communityId, new Set())
      }
      this.communitySubscriptions.get(communityId)!.add(connId)
    }
  }

  /**
   * Reconcile a ghost Discord member with a real Harmony DID.
   * Updates community member list and broadcasts to connected clients.
   */
  async reconcileMember(
    communityId: string,
    discordUserId: string,
    newDID: string,
    displayName: string
  ): Promise<void> {
    const ghostSubject = `harmony:member:${discordUserId}`
    const store = this.config.store

    // Add DID link to the ghost member record
    await store.add({
      subject: ghostSubject,
      predicate: HarmonyPredicate.author,
      object: newDID,
      graph: communityId
    })

    // Update display name
    const oldNames = await store.match({
      subject: ghostSubject,
      predicate: HarmonyPredicate.name,
      graph: communityId
    })
    for (const q of oldNames) await store.remove(q)
    await store.add({
      subject: ghostSubject,
      predicate: HarmonyPredicate.name,
      object: { value: displayName },
      graph: communityId
    })

    // Broadcast reconciled event
    this.broadcastToCommunity(communityId, {
      id: `cmr-${Date.now()}`,
      type: 'community.member.reconciled',
      timestamp: new Date().toISOString(),
      sender: 'server',
      payload: {
        communityId,
        discordUserId,
        newDID,
        displayName
      }
    })
  }

  // ── Media Upload ──

  private static readonly ALLOWED_MIME_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'application/pdf',
    'text/plain',
    'text/markdown',
    'application/zip',
    'audio/mpeg',
    'audio/ogg',
    'audio/wav'
  ])

  private static readonly MAX_MEDIA_SIZE = 10 * 1024 * 1024 // 10MB

  private async handleMediaUploadRequest(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as {
      communityId: string
      channelId: string
      filename: string
      mimeType: string
      size: number
      data: string // base64
    }

    // Validate membership
    if (!conn.communities.includes(payload.communityId)) {
      this.sendToConnection(conn, {
        id: `err-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'NOT_MEMBER', message: 'Not a member of this community' }
      })
      return
    }

    // Validate MIME type
    if (!HarmonyServer.ALLOWED_MIME_TYPES.has(payload.mimeType as string)) {
      this.sendToConnection(conn, {
        id: `err-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'INVALID_MIME_TYPE', message: `MIME type not allowed: ${payload.mimeType}` }
      })
      return
    }

    // Validate size
    if ((payload.size as number) > HarmonyServer.MAX_MEDIA_SIZE) {
      this.sendToConnection(conn, {
        id: `err-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: {
          code: 'FILE_TOO_LARGE',
          message: `File exceeds ${HarmonyServer.MAX_MEDIA_SIZE / (1024 * 1024)}MB limit`
        }
      })
      return
    }

    // Validate data present
    if (!payload.data || typeof payload.data !== 'string') {
      this.sendToConnection(conn, {
        id: `err-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'MISSING_DATA', message: 'No file data provided' }
      })
      return
    }

    const mediaId = `media-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
    const now = new Date().toISOString()

    this.mediaStore.set(mediaId, {
      id: mediaId,
      filename: payload.filename,
      mimeType: payload.mimeType,
      size: payload.size,
      data: payload.data,
      uploadedBy: conn.did,
      communityId: payload.communityId,
      channelId: payload.channelId,
      uploadedAt: now
    })

    // Respond with upload complete
    this.sendToConnection(conn, {
      id: `muc-${Date.now()}`,
      type: 'media.upload.complete',
      timestamp: now,
      sender: 'server',
      payload: {
        mediaId,
        filename: payload.filename,
        mimeType: payload.mimeType,
        size: payload.size,
        url: `/media/${mediaId}/${encodeURIComponent(payload.filename)}`,
        communityId: payload.communityId,
        channelId: payload.channelId
      }
    })

    // Broadcast to community so other members see the attachment
    this.broadcastToCommunity(
      payload.communityId,
      {
        id: `mub-${Date.now()}`,
        type: 'media.upload.complete',
        timestamp: now,
        sender: conn.did,
        payload: {
          mediaId,
          filename: payload.filename,
          mimeType: payload.mimeType,
          size: payload.size,
          url: `/media/${mediaId}/${encodeURIComponent(payload.filename)}`,
          communityId: payload.communityId,
          channelId: payload.channelId
        }
      },
      conn.id
    ) // exclude sender (already notified)
  }

  private async handleMediaDelete(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { mediaId: string; communityId: string }

    const media = this.mediaStore.get(payload.mediaId)
    if (!media) {
      this.sendToConnection(conn, {
        id: `err-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'NOT_FOUND', message: 'Media not found' }
      })
      return
    }

    // Only uploader can delete
    if (media.uploadedBy !== conn.did) {
      this.sendToConnection(conn, {
        id: `err-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'FORBIDDEN', message: 'Only the uploader can delete this file' }
      })
      return
    }

    this.mediaStore.delete(payload.mediaId)

    this.sendToConnection(conn, {
      id: `md-${Date.now()}`,
      type: 'media.delete',
      timestamp: new Date().toISOString(),
      sender: 'server',
      payload: { mediaId: payload.mediaId, deleted: true }
    })
  }

  private async handleSearchQuery(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as {
      communityId: string
      query: string
      channelId?: string
      authorDID?: string
      before?: string
      after?: string
      hasAttachment?: boolean
      limit?: number
    }

    // Membership check
    if (!conn.communities.includes(payload.communityId)) {
      this.sendToConnection(conn, {
        id: `err-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'FORBIDDEN', message: 'Not a member of this community' }
      })
      return
    }

    const limit = payload.limit ?? 50

    // Use metadata index for structured filters (author, channel, date, attachment)
    const metadataResults = this.metadataIndex.searchMetadata({
      communityId: payload.communityId,
      filters: {
        channelId: payload.channelId,
        authorDID: payload.authorDID,
        before: payload.before,
        after: payload.after,
        hasAttachment: payload.hasAttachment
      },
      limit: limit * 2, // fetch extra for text filtering
      sort: 'newest'
    })

    // If there's a text query, do text matching against stored messages
    // Note: with E2EE this will only match unencrypted/plaintext messages
    let results: ProtocolMessage[]
    if (payload.query?.trim()) {
      const matchedIds = new Set(metadataResults.map((r) => r.messageId))
      const channels = await this.communityManager.getChannels(payload.communityId)
      const channelIds = payload.channelId ? [payload.channelId] : channels.map((c) => c.id)

      // Fall back to MessageStore.search for text matching, but scope to metadata-filtered results
      const textResults = await this.messageStore.search({
        communityId: payload.communityId,
        query: payload.query,
        channelId: payload.channelId,
        channelIds,
        limit: limit * 3
      })

      // If metadata index has entries, intersect; otherwise use text results as-is
      if (metadataResults.length > 0 || payload.authorDID || payload.before || payload.after) {
        results = textResults.filter((m) => matchedIds.has(m.id)).slice(0, limit)
      } else {
        results = textResults.slice(0, limit)
      }
    } else {
      // No text query — return metadata matches with full messages
      const messageIds = metadataResults.slice(0, limit).map((r) => r.messageId)
      results = []
      for (const mid of messageIds) {
        // Fetch full message from store
        const allChannels = await this.communityManager.getChannels(payload.communityId)
        for (const ch of allChannels) {
          const history = await this.messageStore.getHistory({
            communityId: payload.communityId,
            channelId: ch.id,
            limit: 1000
          })
          const found = history.find((m) => m.id === mid)
          if (found) {
            results.push(found)
            break
          }
        }
      }
    }

    this.sendToConnection(conn, {
      id: `sr-${Date.now()}`,
      type: 'search.results',
      timestamp: new Date().toISOString(),
      sender: 'server',
      payload: {
        communityId: payload.communityId,
        query: payload.query,
        results,
        // Include metadata results separately so client can merge with its own FTS
        metadata: metadataResults.slice(0, limit)
      }
    })
  }

  private async handleChannelHistory(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { communityId: string; channelId: string; before?: string; limit?: number }

    if (!conn.communities.includes(payload.communityId)) {
      this.sendToConnection(conn, {
        id: `err-${Date.now()}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { code: 'FORBIDDEN', message: 'Not a member of this community' }
      })
      return
    }

    const messages = await this.messageStore.getHistory({
      communityId: payload.communityId,
      channelId: payload.channelId,
      before: payload.before as LamportClock | undefined,
      limit: payload.limit ?? 50
    })

    this.sendToConnection(conn, {
      id: `ch-${Date.now()}`,
      type: 'channel.history.response',
      timestamp: new Date().toISOString(),
      sender: 'server',
      payload: { communityId: payload.communityId, channelId: payload.channelId, messages }
    })
  }

  getMediaData(mediaId: string): { data: string; mimeType: string; filename: string } | null {
    const media = this.mediaStore.get(mediaId)
    if (!media) return null
    return { data: media.data, mimeType: media.mimeType, filename: media.filename }
  }
}
