import { createSignal, For, Show, type JSX } from 'solid-js'
import type { RegisteredBot, BotPermission } from '@harmony/bot-api'

export interface BotSettingsProps {
  bot: RegisteredBot
  onStart: () => void
  onStop: () => void
  onUninstall: () => void
  onUpdatePermissions: (permissions: BotPermission[]) => void
}

export function useBotSettings(props: BotSettingsProps) {
  const [confirmUninstall, setConfirmUninstall] = createSignal(false)

  return {
    bot: () => props.bot,
    name: () => props.bot.manifest.name,
    description: () => props.bot.manifest.description,
    status: () => props.bot.status,
    isRunning: () => props.bot.status === 'running',
    permissions: () => props.bot.manifest.permissions,
    installedBy: () => props.bot.installedBy,
    installedAt: () => props.bot.installedAt,
    resourceUsage: () => props.bot.resourceUsage,
    start: () => props.onStart(),
    stop: () => props.onStop(),
    confirmUninstall,
    requestUninstall: () => setConfirmUninstall(true),
    cancelUninstall: () => setConfirmUninstall(false),
    uninstall: () => {
      setConfirmUninstall(false)
      props.onUninstall()
    }
  }
}

export function BotSettings(props: BotSettingsProps): JSX.Element {
  const ctrl = useBotSettings(props)

  return (
    <div class="space-y-4 p-4">
      <div class="flex items-center gap-3">
        <div class="w-14 h-14 rounded-lg bg-hm-bg-dark flex items-center justify-center text-2xl">🤖</div>
        <div>
          <h3 class="text-lg font-semibold text-white">{ctrl.name()}</h3>
          <p class="text-xs text-hm-text-muted">{ctrl.description()}</p>
        </div>
      </div>

      <div class="bg-hm-bg-dark rounded-lg p-3 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-xs text-hm-text-muted">Status</span>
          <span class={`text-xs font-medium ${ctrl.isRunning() ? 'text-green-400' : 'text-hm-text-muted'}`}>
            {ctrl.status()}
          </span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-xs text-hm-text-muted">Installed by</span>
          <span class="text-xs text-hm-text">{ctrl.installedBy().slice(-8)}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-xs text-hm-text-muted">Memory</span>
          <span class="text-xs text-hm-text">{ctrl.resourceUsage().memoryMB.toFixed(1)} MB</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-xs text-hm-text-muted">CPU</span>
          <span class="text-xs text-hm-text">{ctrl.resourceUsage().cpuPercent.toFixed(1)}%</span>
        </div>
      </div>

      <div>
        <p class="text-xs font-medium text-hm-text-muted uppercase tracking-wider mb-2">Permissions</p>
        <div class="flex flex-wrap gap-1">
          <For each={ctrl.permissions()}>
            {(perm) => <span class="px-2 py-1 text-xs bg-hm-bg-dark text-hm-text rounded">{perm}</span>}
          </For>
        </div>
      </div>

      <div class="flex gap-2 pt-2">
        <Show
          when={ctrl.isRunning()}
          fallback={
            <button
              class="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700"
              onClick={() => ctrl.start()}
            >
              Start
            </button>
          }
        >
          <button
            class="flex-1 px-4 py-2 text-sm font-medium text-white bg-yellow-600 rounded hover:bg-yellow-700"
            onClick={() => ctrl.stop()}
          >
            Stop
          </button>
        </Show>

        <Show
          when={!ctrl.confirmUninstall()}
          fallback={
            <div class="flex gap-1">
              <button
                class="px-3 py-2 text-xs text-hm-text-muted hover:text-white"
                onClick={() => ctrl.cancelUninstall()}
              >
                Cancel
              </button>
              <button
                class="px-3 py-2 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700"
                onClick={() => ctrl.uninstall()}
              >
                Confirm
              </button>
            </div>
          }
        >
          <button class="px-4 py-2 text-sm text-red-400 hover:text-red-300" onClick={() => ctrl.requestUninstall()}>
            Uninstall
          </button>
        </Show>
      </div>
    </div>
  )
}
