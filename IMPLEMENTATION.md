# Harmony — Phase 1: Decentralised Foundations & Migration

_2026-02-22 — Implementation Plan_

---

## Objective

Ship the foundational infrastructure that everything else builds on: sovereign identity, verifiable credentials, authorization capabilities, the RDF data layer, and the Discord migration pipeline. Phase 1 delivers a working system where users can create a sovereign identity, link their Discord account, and communities can migrate their data — encrypted, revocable, and portable between cloud and self-hosted.

No chat UI in this phase. The output is a set of composable, spec-tested modules and a migration pipeline that proves the architecture works end-to-end.

---

## Architecture Principles

1. **Every module is a standalone package.** No module knows about Harmony-the-product. Each is a general-purpose library that happens to be composed into Harmony. If someone wants to use `@harmony/did` without the rest, they can.

2. **Interfaces first, implementations second.** Every module defines its public interface as a TypeScript type/interface. Implementations are swappable. The quad store could be in-memory, SQLite, or a full triplestore — the interface is the same.

3. **Spec-oriented TDD.** Tests are written against the W3C specs, not against implementation details. A test for VC issuance should reference the relevant section of the VC Data Model spec. If the spec says it, there's a test for it. If there's no spec, the test documents the design decision.

4. **RDF quads are the universal interchange.** Modules communicate via quads. A VC is quads. A ZCAP is quads. A Discord message import is quads. This is the composability mechanism — any module can consume any other module's output.

5. **Crypto is pluggable.** Ed25519 by default, but the crypto layer is an interface. Support for secp256k1, P-256, or post-quantum algorithms is an implementation swap, not an architectural change.

---

## Module Map

```
@harmony/crypto          ← key generation, signing, verification, encryption
@harmony/did             ← DID creation, resolution, document management
@harmony/vc              ← Verifiable Credential issuance, verification, revocation
@harmony/zcap            ← Authorization capabilities, delegation, invocation
@harmony/quads           ← RDF quad store interface + implementations
@harmony/identity        ← composite: DID + VC + recovery + sync chain
@harmony/migration       ← Discord export parsing, RDF transformation
@harmony/migration-bot   ← Discord bot for community server export
@harmony/cloud           ← encrypted storage, identity service, OAuth gateway
@harmony/cli             ← command-line interface for all operations
```

Dependency graph:

```
                    @harmony/crypto
                    /      |       \
            @harmony/did   |    @harmony/quads
                |    \     |     /       |
          @harmony/vc  \   |   /   @harmony/migration
                |       \  |  /         |
          @harmony/zcap  \ | /    @harmony/migration-bot
                \         \|/
              @harmony/identity
                     |
               @harmony/cloud
                     |
                @harmony/cli
```

---

## Module Specifications

### 1. `@harmony/crypto`

The cryptographic foundation. Every other module depends on this.

**Interface:**

```typescript
interface KeyPair {
  publicKey: Uint8Array
  secretKey: Uint8Array
  type: KeyType
}

type KeyType = 'Ed25519' | 'X25519'  // signing | encryption

interface CryptoProvider {
  // Key management
  generateSigningKeyPair(): Promise<KeyPair>
  generateEncryptionKeyPair(): Promise<KeyPair>
  deriveEncryptionKeyPair(signingKeyPair: KeyPair): Promise<KeyPair>

  // Signing
  sign(data: Uint8Array, secretKey: Uint8Array): Promise<Uint8Array>
  verify(data: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): Promise<boolean>

  // Encryption (authenticated, asymmetric)
  encrypt(plaintext: Uint8Array, recipientPublicKey: Uint8Array, senderSecretKey: Uint8Array): Promise<EncryptedPayload>
  decrypt(payload: EncryptedPayload, senderPublicKey: Uint8Array, recipientSecretKey: Uint8Array): Promise<Uint8Array>

  // Symmetric encryption (for bulk data — export archives)
  symmetricEncrypt(plaintext: Uint8Array, key: Uint8Array): Promise<EncryptedPayload>
  symmetricDecrypt(payload: EncryptedPayload, key: Uint8Array): Promise<Uint8Array>

  // Key derivation
  deriveKey(secret: Uint8Array, salt: Uint8Array, info: string): Promise<Uint8Array>

  // Mnemonic (sync chain)
  generateMnemonic(): string
  mnemonicToSeed(mnemonic: string): Promise<Uint8Array>
  seedToKeyPair(seed: Uint8Array): Promise<KeyPair>
}

interface EncryptedPayload {
  ciphertext: Uint8Array
  nonce: Uint8Array
  tag?: Uint8Array
}
```

**Spec tests:**

```
crypto.spec.ts
├── Key Generation
│   ├── MUST generate unique Ed25519 keypairs
│   ├── MUST generate unique X25519 keypairs
│   └── MUST derive X25519 from Ed25519 deterministically
├── Signing
│   ├── MUST produce valid Ed25519 signatures (RFC 8032)
│   ├── MUST verify valid signatures
│   ├── MUST reject invalid signatures
│   └── MUST reject signatures from wrong key
├── Encryption
│   ├── MUST encrypt/decrypt with X25519 + XChaCha20-Poly1305
│   ├── MUST fail decryption with wrong key
│   ├── MUST fail decryption with tampered ciphertext
│   └── MUST produce unique nonces per encryption
├── Symmetric Encryption
│   ├── MUST encrypt/decrypt with XChaCha20-Poly1305
│   └── MUST fail decryption with wrong key
├── Key Derivation
│   ├── MUST derive deterministic keys from same input
│   └── MUST derive different keys from different salts/info
└── Mnemonic
    ├── MUST generate valid BIP-39 mnemonics
    ├── MUST derive deterministic seed from mnemonic
    └── MUST derive deterministic keypair from seed
```

