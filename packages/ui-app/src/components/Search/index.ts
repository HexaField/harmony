// Search components
import { createSignal } from 'solid-js'
import type { SearchOverlayProps, SearchResultsProps } from '../../types.js'
import { t } from '../../i18n/strings.js'

export function SearchOverlay(props: SearchOverlayProps) {
  const [query, setQuery] = createSignal('')
  return {
    query: query(),
    setQuery,
    onClose: props.onClose,
    onSelect: props.onSelect,
    placeholder: t('SEARCH_PLACEHOLDER'),
    noResults: t('SEARCH_NO_RESULTS')
  }
}

export function SearchResults(props: SearchResultsProps) {
  return { results: props.results, onSelect: props.onSelect }
}
