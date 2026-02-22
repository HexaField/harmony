# Harmony — Discord Alternative with Sovereign Identity

_2026-02-22 — Josh Field & Hex_

---

## Premise

Discord's escalating surveillance (phone verification, AI training on messages, real-name policies) is driving Nitro cancellations and user distrust. Harmony is a self-hostable, open-source Discord alternative with decentralised identity (DIDs + Verifiable Credentials) bridging cloud-hosted and self-hosted instances, so users own their identity across the entire network.

## Strategic Position

Harmony is built on **W3C standards and semantic web principles** — not proprietary protocols.

1. **Immediate value:** A Discord alternative people understand and want right now.
2. **Standards-first:** Identity via W3C DIDs and Verifiable Credentials. Data stored as RDF quads — the same linked data foundation the semantic web is built on. Federation via open protocols. No lock-in at any layer.
3. **DWeb-aligned:** Designed for a decentralised web. Agent-centric identity, community self-governance, peer-to-peer federation. The familiar UX of a chat app as a gateway to genuinely sovereign social infrastructure.
4. **Directed energy:** Gives the open-source community a concrete product to rally around, building contributor momentum toward decentralised social infrastructure more broadly.

The sequence: **Discord users → Harmony → self-hosted Harmony → fully decentralised social infrastructure.** Each step is independently valuable; each opens the door to the next.

---

## Core Architecture

### Data Model (RDF Quads)

All data is stored as RDF quads (subject, predicate, object, graph). This means:

- **Messages, channels, roles, users, communities** — all expressed as linked data
- **Natively queryable** via SPARQL or any RDF-compatible tooling
- **Interoperable** with the broader semantic web, linked data, and DWeb ecosystems
- **Portable** — export your data as standard RDF (Turtle, JSON-LD, N-Quads) and import it anywhere
- **Future-proof** — any system that speaks linked data can interoperate with Harmony without adapters

```
Example: a message as RDF quads

harmony:msg-001  rdf:type           harmony:Message       <harmony:channel-general>
harmony:msg-001  harmony:author     did:key:z6Mk...       <harmony:channel-general>
harmony:msg-001  harmony:content    "Hello world"          <harmony:channel-general>
harmony:msg-001  harmony:timestamp  "2026-02-22T10:00:00Z" <harmony:channel-general>
harmony:msg-001  harmony:replyTo    harmony:msg-000        <harmony:channel-general>
```

The graph (4th element) maps naturally to context — a channel, a DM thread, a community. This gives you scoped queries, access control per graph, and clean federation boundaries.

### Verifiable Credentials — The Connective Tissue

In Discord, the platform is the authority for everything: who you are, what servers you're in, what roles you have, whether you're trustworthy. Remove the platform, and all of that evaporates. Verifiable Credentials replace platform authority with **portable, cryptographically verifiable claims** that any party can issue and any party can verify, without calling home to a central server.

VCs are not a feature of Harmony — they are the mechanism by which Harmony works without needing to be a platform. Every function that a platform database currently performs for identity, membership, and permissions is replaced by VCs: portable, verifiable, and without a central authority.

#### Identity Linking

The migration use case. A VC attesting "this DID owns this Discord account," issued by whichever instance verified the OAuth flow. Other verified identities (email, GitHub, Google) work the same way — each becomes a VC in the user's credential portfolio.

#### Community Membership

In Discord, "you're a member of this server" is a row in Discord's database. If Discord goes down or bans the server, that relationship evaporates. In Harmony, membership is a VC:

```turtle
vc:mem-001  rdf:type              vc:VerifiableCredential   <harmony:community-xyz>
vc:mem-001  vc:issuer             did:key:z6Mk...admin      <harmony:community-xyz>
vc:mem-001  vc:credentialSubject  did:key:z6Mk...alice      <harmony:community-xyz>
vc:mem-001  harmony:role          "moderator"                <harmony:community-xyz>
vc:mem-001  harmony:joinedAt      "2026-02-22T00:00:00Z"    <harmony:community-xyz>
```

The community admin's DID signs a VC saying "Alice is a moderator of this community." Alice holds this credential. She can present it to *any* Harmony instance to prove her membership and role — even if the original instance is offline. The community can revoke it, but Alice always has proof that the credential existed.

