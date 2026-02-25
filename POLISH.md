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

## Issues — All Fixed ✅

### P0 — Blocking / Broken

1. ✅ **EmptyStateView flashes on refresh** — Added `loading` signal to store. MainLayout now shows a spinner while loading, then EmptyStateView only after communities data arrives (or 3s timeout). Tests in `ui-app/test/polish-fixes.spec.ts`.

2. ✅ **Native module ABI conflict** — Added `rebuild:node` and `rebuild:electron` scripts to root `package.json` for easy switching between Node and Electron builds of better-sqlite3. Test verifies scripts exist.

3. ✅ **Sync messages not emitted as `message` events** — `handleSyncResponse` now emits both `sync` (batch) and individual `message` events for each synced message, giving consumers a unified stream. Tests in `client/test/polish-fixes.spec.ts`.

### P1 — Important Polish

4. ✅ **Migration import doesn't create a community** — Verified: `handleImport` already calls `registerCommunity()` when `harmonyServer` is set (and the runtime does set it). Enhanced `registerCommunity()` to notify all connected clients by sending them an updated `community.list.response`. Tests in `server-runtime/test/polish-fixes.spec.ts`.

5. ✅ **Display name shows pseudonym on first load** — The `resolvedName()` getter in `MessageArea.tsx` is already reactive (accesses `store.members()` signal). Combined with the new loading state (P0 #1), the flicker is eliminated — the UI doesn't render until community data arrives.

6. ✅ **No loading/connection indicator on startup** — Added spinner with "Loading…" text in MainLayout shown while `store.loading()` is true. Loading clears when first `community.list` response arrives or after 3s timeout. Tests in `ui-app/test/polish-fixes.spec.ts`.

7. ✅ **`community.list` type not in ClientEvent** — Added `community.list` and `community.member.updated` to the `ClientEvent` type union in `protocol/src/events.ts`. Removed all `as any` casts in store.tsx for event names that are now in the type. Tests in `protocol/test/polish-fixes.spec.ts`.

8. ✅ **`client.off()` doesn't exist** — Added `off(event, handler)` method to both `EventEmitter` and `HarmonyClient`. Consumers can now use either the `Unsubscribe` function from `on()` or the `off()` method. Tests in `client/test/polish-fixes.spec.ts`.

### P2 — Nice to Have

9. ✅ **Member sidebar sections** — Verified working. `MemberList` component correctly splits members into online/offline/unlinked (not yet migrated) sections based on `linked` property and status.

10. ✅ **Channel sync on navigation** — Verified working. `createEffect` in MessageArea.tsx calls `syncChannel` when `activeChannelId` changes, loading messages reactively.

11. ✅ **Onboarding flow → migration flow** — Verified the path exists: Onboarding → EmptyState → "Import from Discord" button → MigrationWizard. Now enhanced with loading state so the transition is smoother.

12. ✅ **Invite link generation** — Verified. Tray menu includes "Copy Invite" option. EmptyStateView has invite link parsing and join flow.

13. ✅ **Theme persistence** — Verified working via localStorage. `setTheme()` persists to `harmony:theme`, restored on next session. Tests in `ui-app/test/polish-fixes.spec.ts`.

14. ✅ **`persistToBackend` error handling** — Now wrapped in try/catch with `console.error` logging. Config save failures no longer silently swallowed. Tests in `ui-app/test/polish-fixes.spec.ts`.

15. ✅ **Config deep merge** — `updateConfig()` in HarmonyApp now uses `deepMerge()` instead of `Object.assign()`. Nested objects are merged recursively; arrays are replaced. Tests in `app/test/polish-fixes.spec.ts`.

## Architecture Notes

- **Source of truth:** SQLite quad store on disk (via `better-sqlite3`)
- **Identity persistence:** `~/Library/Application Support/Harmony/config.json`
- **UI preferences:** `localStorage` (theme, active selections only)
- **Server data flow:** Connect → `community.list` → populate communities+channels → `community.info` per community → populate members → `sync.request` per active channel → populate messages
- **Fixed port 4515:** Prevents stale WS URLs after restart
