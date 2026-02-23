import { For, Show, type JSX } from 'solid-js'
import type { ConstitutionDoc } from '@harmony/governance'

export interface ConstitutionViewProps {
  constitution: ConstitutionDoc
  onEdit?: () => void
  canEdit?: boolean
}

export function useConstitutionView(props: ConstitutionViewProps) {
  return {
    rules: () => props.constitution.rules,
    ruleCount: () => props.constitution.rules.length,
    version: () => props.constitution.version,
    ratifiedAt: () => {
      try {
        return new Date(props.constitution.ratifiedAt).toLocaleDateString()
      } catch {
        return props.constitution.ratifiedAt
      }
    },
    ratifiers: () => props.constitution.ratifiedBy,
    ratifierCount: () => props.constitution.ratifiedBy.length,
    canEdit: () => props.canEdit ?? false,
    edit: () => props.onEdit?.()
  }
}

export function ConstitutionView(props: ConstitutionViewProps): JSX.Element {
  const ctrl = useConstitutionView(props)

  return (
    <div class="space-y-4 p-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold text-white">📜 Constitution</h2>
          <p class="text-xs text-hm-text-muted">
            v{ctrl.version()} · Ratified {ctrl.ratifiedAt()} · {ctrl.ratifierCount()} signer
            {ctrl.ratifierCount() !== 1 ? 's' : ''}
          </p>
        </div>
        <Show when={ctrl.canEdit()}>
          <button
            class="px-3 py-1 text-xs font-medium text-white bg-hm-accent rounded hover:bg-hm-accent/80"
            onClick={() => ctrl.edit()}
          >
            Propose Amendment
          </button>
        </Show>
      </div>

      <div class="space-y-3">
        <For each={ctrl.rules()}>
          {(rule, index) => (
            <div class="bg-hm-bg-dark rounded-lg p-3">
              <div class="flex items-start gap-3">
                <span class="text-xs text-hm-text-muted font-mono mt-0.5">§{index() + 1}</span>
                <div class="flex-1">
                  <p class="text-sm text-hm-text">{rule.description}</p>
                  <div class="flex items-center gap-2 mt-2">
                    <span class="text-xs px-2 py-0.5 rounded bg-hm-bg-darker text-hm-text-muted">
                      {rule.constraint.kind}
                    </span>
                    <Show when={rule.immutable}>
                      <span class="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400">Immutable</span>
                    </Show>
                  </div>
                </div>
              </div>
            </div>
          )}
        </For>
      </div>

      <Show when={ctrl.ruleCount() === 0}>
        <div class="text-center py-8">
          <p class="text-sm text-hm-text-muted">No constitutional rules defined</p>
        </div>
      </Show>
    </div>
  )
}