**Implementation notes:**
- Use `@noble/ed25519`, `@noble/curves`, `@noble/ciphers` — audited, pure JS, no native deps
- Mnemonic via `@scure/bip39` (same family, audited)
- No Node.js crypto dependency — must work in browser

---

### 2. `@harmony/quads`

The RDF quad store. This is the universal data layer.

**Interface:**

```typescript
interface Quad {
  subject: string
  predicate: string
  object: string | TypedLiteral
  graph: string
}

interface TypedLiteral {
  value: string
  datatype?: string   // e.g. xsd:dateTime, xsd:integer
  language?: string   // e.g. "en"
}

interface QuadStore {
  // CRUD
  add(quad: Quad): Promise<void>
  addAll(quads: Quad[]): Promise<void>
  remove(quad: Quad): Promise<void>
  removeGraph(graph: string): Promise<void>

  // Query
  match(pattern: Partial<Quad>): Promise<Quad[]>
  has(pattern: Partial<Quad>): Promise<boolean>
  count(pattern?: Partial<Quad>): Promise<number>

  // Graph operations
  graphs(): Promise<string[]>
  export(graph?: string): Promise<Quad[]>
  exportNQuads(graph?: string): Promise<string>
  importNQuads(nquads: string): Promise<void>

  // Subscriptions (for reactivity)
  subscribe(pattern: Partial<Quad>, callback: (event: QuadEvent) => void): Unsubscribe
}

type QuadEvent =
  | { type: 'add'; quad: Quad }
  | { type: 'remove'; quad: Quad }

type Unsubscribe = () => void
```

**Spec tests:**

```
quads.spec.ts
├── Storage
│   ├── MUST store and retrieve quads
│   ├── MUST deduplicate identical quads
│   ├── MUST remove specific quads
│   └── MUST remove all quads in a graph
├── Querying
│   ├── MUST match by subject
│   ├── MUST match by predicate
│   ├── MUST match by object (string and typed literal)
│   ├── MUST match by graph
│   ├── MUST match by multiple fields (conjunction)
│   ├── MUST return empty array for no matches
│   └── MUST count correctly with and without patterns
├── Serialisation
│   ├── MUST export valid N-Quads (W3C N-Quads spec)
│   ├── MUST import valid N-Quads
│   ├── MUST round-trip without data loss
│   └── MUST handle unicode, escaped characters, typed literals
├── Graph Operations
│   ├── MUST list all graphs
│   ├── MUST export single graph
│   └── MUST export all graphs
└── Subscriptions
    ├── MUST notify on add
    ├── MUST notify on remove
    ├── MUST filter notifications by pattern
    └── MUST stop notifying after unsubscribe
```

**Implementations:**
- `MemoryQuadStore` — in-memory, for tests and lightweight use
- `SQLiteQuadStore` — persistent, for server and Electron/Tauri
- `IndexedDBQuadStore` — persistent, for browser/PWA

---

### 3. `@harmony/did`

DID creation, resolution, and document management. Method-agnostic with `did:key` as the default.

**Interface:**

```typescript
interface DIDDocument {
  id: string                              // e.g. "did:key:z6Mk..."
  verificationMethod: VerificationMethod[]
  authentication: string[]
  assertionMethod: string[]
  keyAgreement: string[]                  // encryption keys
  service?: ServiceEndpoint[]
}

interface VerificationMethod {
  id: string
  type: string                            // e.g. "Ed25519VerificationKey2020"
  controller: string
  publicKeyMultibase: string
}

interface ServiceEndpoint {
  id: string
  type: string
  serviceEndpoint: string
}

interface DIDProvider {
  // Creation
  create(keyPair: KeyPair): Promise<DIDDocument>
  createFromMnemonic(mnemonic: string): Promise<{ document: DIDDocument; keyPair: KeyPair }>

  // Resolution
  resolve(did: string): Promise<DIDDocument | null>

  // Document mutation (for mutable methods like did:web)
  addService(document: DIDDocument, service: ServiceEndpoint): DIDDocument
  addVerificationMethod(document: DIDDocument, method: VerificationMethod): DIDDocument
}

interface DIDKeyProvider extends DIDProvider {
  method: 'key'
}

// Future: DIDWebProvider, DIDPLCProvider, etc.
```

**Spec tests:**

```
did.spec.ts
├── did:key (W3C did:key spec)
│   ├── MUST create valid did:key from Ed25519 public key
│   ├── MUST encode using multibase (base58btc, z-prefix)
│   ├── MUST encode using multicodec (0xed for Ed25519)
│   ├── MUST produce deterministic DID from same key
│   ├── MUST resolve did:key to valid DID Document
│   ├── DID Document MUST include Ed25519 verification method
│   ├── DID Document MUST include X25519 key agreement (derived)
│   ├── DID Document MUST list authentication and assertionMethod
│   └── MUST reject invalid did:key strings
├── DID Document
│   ├── MUST serialise to valid JSON-LD
│   ├── MUST include @context
│   ├── MUST add service endpoints
│   └── MUST add additional verification methods
└── Quad Representation
    ├── MUST serialise DID Document as RDF quads
    ├── MUST round-trip DID Document through quads
    └── MUST store in quad store with DID as graph
```

