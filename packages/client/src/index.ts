import type { KeyPair, CryptoProvider } from '@harmony/crypto'
import type { Identity } from '@harmony/identity'
import type {
  ProtocolMessage,
  LamportClock,
  PresenceUpdatePayload,
  ChannelCreatePayload,
  RoleCreatePayload,
  DecryptedContent,
  ClientEvent,
  EncryptedContent
} from '@harmony/protocol'
import { serialise, deserialise } from '@harmony/protocol'
import { CRDTLog, clockTick, clockMerge } from '@harmony/crdt'
import type { VCService, VerifiablePresentation, VerifiableCredential } from '@harmony/vc'
import type { ZCAPService, Capability } from '@harmony/zcap'
import type { MLSGroup, MLSProvider, DMChannel, DMProvider } from '@harmony/e2ee'
import type { VoiceClient, VoiceConnection } from '@harmony/voice'
import type { MediaClient, MediaRef, FileInput, DecryptedFile } from '@harmony/media'
import type { ClientSearchIndex, SearchQuery, SearchResult } from '@harmony/search'
import type { GovernanceEngine, ProposalDef, Proposal } from '@harmony/governance'
import type { DelegationManager, UserDelegation } from '@harmony/governance'
import type { ReputationEngine, ReputationProfile } from '@harmony/credentials'
import type { PushNotificationService, PushRegistration } from '@harmony/mobile'

// ── Types ──

export interface CommunityState {
  id: string
  info: CommunityInfo
  channels: ChannelInfo[]
  members: MemberInfo[]
  myRoles: string[]
  myCapabilities: Capability[]
}

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

export interface DecryptedMessage {
  id: string
  channelId: string
  authorDID: string
  authorDisplayName?: string
  content: DecryptedContent
  timestamp: string
  clock: LamportClock
  replyTo?: string
  reactions: Map<string, string[]>
  edited: boolean
  editedAt?: string
  threadId?: string
  threadMessageCount?: number
}

export interface DMChannelState {
  recipientDID: string
  recipientDisplayName?: string
  messages: DecryptedMessage[]
  unreadCount: number
  lastMessage?: DecryptedMessage
}

export interface ChannelSubscription {
  messages: DecryptedMessage[]
  loading: boolean
  hasMore: boolean
  loadMore(limit?: number): Promise<void>
  sendTyping(): void
  unsubscribe(): void
}

export type Unsubscribe = () => void

// ── Event Emitter ──

type EventHandler = (...args: unknown[]) => void

class EventEmitter {
  private handlers: Map<string, Set<EventHandler>> = new Map()

  on(event: string, handler: EventHandler): Unsubscribe {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set())
    this.handlers.get(event)!.add(handler)
    return () => this.handlers.get(event)?.delete(handler)
  }

  emit(event: string, ...args: unknown[]): void {
    const handlers = this.handlers.get(event)
    if (handlers) {
      for (const h of handlers) h(...args)
    }
  }
}

// ── WebSocket abstraction ──

interface WSLike {
  send(data: string): void
  close(): void
  readyState: number
  onmessage: ((event: { data: string }) => void) | null
  onclose: (() => void) | null
  onopen: (() => void) | null
  onerror: ((event: unknown) => void) | null
}

// ── Client ──

export class HarmonyClient {
  private ws: WSLike | null = null
  private _connected = false
  private _did = ''
  private _keyPair: KeyPair | null = null
  private _identity: Identity | null = null
  private _serverUrl = ''
  private emitter = new EventEmitter()
  private _communities: Map<string, CommunityState> = new Map()
  private _dmChannels: Map<string, DMChannelState> = new Map()
  private _channelLogs: Map<string, CRDTLog<DecryptedMessage>> = new Map()
  private _channelSubscriptions: Map<string, ChannelSubscription> = new Map()
  private _messageQueue: ProtocolMessage[] = []
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private _reconnectAttempts = 0
  private _maxReconnectAttempts = 5
  private _presenceState: PresenceUpdatePayload = { status: 'online' }
  private _idCounter = 0
  private _clock: LamportClock = { counter: 0, authorDID: '' }

  // Dependencies (injected or created)
  private mlsGroups: Map<string, MLSGroup> = new Map()
  private dmEncChannels: Map<string, DMChannel> = new Map()

