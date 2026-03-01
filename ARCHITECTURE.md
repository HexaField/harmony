# Harmony Platform Architecture

> A sovereign, decentralized real-time communication platform built on DIDs, Verifiable Credentials, ZCAP authorization, and end-to-end encryption.

---

## 1. System Overview

Harmony runs across five deployment targets sharing a common UI and protocol layer.

```mermaid
graph TB
    subgraph Clients
        Electron["Electron Desktop App<br/>(BrowserWindow + ServerRuntime)"]
        WebUI["Web UI<br/>(SPA via WebSocket)"]
        Mobile["Mobile<br/>(Capacitor Android/iOS)"]
    end

    subgraph Self-Hosted
        ServerRuntime["server-runtime<br/>(Node.js daemon)"]
        SQLite[(SQLite QuadStore)]
        ServerRuntime --- SQLite
    end

    subgraph Cloudflare
        CloudWorker["Cloud Worker<br/>(Durable Objects)"]
        CommunityDO["CommunityDurableObject<br/>(DO SQLite + Hibernatable WS)"]
        VoiceRoomDO["VoiceRoomDO"]
        CloudWorker --- CommunityDO
        CloudWorker --- VoiceRoomDO

        PortalWorker["Portal Worker"]
        D1[(D1 Identity Store)]
        R2[(R2 Export Store)]
        KV[(KV Rate Limiter)]
        PortalWorker --- D1
        PortalWorker --- R2
        PortalWorker --- KV
    end

    Electron -->|embeds| ServerRuntime
    WebUI -->|WebSocket| ServerRuntime
    WebUI -->|WebSocket| CloudWorker
    Mobile -->|WebSocket| ServerRuntime
    Mobile -->|WebSocket| CloudWorker
    ServerRuntime -->|federation| ServerRuntime
    ServerRuntime -.->|identity lookup| PortalWorker
    CloudWorker -.->|identity lookup| PortalWorker
```

> Note: The Electron app embeds `ServerRuntime` in the main process — it functions as both client and server simultaneously. Web and Mobile clients connect to remote servers.

### Deployment Target Summary

```mermaid
graph LR
    UIApp["@harmony/ui-app<br/>(SolidJS SPA)"]

    UIApp -->|BrowserWindow| Electron["Electron<br/>+ embedded server<br/>+ SQLite"]
    UIApp -->|served as SPA| Web["Web Browser"]
    UIApp -->|Capacitor shell| Mobile["Android / iOS<br/>+ native push<br/>+ biometric"]
```

---

## 2. Package Dependency Graph

36 packages organised in five layers. Key dependency edges shown (not exhaustive).

### Core Layer

```mermaid
graph LR
    crypto["@harmony/crypto<br/>(Ed25519, X25519, HKDF)"]
    did["@harmony/did<br/>(DID:key creation)"]
    quads["@harmony/quads<br/>(RDF quad store)"]
    vocab["@harmony/vocab<br/>(namespaces, predicates)"]
    crdt["@harmony/crdt<br/>(Lamport clocks)"]
    protocol["@harmony/protocol<br/>(message types)"]

    did --> crypto
    quads --> vocab
    protocol --> crdt
```

### Identity, Auth & Communication Layers

```mermaid
graph TB
    subgraph "Identity & Auth"
        identity["@harmony/identity"]
        vc["@harmony/vc"]
        zcap["@harmony/zcap"]
        credentials["@harmony/credentials"]
    end

    subgraph Communication
        client["@harmony/client"]
        server["@harmony/server"]
        e2ee["@harmony/e2ee"]
        voice["@harmony/voice"]
        search["@harmony/search"]
        media["@harmony/media"]
        moderation["@harmony/moderation"]
    end

    identity --> did
    identity --> crypto
    vc --> crypto
    vc --> did
    zcap --> crypto
    credentials --> vc
    credentials --> zcap

    client --> protocol
    client --> e2ee
    client --> identity
    server --> protocol
    server --> quads
    server --> vc
    server --> zcap
    server --> moderation
    e2ee --> crypto
    voice --> protocol
    media --> e2ee
```

### Infrastructure & Application Layers

```mermaid
graph TB
    subgraph Infrastructure
        serverRuntime["@harmony/server-runtime"]
        cloud["@harmony/cloud"]
        cloudWorker["@harmony/cloud-worker"]
        portal["@harmony/portal"]
        portalWorker["@harmony/portal-worker"]
        federation["@harmony/federation"]
    end

    subgraph Applications
        app["@harmony/app (Electron)"]
        uiApp["@harmony/ui-app (SolidJS)"]
        ui["@harmony/ui (components)"]
        cli["@harmony/cli"]
        cliApp["@harmony/cli-app"]
        mobile["@harmony/mobile"]
    end

    subgraph Migration
        migration["@harmony/migration"]
        migrationBot["@harmony/migration-bot"]
        discordBot["@harmony/discord-bot"]
    end

    subgraph Governance
        governance["@harmony/governance"]
        botApi["@harmony/bot-api"]
    end

    serverRuntime --> server
    cloudWorker --> cloud
    cloudWorker --> server
    portalWorker --> portal
    app --> serverRuntime
    app --> uiApp
    uiApp --> ui
    uiApp --> client
    mobile --> uiApp
    cliApp --> cli
    cli --> client
    migration --> quads
    migrationBot --> migration
    federation --> server
    federation --> protocol
```