---

### 4. `@harmony/vc`

Verifiable Credential issuance, presentation, and verification per the W3C VC Data Model.

**Interface:**

```typescript
interface VerifiableCredential {
  '@context': string[]
  type: string[]
  issuer: string                          // issuer DID
  issuanceDate: string                    // ISO 8601
  expirationDate?: string
  credentialSubject: Record<string, unknown> & { id: string }
  proof: Proof
}

interface Proof {
  type: string                            // e.g. "Ed25519Signature2020"
  created: string
  verificationMethod: string             // issuer's verification method ID
  proofPurpose: string                   // "assertionMethod"
  proofValue: string                     // base58btc encoded signature
}

interface VerifiablePresentation {
  '@context': string[]
  type: ['VerifiablePresentation']
  holder: string
  verifiableCredential: VerifiableCredential[]
  proof: Proof
}

interface VCService {
  // Issuance
  issue(params: {
    issuerDID: string
    issuerKeyPair: KeyPair
    subjectDID: string
    type: string
    claims: Record<string, unknown>
    expirationDate?: string
  }): Promise<VerifiableCredential>

  // Verification
  verify(credential: VerifiableCredential, resolverFn: DIDResolver): Promise<VerificationResult>

  // Presentation (prove you hold credentials without revealing issuer keys)
  present(params: {
    holderDID: string
    holderKeyPair: KeyPair
    credentials: VerifiableCredential[]
  }): Promise<VerifiablePresentation>

  verifyPresentation(presentation: VerifiablePresentation, resolverFn: DIDResolver): Promise<VerificationResult>

  // Revocation
  revoke(credential: VerifiableCredential, revokerKeyPair: KeyPair, revocationStore: RevocationStore): Promise<void>
  isRevoked(credential: VerifiableCredential, revocationStore: RevocationStore): Promise<boolean>
}

interface RevocationStore {
  revoke(credentialId: string, reason?: string): Promise<void>
  isRevoked(credentialId: string): Promise<boolean>
  list(): Promise<RevocationEntry[]>
}

interface VerificationResult {
  valid: boolean
  checks: { name: string; passed: boolean; error?: string }[]
}

type DIDResolver = (did: string) => Promise<DIDDocument | null>
```

**Spec tests:**

```
vc.spec.ts
├── Issuance (W3C VC Data Model 2.0)
│   ├── MUST include @context with VC context URL
│   ├── MUST include type array with "VerifiableCredential"
│   ├── MUST include issuer as DID string
│   ├── MUST include issuanceDate as ISO 8601
│   ├── MUST include credentialSubject with id
│   ├── MUST include proof with valid signature
│   └── MUST produce unique credential IDs
├── Verification
│   ├── MUST verify valid credential
│   ├── MUST reject credential with tampered claims
│   ├── MUST reject credential with tampered proof
│   ├── MUST reject credential signed by wrong key
│   ├── MUST reject expired credential
│   ├── MUST reject credential with unresolvable issuer DID
│   └── MUST check revocation status
├── Presentation
│   ├── MUST wrap credentials in VerifiablePresentation
│   ├── MUST sign presentation with holder key
│   ├── MUST verify valid presentation
│   └── MUST reject presentation with tampered proof
├── Revocation
│   ├── MUST mark credential as revoked
│   ├── MUST report revoked credential during verification
│   └── MUST list all revocations
├── Harmony-Specific VC Types
│   ├── DiscordIdentityCredential
│   │   ├── MUST include discordUserId
│   │   ├── MUST include discordUsername
│   │   └── MUST include verification method (oauth | bot)
│   ├── CommunityMembershipCredential
│   │   ├── MUST include communityId
│   │   ├── MUST include role
│   │   ├── MUST include joinedAt
│   │   └── MUST be issued by community admin DID
│   ├── EmailVerificationCredential
│   │   └── MUST include verified email address
│   └── OAuthIdentityCredential
│       ├── MUST include provider (github, google, etc.)
│       └── MUST include provider-specific user ID
└── Quad Representation
    ├── MUST serialise VC as RDF quads
    ├── MUST round-trip VC through quads
    └── MUST store in quad store with credential ID as graph
```

---

### 5. `@harmony/zcap`

Authorization Capabilities for Linked Data — delegation, attenuation, invocation, revocation.

**Interface:**

