import { createSignal, For, Show, type JSX } from 'solid-js'
import type { ProposalDef, ProposedAction, QuorumRequirement } from '@harmony/governance'

export interface CreateProposalProps {
  communityId: string
  onSubmit: (def: ProposalDef) => void
  onCancel: () => void
}

export function useCreateProposal(props: CreateProposalProps) {
  const [step, setStep] = createSignal<'info' | 'actions' | 'quorum'>('info')
  const [title, setTitle] = createSignal('')
  const [description, setDescription] = createSignal('')
  const [actions, setActions] = createSignal<ProposedAction[]>([])
  const [quorumKind, setQuorumKind] = createSignal<'threshold' | 'percentage'>('threshold')
  const [quorumValue, setQuorumValue] = createSignal(3)
  const [votingPeriodDays, setVotingPeriodDays] = createSignal(7)

  const addAction = (kind: ProposedAction['kind']) => {
    setActions((prev) => [...prev, { kind, params: {} }])
  }

  const removeAction = (index: number) => {
    setActions((prev) => prev.filter((_, i) => i !== index))
  }

  const canSubmit = () => title().trim().length > 0 && actions().length > 0

  const submit = () => {
    if (!canSubmit()) return
    const quorum: QuorumRequirement = {
      kind: quorumKind(),
      ...(quorumKind() === 'threshold' ? { threshold: quorumValue() } : { percentage: quorumValue() })
    }
    props.onSubmit({
      communityId: props.communityId,
      title: title().trim(),
      description: description().trim(),
      actions: actions(),
      quorum,
      votingPeriod: votingPeriodDays() * 86400,
      executionDelay: 86400,
      contestPeriod: 86400
    })
  }

  return {
    step,
    setStep,
    title,
    setTitle,
    description,
    setDescription,
    actions,
    addAction,
    removeAction,
    quorumKind,
    setQuorumKind,
    quorumValue,
    setQuorumValue,
    votingPeriodDays,
    setVotingPeriodDays,
    canSubmit,
    submit,
    cancel: () => props.onCancel(),
    nextStep: () => setStep((s) => (s === 'info' ? 'actions' : 'quorum')),
    prevStep: () => setStep((s) => (s === 'quorum' ? 'actions' : 'info')),
    actionCount: () => actions().length
  }
}

export function CreateProposal(props: CreateProposalProps): JSX.Element {
  const ctrl = useCreateProposal(props)
  const actionKinds: ProposedAction['kind'][] = [
    'create-channel',
    'delete-channel',
    'create-role',
    'delegate-capability',
    'revoke-capability',
    'update-constitution'
  ]

  return (
    <div class="space-y-4 p-4 max-w-md">
      <h2 class="text-lg font-semibold text-white">Create Proposal</h2>

      <div class="flex gap-1 mb-4">
        {(['info', 'actions', 'quorum'] as const).map((s) => (
          <div class={`flex-1 h-1 rounded ${ctrl.step() === s ? 'bg-hm-accent' : 'bg-hm-bg-darker'}`} />
        ))}
      </div>

      <Show when={ctrl.step() === 'info'}>
        <div class="space-y-3">
          <div>
            <label class="text-xs text-hm-text-muted block mb-1">Title</label>
            <input
              class="w-full bg-hm-bg-dark text-sm text-hm-text rounded px-3 py-2 outline-none"
              value={ctrl.title()}
              onInput={(e) => ctrl.setTitle(e.currentTarget.value)}
              placeholder="What should this proposal do?"
            />
          </div>
          <div>
            <label class="text-xs text-hm-text-muted block mb-1">Description</label>
            <textarea
              class="w-full bg-hm-bg-dark text-sm text-hm-text rounded px-3 py-2 outline-none resize-none h-20"
              value={ctrl.description()}
              onInput={(e) => ctrl.setDescription(e.currentTarget.value)}
              placeholder="Explain the rationale..."
            />
          </div>
          <div class="flex gap-2 justify-end">
            <button class="px-4 py-2 text-sm text-hm-text-muted" onClick={() => ctrl.cancel()}>
              Cancel
            </button>
            <button
              class="px-4 py-2 text-sm font-medium text-white bg-hm-accent rounded"
              onClick={() => ctrl.nextStep()}
            >
              Next
            </button>
          </div>
        </div>
      </Show>

      <Show when={ctrl.step() === 'actions'}>
        <div class="space-y-3">
          <p class="text-xs text-hm-text-muted">Add the actions this proposal will execute</p>
          <div class="flex flex-wrap gap-1">
            <For each={actionKinds}>
              {(kind) => (
                <button
                  class="px-2 py-1 text-xs bg-hm-bg-dark text-hm-text rounded hover:bg-hm-accent/20"
                  onClick={() => ctrl.addAction(kind)}
                >
                  + {kind}
                </button>
              )}
            </For>
          </div>
          <Show when={ctrl.actionCount() > 0}>
            <div class="space-y-1">
              <For each={ctrl.actions()}>
                {(action, index) => (
                  <div class="flex items-center gap-2 bg-hm-bg-dark rounded px-3 py-2">
                    <span class="text-xs text-hm-text flex-1">{action.kind}</span>
                    <button class="text-xs text-red-400" onClick={() => ctrl.removeAction(index())}>
                      ✕
                    </button>
                  </div>
                )}
              </For>
            </div>
          </Show>
          <div class="flex gap-2 justify-end">
            <button class="px-4 py-2 text-sm text-hm-text-muted" onClick={() => ctrl.prevStep()}>
              Back
            </button>
            <button
              class="px-4 py-2 text-sm font-medium text-white bg-hm-accent rounded"
              onClick={() => ctrl.nextStep()}
            >
              Next
            </button>
          </div>
        </div>
      </Show>

      <Show when={ctrl.step() === 'quorum'}>
        <div class="space-y-3">
          <div>
            <label class="text-xs text-hm-text-muted block mb-1">Quorum type</label>
            <select
              class="w-full bg-hm-bg-dark text-sm text-hm-text rounded px-3 py-2 outline-none"
              value={ctrl.quorumKind()}
              onChange={(e) => ctrl.setQuorumKind(e.currentTarget.value as any)}
            >
              <option value="threshold">Threshold (N votes)</option>
              <option value="percentage">Percentage</option>
            </select>
          </div>
          <div>
            <label class="text-xs text-hm-text-muted block mb-1">
              {ctrl.quorumKind() === 'threshold' ? 'Required votes' : 'Required %'}
            </label>
            <input
              type="number"
              class="w-full bg-hm-bg-dark text-sm text-hm-text rounded px-3 py-2 outline-none"
              value={ctrl.quorumValue()}
              onInput={(e) => ctrl.setQuorumValue(parseInt(e.currentTarget.value) || 1)}
              min="1"
            />
          </div>
          <div>
            <label class="text-xs text-hm-text-muted block mb-1">Voting period (days)</label>
            <input
              type="number"
              class="w-full bg-hm-bg-dark text-sm text-hm-text rounded px-3 py-2 outline-none"
              value={ctrl.votingPeriodDays()}
              onInput={(e) => ctrl.setVotingPeriodDays(parseInt(e.currentTarget.value) || 1)}
              min="1"
            />
          </div>
          <div class="flex gap-2 justify-end">
            <button class="px-4 py-2 text-sm text-hm-text-muted" onClick={() => ctrl.prevStep()}>
              Back
            </button>
            <button
              class="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded disabled:opacity-50"
              disabled={!ctrl.canSubmit()}
              onClick={() => ctrl.submit()}
            >
              Create Proposal
            </button>
          </div>
        </div>
      </Show>
    </div>
  )
}