If a community migrates from one instance to another, or splits across multiple instances, membership travels with the user. No re-invites, no lost roles, no starting over.

#### Roles & Permissions as Portable Credentials

Discord roles are instance-local state. In Harmony, roles are VCs:

- **Community roles** — admin, moderator, member, custom roles — issued by community admins
- **Channel permissions** — read/write/manage per channel — embedded in role VCs or as separate capability credentials
- **Delegated authority** — a moderator can issue time-limited VCs to other members (e.g. "temporary mute power for this channel for 24h")

A moderator's authority is *verifiable* — anyone can check that the mod was granted that role by a legitimate admin. No "trust me, I'm a mod" — the cryptographic proof is right there.

#### Trust Bootstrapping for New Users

A new user arrives with no reputation in DID-space. Their VCs are their trust anchors:

- **Discord identity VC** — "I was a real person on Discord with a 5-year-old account"
- **Email verification VC** — "I control this email address"
- **OAuth VCs** — GitHub, Google, etc. — each adds weight
- **Community membership VCs** — "I'm a trusted member of these other communities"

Communities set their own admission policies based on VCs: "To join, you need at least one verified identity VC" or "Open to anyone" or "Members must hold a VC from a community in our trust network." This is **programmable trust** without a central authority — each community decides what credentials they accept.

#### Cross-Community Reputation

Because VCs are portable, reputation accrues across the network without any central reputation system:

- A moderator credential from Community A is *visible* to Community B
- Communities can form trust networks: "We trust VCs issued by these communities"
- A user's VC portfolio becomes their decentralised identity — richer than any single platform profile

```
Alice's VC portfolio:
├─ discord:alice#1234 (verified via OAuth)
├─ Member of CommunityA since 2026-02 (issued by CommunityA admin)
├─ Moderator of CommunityB (issued by CommunityB admin)
├─ Email: alice@example.com (verified)
└─ GitHub: @alice (verified via OAuth)
```

Any community she approaches can evaluate this portfolio against their own admission criteria. No global reputation score, no central authority — just verifiable facts that communities interpret according to their own values.

#### E2EE Key Exchange Bootstrapping

Since everything is E2EE, establishing encrypted channels requires key exchange. VCs carry public encryption keys:

- Community membership VC includes the member's current encryption public key
- When Alice joins a channel, her VC proves membership *and* provides the key needed to include her in the group encryption
- Key rotation → new VC with new key, old VC revoked

This ties access control directly to the credential layer rather than maintaining a separate key management system.

#### Revocation & Bans

Community bans = VC revocation:

- Membership VC is added to a revocation list (or a status endpoint returns "revoked")
- Any instance checking that VC sees it's no longer valid
- The ban is *community-scoped* — other communities' VCs are unaffected
- The banned user still holds the (now-revoked) VC as proof of what happened (transparency / appeals)

#### VC Phasing

**MVP:** Identity linking VCs (Discord OAuth), community membership VCs (join/leave), role VCs (admin/mod/member). Stored as RDF quads. Verification is local (check the signature, check the revocation list).

**Phase 2:** Cross-community trust networks, VC-based admission policies, delegated authority, encryption key binding.

**Phase 3:** Rich VC portfolio UI, community-defined custom credential types, reputation aggregation, VC-based bot/integration permissions.

### Authorization Capabilities (ZCAPs) — What You Can Do

VCs answer "who are you?" — ZCAPs answer "what can you do right now?" A VC saying "Alice is a moderator" is a credential. But it doesn't specify *what* a moderator can do, in *which* channels, with *what* constraints. That's authorization — and that's where [ZCAPs (Authorization Capabilities for Linked Data)](https://w3c-ccg.github.io/zcap-spec/) come in.

In Discord, both identity and authorization are answered by the same central database. In Harmony, VCs handle identity/attestation and ZCAPs handle authorization/delegation — both portable, both cryptographically verifiable, both operating without a central authority.

#### Channel-Level Authorization

Instead of a permissions matrix stored on a server, each action is gated by a capability:

