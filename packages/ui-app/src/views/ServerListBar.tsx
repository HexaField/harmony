import { For, Show, createSignal, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { t } from '../i18n/strings.js'

export const ServerListBar: Component = () => {
  const store = useAppStore()
  const [contextMenu, setContextMenu] = createSignal<{
    communityId: string
    communityName: string
    x: number
    y: number
  } | null>(null)
  const [confirmLeave, setConfirmLeave] = createSignal<string | null>(null)

  function statusColor(connected: boolean): string {
    if (connected) return 'bg-[var(--success)]'
    return 'bg-[var(--text-muted)]'
  }

  function statusTitle(connected: boolean): string {
    return connected ? t('SERVER_CONNECTED') : t('SERVER_DISCONNECTED')
  }

  async function handleReconnect(url: string) {
    const client = store.client()
    if (!client) return

    try {
      const identity = store.identity()
      const keyPair = store.keyPair()
      if (!identity || !keyPair) return

      await Promise.race([
        client.connect({ serverUrl: url, identity, keyPair }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(t('CONNECTION_FAILED'))), 10000))
      ])
      store.refreshServers()
    } catch {
      store.refreshServers()
    }
  }

  return (
    <div class="w-[var(--server-bar-width)] bg-[var(--bg-primary)] flex flex-col items-center py-3 gap-2 shrink-0 overflow-y-auto">
      {/* Home / DMs button */}
      <button
        onClick={() => {
          store.setShowDMView(!store.showDMView())
          if (!store.showDMView()) store.setActiveDMRecipient(null)
        }}
        class="w-12 h-12 rounded-2xl flex items-center justify-center text-xl transition-all"
        classList={{
          'bg-[var(--accent)] rounded-xl text-white': store.showDMView(),
          'bg-[var(--bg-tertiary)] hover:bg-[var(--accent)] hover:rounded-xl': !store.showDMView()
        }}
        title={t('DM_SECTION_TITLE')}
      >
        💬
      </button>

      <div class="w-8 h-0.5 bg-[var(--border)] rounded-full my-1" />

      {/* Server status indicators */}
      <For each={store.servers()}>
        {(server) => {
          const serverCommunities = () => store.communities().filter((c) => c.serverUrl === server.url)
          const isDisconnected = () => !server.connected

          return (
            <Show when={serverCommunities().length > 0 || isDisconnected()}>
              <div class="relative group mb-1">
                <div
                  class={`w-8 h-1 rounded-full mx-auto ${statusColor(server.connected)}`}
                  title={statusTitle(server.connected)}
                />
                <Show when={isDisconnected()}>
                  <button
                    onClick={() => handleReconnect(server.url)}
                    class="absolute -right-1 -top-1 w-4 h-4 rounded-full bg-[var(--accent)] text-white text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title={t('CONNECTION_RECONNECT')}
                  >
                    ↻
                  </button>
                </Show>
              </div>
            </Show>
          )
        }}
      </For>

      {/* Community icons */}
      <For each={store.communities()}>
        {(community) => {
          const isActive = () => store.activeCommunityId() === community.id
          const initials = community.name.substring(0, 2).toUpperCase()
          const serverConnected = () => {
            if (!community.serverUrl) return false
            const client = store.client()
            return client ? client.isConnectedTo(community.serverUrl) : false
          }

          return (
            <div class="relative group">
              {/* Active indicator pill */}
              <div
                class="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 w-1 rounded-r-full bg-white transition-all"
                classList={{
                  'h-10': isActive(),
                  'h-0 group-hover:h-5': !isActive()
                }}
              />
              <button
                onClick={() => {
                  store.setActiveCommunityId(community.id)
                  store.setShowDMView(false)
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setContextMenu({
                    communityId: community.id,
                    communityName: community.name,
                    x: e.clientX,
                    y: e.clientY
                  })
                }}
                class="w-12 h-12 flex items-center justify-center text-sm font-semibold transition-all"
                classList={{
                  'rounded-xl bg-[var(--accent)] text-white': isActive(),
                  'rounded-2xl bg-[var(--bg-surface)] hover:rounded-xl hover:bg-[var(--accent)] text-[var(--text-secondary)] hover:text-white':
                    !isActive()
                }}
                title={community.name}
              >
                {community.iconUrl ? (
                  <img
                    src={community.iconUrl}
                    alt={community.name}
                    class="w-full h-full rounded-inherit object-cover"
                  />
                ) : (
                  initials
                )}
              </button>
              {/* Connection status dot */}
              <div
                class={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[var(--bg-primary)] ${statusColor(serverConnected())}`}
                title={statusTitle(serverConnected())}
              />
            </div>
          )
        }}
      </For>

      {/* Add server button */}
      <button
        onClick={() => store.setShowCreateCommunity(true)}
        class="w-12 h-12 rounded-2xl bg-[var(--bg-surface)] hover:bg-[var(--success)] hover:rounded-xl transition-all flex items-center justify-center text-2xl text-[var(--success)] hover:text-white"
        title={t('COMMUNITY_CREATE')}
      >
        +
      </button>

      <div class="flex-1" />

      {/* Import from Discord button */}
      <button
        onClick={() => store.setShowMigrationWizard(true)}
        class="w-12 h-12 rounded-2xl bg-[var(--bg-surface)] hover:bg-[var(--bg-tertiary)] hover:rounded-xl transition-all flex items-center justify-center text-xl text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        title="Import from Discord"
      >
        📥
      </button>

      {/* Settings button */}
      <button
        onClick={() => store.setShowSettings(true)}
        class="w-12 h-12 rounded-2xl bg-[var(--bg-surface)] hover:bg-[var(--bg-tertiary)] hover:rounded-xl transition-all flex items-center justify-center text-xl text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        title={t('SETTINGS_USER')}
      >
        ⚙️
      </button>

      {/* Community context menu */}
      <Show when={contextMenu()}>
        {(menu) => (
          <div class="fixed inset-0 z-50" onClick={() => setContextMenu(null)}>
            <div
              class="absolute bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg shadow-xl py-1.5 min-w-[160px]"
              style={{ left: `${menu().x}px`, top: `${menu().y}px` }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                class="w-full px-3 py-1.5 text-left text-sm text-[var(--error)] hover:bg-[var(--error)] hover:text-white transition-colors flex items-center gap-2"
                onClick={() => {
                  setConfirmLeave(menu().communityId)
                  setContextMenu(null)
                }}
              >
                <span>🚪</span> Leave Community
              </button>
            </div>
          </div>
        )}
      </Show>

      {/* Leave confirmation dialog */}
      <Show when={confirmLeave()}>
        {(communityId) => {
          const community = store.communities().find((c) => c.id === communityId())
          return (
            <div
              class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
              onClick={() => setConfirmLeave(null)}
            >
              <div
                class="bg-[var(--bg-surface)] rounded-lg p-6 shadow-xl max-w-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 class="text-lg font-semibold mb-2">Leave Community</h3>
                <p class="text-sm text-[var(--text-muted)] mb-4">
                  Are you sure you want to leave <strong>{community?.name}</strong>?
                </p>
                <div class="flex gap-2 justify-end">
                  <button
                    class="px-4 py-2 text-sm rounded bg-[var(--bg-input)] hover:bg-[var(--border)] transition-colors"
                    onClick={() => setConfirmLeave(null)}
                  >
                    Cancel
                  </button>
                  <button
                    class="px-4 py-2 text-sm rounded bg-[var(--error)] text-white hover:opacity-90 transition-opacity"
                    onClick={async () => {
                      const client = store.client()
                      if (client) {
                        await client.leaveCommunity(communityId())
                        store.setCommunities(store.communities().filter((c) => c.id !== communityId()))
                        if (store.activeCommunityId() === communityId()) {
                          store.setActiveCommunityId(store.communities()[0]?.id ?? null)
                        }
                      }
                      setConfirmLeave(null)
                    }}
                  >
                    Leave
                  </button>
                </div>
              </div>
            </div>
          )
        }}
      </Show>
    </div>
  )
}
