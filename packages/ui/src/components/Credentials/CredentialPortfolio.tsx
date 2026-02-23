import { createSignal, For, Show, type JSX } from 'solid-js'
import type { HeldCredential } from '@harmony/credentials'

export interface CredentialPortfolioProps {
  credentials: HeldCredential[]
  onSelect: (credentialId: string) => void
  onExport: () => void
}

export function useCredentialPortfolio(props: CredentialPortfolioProps) {
  const [filter, setFilter] = createSignal<'all' | 'active' | 'expired' | 'revoked'>('all')

  const filtered = () => {
    const f = filter()
    if (f === 'all') return props.credentials
    return props.credentials.filter((c) => c.status === f)
  }

  return {
    credentials: filtered,
    totalCount: () => props.credentials.length,
    filteredCount: () => filtered().length,
    filter,
    setFilter,
    activeCount: () => props.credentials.filter((c) => c.status === 'active').length,
    select: (id: string) => props.onSelect(id),
    exportPortfolio: () => props.onExport()
  }
}

export function CredentialPortfolio(props: CredentialPortfolioProps): JSX.Element {
  const ctrl = useCredentialPortfolio(props)

  return (
    <div class="flex flex-col h-full">
      <div class="flex items-center justify-between px-4 py-3 border-b border-hm-bg-darker">
        <div>
          <h3 class="text-sm font-semibold text-white">Credentials</h3>
          <p class="text-xs text-hm-text-muted">
            {ctrl.activeCount()} active · {ctrl.totalCount()} total
          </p>
        </div>
        <button
          class="px-3 py-1 text-xs font-medium text-hm-text-muted hover:text-white transition-colors"
          onClick={() => ctrl.exportPortfolio()}
        >
          Export
        </button>
      </div>

      <div class="flex gap-1 px-4 py-2">
        {(['all', 'active', 'expired', 'revoked'] as const).map((f) => (
          <button
            class={`px-2 py-1 text-xs rounded ${ctrl.filter() === f ? "bg-hm-accent text-white" : "text-hm-text-muted hover:text-white"}`}
            onClick={() => ctrl.setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      <Show when={ctrl.filteredCount() === 0}>
        <div class="flex-1 flex flex-col items-center justify-center gap-2 py-8">
          <span class="text-3xl">🏅</span>
          <p class="text-sm text-hm-text-muted">No credentials</p>
        </div>
      </Show>

      <div class="flex-1 overflow-y-auto divide-y divide-hm-bg-darker">
        <For each={ctrl.credentials()}>
          {(cred) => (
            <div
              class="px-4 py-3 hover:bg-hm-bg-dark cursor-pointer transition-colors"
              onClick={() => ctrl.select(cred.id)}
            >
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-hm-text">{cred.typeName}</span>
                <span
                  class={`text-xs px-1.5 py-0.5 rounded ${
                    cred.status === 'active'
                      ? "bg-green-600/20 text-green-400"
                      : cred.status === 'expired'
                        ? "bg-yellow-600/20 text-yellow-400"
                        : "bg-red-600/20 text-red-400"
                  }`}
                >
                  {cred.status}
                </span>
                <Show when={cred.transferable}>
                  <span class="text-xs text-hm-text-muted">🔗 Portable</span>
                </Show>
              </div>
              <p class="text-xs text-hm-text-muted mt-1">
                Issued by {cred.issuer.slice(-8)} · {new Date(cred.issuedAt).toLocaleDateString()}
              </p>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}
