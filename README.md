# Harmony

**Sovereign, self-hostable Discord alternative built on W3C standards.**

Your identity is yours. Your data is yours. Your community governs itself.

---

## What is Harmony?

Harmony is a full-featured chat platform — text channels, DMs, threads, voice/video, bots, file sharing — with one fundamental difference: **you own everything.** Your identity is a cryptographic keypair (DID), not a username in someone else's database. Your messages are end-to-end encrypted — always, not opt-in. Your community's data is portable, self-hostable, and federated on your terms.

Built entirely on open standards (DIDs, Verifiable Credentials, ZCAPs, RDF), Harmony proves that sovereign infrastructure doesn't have to mean bad UX.

### Why not just use Discord?

Discord is excellent software with a centralised trust model. Harmony offers the same capabilities with a decentralised one:

|                  | Discord                          | Harmony                           |
| ---------------- | -------------------------------- | --------------------------------- |
| **Identity**     | Platform account                 | Sovereign DID (yours forever)     |
| **Encryption**   | Optional, limited                | E2EE always, everything           |
| **Data**         | Discord's servers                | Your server, your keys            |
| **Moderation**   | Platform + community             | Community only (no global bans)   |
| **Portability**  | Locked in                        | Export, migrate, federate anytime |
| **Self-hosting** | Not possible                     | Full feature parity, always       |
| **Auth model**   | Role-based (platform-controlled) | Capability-based (cryptographic)  |

### Migration, not abandonment

You don't leave Discord to use Harmony — you **extend beyond it.** Link your Discord identity to a sovereign DID, import your community's history, and let the centre of gravity shift naturally. Near-zero cost to try. No "convince 200 people to jump simultaneously" problem.

---

## Features

### Identity & Trust

- **Sovereign identity** — Ed25519 DID keypairs, BIP-39 mnemonic backup, sync chain across devices
- **Verifiable Credentials** — cryptographic proof of membership, roles, linked accounts, custom attestations
- **Social recovery** — 3-of-5 trusted contacts + OAuth fallback, time-locked with contest window
- **Reputation** — portable across communities via VC portfolio, community-defined credential types

### Communication

- **Text channels** — E2EE messages with CRDT ordering, offline-tolerant sync
- **Direct messages** — X25519 encrypted, no server visibility
- **Threads** — branch conversations from any message
- **Voice & video** — LiveKit-powered, encrypted, low-latency
- **Rich embeds** — link previews, media, file sharing (encrypted at rest)
- **Reactions, typing indicators, presence** — the polish you expect

### Authorization

- **Capability-based auth (ZCAPs)** — cryptographic proof of what you can do, not just who you are
- **Delegation chains** — admins delegate to mods, mods delegate to bots, with attenuation at every level
- **User-to-user delegation** — "post on my behalf while I'm away"
- **Governance capabilities** — community proposals, voting, constitutional constraints
- **AI agent authorization** — scoped, auditable, revocable capabilities for bots and agents

### Federation

- **Instance-to-instance** — communities on different servers can bridge channels
- **ZCAP-gated** — federation is explicit, scoped, revocable (no global network to join)
- **CRDT sync** — messages merge cleanly across federated instances, even with network partitions

### Moderation

- **Community-governed** — no global bans, no platform-level content decisions
- **Server-side (metadata)** — slow mode, rate limits, raid detection, VC admission requirements
- **Client-side (content)** — configurable filters run after decryption, community-defined rules
- **Full audit log** — every moderation action cryptographically attributed via ZCAP proof

### Bot & Integration API

- **ZCAP-authorized** — bots receive capabilities, not API keys. Scoped, attenuated, revocable.
- **Sandboxed execution** — resource limits, permission boundaries
- **Event-driven** — subscribe to message, member, channel lifecycle events
- **Webhook support** — outbound/inbound webhooks for external service integration

### Platform

- **Self-hostable** — Docker single-command deploy, full feature parity with cloud
- **Cloud option** — managed hosting for communities that don't want to run servers
- **Mobile** — PWA + native shells (Capacitor/Tauri) for iOS, Android, desktop
- **Search** — client-side full-text (decrypted content) + server-side metadata queries
- **Discord migration** — community bot exports everything, members link identities, history travels with you

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        @harmony/ui                          │
│                   SolidJS Chat Interface                     │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                      @harmony/client                        │
│          Isomorphic SDK — state, sync, encryption            │
└───────┬──────────┬──────────┬──────────┬────────────────────┘
        │          │          │          │
   ┌────▼───┐ ┌───▼────┐ ┌──▼───┐ ┌───▼─────┐
   │protocol│ │  crdt   │ │ e2ee │ │  voice  │
   │ types  │ │ordering │ │ MLS  │ │LiveKit  │
   └────────┘ └────────┘ └──────┘ └─────────┘
        │          │          │          │
┌───────▼──────────▼──────────▼──────────▼────────────────────┐
│                      @harmony/server                        │
│     WebSocket relay — routes ciphertext, verifies ZCAPs      │
└───────┬──────────┬──────────────────────────────────────────┘
        │          │
   ┌────▼───┐ ┌───▼──────────┐
   │  fed   │ │  moderation  │
   │ relay  │ │   plugins    │
   └────────┘ └──────────────┘