---

## 3. Identity & DID System

### DID Creation Flow

```mermaid
flowchart LR
    A["Generate Mnemonic<br/>(BIP-39, 24 words)"] --> B["Derive Seed<br/>(PBKDF2)"]
    B --> C["Ed25519 Keypair<br/>(@harmony/crypto)"]
    C --> D["DID:key Document<br/>(@harmony/did)"]
    D --> E["Identity Object<br/>(@harmony/identity)"]
    E --> F{"Storage Target"}
    F -->|Browser/Mobile| G["localStorage"]
    F -->|Electron/Server| H["Config File"]
```

### DID Document Structure

```mermaid
graph TB
    DIDDoc["DID Document"]
    DIDDoc --> id["id: did:key:z6Mk..."]
    DIDDoc --> vm["verificationMethod"]
    DIDDoc --> ka["keyAgreement"]

    vm --> vmEntry["Ed25519VerificationKey2020<br/>(signing)"]
    ka --> kaEntry["X25519KeyAgreementKey2020<br/>(encryption / DH)"]
```

### Social Recovery Flow

```mermaid
sequenceDiagram
    participant Owner
    participant Guardian1
    participant Guardian2
    participant Server

    Note over Owner: Setup Phase
    Owner->>Server: Register guardian DIDs (threshold: 2/3)

    Note over Owner: Recovery Phase
    Owner->>Guardian1: Request recovery approval
    Owner->>Guardian2: Request recovery approval
    Guardian1->>Server: Approve recovery (signed)
    Guardian2->>Server: Approve recovery (signed)
    Server->>Owner: Threshold met — recovery key released
    Owner->>Owner: Reconstruct identity from new mnemonic + recovery
```

> Note: `@harmony/crypto` provides all primitives (Ed25519, X25519, HKDF). `@harmony/did` creates DID documents. `@harmony/identity` manages the full lifecycle including persistence and recovery.

---

## 4. Verifiable Credentials (VCs)

### VC Issuance & Verification

```mermaid
sequenceDiagram
    participant Issuer
    participant Subject
    participant Verifier

    Issuer->>Issuer: Create VC (type, subject, claims)
    Issuer->>Issuer: Sign with Ed25519 private key
    Issuer->>Subject: Deliver signed VC

    Subject->>Subject: Bundle VCs into VP
    Subject->>Subject: Sign VP with holder key
    Subject->>Verifier: Present VP

    Verifier->>Verifier: Verify VP signature
    Verifier->>Verifier: Verify each VC signature
    Verifier->>Verifier: Check revocation status
    Verifier->>Verifier: Check expiry
    Verifier->>Verifier: ✓ Accept or ✗ Reject
```

### VC Types & Policy

```mermaid
graph TB
    subgraph "VC Types"
        IC["IdentityCredential<br/>(username, avatar)"]
        MC["MembershipCredential<br/>(community access)"]
    end

    subgraph "Issuer Policies"
        Open["open<br/>(anyone can issue)"]
        AdminOnly["admin-only<br/>(admin DIDs only)"]
        RoleBased["role-based<br/>(requiredRole check)"]
    end

    MC -.->|gated by| AdminOnly
    MC -.->|gated by| RoleBased
    IC -.->|gated by| Open
```

> Note: Revocation store is currently in-memory. Future work includes persistent revocation, VC-based community admission gates, cross-community trust chains, and E2EE key binding to VCs.

---

## 5. ZCAP (Authorization Capabilities)

### Capability Delegation Chain

```mermaid
flowchart TD
    Root["Root Capability<br/>(community creator)<br/>actions: [*]<br/>scope: { community: id, channel: * }"]
    Root -->|delegate + attenuate| Admin["Admin Capability<br/>actions: [message.send, channel.create, ...]<br/>scope: { community: id, channel: * }"]
    Admin -->|delegate + attenuate| Member["Member Capability<br/>actions: [message.send]<br/>scope: { community: id, channel: general }"]
```

### Server ZCAP Verification

```mermaid
flowchart LR
    Req["Incoming Mutation"] --> A["Verify Invoker Signature"]
    A -->|✗| Deny["403 Denied"]
    A -->|✓| B["Check Scope Matches"]
    B -->|✗| Deny
    B -->|✓| C["Check Action Allowed"]
    C -->|✗| Deny
    C -->|✓| D["Check Revocation"]
    D -->|revoked| Deny
    D -->|✓| E["Walk Parent Chain"]
    E -->|invalid| Deny
    E -->|✓| Allow["✓ Execute"]
```

> Note: Every mutation passes through ZCAP verification. Caveats (time-limited, rate-limited) are designed but not yet enforced.

