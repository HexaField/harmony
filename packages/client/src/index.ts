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
  EncryptedContent,
  Notification
} from '@harmony/protocol'
import { serialise, deserialise } from '@harmony/protocol'
import { CRDTLog, clockTick, clockMerge } from '@harmony/crdt'
import type { VCService as VCServiceType, VerifiablePresentation, VerifiableCredential } from '@harmony/vc'
import { VCService } from '@harmony/vc'
import type { ZCAPService, Capability } from '@harmony/zcap'
import type { MLSGroup, MLSProvider, DMChannel, DMProvider } from '@harmony/e2ee'
import { SimplifiedMLSProvider, SimplifiedDMProvider } from '@harmony/e2ee'
import type { VoiceClient, VoiceConnection, VoiceSignaling } from '@harmony/voice'
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

type EventHandler = (...args: any[]) => void

class EventEmitter {
  private handlers: Map<string, Set<EventHandler>> = new Map()

  on(event: string, handler: EventHandler): Unsubscribe {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set())
    this.handlers.get(event)!.add(handler)
    return () => this.handlers.get(event)?.delete(handler)
  }

  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler)
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
  encryptionKeyPair?: { publicKey: number[]; secretKey: number[] }
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
  private static toBytes(ct: unknown): Uint8Array {
    if (ct instanceof Uint8Array) return ct
    if (Array.isArray(ct)) return new Uint8Array(ct)
    const obj = ct as Record<string, number>
    const keys = Object.keys(obj).sort((a, b) => Number(a) - Number(b))
    return new Uint8Array(keys.map((k) => obj[k]))
  }

  private _did = ''
  private _keyPair: KeyPair | null = null
  private _identity: Identity | null = null
  private _serverUrl = ''
  private emitter = new EventEmitter()
  private _communities: Map<string, CommunityState> = new Map()
  private _dmChannels: Map<string, DMChannelState> = new Map()
  private _threadMessages: Map<string, any[]> = new Map()
  private _channelLogs: Map<string, CRDTLog<DecryptedMessage>> = new Map()
  private _channelSubscriptions: Map<string, ChannelSubscription> = new Map()
  private _messageQueue: ProtocolMessage[] = []
  private _maxReconnectAttempts = 5
  private _presenceState: PresenceUpdatePayload = { status: 'online' }
  private _idCounter = 0
  private _clock: LamportClock = { counter: 0, authorDID: '' }

  // Multi-server connection map
  private _servers: Map<string, ServerConnection> = new Map()
  private _pendingConnects: Map<string, Promise<void>> = new Map()

  // Community → server URL mapping
  private _communityServerMap: Map<string, string> = new Map()

  // Dependencies (injected or created)
  private mlsGroups: Map<string, MLSGroup> = new Map()
  private dmEncChannels: Map<string, DMChannel> = new Map()
  private mlsProvider: MLSProvider | null = null
  private _dmProvider: DMProvider | null = null
  private _encryptionKeyPair: KeyPair | null = null
  /** Messages received before MLS group was established — keyed by groupId */
  private _pendingMlsMessages: Map<string, ProtocolMessage[]> = new Map()
  /** Sequential queue for member additions to avoid racing on keypackage.response */
  private _pendingMemberAdds: Promise<void> = Promise.resolve()

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
    // E2EE is always on — auto-create providers if not supplied
    this.mlsProvider = options?.mlsProvider ?? new SimplifiedMLSProvider()
    this._dmProvider = options?.dmProvider ?? new SimplifiedDMProvider()

    if (options) {
      this._wsFactory = options.wsFactory ?? null
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
    // If already connected to this server, resolve immediately
    const existing = this._servers.get(params.serverUrl)
    if (existing?.connected) return

    // If a connection is already in progress, return that promise
    const pending = this._pendingConnects.get(params.serverUrl)
    if (pending) return pending

    const connectPromise = this._connectImpl(params)
    this._pendingConnects.set(params.serverUrl, connectPromise)
    try {
      await connectPromise
    } finally {
      this._pendingConnects.delete(params.serverUrl)
    }
  }

  private async _connectImpl(params: {
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

    // Restore or generate encryption key pair for E2EE
    if (!this._encryptionKeyPair) {
      try {
        // Try to restore from persisted state first
        if (this._persistenceAdapter) {
          const persisted = await this._persistenceAdapter.load()
          if (persisted.encryptionKeyPair) {
            this._encryptionKeyPair = {
              publicKey: new Uint8Array(persisted.encryptionKeyPair.publicKey),
              secretKey: new Uint8Array(persisted.encryptionKeyPair.secretKey),
              type: 'X25519'
            }
          }
        }
        // Generate new if not restored
        if (!this._encryptionKeyPair) {
          const crypto = createCryptoProvider()
          this._encryptionKeyPair = await crypto.generateEncryptionKeyPair()
        }
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
      } catch (vpErr) {
        console.error('[Harmony] VP creation failed:', vpErr)
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
        } else {
          console.warn('[Harmony] No VP available for auth — connecting without auth')
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
            // Re-upload key packages for E2EE on (re)connect
            this.uploadKeyPackages().catch(() => {
              /* ignore */
            })
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

  /** E2EE is always enabled */
  get e2eeEnabled(): boolean {
    return true
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
                await this.setupMLSGroupForChannel(event.communityId, channel.id)
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

  async joinCommunity(communityId: string, serverUrl?: string): Promise<CommunityState> {
    const msg = this.createMessage('community.join', {
      communityId,
      membershipVC: {} as VerifiableCredential,
      encryptionPublicKey: this._encryptionKeyPair?.publicKey ?? new Uint8Array(32)
    })

    // If serverUrl specified, pre-map so send() routes correctly
    if (serverUrl) {
      this._communityServerMap.set(communityId, serverUrl)
    }
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

  /**
   * Join a community via an invite code.
   * Resolves the invite via a portal API, connects to the target server if needed,
   * then joins the community.
   */
  async joinViaInvite(code: string, portalBaseUrl: string = 'https://harmony.chat'): Promise<CommunityState> {
    // Strip URL prefix if a full invite URL was pasted
    const cleanCode = code
      .replace(/^https?:\/\/[^/]+\/invite\//, '')
      .replace(/[?#].*$/, '')
      .trim()

    if (!cleanCode) throw new Error('Invalid invite code')

    // Resolve invite via portal
    const res = await fetch(`${portalBaseUrl}/invite/${cleanCode}`)
    if (!res.ok) {
      if (res.status === 404) throw new Error('Invite not found or expired')
      throw new Error(`Failed to resolve invite: ${res.status}`)
    }
    const data = (await res.json()) as {
      target: { endpoint: string; communityId: string; preview?: { name?: string; memberCount?: number } }
    }

    const { endpoint, communityId } = data.target
    if (!endpoint || !communityId) throw new Error('Invalid invite data')

    // Connect to server if not already connected
    const existingServer = this._servers.get(endpoint)
    if (!existingServer || !existingServer.connected) {
      if (!this._identity || !this._keyPair) {
        throw new Error('Client must have identity before joining via invite')
      }
      await this.connect({
        serverUrl: endpoint,
        identity: this._identity,
        keyPair: this._keyPair
      })
    }

    // Join the community
    return this.joinCommunity(communityId)
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

  async updateCommunity(communityId: string, params: { name?: string; description?: string }): Promise<void> {
    this.send(this.createMessage('community.update', { communityId, ...params }))
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

  async createChannel(communityId: string, params: ChannelCreatePayload): Promise<ChannelInfo> {
    this.send(this.createMessage('channel.create', { ...params, communityId }))
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

    this.emitter.emit('message', decrypted)
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
    this.emitter.emit('message.edited', { messageId, channelId, newText })
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
    this.emitter.emit('message.deleted', { messageId, channelId })
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

    // Emit locally for store tracking (outgoing DM)
    this.emitter.emit('dm', {
      id,
      authorDID: this._did,
      content: { text },
      timestamp: dmMsg.timestamp,
      _recipientDID: recipientDID
    })

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

  sendDMTyping(recipientDID: string): void {
    this.send(this.createMessage('dm.typing', { recipientDID }))
  }

  sendTyping(communityId: string, channelId: string): void {
    this.send(this.createMessage('channel.typing', { communityId, channelId }))
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

  getThreadMessages(threadId: string): any[] {
    return this._threadMessages.get(threadId) ?? []
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

  /** Remove a specific event handler. Alternative to using the Unsubscribe function returned by on(). */
  off(event: ClientEvent, handler: (...args: unknown[]) => void): void {
    this.emitter.off(event, handler)
  }

  // ── Roles & Moderation ──

  async createRole(communityId: string, params: RoleCreatePayload): Promise<void> {
    this.send(this.createMessage('role.create', { ...params, communityId }))
  }

  async updateRole(communityId: string, roleId: string, params: Partial<RoleCreatePayload>): Promise<void> {
    this.send(this.createMessage('role.update', { communityId, roleId, ...params }))
  }

  async deleteRole(communityId: string, roleId: string): Promise<void> {
    this.send(this.createMessage('role.delete', { communityId, roleId }))
  }

  async assignRole(communityId: string, memberDID: string, roleId: string): Promise<void> {
    this.send(this.createMessage('role.assign', { communityId, memberDID, roleId }))
  }

  async kickMember(communityId: string, memberDID: string, reason?: string): Promise<void> {
    this.send(this.createMessage('community.kick', { communityId, targetDID: memberDID, reason }))
  }

  async banMember(communityId: string, memberDID: string, reason?: string): Promise<void> {
    this.send(this.createMessage('community.ban', { communityId, targetDID: memberDID, reason }))
  }

  async unbanMember(communityId: string, memberDID: string): Promise<void> {
    this.send(this.createMessage('community.unban', { communityId, targetDID: memberDID }))
  }

  // ── Pins ──

  async pinMessage(communityId: string, channelId: string, messageId: string): Promise<void> {
    this.send(this.createMessage('channel.pin', { communityId, channelId, messageId }))
  }

  async unpinMessage(communityId: string, channelId: string, messageId: string): Promise<void> {
    this.send(this.createMessage('channel.unpin', { communityId, channelId, messageId }))
  }

  async getPinnedMessages(communityId: string, channelId: string): Promise<string[]> {
    return new Promise((resolve) => {
      const handler = (msg: any) => {
        if (
          msg.type === 'channel.pins.response' &&
          msg.payload?.communityId === communityId &&
          msg.payload?.channelId === channelId
        ) {
          this.off('message' as any, handler)
          resolve(msg.payload.messageIds ?? [])
        }
      }
      this.on('message' as any, handler)
      this.send(this.createMessage('channel.pins.list', { communityId, channelId }))
    })
  }

  // ── Voice ──

  /** Create a VoiceSignaling adapter that routes through our WebSocket */
  private createVoiceSignaling(communityId?: string): VoiceSignaling {
    const client = this
    const signalHandlers = new Map<string, Set<(payload: Record<string, unknown>) => void>>()

    // Helper to inject communityId for routing
    const routedPayload = (payload: Record<string, unknown>): Record<string, unknown> =>
      communityId ? { ...payload, communityId } : payload

    // Listen for incoming voice signals from server
    const incomingHandler = (payload: any) => {
      const type = payload?.type as string
      if (type && signalHandlers.has(type)) {
        for (const handler of signalHandlers.get(type)!) {
          handler(payload)
        }
      }
    }
    client.emitter.on('voice.signal', incomingHandler)

    return {
      async sendVoiceSignal(type: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            cleanup()
            reject(new Error(`Voice signal ${type} timed out`))
          }, 10000)

          const responseType = type + '.response'
          const handler = (responsePayload: any) => {
            cleanup()
            if (responsePayload.error) {
              reject(new Error(responsePayload.error))
            } else {
              resolve(responsePayload)
            }
          }

          const cleanup = () => {
            clearTimeout(timeout)
            client.emitter.off(responseType, handler)
          }

          client.emitter.on(responseType, handler)
          client.send(client.createMessage(type, routedPayload(payload)))
        })
      },
      fireVoiceSignal(type: string, payload: Record<string, unknown>): void {
        client.send(client.createMessage(type, routedPayload(payload)))
      },
      onVoiceSignal(type: string, handler: (payload: Record<string, unknown>) => void): void {
        if (!signalHandlers.has(type)) signalHandlers.set(type, new Set())
        signalHandlers.get(type)!.add(handler)
        // Also listen directly on emitter for server-push messages (e.g. voice.new-producer)
        client.emitter.on(type, handler)
      },
      offVoiceSignal(type: string, handler: (payload: Record<string, unknown>) => void): void {
        signalHandlers.get(type)?.delete(handler)
        client.emitter.off(type, handler)
      }
    }
  }

  async joinVoice(channelId: string): Promise<VoiceConnection> {
    if (!this.voiceClient) throw new Error('Voice client not configured')
    if (!this.isConnected()) throw new Error('Not connected')

    // Extract communityId from channelId for proper server routing
    // channelId format: "community:XXX:channel:YYY"
    const communityId = channelId.match(/^(community:[^:]+)/)?.[1] ?? undefined

    // Wire signaling before joining — route to the community's server
    this.voiceClient.setSignaling(this.createVoiceSignaling(communityId))

    // Request token from server
    this.send(this.createMessage('voice.token', { channelId, communityId }))

    // Wait for voice.token.response
    const tokenResponse = await new Promise<{ token: string; mode: string }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('Voice token request timed out'))
      }, 10000)

      const handler = (payload: any) => {
        if (payload.channelId === channelId && payload.token) {
          cleanup()
          resolve({ token: payload.token, mode: payload.mode ?? 'signaling' })
        }
      }

      const cleanup = () => {
        clearTimeout(timeout)
        this.emitter.off('voice.token.response', handler)
      }

      this.emitter.on('voice.token.response', handler)
    })

    // Send voice.join for participant tracking
    this.send(this.createMessage('voice.join', { channelId, communityId }))

    const connection = await this.voiceClient.joinRoom(tokenResponse.token)
    this.emitter.emit('voice.joined', { channelId, mode: tokenResponse.mode })
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

  getVoiceClient(): VoiceClient | null {
    return this.voiceClient
  }

  // ── Media ──

  private async getMediaKey(communityId: string, channelId: string): Promise<Uint8Array> {
    const groupId = `${communityId}:${channelId}`
    const group = this.mlsGroups.get(groupId)
    if (group && group.memberCount() > 1) {
      return group.deriveMediaKey()
    }
    // Fallback: HKDF-derived key from channel identity (not E2EE without MLS, but
    // cryptographically proper derivation — each channel gets a unique key)
    const encoder = new TextEncoder()
    const ikm = encoder.encode(`harmony-media-fallback-${groupId}`)
    const info = encoder.encode('harmony-media-channel-key')
    // Use Web Crypto HKDF when available, otherwise SHA-256 based expansion
    if (typeof globalThis.crypto?.subtle?.importKey === 'function') {
      const keyMaterial = await globalThis.crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
      const bits = await globalThis.crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('harmony-media-salt'), info },
        keyMaterial,
        256
      )
      return new Uint8Array(bits)
    }
    // Node.js fallback using crypto module
    const { hkdf } = await import('node:crypto')
    return new Promise<Uint8Array>((resolve, reject) => {
      hkdf('sha256', ikm, encoder.encode('harmony-media-salt'), info, 32, (err, dk) => {
        if (err) reject(err)
        else resolve(new Uint8Array(dk))
      })
    })
  }

  async uploadFile(communityId: string, channelId: string, file: FileInput): Promise<MediaRef> {
    if (!this.mediaClient) throw new Error('Media client not configured')
    const channelKey = await this.getMediaKey(communityId, channelId)
    return this.mediaClient.uploadFile(file, channelKey, this._did, communityId, channelId)
  }

  async downloadFile(ref: MediaRef, communityId?: string, channelId?: string): Promise<DecryptedFile> {
    if (!this.mediaClient) throw new Error('Media client not configured')
    const channelKey = communityId && channelId ? await this.getMediaKey(communityId, channelId) : new Uint8Array(32) // Legacy fallback for refs without community context
    return this.mediaClient.downloadFile(ref, channelKey)
  }

  // ── Search ──

  // ── Server Media Upload ──

  async uploadMediaToServer(
    communityId: string,
    channelId: string,
    file: {
      filename: string
      mimeType: string
      data: ArrayBuffer | Uint8Array
    }
  ): Promise<{ mediaId: string; url: string; filename: string; mimeType: string; size: number }> {
    const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data)
    const base64 =
      typeof btoa === 'function' ? btoa(String.fromCharCode(...data)) : Buffer.from(data).toString('base64')

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Upload timeout')), 30000)

      const handler = (msg: ProtocolMessage) => {
        if (msg.type === 'media.upload.complete') {
          const p = msg.payload as any
          clearTimeout(timeout)
          this.off('message', handler as (...args: unknown[]) => void)
          this.off('error', errorHandler)
          resolve({ mediaId: p.mediaId, url: p.url, filename: p.filename, mimeType: p.mimeType, size: p.size })
        }
      }
      const errorHandler = (payload: any) => {
        if (
          payload.code === 'FILE_TOO_LARGE' ||
          payload.code === 'INVALID_MIME_TYPE' ||
          payload.code === 'MISSING_DATA' ||
          payload.code === 'NOT_MEMBER'
        ) {
          clearTimeout(timeout)
          this.off('message', handler as (...args: unknown[]) => void)
          this.off('error', errorHandler)
          reject(new Error(payload.message))
        }
      }
      this.on('message', handler as (...args: unknown[]) => void)
      this.on('error', errorHandler)

      this.send(
        this.createMessage('media.upload.request', {
          communityId,
          channelId,
          filename: file.filename,
          mimeType: file.mimeType,
          size: data.length,
          data: base64
        })
      )
    })
  }

  async sendMessageWithAttachments(
    communityId: string,
    channelId: string,
    content: string,
    attachments: Array<{
      filename: string
      mimeType: string
      data: ArrayBuffer | Uint8Array
    }>
  ): Promise<string> {
    // Upload each attachment first
    const uploadedRefs = await Promise.all(
      attachments.map((att) => this.uploadMediaToServer(communityId, channelId, att))
    )

    // Send message with attachment references
    this._clock = clockTick(this._clock)
    const id = this.nextId()
    const encrypted = await this.encryptForChannel(communityId, channelId, content)

    const msg = this.createMessage(
      'channel.send',
      {
        communityId,
        channelId,
        content: encrypted,
        nonce: id,
        clock: { ...this._clock },
        attachments: uploadedRefs.map((ref) => ({
          id: ref.mediaId,
          filename: ref.filename,
          contentType: ref.mimeType,
          size: ref.size,
          url: ref.url,
          encrypted: false
        }))
      },
      id
    )

    this.send(msg)
    return id
  }

  // ── Search (continued) ──

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
        this.handleChannelMessageUpdated(msg)
        break
      case 'channel.message.deleted':
        this.handleChannelMessageDeleted(msg)
        break
      case 'channel.typing.indicator':
        this.emitter.emit('typing', msg.payload)
        break
      case 'channel.reaction.added':
        this.emitter.emit('reaction.added', { ...(msg.payload as Record<string, unknown>), memberDID: msg.sender })
        break
      case 'channel.reaction.removed':
        this.emitter.emit('reaction.removed', { ...(msg.payload as Record<string, unknown>), memberDID: msg.sender })
        break
      case 'dm.message':
        this.handleDMMessage(msg)
        break
      case 'dm.keyexchange':
        this.handleDMKeyExchange(msg)
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
      case 'notification.new':
        this.emitter.emit('notification.new', msg.payload)
        break
      case 'notification.list.response':
        this.emitter.emit('notification.list.response', msg.payload)
        break
      case 'notification.count.response':
        this.emitter.emit('notification.count.response', msg.payload)
        break
      case 'thread.created': {
        const p = msg.payload as any
        if (!this._threadMessages.has(p.threadId)) {
          this._threadMessages.set(p.threadId, [])
        }
        this._threadMessages.get(p.threadId)!.push({
          id: msg.id,
          sender: msg.sender,
          content: p.content,
          timestamp: msg.timestamp
        })
        this.emitter.emit('thread.created', msg.payload)
        break
      }
      case 'thread.message': {
        const p = msg.payload as any
        if (!this._threadMessages.has(p.threadId)) {
          this._threadMessages.set(p.threadId, [])
        }
        this._threadMessages.get(p.threadId)!.push({
          id: msg.id,
          sender: msg.sender,
          content: p.content,
          nonce: p.nonce,
          timestamp: msg.timestamp
        })
        this.emitter.emit('thread.message', msg.payload)
        break
      }
      case 'error':
        this.emitter.emit('error', msg.payload)
        break
      case 'search.results':
        this.emitter.emit('search.results', msg.payload)
        break
      case 'channel.history.response':
        this.emitter.emit('channel.history.response', msg.payload)
        break
      case 'media.upload.complete':
        this.emitter.emit('media.upload.complete', msg.payload)
        this.emitter.emit('message', msg) // also emit as generic message for uploadMediaToServer handler
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
      case 'mls.member.joined':
        this.handleMLSMemberJoined(msg)
        break
      case 'voice.participant.joined':
      case 'voice.participant.left':
      case 'voice.state':
        this.emitter.emit('voice.state', msg.payload)
        break
      case 'voice.token.response':
        this.emitter.emit('voice.token.response', msg.payload)
        break
      case 'voice.transport.connected':
      case 'voice.produced':
      case 'voice.consumed':
      case 'voice.new-producer':
      case 'voice.produce.response':
      case 'voice.consume.response':
      case 'voice.transport.connect.response':
      case 'voice.transport.connect-recv.response':
      case 'voice.transport.create-recv.response':
      case 'voice.consumer.resume.response':
      case 'voice.get-producers.response':
        this.emitter.emit(msg.type as string, msg.payload)
        break
      case 'voice.offer':
      case 'voice.answer':
      case 'voice.ice':
        this.emitter.emit(msg.type as string, msg)
        break
      case 'community.auto-joined':
        this.handleCommunityAutoJoined(msg)
        break
      default:
        // Handle MLS group setup for new channels
        if ((msg.type as string) === 'mls.group.setup.needed') {
          const p = msg.payload as { communityId: string; channelId: string; groupId: string }
          if (!this.mlsGroups.has(p.groupId)) {
            this.setupMLSGroupForChannel(p.communityId, p.channelId).catch(() => {
              // MLS setup failed — plaintext fallback
            })
          }
          break
        }
        // Emit unhandled server messages generically
        this.emitter.emit(msg.type as string, msg.payload)
        this.emitter.emit('message', msg)
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

    const groupId = `${payload.communityId}:${payload.channelId}`
    const mlsGroup = this.mlsGroups.get(groupId)
    const ct = payload.content ? (payload.content as EncryptedContent) : null

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
      // Auto-index decrypted message for full-text search
      if (this.searchIndex && decrypted.content?.text && decrypted.content.text !== '[encrypted]') {
        this.searchIndex.indexMessage({
          id: decrypted.id,
          channelId: payload.channelId,
          communityId: payload.communityId,
          authorDID: decrypted.authorDID,
          text: decrypted.content.text,
          timestamp: decrypted.timestamp,
          threadId: (payload as any).threadId,
          hasAttachment: !!(payload as any).attachments?.length
        })
      }
      this.emitter.emit('message', decrypted)
    }

    if (!ct) {
      addAndEmit()
      return
    }

    // epoch 0 = plaintext (no MLS)
    if (ct.epoch === 0) {
      try {
        const bytes = HarmonyClient.toBytes(ct.ciphertext)
        const text = new TextDecoder().decode(bytes)
        if (text && text.length > 0) {
          decrypted.content = { text }
        }
      } catch {
        /* malformed plaintext */
      }
      addAndEmit()
      return
    }

    // epoch > 0 = MLS encrypted
    if (!mlsGroup) {
      // No MLS group yet — queue for later processing after Welcome arrives
      if (!this._pendingMlsMessages.has(groupId)) {
        this._pendingMlsMessages.set(groupId, [])
      }
      this._pendingMlsMessages.get(groupId)!.push(msg)
      return
    }

    const ciphertextBytes = HarmonyClient.toBytes(ct.ciphertext)
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
      .catch((err) => {
        // MLS decryption failed — emit as [encrypted]
        console.error(
          '[MLS-DECRYPT-FAIL]',
          err?.message,
          'epoch:',
          ct.epoch,
          'senderIndex:',
          ct.senderIndex,
          'ctLen:',
          ciphertextBytes?.length
        )
        addAndEmit()
      })
  }

  private handleChannelMessageUpdated(msg: ProtocolMessage): void {
    const payload = msg.payload as {
      communityId: string
      channelId: string
      messageId: string
      content: EncryptedContent
      clock?: LamportClock
    }

    // Skip own edits — already applied optimistically in editMessage()
    if (msg.sender === this._identity?.did) return

    // Decrypt the edited content
    const groupId = `${payload.communityId}:${payload.channelId}`
    const mlsGroup = this.mlsGroups.get(groupId)
    const ctEdit = payload.content ? (payload.content as EncryptedContent) : null

    const applyEdit = (newText: string) => {
      const key = `${payload.communityId}:${payload.channelId}`
      const log = this._channelLogs.get(key)
      if (log) {
        const entry = log.entries().find((e) => e.data.id === payload.messageId)
        if (entry) {
          entry.data.content = { text: newText }
          entry.data.edited = true
        }
        const sub = this._channelSubscriptions.get(key)
        if (sub) {
          sub.messages = log.entries().map((e) => e.data)
        }
      }

      this.emitter.emit('message.edited', {
        messageId: payload.messageId,
        channelId: payload.channelId,
        communityId: payload.communityId,
        newText
      })
    }

    if (!ctEdit) {
      applyEdit('[encrypted]')
      return
    }

    // epoch 0 = plaintext
    if (ctEdit.epoch === 0) {
      try {
        const bytes = HarmonyClient.toBytes(ctEdit.ciphertext)
        applyEdit(new TextDecoder().decode(bytes))
      } catch {
        applyEdit('[encrypted]')
      }
      return
    }

    // epoch > 0 = MLS encrypted
    if (!mlsGroup) {
      applyEdit('[encrypted]')
      return
    }

    const ciphertextBytes = HarmonyClient.toBytes(ctEdit.ciphertext)
    mlsGroup
      .decrypt({
        epoch: ctEdit.epoch,
        senderIndex: ctEdit.senderIndex,
        ciphertext: ciphertextBytes,
        contentType: 'application'
      })
      .then(({ plaintext }) => applyEdit(new TextDecoder().decode(plaintext)))
      .catch(() => applyEdit('[encrypted]'))
  }

  private handleChannelMessageDeleted(msg: ProtocolMessage): void {
    // Skip own deletes — already applied optimistically in deleteMessage()
    if (msg.sender === this._identity?.did) return

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
    // Remove from search index
    this.searchIndex?.removeMessage(payload.messageId)
    this.emitter.emit('message.deleted', payload)
  }

  private handleDMMessage(msg: ProtocolMessage): void {
    const payload = msg.payload as {
      recipientDID?: string
      clock: LamportClock
      content?: EncryptedContent & { nonce?: Uint8Array; senderPublicKey?: Uint8Array }
    }
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

    const addAndEmit = () => {
      dmState.messages.push(decrypted)
      dmState.unreadCount++
      dmState.lastMessage = decrypted
      this.emitter.emit('dm', decrypted)
    }

    // Try to decrypt DM
    const dmChannel = this.dmEncChannels.get(senderDID)
    const content = payload.content
    if (dmChannel && content && content.nonce) {
      const nonce =
        content.nonce instanceof Uint8Array
          ? content.nonce
          : new Uint8Array(Object.values(content.nonce as Record<string, number>))
      const ciphertext =
        content.ciphertext instanceof Uint8Array
          ? content.ciphertext
          : new Uint8Array(Object.values(content.ciphertext as Record<string, number>))
      const senderPublicKey =
        content.senderPublicKey instanceof Uint8Array
          ? content.senderPublicKey
          : content.senderPublicKey
            ? new Uint8Array(Object.values(content.senderPublicKey as Record<string, number>))
            : new Uint8Array(0)
      dmChannel
        .decrypt({ ciphertext, nonce, senderPublicKey })
        .then((plaintext) => {
          decrypted.content = { text: new TextDecoder().decode(plaintext) }
          addAndEmit()
        })
        .catch(() => {
          addAndEmit()
        })
    } else if (content && !content.nonce) {
      // Plaintext fallback (no nonce = not encrypted)
      const ct = content.ciphertext
      if (ct) {
        try {
          const bytes = ct instanceof Uint8Array ? ct : new Uint8Array(Object.values(ct as Record<string, number>))
          decrypted.content = { text: new TextDecoder().decode(bytes) }
        } catch {
          /* ignore */
        }
      }
      addAndEmit()
    } else {
      addAndEmit()
    }
  }

  private async handleDMKeyExchange(msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { senderPublicKey: number[] | Uint8Array }
    const senderDID = msg.sender
    if (!this._dmProvider || !this._encryptionKeyPair) return
    if (this.dmEncChannels.has(senderDID)) return // Already have channel

    try {
      const senderPubKey =
        payload.senderPublicKey instanceof Uint8Array
          ? payload.senderPublicKey
          : new Uint8Array(payload.senderPublicKey)

      const dmChannel = await this._dmProvider.openChannel({
        recipientDID: this._did,
        recipientKeyPair: this._encryptionKeyPair,
        senderDID,
        senderPublicKey: senderPubKey
      })
      this.dmEncChannels.set(senderDID, dmChannel)
      this.emitter.emit('dm.keyexchange', { senderDID })
    } catch {
      // Key exchange failed
    }
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

  updateDisplayName(displayName: string): void {
    this.send({
      id: `member-update-${Date.now()}`,
      type: 'member.update' as any,
      timestamp: new Date().toISOString(),
      sender: this._did,
      payload: { displayName }
    })
  }

  // ── Notifications ──

  async getNotifications(opts?: { limit?: number; offset?: number; unreadOnly?: boolean }): Promise<Notification[]> {
    return new Promise((resolve) => {
      const unsub = this.on('notification.list.response' as any, (...args: unknown[]) => {
        unsub()
        const payload = args[0] as { notifications: Notification[]; total: number }
        resolve(payload.notifications)
      })
      this.send(this.createMessage('notification.list' as any, opts ?? {}))
    })
  }

  async getUnreadCount(): Promise<{ unread: number; byChannel: Record<string, number> }> {
    return new Promise((resolve) => {
      const unsub = this.on('notification.count.response' as any, (...args: unknown[]) => {
        unsub()
        resolve(args[0] as { unread: number; byChannel: Record<string, number> })
      })
      this.send(this.createMessage('notification.count' as any, {}))
    })
  }

  async markNotificationsRead(ids?: string[]): Promise<void> {
    this.send(this.createMessage('notification.mark-read' as any, { notificationIds: ids ?? [] }))
  }

  onNotification(callback: (n: Notification) => void): () => void {
    return this.on('notification.new' as any, (...args: unknown[]) => {
      callback(args[0] as Notification)
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
    const groupId = `${payload.communityId}:${payload.channelId}`
    const mlsGroup = this.mlsGroups.get(groupId)

    if (!this._channelLogs.has(key)) {
      this._channelLogs.set(key, new CRDTLog<DecryptedMessage>(this._did))
    }
    const log = this._channelLogs.get(key)!

    const pendingDecrypts: Promise<void>[] = []

    for (const m of payload.messages) {
      const p = m.payload as { clock?: LamportClock; channelId?: string; content?: EncryptedContent | DecryptedContent }
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

      // Extract text from content
      if (typeof p?.content === 'string') {
        decrypted.content = { text: p.content }
      } else if (p?.content) {
        const c = p.content as unknown as Record<string, unknown>
        if (typeof c.text === 'string') {
          decrypted.content = { text: c.text }
        } else if (c.ciphertext) {
          const epoch = (c.epoch as number) ?? 0
          if (epoch === 0) {
            // Plaintext
            try {
              const bytes = HarmonyClient.toBytes(c.ciphertext)
              decrypted.content = { text: new TextDecoder().decode(bytes) }
            } catch {
              /* not decodable */
            }
          } else if (mlsGroup) {
            // MLS decrypt
            const ciphertextBytes = HarmonyClient.toBytes(c.ciphertext)
            pendingDecrypts.push(
              mlsGroup
                .decrypt({
                  epoch,
                  senderIndex: (c.senderIndex as number) ?? 0,
                  ciphertext: ciphertextBytes,
                  contentType: 'application'
                })
                .then(({ plaintext }) => {
                  decrypted.content = { text: new TextDecoder().decode(plaintext) }
                })
                .catch(() => {
                  /* MLS decrypt failed — stays [synced] */
                })
            )
          }
        }
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

    // If there are pending MLS decryptions, re-emit after they resolve
    if (pendingDecrypts.length > 0) {
      Promise.allSettled(pendingDecrypts).then(() => {
        const sub2 = this._channelSubscriptions.get(key)
        if (sub2) {
          sub2.messages = log.entries().map((e) => e.data)
        }
        this.emitter.emit('sync', {
          communityId: payload.communityId,
          channelId: payload.channelId,
          messages: log.entries().map((e) => e.data)
        })
      })
    }

    // Also emit each synced message as a 'message' event for unified consumption
    for (const entry of log.entries()) {
      this.emitter.emit('message', entry.data)
    }
  }

  // ── MLS / E2EE Methods ──

  /** Upload key packages for all communities so existing members can add us to MLS groups */
  private async uploadKeyPackages(): Promise<void> {
    if (!this.mlsProvider || !this._keyPair || !this._encryptionKeyPair) return
    try {
      const kp = await this.mlsProvider.createKeyPackage({
        did: this._did,
        signingKeyPair: this._keyPair,
        encryptionKeyPair: this._encryptionKeyPair
      })
      this.send(this.createMessage('mls.keypackage.upload', { keyPackage: kp }))
    } catch {
      /* key package upload failed */
    }
  }

  private async handleMLSWelcome(msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { welcome: unknown; communityId: string; channelId: string; groupId: string }
    if (!this.mlsProvider || !this._encryptionKeyPair || !this._keyPair) return
    try {
      const welcome = payload.welcome as import('@harmony/e2ee').Welcome
      const group = await this.mlsProvider.joinFromWelcome(welcome, this._encryptionKeyPair, this._keyPair)
      this.mlsGroups.set(payload.groupId, group)
      this.emitter.emit('mls.welcome', payload)

      // Process any messages that arrived before the Welcome
      const pending = this._pendingMlsMessages.get(payload.groupId)
      if (pending && pending.length > 0) {
        this._pendingMlsMessages.delete(payload.groupId)
        for (const pendingMsg of pending) {
          this.handleChannelMessage(pendingMsg)
        }
      }
    } catch (err) {
      // Welcome processing failed — emit error for debugging
      this.emitter.emit('e2ee.error', { type: 'welcome-failed', error: err })
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

  private _pendingMemberDIDs = new Map<string, Set<string>>()

  private handleMLSMemberJoined(msg: ProtocolMessage): void {
    const payload = msg.payload as { communityId: string; channelId: string; groupId: string; memberDID: string }
    if (!this.mlsProvider || !this._keyPair) return
    const groupId = payload.groupId
    const group = this.mlsGroups.get(groupId)
    if (!group) return

    // Deduplicate: check both existing members AND pending additions
    const existingMembers = group.members()
    if (existingMembers.some((m) => m.did === payload.memberDID)) {
      console.debug('[MLS] member already in group:', payload.memberDID)
      return
    }
    if (!this._pendingMemberDIDs.has(groupId)) {
      this._pendingMemberDIDs.set(groupId, new Set())
    }
    const pending = this._pendingMemberDIDs.get(groupId)!
    if (pending.has(payload.memberDID)) {
      console.debug('[MLS] member already pending:', payload.memberDID)
      return
    }
    pending.add(payload.memberDID)

    // Queue member additions to avoid racing on keypackage.response
    this._pendingMemberAdds = this._pendingMemberAdds || Promise.resolve()
    this._pendingMemberAdds = this._pendingMemberAdds.then(() =>
      this.addMemberToChannel(payload.communityId, payload.channelId, payload.memberDID).catch(() => {})
    )
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

  /** Set up an MLS group for a single channel (reusable) */
  async setupMLSGroupForChannel(communityId: string, channelId: string): Promise<void> {
    const groupId = `${communityId}:${channelId}`
    if (this.mlsGroups.has(groupId)) return
    if (!this.mlsProvider || !this._keyPair || !this._encryptionKeyPair) return

    const group = await this.mlsProvider.createGroup({
      groupId,
      creatorDID: this._did,
      creatorKeyPair: this._keyPair,
      creatorEncryptionKeyPair: this._encryptionKeyPair
    })
    this.mlsGroups.set(groupId, group)

    // Upload key package so others can fetch it
    const kp = await this.mlsProvider.createKeyPackage({
      did: this._did,
      signingKeyPair: this._keyPair,
      encryptionKeyPair: this._encryptionKeyPair
    })
    this.send(this.createMessage('mls.keypackage.upload', { keyPackage: kp }))

    // Notify server about group setup
    this.send(
      this.createMessage('mls.group.setup', {
        communityId,
        channelId,
        groupId
      })
    )
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
      // Non-community messages (DMs, presence) — send to ALL connected servers
      // so recipient receives it regardless of which server they're on
      for (const sc of this._servers.values()) {
        if (sc.connected && sc.ws) {
          sc.ws.send(serialise(msg))
          sent = true
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
      did: this._did || undefined,
      encryptionKeyPair: this._encryptionKeyPair
        ? {
            publicKey: Array.from(this._encryptionKeyPair.publicKey),
            secretKey: Array.from(this._encryptionKeyPair.secretKey)
          }
        : undefined
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

  private async encryptForChannel(communityId: string, channelId: string, text: string): Promise<EncryptedContent> {
    const groupId = `${communityId}:${channelId}`
    const mlsGroup = this.mlsGroups.get(groupId)
    const plaintext = new TextEncoder().encode(text)

    // Use MLS encryption if group exists and has more than just us
    if (mlsGroup && mlsGroup.memberCount() > 1) {
      try {
        const ct = await mlsGroup.encrypt(plaintext)
        return {
          ciphertext: ct.ciphertext,
          epoch: ct.epoch,
          senderIndex: ct.senderIndex
        }
      } catch {
        // MLS encrypt failed — fall through to plaintext
      }
    }

    // Plaintext fallback (solo in channel, or MLS not set up yet)
    return { ciphertext: new Uint8Array(plaintext), epoch: 0, senderIndex: 0 }
  }

  private async encryptForDM(recipientDID: string, text: string): Promise<EncryptedContent> {
    const plaintext = new TextEncoder().encode(text)
    let dmChannel = this.dmEncChannels.get(recipientDID)

    if (!dmChannel && this._dmProvider && this._encryptionKeyPair) {
      // Need to establish DM channel — fetch recipient's public key via key packages
      try {
        const recipientPubKey = await this.fetchRecipientPublicKey(recipientDID)
        if (recipientPubKey) {
          dmChannel = await this._dmProvider.createChannel({
            senderDID: this._did,
            senderKeyPair: this._encryptionKeyPair,
            recipientDID,
            recipientPublicKey: recipientPubKey
          })
          this.dmEncChannels.set(recipientDID, dmChannel)

          // Send key exchange message so recipient can set up their side
          this.send(
            this.createMessage('dm.keyexchange', {
              recipientDID,
              senderPublicKey: Array.from(this._encryptionKeyPair.publicKey)
            })
          )
        }
      } catch {
        // Key exchange failed — fall back to plaintext
      }
    }

    if (dmChannel) {
      const ct = await dmChannel.encrypt(plaintext)
      return {
        ciphertext: ct.ciphertext,
        epoch: 0,
        senderIndex: 0,
        nonce: ct.nonce,
        senderPublicKey: ct.senderPublicKey
      } as EncryptedContent & { nonce: Uint8Array; senderPublicKey: Uint8Array }
    }
    return { ciphertext: plaintext, epoch: 0, senderIndex: 0 }
  }

  /** Fetch a recipient's encryption public key via key package */
  private fetchRecipientPublicKey(recipientDID: string): Promise<Uint8Array | null> {
    this.send(this.createMessage('mls.keypackage.fetch', { dids: [recipientDID] }))
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        unsub()
        resolve(null)
      }, 3000)
      const unsub = this.on('mls.keypackage.response', (...args: unknown[]) => {
        unsub()
        clearTimeout(timeout)
        const resp = args[0] as { keyPackages: Record<string, unknown[]> }
        const packages = resp.keyPackages[recipientDID]
        if (packages && packages.length > 0) {
          const kp = packages[0] as import('@harmony/e2ee').KeyPackage
          resolve(kp.leafNode.encryptionKey)
        } else {
          resolve(null)
        }
      })
    })
  }

  // For testing — get internal state
  getChannelLog(communityId: string, channelId: string): CRDTLog<DecryptedMessage> | undefined {
    return this._channelLogs.get(`${communityId}:${channelId}`)
  }
}