Foundation: @harmony/crypto → did → vc → zcap → identity → quads → vocab
Migration:  @harmony/migration → migration-bot → cloud → cli
```

**Data model:** RDF quads — every message, credential, capability, and community structure is linked data, natively interoperable with the semantic web.

**Encryption model:** The server is a relay, not an authority. It routes ciphertext and verifies ZCAP authorization proofs. It never sees message content. MLS (Messaging Layer Security) for group key management, X25519 for DMs.

**Sync model:** Lamport clocks + author DID for deterministic CRDT ordering. No consensus protocol needed. Messages merge cleanly across federation boundaries and offline periods.

---

## Packages

### Foundation (isomorphic — browser + Node)

| Package             | Purpose                                                                 |
| ------------------- | ----------------------------------------------------------------------- |
| `@harmony/crypto`   | Ed25519, X25519, XChaCha20-Poly1305, HKDF, BIP-39                       |
| `@harmony/quads`    | RDF quad store — CRUD, pattern matching, N-Quads serialization          |
| `@harmony/vocab`    | Harmony RDF ontology — namespaces, predicates, actions                  |
| `@harmony/did`      | DID creation, resolution, documents, multicodec encoding                |
| `@harmony/vc`       | Verifiable Credential issuance, verification, revocation                |
| `@harmony/zcap`     | Authorization capabilities — delegation, invocation, chain verification |
| `@harmony/identity` | Identity lifecycle — mnemonic, sync chain, social recovery              |

### Communication (isomorphic)

| Package             | Purpose                                               |
| ------------------- | ----------------------------------------------------- |
| `@harmony/protocol` | Wire protocol types — message formats, events, errors |
| `@harmony/crdt`     | Lamport clocks, CRDT log, offline merge, tombstones   |
| `@harmony/e2ee`     | MLS group encryption, X25519 DM encryption            |
| `@harmony/client`   | Client SDK — WebSocket, local state, E2EE, sync       |

### Infrastructure (server-side)

| Package               | Purpose                                                      |
| --------------------- | ------------------------------------------------------------ |
| `@harmony/server`     | WebSocket relay, ZCAP verification, quad persistence         |
| `@harmony/federation` | Instance-to-instance ZCAP-gated relay                        |
| `@harmony/moderation` | Rules engine — slow mode, rate limits, raid detection        |
| `@harmony/voice`      | LiveKit integration — room management, encrypted voice/video |
| `@harmony/bot-api`    | Bot runtime — ZCAP auth, sandboxing, event dispatch          |
| `@harmony/media`      | Encrypted file storage, thumbnails, link previews            |
| `@harmony/search`     | Metadata indexing, client-side full-text search helpers      |

### Applications

| Package                  | Purpose                                                 |
| ------------------------ | ------------------------------------------------------- |
| `@harmony/ui`            | SolidJS web application — full chat interface           |
| `@harmony/mobile`        | Capacitor/Tauri native shell + mobile-specific features |
| `@harmony/migration`     | Discord export parsing, RDF transformation              |
| `@harmony/migration-bot` | Discord bot for community export                        |
| `@harmony/cloud`         | Identity service, OAuth gateway, encrypted storage      |
| `@harmony/cli`           | Command-line interface                                  |

---

## Quick Start

### Cloud (easiest)

```bash
# Visit harmony.example.com, create identity, join or create a community
```

### Self-Hosted

```bash
docker compose up -d
# Your instance is running. Full feature parity with cloud.
```

### Development

```bash
git clone https://github.com/HexaField/harmony.git
cd harmony
pnpm install
pnpm -r test        # run all tests
pnpm -r check       # type-check
```

---

## Discord Migration

1. **Community admin** installs the open-source migration bot on their Discord server
2. **Bot exports** channels, messages, roles, threads — encrypted with the admin's DID
3. **Data lands** on Harmony (cloud or self-hosted) — server stores only ciphertext
4. **Members link** their Discord identities → connections reconstruct automatically
5. **Community is live** — full history, same people, sovereign infrastructure

The bot runs on the community's own machine. Harmony never touches Discord's API. Each community is independent — there's no central application to shut down.

---

## Standards

| Standard                                                           | Usage                                    |
| ------------------------------------------------------------------ | ---------------------------------------- |
| [W3C DIDs](https://www.w3.org/TR/did-core/)                        | Identity — `did:key` (method-agnostic)   |
| [W3C Verifiable Credentials](https://www.w3.org/TR/vc-data-model/) | Membership, roles, attestations          |
| [W3C ZCAPs](https://w3c-ccg.github.io/zcap-spec/)                  | Authorization — capabilities, delegation |
| [W3C RDF](https://www.w3.org/TR/rdf11-concepts/)                   | Data model — quads, linked data          |
| [RFC 9420 MLS](https://www.rfc-editor.org/rfc/rfc9420)             | Group E2EE key management                |
| [LiveKit](https://livekit.io/)                                     | Voice/video SFU                          |

---

## License

[Cryptographic Autonomy License (CAL-1.0)](https://github.com/holochain/cryptographic-autonomy-license) — protects source openness like AGPL, plus legally requires that anyone running the software preserves end-user control of their identity and data.

---

## Contributing

Harmony is community-governed. See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

---

_Your community. Your identity. Your rules._
