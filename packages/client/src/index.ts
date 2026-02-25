import type { KeyPair, CryptoProvider } from '@harmony/crypto'
import { createCryptoProvider } from '@harmony/crypto'
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
import type { VCService as VCServiceType, VerifiablePresentation, VerifiableCredential } from '@harmony/vc'
import { VCService } from '@harmony/vc'
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
  channels?: Array<{ id: string; name: string; type: string }>
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

// ── Multi-Server ──

export interface ServerConnection {
  url: string
  ws: WSLike | null
  connected: boolean
  reconnectTimer: ReturnType<typeof setTimeout> | null
  reconnectAttempts: number
  communities: Set<string>
}

// ── Persistence ──

export interface PersistenceAdapter {
  load(): Promise<PersistedState>
  save(state: PersistedState): Promise<void>
}

export interface PersistedState {
  servers: Array<{ url: string; communityIds: string[] }>
  did?: string
}

export class LocalStoragePersistence implements PersistenceAdapter {
  private key = 'harmony:client:state'

  async load(): Promise<PersistedState> {
    try {
      const raw = localStorage.getItem(this.key)
      if (raw) return JSON.parse(raw) as PersistedState
    } catch {
      /* ignore */
    }
    return { servers: [] }
  }

  async save(state: PersistedState): Promise<void> {
    try {
      localStorage.setItem(this.key, JSON.stringify(state))
    } catch {
      /* ignore */
    }
  }
}

// ── Client ──

export class HarmonyClient {
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
  private _maxReconnectAttempts = 5
  private _presenceState: PresenceUpdatePayload = { status: 'online' }
  private _idCounter = 0
  private _clock: LamportClock = { counter: 0, authorDID: '' }

  // Multi-server connection map
  private _servers: Map<string, ServerConnection> = new Map()

  // Community → server URL mapping
  private _communityServerMap: Map<string, string> = new Map()

  // Dependencies (injected or created)
  private mlsGroups: Map<string, MLSGroup> = new Map()
  private dmEncChannels: Map<string, DMChannel> = new Map()
  private mlsProvider: MLSProvider | null = null
  private _dmProvider: DMProvider | null = null
  private _encryptionKeyPair: KeyPair | null = null

  // VP for auth
  private _vp: VerifiablePresentation | null = null

  // WebSocket factory for testing
  private _wsFactory: ((url: string) => WSLike) | null = null

  // Persistence
  private _persistenceAdapter: PersistenceAdapter | null = null

  // Phase 3 integrations
  private voiceClient: VoiceClient | null = null
  private mediaClient: MediaClient | null = null
  private searchIndex: ClientSearchIndex | null = null
  private governanceEngine: GovernanceEngine | null = null
  private delegationManager: DelegationManager | null = null
  private reputationEngine: ReputationEngine | null = null
  private pushService: PushNotificationService | null = null

  constructor(options?: {
    vcService?: VCServiceType
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
    persistenceAdapter?: PersistenceAdapter
  }) {
    if (options) {
      this._wsFactory = options.wsFactory ?? null
      this.mlsProvider = options.mlsProvider ?? null
      this._dmProvider = options.dmProvider ?? null
      this.voiceClient = options.voiceClient ?? null
      this.mediaClient = options.mediaClient ?? null
      this.searchIndex = options.searchIndex ?? null
      this.governanceEngine = options.governanceEngine ?? null
      this.delegationManager = options.delegationManager ?? null
      this.reputationEngine = options.reputationEngine ?? null
      this.pushService = options.pushService ?? null
      this._persistenceAdapter = options.persistenceAdapter ?? null
    }
  }

  // ── Static factory with persistence ──