---

## 6. Authentication Flow (VP Handshake)

```mermaid
sequenceDiagram
    participant Client
    participant Server

    Client->>Server: WebSocket connect
    Client->>Client: Bundle VCs into VP, sign with DID key
    Client->>Server: sync.state { presentation: VP }

    Server->>Server: Verify VP signature
    Server->>Server: Resolve DID document
    Server->>Server: Verify proof against public key
    Server->>Server: Bind connection to holder DID

    Server->>Client: sync.state.response { communities, channels, members }

    Note over Client,Server: All subsequent messages<br/>authenticated by bound DID
```

> Note: The VP handshake replaces traditional username/password login. The server never sees private keys — only signed proofs.

---

## 7. End-to-End Encryption

### 7a. MLS for Channel Messages

```mermaid
sequenceDiagram
    participant Alice
    participant Server
    participant Bob

    Note over Alice: Creates community
    Alice->>Server: mls.group.setup (groupId = communityId:channelId)

    Note over Bob: Joins community
    Bob->>Server: Upload KeyPackage (did, sigKey, encKey, sig)
    Server->>Alice: mls.member.joined (Bob's DID)

    Alice->>Server: Fetch Bob's KeyPackage
    Alice->>Alice: group.addMember(Bob)
    Alice->>Server: Welcome (to Bob) + Commit (broadcast)

    Bob->>Bob: joinFromWelcome(welcome, encKP, sigKP)
    Note over Alice,Bob: Shared epoch secret established

    Alice->>Alice: group.encrypt(plaintext)
    Alice->>Server: MLSCiphertext { groupId, epoch, senderIndex, ciphertext }
    Server->>Bob: Forward MLSCiphertext
    Bob->>Bob: group.decrypt(ciphertext)
```

### MLS Epoch Model

```mermaid
graph LR
    E0["Epoch 0<br/>(plaintext — backward compat)"]
    E0 -->|addMember / removeMember| E1["Epoch 1<br/>(MLS encrypted)"]
    E1 -->|member change| E2["Epoch 2"]
    E2 -->|member change| EN["Epoch N"]

    PQ["Pending Queue<br/>(messages before Welcome)"]
    PQ -.->|replayed after join| E1
```

> Note: Epoch 0 means plaintext (for backward compatibility). Epoch > 0 = MLS encrypted. `processCommit` guards against stale epochs. Client dedup via `_pendingMemberDIDs` Map.

### 7b. DM Encryption (X25519 + XChaCha20-Poly1305)

```mermaid
sequenceDiagram
    participant Alice
    participant Server
    participant Bob

    Alice->>Server: Fetch Bob's encryption public key (X25519)
    Alice->>Alice: X25519 ECDH → shared secret
    Alice->>Alice: XChaCha20-Poly1305 encrypt (random nonce)
    Alice->>Server: Encrypted DM (addressed by DID)
    Server->>Bob: Forward (server is blind relay)
    Bob->>Bob: X25519 ECDH → same shared secret
    Bob->>Bob: Decrypt with nonce
```

### 7c. Media Encryption

```mermaid
flowchart TD
    Upload["Upload Media"]
    Upload --> HasMLS{"MLS Group Available?"}
    HasMLS -->|Yes| MLSKey["deriveMediaKey()"]
    HasMLS -->|No| HKDF["HKDF Fallback Key"]
    MLSKey --> Encrypt["Encrypt Media"]
    HKDF --> Encrypt
    Encrypt --> Store["Upload Ciphertext"]

    Download["Download Media"] --> Fetch["Fetch Ciphertext"]
    Fetch --> Decrypt["Decrypt with same key derivation"]
```

---

## 8. Message Flow & Protocol

### Channel Message Path

```mermaid
sequenceDiagram
    participant Sender
    participant Server
    participant MemberA
    participant MemberB

    Sender->>Server: ProtocolMessage { id, type: "message.send", timestamp, sender: DID, payload }
    Server->>Server: ZCAP check
    Server->>Server: Moderation check
    Server->>Server: Lamport clock merge
    Server->>Server: Store as RDF quads
    Server->>MemberA: Broadcast (exclude sender)
    Server->>MemberB: Broadcast (exclude sender)
```

### ProtocolMessage Structure

```mermaid
graph TB
    PM["ProtocolMessage"]
    PM --> id["id: string (UUID)"]
    PM --> type["type: message.send | edit | delete | reaction | typing | sync"]
    PM --> ts["timestamp: string (ISO 8601)"]
    PM --> sender["sender: DID string"]
    PM --> payload["payload"]

    payload --> plain["plaintext content"]
    payload --> enc["EncryptedContent { ciphertext, epoch, senderIndex }"]

    subgraph CRDT Layer
        LC["LamportClock { counter, authorDID }"]
    end
```

> Note: The ProtocolMessage timestamp is an ISO 8601 string. Lamport clocks operate in the CRDT layer for causal ordering of state mutations, separate from message timestamps. The CRDT layer ensures convergent state even with out-of-order delivery.

