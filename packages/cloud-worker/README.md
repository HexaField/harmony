# @harmony/cloud-worker

Cloudflare Workers + Durable Objects implementation of HarmonyServer for cloud-hosted communities.

## Architecture

- **Worker** (`src/index.ts`) — Routes incoming requests and WebSocket upgrades to the correct Durable Object
- **CommunityDurableObject** (`src/community-do.ts`) — One per community. Handles WebSocket connections, message routing, presence, and community CRUD using Hibernatable WebSockets
- **DOQuadStore** (`src/do-quad-store.ts`) — RDF quad store backed by Durable Object SQLite storage
- **Auth** (`src/auth.ts`) — Verifiable Presentation authentication using WebCrypto (Ed25519)
- **Provisioning** (`src/provisioning.ts`) — Instance registry via D1 (create/list/delete communities)

## Cloudflare Bindings

| Binding     | Type           | Purpose                                |
| ----------- | -------------- | -------------------------------------- |
| `COMMUNITY` | Durable Object | One instance per community             |
| `DB`        | D1 Database    | Instance registry (ownership, billing) |
| `MEDIA`     | R2 Bucket      | Media/file storage                     |

## Endpoints

- `GET /health` — Worker health check
- `POST /api/instances` — Create a community instance
- `GET /api/instances?owner=:did` — List instances for an owner
- `DELETE /api/instances/:id` — Delete an instance
- `GET /api/instances/:id/health` — Instance health (connection count)
- `WS /ws/:communityId` — WebSocket connection to a community

## Development

```bash
pnpm dev          # Start local dev server (wrangler dev)
pnpm test         # Run tests
pnpm deploy       # Deploy to Cloudflare
```

## WebSocket Protocol

1. Client connects to `/ws/:communityId`
2. Client sends a `VerifiablePresentation` JSON as the first message (30s timeout)
3. Server verifies the VP and responds with `sync.response`
4. Client can then send/receive Harmony protocol messages

## Dependencies

Only depends on `@harmony/protocol` (message types/serialisation) and `@harmony/vocab` (RDF predicates). Does NOT use Node.js APIs — everything runs in the Workers runtime using Web APIs.
