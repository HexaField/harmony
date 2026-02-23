import { For, Show, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { HarmonyClient } from '@harmony/client'
import { t } from '../i18n/strings.js'
import { createAuthVP } from '../auth.js'

export const ServerListBar: Component = () => {
  const store = useAppStore()

  function statusColor(status: string): string {
    switch (status) {
      case 'connected':
        return 'bg-[var(--success)]'
      case 'connecting':
        return 'bg-[var(--warning)] animate-pulse'
      case 'error':
        return 'bg-[var(--error)]'
      default:
        return 'bg-[var(--text-muted)]'
    }
  }

  function statusTitle(status: string, error?: string): string {
    switch (status) {
      case 'connected':
        return t('SERVER_CONNECTED')
      case 'connecting':
        return t('SERVER_CONNECTING')
      case 'error':
        return error ?? t('SERVER_ERROR')
      default:
        return t('SERVER_DISCONNECTED')
    }
  }

  async function handleReconnect(url: string) {
    const identity = store.identity()
    const keyPair = store.keyPair()
    if (!identity || !keyPair) return

    const server = store.servers().find((s) => s.url === url)
    if (!server) return

    store.updateServer(url, { status: 'connecting', error: undefined })

    try {
      const vp = await createAuthVP(identity.did, keyPair)
      const client = new HarmonyClient({
        wsFactory: (wsUrl: string) => new WebSocket(wsUrl) as any
      })

      await Promise.race([
        client.connect({ serverUrl: url, identity, keyPair, vp }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(t('CONNECTION_FAILED'))), 10000))
      ])

      store.updateServer(url, { status: 'connected', client, error: undefined })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      store.updateServer(url, { status: 'error', error: msg })
    }
  }

  // Group communities by server
  function serverForCommunity(communityId: string): string | undefined {
    const community = store.communities().find((c) => c.id === communityId)
    return community?.serverUrl
  }

  return (
    <div class="w-[var(--server-bar-width)] bg-[var(--bg-primary)] flex flex-col items-center py-3 gap-2 shrink-0 overflow-y-auto">
      {/* Home / DMs button */}
      <button
        class="w-12 h-12 rounded-2xl bg-[var(--bg-tertiary)] hover:bg-[var(--accent)] hover:rounded-xl transition-all flex items-center justify-center text-xl"
        title="Home"
      >
        🎵
      </button>

      <div class="w-8 h-0.5 bg-[var(--border)] rounded-full my-1" />

      {/* Server status indicators */}
      <For each={store.servers()}>
        {(server) => {
          const serverCommunities = () => store.communities().filter((c) => c.serverUrl === server.url)
          const isDisconnected = () => server.status === 'disconnected' || server.status === 'error'

          return (
            <Show when={serverCommunities().length > 0 || isDisconnected()}>
              <div class="relative group mb-1">
                <div
                  class={`w-8 h-1 rounded-full mx-auto ${statusColor(server.status)}`}
                  title={statusTitle(server.status, server.error)}
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
          const serverStatus = () => {
            if (!community.serverUrl) return 'disconnected'
            const server = store.servers().find((s) => s.url === community.serverUrl)
            return server?.status ?? 'disconnected'
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
                onClick={() => store.setActiveCommunityId(community.id)}
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
                class={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[var(--bg-primary)] ${statusColor(serverStatus())}`}
                title={statusTitle(serverStatus())}
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