---

## 9. Community & Channel Architecture

### Community Lifecycle

```mermaid
flowchart LR
    Create["Create Community<br/>(root ZCAP issued)"] --> Invite["Generate Invite Code"]
    Invite --> Join["Member Joins<br/>(VP auth + invite)"]
    Join --> Channels["Access Channels"]
    Channels --> Text["Text Channel"]
    Channels --> Voice["Voice Channel"]
    Channels --> Announce["Announcement Channel"]
```

### RDF Quad Storage Model

```mermaid
graph TB
    subgraph "Quad: (Subject, Predicate, Object, Graph)"
        Q1["(community:abc, harmony:name, 'My Server', community:abc)"]
        Q2["(community:abc, harmony:hasMember, did:key:z6Mk..., community:abc)"]
        Q3["(channel:xyz, harmony:type, 'text', community:abc)"]
        Q4["(message:123, harmony:content, 'Hello!', channel:xyz)"]
        Q5["(role:admin, harmony:hasPermission, 'channel.create', community:abc)"]
    end
```

### Role System

```mermaid
flowchart LR
    Admin["Admin Role"] -->|assign| Member["Member DID"]
    Admin -->|create/delete| Roles["Custom Roles"]
    Roles -->|grant| Perms["Permissions<br/>(message.send, channel.create, ...)"]
    Server["Server"] -->|check on every action| Perms
```

---

## 10. Voice & Video (WebRTC + mediasoup SFU)

### SFU Topology

```mermaid
graph LR
    subgraph "Client A"
        ProducerA["Audio/Video Producer"]
        ConsumerA["Remote Consumers"]
    end

    subgraph "mediasoup Router"
        SendTransportA["Send Transport A"]
        RecvTransportA["Recv Transport A"]
        SendTransportB["Send Transport B"]
        RecvTransportB["Recv Transport B"]
    end

    subgraph "Client B"
        ProducerB["Audio/Video Producer"]
        ConsumerB["Remote Consumers"]
    end

    ProducerA --> SendTransportA --> RecvTransportB --> ConsumerB
    ProducerB --> SendTransportB --> RecvTransportA --> ConsumerA
```

### Voice Join Flow

```mermaid
sequenceDiagram
    participant Client
    participant Server
    participant SFU["mediasoup Router"]

    Client->>Server: voice.token (channel ID)
    Server->>Client: Router RTP capabilities
    Client->>Server: Create Send Transport
    Client->>Server: Create Recv Transport
    Client->>SFU: Produce audio track
    SFU->>Server: New producer available
    Server->>Client: Consume remote producers
    Client->>Client: AnalyserNode → speaking detection
    Client->>Server: voice.speaking { speaking: true }
```

### Mute / Deafen Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Active
    Active --> Muted: mute()
    Muted --> Active: unmute()
    Active --> Deafened: deafen()
    Deafened --> Active: undeafen()
    Muted --> Deafened: deafen()

    state Active {
        [*] --> Producing
        Producing: Audio producer active
    }
    state Muted {
        [*] --> ProducerStopped
        ProducerStopped: Producer + tracks stopped
    }
    state Deafened {
        [*] --> AllPaused
        AllPaused: All consumers paused
    }
```

> Note: `SFUAdapter` is a pluggable interface — mediasoup for self-hosted, Cloudflare Realtime for cloud. E2EE via Insertable Streams is designed but not fully wired.

---

## 11. Data Storage Layer

### QuadStore Implementations

```mermaid
graph TB
    Interface["QuadStore Interface<br/>(add, remove, match, query)"]
    Interface --> Memory["MemoryQuadStore<br/>(client-side)"]
    Interface --> SQLiteQS["SQLiteQuadStore<br/>(server-runtime)"]
    Interface --> DOQS["DOQuadStore<br/>(cloud worker DO SQLite)"]

    subgraph "Stored as Quads"
        Communities["Communities"]
        Channels["Channels"]
        Members["Members"]
        Messages["Messages"]
        Roles["Roles & Permissions"]
        DIDs["DID Documents"]
    end

    Interface --> Communities
    Interface --> Channels
    Interface --> Members
    Interface --> Messages
```

### Vocabulary Layer

```mermaid
graph LR
    Vocab["@harmony/vocab"]
    Vocab --> NS["Namespaces<br/>(harmony:, did:, vc:, zcap:)"]
    Vocab --> Pred["Predicates<br/>(harmony:name, harmony:hasMember,<br/>harmony:content, harmony:type, ...)"]
    Vocab --> Types["Types<br/>(Community, Channel, Message, Role)"]
```

---

## 12. Reconnection & Offline

```mermaid
sequenceDiagram
    participant Client
    participant Server

    Client->>Server: WebSocket connected
    Note over Client,Server: Normal operation

    Server--xClient: Connection drops

    loop Exponential Backoff
        Client->>Client: Wait (1s, 2s, 4s, 8s...)
        Client->>Server: Reconnect attempt
    end

    Client->>Server: WebSocket reconnected
    Client->>Server: sync.state (VP + last known state)
    Server->>Client: Full state restoration

    Client->>Client: Drain offline message queue
    Client->>Server: Buffered messages sent
