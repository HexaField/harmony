import { For, Show, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { t } from '../i18n/strings.js'

export const ChannelSidebarView: Component = () => {
  const store = useAppStore()

  const activeCommunity = () => store.communities().find((c) => c.id === store.activeCommunityId())

  const textChannels = () =>
    store.channels().filter((c) => c.type === 'text' && c.communityId === store.activeCommunityId())

  const voiceChannels = () =>
    store.channels().filter((c) => c.type === 'voice' && c.communityId === store.activeCommunityId())

  return (
    <div class="w-[var(--sidebar-width)] bg-[var(--bg-secondary)] flex flex-col shrink-0 border-r border-[var(--border)]">
      {/* Community header */}
      <div class="h-12 flex items-center px-4 border-b border-[var(--border)] font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-input)] cursor-pointer transition-colors">
        <span class="truncate">{activeCommunity()?.name ?? 'Harmony'}</span>
        <span class="ml-auto text-[var(--text-muted)]">▾</span>
      </div>

      {/* Channel list */}
      <div class="flex-1 overflow-y-auto py-2">
        {/* Text channels */}
        <Show when={textChannels().length > 0}>
          <div class="px-3 py-1">
            <h3 class="text-xs font-semibold uppercase text-[var(--text-muted)] tracking-wider mb-1">Text Channels</h3>
          </div>
          <For each={textChannels()}>
            {(channel) => {
              const isActive = () => store.activeChannelId() === channel.id
              return (
                <button
                  onClick={() => store.setActiveChannelId(channel.id)}
                  class="w-full flex items-center px-3 py-1.5 mx-2 rounded text-sm transition-colors"
                  classList={{
                    'bg-[var(--bg-input)] text-[var(--text-primary)]': isActive(),
                    'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]/50':
                      !isActive()
                  }}
                  style={{ width: 'calc(100% - 16px)' }}
                >
                  <span class="mr-1.5 text-[var(--text-muted)]">#</span>
                  <span class="truncate">{channel.name}</span>
                </button>
              )
            }}
          </For>
        </Show>

        {/* Voice channels */}
        <Show when={voiceChannels().length > 0}>
          <div class="px-3 py-1 mt-3">
            <h3 class="text-xs font-semibold uppercase text-[var(--text-muted)] tracking-wider mb-1">Voice Channels</h3>
          </div>
          <For each={voiceChannels()}>
            {(channel) => (
              <button
                class="w-full flex items-center px-3 py-1.5 mx-2 rounded text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]/50 transition-colors"
                style={{ width: 'calc(100% - 16px)' }}
              >
                <span class="mr-1.5">🔊</span>
                <span class="truncate">{channel.name}</span>
              </button>
            )}
          </For>
        </Show>
      </div>

      {/* User panel */}
      <div class="h-14 flex items-center px-3 bg-[var(--bg-primary)]/50 border-t border-[var(--border)]">
        <div class="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center text-xs font-bold text-white">
          {store
            .did()
            .substring(store.did().length - 2)
            .toUpperCase()}
        </div>
        <div class="ml-2 flex-1 min-w-0">
          <div class="text-sm font-semibold truncate">You</div>
          <div class="text-xs text-[var(--text-muted)] truncate">{store.did().substring(0, 20)}...</div>
        </div>
        <button class="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]" title={t('SETTINGS_USER')}>
          ⚙️
        </button>
      </div>
    </div>
  )
}