  static async create(options: {
    vcService?: VCServiceType
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
    persistenceAdapter?: PersistenceAdapter
    identity?: Identity
    keyPair?: KeyPair
    vp?: VerifiablePresentation
  }): Promise<HarmonyClient> {
    const client = new HarmonyClient(options)
    if (client._persistenceAdapter) {
      const state = await client._persistenceAdapter.load()
      if (options?.identity && options?.keyPair) {
        client._identity = options.identity
        client._keyPair = options.keyPair
        client._did = options.identity.did
        client._clock = { counter: 0, authorDID: client._did }
        client._vp = options.vp ?? null
        for (const s of state.servers) {
          await client.connect({
            serverUrl: s.url,
            identity: options.identity,
            keyPair: options.keyPair,
            vp: options.vp
          })
          // Restore community mappings
          for (const cid of s.communityIds) {
            client._communityServerMap.set(cid, s.url)
            const sc = client._servers.get(s.url)
            if (sc) sc.communities.add(cid)
          }
        }
      }
    }
    return client
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

    // Generate encryption key pair for E2EE if we have a crypto provider
    if (!this._encryptionKeyPair) {
      try {
        const crypto = createCryptoProvider()
        this._encryptionKeyPair = await crypto.generateEncryptionKeyPair()
      } catch {
        // Encryption key generation failed — E2EE won't be available
      }
    }

    // Auto-create VP if not provided but we have identity + keyPair
    if (!this._vp && this._did && this._keyPair) {
      try {
        const crypto = createCryptoProvider()
        const vcSvc = new VCService(crypto)
        const vc = await vcSvc.issue({
          issuerDID: this._did,
          issuerKeyPair: this._keyPair,
          subjectDID: this._did,
          type: 'IdentityAssertion',
          claims: { type: 'IdentityAssertion' }
        })
        this._vp = await vcSvc.present({
          holderDID: this._did,
          holderKeyPair: this._keyPair,
          credentials: [vc]
        })
      } catch {
        // VP creation failed — will connect without auth
      }
    }

    // Ensure server entry exists in map
    if (!this._servers.has(params.serverUrl)) {
      this._servers.set(params.serverUrl, {
        url: params.serverUrl,
        ws: null,
        connected: false,
        reconnectTimer: null,
        reconnectAttempts: 0,
        communities: new Set()
      })
    }
    const sc = this._servers.get(params.serverUrl)!

    return new Promise<void>((resolve, reject) => {
      const ws = this._wsFactory
        ? this._wsFactory(params.serverUrl)
        : typeof globalThis.WebSocket !== 'undefined'
          ? (new globalThis.WebSocket(params.serverUrl) as unknown as WSLike)
          : (() => {
              throw new Error('WebSocket factory required — no native WebSocket available')
            })()

      sc.ws = ws

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
          if (!sc.connected && msg.type === 'sync.response') {
            sc.connected = true
            sc.reconnectAttempts = 0
            this.emitter.emit('connected')
            this.flushQueueForServer(params.serverUrl)
            this.persistState()
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
        const wasConnected = sc.connected
        sc.connected = false
        if (wasConnected) {
          this.emitter.emit('disconnected')
          this.attemptReconnectServer(params.serverUrl)
        }
      }

      ws.onerror = (err: unknown) => {
        if (!sc.connected) {
          reject(err instanceof Error ? err : new Error('Connection failed'))
          // Schedule reconnect even on initial failure
          this.attemptReconnectServer(params.serverUrl)
        }
      }
    })
  }

  async disconnect(): Promise<void> {
    for (const [, sc] of this._servers) {
      if (sc.reconnectTimer) {
        clearTimeout(sc.reconnectTimer)
        sc.reconnectTimer = null
      }
      sc.reconnectAttempts = this._maxReconnectAttempts // prevent reconnect
      if (sc.ws) {
        sc.ws.close()
        sc.ws = null
      }
      sc.connected = false
    }
  }

  async reconnect(): Promise<void> {
    if (!this._identity || !this._keyPair) throw new Error('No identity')
    const urls = Array.from(this._servers.keys())
    if (urls.length === 0 && this._serverUrl) {
      urls.push(this._serverUrl)
    }
    for (const url of urls) {
      const sc = this._servers.get(url)
      if (sc) {
        sc.reconnectAttempts = 0
      }
      await this.connect({
        serverUrl: url,
        identity: this._identity,
        keyPair: this._keyPair,
        vp: this._vp ?? undefined
      })
    }
  }

  // ── Multi-Server Methods ──

  addServer(url: string): void {
    if (this._servers.has(url)) return
    this._servers.set(url, {
      url,
      ws: null,
      connected: false,
      reconnectTimer: null,
      reconnectAttempts: 0,
      communities: new Set()
    })
    if (this._identity && this._keyPair) {
      this.connect({
        serverUrl: url,
        identity: this._identity,
        keyPair: this._keyPair,
        vp: this._vp ?? undefined
      }).catch(() => {
        /* reconnect will handle */
      })
    }
    this.persistState()
  }

  removeServer(url: string): void {
    const sc = this._servers.get(url)
    if (!sc) return
    if (sc.reconnectTimer) {
      clearTimeout(sc.reconnectTimer)
      sc.reconnectTimer = null
    }
    sc.reconnectAttempts = this._maxReconnectAttempts
    if (sc.ws) {
      sc.ws.close()
      sc.ws = null
    }
    sc.connected = false
    // Remove community mappings for this server
    for (const cid of sc.communities) {
      this._communityServerMap.delete(cid)
    }
    this._servers.delete(url)
    this.persistState()
  }