```typescript
interface Capability {
  '@context': string[]
  id: string
  parentCapability?: string               // root if absent
  invoker: string                         // DID allowed to invoke
  delegator: string                       // DID that delegated this
  allowedAction: string[]                 // e.g. ["harmony:SendMessage", "harmony:AddReaction"]
  scope: Record<string, unknown>          // e.g. { channel: "harmony:channel-general" }
  caveats?: Caveat[]                      // additional constraints
  proof: Proof                            // delegator's signature
}

interface Caveat {
  type: string
  value: unknown
}

// Built-in caveat types
interface ExpiryCaveat extends Caveat {
  type: 'harmony:Expiry'
  value: string                           // ISO 8601 expiration
}

interface RateLimitCaveat extends Caveat {
  type: 'harmony:RateLimit'
  value: { max: number; windowMs: number }
}

interface Invocation {
  capability: string                      // capability ID
  invoker: string                         // DID invoking
  action: string                          // specific action being performed
  target: string                          // resource being acted upon
  proof: Proof                            // invoker's signature over the invocation
}

interface ZCAPService {
  // Root capability (community admin creates this)
  createRoot(params: {
    ownerDID: string
    ownerKeyPair: KeyPair
    scope: Record<string, unknown>
    allowedAction: string[]
  }): Promise<Capability>

  // Delegation (attenuated — can only narrow, never widen)
  delegate(params: {
    parentCapability: Capability
    delegatorKeyPair: KeyPair
    invokerDID: string
    allowedAction: string[]               // subset of parent's actions
    scope: Record<string, unknown>        // equal or narrower than parent's scope
    caveats?: Caveat[]
  }): Promise<Capability>

  // Invocation (prove you can do the thing)
  invoke(params: {
    capability: Capability
    invokerKeyPair: KeyPair
    action: string
    target: string
  }): Promise<Invocation>

  // Verification (check the full chain)
  verifyInvocation(
    invocation: Invocation,
    capabilityChain: Capability[],
    resolverFn: DIDResolver
  ): Promise<VerificationResult>

  // Revocation
  revoke(capabilityId: string, revokerKeyPair: KeyPair, revocationStore: RevocationStore): Promise<void>
}
```

**Spec tests:**

```
zcap.spec.ts
├── Root Capability
│   ├── MUST create root with owner as both invoker and delegator
│   ├── MUST include allowed actions
│   ├── MUST include scope
│   └── MUST include valid proof signed by owner
├── Delegation (W3C ZCAP-LD spec)
│   ├── MUST reference parent capability
│   ├── MUST be signed by parent's invoker (the delegator)
│   ├── MUST allow subset of parent's actions (attenuation)
│   ├── MUST reject delegation that widens actions
│   ├── MUST allow equal or narrower scope
│   ├── MUST reject delegation that widens scope
│   ├── MUST support caveats (expiry, rate limit)
│   └── MUST support multi-level delegation chains
├── Invocation
│   ├── MUST be signed by the capability's invoker
│   ├── MUST specify action being performed
│   ├── MUST specify target resource
│   └── MUST reject invocation by non-invoker
├── Verification
│   ├── MUST verify full delegation chain from root
│   ├── MUST reject broken chain (missing link)
│   ├── MUST reject expired capability (expiry caveat)
│   ├── MUST reject revoked capability in chain
│   ├── MUST reject action not in allowed actions
│   ├── MUST reject target outside scope
│   └── MUST resolve all DIDs in chain
├── Revocation
│   ├── MUST revoke capability by ID
│   ├── MUST cascade — revoking a parent invalidates all children
│   └── MUST only allow revocation by delegator or chain ancestor
└── Quad Representation
    ├── MUST serialise capability as RDF quads
    ├── MUST serialise invocation as RDF quads
    └── MUST round-trip through quads
```

---

### 6. `@harmony/identity`

Composite module: ties together DID + VC + ZCAP + recovery into a coherent identity experience. This is the user-facing identity layer.

**Interface:**

```typescript
interface Identity {
  did: string
  document: DIDDocument
  credentials: VerifiableCredential[]
  capabilities: Capability[]
}

interface IdentityManager {
  // Creation
  create(): Promise<{ identity: Identity; keyPair: KeyPair; mnemonic: string }>
  createFromMnemonic(mnemonic: string): Promise<{ identity: Identity; keyPair: KeyPair }>
  createFromOAuthRecovery(provider: string, token: string): Promise<{ identity: Identity; keyPair: KeyPair }>

  // Credential management
  addCredential(identity: Identity, credential: VerifiableCredential): Promise<Identity>
  removeCredential(identity: Identity, credentialId: string): Promise<Identity>
  getCredentials(identity: Identity, type?: string): VerifiableCredential[]

  // Capability management
  addCapability(identity: Identity, capability: Capability): Promise<Identity>
  getCapabilities(identity: Identity, action?: string): Capability[]

  // Sync chain (Brave-style)
  exportSyncPayload(identity: Identity, keyPair: KeyPair): Promise<EncryptedPayload>
  importSyncPayload(payload: EncryptedPayload, mnemonic: string): Promise<{ identity: Identity; keyPair: KeyPair }>

  // Social recovery
  setupRecovery(params: {
    identity: Identity
    trustedDIDs: string[]                 // 5 trusted friends
    threshold: number                     // 3-of-5
    keyPair: KeyPair
  }): Promise<RecoveryConfig>

  initiateRecovery(params: {
    claimedDID: string
    recovererDID: string
    recoveryConfig: RecoveryConfig
  }): Promise<RecoveryRequest>

  approveRecovery(params: {
    request: RecoveryRequest
    approverDID: string
    approverKeyPair: KeyPair
  }): Promise<RecoveryApproval>

  completeRecovery(params: {
    request: RecoveryRequest
    approvals: RecoveryApproval[]
    newKeyPair: KeyPair
  }): Promise<{ identity: Identity; keyPair: KeyPair }>

  // Serialisation
  toQuads(identity: Identity): Quad[]
  fromQuads(quads: Quad[]): Identity
}
```

**Spec tests:**