```turtle
zcap:cap-001  rdf:type               zcap:Capability           <harmony:community-xyz>
zcap:cap-001  zcap:invoker           did:key:z6Mk...alice      <harmony:community-xyz>
zcap:cap-001  zcap:parentCapability  zcap:root-community-xyz   <harmony:community-xyz>
zcap:cap-001  zcap:allowedAction     harmony:SendMessage       <harmony:community-xyz>
zcap:cap-001  zcap:allowedAction     harmony:AddReaction       <harmony:community-xyz>
zcap:cap-001  harmony:scope          harmony:channel-general   <harmony:community-xyz>
zcap:cap-001  zcap:delegator         did:key:z6Mk...admin      <harmony:community-xyz>
```

Alice doesn't check a permission database before posting — she *invokes* her capability. The receiving node verifies the chain: admin had root capability → admin delegated to Alice → Alice's invocation is valid. No round-trip to a central server. This is critical for federation — an instance receiving a message from a federated user can verify authorization locally by checking the ZCAP chain.

#### Delegation Chains

This is where ZCAPs shine over traditional ACLs:

```
Community Admin (root capability for community-xyz)
  │
  ├─► delegates to Moderator Bob:
  │     SendMessage, DeleteMessage, MuteUser
  │     scope: all channels
  │     expiry: none
  │
  │     Bob delegates to Temp-Mod Carol:
  │       DeleteMessage only
  │       scope: #support channel only
  │       expiry: 24 hours
  │
  ├─► delegates to Bot "CleanupBot":
  │     DeleteMessage only
  │     scope: #spam-filter channel
  │     constraint: message.age > 30 days
  │
  └─► delegates to Federation Peer (Instance B):
        RelayMessage, VerifyMembership
        scope: community-xyz
        constraint: rate-limit 1000/hour
```

Every link in the chain **attenuates** — it can only narrow permissions, never widen them. Bob can't give Carol powers Bob doesn't have. The bot can't delete messages outside its scoped channel. All cryptographically provable without asking anyone.

#### Federation Authorization

When Instance A and Instance B federate:

- Instance A's community admin issues a ZCAP to Instance B: "You may relay messages and verify membership for community-xyz"
- Instance B's users invoke their capabilities via Instance B, which chains through to Instance A's root
- If Instance A revokes federation with Instance B, they revoke the ZCAP — Instance B can no longer prove authorization for any action

Without ZCAPs, federation authorization requires either mutual trust (dangerous) or a central registry (defeats the purpose). ZCAPs make federation authorization granular, revocable, and verifiable.

#### E2EE Key Access

Ties into the VC key exchange model but adds authorization:

- A ZCAP grants "access to the encryption key for channel X"
- When Alice joins a channel, her membership VC proves identity, and a ZCAP authorizes her to receive the channel key
- If she's banned (VC revoked), the ZCAP for key access is also revoked — she can't decrypt new messages
- Key rotation can be triggered by ZCAP revocation: when any member's access is revoked, the channel re-keys and distributes new ZCAPs to remaining members

#### Bot & Integration Permissions

Instead of Discord's coarse OAuth scopes ("this bot can read all messages in all channels"), ZCAPs give fine-grained, delegatable, revocable authorization:

- "This bot can read messages in #announcements only"
- "This bot can post in #bot-output, max 10 messages per hour"
- "This integration can read member list but not message content"

Community admins delegate exactly what they want, scoped exactly how they want, with expiry if they want.

#### User-to-User Delegation

- "I'm on holiday — here's a ZCAP for my trusted friend to moderate my community in my absence, expires in 2 weeks"
- "I delegate my voting capability in community governance to this person for this decision"
- "My AI agent has a ZCAP to send messages on my behalf in these channels, but not to moderate or change settings"

#### How VCs and ZCAPs Work Together

They're complementary layers, not alternatives:

| Concern | Mechanism | Example |
|---------|-----------|---------|
| Who is this person? | VC | "Alice, verified via Discord OAuth" |
| Are they a member? | VC | "Member of community-xyz since Feb 2026" |
| What role do they hold? | VC | "Moderator, issued by community admin" |
| Can they post in #general? | ZCAP | Capability to SendMessage, scoped to #general |
| Can they delete messages? | ZCAP | Capability delegated from admin, attenuated to specific channels |
| Can this bot read messages? | ZCAP | Capability with read-only constraint, scoped and rate-limited |
| Can Instance B federate? | ZCAP | Capability to relay/verify, revocable |

