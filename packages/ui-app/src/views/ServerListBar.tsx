import { For, Show, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { t } from '../i18n/strings.js'

export const ServerListBar: Component = () => {
  const store = useAppStore()

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

      {/* Settings button */}
      <button
        onClick={() => store.setShowSettings(true)}
        class="w-12 h-12 rounded-2xl bg-[var(--bg-surface)] hover:bg-[var(--bg-tertiary)] hover:rounded-xl transition-all flex items-center justify-center text-xl text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        title={t('SETTINGS_USER')}
      >
        ⚙️
      </button>
    </div>
  )
}