```

### Multi-Server Topology

```mermaid
graph TB
    Client["Client"]
    Client --> S1["Server 1 ✓"]
    Client --> S2["Server 2 ✗ (dropped)"]
    Client --> S3["Server 3 ✓"]

    Client -->|status| Connected["Status: connected<br/>(not reconnecting)"]

    Note["Partial disconnect: some servers<br/>drop but others remain — client<br/>shows 'connected' not 'reconnecting'"]
```

---

## 13. Discord Migration

### Export & Import Flow

```mermaid
sequenceDiagram
    participant MigrationBot
    participant Discord
    participant Server
    participant Harmony

    Note over MigrationBot,Discord: Export Phase
    MigrationBot->>Discord: Join server
    MigrationBot->>Discord: Fetch channels, messages, attachments, threads, reactions
    MigrationBot->>MigrationBot: Transform to RDF quads
    MigrationBot->>MigrationBot: Encrypt bundle
    MigrationBot->>Server: Upload encrypted bundle (R2)

    Note over Server,Harmony: Import Phase
    Server->>Server: Decrypt bundle
    Server->>Server: Insert quads
    Server->>Server: Map Discord users → DIDs (ghost members for unmapped)
    Server->>Server: Hash-based dedup (prevent re-import)
    Server->>Harmony: Community populated
```

---

## 14. Portal Services

```mermaid
graph TB
    subgraph "Portal Worker (Cloudflare)"
        IdStore["Identity Store<br/>(D1: DID registration + lookup)"]
        Directory["Community Directory<br/>(discover public communities)"]
        Invites["Invite Resolver<br/>(short codes → connection info)"]
        OAuth["OAuth Handler<br/>(Discord OAuth for identity linking)"]
        RateLimit["Rate Limiter<br/>(KV: per-DID limiting)"]
        Relay["Relay<br/>(DO: WebSocket proxy for restrictive NATs)"]
        ExportStore["Export Store<br/>(R2: encrypted Discord bundles)"]
    end

    Client["Clients"] -->|DID lookup| IdStore
    Client -->|discover| Directory
    Client -->|resolve invite| Invites
    Client -->|link Discord| OAuth
    Client -.->|rate limited| RateLimit
    Client -->|NAT traversal| Relay
    MigBot["Migration Bot"] -->|upload| ExportStore
```

---

## 15. Search Architecture

```mermaid
graph TB
    subgraph "Client-Side FTS"
        Decrypt["Decrypt Messages<br/>(E2EE — server can't see plaintext)"]
        Tokenizer["Tokenizer"]
        Index["Inverted Index"]
        QueryParser["Query Parser"]
        Decrypt --> Tokenizer --> Index
        QueryParser --> Index
    end

    subgraph "Server-Side"
        MetaSearch["Metadata Search<br/>(timestamps, senders, channels)"]
    end

    subgraph "UI"
        Overlay["Search Overlay"]
        Results["Result Navigation"]
        Highlights["Highlights"]
        Overlay --> Results --> Highlights
    end

    Index --> Overlay
    MetaSearch --> Overlay
```

> Note: Full-text search of message content is client-side only (E2EE constraint). Server can only search metadata. 39 tests cover the tokenizer, index, and query parser.

---

## 16. Moderation System

```mermaid
flowchart TD
    Action["Incoming Action"] --> BanCheck{"Banned?"}
    BanCheck -->|Yes| Block["Block"]
    BanCheck -->|No| RateCheck{"Rate Limited?"}
    RateCheck -->|Yes| Block
    RateCheck -->|No| SlowMode{"Slow Mode Cooldown?"}
    SlowMode -->|Active| Block
    SlowMode -->|Clear| AgeCheck{"DID Age Sufficient?"}
    AgeCheck -->|No| Block
    AgeCheck -->|Yes| VCCheck{"Required VCs Present?"}
    VCCheck -->|No| Block
    VCCheck -->|Yes| Allow["✓ Allow"]

    RaidDetect["Raid Detection<br/>(rapid join threshold)"] -->|triggered| AutoLock["Auto-Lockdown"]
```

---

## 17. Notification System

```mermaid
sequenceDiagram
    participant Sender
    participant Server
    participant Recipient

    Sender->>Server: message.send (contains @mention or is DM/reply)
    Server->>Server: Detect mention (@username or @did:key:...)
    Server->>Server: Create notification record
    Server->>Recipient: Push via WebSocket

    Recipient->>Server: notification.list
    Server->>Recipient: Unread notifications

    Recipient->>Server: notification.mark-read { id }
    Recipient->>Server: notification.mark-all-read
    Recipient->>Server: notification.count