**VCs are about identity and attestation. ZCAPs are about authorization and action.** A VC tells you someone *is* a moderator. A ZCAP tells you what that moderator *can do*, where, and until when.

#### ZCAP Phasing

**MVP:** Root capabilities per community. Basic delegation: admin → roles (mod/member). Channel-scoped send/read capabilities. Revocation via revocation lists.

**Phase 2:** Multi-level delegation chains. Time-limited capabilities. Federation ZCAPs. Bot/integration authorization.

**Phase 3:** User-to-user delegation. Governance capabilities. Programmable constraints (rate limits, content-type restrictions). AI agent authorization.

### Identity Layer (Multi-Strategy)

```
did:key:z6Mk...  (user's sovereign DID — primary identity)
  │
  ├─ Strategy 1: Cloud-generated keypair (easy onboarding)
  ├─ Strategy 2: Browser-held keypair (WebCrypto / extension)
  ├─ Strategy 3: Self-hosted node keypair
  │
  ├─ Recovery:
  │   ├─ OAuth login (Google/GitHub/etc) → recovery key derivation
  │   ├─ Social recovery (2-of-N trusted friends independently verify)
  │   └─ Brave-style sync chain (mnemonic phrase)
  │
  ├─ Verifiable Credentials:
  │   ├─ VC: "discord:userid:123456789" (linked via OAuth/plugin)
  │   ├─ VC: "email:josh@example.com" (verified)
  │   └─ VC: custom attestations
  │
  └─ Service Endpoints:
      ├─ harmony-cloud:user-josh
      └─ harmony-self:myserver.example.com
```

**Key insight:** DIDs are primary, but Web2 auth (OAuth) remains viable for onboarding, recovery, and verification. Users don't need to understand DIDs — they just log in. Power users can manage keys directly.

### Federation (Holarchic)

```
┌─────────────────────────────────────────────┐
│              Global Identity Layer           │
│   (DIDs resolve across all instances)        │
└──────────┬──────────────┬───────────────────┘
           │              │
    ┌──────▼──────┐  ┌────▼────────────┐
    │ Harmony Cloud│  │ Self-Hosted Node │
    │  Instance A  │  │   Instance B     │
    │              │  │                  │
    │ ┌──────────┐│  │ ┌──────────┐     │
    │ │ Server 1 ││  │ │ Server 3 │     │
    │ │ Server 2 ││  │ │ Server 4 │     │
    │ └──────────┘│  │ └──────────┘     │
    └─────────────┘  └──────────────────┘
```

- **Users federate:** A user on Instance A can join a server on Instance B. Their DID is the passport.
- **Servers federate:** A server can span instances (channels distributed across nodes).
- **Moderation is local:** Each community governs itself. No global bans. No central authority deciding what speech is allowed.
- **Consistency:** CRDTs + event sourcing for message ordering and conflict resolution.

### Cloud Services (Revenue)

The cloud separates two distinct services:

1. **Identity Service** — DID creation, VC issuance, Discord linking attestations, key recovery, social recovery coordination. This is the trust anchor for the network but NOT a single point of failure (self-hosted nodes can also verify).

2. **Hosting Service** — Managed Harmony instances for communities that don't want to self-host. Standard SaaS tiers.

---

## Why This Migration Approach Works When Others Haven't

Every previous Discord alternative — Matrix, Revolt, Guilded, Rocket.Chat — has made the same ask: "Leave Discord and come to us instead." This requires users to:

1. Create a new account on a new platform
2. Convince their friends to do the same
3. Abandon their history, connections, and identity
4. Hope enough people follow to make it worth it

That's not migration. That's starting over. And it fails every time because the social cost is enormous and the payoff is uncertain. You're asking people to trade a functioning community for an empty room with better principles.

**Harmony's approach is fundamentally different: you don't leave Discord. You extend beyond it.**

You link your existing Discord identity to a sovereign DID — a cryptographically verifiable proof that you're the same person. Your community admin exports the entire server — messages, channels, roles, history — into Harmony. When your friends link their accounts, connections reconstruct automatically. You don't lose anything. You don't start over. You *arrive* with your identity, your history, and your people already there.

