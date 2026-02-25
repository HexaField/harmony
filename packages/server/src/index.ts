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
  private store: QuadStore

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
    authorDID?: string
    before?: string
    after?: string
    limit: number
  }): Promise<ProtocolMessage[]> {
    if (params.channelId) {
      const results = await this.getHistory({
        communityId: params.communityId,
        channelId: params.channelId,
        limit: params.limit
      })
      if (params.authorDID) {
        return results.filter((m) => m.sender === params.authorDID).slice(0, params.limit)
      }
      return results
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
  private voiceChannelParticipants: Map<string, Set<string>> = new Map() // channelId → Set<connId>

  constructor(config: ServerConfig) {
    this.config = config
    this.crypto = config.cryptoProvider ?? createCryptoProvider()
    this.messageStore = new MessageStore(config.store)
    this.communityManager = new CommunityManager(config.store, this.crypto)
    this.vcService = new VCService(this.crypto)
  }

  get messageStoreInstance(): MessageStore {
    return this.messageStore
  }
  get communityManagerInstance(): CommunityManager {
    return this.communityManager
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
      case 'dm.typing':
        await this.handleDMTyping(conn, msg)
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
      default:
        // Unknown message type — ignore
        break
    }
  }

  private async handleChannelSend(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as {
      communityId: string
      channelId: string
      content: unknown
      nonce: string
      clock: LamportClock
    }

    // Verify ZCAP if proof is present
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

    // Store message
    await this.messageStore.storeMessage(payload.communityId, payload.channelId, msg)

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
    const payload = msg.payload as { communityId: string; channelId: string; messageId: string }
    this.broadcastToCommunity(payload.communityId, {
      ...msg,
      type: 'channel.message.updated',
      sender: conn.did
    })
  }

  private async handleChannelDelete(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { communityId: string; channelId: string; messageId: string }
    await this.messageStore.deleteMessage(payload.messageId)
    this.broadcastToCommunity(payload.communityId, {
      ...msg,
      type: 'channel.message.deleted',
      sender: conn.did
    })
  }

  private async handleChannelTyping(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { communityId: string; channelId: string }
    this.broadcastToCommunity(
      payload.communityId,
      {
        ...msg,
        type: 'channel.typing.indicator',
        sender: conn.did
      },
      conn.id
    )
  }

  private async handleReactionAdd(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { communityId: string }
    this.broadcastToCommunity(payload.communityId, {
      ...msg,
      type: 'channel.reaction.added',
      sender: conn.did
    })
  }

  private async handleReactionRemove(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { communityId: string }
    this.broadcastToCommunity(payload.communityId, {
      ...msg,
      type: 'channel.reaction.removed',
      sender: conn.did
    })
  }

  private async handleDMSend(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { recipientDID: string }
    // Find recipient connection
    for (const [_id, otherConn] of this._connections) {
      if (otherConn.did === payload.recipientDID) {
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

  private async handleDMTyping(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { recipientDID: string }
    for (const [_id, otherConn] of this._connections) {
      if (otherConn.did === payload.recipientDID) {
        this.sendToConnection(otherConn, {
          ...msg,
          type: 'dm.typing.indicator',
          sender: conn.did
        })
      }
    }
  }

  private async handleCommunityCreate(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as {
      name: string
      description?: string
      defaultChannels?: string[]
      creatorKeyPair?: KeyPair
    }
    // Note: in production, the client would send a ZCAP-signed community creation.
    // For simplicity, we use the server's crypto provider to create it.
    const signingKP = payload.creatorKeyPair ?? (await this.crypto.generateSigningKeyPair())
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
          await this.config.store.removeAll(existingNames)
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

  private async handleCommunityList(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
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
    // In a full implementation, we'd fetch the capability chain and verify.
    // For this simplified version, we check the proof structure is present.
    return !!(msg.proof.capabilityId && msg.proof.invocation?.proof)
  }

  // ── MLS / E2EE Handlers ──

  private async handleMLSKeyPackageUpload(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { keyPackage: unknown }
    const serialized = new TextEncoder().encode(serialise(payload.keyPackage))
    if (!this.keyPackages.has(conn.did)) {
      this.keyPackages.set(conn.did, [])
    }
    this.keyPackages.get(conn.did)!.push(serialized)
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
    const payload = msg.payload as { communityId?: string }
    if (payload.communityId) {
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

    // Broadcast to all in channel that this user joined
    this.broadcastVoiceState(channelId, conn.did, 'voice.participant.joined')

    // Send current voice state to the joining user
    const participants = this.getVoiceChannelParticipants(channelId)
    this.sendToConnection(conn, {
      id: `vs-${Date.now()}`,
      type: 'voice.state',
      timestamp: new Date().toISOString(),
      sender: 'server',
      payload: { channelId, participants }
    })
  }

  private async handleVoiceLeave(conn: ServerConnection, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { channelId: string }
    const channelId = payload.channelId
    const participants = this.voiceChannelParticipants.get(channelId)
    if (participants) {
      participants.delete(conn.id)
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
}