  servers(): ServerConnection[] {
    return Array.from(this._servers.values())
  }

  serverForCommunity(communityId: string): string | null {
    return this._communityServerMap.get(communityId) ?? null
  }

  isConnectedTo(url: string): boolean {
    return this._servers.get(url)?.connected ?? false
  }

  isConnectedToAny(): boolean {
    for (const sc of this._servers.values()) {
      if (sc.connected) return true
    }
    return false
  }

  connectionState(): 'connected' | 'disconnected' | 'partial' {
    if (this._servers.size === 0) return 'disconnected'
    let anyConnected = false
    let anyDisconnected = false
    for (const sc of this._servers.values()) {
      if (sc.connected) anyConnected = true
      else anyDisconnected = true
    }
    if (anyConnected && anyDisconnected) return 'partial'
    if (anyConnected) return 'connected'
    return 'disconnected'
  }

  isConnected(): boolean {
    return this.isConnectedToAny()
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
        // Map community to the server that created it
        if (this._serverUrl) {
          this._communityServerMap.set(event.communityId, this._serverUrl)
          const sc = this._servers.get(this._serverUrl)
          if (sc) sc.communities.add(event.communityId)
        }

        // Set up MLS groups for each channel
        if (this.mlsProvider && this._keyPair && this._encryptionKeyPair) {
          const setupMLS = async () => {
            for (const channel of state.channels) {
              try {
                const groupId = `${event.communityId}:${channel.id}`
                const group = await this.mlsProvider!.createGroup({
                  groupId,
                  creatorDID: this._did,
                  creatorKeyPair: this._keyPair!,
                  creatorEncryptionKeyPair: this._encryptionKeyPair!
                })
                this.mlsGroups.set(groupId, group)

                // Upload key package so others can fetch it
                const kp = await this.mlsProvider!.createKeyPackage({
                  did: this._did,
                  signingKeyPair: this._keyPair!,
                  encryptionKeyPair: this._encryptionKeyPair!
                })
                this.send(this.createMessage('mls.keypackage.upload', { keyPackage: kp }))

                // Notify server about group setup
                this.send(
                  this.createMessage('mls.group.setup', {
                    communityId: event.communityId,
                    channelId: channel.id,
                    groupId
                  })
                )
              } catch {
                // MLS setup failed for this channel — plaintext fallback
              }
            }
          }
          setupMLS().catch(() => {
            /* ignore */
          })
        }

        this.persistState()
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
          if (this._serverUrl) {
            this._communityServerMap.set(communityId, this._serverUrl)
            const sc = this._servers.get(this._serverUrl)
            if (sc) sc.communities.add(communityId)
          }

          // Upload key package so existing members can add us to MLS groups
          if (this.mlsProvider && this._keyPair && this._encryptionKeyPair) {
            const uploadKP = async () => {
              const kp = await this.mlsProvider!.createKeyPackage({
                did: this._did,
                signingKeyPair: this._keyPair!,
                encryptionKeyPair: this._encryptionKeyPair!
              })
              this.send(this.createMessage('mls.keypackage.upload', { keyPackage: kp }))
            }
            uploadKP().catch(() => {
              /* ignore */
            })
          }

          this.persistState()
          unsub()
          resolve(state)
        }
      })
    })
  }

  async leaveCommunity(communityId: string): Promise<void> {
    this.send(this.createMessage('community.leave', { communityId }))
    this._communities.delete(communityId)
    const serverUrl = this._communityServerMap.get(communityId)
    if (serverUrl) {
      const sc = this._servers.get(serverUrl)
      if (sc) sc.communities.delete(communityId)
    }
    this._communityServerMap.delete(communityId)
    this.persistState()
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
    const dmMsg: DecryptedMessage = {
      id,
      channelId: `dm:${recipientDID}`,
      authorDID: this._did,
      content: { text },
      timestamp: new Date().toISOString(),
      clock: { ...this._clock },
      reactions: new Map(),
      edited: false
    }
    dmState.messages.push(dmMsg)
    dmState.lastMessage = dmMsg

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
    if (!this.isConnected()) throw new Error('Not connected')
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
      case 'community.info.response':
        this.handleCommunityInfoResponse(msg)
        break
      case 'community.list.response':
        this.emitter.emit('community.list', msg.payload)
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
      case 'mls.welcome':
        this.handleMLSWelcome(msg)
        break
      case 'mls.commit':
        this.handleMLSCommit(msg)
        break
      case 'mls.keypackage.response':
        this.emitter.emit('mls.keypackage.response', msg.payload)
        break
      case 'voice.participant.joined':
      case 'voice.participant.left':
      case 'voice.state':
        this.emitter.emit('voice.state', msg.payload)
        break
      case 'voice.offer':
      case 'voice.answer':
      case 'voice.ice':
        this.emitter.emit(msg.type as string, msg)
        break
      case 'community.auto-joined':
        this.handleCommunityAutoJoined(msg)
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
      content: { text: '[encrypted]' },
      timestamp: msg.timestamp,
      clock: payload.clock,
      replyTo: payload.replyTo,
      reactions: new Map(),
      edited: false
    }

    // Synchronous plaintext fallback first
    const groupId = `${payload.communityId}:${payload.channelId}`
    const mlsGroup = this.mlsGroups.get(groupId)
    if (!mlsGroup && payload.content) {
      const ct = payload.content as EncryptedContent
      if (ct.epoch === 0 && ct.senderIndex === 0 && ct.ciphertext) {
        try {
          const bytes =
            ct.ciphertext instanceof Uint8Array
              ? ct.ciphertext
              : (() => {
                  const obj = ct.ciphertext as Record<string, number>
                  const keys = Object.keys(obj).sort((a, b) => Number(a) - Number(b))
                  return new Uint8Array(keys.map((k) => obj[k]))
                })()
          decrypted.content = { text: new TextDecoder().decode(bytes) }
        } catch {
          /* ignore */
        }
      }
    }

    const addAndEmit = () => {
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

    // Async MLS decryption
    if (mlsGroup && payload.content) {
      const ct = payload.content as EncryptedContent
      const ciphertextBytes =
        ct.ciphertext instanceof Uint8Array
          ? ct.ciphertext
          : (() => {
              const obj = ct.ciphertext as Record<string, number>
              const keys = Object.keys(obj).sort((a, b) => Number(a) - Number(b))
              return new Uint8Array(keys.map((k) => obj[k]))
            })()
      mlsGroup
        .decrypt({
          epoch: ct.epoch,
          senderIndex: ct.senderIndex,
          ciphertext: ciphertextBytes,
          contentType: 'application'
        })
        .then(({ plaintext }) => {
          decrypted.content = { text: new TextDecoder().decode(plaintext) }
          addAndEmit()
        })
        .catch(() => {
          addAndEmit()
        })
    } else {
      addAndEmit()
    }
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

  private handleCommunityAutoJoined(msg: ProtocolMessage): void {
    const payload = msg.payload as {
      communityId: string
      communityName: string
      description?: string
      channels: Array<{ id: string; name: string; type: string }>
      serverUrl?: string
    }

    const state: CommunityState = {
      id: payload.communityId,
      info: {
        id: payload.communityId,
        name: payload.communityName,
        description: payload.description,
        creatorDID: '',
        createdAt: new Date().toISOString(),
        memberCount: 0,
        channels: payload.channels
      },
      channels: payload.channels.map((ch) => ({
        id: ch.id,
        communityId: payload.communityId,
        name: ch.name,
        type: ch.type as 'text' | 'voice' | 'announcement',
        createdAt: new Date().toISOString()
      })),
      members: [],
      myRoles: [],
      myCapabilities: []
    }

    this._communities.set(payload.communityId, state)
    if (payload.serverUrl || this._serverUrl) {
      const url = payload.serverUrl || this._serverUrl
      this._communityServerMap.set(payload.communityId, url)
      const sc = this._servers.get(url)
      if (sc) sc.communities.add(payload.communityId)
    }

    this.persistState()
    this.emitter.emit('community.auto-joined', payload)
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

  requestCommunityList(): void {
    this.send({
      id: `list-req-${Date.now()}`,
      type: 'community.list' as any,
      timestamp: new Date().toISOString(),
      sender: this._did,
      payload: {}
    })
  }

  requestCommunityInfo(communityId: string): void {
    this.send({
      id: `info-req-${Date.now()}`,
      type: 'community.info',
      timestamp: new Date().toISOString(),
      sender: this._did,
      payload: { communityId }
    })
  }

  private handleCommunityInfoResponse(msg: ProtocolMessage): void {
    const payload = msg.payload as {
      communityId: string
      info: { id: string; name: string; channels?: Array<{ id: string; name: string; type: string }> } | null
      members?: Array<{ did: string; displayName: string; status: string; linked: boolean }>
      onlineMembers: Array<{ did: string; status: string }>
    }

    const community = this._communities.get(payload.communityId)
    if (community && payload.info) {
      community.info.name = payload.info.name
      if (payload.info.channels) {
        community.info.channels = payload.info.channels
      }
    }

    // Update members from full member list if available
    if (community && payload.members) {
      for (const m of payload.members) {
        const existing = community.members.find((e) => e.did === m.did)
        if (existing) {
          existing.presence = { status: m.status as 'online' | 'idle' | 'dnd' | 'offline' }
        } else {
          community.members.push({
            did: m.did,
            roles: [],
            joinedAt: '',
            presence: { status: m.status as 'online' | 'idle' | 'dnd' | 'offline' }
          })
        }
      }
    } else if (community && payload.onlineMembers) {
      // Legacy: only online members
      for (const om of payload.onlineMembers) {
        const existing = community.members.find((m) => m.did === om.did)
        if (existing) {
          existing.presence = { status: om.status as 'online' | 'idle' | 'dnd' | 'offline' }
        } else {
          community.members.push({
            did: om.did,
            roles: [],
            joinedAt: new Date().toISOString(),
            presence: { status: om.status as 'online' | 'idle' | 'dnd' | 'offline' }
          })
        }
      }
    }

    this.emitter.emit('community.info', payload)
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
      const p = m.payload as { clock?: LamportClock; channelId?: string; content?: EncryptedContent | DecryptedContent }
      const clock = p?.clock ?? { counter: 0, authorDID: m.sender }

      // Extract text from content — may be plaintext { text }, encrypted { ciphertext }, or bare string
      let text = '[synced]'
      if (typeof p?.content === 'string') {
        text = p.content
      } else if (p?.content) {
        const c = p.content as unknown as Record<string, unknown>
        if (typeof c.text === 'string') {
          text = c.text
        } else if (c.ciphertext) {
          // Decode ciphertext bytes to string (plaintext in dev mode)
          const ct = c.ciphertext
          if (ct instanceof Uint8Array) {
            text = new TextDecoder().decode(ct)
          } else if (typeof ct === 'object' && ct !== null) {
            // Serialized Uint8Array as { 0: byte, 1: byte, ... }
            const keys = Object.keys(ct as Record<string, number>).sort((a, b) => Number(a) - Number(b))
            const bytes = new Uint8Array(keys.map((k) => (ct as Record<string, number>)[k]))
            text = new TextDecoder().decode(bytes)
          }
        }
      }

      const decrypted: DecryptedMessage = {
        id: m.id,
        channelId: payload.channelId,
        authorDID: m.sender,
        content: { text },
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

    // Emit sync event so UI can update
    this.emitter.emit('sync', {
      communityId: payload.communityId,
      channelId: payload.channelId,
      messages: log.entries().map((e) => e.data)
    })
  }

  // ── MLS / E2EE Methods ──

  private async handleMLSWelcome(msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { welcome: unknown; communityId: string; channelId: string; groupId: string }
    if (!this.mlsProvider || !this._encryptionKeyPair) return
    try {
      const welcome = payload.welcome as import('@harmony/e2ee').Welcome
      const group = await this.mlsProvider.joinFromWelcome(welcome, this._encryptionKeyPair)
      this.mlsGroups.set(payload.groupId, group)
      this.emitter.emit('mls.welcome', payload)
    } catch {
      // Welcome processing failed
    }
  }

  private async handleMLSCommit(msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { commit: unknown; communityId: string; channelId: string; groupId: string }
    const groupId = payload.groupId ?? `${payload.communityId}:${payload.channelId}`
    const group = this.mlsGroups.get(groupId)
    if (!group) return
    try {
      const commit = payload.commit as import('@harmony/e2ee').Commit
      await group.processCommit(commit)
      this.emitter.emit('mls.commit', payload)
    } catch {
      // Commit processing failed
    }
  }

  /** Add a member to an MLS group for a channel (called by existing members when new member joins) */
  async addMemberToChannel(communityId: string, channelId: string, memberDID: string): Promise<void> {
    const groupId = `${communityId}:${channelId}`
    const group = this.mlsGroups.get(groupId)
    if (!group || !this.mlsProvider) return

    // Fetch key packages for the new member
    this.send(this.createMessage('mls.keypackage.fetch', { dids: [memberDID] }))

    return new Promise((resolve) => {
      const unsub = this.on('mls.keypackage.response', async (...args: unknown[]) => {
        unsub()
        const resp = args[0] as { keyPackages: Record<string, unknown[]> }
        const packages = resp.keyPackages[memberDID]
        if (!packages || packages.length === 0) {
          resolve()
          return
        }
        try {
          const keyPackage = packages[0] as import('@harmony/e2ee').KeyPackage
          const { welcome, commit } = await group.addMember(keyPackage)

          // Send welcome to the new member
          this.send(
            this.createMessage('mls.welcome', {
              recipientDID: memberDID,
              communityId,
              channelId,
              groupId,
              welcome
            })
          )

          // Broadcast commit to existing members
          this.send(
            this.createMessage('mls.commit', {
              communityId,
              channelId,
              groupId,
              commit
            })
          )
        } catch {
          // Add member failed
        }
        resolve()
      })
    })
  }

  /** Decrypt channel message content if MLS group exists */
  async decryptChannelMessage(
    communityId: string,
    channelId: string,
    content: EncryptedContent
  ): Promise<string | null> {
    const groupId = `${communityId}:${channelId}`
    const group = this.mlsGroups.get(groupId)
    if (!group) return null
    try {
      const mlsCiphertext: import('@harmony/e2ee').MLSCiphertext = {
        epoch: content.epoch,
        senderIndex: content.senderIndex,
        ciphertext: content.ciphertext,
        contentType: 'application'
      }
      const { plaintext } = await group.decrypt(mlsCiphertext)
      return new TextDecoder().decode(plaintext)
    } catch {
      return null
    }
  }

  /** Check if a channel has E2EE enabled */
  hasMLSGroup(communityId: string, channelId: string): boolean {
    return this.mlsGroups.has(`${communityId}:${channelId}`)
  }

  private send(msg: ProtocolMessage): void {
    // Try to send to the appropriate server based on community context
    const payload = msg.payload as { communityId?: string } | null
    const communityId = payload?.communityId
    let sent = false

    if (communityId) {
      const serverUrl = this._communityServerMap.get(communityId)
      if (serverUrl) {
        const sc = this._servers.get(serverUrl)
        if (sc?.connected && sc.ws) {
          sc.ws.send(serialise(msg))
          sent = true
        }
      }
    }

    if (!sent) {
      // Send to any connected server (backward compat / non-community messages)
      for (const sc of this._servers.values()) {
        if (sc.connected && sc.ws) {
          sc.ws.send(serialise(msg))
          sent = true
          break
        }
      }
    }

    if (!sent) {
      this._messageQueue.push(msg)
    }
  }

  private flushQueueForServer(serverUrl: string): void {
    const sc = this._servers.get(serverUrl)
    if (!sc?.connected || !sc.ws) return
    const remaining: ProtocolMessage[] = []
    for (const msg of this._messageQueue) {
      const payload = msg.payload as { communityId?: string } | null
      const communityId = payload?.communityId
      const targetServer = communityId ? this._communityServerMap.get(communityId) : undefined
      if (!targetServer || targetServer === serverUrl) {
        sc.ws.send(serialise(msg))
      } else {
        remaining.push(msg)
      }
    }
    this._messageQueue = remaining
  }

  private attemptReconnectServer(serverUrl: string): void {
    const sc = this._servers.get(serverUrl)
    if (!sc || sc.reconnectAttempts >= this._maxReconnectAttempts) return
    sc.reconnectAttempts++
    this.emitter.emit('reconnecting')
    const delay = Math.min(1000 * Math.pow(2, sc.reconnectAttempts), 30000)
    sc.reconnectTimer = setTimeout(async () => {
      try {
        if (this._identity && this._keyPair) {
          await this.connect({
            serverUrl,
            identity: this._identity,
            keyPair: this._keyPair,
            vp: this._vp ?? undefined
          })
        }
      } catch {
        this.attemptReconnectServer(serverUrl)
      }
    }, delay)
  }

  private persistState(): void {
    if (!this._persistenceAdapter) return
    const state: PersistedState = {
      servers: Array.from(this._servers.values()).map((sc) => ({
        url: sc.url,
        communityIds: Array.from(sc.communities)
      })),
      did: this._did || undefined
    }
    this._persistenceAdapter.save(state).catch(() => {
      /* ignore */
    })
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
    const dmChannel = this.dmEncChannels.get(_recipientDID) ?? (this._dmProvider ? undefined : undefined)
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