The critical difference is that **the cost of trying is nearly zero.** You're not choosing between Discord and Harmony — you're adding Harmony alongside Discord and seeing which one earns your time. There's no moment where you have to convince 200 people to jump simultaneously. The community migrates its data, members trickle over as they link their identities, and at some point the centre of gravity shifts naturally.

This works because:

- **Identity is portable, not platform-bound.** Your DID exists above any single instance. Linking your Discord account doesn't create a Harmony account — it extends your sovereign identity to include a verified Discord history. If Harmony fails, your DID and credentials still exist.
- **History travels with the community.** The migration bot doesn't just export a membership list — it exports the full living archive. When you arrive on Harmony, the conversations are already there. You're continuing, not starting over.
- **The network effect works *for* you, not against you.** Every user who links their Discord ID makes it easier for the next person — their friends see "Alice is already here" when they arrive. Traditional alternatives fight Discord's network effect head-on. Harmony leverages it by importing the graph.
- **Communities migrate as units, not individuals.** The server admin initiates the migration for the whole community. Members don't each need to independently decide to try a new platform — the community moves and members follow.

---

## Discord Migration Path

### Individual Data Export

Discord's GDPR data package includes:
- **Account info** — username, email, settings, payment history
- **Messages** — ALL messages you've sent (with channel IDs, timestamps)
- **Servers** — list of servers you're in/were in
- **Activity** — voice sessions, reactions, read states, etc.
- **Connections** — linked accounts (Twitch, Steam, etc.)

**What's NOT included:**
- Other people's messages (you only get your own)
- Server structure, roles, permissions, bot configs
- Channel history you didn't author
- Media/attachments (only references)

**Assessment:** The individual export is useful for personal archive but insufficient for community migration. You get a one-sided conversation history and a server membership list, not a reconstructable community.

### Community Migration Bot (Self-Hosted)

This is the critical piece. A Discord bot that:
1. Is installed by the server owner/admin
2. Runs on the community's own infrastructure (or a member's machine)
3. Reads channel history via Discord API (with `MESSAGE_CONTENT` privileged intent)
4. Exports: messages, threads, roles, permissions, channel structure, pins, reactions
5. Transforms into Harmony import format (RDF quads)
6. Encrypts the export with the admin's DID keypair
7. Pushes to Harmony Cloud or imports directly into a self-hosted instance

### Cloud as Migration Gateway

Not every community admin can or wants to run their own server immediately. The cloud serves as a **zero-friction landing zone**:

1. Admin runs the migration bot locally, exporting their Discord server
2. Export is **encrypted with the community admin's DID keypair** before upload — Harmony Cloud stores ciphertext it cannot read
3. Data lands on Harmony Cloud, community is live, members can start joining
4. At any point, the admin can:
   - **Migrate to self-hosted:** Download the encrypted export, decrypt with their key, import into their own Harmony instance. Re-sign any community VCs and ZCAPs with their DID — the admin's identity is the continuity, not the hosting location.
   - **Revoke cloud access:** Delete the encrypted data from cloud. Since the cloud never had the decryption key, there's nothing to leak.
   - **Stay on cloud:** If self-hosting isn't a priority, the cloud works fine. No pressure, no lock-in.

```
Migration flow:

Discord Server                    Harmony Cloud              Self-Hosted
    │                                  │                         │
    │  1. Bot exports server           │                         │
    │  2. Encrypts with admin DID      │                         │
    │  3. Pushes encrypted data ──────►│                         │
    │                                  │  4. Community is live   │
    │                                  │  5. Members join        │
    │                                  │                         │
    │                                  │  6. Admin decides to    │
    │                                  │     self-host           │
    │                                  │  7. Downloads export ──►│
    │                                  │  8. Decrypts locally    │
    │                                  │  9. Re-signs VCs/ZCAPs  │
    │                                  │  10. Revokes cloud copy │
    │                                  │                         │
```

**What needs re-signing on migration:**
- Community membership VCs — re-issued by admin's DID, now pointing at the self-hosted instance as service endpoint
- ZCAPs — new root capability for the self-hosted instance, delegations re-issued
- User identity VCs are **unaffected** — they're tied to the user's DID, not the hosting location

