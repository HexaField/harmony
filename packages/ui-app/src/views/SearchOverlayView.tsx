import { createSignal, For, Show, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { t } from '../i18n/strings.js'
import type { MessageData } from '../types.js'

export const SearchOverlayView: Component = () => {
  const store = useAppStore()
  const [query, setQuery] = createSignal('')

  const results = (): MessageData[] => {
    const q = query()
    if (!q.trim()) return []
    return store.searchMessages(q)
  }

  return (
    <div
      class="fixed inset-0 bg-black/60 flex items-start justify-center pt-24 z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) store.setShowSearch(false)
      }}
    >
      <div class="w-full max-w-xl mx-4 bg-[var(--bg-surface)] rounded-lg shadow-2xl overflow-hidden">
        <div class="flex items-center px-4 py-3 border-b border-[var(--border)]">
          <span class="text-[var(--text-muted)] mr-3">🔍</span>
          <input
            autofocus
            type="text"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') store.setShowSearch(false)
            }}
            class="flex-1 bg-transparent text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none text-sm"
            placeholder={t('SEARCH_PLACEHOLDER')}
          />
          <button
            onClick={() => store.setShowSearch(false)}
            class="text-[var(--text-muted)] hover:text-[var(--text-primary)] ml-2 text-sm"
          >
            ESC
          </button>
        </div>
        <div class="max-h-96 overflow-y-auto">
          <Show when={query().trim() && results().length > 0}>
            <div class="px-4 py-2 text-xs text-[var(--text-muted)]">
              {t('SEARCH_RESULTS_COUNT', { count: results().length })}
            </div>
            <For each={results()}>
              {(msg) => (
                <div class="px-4 py-2 hover:bg-[var(--bg-input)] cursor-pointer transition-colors border-b border-[var(--border)]/50">
                  <div class="flex items-baseline gap-2">
                    <span class="font-semibold text-sm text-[var(--text-primary)]">{msg.authorName}</span>
                    <span class="text-xs text-[var(--text-muted)]">{new Date(msg.timestamp).toLocaleString()}</span>
                  </div>
                  <p class="text-sm text-[var(--text-secondary)] mt-0.5 truncate">{msg.content}</p>
                </div>
              )}
            </For>
          </Show>
          <Show when={query().trim() && results().length === 0}>
            <div class="p-4 text-center text-[var(--text-muted)] text-sm">{t('SEARCH_NO_RESULTS')}</div>
          </Show>
          <Show when={!query().trim()}>
            <div class="p-4 text-center text-[var(--text-muted)] text-sm">{t('SEARCH_PLACEHOLDER')}</div>
          </Show>
        </div>
      </div>
    </div>
  )
}
