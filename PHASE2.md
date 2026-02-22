# Harmony — Phase 2: Real-Time Chat & Federation

_2026-02-22 — Implementation Plan_

---

## Objective

Turn the Phase 1 foundation into a working chat application. Users can create communities, join channels, send messages, have direct conversations, and use threads — all end-to-end encrypted, all stored as RDF quads, all authorized via ZCAPs. Communities on separate instances can federate. Messages sync via CRDTs for offline-tolerant, conflict-free ordering.

Phase 2 delivers: a server that handles real-time messaging, a client that renders it, E2EE that protects it, federation that connects instances, and moderation tools that keep communities healthy — all built on the Phase 1 identity and credential infrastructure.

---

## Architecture Principles

Carries forward all Phase 1 principles, plus:

6. **Client and server are separate packages with a shared protocol.** The wire protocol is defined once in `@harmony/protocol`. Client and server implement opposite sides of the same interface. Any client that speaks the protocol works with any server.

7. **E2EE is not a feature — it's the transport.** The server never sees plaintext message content. It routes ciphertext, stores ciphertext, federates ciphertext. Metadata (who sent a message, when, to which channel) is visible to the server for routing; content is not.

8. **CRDTs for message ordering, not consensus.** No leader election, no total ordering protocol. Messages are ordered by Lamport timestamps + author DID for deterministic tie-breaking. Concurrent edits merge, they don't conflict. This makes federation and offline support trivial.

9. **Federation is opt-in per community, not global.** A community admin explicitly federates with specific instances via ZCAP delegation. There is no global federation network to discover or join. Communities form their own trust topologies.

10. **The server is a relay, not an authority.** The server routes messages and stores ciphertext for offline delivery. It does not decide who can post — the client proves authorization by presenting a ZCAP invocation. The server verifies the chain and relays. This is the fundamental architectural difference from Discord/Slack/Matrix.

---

## Module Map

```
Phase 1 (existing):
@harmony/crypto, @harmony/quads, @harmony/vocab, @harmony/did,
@harmony/vc, @harmony/zcap, @harmony/identity, @harmony/migration,
@harmony/migration-bot, @harmony/cloud, @harmony/cli

Phase 2 (new):
@harmony/protocol       ← wire protocol types, message formats, events
@harmony/crdt           ← CRDT message log, Lamport clocks, causal ordering
@harmony/e2ee           ← MLS-based group encryption, key management
@harmony/server         ← WebSocket relay server, ZCAP verification, quad persistence
@harmony/client         ← isomorphic client SDK (connects to server, manages local state)
@harmony/ui             ← SolidJS web UI (chat interface, community management)
@harmony/federation     ← instance-to-instance protocol, ZCAP-gated relay
@harmony/moderation     ← automod, rate limiting, slow mode, raid detection
```

Dependency graph (Phase 2 modules only, Phase 1 deps omitted for clarity):

```
                @harmony/protocol
                /    |    \     \
    @harmony/crdt    |   @harmony/e2ee
          |    \     |     /     |
          |  @harmony/server     |
          |          |           |
          |  @harmony/federation |
          |                      |
    @harmony/client ─────────────┘
          |
    @harmony/ui

    @harmony/moderation ──► @harmony/server (plugin)
```

---

## Module Specifications

### 1. `@harmony/protocol`

The canonical definition of every message, event, and RPC that flows between client and server. Both sides import this package. No implementation — only types.

**Isomorphic:** Yes — pure types, zero runtime dependencies.

**Wire format:** JSON over WebSocket. Binary attachments as separate frames. Each message is a `ProtocolMessage` envelope.

**Interface:**

```typescript
// ── Envelope ──

interface ProtocolMessage {
  id: string // unique message ID (ULID)
  type: MessageType
  timestamp: string // ISO 8601
  sender: string // DID of sender
  payload: unknown // type-specific payload
  proof?: ZCAPInvocationProof // ZCAP proof for authorized actions
}

type MessageType =
  // Client → Server
  | 'channel.send'
  | 'channel.edit'
  | 'channel.delete'
  | 'channel.typing'
  | 'channel.reaction.add'
  | 'channel.reaction.remove'
  | 'dm.send'
  | 'dm.edit'
  | 'dm.delete'
  | 'dm.typing'
  | 'thread.create'
  | 'thread.send'
  | 'community.create'
  | 'community.update'
  | 'community.join'
  | 'community.leave'
  | 'channel.create'
  | 'channel.update'
  | 'channel.delete'
  | 'role.create'
  | 'role.update'
  | 'role.delete'
  | 'member.update'
  | 'member.kick'
  | 'member.ban'
  | 'presence.update'
  | 'sync.request'
  | 'sync.state'
  // Server → Client
  | 'channel.message'
  | 'channel.message.updated'
  | 'channel.message.deleted'
  | 'channel.typing.indicator'
  | 'channel.reaction.added'
  | 'channel.reaction.removed'
  | 'dm.message'
  | 'dm.message.updated'
  | 'dm.message.deleted'
  | 'dm.typing.indicator'
  | 'thread.message'
  | 'thread.created'
  | 'community.updated'
  | 'community.member.joined'
  | 'community.member.left'
  | 'community.member.updated'
  | 'community.member.kicked'
  | 'community.member.banned'
  | 'channel.created'
  | 'channel.updated'
  | 'channel.deleted'
  | 'role.created'
  | 'role.updated'
  | 'role.deleted'
  | 'presence.changed'
  | 'sync.response'
  | 'error'
  // Federation
  | 'federation.relay'
  | 'federation.sync'
  | 'federation.presence'

// ── ZCAP Proof ──

interface ZCAPInvocationProof {
  capabilityId: string
  capabilityChain: string[] // ordered list of capability IDs forming the chain
  invocation: {
    action: string
    target: string
    proof: Proof // Ed25519 signature over the invocation
  }
}

// ── Channel Messages ──

interface ChannelSendPayload {
  communityId: string
  channelId: string
  content: EncryptedContent // E2EE ciphertext
  nonce: string // for deduplication
  replyTo?: string // message ID
  clock: LamportClock // CRDT ordering
}

interface EncryptedContent {
  ciphertext: Uint8Array // encrypted message content
  epoch: number // MLS epoch (which key was used)
  senderIndex: number // sender's leaf index in MLS tree
}

interface DecryptedContent {
  text: string
  attachments?: AttachmentRef[]
  embeds?: Embed[]
  mentions?: string[] // DIDs mentioned
}

interface AttachmentRef {
  id: string
  filename: string
  contentType: string
  size: number
  url: string // presigned URL or content-addressed hash
  encrypted: boolean
}

interface Embed {
  type: 'link' | 'image' | 'video' | 'rich'
  url?: string
  title?: string
  description?: string
  thumbnail?: string
}

// ── Direct Messages ──

interface DMSendPayload {
  recipientDID: string
  content: EncryptedContent // 1:1 E2EE (not MLS — simple X25519 box)
  nonce: string
  replyTo?: string
  clock: LamportClock
}

// ── Threads ──

interface ThreadCreatePayload {
  communityId: string
  channelId: string
  parentMessageId: string
  name: string
  content: EncryptedContent // first message in thread
  clock: LamportClock
}

// ── Community Management ──

interface CommunityCreatePayload {
  name: string
  description?: string
  icon?: AttachmentRef
  defaultChannels: string[] // channel names to create
}

interface CommunityJoinPayload {
  communityId: string
  membershipVC: VerifiableCredential // proof of membership
  encryptionPublicKey: Uint8Array // for MLS welcome
}

interface CommunityLeavePayload {
  communityId: string
}

// ── Channel Management ──

interface ChannelCreatePayload {
  communityId: string
  name: string
  type: 'text' | 'voice' | 'announcement'
  categoryId?: string
  topic?: string
}

// ── Roles ──

interface RoleCreatePayload {
  communityId: string
  name: string
  color?: string
  permissions: string[] // harmony:Action URIs
  position: number // display order
}

// ── Presence ──

interface PresenceUpdatePayload {
  status: 'online' | 'idle' | 'dnd' | 'offline'
  customStatus?: string
  activeChannelId?: string
}

// ── Sync ──

interface SyncRequestPayload {
  communityId: string
  channelId: string
  since?: string // ISO 8601 — sync messages after this time
  clock?: LamportClock // sync messages after this clock value
  limit?: number
}

interface SyncResponsePayload {
  communityId: string
  channelId: string
  messages: ProtocolMessage[] // ordered by CRDT clock
  hasMore: boolean
  latestClock: LamportClock
}

// ── Errors ──

interface ErrorPayload {
  code: ErrorCode
  message: string
  details?: unknown
}

type ErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID'
  | 'ZCAP_INVALID'
  | 'ZCAP_EXPIRED'
  | 'ZCAP_REVOKED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'INTERNAL'

// ── CRDT Clock ──

interface LamportClock {
  counter: number
  authorDID: string // tie-breaker for concurrent events
}
```

