# Direct Messages — Architecture & Sovereignty Roadmap

## How DMs Work Today

### Overview

DMs are **peer-to-peer relationships** addressed by DID, not server-local user IDs. But because Harmony uses community servers as connection infrastructure, DMs currently **piggyback on community server WebSocket connections** as blind relays.

The server never sees plaintext — it forwards encrypted ciphertext between connected clients.

### Message Flow

```
Alice                         Server                        Bob
  │                             │                             │
  │  dm.send {                  │                             │
  │    recipientDID: bobDID,    │                             │
  │    content: <ciphertext>,   │                             │
  │    nonce, clock             │                             │
  │  } ─────────────────────►   │                             │
  │                             │  dm.message {               │
  │                             │    sender: aliceDID,        │
  │                             │    content: <ciphertext>    │
  │                             │  } ─────────────────────►   │
  │                             │                             │
```

1. **Encrypt**: Client calls `encryptForDM(recipientDID, plaintext)` → XChaCha20-Poly1305 ciphertext (or plaintext fallback if no key exchange yet)
2. **Send**: `send()` broadcasts to **all** connected servers (DMs have no `communityId`, so they can't be routed to a specific community server)
3. **Relay**: Each server checks its connection map for `conn.did === recipientDID` and forwards as `dm.message`
4. **Decrypt**: Recipient's client looks up the `dmEncChannels` Map for the sender DID, decrypts, emits to store

### E2EE Key Exchange (X25519 + XChaCha20-Poly1305)

First contact between two users requires a key exchange:

```
Alice                         Server                        Bob
  │                             │                             │
  │  mls.keypackage.fetch       │                             │
  │  { dids: [bobDID] }  ───►  │                             │
  │                             │                             │
  │  ◄── keypackage.response    │                             │
  │  { bobPublicKey }           │                             │
  │                             │                             │
  │  [derive shared secret      │                             │
  │   from alice.priv + bob.pub]│                             │
  │                             │                             │
  │  dm.keyexchange {           │                             │
  │    recipientDID: bobDID,    │                             │
  │    senderPublicKey: [...]   │  dm.keyexchange {           │
  │  } ─────────────────────►   │    senderPublicKey: [...]   │
  │                             │  } ─────────────────────►   │
  │                             │                             │
  │                             │     [derive shared secret   │
  │                             │      from bob.priv +        │
  │                             │      alice.pub]             │
```

After key exchange, both sides hold matching XChaCha20-Poly1305 channels derived from the same X25519 shared secret. The server never sees the shared key.

### What the Server Can See

| Data                  | Visible to Server? |
| --------------------- | ------------------ |
| Who sent a DM to whom | ✅ Yes (metadata)  |
| When it was sent      | ✅ Yes (timestamp) |
| Message size          | ✅ Yes             |
| Message content       | ❌ No (encrypted)  |
| Shared encryption key | ❌ No              |

### Current Limitations

| Gap | Description | Impact |
| --- | --- | --- |
| **Routing requires shared server** | If Alice and Bob aren't connected to any common server, the DM doesn't deliver | Must share at least one community |
| **No offline delivery** | If Bob is offline, the DM is lost — no store-and-forward | Messages can be missed |
| **Key packages on server** | Bob's X25519 public key is fetched via the community server | MITM risk without out-of-band verification |
| **No relay mesh** | DMs broadcast to all _locally_ connected servers, but servers don't relay to each other | Limited reach in multi-server topologies |
| **No perfect forward secrecy** | Single long-lived X25519 keypair per DM relationship | Compromise of key exposes full history |
| **No multi-device** | DM encryption channel tied to one device's keypair | Second device can't decrypt existing DMs |

---

## Sovereignty Roadmap

### Phase 1: Resilience (Near-Term)

**Goal:** DMs work reliably in the current architecture.

#### 1.1 Store-and-Forward Mailboxes

- Server holds encrypted DMs for offline recipients (configurable TTL, e.g. 7 days)
- On reconnect, client fetches pending DMs via `dm.sync` request
- Server stores only ciphertext — no additional metadata beyond sender DID + timestamp
- Recipient can request deletion after retrieval

#### 1.2 DM History Persistence

- Client-side encrypted DM history in local SQLite (Electron) or IndexedDB (web)
- Key derived from user's identity keypair — history unreadable without private key
- Optional: encrypted backup export (`.hbundle` format, same as community export)

#### 1.3 Delivery Receipts

- `dm.delivered` / `dm.read` signals (opt-in, privacy-respectable)
- Sender knows if message was stored, delivered, or read
- No server-side tracking — receipts are just protocol messages between peers

### Phase 2: Verification (Medium-Term)

**Goal:** Users can verify they're talking to who they think they're talking to.

#### 2.1 Safety Numbers / QR Verification

- Derive a "safety number" from both parties' public keys (à la Signal)
- Display in UI for manual comparison (in-person QR scan or number comparison)
- Mark conversations as "verified" — warn if keys change unexpectedly

#### 2.2 Key Transparency Log

- Optional public append-only log of DID → public key bindings
- Clients can audit that the server didn't substitute keys during exchange
- Could use a Merkle tree or similar verifiable structure
- Doesn't require blockchain — can be gossip-verified across community servers

#### 2.3 Signed Key Packages

- Key packages include a signature from the user's DID signing key
- Client verifies signature before using the public key for DM encryption
- Prevents server-side key substitution without detection

### Phase 3: Decoupled Routing (Longer-Term)

**Goal:** DMs don't depend on shared community membership.

#### 3.1 DID-Based Discovery

- Resolve a DID to find which server(s) the user is reachable on
- Could use DID document `serviceEndpoint` field
- Or a lightweight discovery protocol: `did.resolve` → server URLs
- User controls their own DID document — sovereignty over reachability

#### 3.2 Federation Relay

- Server-to-server DM forwarding via the federation protocol
- Alice's server can relay to Bob's server even if Alice isn't connected there
- Encrypted end-to-end — relay servers see only ciphertext + destination DID
- Rate limiting and spam prevention at the relay layer

#### 3.3 Optional Direct P2P

- If both users are online and reachable (e.g. via WebRTC), establish a direct connection
- Bypass servers entirely for real-time DMs
- Fall back to server relay when direct connection isn't possible
- Server provides signaling (ICE/STUN) but never touches message content

### Phase 4: Forward Secrecy & Multi-Device (Future)

**Goal:** Cryptographic best practices for long-term security.

#### 4.1 Double Ratchet / X3DH

- Upgrade from static X25519 to a Signal-style ratcheting protocol
- Each message uses a unique encryption key derived from the ratchet
- Compromise of one message key doesn't expose past or future messages
- Prekey bundles replace the current key package fetch

#### 4.2 Multi-Device DM Sync

- Each device has its own keypair; DMs encrypted to all of a user's devices
- Sender fetches all recipient device public keys and encrypts per-device (or uses a group key)
- New device added → existing device re-encrypts history (or new device starts fresh)
- Device revocation propagated via DID document updates

#### 4.3 Disappearing Messages

- Per-conversation opt-in timer (e.g. 24h, 7d)
- Client-enforced deletion — server can't enforce, but can refuse to store beyond TTL
- Metadata minimisation: server purges relay records after delivery confirmation

---

## Design Principles

1. **DID is the address.** DMs are always addressed to a DID, never a server-local ID. This means the addressing layer survives server migration, federation, and topology changes.

2. **Server is a blind relay.** The server's role is routing and temporary storage. It should never need to read message content to function. If a feature requires the server to decrypt, it's designed wrong.

3. **Encryption is non-optional.** Once key exchange is established, all DMs are encrypted. Plaintext fallback exists only for the bootstrapping moment before key exchange completes.

4. **User controls reachability.** The user's DID document (or equivalent) determines where they can be reached. Moving servers means updating your DID document, not migrating an account.

5. **Progressive enhancement.** Each phase makes DMs more sovereign without breaking existing functionality. A client that only implements Phase 1 can still communicate with one that implements Phase 4.