  // VP for auth
  private _vp: VerifiablePresentation | null = null

  // WebSocket factory for testing
  private _wsFactory: ((url: string) => WSLike) | null = null

  // Phase 3 integrations
  private voiceClient: VoiceClient | null = null
  private mediaClient: MediaClient | null = null
  private searchIndex: ClientSearchIndex | null = null
  private governanceEngine: GovernanceEngine | null = null
  private delegationManager: DelegationManager | null = null
  private reputationEngine: ReputationEngine | null = null
  private pushService: PushNotificationService | null = null

  constructor(options?: {
    vcService?: VCService
    zcapService?: ZCAPService
    mlsProvider?: MLSProvider
    dmProvider?: DMProvider
    cryptoProvider?: CryptoProvider
    wsFactory?: (url: string) => WSLike
    voiceClient?: VoiceClient
    mediaClient?: MediaClient
    searchIndex?: ClientSearchIndex
    governanceEngine?: GovernanceEngine
    delegationManager?: DelegationManager
    reputationEngine?: ReputationEngine
    pushService?: PushNotificationService
  }) {
    if (options) {
      this._wsFactory = options.wsFactory ?? null
      this.voiceClient = options.voiceClient ?? null
      this.mediaClient = options.mediaClient ?? null
      this.searchIndex = options.searchIndex ?? null
      this.governanceEngine = options.governanceEngine ?? null
      this.delegationManager = options.delegationManager ?? null
      this.reputationEngine = options.reputationEngine ?? null
      this.pushService = options.pushService ?? null
    }
  }

  async connect(params: {
    serverUrl: string
    identity: Identity
    keyPair: KeyPair
    vp?: VerifiablePresentation
  }): Promise<void> {
    this._serverUrl = params.serverUrl
    this._identity = params.identity
    this._keyPair = params.keyPair
    this._did = params.identity.did
    this._clock = { counter: 0, authorDID: this._did }
    this._vp = params.vp ?? null

    return new Promise<void>((resolve, reject) => {
      const ws = this._wsFactory
        ? this._wsFactory(params.serverUrl)
        : (() => {
            throw new Error('WebSocket factory required')
          })()

      this.ws = ws

      ws.onopen = () => {
        // Send auth
        if (this._vp) {
          const authMsg: ProtocolMessage = {
            id: this.nextId(),
            type: 'sync.state',
            timestamp: new Date().toISOString(),
            sender: this._did,
            payload: this._vp
          }
          ws.send(serialise(authMsg))
        }
      }

      ws.onmessage = (event: { data: string }) => {
        try {
          const msg = deserialise<ProtocolMessage>(event.data)
          if (!this._connected && msg.type === 'sync.response') {
            this._connected = true
            this._reconnectAttempts = 0
            this.emitter.emit('connected')
            this.flushQueue()
            resolve()
            // Set up normal handler
            ws.onmessage = (ev: { data: string }) => {
              try {
                this.handleServerMessage(deserialise<ProtocolMessage>(ev.data))
              } catch {
                /* ignore */
              }
            }
          } else if (msg.type === 'error') {
            reject(new Error((msg.payload as { message?: string })?.message ?? 'Auth failed'))
          }
        } catch {
          /* ignore */
        }
      }

      ws.onclose = () => {
        const wasConnected = this._connected
        this._connected = false
        if (wasConnected) {
          this.emitter.emit('disconnected')
          this.attemptReconnect()
        }
      }

      ws.onerror = (err: unknown) => {
        if (!this._connected) reject(err instanceof Error ? err : new Error('Connection failed'))
      }
    })
  }