This means the admin's DID is the anchor of continuity. The community can move between cloud and self-hosted (or between self-hosted instances) without members needing to do anything — their membership VCs are re-issued by the same admin DID they already trust.

### GDPR Analysis

**Does self-hosting the bot solve the data controller problem? Yes, substantially.**

- The **data controller** is the entity that determines the purpose and means of processing. The server admin is already the data controller for their community's data.
- If Harmony provides the bot as open-source software but the community runs it themselves, **Harmony never touches the data**. Harmony is a software vendor, not a controller or processor.
- The admin's processing has a **legitimate interest** basis: migrating their community to a new platform.
- The admin should notify members before migration (transparency) and offer opt-out.

**Cloud storage considerations:**
- Data is encrypted before upload — Harmony Cloud is a storage provider, not a processor of the content
- Admin holds the only decryption key (their DID keypair)
- Admin can revoke/delete cloud copy at any time
- Harmony Cloud's role is equivalent to an encrypted backup service (like Tresorit or SpiderOak)

**Remaining GDPR considerations:**
- Members who've left the server — best practice: exclude or anonymise their messages
- DMs are off-limits — the bot never touches DMs
- Admin must provide a privacy notice explaining what data is exported and why

### Discord API / ToS Risk

Discord's ToS prohibits scraping and restricts API data usage. Their Developer Policy requires `MESSAGE_CONTENT` privileged intent approval for bots in 75+ servers.

**This is largely mitigated by the decentralised model.** Each community creates their own bot application in their own Discord developer account, runs the migration tool on their own infrastructure, and uses their own bot token. There is no central application for Discord to revoke, no single point to shut down, and no relationship between Harmony (the project) and Discord's API. We distribute open-source software; communities choose to use it. This is no different from tools like DiscordChatExporter that have existed for years without legal action.

Remaining considerations:
- Individual community bot tokens could theoretically be revoked, but Discord would need to identify and target each one independently.
- The `MESSAGE_CONTENT` intent threshold (75+ servers) won't be hit by a single-community migration bot.
- Any legal action against the open-source project itself would be unprecedented and a PR disaster for Discord given current sentiment.

### Discord Identity Linking Flow

```
1. User creates Harmony account → DID generated (cloud or local)
2. User initiates Discord link:
   Option A: OAuth2 flow
     - Harmony Cloud app redirects to Discord OAuth
     - Discord confirms user identity
     - Harmony Cloud issues VC: "did:key:z6Mk... owns discord:123456789"
     - VC signed by Harmony Cloud's DID
   Option B: Discord plugin/bot verification
     - User runs command in Discord: /harmony link <token>
     - Bot verifies the Discord user ID matches the token
     - Harmony Cloud (or self-hosted node) issues the VC
3. VC stored in user's DID document / credential wallet
4. Other migrating users can verify connections:
   "Alice's DID has a VC proving she's discord:alice#1234"
   "I was friends with discord:alice#1234"
   → Auto-suggest connection on Harmony
```

### Friend Graph Reconstruction

Two approaches:
1. **Implicit via verification sources:** If both users have linked their Discord IDs via VCs, the system can cross-reference friend lists from their Discord data exports and suggest connections. This is automatic but depends on both users having migrated.

2. **Explicit UX:** "Find friends who've moved to Harmony" — enter your Discord username, see which of your contacts are already here. Simple, familiar, like every other social platform's "find contacts" feature.

---

## Revenue Model

| Tier | What | Price |
|------|------|-------|
| Free (cloud) | Basic communities, limited storage/history | $0 |
| Pro (cloud) | Full history, higher uploads, custom domains, priority federation | $X/mo |
| Enterprise | SSO, audit logs, SLA, compliance features | $Y/mo |
| Self-hosted | Full feature parity, forever free, open source | $0 |
| Support contracts | Managed updates, priority support for self-hosters | $Z/mo |
| Identity service | Premium identity features (advanced VCs, enterprise SSO bridge) | TBD |

**The commitment:** Self-hosted never gets feature-gated. Cloud value prop = convenience + managed infrastructure + identity service trust anchor.

---

## Resolved Questions