**Spec tests:**

```
protocol.spec.ts
├── Message Types
│   ├── MUST define all client→server message types
│   ├── MUST define all server→client message types
│   ├── MUST define all federation message types
│   └── MUST have unique type strings (no collisions)
├── Envelope
│   ├── MUST require id, type, timestamp, sender
│   ├── MUST accept optional proof field
│   └── MUST validate ISO 8601 timestamp format
├── Payloads
│   ├── ChannelSendPayload MUST include communityId, channelId, content, nonce, clock
│   ├── DMSendPayload MUST include recipientDID, content, nonce, clock
│   ├── ThreadCreatePayload MUST include parentMessageId and name
│   ├── CommunityJoinPayload MUST include membershipVC and encryptionPublicKey
│   ├── SyncRequestPayload MUST include communityId and channelId
│   └── ErrorPayload MUST include code and message
├── Encrypted Content
│   ├── MUST include ciphertext, epoch, senderIndex
│   └── MUST NOT include any plaintext fields
└── Serialisation
    ├── MUST serialise to JSON
    ├── MUST handle Uint8Array as base64 in JSON
    └── MUST round-trip all payload types through JSON
```

---

### 2. `@harmony/crdt`

Conflict-free message ordering. Every message carries a Lamport clock. Concurrent messages from different authors are deterministically ordered. Supports offline composition — messages created offline merge cleanly when reconnected.

**Isomorphic:** Yes — pure logic, no IO.

**Interface:**

```typescript
interface CRDTLog<T> {
  // Append
  append(entry: T, clock: LamportClock): void
  merge(remoteClock: LamportClock, entry: T): void

  // Query
  entries(): CRDTEntry<T>[]
  entriesSince(clock: LamportClock): CRDTEntry<T>[]
  entriesBefore(clock: LamportClock, limit: number): CRDTEntry<T>[]
  latest(): CRDTEntry<T> | null

  // Clock
  tick(authorDID: string): LamportClock
  currentClock(): LamportClock

  // State
  size(): number

  // Diff (for sync)
  diff(remoteClock: LamportClock): CRDTEntry<T>[]
}

interface CRDTEntry<T> {
  id: string
  clock: LamportClock
  data: T
  tombstone?: boolean // for deletes
}

interface LamportClock {
  counter: number
  authorDID: string
}

// Clock comparison
function clockCompare(a: LamportClock, b: LamportClock): number
// Returns: -1 if a < b, 0 if equal, 1 if a > b
// Comparison: counter first, then authorDID lexicographic for tie-breaking

function clockMax(a: LamportClock, b: LamportClock): LamportClock
function clockMerge(local: LamportClock, remote: LamportClock): LamportClock
// Merge: max(local.counter, remote.counter) + 1

// Tombstone handling for edits/deletes
interface EditOp {
  type: 'edit'
  targetId: string
  newContent: unknown
  clock: LamportClock
}

interface DeleteOp {
  type: 'delete'
  targetId: string
  clock: LamportClock
}

type CRDTOp = EditOp | DeleteOp

interface CRDTOpLog {
  applyOp(op: CRDTOp): void
  opsForEntry(entryId: string): CRDTOp[]
  allOps(): CRDTOp[]
  opsSince(clock: LamportClock): CRDTOp[]
}
```

**Spec tests:**

```
crdt.spec.ts
├── Lamport Clock
│   ├── MUST compare by counter first
│   ├── MUST use authorDID as deterministic tie-breaker
│   ├── MUST merge by taking max counter + 1
│   ├── MUST tick by incrementing counter
│   └── MUST produce identical ordering on all replicas given same inputs
├── CRDTLog
│   ├── MUST append entries in clock order
│   ├── MUST merge remote entries into correct position
│   ├── MUST handle concurrent entries (same counter, different author)
│   ├── MUST return entries in deterministic order
│   ├── MUST return entries since a given clock
│   ├── MUST return entries before a given clock (pagination)
│   ├── MUST handle out-of-order arrival (late messages insert correctly)
│   ├── MUST deduplicate entries with same id
│   └── MUST report correct size
├── Offline Merge
│   ├── MUST merge two independently-grown logs into same order
│   ├── MUST handle divergent clocks (offline for N messages)
│   ├── MUST produce identical result regardless of merge order (commutativity)
│   └── MUST produce identical result regardless of merge grouping (associativity)
├── Tombstones
│   ├── MUST mark entries as deleted via tombstone
│   ├── MUST not return tombstoned entries in normal queries
│   ├── MUST include tombstoned entries in sync/diff (so remotes learn of delete)
│   └── MUST handle delete of already-deleted entry (idempotent)
├── Operations (Edit/Delete)
│   ├── MUST apply edit operation to target entry
│   ├── MUST apply delete operation (sets tombstone)
│   ├── MUST order operations by clock
│   ├── MUST handle concurrent edits (last-writer-wins by clock)
│   └── MUST return ops since a given clock (for sync)
└── Diff
    ├── MUST return entries the remote is missing
    ├── MUST return empty diff if remote is up to date
    └── MUST include tombstones in diff
```

---

### 3. `@harmony/e2ee`

End-to-end encryption for groups and DMs. Group channels use MLS (Messaging Layer Security, RFC 9420) for scalable group key management. DMs use simple X25519 key agreement.

**Isomorphic:** Yes — pure crypto, no IO. Uses `@harmony/crypto` primitives.

**Interface:**