```

### UI Components

```mermaid
graph LR
    Bell["NotificationBell<br/>(unread count badge)"]
    Bell -->|click| Dropdown["Notification Dropdown<br/>(list of notifications)"]
    Dropdown --> MarkRead["Mark Read"]
    Dropdown --> MarkAll["Mark All Read"]
    Dropdown --> Navigate["Navigate to Message"]
```

---

## 18. Build & Deployment

```mermaid
graph TB
    subgraph "pnpm Monorepo (36 packages)"
        Source["TypeScript Source"]
    end

    Source --> Electron["Electron<br/>esbuild → electron-builder<br/>→ DMG / AppImage"]
    Source --> Docker["Docker<br/>server-runtime image"]
    Source --> CF["Cloudflare<br/>wrangler deploy<br/>portal-worker + cloud-worker"]
    Source --> Cap["Capacitor<br/>Android APK / iOS IPA"]

    subgraph "CI Pipeline"
        Vitest["vitest<br/>(2582 tests)"]
        Playwright["Playwright<br/>(99 E2E tests)"]
        Lint["oxlint"]
        TSC["tsc (type check)"]
    end

    Source --> Vitest
    Source --> Playwright
    Source --> Lint
    Source --> TSC
```

### Electron Build Detail

```mermaid
flowchart LR
    MainTS["main process TS"] -->|esbuild| Bundle["harmony-app.js"]
    Preload["preload.ts"] -->|esbuild| PreloadJS["preload.js<br/>(contextBridge → __HARMONY_DESKTOP__)"]
    UIApp["ui-app build"] --> Renderer["BrowserWindow renderer"]
    Bundle --> ElectronBuilder["electron-builder"]
    PreloadJS --> ElectronBuilder
    Renderer --> ElectronBuilder
    ElectronBuilder --> DMG["DMG (macOS)"]
    ElectronBuilder --> AppImage["AppImage (Linux)"]

    Note["nodeIntegration: false<br/>contextIsolation: true"]
```

---

## 19. Server & Connection Discovery

Clients don't discover servers autonomously — the `HarmonyClient.connect(url, options?)` method requires a WebSocket URL. Discovery happens at the UI/application layer through five distinct paths.

### Discovery Paths

```mermaid
graph TB
    User([User])

    subgraph "Discovery Paths"
        Embedded["🖥️ Electron Embedded<br/>auto-start ServerRuntime<br/>→ ws://localhost:{port}"]
        Manual["⌨️ Manual URL Entry<br/>Advanced option in UI"]
        Invite["🔗 Invite Code<br/>Short code → Portal lookup"]
        Directory["📋 Community Directory<br/>Browse public communities"]
        Relay["🔀 Relay Proxy<br/>NAT traversal via Portal"]
    end

    subgraph "Portal Worker (Cloudflare)"
        InviteReg["InviteRegistryDO"]
        CommunityReg["CommunityRegistryDO"]
        RelayDO["RelayDO<br/>WebSocket proxy"]
    end

    Server["Harmony Server"]

    User --> Embedded --> Server
    User --> Manual --> Server
    User --> Invite --> InviteReg --> Server
    User --> Directory --> CommunityReg --> Server
    User --> Relay --> RelayDO --> Server
```

### Connection Flow

1. **Electron embedded** — `ServerRuntime` starts with `port: 0` (OS-assigned). Once bound, the actual port is sent to the renderer via IPC (`__HARMONY_DESKTOP__.getEmbeddedServer()`). The store auto-connects to `ws://localhost:{port}` on startup, skipping the "join a community" step.

2. **Manual URL entry** — The onboarding view offers an "Advanced" option where users type a server address. The store calls `client.connect(url)` directly.

3. **Invite code resolution** — The primary social discovery path:

```mermaid
sequenceDiagram
    participant U as User
    participant UI as UI App
    participant PC as PortalClient
    participant PW as Portal Worker
    participant IR as InviteRegistryDO
    participant S as Harmony Server

    U->>UI: Enter invite code "abc123"
    UI->>PC: resolveInvite("abc123")
    PC->>PW: GET /invite/abc123
    PW->>IR: lookup(code)
    IR-->>PW: {serverUrl, communityId, communityName}
    PW-->>PC: InviteResolution
    PC-->>UI: {serverUrl, inviteCode}
    UI->>S: WebSocket connect + community.join with VP & inviteCode
    S-->>UI: Community state (channels, members, roles)
```

4. **Community directory** — Portal Worker serves `GET /communities` with public listings (name, description, member count, server URL). The onboarding view renders these as browsable cards. Servers self-register via `POST /communities/register` with a VP proving ownership.

5. **Relay fallback** — For clients behind restrictive NATs, `GET /relay/:communityId` upgrades to WebSocket on `RelayDO`, which proxies bidirectionally to the target server.

### Invite Registration (Server → Portal)

When a server creates an invite with `portal: true`, it calls `POST /invites/register` on Portal Worker to map the short code to its URL + community ID. This is how invite codes become globally resolvable.

### First Launch (Onboarding)

The `OnboardingView` walks new users through: Welcome → Identity creation (generates DID + shows mnemonic for backup) → Display name → Join a community (invite code / browse directory / manual URL). Electron skips the join step since the embedded server is pre-connected.

