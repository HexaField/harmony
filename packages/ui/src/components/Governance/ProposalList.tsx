import { For, Show, type JSX } from 'solid-js'
import type { Proposal, ProposalStatus } from '@harmony/governance'

export interface ProposalListProps {
  proposals: Proposal[]
  activeFilter?: ProposalStatus
  onSelect: (proposalId: string) => void
  onFilterChange: (status?: ProposalStatus) => void
  onCreateNew: () => void
}

export function useProposalList(props: ProposalListProps) {
  const statusColors: Record<ProposalStatus, string> = {
    pending: 'text-yellow-400',
    active: 'text-blue-400',
    passed: 'text-green-400',
    executed: 'text-green-300',
    rejected: 'text-red-400',
    cancelled: 'text-hm-text-muted',
    contested: 'text-orange-400'
  }

  return {
    proposals: () => props.proposals,
    proposalCount: () => props.proposals.length,
    activeFilter: () => props.activeFilter,
    select: (id: string) => props.onSelect(id),
    filterChange: (status?: ProposalStatus) => props.onFilterChange(status),
    createNew: () => props.onCreateNew(),
    statusColor: (s: ProposalStatus) => statusColors[s] ?? 'text-hm-text-muted',
    formatDate: (d: string) => {
      try {
        return new Date(d).toLocaleDateString()
      } catch {
        return d
      }
    }
  }
}

export function ProposalList(props: ProposalListProps): JSX.Element {
  const ctrl = useProposalList(props)
  const statuses: ProposalStatus[] = ['active', 'passed', 'executed', 'rejected', 'cancelled']

  return (
    <div class="flex flex-col h-full">
      <div class="flex items-center justify-between px-4 py-3 border-b border-hm-bg-darker">
        <h3 class="text-sm font-semibold text-white">Proposals</h3>
        <button
          class="px-3 py-1 text-xs font-medium text-white bg-hm-accent rounded hover:bg-hm-accent/80"
          onClick={() => ctrl.createNew()}
        >
          + New
        </button>
      </div>

      <div class="flex gap-1 px-4 py-2 overflow-x-auto">
        <button
          class={`px-2 py-1 text-xs rounded whitespace-nowrap ${!ctrl.activeFilter() ? "bg-hm-accent text-white" : "text-hm-text-muted hover:text-white"}`}
          onClick={() => ctrl.filterChange(undefined)}
        >
          All
        </button>
        <For each={statuses}>
          {(s) => (
            <button
              class={`px-2 py-1 text-xs rounded whitespace-nowrap ${ctrl.activeFilter() === s ? "bg-hm-accent text-white" : "text-hm-text-muted hover:text-white"}`}
              onClick={() => ctrl.filterChange(s)}
            >
              {s}
            </button>
          )}
        </For>
      </div>

      <Show when={ctrl.proposals().length === 0}>
        <div class="flex-1 flex flex-col items-center justify-center gap-2 py-8">
          <span class="text-3xl">📋</span>
          <p class="text-sm text-hm-text-muted">No proposals</p>
        </div>
      </Show>

      <div class="flex-1 overflow-y-auto divide-y divide-hm-bg-darker">
        <For each={ctrl.proposals()}>
          {(proposal) => (
            <div
              class="px-4 py-3 hover:bg-hm-bg-dark cursor-pointer transition-colors"
              onClick={() => ctrl.select(proposal.id)}
            >
              <div class="flex items-center gap-2 mb-1">
                <span class={`text-xs font-medium ${ctrl.statusColor(proposal.status)}`}>● {proposal.status}</span>
                <span class="text-xs text-hm-text-muted ml-auto">{ctrl.formatDate(proposal.createdAt)}</span>
              </div>
              <p class="text-sm font-medium text-hm-text">{proposal.def.title}</p>
              <p class="text-xs text-hm-text-muted mt-1">
                {proposal.signatures.length} vote{proposal.signatures.length !== 1 ? 's' : ''}
                {proposal.quorumMet ? ' · Quorum met' : ''}
              </p>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}
