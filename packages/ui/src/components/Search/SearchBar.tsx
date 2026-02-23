import { createSignal, Show, type JSX } from 'solid-js'
import type { SearchFilters } from '@harmony/search'

export interface SearchBarProps {
  onSearch: (query: string, filters?: SearchFilters) => void
  placeholder?: string
  loading?: boolean
}

export function useSearchBar(props: SearchBarProps) {
  const [query, setQuery] = createSignal('')
  const [showFilters, setShowFilters] = createSignal(false)
  const [filters, setFilters] = createSignal<SearchFilters>({})

  const submit = () => {
    const q = query().trim()
    if (q) props.onSearch(q, filters())
  }

  const clear = () => {
    setQuery('')
    setFilters({})
  }

  return {
    query,
    setQuery,
    showFilters,
    toggleFilters: () => setShowFilters((v) => !v),
    filters,
    setFilters,
    submit,
    clear,
    loading: () => props.loading ?? false,
    hasQuery: () => query().trim().length > 0
  }
}

export function SearchBar(props: SearchBarProps): JSX.Element {
  const ctrl = useSearchBar(props)

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') ctrl.submit()
    if (e.key === 'Escape') ctrl.clear()
  }

  return (
    <div class="relative">
      <div class="flex items-center gap-2 bg-hm-bg-dark rounded-lg px-3 py-2">
        <span class="text-hm-text-muted">🔍</span>
        <input
          type="text"
          class="flex-1 bg-transparent text-sm text-hm-text placeholder-hm-text-muted outline-none"
          placeholder={props.placeholder ?? 'Search messages...'}
          value={ctrl.query()}
          onInput={(e) => ctrl.setQuery(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
        />
        <Show when={ctrl.hasQuery()}>
          <button class="text-hm-text-muted hover:text-white text-xs" onClick={() => ctrl.clear()}>
            ✕
          </button>
        </Show>
        <button
          class={`text-xs px-2 py-1 rounded transition-colors ${
            ctrl.showFilters() ? "bg-hm-accent text-white" : "text-hm-text-muted hover:text-white"
          }`}
          onClick={() => ctrl.toggleFilters()}
        >
          Filters
        </button>
      </div>

      <Show when={ctrl.loading()}>
        <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-hm-accent/30 overflow-hidden">
          <div class="h-full w-1/3 bg-hm-accent animate-pulse" />
        </div>
      </Show>
    </div>
  )
}