- **Strategic position:** Standalone product built on W3C/DWeb standards (DIDs, VCs, RDF). Data stored as RDF quads — natively interoperable with any linked data / semantic web system.
- **Tech stack:** TypeScript to start — fastest to MVP, largest contributor pool. Can migrate performance-critical components to Rust over time.
- **Voice/video:** LiveKit integration. Open source, proven, handles the hard WebRTC/SFU problems.
- **Federation protocol:** Language-based abstraction layer allowing multiple transport/storage backends per community — ActivityPub, Matrix, NextGraph, IPFS, Cloudflare, and others can be used and interchanged. Communities choose what fits their needs.
- **Mobile:** Required from day one. PWA first for maximum reach, then Electron/Capacitor or Tauri for native desktop and mobile.
- **Bot API:** Out of MVP scope. Ship later once the core platform is stable.
- **Moderation:** Community-specific, no global bans. Ship with solid baseline tools (automod, slow mode, raid protection) and let communities extend.
- **E2E encryption:** Everything encrypted, always. No opt-in, no exceptions. Efficiency optimisations can be explored (e.g. MLS for group key management) but the default is E2EE.
- **Governance:** TBD — community-governed to start, will evolve through conversation as the project matures.
- **Naming:** "Harmony" is a working title. Final name TBD.
- **License:** [Cryptographic Autonomy License (CAL-1.0)](https://github.com/holochain/cryptographic-autonomy-license) — protects source code openness like AGPL, but also legally requires that anyone running the software preserves end-user control of their identity and data. Purpose-built for exactly this kind of project.
- **Trust model:** Agent-centric trust holarchy, not platform-centric hierarchy. Communities verify themselves. Cloud is a bootstrap gateway, itself open source and self-hostable — even the "central" service is decentralisable.
- **Revenue:** Deprioritised. Get something working, see if community can run with it. Cloud hosting as optional convenience, not a business model dependency.
- **CRDTs / consistency:** Solved problem for Josh. Not a concern.
- **Self-hosting complexity:** Non-issue once tooling matures. Single-binary or Docker target.
- **Social recovery:** Standard 2-of-5 or 3-of-5 threshold + OAuth backup. Time-locked with contest window.
- **Sync chain:** Brave model — proven at scale, high-stakes data (crypto, passwords), known and trusted.
- **DID method:** Support any and all. Start with `did:key` (simplest, no infrastructure), design the identity layer to be method-agnostic so `did:web`, `did:plc`, etc. can be added without architectural changes.
- **Migration model:** Both community-level (server admin runs migration bot) and individual (personal data export + identity linking). Captures energy from both angles.
- **Timeline:** Days to weeks for MVP with AI tooling + community contributors. Ship fast, iterate.

## Open Questions

_None blocking MVP. All remaining questions are implementation-level decisions to be made during build._

---

## Competitive Landscape

| Product | Open Source | Self-Host | Federation | Voice | DID Identity | Discord Migration |
|---------|-----------|----------|-----------|-------|-------------|-------------------|
| Discord | ❌ | ❌ | ❌ | ✅ | ❌ | N/A |
| Matrix/Element | ✅ | ✅ | ✅ | ⚠️ | ❌ | ❌ |
| Revolt | ✅ | ✅ | ❌ | ⚠️ | ❌ | ❌ |
| Rocket.Chat | ✅ | ✅ | ⚠️ | ⚠️ | ❌ | ❌ |
| Guilded | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Harmony** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**Differentiation:** DID-based identity + Discord migration path. Nobody else has both.

---

## Suggested MVP Scope

**Phase 1 — Identity + Migration (the wedge)**
- DID creation (cloud + browser)
- Discord OAuth linking + VC issuance
- Discord data import (personal export)
- Self-hosted migration bot (community export)
- Friend graph reconstruction
- Basic web UI showing your imported data + connections

**Phase 2 — Chat**
- Text channels, DMs, threads
- Federation protocol (instance-to-instance)
- CRDT-based message sync
- Basic moderation tools

**Phase 3 — Parity**
- Voice/video (LiveKit integration)
- Bot API
- Mobile apps
- E2EE for DMs
- Rich embeds, file sharing, search

---

_This document is a living plan. Update as decisions are made._
