# Harmony Voice + Cloud Architecture

_Integrating prior research from `cloud-encrypted-sfus.md` and Phase 3 plan_

---

## Design Principles

1. **E2EE is mandatory** — SFU is a "Blind Courier." Frame-level encryption via `RTCRtpScriptTransform` (Insertable Streams), AES-GCM payloads, RTP headers intact for routing.
2. **MLS for group key agreement** — scales O(log N), already implemented in Harmony's `@harmony/e2ee` package. Bridge MLS group key → voice encryption key.
3. **SFU from participant 1** — no P2P mesh tier for MVP. All voice goes through the SFU.
4. **Self-hosted embeds the SFU** — mediasoup in-process. Cloud delegates to CF Realtime.

---

## Architecture: Two Tiers

### Tier 1: Self-Hosted SFU

- **mediasoup** embedded in the Harmony server process (Node.js native module)
- All voice/video goes through the SFU from participant 1 (no P2P mesh)
- Each peer uploads once → mediasoup fans out to all subscribers
- MLS E2EE maintained — mediasoup forwards encrypted RTP, never decrypts
- Server handles: room lifecycle, ZCAP authorization, participant tracking
- **Why mediasoup:** Node.js native, embeds in-process, MIT licensed, battle-tested (Jitsi, Edumeet), prebuilt binaries for arm64/x64

### Tier 2: Cloud SFU

- **Cloudflare Realtime SFU** for cloud-hosted communities
- Durable Object acts as "Room Coordinator" — tracks participants, issues CF session tokens
- WHIP (push) / WHEP (pull) for media transport
- MLS E2EE — same Insertable Streams pipeline, CF never sees plaintext
- **Cost: $0.05/GB egress, 1TB free/month**
- Anycast routing — users hit closest CF PoP automatically

> **Future:** P2P mesh for 1–6 participants and seamless mesh→SFU handover. Deferred post-launch.

---

## Implementation Map

### Adapter Interface (unchanged from current code)

```typescript
interface LiveKitAdapter {
  createRoom(roomId: string, opts: RoomOptions): Promise<void>
  deleteRoom(roomId: string): Promise<void>
  generateToken(roomId: string, participantId: string, metadata: Record<string, string>): Promise<string>
  listParticipants(roomId: string): Promise<string[]>
  removeParticipant(roomId: string, participantId: string): Promise<void>
  muteParticipant(roomId: string, participantId: string, trackKind: 'audio' | 'video'): Promise<void>
}
```

Rename to `SFUAdapter` (breaking rename is fine — internal only). Three implementations:

| Adapter                  | Runtime               | Use Case               |
| ------------------------ | --------------------- | ---------------------- |
| `InMemoryAdapter`        | Any                   | Tests (existing)       |
| `MediasoupAdapter`       | Self-hosted (Node.js) | Production self-hosted |
| `CloudflareCallsAdapter` | Cloud Worker (DO)     | Production cloud       |

Plus a `PeerMeshAdapter` that handles signaling-only for the P2P tier:

| Adapter           | Runtime    | Use Case                           |
| ----------------- | ---------- | ---------------------------------- |
| `PeerMeshAdapter` | Any server | 1–6 participants (signaling relay) |

### New Packages / Files

```
packages/voice/src/
├── adapters/
│   ├── in-memory.ts        (existing, move here)
│   ├── mediasoup.ts         ← NEW: mediasoup SFU adapter
│   └── types.ts             ← SFUAdapter interface (renamed from LiveKitAdapter)
├── e2ee-bridge.ts           ← NEW: MLS group key → AES-GCM frame encryption
├── insertable-streams.ts    ← NEW: RTCRtpScriptTransform encryption/decryption
├── room-manager.ts          (existing, update for SFU-always)
├── voice-client.ts          (existing, update for SFU connection)
└── index.ts

packages/cloud-worker/src/
├── voice-room-do.ts         ← NEW: Durable Object for voice room coordination
├── cf-calls-adapter.ts      ← NEW: Cloudflare Realtime SFU adapter
└── community-do.ts          (existing, add voice.join/leave handlers)
```

### mediasoup Adapter (`packages/voice/src/adapters/mediasoup.ts`)

```typescript
import * as mediasoup from 'mediasoup'

class MediasoupAdapter implements SFUAdapter {
  private workers: mediasoup.Worker[] = []
  private routers: Map<string, mediasoup.Router> = new Map()
  private transports: Map<string, Map<string, mediasoup.WebRtcTransport>> = new Map()

  async init(numWorkers?: number): Promise<void>
  // Creates mediasoup Workers (one per CPU core by default)

  async createRoom(roomId: string, opts: RoomOptions): Promise<void>
  // Creates a Router on the least-loaded Worker
  // Router has mediaCodecs for Opus (audio) + VP8/H264 (video)

  async generateToken(roomId: string, participantId: string, metadata: Record<string, string>): Promise<string>
  // Creates WebRtcTransport for the participant
  // Returns JWT with: routerId, transportId, dtlsParameters, iceCandidates, iceParameters

  async deleteRoom(roomId: string): Promise<void>
  // Closes all transports, closes Router

  async listParticipants(roomId: string): Promise<string[]>
  // Returns all participant IDs with active transports

  async removeParticipant(roomId: string, participantId: string): Promise<void>
  // Closes participant's transport(s)

  async muteParticipant(roomId: string, participantId: string, trackKind: 'audio' | 'video'): Promise<void>
  // Pauses the participant's producer for the given track kind
}
```

### Cloudflare Calls Adapter (`packages/cloud-worker/src/cf-calls-adapter.ts`)

