import { For, Show, type JSX } from 'solid-js'
import type { Proposal } from '@harmony/governance'

export interface ProposalDetailProps {
  proposal: Proposal
  myDID: string
  onVote: (vote: 'approve' | 'reject') => void
  onExecute: () => void
  onCancel: () => void
  onBack: () => void
}

export function useProposalDetail(props: ProposalDetailProps) {
  const hasVoted = () => props.proposal.signatures.some((s) => s.signerDID === props.myDID)
  const approveCount = () => props.proposal.signatures.filter((s) => s.vote === 'approve').length
  const rejectCount = () => props.proposal.signatures.filter((s) => s.vote === 'reject').length
  const canVote = () => props.proposal.status === 'active' && !hasVoted()
  const canExecute = () => props.proposal.status === 'passed'
  const canCancel = () => ['active', 'pending'].includes(props.proposal.status)

  return {
    proposal: () => props.proposal,
    title: () => props.proposal.def.title,
    description: () => props.proposal.def.description,
    status: () => props.proposal.status,
    hasVoted,
    approveCount,
    rejectCount,
    canVote,
    canExecute,
    canCancel,
    vote: (v: 'approve' | 'reject') => props.onVote(v),
    execute: () => props.onExecute(),
    cancel: () => props.onCancel(),
    back: () => props.onBack(),
    signatures: () => props.proposal.signatures,
    actions: () => props.proposal.def.actions,
    quorum: () => props.proposal.def.quorum,
    quorumMet: () => props.proposal.quorumMet
  }
}

export function ProposalDetail(props: ProposalDetailProps): JSX.Element {
  const ctrl = useProposalDetail(props)

  return (
    <div class="space-y-4 p-4">
      <button class="text-xs text-hm-text-muted hover:text-white" onClick={() => ctrl.back()}>
        ← Back
      </button>

      <div>
        <h2 class="text-lg font-semibold text-white">{ctrl.title()}</h2>
        <p class="text-sm text-hm-text-muted mt-1">{ctrl.description()}</p>
      </div>

      <div class="bg-hm-bg-dark rounded-lg p-3 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-xs text-hm-text-muted">Status</span>
          <span class="text-xs font-medium text-hm-text">{ctrl.status()}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-xs text-hm-text-muted">Quorum</span>
          <span class={`text-xs font-medium ${ctrl.quorumMet() ? 'text-green-400' : 'text-hm-text'}`}>
            {ctrl.quorumMet()
              ? '✓ Met'
              : `${ctrl.quorum().kind}: ${ctrl.quorum().threshold ?? ctrl.quorum().percentage ?? '?'}`}
          </span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-xs text-hm-text-muted">Votes</span>
          <span class="text-xs text-hm-text">
            <span class="text-green-400">{ctrl.approveCount()} ✓</span>
            {' · '}
            <span class="text-red-400">{ctrl.rejectCount()} ✕</span>
          </span>
        </div>
      </div>

      <Show when={ctrl.actions().length > 0}>
        <div>
          <p class="text-xs font-medium text-hm-text-muted uppercase tracking-wider mb-2">Actions</p>
          <div class="space-y-1">
            <For each={ctrl.actions()}>
              {(action) => <div class="bg-hm-bg-dark rounded px-3 py-2 text-xs text-hm-text">{action.kind}</div>}
            </For>
          </div>
        </div>
      </Show>

      <Show when={ctrl.signatures().length > 0}>
        <div>
          <p class="text-xs font-medium text-hm-text-muted uppercase tracking-wider mb-2">Votes</p>
          <div class="space-y-1">
            <For each={ctrl.signatures()}>
              {(sig) => (
                <div class="flex items-center justify-between bg-hm-bg-dark rounded px-3 py-2">
                  <span class="text-xs text-hm-text">{sig.signerDID.slice(-8)}</span>
                  <span class={`text-xs font-medium ${sig.vote === 'approve' ? 'text-green-400' : 'text-red-400'}`}>
                    {sig.vote}
                  </span>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      <div class="flex gap-2 pt-2">
        <Show when={ctrl.canVote()}>
          <button
            class="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700"
            onClick={() => ctrl.vote('approve')}
          >
            Approve
          </button>
          <button
            class="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700"
            onClick={() => ctrl.vote('reject')}
          >
            Reject
          </button>
        </Show>
        <Show when={ctrl.canExecute()}>
          <button
            class="flex-1 px-4 py-2 text-sm font-medium text-white bg-hm-accent rounded hover:bg-hm-accent/80"
            onClick={() => ctrl.execute()}
          >
            Execute
          </button>
        </Show>
        <Show when={ctrl.canCancel()}>
          <button class="px-4 py-2 text-sm text-red-400 hover:text-red-300" onClick={() => ctrl.cancel()}>
            Cancel Proposal
          </button>
        </Show>
      </div>
    </div>
  )
}