```typescript
// ── MLS Group (for channels) ──

interface MLSGroup {
  groupId: string
  epoch: number // increments on every membership change
  myLeafIndex: number

  // Encrypt/decrypt
  encrypt(plaintext: Uint8Array): Promise<MLSCiphertext>
  decrypt(ciphertext: MLSCiphertext): Promise<{ plaintext: Uint8Array; senderIndex: number }>

  // Membership
  addMember(memberKeyPackage: KeyPackage): Promise<{ welcome: Welcome; commit: Commit }>
  removeMember(leafIndex: number): Promise<Commit>
  processCommit(commit: Commit): Promise<void>
  processWelcome(welcome: Welcome): Promise<void>

  // Key rotation
  updateKeys(): Promise<Commit>

  // State
  members(): GroupMember[]
  memberCount(): number
  exportState(): Uint8Array // serialise for storage
}

interface MLSCiphertext {
  epoch: number
  senderIndex: number
  ciphertext: Uint8Array
  contentType: 'application' | 'proposal' | 'commit'
}

interface KeyPackage {
  protocolVersion: number
  cipherSuite: number
  initKey: Uint8Array // X25519 one-time key
  leafNode: LeafNode
  signature: Uint8Array
}

interface LeafNode {
  encryptionKey: Uint8Array
  signatureKey: Uint8Array // Ed25519 public key
  did: string // owner's DID
}

interface Welcome {
  groupId: string
  epoch: number
  encryptedGroupState: Uint8Array // encrypted with recipient's init key
}

interface Commit {
  groupId: string
  epoch: number
  proposals: Proposal[]
  commitSecret: Uint8Array
  signature: Uint8Array
}

type Proposal =
  | { type: 'add'; keyPackage: KeyPackage }
  | { type: 'remove'; leafIndex: number }
  | { type: 'update'; leafNode: LeafNode }

interface GroupMember {
  leafIndex: number
  did: string
  encryptionKey: Uint8Array
  signatureKey: Uint8Array
}

// ── MLS Provider ──

interface MLSProvider {
  createGroup(params: {
    groupId: string
    creatorDID: string
    creatorKeyPair: KeyPair
    creatorEncryptionKeyPair: KeyPair
  }): Promise<MLSGroup>

  createKeyPackage(params: { did: string; signingKeyPair: KeyPair; encryptionKeyPair: KeyPair }): Promise<KeyPackage>

  joinFromWelcome(welcome: Welcome, keyPair: KeyPair): Promise<MLSGroup>

  loadGroup(state: Uint8Array, keyPair: KeyPair): Promise<MLSGroup>
}

// ── DM Encryption (simpler — just X25519 box) ──

interface DMChannel {
  recipientDID: string
  senderDID: string

  encrypt(plaintext: Uint8Array): Promise<DMCiphertext>
  decrypt(ciphertext: DMCiphertext): Promise<Uint8Array>
}

interface DMCiphertext {
  ciphertext: Uint8Array
  nonce: Uint8Array
  senderPublicKey: Uint8Array // ephemeral or static, depending on ratchet
}

interface DMProvider {
  createChannel(params: {
    senderDID: string
    senderKeyPair: KeyPair // X25519 encryption keypair
    recipientDID: string
    recipientPublicKey: Uint8Array // X25519 public key from their DID document
  }): Promise<DMChannel>

  openChannel(params: {
    recipientDID: string
    recipientKeyPair: KeyPair
    senderDID: string
    senderPublicKey: Uint8Array
  }): Promise<DMChannel>
}
```

**Spec tests:**

```
e2ee.spec.ts
├── MLS Group Creation
│   ├── MUST create group with single member (creator)
│   ├── MUST assign epoch 0 on creation
│   ├── MUST assign leaf index 0 to creator
│   └── MUST export and reload group state
├── Key Packages
│   ├── MUST create valid key package from DID keypair
│   ├── MUST include Ed25519 signature key
│   ├── MUST include X25519 init key
│   ├── MUST include DID in leaf node
│   └── MUST verify key package signature
├── Add Member
│   ├── MUST produce Welcome for new member
│   ├── MUST produce Commit for existing members
│   ├── MUST increment epoch after commit
│   ├── MUST allow new member to decrypt after processing welcome
│   └── MUST NOT allow new member to decrypt messages from before join
├── Remove Member
│   ├── MUST produce Commit removing member
│   ├── MUST increment epoch after commit
│   ├── MUST NOT allow removed member to decrypt new messages
│   └── MUST allow remaining members to continue
├── Group Encryption
│   ├── MUST encrypt plaintext for all group members
│   ├── MUST decrypt ciphertext by any group member
│   ├── MUST include epoch and sender index in ciphertext
│   ├── MUST reject ciphertext from wrong epoch
│   ├── MUST reject ciphertext from non-member
│   └── MUST produce unique ciphertext for same plaintext (nonce)
├── Key Update
│   ├── MUST rotate sender's keys
│   ├── MUST increment epoch
│   ├── MUST allow decryption with new keys after commit
│   └── MUST NOT allow use of old keys for new messages
├── Multi-Member Scenarios
│   ├── MUST handle 3+ members joining sequentially
│   ├── MUST handle member leave + rejoin (new epoch, new keys)
│   ├── MUST handle concurrent key updates (deterministic merge)
│   └── MUST handle group with 50+ members (performance)
├── DM Encryption
│   ├── MUST create DM channel between two DIDs
│   ├── MUST encrypt/decrypt between sender and recipient
│   ├── MUST fail decryption by third party
│   ├── MUST use X25519 key agreement (from DID document keys)
│   └── MUST produce unique ciphertext per message (fresh nonce)
├── DM Channel Opening
│   ├── MUST open channel from recipient side
│   ├── MUST decrypt messages encrypted by sender
│   └── MUST allow bidirectional communication
└── Serialisation
    ├── MUST serialise MLSCiphertext for wire (protocol EncryptedContent)
    ├── MUST serialise Welcome for wire
    ├── MUST serialise Commit for wire
    └── MUST round-trip all types through JSON
```

**Implementation notes:**

- Phase 2 implements a simplified MLS-inspired protocol, not full RFC 9420 compliance. The interface is designed so a full MLS implementation (e.g., via `@nicolo-ribaudo/mls` or a Rust-compiled WASM module) can be swapped in later.
- The simplified version uses: ratchet tree for key derivation, AES-256-GCM or XChaCha20-Poly1305 for message encryption, HKDF for epoch key derivation.
- DM encryption uses `@harmony/crypto`'s X25519 + XChaCha20-Poly1305 directly — no MLS needed for 1:1.

---

### 4. `@harmony/server`

The WebSocket relay server. Accepts connections from authenticated clients, verifies ZCAP proofs, routes encrypted messages, persists ciphertext to the quad store, and manages presence. The server never sees plaintext message content.

**Isomorphic:** No — server-side only (Node.js). Uses `ws` or `uWebSockets.js`.

**Interface:**