```
identity.spec.ts
├── Creation
│   ├── MUST generate DID, keypair, and mnemonic
│   ├── MUST create deterministic identity from mnemonic
│   ├── MUST create identity from OAuth recovery token
│   └── MUST initialise with empty credentials and capabilities
├── Credential Portfolio
│   ├── MUST add and retrieve credentials
│   ├── MUST filter credentials by type
│   ├── MUST remove credentials by ID
│   └── MUST persist as RDF quads
├── Sync Chain
│   ├── MUST export identity as encrypted payload
│   ├── MUST import identity from encrypted payload + mnemonic
│   ├── MUST round-trip identity without data loss
│   ├── MUST fail import with wrong mnemonic
│   └── MUST include all credentials and capabilities in sync
├── Social Recovery
│   ├── MUST configure with N trusted DIDs and threshold
│   ├── MUST require threshold approvals to complete
│   ├── MUST reject recovery with insufficient approvals
│   ├── MUST reject duplicate approvals from same DID
│   ├── MUST reject approvals from non-trusted DIDs
│   ├── MUST produce new keypair on recovery
│   └── MUST migrate all credentials to new DID (re-issuance required)
└── Quad Serialisation
    ├── MUST serialise full identity as RDF quads
    └── MUST round-trip through quads
```

---

### 7. `@harmony/migration`

Discord data parsing and RDF transformation. Pure data pipeline — no Discord API calls, no network. Takes Discord export files and produces quads.

**Interface:**

```typescript
interface DiscordExport {
  // From personal GDPR export
  account: DiscordAccount
  messages: DiscordMessage[]
  servers: DiscordServerRef[]
  activity: DiscordActivity[]
  connections: DiscordConnection[]
}

interface DiscordServerExport {
  // From community migration bot
  server: DiscordServer
  channels: DiscordChannel[]
  roles: DiscordRole[]
  members: DiscordMember[]
  messages: Map<string, DiscordMessage[]>  // channelId → messages
  threads: DiscordThread[]
  pins: Map<string, string[]>             // channelId → messageIds
}

interface MigrationService {
  // Parse Discord exports
  parsePersonalExport(zipPath: string): Promise<DiscordExport>
  parseServerExport(exportPath: string): Promise<DiscordServerExport>

  // Transform to RDF quads
  transformPersonalExport(
    export_: DiscordExport,
    ownerDID: string
  ): Promise<Quad[]>

  transformServerExport(
    export_: DiscordServerExport,
    adminDID: string,
    options?: {
      excludeUsers?: string[]             // opt-out user IDs
      anonymiseFormerMembers?: boolean
    }
  ): Promise<{
    quads: Quad[]
    membershipVCs: VerifiableCredential[]  // to be issued once members link DIDs
    pendingMemberMap: Map<string, string>  // discordUserId → placeholder URI
  }>

  // Encrypt export for cloud upload
  encryptExport(
    quads: Quad[],
    adminKeyPair: KeyPair
  ): Promise<EncryptedExportBundle>

  // Decrypt export for self-hosted import
  decryptExport(
    bundle: EncryptedExportBundle,
    adminKeyPair: KeyPair
  ): Promise<Quad[]>

  // Re-sign community credentials after migration between instances
  resignCommunityCredentials(params: {
    quads: Quad[]
    adminDID: string
    adminKeyPair: KeyPair
    newServiceEndpoint: string
  }): Promise<{
    quads: Quad[]
    reissuedVCs: VerifiableCredential[]
    reissuedRootCapability: Capability
  }>
}

interface EncryptedExportBundle {
  ciphertext: Uint8Array
  nonce: Uint8Array
  metadata: {
    exportDate: string
    sourceServerId: string
    sourceServerName: string
    adminDID: string                      // public — who encrypted this
    channelCount: number
    messageCount: number
    memberCount: number
  }
}
```

**Spec tests:**

```
migration.spec.ts
├── Personal Export Parsing
│   ├── MUST parse Discord GDPR ZIP format
│   ├── MUST extract account info
│   ├── MUST extract messages with channel mappings
│   ├── MUST extract server membership list
│   ├── MUST extract connections (linked accounts)
│   └── MUST handle missing/optional fields gracefully
├── Server Export Parsing
│   ├── MUST parse channel structure (categories, text, voice)
│   ├── MUST parse roles with permissions
│   ├── MUST parse member list with roles
│   ├── MUST parse messages with author, timestamp, content
│   ├── MUST parse threads as sub-channels
│   ├── MUST parse pins per channel
│   ├── MUST parse reactions
│   └── MUST handle attachments as references (URI only)
├── RDF Transformation
│   ├── MUST produce valid RDF quads
│   ├── MUST map channels to named graphs
│   ├── MUST map messages to harmony:Message type
│   ├── MUST map roles to harmony:Role type
│   ├── MUST map members to placeholder URIs (pending DID link)
│   ├── MUST preserve message ordering (timestamps)
│   ├── MUST preserve reply chains (replyTo)
│   ├── MUST preserve thread structure
│   ├── MUST handle opt-out (excluded user messages removed)
│   └── MUST anonymise former members when configured
├── Encryption
│   ├── MUST encrypt export with admin keypair
│   ├── MUST decrypt with same keypair
│   ├── MUST fail decryption with wrong keypair
│   ├── MUST preserve metadata in plaintext (for cloud indexing)
│   └── MUST round-trip quads through encrypt/decrypt
├── Re-signing
│   ├── MUST update service endpoints in community VCs
│   ├── MUST re-issue root ZCAP for new instance
│   ├── MUST re-sign membership VCs with same admin DID
│   ├── MUST preserve member DIDs across migration
│   └── MUST produce valid credentials after re-signing
└── Discord-to-Harmony Ontology
    ├── harmony:Community    ← Discord Server
    ├── harmony:Channel      ← Discord Channel
    ├── harmony:Category     ← Discord Category
    ├── harmony:Thread       ← Discord Thread
    ├── harmony:Message      ← Discord Message
    ├── harmony:Role         ← Discord Role
    ├── harmony:Member       ← Discord Member (pending DID link)
    └── harmony:Reaction     ← Discord Reaction
```

