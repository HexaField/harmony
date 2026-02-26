// Search components — client-side search with highlights and navigation
import { createSignal } from 'solid-js'
import type { SearchOverlayProps, SearchResultsProps, SearchResultItem } from '../../types.js'
import { t } from '../../i18n/strings.js'

/**
 * Highlight query terms in text using <mark> tags.
 * Returns HTML string for use with innerHTML.
 */
export function highlightMatches(text: string, query: string): string {
  if (!query.trim()) return escapeHtml(text)
  const escaped = escapeHtml(text)
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0)
  let result = escaped
  for (const term of terms) {
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    result = result.replace(
      regex,
      '<mark style="background:var(--search-highlight, #fbbf24);color:var(--text-primary, #000)">$1</mark>'
    )
  }
  return result
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function SearchOverlay(
  props: SearchOverlayProps & {
    /** Client-side search function: query → results */
    searchFn?: (query: string) => SearchResultItem[]
    /** Navigate to a search result (set channel, scroll to message, close overlay) */
    onNavigate?: (result: SearchResultItem) => void
  }
) {
  const [query, setQuery] = createSignal('')
  const [results, setResults] = createSignal<SearchResultItem[]>([])

  const doSearch = (q: string) => {
    setQuery(q)
    if (props.searchFn && q.trim()) {
      setResults(props.searchFn(q))
    } else {
      setResults([])
    }
  }

  const handleSelect = (result: SearchResultItem) => {
    if (props.onNavigate) {
      props.onNavigate(result)
    }
    props.onSelect(result)
  }

  return {
    query: query(),
    setQuery: doSearch,
    results: results(),
    onClose: props.onClose,
    onSelect: handleSelect,
    placeholder: t('SEARCH_PLACEHOLDER'),
    noResults: t('SEARCH_NO_RESULTS'),
    highlightedResults: () =>
      results().map((r) => ({
        ...r,
        highlightedPreview: highlightMatches(r.preview, query())
      }))
  }
}

export function SearchResults(
  props: SearchResultsProps & {
    /** Current query for highlighting */
    query?: string
    /** Navigate to result (sets channel, scrolls to message) */
    onNavigate?: (result: SearchResultItem) => void
  }
) {
  const handleClick = (result: SearchResultItem) => {
    if (props.onNavigate) {
      props.onNavigate(result)
    }
    props.onSelect(result)
  }

  return {
    results: props.results,
    onSelect: handleClick,
    query: props.query ?? '',
    highlightedResults: props.results.map((r) => ({
      ...r,
      highlightedPreview: highlightMatches(r.preview, props.query ?? '')
    }))
  }
}
