import { createSignal, For, Show, type JSX } from 'solid-js'
import type { UserDelegation } from '@harmony/governance'

export interface DelegationManagerProps {
  delegationsFrom: UserDelegation[]
  delegationsTo: UserDelegation[]
  myDID: string
  availableCapabilities: string[]
  onCreate: (toDID: string, capabilities: string[]) => void
  onRevoke: (delegationId: string) => void
}

export function useDelegationManager(props: DelegationManagerProps) {
  const [showCreate, setShowCreate] = createSignal(false)
  const [targetDID, setTargetDID] = createSignal('')
  const [selectedCaps, setSelectedCaps] = createSignal<Set<string>>(new Set())
  const [tab, setTab] = createSignal<'outgoing' | 'incoming'>('outgoing')

  const toggleCap = (cap: string) => {
    setSelectedCaps((prev) => {
      const next = new Set(prev)
      if (next.has(cap)) next.delete(cap)
      else next.add(cap)
      return next
    })
  }

  const create = () => {
    if (!targetDID().trim() || selectedCaps().size === 0) return
    props.onCreate(targetDID().trim(), Array.from(selectedCaps()))
    setTargetDID('')
    setSelectedCaps(new Set())
    setShowCreate(false)
  }

  return {
    delegationsFrom: () => props.delegationsFrom,
    delegationsTo: () => props.delegationsTo,
    outgoingCount: () => props.delegationsFrom.length,
    incomingCount: () => props.delegationsTo.length,
    tab,
    setTab,
    showCreate,
    toggleCreate: () => setShowCreate((v) => !v),
    targetDID,
    setTargetDID,
    selectedCaps,
    toggleCap,
    availableCapabilities: () => props.availableCapabilities,
    create,
    revoke: (id: string) => props.onRevoke(id),
    canCreate: () => targetDID().trim().length > 0 && selectedCaps().size > 0
  }
}

export function DelegationManager(props: DelegationManagerProps): JSX.Element {
  const ctrl = useDelegationManager(props)

  return (
    <div class="space-y-3 p-4">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold text-white">Delegations</h3>
        <button
          class="px-3 py-1 text-xs font-medium text-white bg-hm-accent rounded hover:bg-hm-accent/80"
          onClick={() => ctrl.toggleCreate()}
        >
          {ctrl.showCreate() ? 'Cancel' : '+ Delegate'}
        </button>
      </div>

      <div class="flex gap-1 bg-hm-bg-dark rounded-lg p-1">
        <button
          class={`flex-1 text-xs py-1 rounded ${ctrl.tab() === 'outgoing' ? "bg-hm-accent text-white" : 'text-hm-text-muted'}`}
          onClick={() => ctrl.setTab('outgoing')}
        >
          Outgoing ({ctrl.outgoingCount()})
        </button>
        <button
          class={`flex-1 text-xs py-1 rounded ${ctrl.tab() === 'incoming' ? "bg-hm-accent text-white" : 'text-hm-text-muted'}`}
          onClick={() => ctrl.setTab('incoming')}
        >
          Incoming ({ctrl.incomingCount()})
        </button>
      </div>

      <Show when={ctrl.showCreate()}>
        <div class="bg-hm-bg-dark rounded-lg p-3 space-y-2">
          <input
            class="w-full bg-hm-bg-darker text-sm text-hm-text rounded px-3 py-2 outline-none placeholder-hm-text-muted"
            placeholder="Delegate's DID"
            value={ctrl.targetDID()}
            onInput={(e) => ctrl.setTargetDID(e.currentTarget.value)}
          />
          <p class="text-xs text-hm-text-muted">Capabilities to delegate:</p>
          <div class="flex flex-wrap gap-1">
            <For each={ctrl.availableCapabilities()}>
              {(cap) => (
                <button
                  class={`px-2 py-1 text-xs rounded transition-colors ${
                    ctrl.selectedCaps().has(cap)
                      ? "bg-hm-accent text-white"
                      : "bg-hm-bg-darker text-hm-text-muted hover:text-white"
                  }`}
                  onClick={() => ctrl.toggleCap(cap)}
                >
                  {cap}
                </button>
              )}
            </For>
          </div>
          <button
            class="w-full px-4 py-2 text-sm font-medium text-white bg-hm-accent rounded disabled:opacity-50"
            disabled={!ctrl.canCreate()}
            onClick={() => ctrl.create()}
          >
            Create Delegation
          </button>
        </div>
      </Show>

      <Show when={ctrl.tab() === 'outgoing'}>
        <div class="divide-y divide-hm-bg-darker">
          <For each={ctrl.delegationsFrom()}>
            {(d) => (
              <div class="py-3 flex items-center gap-3">
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-hm-text">→ {d.toDID.slice(-8)}</p>
                  <p class="text-xs text-hm-text-muted">{d.capabilities.join(', ')}</p>
                  <Show when={d.reason}>
                    <p class="text-xs text-hm-text-muted italic">"{d.reason}"</p>
                  </Show>
                </div>
                <Show when={d.active}>
                  <button class="text-xs text-red-400 hover:text-red-300" onClick={() => ctrl.revoke(d.id)}>
                    Revoke
                  </button>
                </Show>
                <Show when={!d.active}>
                  <span class="text-xs text-hm-text-muted">Revoked</span>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={ctrl.tab() === 'incoming'}>
        <div class="divide-y divide-hm-bg-darker">
          <For each={ctrl.delegationsTo()}>
            {(d) => (
              <div class="py-3">
                <p class="text-sm text-hm-text">← {d.fromDID.slice(-8)}</p>
                <p class="text-xs text-hm-text-muted">{d.capabilities.join(', ')}</p>
                <Show when={d.expiresAt}>
                  <p class="text-xs text-hm-text-muted">Expires: {d.expiresAt}</p>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