### Implementation Status

| Path                                | Status                            |
| ----------------------------------- | --------------------------------- |
| Electron embedded auto-connect      | ✅ Implemented                    |
| Manual server URL entry             | ✅ Implemented                    |
| Invite code resolution              | ✅ Implemented                    |
| Community directory                 | ✅ Implemented                    |
| Relay proxy (NAT traversal)         | ✅ Implemented                    |
| Deep links (`harmony://invite/...`) | ⚠️ Electron only — mobile not yet |
| QR code sharing                     | ❌ Planned                        |
| Local network discovery (mDNS)      | ❌ Not implemented                |

> **Note:** Auto-reconnect is built into `HarmonyClient` (default on, 3s interval with exponential backoff). The persisted server list in localStorage allows the web client to reconnect to known servers across sessions.

---

## 20. Data Durability & Backup

### Data Locations

```mermaid
graph TB
    subgraph "Client (Browser/Electron Renderer)"
        LS["localStorage"]
        Mem["In-Memory (ephemeral)"]
    end

    subgraph "localStorage Contents"
        ID["harmony:identity<br/>DID + keypair + mnemonic"]
        EK["harmony:encryptionKeyPair<br/>X25519 for MLS"]
        SL["harmony:servers<br/>Server connection list"]
        RP["harmony:readPositions"]
        TH["harmony:theme"]
    end

    subgraph "In-Memory (lost on refresh)"
        MQ["MemoryQuadStore<br/>Message cache"]
        MLS["MLS group state<br/>Epoch keys"]
        WS["WebSocket state"]
    end

    LS --- ID
    LS --- EK
    LS --- SL
    LS --- RP
    Mem --- MQ
    Mem --- MLS

    subgraph "Server (SQLite)"
        DB["harmony.db<br/>All quads: messages,<br/>channels, roles, members"]
        ATT["attachments/<br/>Media files"]
    end

    subgraph "Cloud Worker (Cloudflare)"
        DO["DO SQLite<br/>Same quad data"]
        R2["R2 Bucket<br/>Media attachments"]
    end
```

### Durability by Deployment

| Deployment | Data Store | Durability | Risk |
| --- | --- | --- | --- |
| **Electron** | SQLite in `~/Library/Application Support/Harmony/` (macOS) or `~/.config/Harmony/` (Linux) | Survives restart | Lost on uninstall; no auto-backup |
| **Cloud (DO)** | Cloudflare DO SQLite (replicated) + R2 | High — Cloudflare manages replication | DO eviction clears in-memory state (SQLite persists) |
| **Self-hosted Docker** | SQLite in mounted volume (`/data`) | Depends on volume management | Operator responsible for backups |
| **Web client** | Browser localStorage | Fragile | Cleared on browser data wipe |

### Identity Recovery

- **Mnemonic** (12 BIP-39 words) can regenerate the Ed25519 signing keypair and DID via `recoverIdentity(mnemonic)`
- **NOT recoverable** from mnemonic: X25519 encryption keypair (generated independently), server list, message history, MLS state, read positions
- `exportIdentity()` / `importIdentity()` provide JSON serialization of the full identity object, but this is manual

### What's NOT Backed Up (Gaps)

| Gap | Impact | Status |
| --- | --- | --- |
| No community export (`.hbundle`) | Cannot migrate or back up a community | Post-launch roadmap |
| No message history export | Users cannot download their messages | Not planned |
| No automated server backup | SQLite data loss = total community loss | Operator responsibility |
| MLS state is ephemeral | Groups rebuilt on reconnect; messages encrypted under old epoch keys become unrecoverable if client state lost | By design (forward secrecy) |
| No multi-device identity sync | Identity lives in one browser's localStorage | Not planned for beta |
| Encryption keypair not in mnemonic | Losing localStorage = losing MLS decryption ability | Design gap |
| Read positions client-only | `read.update` message exists but positions only in localStorage | Server-side persistence planned |

### Recommendations for Beta

> **Note:** Beta users should be advised:
>
> 1. **Back up your mnemonic** — it's the only way to recover your identity (but not your messages or encryption keys)
> 2. **Electron is the most durable client** — web browser localStorage can be wiped unexpectedly
> 3. **Self-hosted operators must back up `harmony.db`** — there is no automated backup mechanism
> 4. **Message history is not portable** — if a server is lost, its messages are gone
> 5. **MLS encryption means old messages may become unreadable** if client state is lost — this is a trade-off of forward secrecy

---

## 21. Server vs Cloud Worker Protocol Conformance

Both `@harmony/server` (used by `server-runtime` and Electron) and `cloud-worker` (`CommunityDurableObject` on Cloudflare) implement the same WebSocket protocol. However, **cloud-worker is a full reimplementation** — it does not import `@harmony/server`.

### Shared vs Separate Code

