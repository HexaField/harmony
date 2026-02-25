# Harmony Community Polish — Issues Found During E2E Walkthrough

## Verified Working ✓

- Identity creation (DID + 12-word mnemonic)
- Identity persistence to config.json on disk
- Identity recovery from mnemonic (same DID)
- Server starts on fixed port 4515 (HTTP health on 4516)
- Client connects via WebSocket
- Community creation with default channels
- `community.list` returns communities WITH channels (regression fixed)
- `community.info` returns member list with display names
- Message sending via `channel.send`
- Config survives app restart (HarmonyApp reconstruction)
- Display name updates persist to disk
- UI preferences (theme, active selections) persist in localStorage
- Server data (communities, channels, members) NOT in localStorage

## Issues To Fix

### P0 — Blocking / Broken

1. **EmptyStateView flashes on refresh** — `MainLayout.tsx` line 37: `Show when={store.communities().length === 0}` renders `EmptyStateView` immediately. Communities start empty and only populate after `community.list.response` arrives (~100-500ms). Need a loading state or delay rendering until either communities arrive or a timeout passes.

2. **Native module ABI conflict** — `better-sqlite3` must be rebuilt when switching between Electron (MODULE_VERSION 135) and Node (MODULE_VERSION 137) for tests. Running `pnpm electron:rebuild` breaks vitest, and rebuilding for Node breaks Electron. **Fix:** Use a separate copy or prebuild binaries for both targets, or add a `pretest` script that auto-rebuilds.

3. **Sync messages not emitted as `message` events** — `handleSyncResponse` emits `sync` not `message`. This is by design, but means new real-time messages come as `message` while historical come as `sync`. The store handles both correctly, but E2E tests and any external consumers must know this distinction.

### P1 — Important Polish

4. **Migration import doesn't create a community** — The `/api/migration/import` endpoint imports quads into the store but doesn't register a new community via `CommunityManager`. After import, `community.list` won't include the migrated community unless it was already created. The import should create or link to a community.

5. **Display name shows pseudonym on first load** — When `community.info.response` arrives, members get proper display names. But before that, message author names show pseudonyms. The `resolvedName()` getter in `MessageArea.tsx` handles this reactively, but there's a visible flicker.

6. **No loading/connection indicator on startup** — When the app launches and is connecting + fetching community data, there's no spinner or status indicator. The user sees either blank screen or the "no communities" page.

7. **`community.list` type not in ClientEvent** — `community.list` is emitted by the client but not in the `ClientEvent` type union (in `packages/protocol/src/events.ts`). Requires `as any` casts everywhere. Should add it to the type.

8. **`client.off()` doesn't exist** — The `HarmonyClient` `on()` method returns an `Unsubscribe` function, but there's no `off()` method. This is a confusing API — consumers expect `on/off` pattern. Either add `off()` or document the unsubscribe pattern.

### P2 — Nice to Have

9. **Member sidebar sections** — `MemberSidebarView.tsx` has 3 sections (Online/Offline/Not Yet Migrated). Verify these populate correctly with migrated Discord members showing in "Not Yet Migrated" section with their Discord display names.

10. **Channel sync on navigation** — When switching channels, `syncChannel` is called. Verify messages load and render correctly, including migrated Discord messages with proper author names.

11. **Onboarding flow → migration flow** — The path from fresh start to migration wizard needs to be smooth. Currently: Onboarding → EmptyState → "Import from Discord" button → MigrationWizard. Verify the wizard provisions the server correctly.

12. **Invite link generation** — After community creation, an invite link should be copyable. Verify the tray menu "Copy Invite" works.

13. **Theme persistence** — Verify dark/light theme toggle persists across refresh via localStorage.

14. **`persistToBackend` error handling** — Currently fire-and-forget async. If the IPC call fails, the identity silently isn't saved. Should surface errors.

15. **Config deep merge** — `updateConfig` uses `Object.assign` (shallow merge). Patching nested fields replaces the entire object. This works for `identity` but could cause data loss for more complex nested config in the future.

## Architecture Notes

- **Source of truth:** SQLite quad store on disk (via `better-sqlite3`)
- **Identity persistence:** `~/Library/Application Support/Harmony/config.json`
- **UI preferences:** `localStorage` (theme, active selections only)
- **Server data flow:** Connect → `community.list` → populate communities+channels → `community.info` per community → populate members → `sync.request` per active channel → populate messages
- **Fixed port 4515:** Prevents stale WS URLs after restart