```typescript
interface HarmonyServer {
  // Lifecycle
  start(config: ServerConfig): Promise<void>
  stop(): Promise<void>

  // Connection management (internal)
  onConnection(handler: ConnectionHandler): void
  broadcast(communityId: string, channelId: string, message: ProtocolMessage): void
  send(connectionId: string, message: ProtocolMessage): void

  // State
  connections(): ServerConnection[]
  communities(): string[]
}

interface ServerConfig {
  port: number
  host?: string
  store: QuadStore // for persistent message storage
  didResolver: DIDResolver // for resolving DIDs in ZCAP chains
  revocationStore: RevocationStore // for checking VC/ZCAP revocation
  federation?: FederationConfig
  moderation?: ModerationConfig
  maxConnections?: number
  rateLimit?: RateLimitConfig
}

interface ServerConnection {
  id: string
  did: string
  authenticatedAt: string
  communities: string[] // communities this connection is subscribed to
  presence: PresenceUpdatePayload
}

interface ConnectionHandler {
  onAuthenticate(conn: RawConnection, credential: VerifiablePresentation): Promise<AuthResult>
  onMessage(conn: ServerConnection, message: ProtocolMessage): Promise<void>
  onDisconnect(conn: ServerConnection): void
}

interface AuthResult {
  authenticated: boolean
  did?: string
  error?: string
}

// ── Community & Channel Management ──

interface CommunityManager {
  create(params: { name: string; description?: string; creatorDID: string; creatorKeyPair: KeyPair }): Promise<{
    communityId: string
    rootCapability: Capability
    membershipVC: VerifiableCredential
    defaultChannels: ChannelInfo[]
  }>

  join(params: {
    communityId: string
    memberDID: string
    membershipVC: VerifiableCredential
    encryptionPublicKey: Uint8Array
  }): Promise<{
    channels: ChannelInfo[]
    members: MemberInfo[]
    welcomeMessages: Map<string, Welcome> // channelId → MLS Welcome
  }>

  leave(communityId: string, memberDID: string): Promise<void>

  getInfo(communityId: string): Promise<CommunityInfo | null>
  getMembers(communityId: string): Promise<MemberInfo[]>
  getChannels(communityId: string): Promise<ChannelInfo[]>
}

interface CommunityInfo {
  id: string
  name: string
  description?: string
  icon?: string
  creatorDID: string
  createdAt: string
  memberCount: number
}

interface ChannelInfo {
  id: string
  communityId: string
  name: string
  type: 'text' | 'voice' | 'announcement'
  categoryId?: string
  topic?: string
  createdAt: string
}

interface MemberInfo {
  did: string
  displayName?: string
  roles: string[]
  joinedAt: string
  presence: PresenceUpdatePayload
}

// ── Message Storage ──

interface MessageStore {
  store(communityId: string, channelId: string, message: ProtocolMessage): Promise<void>
  getHistory(params: {
    communityId: string
    channelId: string
    before?: LamportClock
    after?: LamportClock
    limit: number
  }): Promise<ProtocolMessage[]>
  getMessage(messageId: string): Promise<ProtocolMessage | null>
  deleteMessage(messageId: string): Promise<void>
  search(params: {
    communityId: string
    channelId?: string
    // Note: search operates on metadata only (timestamps, author DIDs, message IDs)
    // Content search requires client-side decryption — server can't search ciphertext
    authorDID?: string
    before?: string
    after?: string
    limit: number
  }): Promise<ProtocolMessage[]>
}

// ── RPC Handlers ──
// Each message type maps to a handler that:
// 1. Validates the message envelope
// 2. Verifies the ZCAP proof (if required)
// 3. Persists to quad store
// 4. Broadcasts to subscribed connections
// 5. Forwards to federation peers (if applicable)
```

**Spec tests:**

```
server.spec.ts
├── Connection
│   ├── MUST accept WebSocket connections
│   ├── MUST require authentication (VP presentation) before accepting messages
│   ├── MUST reject connections with invalid VPs
│   ├── MUST assign connection ID on authenticate
│   ├── MUST track connection presence
│   └── MUST clean up on disconnect
├── Authentication
│   ├── MUST verify VP signature
│   ├── MUST resolve holder DID
│   ├── MUST reject expired VCs in VP
│   ├── MUST reject revoked VCs in VP
│   └── MUST set connection DID from VP holder
├── ZCAP Verification
│   ├── MUST verify ZCAP invocation proof on channel.send
│   ├── MUST verify ZCAP chain from root
│   ├── MUST reject expired ZCAPs
│   ├── MUST reject revoked ZCAPs
│   ├── MUST reject action not in allowed actions
│   └── MUST reject target outside scope
├── Message Routing
│   ├── MUST broadcast channel messages to all subscribed connections
│   ├── MUST route DMs to recipient connection only
│   ├── MUST persist messages to quad store
│   ├── MUST include Lamport clock in persisted messages
│   ├── MUST NOT expose message plaintext (content is EncryptedContent)
│   └── MUST handle offline recipients (store for later sync)
├── Community Management
│   ├── MUST create community with default channels
│   ├── MUST issue root capability to creator
│   ├── MUST issue membership VC to creator
│   ├── MUST allow joining with valid membership VC
│   ├── MUST distribute MLS Welcome on join
│   ├── MUST handle leave (remove from MLS groups)
│   └── MUST store community metadata as RDF quads
├── Channel Management
│   ├── MUST create channels (with ManageChannel ZCAP)
│   ├── MUST update channels (with ManageChannel ZCAP)
│   ├── MUST delete channels (with ManageChannel ZCAP)
│   └── MUST store channel metadata as RDF quads
├── Sync
│   ├── MUST return message history for sync.request
│   ├── MUST filter by since clock
│   ├── MUST paginate with limit
│   ├── MUST return hasMore flag
│   └── MUST return latest clock for client to track
├── Presence
│   ├── MUST broadcast presence changes to community members
│   ├── MUST set offline on disconnect
│   └── MUST handle idle timeout
├── Message Persistence as RDF
│   ├── MUST store messages as RDF quads
│   ├── MUST use channel as graph context
│   ├── MUST store clock as typed literal (xsd:integer)
│   ├── MUST store ciphertext reference (not plaintext)
│   └── MUST support history queries via quad store
└── Rate Limiting
    ├── MUST rate limit per connection
    ├── MUST return RATE_LIMITED error
    └── MUST respect per-community rate limits
```

---

### 5. `@harmony/client`

Isomorphic client SDK. Connects to a Harmony server via WebSocket, manages local state (community membership, channel subscriptions, message cache), handles E2EE encryption/decryption, and provides a reactive API for UI bindings.

**Isomorphic:** Yes — works in browser and Node.js. Uses standard `WebSocket` (available in both).

**Interface:**

```typescript
interface HarmonyClient {
  // Lifecycle
  connect(params: { serverUrl: string; identity: Identity; keyPair: KeyPair }): Promise<void>
  disconnect(): Promise<void>
  reconnect(): Promise<void>

  // State
  isConnected(): boolean
  myDID(): string
  communities(): CommunityState[]
  community(id: string): CommunityState | null

  // Community
  createCommunity(params: { name: string; description?: string; defaultChannels?: string[] }): Promise<CommunityState>
  joinCommunity(communityId: string): Promise<CommunityState>
  leaveCommunity(communityId: string): Promise<void>

  // Channels
  subscribeChannel(communityId: string, channelId: string): ChannelSubscription
  createChannel(communityId: string, params: ChannelCreatePayload): Promise<ChannelInfo>
  updateChannel(communityId: string, channelId: string, params: Partial<ChannelCreatePayload>): Promise<ChannelInfo>
  deleteChannel(communityId: string, channelId: string): Promise<void>

  // Messages
  sendMessage(
    communityId: string,
    channelId: string,
    text: string,
    options?: {
      replyTo?: string
      attachments?: File[]
    }
  ): Promise<string> // returns message ID
  editMessage(communityId: string, channelId: string, messageId: string, newText: string): Promise<void>
  deleteMessage(communityId: string, channelId: string, messageId: string): Promise<void>
  addReaction(communityId: string, channelId: string, messageId: string, emoji: string): Promise<void>
  removeReaction(communityId: string, channelId: string, messageId: string, emoji: string): Promise<void>

  // DMs
  sendDM(recipientDID: string, text: string, options?: { replyTo?: string }): Promise<string>
  editDM(recipientDID: string, messageId: string, newText: string): Promise<void>
  deleteDM(recipientDID: string, messageId: string): Promise<void>
  dmChannels(): DMChannelState[]

  // Threads
  createThread(
    communityId: string,
    channelId: string,
    parentMessageId: string,
    name: string,
    firstMessage: string
  ): Promise<string>
  sendThreadMessage(threadId: string, text: string, options?: { replyTo?: string }): Promise<string>

  // Presence
  setPresence(status: 'online' | 'idle' | 'dnd' | 'offline', customStatus?: string): Promise<void>

  // Sync
  syncChannel(communityId: string, channelId: string, options?: { since?: string; limit?: number }): Promise<void>

  // Events
  on(event: ClientEvent, handler: (...args: unknown[]) => void): Unsubscribe

  // Roles & moderation (admin)
  createRole(communityId: string, params: RoleCreatePayload): Promise<void>
  updateRole(communityId: string, roleId: string, params: Partial<RoleCreatePayload>): Promise<void>
  deleteRole(communityId: string, roleId: string): Promise<void>
  assignRole(communityId: string, memberDID: string, roleId: string): Promise<void>
  kickMember(communityId: string, memberDID: string, reason?: string): Promise<void>
  banMember(communityId: string, memberDID: string, reason?: string): Promise<void>
}

// ── Reactive State ──

interface CommunityState {
  id: string
  info: CommunityInfo
  channels: ChannelInfo[]
  members: MemberInfo[]
  myRoles: string[]
  myCapabilities: Capability[]
}

interface ChannelSubscription {
  messages: DecryptedMessage[] // reactive — updates as new messages arrive
  loading: boolean
  hasMore: boolean
  loadMore(limit?: number): Promise<void>
  sendTyping(): void
  unsubscribe(): void
}

interface DecryptedMessage {
  id: string
  channelId: string
  authorDID: string
  authorDisplayName?: string
  content: DecryptedContent
  timestamp: string
  clock: LamportClock
  replyTo?: DecryptedMessage
  reactions: Map<string, string[]> // emoji → DIDs
  edited: boolean
  editedAt?: string
  threadId?: string
  threadMessageCount?: number
}

interface DMChannelState {
  recipientDID: string
  recipientDisplayName?: string
  messages: DecryptedMessage[]
  unreadCount: number
  lastMessage?: DecryptedMessage
}

type ClientEvent =
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'message'
  | 'message.edited'
  | 'message.deleted'
  | 'dm'
  | 'dm.edited'
  | 'dm.deleted'
  | 'typing'
  | 'presence'
  | 'member.joined'
  | 'member.left'
  | 'member.kicked'
  | 'member.banned'
  | 'channel.created'
  | 'channel.updated'
  | 'channel.deleted'
  | 'role.created'
  | 'role.updated'
  | 'role.deleted'
  | 'community.updated'
  | 'error'

type Unsubscribe = () => void
```

