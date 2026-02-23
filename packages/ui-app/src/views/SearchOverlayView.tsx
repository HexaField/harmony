import { createSignal, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { t } from '../i18n/strings.js'

export const SearchOverlayView: Component = () => {
  const store = useAppStore()
  const [query, setQuery] = createSignal('')

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
        <div class="p-4 text-center text-[var(--text-muted)] text-sm">
          {query() ? t('SEARCH_NO_RESULTS') : t('SEARCH_PLACEHOLDER')}
        </div>
      </div>
    </div>
  )
}
