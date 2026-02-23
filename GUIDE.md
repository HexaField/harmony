# Harmony Setup Guide

This guide walks through setting up Harmony from scratch: creating an identity, running the server, deploying the cloud service, migrating a Discord community, and linking accounts.

---

## Prerequisites

- Node.js 22+
- pnpm (`corepack enable`)
- Docker (for cloud deployment)

Clone and install:

```bash
git clone https://github.com/HexaField/harmony.git
cd harmony
pnpm install
```

---

## 1. Create Your Identity

Everything in Harmony starts with a sovereign identity. This is a cryptographic keypair derived from a BIP-39 mnemonic phrase. You hold the mnemonic; nobody else does.

```typescript
import { createCryptoProvider } from '@harmony/crypto'
import { IdentityManager } from '@harmony/identity'

const crypto = createCryptoProvider()
const identityManager = new IdentityManager(crypto)

const { identity, mnemonic } = await identityManager.create()

console.log('Your DID:', identity.did) // did:key:z6Mk...
console.log('Your mnemonic:', mnemonic) // 12 words — write these down
```

Your DID is your identity everywhere in Harmony. The mnemonic is your backup. Lose the mnemonic and you lose the identity (unless you've set up social recovery).

To recover an existing identity on a new device:

```typescript
const { identity } = await identityManager.createFromMnemonic(mnemonic)
```

### Social Recovery (optional)

Distribute recovery shards to 5 trusted contacts. Any 3 can help you recover:

```typescript
const shards = await identityManager.createRecoveryShards(identity, keyPair, [
  'did:key:z6Mk...trusted1',
  'did:key:z6Mk...trusted2',
  'did:key:z6Mk...trusted3',
  'did:key:z6Mk...trusted4',
  'did:key:z6Mk...trusted5'
])
// Distribute each shard to the corresponding contact
```

---

## 2. Run a Harmony Server

The server is a WebSocket relay. It routes encrypted messages between clients and verifies authorization proofs (ZCAPs). It never sees message content.

```typescript
import { HarmonyServer } from '@harmony/server'
import { MemoryQuadStore } from '@harmony/quads'
import { createCryptoProvider } from '@harmony/crypto'

const crypto = createCryptoProvider()
const store = new MemoryQuadStore()

const server = new HarmonyServer({
  port: 4000,
  host: '0.0.0.0',
  store,
  didResolver: { resolve: async (did) => ({ id: did, verificationMethod: [] }) },
  revocationStore: { revoke: async () => {}, isRevoked: async () => false },
  cryptoProvider: crypto
})

await server.start()
console.log('Harmony server running on ws://localhost:4000')
```

For production, swap `MemoryQuadStore` for a persistent store and provide real DID resolution and revocation checking.

### Connect a client

```typescript
import { HarmonyClient } from '@harmony/client'

const client = new HarmonyClient({
  serverUrl: 'ws://localhost:4000',
  did: identity.did,
  keyPair: identity.keyPair
})

await client.connect()

// Create a community
const community = await client.createCommunity({
  name: 'My Community',
  description: 'A place for us'
})

// Create a channel
const channel = await client.createChannel(community.id, {
  name: 'general',
  type: 'text'
})

// Send a message
await client.sendMessage(channel.id, 'Hello, Harmony!')
```

All messages are E2EE by default. The server stores ciphertext only.

---

## 3. Deploy the Cloud Service

The cloud service handles OAuth identity linking, encrypted export storage, and acts as a migration gateway. It's optional — everything works without it — but it makes the Discord migration flow much smoother.

### With Docker

```bash
docker build -t harmony-cloud .
docker run -p 3000:3000 harmony-cloud
```

The Dockerfile builds from the repo root and exposes port 3000.

### Without Docker

```bash
pnpm --filter @harmony/cloud build
PORT=3000 node packages/cloud/dist/server.js
```

### Endpoints

| Endpoint                         | Purpose                                      |
| -------------------------------- | -------------------------------------------- |
| `GET /health`                    | Health check                                 |
| `POST /api/identity/link`        | Link a Discord account to a DID              |
| `POST /api/identity/verify`      | Verify an identity link                      |
| `POST /api/storage/upload`       | Upload an encrypted community export         |
| `GET /api/storage/download/:id`  | Download an encrypted export                 |
| `DELETE /api/storage/delete/:id` | Delete an export (ZCAP-authorized)           |
| `POST /api/friends/find`         | Find Harmony users from Discord friend lists |
| `GET /api/oauth/discord`         | Discord OAuth flow                           |

### Self-hosted cloud

The cloud service is the same code whether you run it yourself or use a managed instance. There are no features reserved for hosted. Point your clients at your own cloud URL and everything works identically.

---

## 4. Set Up the Migration Bot

The migration bot is a Discord bot that exports a community's history. It runs on the community admin's own machine — Harmony never touches Discord's API directly.

### Create a Discord bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application, add a bot
3. Enable the **Message Content** intent and **Server Members** intent
4. Generate an invite link with `bot` scope and these permissions: Read Messages, Read Message History, View Channels
5. Invite the bot to your Discord server

### Run the export

```typescript
import { MigrationBot, type DiscordAPI } from '@harmony/migration-bot'
import { createCryptoProvider } from '@harmony/crypto'
import { IdentityManager } from '@harmony/identity'

const crypto = createCryptoProvider()
const identityManager = new IdentityManager(crypto)
const { identity } = await identityManager.createFromMnemonic('your twelve word mnemonic ...')

// Implement the DiscordAPI interface with your bot token
const discordAPI: DiscordAPI = {
  getGuild: async (guildId) => {
    /* fetch from Discord REST API */
  },
  getChannels: async (guildId) => {
    /* ... */
  },
  getMessages: async (channelId, options) => {
    /* paginated fetch */
  },
  getMembers: async (guildId) => {
    /* ... */
  },
  getRoles: async (guildId) => {
    /* ... */
  }
}

const bot = new MigrationBot(crypto, discordAPI)

const result = await bot.exportGuild({
  guildId: 'YOUR_GUILD_ID',
  adminDID: identity.did,
  adminKeyPair: identity.keyPair,
  onProgress: (progress) => {
    console.log(`${progress.phase}: ${progress.current}/${progress.total}`)
  }
})

console.log(`Export complete: ${result.quads.length} quads`)
console.log(`Identity tokens: ${result.identityTokens.length}`)
```

The `DiscordAPI` interface is deliberately separate from any specific Discord library. You can use discord.js, Eris, or raw HTTP calls — the bot doesn't care.

### What gets exported

- All text channels and their messages
- Threads
- Roles and permissions
- Member list
- Server metadata (name, description, icon)

Messages are transformed into RDF quads and encrypted with the admin's DID keypair before leaving the machine.

---

## 5. Migrate a Community

Once you have an export, push it to your Harmony instance (cloud or self-hosted).

### Encrypt and upload

```typescript
import { MigrationService } from '@harmony/migration'
import { CloudService } from '@harmony/cloud'

const crypto = createCryptoProvider()
const migration = new MigrationService(crypto)
const cloud = new CloudService(crypto)

// Encrypt the export
const bundle = await migration.encryptExport(result.quads, identity.keyPair, identity.did)

// Push to cloud
const uploadResult = await cloud.uploadExport(bundle)
console.log('Export uploaded:', uploadResult.exportId)
```

### Download and decrypt on a self-hosted server

If you started on a managed cloud and want to move to self-hosted:

```typescript
// Pull from cloud
const downloaded = await cloud.downloadExport(exportId)

// Decrypt with your key
const decryptedQuads = await migration.decryptExport(downloaded, identity.keyPair)

// Import into your local quad store
await store.addAll(decryptedQuads)
```

The export is encrypted to your DID, so only you can decrypt it. The cloud service stores ciphertext. Moving from cloud to self-hosted is a download and a decrypt.

### Re-sign for a new admin

If community ownership transfers:

```typescript
const resigned = await migration.resignExport(decryptedQuads, newAdmin.keyPair, newAdmin.did)
```

---

## 6. Link Discord Accounts

Community members link their Discord identity to a sovereign DID. This is how the migrated history connects to their new Harmony identity.

### Generate an identity link token

During the bot export, identity tokens are generated for each member. Distribute these through the Discord server (the bot can DM them to members).

### Link via cloud

```typescript
const linkResult = await cloud.linkIdentity({
  discordUserId: '123456789',
  did: identity.did,
  proof: identityToken // from the migration bot
})
```

### Find friends

Once members have linked their accounts, you can find which of your Discord friends are on Harmony:

```typescript
const friends = await cloud.findFriends([
  '111111111', // Discord user IDs
  '222222222',
  '333333333'
])
// Returns DIDs for any that have linked
```

### What linking gives you

- Your messages in the migrated history show up under your DID
- Your roles and permissions carry over as Verifiable Credentials
- Friends who've also linked are automatically discoverable
- Your Discord account and Harmony identity are cryptographically linked (you can verify you're the same person across both platforms)

---

## 7. Day-to-Day Usage

Once the community is running on Harmony:

### Channels and messaging

```typescript
// List channels
const channels = client.getChannels()

// Send messages (always E2EE)
await client.sendMessage(channelId, 'Hello')

// Direct messages
await client.sendDM(recipientDID, 'Hey, private message')
```

### Voice and video

```typescript
// Join a voice channel (requires LiveKit server)
await client.joinVoice(channelId)
await client.leaveVoice(channelId)
```

### Moderation

Moderation is community-governed. There are no global bans. Each community sets its own rules.

```typescript
// Server-side rules (metadata-based, runs before decryption)
// Slow mode, rate limits, raid detection, VC-gated admission

// Client-side filtering (content-based, runs after decryption)
// Community-defined word filters, content rules
```

### Delegation

ZCAP delegation lets you grant scoped permissions to other users or bots:

```typescript
// Delegate posting rights to someone
await client.delegateTo(otherDID, ['SendMessage', 'AddReaction'])

// Delegate to a bot with attenuation
await client.delegateTo(botDID, ['SendMessage'], {
  channels: ['channel-1'], // only in this channel
  rateLimit: 10 // max 10 messages per minute
})
```

---

## Architecture Reference

```
Client (browser/native)
  └─ @harmony/client (SDK, E2EE, state)
       ├─ @harmony/e2ee (MLS group keys, X25519 DMs)
       ├─ @harmony/crdt (message ordering)
       └─ WebSocket ──→ @harmony/server (relay, ZCAP verification)
                              ├─ @harmony/federation (instance bridging)
                              └─ @harmony/moderation (server-side rules)

Identity stack: @harmony/crypto → @harmony/did → @harmony/vc → @harmony/zcap → @harmony/identity
Data layer:     @harmony/vocab → @harmony/quads (RDF quad store)
Migration:      @harmony/migration-bot → @harmony/migration → @harmony/cloud
```

The server is a relay. It verifies ZCAP proofs and routes ciphertext. It never decrypts anything. If the server is compromised, the attacker gets encrypted blobs and authorization metadata. Message content stays private.

---

## Troubleshooting

**"Cannot find module @harmony/..."** Run `pnpm install` from the repo root. All packages are workspace-linked.

**Identity lost** If you have your mnemonic, recover with `identityManager.createFromMnemonic()`. If you set up social recovery, collect 3 of 5 shards. If neither, the identity is gone — this is the tradeoff of sovereign keys.

**Migration bot can't access channels** Check that the bot has Read Messages, Read Message History, and View Channels permissions in Discord. The Message Content intent must be enabled in the developer portal.

**Self-hosted server can't federate** Federation requires both instances to exchange ZCAP capabilities. The initiating instance needs a valid TLS endpoint reachable by the remote instance.