**Spec tests:**

```
client.spec.ts
├── Connection
│   ├── MUST connect to server via WebSocket
│   ├── MUST authenticate with VP on connect
│   ├── MUST set isConnected() after auth success
│   ├── MUST auto-reconnect on disconnect (configurable backoff)
│   ├── MUST emit 'connected' event on successful connect
│   ├── MUST emit 'disconnected' event on disconnect
│   └── MUST queue messages during reconnect and flush on connect
├── Community
│   ├── MUST create community (sends community.create, processes response)
│   ├── MUST join community (sends community.join with VC)
│   ├── MUST leave community (sends community.leave)
│   ├── MUST track community state locally
│   ├── MUST update community state on server events
│   └── MUST list all joined communities
├── Channel Subscription
│   ├── MUST subscribe to channel (receives messages)
│   ├── MUST decrypt incoming messages using MLS group key
│   ├── MUST maintain message list in CRDT order
│   ├── MUST support loadMore (pagination via sync.request)
│   ├── MUST emit typing indicators
│   ├── MUST unsubscribe (stops receiving messages)
│   └── MUST handle channel not found gracefully
├── Sending Messages
│   ├── MUST encrypt message content with MLS group key
│   ├── MUST attach ZCAP invocation proof
│   ├── MUST include Lamport clock
│   ├── MUST include nonce for deduplication
│   ├── MUST optimistically add to local message list
│   ├── MUST reconcile on server confirmation
│   └── MUST handle send failure (remove optimistic message, show error)
├── DMs
│   ├── MUST encrypt with X25519 key agreement
│   ├── MUST decrypt incoming DMs
│   ├── MUST track DM channels
│   ├── MUST track unread counts
│   └── MUST handle DM with unknown DID (resolve via DID resolver)
├── Threads
│   ├── MUST create thread from message
│   ├── MUST send messages in thread
│   └── MUST track thread message count
├── Message Operations
│   ├── MUST edit messages (re-encrypt new content)
│   ├── MUST delete messages
│   ├── MUST add/remove reactions
│   └── MUST update local state for edits/deletes from others
├── Presence
│   ├── MUST send presence updates
│   ├── MUST track other members' presence
│   └── MUST set idle after inactivity timeout
├── Sync
│   ├── MUST sync channel history on subscribe
│   ├── MUST merge synced messages into CRDT log
│   ├── MUST handle gaps (missed messages)
│   └── MUST decrypt historical messages
├── Events
│   ├── MUST emit events for all server→client message types
│   ├── MUST allow multiple listeners per event
│   └── MUST unsubscribe correctly
├── Offline Queue
│   ├── MUST queue messages when disconnected
│   ├── MUST flush queue on reconnect
│   ├── MUST deduplicate on flush (server may have received before disconnect)
│   └── MUST include correct clocks in queued messages
└── E2EE Integration
    ├── MUST create MLS group when creating community
    ├── MUST process MLS Welcome when joining community
    ├── MUST update MLS group on member join/leave
    ├── MUST re-key on member removal
    └── MUST refuse to send if MLS group state is out of sync
```

---

### 6. `@harmony/federation`

Instance-to-instance federation. A community admin delegates a ZCAP to a remote instance, allowing it to relay messages and verify membership. Federated messages carry their ZCAP chain so the receiving instance can verify authorization locally.

**Isomorphic:** No — server-side only.

**Interface:**

```typescript
interface FederationPeer {
  instanceDID: string
  endpoint: string // WebSocket URL of the remote instance
  capabilities: Capability[] // ZCAPs granted to this peer
  status: 'connected' | 'disconnected' | 'pending'
  lastSeen: string
}

interface FederationManager {
  // Peer management
  addPeer(params: {
    instanceDID: string
    endpoint: string
    capability: Capability // ZCAP granting relay permission
  }): Promise<FederationPeer>
  removePeer(instanceDID: string): Promise<void>
  peers(): FederationPeer[]

  // Connection
  connectToPeer(instanceDID: string): Promise<void>
  disconnectFromPeer(instanceDID: string): Promise<void>

  // Message relay
  relayToFederated(communityId: string, message: ProtocolMessage): Promise<void>
  handleFederatedMessage(fromPeer: string, message: ProtocolMessage): Promise<{ accepted: boolean; error?: string }>

  // Sync
  syncWithPeer(instanceDID: string, communityId: string, since: LamportClock): Promise<ProtocolMessage[]>

  // Events
  on(event: FederationEvent, handler: (...args: unknown[]) => void): Unsubscribe
}

type FederationEvent = 'peer.connected' | 'peer.disconnected' | 'peer.message' | 'peer.sync' | 'peer.error'

interface FederationConfig {
  instanceDID: string
  instanceKeyPair: KeyPair
  maxPeers?: number
  syncIntervalMs?: number // periodic sync interval
  messageRelayTimeout?: number
}
```

**Spec tests:**

```
federation.spec.ts
├── Peer Management
│   ├── MUST add peer with ZCAP
│   ├── MUST reject peer without valid ZCAP
│   ├── MUST remove peer and revoke ZCAP
│   ├── MUST list active peers
│   └── MUST track peer connection status
├── Connection
│   ├── MUST connect to peer via WebSocket
│   ├── MUST authenticate with instance DID
│   ├── MUST present federation ZCAP on connect
│   ├── MUST handle peer disconnect gracefully
│   └── MUST auto-reconnect to known peers
├── Message Relay
│   ├── MUST relay channel messages to federated peers
│   ├── MUST include ZCAP chain in relayed messages
│   ├── MUST verify ZCAP chain on incoming federated messages
│   ├── MUST reject messages with invalid/expired ZCAP
│   ├── MUST reject messages with action not in allowed actions
│   ├── MUST NOT relay messages for non-federated communities
│   ├── MUST deliver relayed messages to local subscribers
│   └── MUST deduplicate relayed messages (same message from multiple peers)
├── Sync
│   ├── MUST sync missed messages from peer
│   ├── MUST merge federated messages into local CRDT log
│   ├── MUST handle clock divergence between instances
│   └── MUST respect sync rate limits
├── Authorization
│   ├── Federation ZCAP MUST be scoped to specific communities
│   ├── Federation ZCAP MUST support rate-limit caveat
│   ├── Revoking federation ZCAP MUST disconnect peer
│   └── MUST NOT allow federated peer to perform admin actions
└── Two-Instance Integration
    ├── Instance A creates community, federates with Instance B
    ├── User on Instance B joins federated community
    ├── Message from Instance A appears on Instance B
    ├── Message from Instance B appears on Instance A
    ├── Member join on Instance A notifies Instance B
    └── Defederation removes Instance B's access
```