---

### 8. `@harmony/migration-bot`

Discord bot that runs on community infrastructure, exports server data via Discord API.

**Interface:**

```typescript
interface MigrationBot {
  // Lifecycle
  start(token: string): Promise<void>
  stop(): Promise<void>

  // Export (runs on the admin's machine, not cloud)
  exportServer(params: {
    serverId: string
    adminDID: string
    adminKeyPair: KeyPair
    options?: {
      channels?: string[]                 // specific channels, or all
      excludeUsers?: string[]             // opt-out user IDs
      anonymiseFormerMembers?: boolean
      afterDate?: string                  // only messages after this date
      beforeDate?: string                 // only messages before this date
    }
    onProgress?: (progress: ExportProgress) => void
  }): Promise<EncryptedExportBundle>

  // Push to target
  pushToCloud(bundle: EncryptedExportBundle, cloudUrl: string): Promise<void>
  pushToLocal(bundle: EncryptedExportBundle, outputPath: string): Promise<void>

  // Identity linking command handler
  handleLinkCommand(interaction: DiscordInteraction): Promise<void>
}

interface ExportProgress {
  phase: 'channels' | 'roles' | 'members' | 'messages' | 'encrypting'
  current: number
  total: number
  channelName?: string
}
```

**Spec tests:**

```
migration-bot.spec.ts
├── Export Pipeline (integration tests with mock Discord API)
│   ├── MUST fetch all channels in server
│   ├── MUST fetch all roles
│   ├── MUST fetch member list with role assignments
│   ├── MUST paginate message history (100 per request, Discord limit)
│   ├── MUST respect rate limits (Discord API)
│   ├── MUST report progress via callback
│   ├── MUST encrypt final export with admin keypair
│   ├── MUST exclude opted-out users
│   └── MUST handle server with 100k+ messages (streaming, not loading all in memory)
├── Output
│   ├── MUST produce valid EncryptedExportBundle
│   ├── MUST push to cloud endpoint
│   ├── MUST write to local file
│   └── MUST produce metadata without exposing message content
├── Identity Linking
│   ├── MUST handle /harmony link slash command
│   ├── MUST generate one-time linking token
│   ├── MUST map Discord user ID to token
│   └── MUST expire tokens after 10 minutes
└── Operational
    ├── MUST work with bot token (not user token)
    ├── MUST require MESSAGE_CONTENT intent
    ├── MUST require GUILD_MEMBERS intent
    └── MUST gracefully handle permission errors
```

---

### 9. `@harmony/cloud`

The cloud service — identity gateway, encrypted storage, OAuth bridge. This is what runs at harmony-cloud.example.com, and is also self-hostable.

**Interface:**

```typescript
interface CloudService {
  // Identity
  createIdentity(): Promise<{ identity: Identity; keyPair: KeyPair; mnemonic: string }>
  resolveIdentity(did: string): Promise<Identity | null>

  // OAuth linking (issues VCs)
  initiateOAuthLink(params: {
    provider: 'discord' | 'github' | 'google'
    userDID: string
  }): Promise<{ redirectUrl: string; state: string }>

  completeOAuthLink(params: {
    provider: string
    code: string
    state: string
    userKeyPair: KeyPair
  }): Promise<VerifiableCredential>

  // Encrypted community storage
  storeExport(bundle: EncryptedExportBundle): Promise<{ exportId: string }>
  retrieveExport(exportId: string, adminDID: string): Promise<EncryptedExportBundle>
  deleteExport(exportId: string, adminDID: string, proof: Invocation): Promise<void>
  listExports(adminDID: string): Promise<ExportMetadata[]>

  // Friend graph
  findLinkedIdentities(discordUserIds: string[]): Promise<Map<string, string>>  // discordId → DID
}
```

**Spec tests:**

```
cloud.spec.ts
├── Identity Service
│   ├── MUST create identity and return mnemonic
│   ├── MUST resolve identity by DID
│   └── MUST return null for unknown DID
├── OAuth Linking
│   ├── MUST generate valid OAuth redirect URL
│   ├── MUST exchange code for provider user info
│   ├── MUST issue VC linking DID to provider identity
│   ├── MUST verify VC is signed by cloud DID
│   ├── MUST reject expired/invalid OAuth codes
│   └── MUST support Discord, GitHub, Google providers
├── Encrypted Storage
│   ├── MUST store encrypted bundle
│   ├── MUST retrieve bundle by ID (admin DID verified)
│   ├── MUST reject retrieval by non-admin DID
│   ├── MUST delete bundle (with ZCAP invocation proof)
│   ├── MUST list exports for admin DID
│   ├── MUST NOT have access to decrypted content
│   └── MUST serve metadata (channel count, etc.) without decryption
├── Friend Graph
│   ├── MUST find DIDs for linked Discord user IDs
│   ├── MUST return only users who have linked (no guessing)
│   └── MUST not expose DID-to-Discord mappings without query
└── Self-Hosting
    ├── MUST be deployable as Docker container
    ├── MUST be configurable via environment variables
    └── MUST work without any external dependencies except storage
```

