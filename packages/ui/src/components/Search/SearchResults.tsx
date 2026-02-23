import { For, Show, type JSX } from 'solid-js'
import type { SearchResult } from '@harmony/search'

export interface SearchResultsProps {
  results: SearchResult[]
  loading: boolean
  query: string
  onResultClick: (messageId: string, channelId: string) => void
}

export function useSearchResults(props: SearchResultsProps) {
  return {
    results: () => props.results,
    loading: () => props.loading,
    query: () => props.query,
    resultCount: () => props.results.length,
    hasResults: () => props.results.length > 0,
    click: (messageId: string, channelId: string) => props.onResultClick(messageId, channelId),
    formatTimestamp: (ts: string) => {
      try {
        return new Date(ts).toLocaleDateString()
      } catch {
        return ts
      }
    }
  }
}

export function SearchResults(props: SearchResultsProps): JSX.Element {
  const ctrl = useSearchResults(props)

  return (
    <div class="flex flex-col">
      <Show when={!ctrl.loading() && ctrl.query()}>
        <div class="px-4 py-2 text-xs text-hm-text-muted border-b border-hm-bg-darker">
          {ctrl.resultCount()} result{ctrl.resultCount() !== 1 ? 's' : ''} for "{ctrl.query()}"
        </div>
      </Show>

      <Show when={ctrl.loading()}>
        <div class="flex justify-center py-8">
          <span class="text-hm-text-muted text-sm">Searching...</span>
        </div>
      </Show>

      <Show when={!ctrl.loading() && !ctrl.hasResults() && ctrl.query()}>
        <div class="flex flex-col items-center py-8 gap-2">
          <span class="text-2xl">🔍</span>
          <p class="text-sm text-hm-text-muted">No results found</p>
        </div>
      </Show>

      <div class="divide-y divide-hm-bg-darker">
        <For each={ctrl.results()}>
          {(result) => (
            <div
              class="px-4 py-3 hover:bg-hm-bg-dark cursor-pointer transition-colors"
              onClick={() => ctrl.click(result.messageId, result.channelId)}
            >
              <div class="flex items-center gap-2 mb-1">
                <span class="text-xs font-medium text-hm-text">{result.authorDID.slice(-8)}</span>
                <span class="text-xs text-hm-text-muted">{ctrl.formatTimestamp(result.timestamp)}</span>
                <span class="text-xs text-hm-text-muted ml-auto">#{result.channelId.slice(-6)}</span>
              </div>
              <p class="text-sm text-hm-text" innerHTML={result.snippet} />
            </div>
          )}
        </For>
      </div>
    </div>
  )
}