---

### 7. `@harmony/moderation`

Moderation toolkit. Plugs into the server as middleware. Operates on metadata (not encrypted content) for server-side moderation, plus client-side content moderation for community-defined rules.

**Isomorphic:** Core moderation logic is isomorphic. Server integration is Node-only.

**Interface:**

```typescript
// ── Server-Side Moderation (metadata-based) ──

interface ModerationPlugin {
  // Lifecycle
  install(server: HarmonyServer): void

  // Rules (operate on metadata — server never sees content)
  addRule(communityId: string, rule: ModerationRule): void
  removeRule(communityId: string, ruleId: string): void
  getRules(communityId: string): ModerationRule[]

  // Actions
  handleMessage(communityId: string, message: ProtocolMessage): Promise<ModerationDecision>
  handleJoin(communityId: string, memberDID: string, membershipVC: VerifiableCredential): Promise<ModerationDecision>
}

type ModerationRule = SlowModeRule | RateLimitRule | AccountAgeRule | RaidDetectionRule | VCRequirementRule

interface SlowModeRule {
  id: string
  type: 'slowMode'
  channelId: string
  intervalSeconds: number // min seconds between messages per user
}

interface RateLimitRule {
  id: string
  type: 'rateLimit'
  scope: 'community' | 'channel'
  scopeId: string
  maxMessages: number
  windowSeconds: number
}

interface AccountAgeRule {
  id: string
  type: 'accountAge'
  minAgeSeconds: number // minimum DID age to post
  action: 'block' | 'flag'
}

interface RaidDetectionRule {
  id: string
  type: 'raidDetection'
  joinThreshold: number // N joins within window triggers lockdown
  windowSeconds: number
  lockdownDurationSeconds: number
  action: 'lockdown' | 'alert'
}

interface VCRequirementRule {
  id: string
  type: 'vcRequirement'
  requiredVCTypes: string[] // e.g. ['DiscordIdentityCredential']
  action: 'block' | 'flag' // block join or flag for review
}

interface ModerationDecision {
  allowed: boolean
  reason?: string
  action?: 'none' | 'block' | 'flag' | 'slowMode' | 'rateLimit' | 'lockdown'
  rule?: ModerationRule
}

// ── Client-Side Moderation (content-based, runs after decryption) ──

interface ContentFilter {
  check(content: DecryptedContent): ContentFilterResult
}

interface ContentFilterResult {
  passed: boolean
  flags: ContentFlag[]
}

interface ContentFlag {
  type: 'spam' | 'nsfw' | 'toxic' | 'custom'
  confidence: number // 0-1
  rule: string
}

// ── Moderation Log ──

interface ModerationLog {
  log(entry: ModerationLogEntry): Promise<void>
  query(params: {
    communityId: string
    actionType?: string
    targetDID?: string
    since?: string
    limit?: number
  }): Promise<ModerationLogEntry[]>
}

interface ModerationLogEntry {
  id: string
  communityId: string
  moderatorDID: string
  targetDID: string
  action: 'kick' | 'ban' | 'mute' | 'warn' | 'slowMode' | 'raidLockdown'
  reason?: string
  timestamp: string
  expiresAt?: string // for temporary actions
  zcapProof?: ZCAPInvocationProof // proof the moderator was authorized
}
```

**Spec tests:**

```
moderation.spec.ts
├── Slow Mode
│   ├── MUST enforce minimum interval between messages per user
│   ├── MUST allow messages after interval expires
│   ├── MUST scope to specific channel
│   └── MUST not affect other channels
├── Rate Limiting
│   ├── MUST block messages exceeding rate limit
│   ├── MUST reset after window expires
│   ├── MUST scope to community or channel
│   └── MUST track per-user
├── Account Age
│   ├── MUST block/flag messages from new DIDs
│   ├── MUST allow messages from old DIDs
│   └── MUST calculate age from DID creation (VC issuance date)
├── Raid Detection
│   ├── MUST detect N joins within window
│   ├── MUST trigger lockdown action
│   ├── MUST auto-release lockdown after duration
│   └── MUST alert admins on raid detection
├── VC Requirements
│   ├── MUST block join without required VC types
│   ├── MUST allow join with required VCs
│   ├── MUST support multiple required types (AND logic)
│   └── MUST verify VC validity (not just presence)
├── Moderation Log
│   ├── MUST log all moderation actions
│   ├── MUST include moderator DID and ZCAP proof
│   ├── MUST query by community, action type, target
│   └── MUST store as RDF quads
├── Content Filter (client-side)
│   ├── MUST check decrypted content against patterns
│   ├── MUST return confidence scores
│   ├── MUST support custom rules
│   └── MUST not send content to server
└── Rule Management
    ├── MUST add rules per community
    ├── MUST remove rules by ID
    ├── MUST list rules for community
    └── MUST require ManageChannel or ManageRoles ZCAP to modify rules
```

---

### 8. `@harmony/ui`

SolidJS web application. The chat interface. Uses `@harmony/client` for all state and network operations. Styled with Tailwind CSS (matching the template monorepo).

**Isomorphic:** No — browser-only. SolidJS + Vite.

**Interface (components):**

```
Components:
├── App                          ← root layout, routing, auth state
├── Auth/
│   ├── LoginView                ← create identity or recover from mnemonic
│   ├── LinkDiscordView          ← OAuth linking flow
│   └── MnemonicBackupView       ← display/confirm mnemonic
├── Community/
│   ├── CommunityList            ← sidebar: list of joined communities
│   ├── CommunityHeader          ← community name, settings icon, member count
│   ├── CommunitySettings        ← name, description, icon, roles, moderation
│   ├── CreateCommunityDialog    ← create new community
│   ├── JoinCommunityDialog      ← join via invite link / community ID
│   └── MemberList               ← sidebar: members with presence indicators
├── Channel/
│   ├── ChannelList              ← sidebar: channels grouped by category
│   ├── ChannelHeader            ← channel name, topic, pinned messages
│   ├── MessageList              ← virtualized message list (CRDT-ordered)
│   ├── MessageComposer          ← input box with typing indicator, attachments
│   ├── Message                  ← single message: avatar, content, reactions, reply
│   ├── MessageReactions         ← reaction bar under message
│   ├── MessageContextMenu       ← right-click: edit, delete, reply, react, pin
│   ├── ThreadPanel              ← slide-out panel for thread view
│   └── TypingIndicator          ← "Alice is typing..."
├── DM/
│   ├── DMList                   ← sidebar: DM conversations
│   ├── DMView                   ← full DM conversation (reuses MessageList)
│   └── NewDMDialog              ← start DM with a DID
├── Identity/
│   ├── ProfileView              ← your identity: DID, credentials, linked accounts
│   ├── UserCard                 ← hover card for other users: DID, VCs, roles
│   └── CredentialBadge          ← visual badge for a VC (Discord, GitHub, etc.)
├── Migration/
│   ├── ImportWizard             ← step-by-step migration from Discord
│   └── ExportView               ← export community data
├── Settings/
│   ├── AppSettings              ← theme, notifications, presence defaults
│   └── KeyManagement            ← mnemonic backup, sync chain, social recovery setup
└── Shared/
    ├── Avatar                   ← user avatar (generated from DID if no image)
    ├── Tooltip
    ├── Modal
    ├── ContextMenu
    ├── Toast
    └── VirtualScroller          ← efficient rendering for large message lists
```

