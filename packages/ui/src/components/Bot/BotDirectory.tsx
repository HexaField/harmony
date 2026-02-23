import { For, Show, type JSX } from 'solid-js'
import type { RegisteredBot, BotStatus } from '@harmony/bot-api'

export interface BotDirectoryProps {
  bots: RegisteredBot[]
  onSelect: (botId: string) => void
  onInstallNew: () => void
}

export function useBotDirectory(props: BotDirectoryProps) {
  const statusColor = (status: BotStatus) => {
    switch (status) {
      case 'running':
        return 'text-green-400'
      case 'stopped':
        return 'text-hm-text-muted'
      case 'errored':
        return 'text-red-400'
      case 'starting':
        return 'text-yellow-400'
      default:
        return 'text-hm-text-muted'
    }
  }

  return {
    bots: () => props.bots,
    botCount: () => props.bots.length,
    select: (id: string) => props.onSelect(id),
    installNew: () => props.onInstallNew(),
    statusColor,
    runningCount: () => props.bots.filter((b) => b.status === 'running').length
  }
}

export function BotDirectory(props: BotDirectoryProps): JSX.Element {
  const ctrl = useBotDirectory(props)

  return (
    <div class="flex flex-col h-full">
      <div class="flex items-center justify-between px-4 py-3 border-b border-hm-bg-darker">
        <div>
          <h3 class="text-sm font-semibold text-white">Bots</h3>
          <p class="text-xs text-hm-text-muted">
            {ctrl.runningCount()} running · {ctrl.botCount()} installed
          </p>
        </div>
        <button
          class="px-3 py-1 text-xs font-medium text-white bg-hm-accent rounded hover:bg-hm-accent/80 transition-colors"
          onClick={() => ctrl.installNew()}
        >
          + Install
        </button>
      </div>

      <Show when={ctrl.bots().length === 0}>
        <div class="flex-1 flex flex-col items-center justify-center gap-2 py-8">
          <span class="text-3xl">🤖</span>
          <p class="text-sm text-hm-text-muted">No bots installed</p>
        </div>
      </Show>

      <div class="flex-1 overflow-y-auto divide-y divide-hm-bg-darker">
        <For each={ctrl.bots()}>
          {(bot) => (
            <div
              class="flex items-center gap-3 px-4 py-3 hover:bg-hm-bg-dark cursor-pointer transition-colors"
              onClick={() => ctrl.select(bot.id)}
            >
              <div class="w-10 h-10 rounded-lg bg-hm-bg-darker flex items-center justify-center text-lg">🤖</div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-hm-text truncate">{bot.manifest.name}</p>
                <p class="text-xs text-hm-text-muted truncate">{bot.manifest.description}</p>
              </div>
              <span class={`text-xs ${ctrl.statusColor(bot.status)}`}>● {bot.status}</span>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}