---

### 10. `@harmony/cli`

Command-line interface for all operations. The primary interface for Phase 1 before a UI exists.

**Commands:**

```
harmony identity create                  → create DID, output mnemonic
harmony identity show                    → display current identity + credentials
harmony identity recover --mnemonic      → recover from mnemonic
harmony identity link discord            → initiate Discord OAuth linking
harmony identity link github             → initiate GitHub OAuth linking
harmony identity export                  → export identity as encrypted sync payload
harmony identity import                  → import identity from sync payload

harmony community export                 → run migration bot, export Discord server
harmony community import <file>          → import export into local quad store
harmony community push <cloud-url>       → push encrypted export to cloud
harmony community pull <export-id>       → pull encrypted export from cloud
harmony community resign                 → re-sign VCs/ZCAPs for new instance
harmony community delete-remote          → revoke cloud copy

harmony friends find                     → find Discord friends who've migrated
harmony friends list                     → list linked connections

harmony store query <pattern>            → query local quad store
harmony store export [--format nquads]   → export quads
harmony store import <file>              → import quads
```

---

## Ontology (Harmony Vocabulary)

Define a Harmony RDF vocabulary used across all modules:

```
@prefix harmony: <https://harmony.example/vocab#> .
@prefix vc:      <https://www.w3.org/2018/credentials#> .
@prefix zcap:    <https://w3id.org/zcap#> .
@prefix did:     <https://www.w3.org/ns/did#> .
@prefix xsd:     <http://www.w3.org/2001/XMLSchema#> .
@prefix rdf:     <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs:    <http://www.w3.org/2000/01/rdf-schema#> .

# Core types
harmony:Community     rdfs:subClassOf  rdfs:Resource .
harmony:Channel       rdfs:subClassOf  rdfs:Resource .
harmony:Category      rdfs:subClassOf  rdfs:Resource .
harmony:Thread        rdfs:subClassOf  harmony:Channel .
harmony:Message       rdfs:subClassOf  rdfs:Resource .
harmony:Role          rdfs:subClassOf  rdfs:Resource .
harmony:Member        rdfs:subClassOf  rdfs:Resource .
harmony:Reaction      rdfs:subClassOf  rdfs:Resource .

# Predicates
harmony:author        rdfs:domain  harmony:Message ;    rdfs:range  did:DID .
harmony:content       rdfs:domain  harmony:Message ;    rdfs:range  xsd:string .
harmony:timestamp     rdfs:domain  harmony:Message ;    rdfs:range  xsd:dateTime .
harmony:replyTo       rdfs:domain  harmony:Message ;    rdfs:range  harmony:Message .
harmony:inChannel     rdfs:domain  harmony:Message ;    rdfs:range  harmony:Channel .
harmony:inCategory    rdfs:domain  harmony:Channel ;    rdfs:range  harmony:Category .
harmony:parentThread  rdfs:domain  harmony:Thread ;     rdfs:range  harmony:Message .
harmony:role          rdfs:domain  harmony:Member ;     rdfs:range  harmony:Role .
harmony:community     rdfs:domain  harmony:Member ;     rdfs:range  harmony:Community .
harmony:joinedAt      rdfs:domain  harmony:Member ;     rdfs:range  xsd:dateTime .
harmony:permission    rdfs:domain  harmony:Role ;       rdfs:range  xsd:string .

# VC types
harmony:DiscordIdentityCredential       rdfs:subClassOf  vc:VerifiableCredential .
harmony:CommunityMembershipCredential   rdfs:subClassOf  vc:VerifiableCredential .
harmony:EmailVerificationCredential     rdfs:subClassOf  vc:VerifiableCredential .
harmony:OAuthIdentityCredential         rdfs:subClassOf  vc:VerifiableCredential .

# ZCAP actions
harmony:SendMessage       rdf:type  zcap:Action .
harmony:DeleteMessage     rdf:type  zcap:Action .
harmony:AddReaction       rdf:type  zcap:Action .
harmony:ManageChannel     rdf:type  zcap:Action .
harmony:ManageRoles       rdf:type  zcap:Action .
harmony:MuteUser          rdf:type  zcap:Action .
harmony:BanUser           rdf:type  zcap:Action .
harmony:InviteMember      rdf:type  zcap:Action .
harmony:RelayMessage      rdf:type  zcap:Action .
harmony:VerifyMembership  rdf:type  zcap:Action .
```

---

## Project Structure