**Spec tests (Playwright + Storybook):**

```
ui.spec.ts (Playwright e2e)
├── Authentication
│   ├── MUST create new identity and display mnemonic
│   ├── MUST recover identity from mnemonic
│   ├── MUST persist identity across page reload
│   └── MUST initiate Discord OAuth linking
├── Community
│   ├── MUST create community with default channels
│   ├── MUST display community in sidebar after creation
│   ├── MUST join community and display channels
│   ├── MUST leave community and remove from sidebar
│   └── MUST display member list with presence
├── Messaging
│   ├── MUST send message and display in channel
│   ├── MUST receive message from another user
│   ├── MUST display messages in CRDT order
│   ├── MUST edit own message
│   ├── MUST delete own message
│   ├── MUST reply to message (shows reply chain)
│   ├── MUST add/remove reactions
│   ├── MUST display typing indicator
│   └── MUST load message history on scroll
├── DMs
│   ├── MUST send DM to another user
│   ├── MUST receive DM
│   ├── MUST display DM conversations in sidebar
│   └── MUST show unread count
├── Threads
│   ├── MUST create thread from message
│   ├── MUST send messages in thread panel
│   └── MUST display thread message count on parent
├── E2EE
│   ├── MUST display lock icon on encrypted channels
│   ├── MUST show error if decryption fails
│   └── MUST NOT send plaintext content over network (verify via network tab)
└── Migration
    ├── MUST walk through import wizard steps
    └── MUST display imported data after migration
```

**Storybook stories for all components** — visual regression testing and component documentation.

---

## Ontology Extensions (Phase 2)

Extend the Harmony vocabulary for chat-specific concepts:

```turtle
@prefix harmony: <https://harmony.example/vocab#> .

# Phase 2 additions
harmony:EncryptedMessage   rdfs:subClassOf  harmony:Message .
harmony:DirectMessage      rdfs:subClassOf  harmony:Message .
harmony:ThreadMessage      rdfs:subClassOf  harmony:Message .

# Message metadata (server-visible)
harmony:clock              rdfs:domain  harmony:Message ;     rdfs:range  xsd:integer .
harmony:nonce              rdfs:domain  harmony:Message ;     rdfs:range  xsd:string .
harmony:epoch              rdfs:domain  harmony:Message ;     rdfs:range  xsd:integer .
harmony:ciphertextRef      rdfs:domain  harmony:Message ;     rdfs:range  xsd:string .
harmony:editedAt           rdfs:domain  harmony:Message ;     rdfs:range  xsd:dateTime .
harmony:deletedAt          rdfs:domain  harmony:Message ;     rdfs:range  xsd:dateTime .

# Presence
harmony:Presence           rdfs:subClassOf  rdfs:Resource .
harmony:presenceStatus     rdfs:domain  harmony:Member ;      rdfs:range  xsd:string .
harmony:customStatus       rdfs:domain  harmony:Member ;      rdfs:range  xsd:string .
harmony:lastSeen           rdfs:domain  harmony:Member ;      rdfs:range  xsd:dateTime .

# Federation
harmony:FederationPeer     rdfs:subClassOf  rdfs:Resource .
harmony:peerEndpoint       rdfs:domain  harmony:FederationPeer ; rdfs:range  xsd:string .
harmony:peerDID            rdfs:domain  harmony:FederationPeer ; rdfs:range  did:DID .
harmony:federatedWith      rdfs:domain  harmony:Community ;   rdfs:range  harmony:FederationPeer .

# Moderation
harmony:ModerationAction   rdfs:subClassOf  rdfs:Resource .
harmony:moderator          rdfs:domain  harmony:ModerationAction ; rdfs:range  did:DID .
harmony:moderationTarget   rdfs:domain  harmony:ModerationAction ; rdfs:range  did:DID .
harmony:moderationReason   rdfs:domain  harmony:ModerationAction ; rdfs:range  xsd:string .
harmony:moderationExpiry   rdfs:domain  harmony:ModerationAction ; rdfs:range  xsd:dateTime .

# New ZCAP actions
harmony:ReadChannel        rdf:type  zcap:Action .
harmony:CreateThread       rdf:type  zcap:Action .
harmony:SendDM             rdf:type  zcap:Action .
harmony:ManageMembers      rdf:type  zcap:Action .
harmony:FederateRelay      rdf:type  zcap:Action .
harmony:FederateVerify     rdf:type  zcap:Action .
harmony:ModerateContent    rdf:type  zcap:Action .
```

---

## Project Structure (Phase 2 additions)

```
harmony/
├── packages/
│   ├── ... (Phase 1 packages unchanged)
│   │
│   ├── protocol/
│   │   ├── src/
│   │   │   ├── index.ts                 # all type exports
│   │   │   ├── messages.ts              # MessageType, payloads
│   │   │   ├── events.ts                # client/server events
│   │   │   ├── errors.ts                # error codes
│   │   │   └── serialisation.ts         # JSON ↔ Uint8Array helpers
│   │   ├── test/
│   │   │   └── protocol.spec.ts
│   │   └── package.json
│   │
│   ├── crdt/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── clock.ts                 # LamportClock operations
│   │   │   ├── log.ts                   # CRDTLog implementation
│   │   │   └── ops.ts                   # EditOp, DeleteOp, CRDTOpLog
│   │   ├── test/
│   │   │   └── crdt.spec.ts
│   │   └── package.json
│   │
│   ├── e2ee/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── mls.ts                   # MLSProvider, MLSGroup
│   │   │   ├── dm.ts                    # DMProvider, DMChannel
│   │   │   ├── tree.ts                  # ratchet tree for key derivation
│   │   │   └── keypackage.ts            # KeyPackage creation/verification
│   │   ├── test/
│   │   │   ├── mls.spec.ts
│   │   │   └── dm.spec.ts
│   │   └── package.json
│   │
│   ├── server/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── server.ts                # WebSocket server
│   │   │   ├── connection.ts            # connection management
│   │   │   ├── auth.ts                  # VP authentication
│   │   │   ├── community.ts             # CommunityManager
│   │   │   ├── messages.ts              # MessageStore, message handlers
│   │   │   ├── presence.ts              # presence tracking
│   │   │   ├── sync.ts                  # sync handler
│   │   │   └── handlers/
│   │   │       ├── channel.ts           # channel.send, channel.edit, etc.
│   │   │       ├── dm.ts                # dm.send, dm.edit, etc.
│   │   │       ├── community.ts         # community.create, community.join, etc.
│   │   │       ├── thread.ts            # thread.create, thread.send
│   │   │       └── admin.ts             # role/channel/member management
│   │   ├── test/
│   │   │   ├── server.spec.ts
│   │   │   ├── community.spec.ts
│   │   │   ├── messages.spec.ts
│   │   │   └── auth.spec.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── client/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── client.ts                # HarmonyClient implementation
│   │   │   ├── connection.ts            # WebSocket connection + reconnect
│   │   │   ├── state.ts                 # local state management
│   │   │   ├── encryption.ts            # E2EE integration (MLS + DM)
│   │   │   ├── sync.ts                  # channel sync logic
│   │   │   └── events.ts               # event emitter
│   │   ├── test/
│   │   │   ├── client.spec.ts
│   │   │   └── encryption.spec.ts
│   │   └── package.json
│   │
│   ├── federation/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── manager.ts              # FederationManager
│   │   │   ├── peer.ts                 # peer connection handling
│   │   │   ├── relay.ts                # message relay logic
│   │   │   └── sync.ts                 # inter-instance sync
│   │   ├── test/
│   │   │   └── federation.spec.ts
│   │   └── package.json
│   │
│   ├── moderation/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── plugin.ts               # ModerationPlugin
│   │   │   ├── rules/
│   │   │   │   ├── slowMode.ts
│   │   │   │   ├── rateLimit.ts
│   │   │   │   ├── accountAge.ts
│   │   │   │   ├── raidDetection.ts
│   │   │   │   └── vcRequirement.ts
│   │   │   ├── contentFilter.ts        # client-side content filtering
│   │   │   └── log.ts                  # moderation log
│   │   ├── test/
│   │   │   ├── rules.spec.ts
│   │   │   ├── raidDetection.spec.ts
│   │   │   └── contentFilter.spec.ts
│   │   └── package.json
│   │
│   └── ui/
│       ├── src/
│       │   ├── index.tsx
│       │   ├── App.tsx
│       │   ├── components/
│       │   │   ├── Auth/
│       │   │   ├── Community/
│       │   │   ├── Channel/
│       │   │   ├── DM/
│       │   │   ├── Identity/
│       │   │   ├── Migration/
│       │   │   ├── Settings/
│       │   │   └── Shared/
│       │   ├── stores/                  # SolidJS reactive stores wrapping @harmony/client
│       │   │   ├── auth.ts
│       │   │   ├── community.ts
│       │   │   ├── channel.ts
│       │   │   ├── dm.ts
│       │   │   └── presence.ts
│       │   ├── hooks/                   # SolidJS primitives
│       │   │   ├── useClient.ts
│       │   │   ├── useChannel.ts
│       │   │   └── usePresence.ts
│       │   └── index.css
│       ├── test/
│       │   └── ui.spec.ts              # Playwright
│       ├── .storybook/
│       ├── index.html
│       ├── vite.config.ts
│       ├── tailwind.config.ts
│       └── package.json
```

