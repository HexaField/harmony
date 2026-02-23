import { createSignal, Show, For, type JSX } from 'solid-js'
import type { SearchFilters } from '@harmony/search'

export interface SearchFiltersProps {
  filters: SearchFilters
  onChange: (filters: SearchFilters) => void
  channels?: { id: string; name: string }[]
  authors?: { did: string; name?: string }[]
}

export function useSearchFilters(props: SearchFiltersProps) {
  const [localFilters, setLocalFilters] = createSignal<SearchFilters>(props.filters)

  const update = (partial: Partial<SearchFilters>) => {
    const updated = { ...localFilters(), ...partial }
    setLocalFilters(updated)
    props.onChange(updated)
  }

  const clear = () => {
    setLocalFilters({})
    props.onChange({})
  }

  const activeCount = () => {
    let count = 0
    const f = localFilters()
    if (f.channelId) count++
    if (f.authorDID) count++
    if (f.before) count++
    if (f.after) count++
    if (f.hasAttachment !== undefined) count++
    if (f.inThread !== undefined) count++
    return count
  }

  return {
    filters: localFilters,
    update,
    clear,
    activeCount,
    channels: () => props.channels ?? [],
    authors: () => props.authors ?? []
  }
}

export function SearchFilters(props: SearchFiltersProps): JSX.Element {
  const ctrl = useSearchFilters(props)

  return (
    <div class="bg-hm-bg-dark rounded-lg p-3 space-y-3">
      <div class="flex items-center justify-between">
        <span class="text-xs font-medium text-hm-text-muted uppercase tracking-wider">Filters</span>
        <Show when={ctrl.activeCount() > 0}>
          <button class="text-xs text-hm-accent hover:underline" onClick={() => ctrl.clear()}>
            Clear ({ctrl.activeCount()})
          </button>
        </Show>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <Show when={ctrl.channels().length > 0}>
          <div>
            <label class="text-xs text-hm-text-muted mb-1 block">Channel</label>
            <select
              class="w-full bg-hm-bg-darker text-sm text-hm-text rounded px-2 py-1 outline-none"
              value={ctrl.filters().channelId ?? ''}
              onChange={(e) => ctrl.update({ channelId: e.currentTarget.value || undefined })}
            >
              <option value="">All channels</option>
              <For each={ctrl.channels()}>{(ch) => <option value={ch.id}>{ch.name}</option>}</For>
            </select>
          </div>
        </Show>

        <Show when={ctrl.authors().length > 0}>
          <div>
            <label class="text-xs text-hm-text-muted mb-1 block">Author</label>
            <select
              class="w-full bg-hm-bg-darker text-sm text-hm-text rounded px-2 py-1 outline-none"
              value={ctrl.filters().authorDID ?? ''}
              onChange={(e) => ctrl.update({ authorDID: e.currentTarget.value || undefined })}
            >
              <option value="">Anyone</option>
              <For each={ctrl.authors()}>{(a) => <option value={a.did}>{a.name ?? a.did.slice(-8)}</option>}</For>
            </select>
          </div>
        </Show>

        <div>
          <label class="text-xs text-hm-text-muted mb-1 block">After</label>
          <input
            type="date"
            class="w-full bg-hm-bg-darker text-sm text-hm-text rounded px-2 py-1 outline-none"
            value={ctrl.filters().after?.slice(0, 10) ?? ''}
            onChange={(e) =>
              ctrl.update({ after: e.currentTarget.value ? new Date(e.currentTarget.value).toISOString() : undefined })
            }
          />
        </div>

        <div>
          <label class="text-xs text-hm-text-muted mb-1 block">Before</label>
          <input
            type="date"
            class="w-full bg-hm-bg-darker text-sm text-hm-text rounded px-2 py-1 outline-none"
            value={ctrl.filters().before?.slice(0, 10) ?? ''}
            onChange={(e) =>
              ctrl.update({ before: e.currentTarget.value ? new Date(e.currentTarget.value).toISOString() : undefined })
            }
          />
        </div>
      </div>

      <div class="flex items-center gap-4">
        <label class="flex items-center gap-1 text-xs text-hm-text cursor-pointer">
          <input
            type="checkbox"
            class="rounded"
            checked={ctrl.filters().hasAttachment ?? false}
            onChange={(e) => ctrl.update({ hasAttachment: e.currentTarget.checked ? true : undefined })}
          />
          Has attachment
        </label>

        <label class="flex items-center gap-1 text-xs text-hm-text cursor-pointer">
          <input
            type="checkbox"
            class="rounded"
            checked={ctrl.filters().inThread ?? false}
            onChange={(e) => ctrl.update({ inThread: e.currentTarget.checked ? true : undefined })}
          />
          In thread
        </label>
      </div>
    </div>
  )
}