  async disconnect(): Promise<void> {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = null
    }
    this._maxReconnectAttempts = 0 // prevent reconnect
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this._connected = false
  }

  async reconnect(): Promise<void> {
    if (!this._identity || !this._keyPair) throw new Error('No identity')
    this._maxReconnectAttempts = 5
    return this.connect({
      serverUrl: this._serverUrl,
      identity: this._identity,
      keyPair: this._keyPair,
      vp: this._vp ?? undefined
    })
  }

  isConnected(): boolean {
    return this._connected
  }
  myDID(): string {
    return this._did
  }

  communities(): CommunityState[] {
    return Array.from(this._communities.values())
  }
  community(id: string): CommunityState | null {
    return this._communities.get(id) ?? null
  }

  // ── Community ──

  async createCommunity(params: {
    name: string
    description?: string
    defaultChannels?: string[]
  }): Promise<CommunityState> {
    const msg = this.createMessage('community.create', {
      name: params.name,
      description: params.description,
      defaultChannels: params.defaultChannels ?? ['general']
    })
    this.send(msg)

    return new Promise((resolve) => {
      const unsub = this.on('community.updated', (...args: unknown[]) => {
        const event = args[0] as { communityId: string; channels?: ChannelInfo[] }
        const state: CommunityState = {
          id: event.communityId,
          info: {
            id: event.communityId,
            name: params.name,
            description: params.description,
            creatorDID: this._did,
            createdAt: new Date().toISOString(),
            memberCount: 1
          },
          channels: event.channels ?? [],
          members: [
            { did: this._did, roles: ['admin'], joinedAt: new Date().toISOString(), presence: this._presenceState }
          ],
          myRoles: ['admin'],
          myCapabilities: []
        }
        this._communities.set(event.communityId, state)
        unsub()
        resolve(state)
      })
    })
  }

  async joinCommunity(communityId: string): Promise<CommunityState> {
    const msg = this.createMessage('community.join', {
      communityId,
      membershipVC: {} as VerifiableCredential,
      encryptionPublicKey: new Uint8Array(32)
    })
    this.send(msg)

    return new Promise((resolve) => {
      const unsub = this.on('community.updated', (...args: unknown[]) => {
        const event = args[0] as { communityId: string; channels?: ChannelInfo[]; members?: MemberInfo[] }
        if (event.communityId === communityId) {
          const state: CommunityState = {
            id: communityId,
            info: { id: communityId, name: '', creatorDID: '', createdAt: '', memberCount: event.members?.length ?? 0 },
            channels: event.channels ?? [],
            members: event.members ?? [],
            myRoles: [],
            myCapabilities: []
          }
          this._communities.set(communityId, state)
          unsub()
          resolve(state)
        }
      })
    })
  }

  async leaveCommunity(communityId: string): Promise<void> {
    this.send(this.createMessage('community.leave', { communityId }))
    this._communities.delete(communityId)
  }

  // ── Channels ──

  subscribeChannel(communityId: string, channelId: string): ChannelSubscription {
    const key = `${communityId}:${channelId}`
    if (!this._channelLogs.has(key)) {
      this._channelLogs.set(key, new CRDTLog<DecryptedMessage>(this._did))
    }
    const log = this._channelLogs.get(key)!

    const sub: ChannelSubscription = {
      messages: log.entries().map((e) => e.data),
      loading: false,
      hasMore: false,
      loadMore: async (limit = 50) => {
        sub.loading = true
        this.send(this.createMessage('sync.request', { communityId, channelId, limit }))
        sub.loading = false
      },
      sendTyping: () => {
        this.send(this.createMessage('channel.typing', { communityId, channelId }))
      },
      unsubscribe: () => {
        this._channelSubscriptions.delete(key)
      }
    }

    this._channelSubscriptions.set(key, sub)
    return sub
  }

  async createChannel(_communityId: string, params: ChannelCreatePayload): Promise<ChannelInfo> {
    this.send(this.createMessage('channel.create', params))
    return new Promise((resolve) => {
      const unsub = this.on('channel.created', (...args: unknown[]) => {
        unsub()
        resolve(args[0] as ChannelInfo)
      })
    })
  }

  async updateChannel(
    communityId: string,
    channelId: string,
    params: Partial<ChannelCreatePayload>
  ): Promise<ChannelInfo> {
    this.send(this.createMessage('channel.update', { communityId, channelId, ...params }))
    return new Promise((resolve) => {
      const unsub = this.on('channel.updated', (...args: unknown[]) => {
        unsub()
        resolve(args[0] as ChannelInfo)
      })
    })
  }

  async deleteChannel(communityId: string, channelId: string): Promise<void> {
    this.send(this.createMessage('channel.delete.admin', { communityId, channelId }))
  }

  // ── Messages ──

  async sendMessage(
    communityId: string,
    channelId: string,
    text: string,
    options?: { replyTo?: string }
  ): Promise<string> {
    this._clock = clockTick(this._clock)
    const id = this.nextId()

    // Encrypt content
    const content = await this.encryptForChannel(communityId, channelId, text)

    const msg = this.createMessage(
      'channel.send',
      {
        communityId,
        channelId,
        content,
        nonce: id,
        replyTo: options?.replyTo,
        clock: { ...this._clock }
      },
      id
    )

    // Optimistic local add
    const decrypted: DecryptedMessage = {
      id,
      channelId,
      authorDID: this._did,
      content: { text },
      timestamp: new Date().toISOString(),
      clock: { ...this._clock },
      replyTo: options?.replyTo,
      reactions: new Map(),
      edited: false
    }

    const key = `${communityId}:${channelId}`
    if (!this._channelLogs.has(key)) {
      this._channelLogs.set(key, new CRDTLog<DecryptedMessage>(this._did))
    }
    this._channelLogs.get(key)!.append(decrypted, this._clock, id)

    // Update subscription
    const sub = this._channelSubscriptions.get(key)
    if (sub) {
      sub.messages = this._channelLogs
        .get(key)!
        .entries()
        .map((e) => e.data)
    }

    this.send(msg)
    return id
  }

  async editMessage(communityId: string, channelId: string, messageId: string, newText: string): Promise<void> {
    this._clock = clockTick(this._clock)
    const content = await this.encryptForChannel(communityId, channelId, newText)
    this.send(
      this.createMessage('channel.edit', {
        communityId,
        channelId,
        messageId,
        content,
        clock: { ...this._clock }
      })
    )

    // Update local
    const key = `${communityId}:${channelId}`
    const log = this._channelLogs.get(key)
    if (log) {
      const entry = log.getEntry(messageId)
      if (entry) {
        entry.data = { ...entry.data, content: { text: newText }, edited: true, editedAt: new Date().toISOString() }
      }
    }
    this.emitter.emit('message.edited', { messageId, newText })
  }

  async deleteMessage(communityId: string, channelId: string, messageId: string): Promise<void> {
    this._clock = clockTick(this._clock)
    this.send(
      this.createMessage('channel.delete', {
        communityId,
        channelId,
        messageId,
        clock: { ...this._clock }
      })
    )

    const key = `${communityId}:${channelId}`
    this._channelLogs.get(key)?.tombstone(messageId)
    const sub = this._channelSubscriptions.get(key)
    if (sub) {
      sub.messages = this._channelLogs
        .get(key)!
        .entries()
        .map((e) => e.data)
    }
    this.emitter.emit('message.deleted', { messageId })
  }

  async addReaction(communityId: string, channelId: string, messageId: string, emoji: string): Promise<void> {
    this.send(this.createMessage('channel.reaction.add', { communityId, channelId, messageId, emoji }))
  }

  async removeReaction(communityId: string, channelId: string, messageId: string, emoji: string): Promise<void> {
    this.send(this.createMessage('channel.reaction.remove', { communityId, channelId, messageId, emoji }))
  }

  // ── DMs ──

  async sendDM(recipientDID: string, text: string, options?: { replyTo?: string }): Promise<string> {
    this._clock = clockTick(this._clock)
    const id = this.nextId()
    const content = await this.encryptForDM(recipientDID, text)

    this.send(
      this.createMessage(
        'dm.send',
        {
          recipientDID,
          content,
          nonce: id,
          replyTo: options?.replyTo,
          clock: { ...this._clock }
        },
        id
      )
    )

    // Track DM locally
    if (!this._dmChannels.has(recipientDID)) {
      this._dmChannels.set(recipientDID, { recipientDID, messages: [], unreadCount: 0 })
    }
    const dmState = this._dmChannels.get(recipientDID)!
    const msg: DecryptedMessage = {
      id,
      channelId: `dm:${recipientDID}`,
      authorDID: this._did,
      content: { text },
      timestamp: new Date().toISOString(),
      clock: { ...this._clock },
      reactions: new Map(),
      edited: false
    }
    dmState.messages.push(msg)
    dmState.lastMessage = msg

    return id
  }

  async editDM(recipientDID: string, messageId: string, newText: string): Promise<void> {
    this._clock = clockTick(this._clock)
    const content = await this.encryptForDM(recipientDID, newText)
    this.send(this.createMessage('dm.edit', { recipientDID, messageId, content, clock: { ...this._clock } }))
  }

  async deleteDM(recipientDID: string, messageId: string): Promise<void> {
    this._clock = clockTick(this._clock)
    this.send(this.createMessage('dm.delete', { recipientDID, messageId, clock: { ...this._clock } }))
    const dmState = this._dmChannels.get(recipientDID)
    if (dmState) {
      dmState.messages = dmState.messages.filter((m) => m.id !== messageId)
    }
  }

  dmChannels(): DMChannelState[] {
    return Array.from(this._dmChannels.values())
  }

  // ── Threads ──

  async createThread(
    communityId: string,
    channelId: string,
    parentMessageId: string,
    name: string,
    firstMessage: string
  ): Promise<string> {
    this._clock = clockTick(this._clock)
    const id = this.nextId()
    const content = await this.encryptForChannel(communityId, channelId, firstMessage)
    this.send(
      this.createMessage(
        'thread.create',
        {
          communityId,
          channelId,
          parentMessageId,
          name,
          content,
          clock: { ...this._clock }
        },
        id
      )
    )
    return id
  }

  async sendThreadMessage(threadId: string, text: string, options?: { replyTo?: string }): Promise<string> {
    this._clock = clockTick(this._clock)
    const id = this.nextId()
    const content: EncryptedContent = { ciphertext: new TextEncoder().encode(text), epoch: 0, senderIndex: 0 }
    this.send(
      this.createMessage(
        'thread.send',
        {
          threadId,
          content,
          nonce: id,
          replyTo: options?.replyTo,
          clock: { ...this._clock }
        },
        id
      )
    )
    return id
  }

  // ── Presence ──

  async setPresence(status: 'online' | 'idle' | 'dnd' | 'offline', customStatus?: string): Promise<void> {
    this._presenceState = { status, customStatus }
    this.send(this.createMessage('presence.update', this._presenceState))
  }

  // ── Sync ──

  async syncChannel(
    communityId: string,
    channelId: string,
    options?: { since?: string; limit?: number }
  ): Promise<void> {
    const clock = options?.since ? { counter: 0, authorDID: '' } : undefined
    this.send(
      this.createMessage('sync.request', {
        communityId,
        channelId,
        clock,
        limit: options?.limit ?? 50
      })
    )
  }

  // ── Events ──

  on(event: ClientEvent, handler: (...args: unknown[]) => void): Unsubscribe {
    return this.emitter.on(event, handler)
  }

  // ── Roles & Moderation ──

  async createRole(_communityId: string, params: RoleCreatePayload): Promise<void> {
    this.send(this.createMessage('role.create', params))
  }

  async updateRole(communityId: string, roleId: string, params: Partial<RoleCreatePayload>): Promise<void> {
    this.send(this.createMessage('role.update', { communityId, roleId, ...params }))
  }

  async deleteRole(communityId: string, roleId: string): Promise<void> {
    this.send(this.createMessage('role.delete', { communityId, roleId }))
  }

  async assignRole(communityId: string, memberDID: string, roleId: string): Promise<void> {
    this.send(this.createMessage('member.update', { communityId, memberDID, roles: [roleId] }))
  }

  async kickMember(communityId: string, memberDID: string, reason?: string): Promise<void> {
    this.send(this.createMessage('member.kick', { communityId, memberDID, reason }))
  }

  async banMember(communityId: string, memberDID: string, reason?: string): Promise<void> {
    this.send(this.createMessage('member.ban', { communityId, memberDID, reason }))
  }

  // ── Voice ──

  async joinVoice(channelId: string): Promise<VoiceConnection> {
    if (!this.voiceClient) throw new Error('Voice client not configured')
    if (!this._connected) throw new Error('Not connected')
    // Request join token from server
    this.send(this.createMessage('voice.join', { channelId }))
    // Generate a client-side token with room info
    const tokenData = { room: channelId, participant: this._did }
    const token =
      typeof btoa === 'function'
        ? btoa(JSON.stringify(tokenData))
        : Buffer.from(JSON.stringify(tokenData)).toString('base64')
    const connection = await this.voiceClient.joinRoom(token)
    this.emitter.emit('voice.joined', { channelId })
    return connection
  }

  async leaveVoice(): Promise<void> {
    if (!this.voiceClient) throw new Error('Voice client not configured')
    const activeRoom = this.voiceClient.getActiveRoom()
    if (!activeRoom) return
    const roomId = activeRoom.roomId
    await this.voiceClient.leaveRoom()
    this.send(this.createMessage('voice.leave', { channelId: roomId }))
    this.emitter.emit('voice.left', { channelId: roomId })
  }

  getVoiceConnection(): VoiceConnection | null {
    return this.voiceClient?.getActiveRoom() ?? null
  }

  // ── Media ──

  async uploadFile(communityId: string, channelId: string, file: FileInput): Promise<MediaRef> {
    if (!this.mediaClient) throw new Error('Media client not configured')
    // Use a dummy channel key (in real impl, would use MLS group key)
    const channelKey = new Uint8Array(32)
    return this.mediaClient.uploadFile(file, channelKey, this._did, communityId, channelId)
  }

  async downloadFile(ref: MediaRef): Promise<DecryptedFile> {
    if (!this.mediaClient) throw new Error('Media client not configured')
    const channelKey = new Uint8Array(32)
    return this.mediaClient.downloadFile(ref, channelKey)
  }

  // ── Search ──

  search(query: SearchQuery): SearchResult[] {
    if (!this.searchIndex) throw new Error('Search index not configured')
    return this.searchIndex.search(query)
  }

  indexMessage(msg: {
    id: string
    channelId: string
    communityId: string
    authorDID: string
    text: string
    timestamp: string
    threadId?: string
  }): void {
    this.searchIndex?.indexMessage(msg)
  }

  // ── Governance ──

  async createProposal(def: ProposalDef): Promise<Proposal> {
    if (!this.governanceEngine) throw new Error('Governance engine not configured')
    return this.governanceEngine.createProposal(def, this._did)
  }

  async signProposal(proposalId: string, vote: 'approve' | 'reject' = 'approve'): Promise<void> {
    if (!this.governanceEngine) throw new Error('Governance engine not configured')
    const proof = {
      type: 'Ed25519Signature2020',
      proofPurpose: 'assertionMethod',
      verificationMethod: this._did,
      created: new Date().toISOString(),
      proofValue: ''
    }
    return this.governanceEngine.signProposal(proposalId, this._did, proof, vote)
  }

  // ── Delegation ──

  async delegateTo(did: string, capabilities: string[]): Promise<UserDelegation> {
    if (!this.delegationManager) throw new Error('Delegation manager not configured')
    return this.delegationManager.createDelegation(this._did, did, capabilities)
  }

  // ── Reputation ──

  async getReputation(did: string): Promise<ReputationProfile> {
    if (!this.reputationEngine) throw new Error('Reputation engine not configured')
    return this.reputationEngine.getReputation(did)
  }

  // ── Push Notifications ──

  async registerPush(): Promise<PushRegistration> {
    if (!this.pushService) throw new Error('Push service not configured')
    return this.pushService.register()
  }

  // ── Internal ──

  private handleServerMessage(msg: ProtocolMessage): void {
    switch (msg.type) {
      case 'channel.message':
        this.handleChannelMessage(msg)
        break
      case 'channel.message.updated':
        this.emitter.emit('message.edited', msg.payload)
        break
      case 'channel.message.deleted':
        this.handleChannelMessageDeleted(msg)
        break
      case 'channel.typing.indicator':
        this.emitter.emit('typing', msg.payload)
        break
      case 'channel.reaction.added':
        this.emitter.emit('message', msg.payload)
        break
      case 'dm.message':
        this.handleDMMessage(msg)
        break
      case 'dm.typing.indicator':
        this.emitter.emit('typing', msg.payload)
        break
      case 'community.updated':
        this.emitter.emit('community.updated', msg.payload)
        break
      case 'community.member.joined':
        this.handleMemberJoined(msg)
        break
      case 'community.member.left':
        this.handleMemberLeft(msg)
        break
      case 'community.member.kicked':
        this.emitter.emit('member.kicked', msg.payload)
        break
      case 'community.member.banned':
        this.emitter.emit('member.banned', msg.payload)
        break
      case 'channel.created':
        this.emitter.emit('channel.created', msg.payload)
        break
      case 'channel.updated':
        this.emitter.emit('channel.updated', msg.payload)
        break
      case 'channel.deleted':
        this.emitter.emit('channel.deleted', msg.payload)
        break
      case 'role.created':
        this.emitter.emit('role.created', msg.payload)
        break
      case 'role.updated':
        this.emitter.emit('role.updated', msg.payload)
        break
      case 'role.deleted':
        this.emitter.emit('role.deleted', msg.payload)
        break
      case 'presence.changed':
        this.handlePresenceChanged(msg)
        break
      case 'sync.response':
        this.handleSyncResponse(msg)
        break
      case 'thread.created':
        this.emitter.emit('message', msg.payload)
        break
      case 'thread.message':
        this.emitter.emit('message', msg.payload)
        break
      case 'error':
        this.emitter.emit('error', msg.payload)
        break
    }
  }

  private handleChannelMessage(msg: ProtocolMessage): void {
    const payload = msg.payload as {
      communityId: string
      channelId: string
      content: EncryptedContent
      clock: LamportClock
      nonce?: string
      replyTo?: string
    }
    const key = `${payload.communityId}:${payload.channelId}`

    // Merge remote clock
    this._clock = clockMerge(this._clock, payload.clock)

    const decrypted: DecryptedMessage = {
      id: msg.id,
      channelId: payload.channelId,
      authorDID: msg.sender,
      content: { text: '[encrypted]' }, // Would decrypt in real implementation
      timestamp: msg.timestamp,
      clock: payload.clock,
      replyTo: payload.replyTo,
      reactions: new Map(),
      edited: false
    }

    if (!this._channelLogs.has(key)) {
      this._channelLogs.set(key, new CRDTLog<DecryptedMessage>(this._did))
    }
    const log = this._channelLogs.get(key)!
    log.merge(payload.clock, decrypted, msg.id)

    const sub = this._channelSubscriptions.get(key)
    if (sub) {
      sub.messages = log.entries().map((e) => e.data)
    }

    this.emitter.emit('message', decrypted)
  }

  private handleChannelMessageDeleted(msg: ProtocolMessage): void {
    const payload = msg.payload as { communityId: string; channelId: string; messageId: string }
    const key = `${payload.communityId}:${payload.channelId}`
    this._channelLogs.get(key)?.tombstone(payload.messageId)
    const sub = this._channelSubscriptions.get(key)
    if (sub) {
      sub.messages = this._channelLogs
        .get(key)!
        .entries()
        .map((e) => e.data)
    }
    this.emitter.emit('message.deleted', payload)
  }

  private handleDMMessage(msg: ProtocolMessage): void {
    const payload = msg.payload as { recipientDID?: string; clock: LamportClock }
    this._clock = clockMerge(this._clock, payload.clock)

    const senderDID = msg.sender
    if (!this._dmChannels.has(senderDID)) {
      this._dmChannels.set(senderDID, { recipientDID: senderDID, messages: [], unreadCount: 0 })
    }
    const dmState = this._dmChannels.get(senderDID)!
    const decrypted: DecryptedMessage = {
      id: msg.id,
      channelId: `dm:${senderDID}`,
      authorDID: senderDID,
      content: { text: '[encrypted]' },
      timestamp: msg.timestamp,
      clock: payload.clock,
      reactions: new Map(),
      edited: false
    }
    dmState.messages.push(decrypted)
    dmState.unreadCount++
    dmState.lastMessage = decrypted
    this.emitter.emit('dm', decrypted)
  }

  private handleMemberJoined(msg: ProtocolMessage): void {
    const payload = msg.payload as { communityId: string; memberDID: string }
    const community = this._communities.get(payload.communityId)
    if (community) {
      community.members.push({
        did: payload.memberDID,
        roles: [],
        joinedAt: new Date().toISOString(),
        presence: { status: 'online' }
      })
      community.info.memberCount = community.members.length
    }
    this.emitter.emit('member.joined', payload)
  }

  private handleMemberLeft(msg: ProtocolMessage): void {
    const payload = msg.payload as { communityId: string; memberDID: string }
    const community = this._communities.get(payload.communityId)
    if (community) {
      community.members = community.members.filter((m) => m.did !== payload.memberDID)
      community.info.memberCount = community.members.length
    }
    this.emitter.emit('member.left', payload)
  }

  private handlePresenceChanged(msg: ProtocolMessage): void {
    const payload = msg.payload as PresenceUpdatePayload
    // Update member presence in all communities
    for (const community of this._communities.values()) {
      const member = community.members.find((m) => m.did === msg.sender)
      if (member) member.presence = payload
    }
    this.emitter.emit('presence', { did: msg.sender, ...payload })
  }

  private handleSyncResponse(msg: ProtocolMessage): void {
    const payload = msg.payload as {
      communityId: string
      channelId: string
      messages: ProtocolMessage[]
      hasMore: boolean
      latestClock: LamportClock
    }
    const key = `${payload.communityId}:${payload.channelId}`

    if (!this._channelLogs.has(key)) {
      this._channelLogs.set(key, new CRDTLog<DecryptedMessage>(this._did))
    }
    const log = this._channelLogs.get(key)!

    for (const m of payload.messages) {
      const p = m.payload as { clock?: LamportClock; channelId?: string }
      const clock = p?.clock ?? { counter: 0, authorDID: m.sender }
      const decrypted: DecryptedMessage = {
        id: m.id,
        channelId: payload.channelId,
        authorDID: m.sender,
        content: { text: '[synced]' },
        timestamp: m.timestamp,
        clock,
        reactions: new Map(),
        edited: false
      }
      log.merge(clock, decrypted, m.id)
    }

    if (payload.latestClock.counter > 0) {
      this._clock = clockMerge(this._clock, payload.latestClock)
    }

    const sub = this._channelSubscriptions.get(key)
    if (sub) {
      sub.messages = log.entries().map((e) => e.data)
      sub.hasMore = payload.hasMore
    }
  }

  private send(msg: ProtocolMessage): void {
    if (this._connected && this.ws) {
      this.ws.send(serialise(msg))
    } else {
      this._messageQueue.push(msg)
    }
  }

  private flushQueue(): void {
    const queue = [...this._messageQueue]
    this._messageQueue = []
    for (const msg of queue) {
      this.send(msg)
    }
  }

  private attemptReconnect(): void {
    if (this._reconnectAttempts >= this._maxReconnectAttempts) return
    this._reconnectAttempts++
    this.emitter.emit('reconnecting')
    const delay = Math.min(1000 * Math.pow(2, this._reconnectAttempts), 30000)
    this._reconnectTimer = setTimeout(async () => {
      try {
        if (this._identity && this._keyPair) {
          await this.connect({
            serverUrl: this._serverUrl,
            identity: this._identity,
            keyPair: this._keyPair,
            vp: this._vp ?? undefined
          })
        }
      } catch {
        this.attemptReconnect()
      }
    }, delay)
  }

  private createMessage(type: string, payload: unknown, id?: string): ProtocolMessage {
    return {
      id: id ?? this.nextId(),
      type: type as ProtocolMessage['type'],
      timestamp: new Date().toISOString(),
      sender: this._did,
      payload
    }
  }

  private nextId(): string {
    this._idCounter++
    return `msg-${this._did.slice(-8)}-${Date.now()}-${this._idCounter}`
  }

  private async encryptForChannel(_communityId: string, _channelId: string, text: string): Promise<EncryptedContent> {
    // In full implementation, would use MLS group encryption
    // Simplified: just wrap text as encrypted content
    const plaintext = new TextEncoder().encode(text)
    const mlsGroup = this.mlsGroups.get(`${_communityId}:${_channelId}`)
    if (mlsGroup) {
      const ct = await mlsGroup.encrypt(plaintext)
      return { ciphertext: ct.ciphertext, epoch: ct.epoch, senderIndex: ct.senderIndex }
    }
    return { ciphertext: plaintext, epoch: 0, senderIndex: 0 }
  }

  private async encryptForDM(_recipientDID: string, text: string): Promise<EncryptedContent> {
    const plaintext = new TextEncoder().encode(text)
    const dmChannel = this.dmEncChannels.get(_recipientDID)
    if (dmChannel) {
      const ct = await dmChannel.encrypt(plaintext)
      return { ciphertext: ct.ciphertext, epoch: 0, senderIndex: 0 }
    }
    return { ciphertext: plaintext, epoch: 0, senderIndex: 0 }
  }

  // For testing — get internal state
  getChannelLog(communityId: string, channelId: string): CRDTLog<DecryptedMessage> | undefined {
    return this._channelLogs.get(`${communityId}:${channelId}`)
  }
}