---

## Build Order

```
Week 1:  @harmony/protocol + @harmony/crdt
         ─── types: wire protocol, CRDT message ordering
         ─── zero runtime deps, pure logic, fast to build

Week 2:  @harmony/e2ee
         ─── crypto: MLS group encryption, DM encryption
         ─── depends on @harmony/crypto

Week 3:  @harmony/server (core) + @harmony/moderation
         ─── relay: WebSocket server, auth, message routing, ZCAP verification
         ─── moderation: rules engine, server-side plugin
         ─── depends on protocol, crdt, e2ee, all Phase 1 packages

Week 4:  @harmony/client
         ─── SDK: WebSocket client, local state, E2EE integration, sync
         ─── depends on protocol, crdt, e2ee

Week 5:  @harmony/federation
         ─── network: instance-to-instance relay, ZCAP-gated, sync
         ─── depends on server, protocol

Week 6:  @harmony/ui (scaffold + core views)
         ─── SolidJS: auth, community list, channel view, message composer
         ─── depends on client

Week 7:  @harmony/ui (features) + integration
         ─── DMs, threads, presence, moderation UI, migration wizard
         ─── end-to-end integration testing

Week 8:  Polish + deployment
         ─── Docker compose (server + cloud), PWA manifest, performance
```

---

## End-to-End Test Scenarios

```
e2e-phase2.spec.ts
├── Full Chat Flow
│   ├── Alice creates identity and community
│   ├── Bob creates identity and joins community
│   ├── Alice sends message in #general → Bob receives it
│   ├── Bob replies → Alice sees reply with thread
│   ├── Alice edits her message → Bob sees edit
│   ├── Bob reacts → Alice sees reaction
│   ├── Alice deletes her message → Bob sees deletion
│   └── All messages are E2EE (server only stores ciphertext)
│
├── DM Flow
│   ├── Alice sends DM to Bob
│   ├── Bob receives DM, replies
│   ├── DM appears in both users' DM lists
│   └── DM is E2EE (X25519 key agreement from DID documents)
│
├── Thread Flow
│   ├── Alice creates thread from a message
│   ├── Bob sends message in thread
│   ├── Thread message count updates on parent
│   └── Thread panel shows full conversation
│
├── Offline + Sync
│   ├── Bob disconnects
│   ├── Alice sends 5 messages while Bob is offline
│   ├── Bob reconnects → syncs all 5 messages in CRDT order
│   ├── Bob sent a message while offline → merges into correct position
│   └── No duplicate messages after sync
│
├── Federation
│   ├── Instance A creates community, federates with Instance B
│   ├── User on Instance B joins federated community
│   ├── Message from Instance A user → appears on Instance B
│   ├── Message from Instance B user → appears on Instance A
│   ├── CRDT ordering is consistent across both instances
│   ├── Instance A defederates → Instance B loses access
│   └── Federation ZCAP revocation is immediate
│
├── Moderation
│   ├── Admin enables slow mode on #general (10s interval)
│   ├── User tries to send two messages within 10s → second blocked
│   ├── Admin enables VC requirement (DiscordIdentityCredential)
│   ├── User without Discord VC tries to join → blocked
│   ├── Raid detection: 20 joins in 60s → community locks down
│   ├── Admin kicks user → user can no longer send
│   ├── Admin bans user → membership VC revoked, ZCAP revoked
│   └── All moderation actions logged with ZCAP proof
│
├── E2EE Lifecycle
│   ├── Community created → MLS group initialised (epoch 0)
│   ├── Member joins → MLS Welcome sent, epoch increments
│   ├── Member leaves → MLS remove, epoch increments, re-key
│   ├── Banned member cannot decrypt new messages
│   ├── New member cannot decrypt messages from before join
│   └── Key rotation triggered by admin → all members update
│
├── Migration → Chat
│   ├── Community migrated from Discord (Phase 1)
│   ├── Imported messages visible in channel view
│   ├── New messages append after imported history
│   ├── Members who've linked Discord IDs see their old messages attributed
│   └── Discord identity badge visible on user cards
│
└── Multi-Device
    ├── User connects from two devices (same identity via sync chain)
    ├── Message sent from device A appears on device B
    ├── Presence shows online (not double-online)
    └── MLS group handles same user on multiple devices (multi-leaf)
```

---

## Phase 1 → Phase 2 Integration Points

The following Phase 1 packages are consumed but NOT modified:

| Phase 1 Package | Phase 2 Consumer | How |
| --- | --- | --- |
| `@harmony/crypto` | `@harmony/e2ee` | Key generation, signing, encryption primitives |
| `@harmony/quads` | `@harmony/server` | Message persistence, community/channel metadata storage |
| `@harmony/did` | `@harmony/server`, `@harmony/client` | DID resolution for ZCAP chain verification |
| `@harmony/vc` | `@harmony/server`, `@harmony/moderation` | Membership VC verification, admission policies |
| `@harmony/zcap` | `@harmony/server`, `@harmony/federation` | Authorization for every action |
| `@harmony/identity` | `@harmony/client` | Identity management, sync chain, recovery |
| `@harmony/vocab` | All Phase 2 packages | Ontology constants, namespace URIs |
| `@harmony/cloud` | `@harmony/ui` (optional) | OAuth gateway for identity linking |

Phase 1 packages are **dependencies**, not modification targets. If Phase 2 needs new functionality from Phase 1 (e.g., new VC types, new ZCAP actions), it extends via the vocab package and composition — not by modifying Phase 1 source.

---

_This document defines the Phase 2 implementation. Each module spec is the source of truth for what gets built. Tests pass → module is done._