```mermaid
graph LR
    subgraph "Shared Packages"
        Types["@harmony/types<br/>Message definitions"]
        Identity["@harmony/identity<br/>VP verification, DIDs"]
        QS["@harmony/quad-store<br/>QuadStore interface"]
        MLSPkg["@harmony/mls<br/>MLS types"]
    end

    subgraph "Server Package"
        Server["@harmony/server<br/>HarmonyServer class<br/>SqliteQuadStore<br/>VP auth in message flow"]
    end

    subgraph "Cloud Worker"
        CW["cloud-worker<br/>CommunityDurableObject<br/>DOQuadStore<br/>VP auth at HTTP upgrade"]
    end

    Types --> Server
    Types --> CW
    Identity --> Server
    Identity --> CW
    QS --> Server
    QS --> CW
    MLSPkg --> Server
    MLSPkg --> CW
```

### Auth Divergence

| Aspect                   | Server                       | Cloud Worker               |
| ------------------------ | ---------------------------- | -------------------------- |
| VP verification timing   | Post-connect (first message) | Pre-connect (HTTP upgrade) |
| VP library               | `@harmony/identity`          | `@harmony/identity` (same) |
| Session identity storage | In-memory map                | `ws.serializeAttachment()` |
| Permission checks        | Shared handler middleware    | Reimplemented in `auth.ts` |

### Protocol Message Conformance

| Message Type        | Server          | Cloud Worker | Notes                              |
| ------------------- | --------------- | ------------ | ---------------------------------- |
| `community.join`    | ✅              | ✅           |                                    |
| `community.update`  | ✅              | ✅           |                                    |
| `community.delete`  | ✅              | ❌           | Not implemented in cloud           |
| `channel.create`    | ✅              | ✅           |                                    |
| `channel.update`    | ✅              | ✅           |                                    |
| `channel.delete`    | ✅              | ✅           |                                    |
| `channel.messages`  | ✅              | ✅           |                                    |
| `message.send`      | ✅              | ✅           |                                    |
| `message.update`    | ✅              | ✅           |                                    |
| `message.delete`    | ✅              | ✅           |                                    |
| `member.update`     | ✅              | ✅           |                                    |
| `member.kick`       | ✅              | ✅           |                                    |
| `member.ban`        | ✅              | ❌           | Not implemented in cloud           |
| `role.create`       | ✅              | ✅           |                                    |
| `role.update`       | ✅              | ✅           |                                    |
| `role.delete`       | ✅              | ✅           |                                    |
| `invite.create`     | ✅              | ✅           |                                    |
| `invite.list`       | ✅              | ✅           |                                    |
| `invite.delete`     | ✅              | ✅           |                                    |
| `mls.keyPackage`    | ✅              | ✅           |                                    |
| `mls.welcome`       | ✅              | ✅           |                                    |
| `mls.commit`        | ✅              | ✅           |                                    |
| `mls.proposal`      | ✅              | ❌           | Not implemented in cloud           |
| `mls.groupInfo`     | ✅              | ✅           |                                    |
| `voice.join`        | ✅              | ❌           | Requires SFU — not available in DO |
| `voice.leave`       | ✅              | ❌           |                                    |
| `voice.signal`      | ✅              | ❌           |                                    |
| `attachment.upload` | ✅ (filesystem) | ✅ (R2)      | Different storage backends         |
| `typing.start`      | ✅              | ✅           |                                    |
| `typing.stop`       | ✅              | ✅           |                                    |
| `reaction.add`      | ✅              | ✅           |                                    |
| `reaction.remove`   | ✅              | ✅           |                                    |
| `thread.create`     | ✅              | ❌           | Not implemented in cloud           |
| `read.update`       | ✅              | ✅           |                                    |

**Score:** Cloud worker supports **26/31** message types (84%). Missing: `community.delete`, `member.ban`, `mls.proposal`, `voice.*` (3 types), `thread.create`.

### Broadcast Divergence

- **Server:** Room-based broadcast optimization — only sends to clients subscribed to the relevant channel
- **Cloud Worker:** Broadcasts to all connected WebSockets via `getWebSockets()`; filtering happens client-side (less efficient at scale)

### Testing Gap

- **Playwright E2E tests** (99 tests) run exclusively against `server-runtime`
- **No E2E tests target cloud-worker**
- Cloud-worker unit tests are minimal (mostly auth verification)
- **No conformance test suite** exists to verify both backends behave identically

### Recommendations for Beta

> **Note:**
>
> 1. **Voice is cloud-incompatible** — communities needing voice must use self-hosted or Electron server
> 2. **A conformance test suite is strongly recommended** — extract protocol tests into a backend-agnostic harness that runs against both server and cloud-worker
> 3. **Permission logic is duplicated** — divergence risk is high; consider extracting into a shared `@harmony/permissions` package
> 4. **Cloud-worker gaps should be documented** for users choosing deployment targets
> 5. **Broadcast efficiency** in cloud-worker may need attention before communities scale past ~100 concurrent members

---

> **Architecture maintained by the Harmony team. Diagrams generated from codebase analysis — update when the structure changes.**
