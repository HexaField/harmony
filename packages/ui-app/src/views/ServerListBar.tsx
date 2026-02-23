import { For, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { t } from '../i18n/strings.js'

export const ServerListBar: Component = () => {
  const store = useAppStore()

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

      {/* Community icons */}
      <For each={store.communities()}>
        {(community) => {
          const isActive = () => store.activeCommunityId() === community.id
          const initials = community.name.substring(0, 2).toUpperCase()
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
            </div>
          )
        }}
      </For>

      {/* Add server button */}
      <button
        class="w-12 h-12 rounded-2xl bg-[var(--bg-surface)] hover:bg-[var(--success)] hover:rounded-xl transition-all flex items-center justify-center text-2xl text-[var(--success)] hover:text-white"
        title={t('COMMUNITY_CREATE')}
      >
        +
      </button>
    </div>
  )
}
