import { createSignal, For, Show, type JSX } from 'solid-js'
import type { BotPermission } from '@harmony/bot-api'

export interface BotInstallProps {
  botName: string
  botDescription: string
  requestedPermissions: BotPermission[]
  onInstall: (approved: BotPermission[]) => void
  onCancel: () => void
}

export function useBotInstall(props: BotInstallProps) {
  const [approved, setApproved] = createSignal<Set<BotPermission>>(new Set(props.requestedPermissions))
  const [step, setStep] = createSignal<'review' | 'confirm'>('review')

  const togglePermission = (perm: BotPermission) => {
    setApproved((prev) => {
      const next = new Set(prev)
      if (next.has(perm)) next.delete(perm)
      else next.add(perm)
      return next
    })
  }

  return {
    botName: () => props.botName,
    botDescription: () => props.botDescription,
    permissions: () => props.requestedPermissions,
    approved,
    togglePermission,
    approvedCount: () => approved().size,
    step,
    nextStep: () => setStep('confirm'),
    prevStep: () => setStep('review'),
    install: () => props.onInstall(Array.from(approved())),
    cancel: () => props.onCancel()
  }
}

export function BotInstall(props: BotInstallProps): JSX.Element {
  const ctrl = useBotInstall(props)

  const permDescriptions: Record<string, string> = {
    SendMessage: 'Send messages in channels',
    ReadMessage: 'Read messages in channels',
    ManageChannels: 'Create, edit, and delete channels',
    ManageMembers: 'Kick and ban members',
    ManageRoles: 'Create and assign roles',
    UseWebhooks: 'Create and use webhooks',
    ReadPresence: 'See member online status',
    JoinVoice: 'Join voice channels'
  }

  return (
    <div class="bg-hm-bg rounded-lg p-4 max-w-md">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-12 h-12 rounded-lg bg-hm-bg-dark flex items-center justify-center text-2xl">🤖</div>
        <div>
          <h3 class="text-lg font-semibold text-white">{ctrl.botName()}</h3>
          <p class="text-xs text-hm-text-muted">{ctrl.botDescription()}</p>
        </div>
      </div>

      <Show when={ctrl.step() === 'review'}>
        <div class="space-y-2 mb-4">
          <p class="text-xs font-medium text-hm-text-muted uppercase tracking-wider">Permissions</p>
          <For each={ctrl.permissions()}>
            {(perm) => (
              <label class="flex items-center gap-3 p-2 rounded hover:bg-hm-bg-dark cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  class="rounded"
                  checked={ctrl.approved().has(perm)}
                  onChange={() => ctrl.togglePermission(perm)}
                />
                <div>
                  <p class="text-sm text-hm-text">{perm}</p>
                  <p class="text-xs text-hm-text-muted">{permDescriptions[perm] ?? ''}</p>
                </div>
              </label>
            )}
          </For>
        </div>

        <div class="flex gap-2">
          <button
            class="flex-1 px-4 py-2 text-sm text-hm-text-muted hover:text-white transition-colors"
            onClick={() => ctrl.cancel()}
          >
            Cancel
          </button>
          <button
            class="flex-1 px-4 py-2 text-sm font-medium text-white bg-hm-accent rounded hover:bg-hm-accent/80 transition-colors"
            onClick={() => ctrl.nextStep()}
          >
            Review ({ctrl.approvedCount()})
          </button>
        </div>
      </Show>

      <Show when={ctrl.step() === 'confirm'}>
        <p class="text-sm text-hm-text mb-4">
          Install <strong class="text-white">{ctrl.botName()}</strong> with {ctrl.approvedCount()} permission
          {ctrl.approvedCount() !== 1 ? 's' : ''}?
        </p>
        <div class="flex gap-2">
          <button class="flex-1 px-4 py-2 text-sm text-hm-text-muted hover:text-white" onClick={() => ctrl.prevStep()}>
            Back
          </button>
          <button
            class="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700 transition-colors"
            onClick={() => ctrl.install()}
          >
            Install
          </button>
        </div>
      </Show>
    </div>
  )
}