```
harmony/
├── packages/
│   ├── crypto/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── provider.ts              # CryptoProvider interface
│   │   │   ├── noble.ts                 # Noble implementation
│   │   │   └── mnemonic.ts              # BIP-39 mnemonic
│   │   ├── test/
│   │   │   └── crypto.spec.ts
│   │   └── package.json
│   ├── quads/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── store.ts                 # QuadStore interface
│   │   │   ├── memory.ts               # MemoryQuadStore
│   │   │   ├── sqlite.ts               # SQLiteQuadStore
│   │   │   ├── indexeddb.ts            # IndexedDBQuadStore
│   │   │   └── nquads.ts              # N-Quads serialiser/parser
│   │   ├── test/
│   │   │   ├── store.spec.ts           # interface conformance (run against all impls)
│   │   │   └── nquads.spec.ts
│   │   └── package.json
│   ├── did/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── provider.ts             # DIDProvider interface
│   │   │   ├── key.ts                  # did:key implementation
│   │   │   └── document.ts             # DID Document utilities
│   │   ├── test/
│   │   │   └── did.spec.ts
│   │   └── package.json
│   ├── vc/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── service.ts              # VCService interface + implementation
│   │   │   ├── types.ts                # Harmony VC type definitions
│   │   │   ├── proof.ts                # Proof creation/verification
│   │   │   └── revocation.ts           # RevocationStore interface + impls
│   │   ├── test/
│   │   │   └── vc.spec.ts
│   │   └── package.json
│   ├── zcap/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── service.ts              # ZCAPService interface + implementation
│   │   │   ├── capability.ts           # Capability types
│   │   │   ├── invocation.ts           # Invocation creation/verification
│   │   │   └── caveats.ts              # Caveat types + validation
│   │   ├── test/
│   │   │   └── zcap.spec.ts
│   │   └── package.json
│   ├── identity/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── manager.ts              # IdentityManager implementation
│   │   │   ├── sync.ts                 # Sync chain (Brave model)
│   │   │   └── recovery.ts             # Social recovery
│   │   ├── test/
│   │   │   └── identity.spec.ts
│   │   └── package.json
│   ├── migration/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── parser.ts               # Discord export parsers
│   │   │   ├── transform.ts            # Discord → RDF quad transformation
│   │   │   ├── encrypt.ts              # Export encryption/decryption
│   │   │   └── resign.ts               # Re-sign VCs/ZCAPs for instance migration
│   │   ├── test/
│   │   │   ├── parser.spec.ts
│   │   │   ├── transform.spec.ts
│   │   │   ├── encrypt.spec.ts
│   │   │   ├── resign.spec.ts
│   │   │   └── fixtures/               # sample Discord export data
│   │   └── package.json
│   ├── migration-bot/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── bot.ts                  # Discord bot
│   │   │   ├── export.ts               # Server export pipeline
│   │   │   └── commands.ts             # Slash commands (/harmony link, etc.)
│   │   ├── test/
│   │   │   └── migration-bot.spec.ts
│   │   └── package.json
│   ├── cloud/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── server.ts               # HTTP server (Hono or similar)
│   │   │   ├── identity.ts             # Identity service routes
│   │   │   ├── oauth.ts                # OAuth bridge
│   │   │   ├── storage.ts              # Encrypted export storage
│   │   │   └── friends.ts              # Friend graph queries
│   │   ├── test/
│   │   │   └── cloud.spec.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── cli/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── commands/
│   │   │       ├── identity.ts
│   │   │       ├── community.ts
│   │   │       ├── friends.ts
│   │   │       └── store.ts
│   │   └── package.json
│   └── vocab/
│       ├── harmony.ttl                  # Harmony ontology in Turtle
│       ├── harmony.jsonld               # JSON-LD context
│       └── package.json
├── turbo.json                           # Turborepo pipeline config
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── vitest.config.ts
├── LICENSE                              # CAL-1.0
└── README.md
```

---

## Build Order

Modules build bottom-up following the dependency graph. Each module is fully tested before the next begins.

```
Week 1:  @harmony/crypto + @harmony/quads + @harmony/vocab
         ─── foundation: keys, storage, ontology

Week 2:  @harmony/did + @harmony/vc
         ─── identity: create DIDs, issue credentials

Week 3:  @harmony/zcap + @harmony/identity
         ─── authorization: capabilities, delegation, recovery

Week 4:  @harmony/migration + @harmony/migration-bot
         ─── pipeline: parse Discord, transform to RDF, encrypt, export

Week 5:  @harmony/cloud + @harmony/cli
         ─── services: OAuth bridge, storage, friend graph, CLI

Week 6:  Integration testing + end-to-end flows
         ─── full pipeline: create identity → link Discord → export server
             → encrypt → push to cloud → pull → decrypt → re-sign → self-host
```

---

## End-to-End Test Scenarios

These validate the full Phase 1 story:

```
e2e.spec.ts
├── Individual Migration
│   ├── User creates identity (DID + mnemonic)
│   ├── User links Discord via OAuth → receives VC
│   ├── User imports personal GDPR export → quads in store
│   ├── User exports identity via sync chain
│   └── User imports identity on new device via mnemonic
│
├── Community Migration
│   ├── Admin creates identity
│   ├── Admin runs migration bot on Discord server
│   ├── Bot exports full server → encrypted bundle
│   ├── Admin pushes encrypted bundle to cloud
│   ├── Cloud stores bundle, serves metadata
│   ├── Members create identities, link Discord accounts
│   ├── Friend graph reconstructs connections
│   ├── Admin pulls encrypted bundle from cloud
│   ├── Admin decrypts on self-hosted instance
│   ├── Admin re-signs VCs and ZCAPs for new instance
│   └── Admin revokes cloud copy
│
├── Identity Recovery
│   ├── User sets up 3-of-5 social recovery
│   ├── User "loses" keypair
│   ├── 3 trusted friends approve recovery
│   ├── User generates new keypair
│   ├── Identity migrates to new DID
│   └── Credentials are re-issued
│
└── Cross-Instance Verification
    ├── User on Instance A presents VC to Instance B
    ├── Instance B verifies VC signature and revocation status
    ├── User invokes ZCAP to perform action on Instance B
    └── Instance B verifies full capability chain
```

---

_This document defines the Phase 1 implementation. Each module spec is the source of truth for what gets built. Tests pass → module is done._
