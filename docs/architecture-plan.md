# Architecture Implementation Plan

## Current State

### What Works

- **HarmonyClient**: Single WebSocket connection, VP auth, CRDT sync, auto-reconnect, message send/receive
- **Server Runtime**: WebSocket server, HTTP health/migration endpoints, SQLite quad store
- **Portal**: Identity creation, Discord OAuth linking, friend graph
- **Cloud Package**: HostingService (in-memory), identity, OAuth, storage — but no actual server provisioning
- **Electron App Shell**: Starts embedded ServerRuntime, IPC bridge, deep links, tray — but preload doesn't expose `__HARMONY_DESKTOP__`
- **Federation Package**: Peer management, WebSocket relay, message dedup — but not wired into server-runtime
- **UI App**: Onboarding, migration wizard, community/channel views — but connection management scattered across views

### What's Broken / Missing

#### 1. Client Doesn't Own Connections

- `HarmonyClient` connects to ONE server. UI calls `connect()` from 5 different places.
- No persistence — on reload, client doesn't know what servers it was connected to.
- **Fix**: Client manages a `Map<serverUrl, Connection>`, persists via adapter, auto-reconnects on construction.

#### 2. Desktop Bridge Not Connected

- Preload exposes `window.harmony` but UI checks `window.__HARMONY_DESKTOP__`
- No IPC for: start/stop embedded server, get server URL, server health
- Desktop doesn't expose server URL to renderer for client connection
- **Fix**: Align preload with `__HARMONY_DESKTOP__` interface, add server lifecycle IPC.

#### 3. Cloud Has No Real Server Provisioning

- `HostingService.createInstance()` creates metadata but no actual server process
- No Docker/process spawning, no WebSocket URL returned
- Cloud app has no `server.ts` / startup script
- **Fix**: Cloud provisions server-runtime instances (Docker or subprocess), returns WebSocket URL, manages lifecycle.

#### 4. Federation Not Wired

- `FederationManager` exists but server-runtime doesn't use it
- No federation config in RuntimeConfig
- No peer discovery or handshake
- **Fix**: Wire FederationManager into server-runtime, add peer management endpoints.

#### 5. No Community Migration Between Servers

- Can export from Discord → Harmony, but not Harmony → Harmony
- No "move community to different server" flow
- **Fix**: Server-to-server migration endpoint using existing MigrationService export/import.

## Implementation Phases

### Phase 1: Client Refactor (foundation for everything else)

1. **Multi-server HarmonyClient**
   - `servers: Map<string, ServerConnection>` with per-server state
   - `addServer(url)` / `removeServer(url)`
   - `connectAll()` on construction with persistence adapter
   - Community → server mapping maintained internally
   - Events scoped per-server

2. **Persistence Adapter**
   - Interface: `{ load(): ServerState[], save(state: ServerState[]): void }`
   - LocalStorageAdapter for browser
   - ElectronStorageAdapter for desktop (uses safeStorage for secrets)
   - Stores: server URLs, community memberships, identity reference

3. **UI Store Simplification**
   - Remove connection logic from App.tsx, EmptyStateView, CreateCommunityModal, MigrationWizard, ServerListBar
   - Store delegates to client for connection state
   - `store.connectionState()` reads from client's aggregate state

### Phase 2: Desktop App (local server mode)

1. **Fix Preload Bridge**
   - Expose `__HARMONY_DESKTOP__` with: `startServer()`, `stopServer()`, `getServerUrl()`, `isServerRunning()`
   - IPC handlers in main process call `HarmonyApp` methods
2. **Server Lifecycle**
   - Desktop auto-starts embedded server on launch
   - Returns `ws://localhost:{port}` to renderer
   - Client auto-connects to embedded server

3. **Test Locally**
   - `pnpm --filter @harmony/app electron:dev` with ui-app dev server
   - Create community on embedded server
   - Send messages between two windows

### Phase 3: Cloud Mode (managed servers)

1. **Cloud Server Provisioning**
   - `HostingService.createInstance()` actually spawns a server-runtime process
   - Returns `{ serverUrl: 'wss://...' }`
   - Health monitoring, auto-restart, quota enforcement
   - Cloud app startup script (`packages/cloud/bin/harmony-cloud.js`)

2. **Cloud API Endpoints**
   - POST `/api/hosting/instances` → provision server, return WebSocket URL
   - GET `/api/hosting/instances` → list user's servers
   - DELETE `/api/hosting/instances/:id` → tear down
   - GET `/api/hosting/instances/:id/status` → health, member count, storage

3. **UI Cloud Flow**
   - User picks "Host on Harmony Cloud" → calls cloud API → gets URL → client connects
   - Server management panel in settings (status, member count, storage, delete)

4. **Test Cloud Mode**
   - Run cloud service locally
   - Provision a server via UI
   - Create community, send messages
   - Manage server from settings

### Phase 4: Federation

1. **Wire into Server Runtime**
   - RuntimeConfig gets `federation: { enabled, peers, discoveryUrl }`
   - Server creates FederationManager on start
   - Peer handshake via ZCAP capability exchange

2. **Cross-Server Features**
   - User on Server A can see/join communities on Server B (if federated)
   - Messages relay through federation
   - Member presence syncs across federated servers

3. **Peer Management**
   - POST `/api/federation/peers` → add peer
   - GET `/api/federation/peers` → list
   - DELETE `/api/federation/peers/:did` → remove

### Phase 5: Server Migration

1. **Harmony → Harmony Export**
   - POST `/api/migration/export/harmony` → exports all communities as encrypted bundle
   - Uses existing MigrationService but bypasses Discord-specific parts

2. **Import on Target Server**
   - POST `/api/migration/import` already works
   - Add: re-key encryption for new server's admin key

3. **Live Migration** (stretch)
   - Federation-based: old server federates with new, members gradually move
   - DNS/URL redirect for seamless transition

4. **UI Flow**
   - Settings → Server Management → "Move to another server"
   - Pick destination (cloud, self-hosted URL, local)
   - Progress bar, automatic re-connection

## Test Requirements

### Per-Phase Tests

- **Phase 1**: Multi-server client unit tests, persistence adapter tests, connection state aggregation
- **Phase 2**: Electron IPC integration tests, embedded server lifecycle, preload bridge
- **Phase 3**: Cloud provisioning integration tests, server lifecycle, quota enforcement
- **Phase 4**: Federation peer tests, cross-server message relay, ZCAP verification
- **Phase 5**: Harmony export/import round-trip, re-keying, live migration

### E2E Journeys

- Desktop: launch → create identity → create community → send message → close → reopen → auto-reconnect
- Cloud: browser → create identity → provision cloud server → create community → invite friend → both chat
- Migration: Discord export → Harmony import → verify channels/messages → move to different server
- Federation: Server A ↔ Server B → user on A sees community on B → joins → chats

## What Needs to Happen First

1. **Phase 1 (client refactor)** — everything else depends on this
2. **Phase 2 (desktop)** — Josh wants to test locally with Electron
3. **Phase 3 (cloud)** — Josh wants to test cloud mode
4. Phases 4-5 can follow in parallel