```typescript
class CloudflareCallsAdapter implements SFUAdapter {
  constructor(private appId: string, private appSecret: string, private accountId: string)

  async createRoom(roomId: string, opts: RoomOptions): Promise<void>
  // POST /accounts/{id}/realtime/sessions → create CF session
  // Store session ID in DO storage keyed by roomId

  async generateToken(roomId: string, participantId: string, metadata: Record<string, string>): Promise<string>
  // Create new CF session for participant
  // Return session ID + WHIP/WHEP endpoints

  async deleteRoom(roomId: string): Promise<void>
  // Close all CF sessions for this room

  // ... etc
}
```

### E2EE Bridge (`packages/voice/src/e2ee-bridge.ts`)

```typescript
class VoiceE2EEBridge {
  // Takes MLS group epoch key → derives AES-256-GCM frame encryption key
  // Uses HKDF to derive: encryptionKey + salt from MLS exportSecret

  deriveFrameKey(mlsEpochSecret: Uint8Array): CryptoKey

  // Creates the RTCRtpScriptTransform worker that:
  // 1. Receives encoded video/audio frames
  // 2. Encrypts payload with AES-GCM (preserves RTP headers)
  // 3. Passes encrypted frame to transport
  createEncryptTransform(frameKey: CryptoKey): RTCRtpScriptTransform
  createDecryptTransform(frameKey: CryptoKey): RTCRtpScriptTransform

  // On MLS epoch change (member join/leave), re-derive key and update transforms
  onEpochChange(newEpochSecret: Uint8Array): void
}
```

### Voice Room DO (`packages/cloud-worker/src/voice-room-do.ts`)

```typescript
export class VoiceRoomDO {
  // Manages voice room state in a Durable Object

  participants: Map<string, ParticipantState>
  cfSession?: string // Cloudflare Realtime session ID

  async handleJoin(participantDID: string, ws: WebSocket): Promise<void>
  // 1. Verify ZCAP authorization
  // 2. Add participant
  // 3. Create/join CF Realtime session
  // 4. Return WHIP/WHEP endpoints to client

  async handleLeave(participantDID: string): Promise<void>
  // 1. Remove participant
  // 2. If count = 0: destroy room + CF session
}
```

---

## Testing Strategy

### What we CAN test locally

| Test                               | Tool                       | Coverage                                    |
| ---------------------------------- | -------------------------- | ------------------------------------------- |
| mediasoup room lifecycle           | vitest + mediasoup         | Create/destroy workers, routers, transports |
| mediasoup WebRTC negotiation       | vitest + `wrtc` npm        | Full ICE/DTLS handshake, produce/consume    |
| E2EE bridge key derivation         | vitest                     | MLS epoch → AES-GCM key, HKDF               |
| Insertable Streams encrypt/decrypt | vitest + mock frames       | Frame encryption roundtrip                  |
| CF Calls adapter (mocked)          | vitest                     | HTTP request/response mapping               |
| Cloud Worker voice handlers        | miniflare (`wrangler dev`) | DO voice.join/leave, state broadcast        |
| RoomManager integration            | vitest + InMemoryAdapter   | Already exists, extend for SFU              |

### What we CANNOT test locally

- Real CF Realtime SFU (needs account + API keys)
- Real media quality / codec negotiation across network
- TURN relay through CF
- Browser `RTCRtpScriptTransform` (needs real browser — Insertable Streams not in `wrtc`)

### Test Ports

- mediasoup integration: **19923**
- Cloud Worker (miniflare): **19925**
- P2P signaling: **19927**

---

## Cost Analysis (Cloud Tier)

CF Realtime: **$0.05/GB egress**, 1TB free

| Scenario                     | Egress/hr | Cost/hr | Free tier hours/mo |
| ---------------------------- | --------- | ------- | ------------------ |
| 5-person voice (Opus 32kbps) | 288 MB    | $0.014  | ~3,500             |
| 5-person video (VP8 720p)    | 13.5 GB   | $0.675  | ~74                |
| 25-person voice              | 3.6 GB    | $0.18   | ~278               |
| 25-person video (simulcast)  | ~50 GB    | $2.50   | ~20                |

**Verdict:** Voice is essentially free. Video scales linearly but is still cheap vs. LiveKit Cloud ($0.016/min/peer = $12/hr for 25 720p peers).

---

## Implementation Order

1. **SFUAdapter interface + InMemoryAdapter rename** — clean foundation
2. **E2EE bridge** — MLS key derivation + frame encryption (testable without SFU)
3. **MediasoupAdapter** — self-hosted SFU, room lifecycle
4. **VoiceClient update** — WebRTC connection to SFU, Insertable Streams E2EE
5. **Voice handlers in CommunityDO** — voice.join/leave/mute in cloud worker
6. **VoiceRoomDO** — dedicated DO for voice room coordination
7. **CloudflareCallsAdapter** — CF Realtime integration
8. **Integration tests** — mediasoup + wrtc, miniflare, E2EE roundtrip

---

## Production Checklist (from research)

- [ ] WASM encryption: Rust-WASM for AES-GCM frame encryption (performance)
- [ ] TURN/STUN: CF global TURN for restrictive NATs
- [ ] DO location hints: `locationHint` set to majority-participant region
- [ ] Analytics: Workers Analytics Engine for "Time to First Frame" during cloud upgrade
- [ ] Simulcast: VP8 simulcast layers for video (high/medium/low) — SFU selects per subscriber
- [ ] Graceful degradation: if CF SFU unavailable, fall back to mesh (degraded at scale)
