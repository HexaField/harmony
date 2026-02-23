import { Show, type JSX } from 'solid-js'

export interface VoicePipProps {
  channelName: string
  participantCount: number
  duration: string
  audioEnabled: boolean
  onToggleAudio: () => void
  onExpand: () => void
  onDisconnect: () => void
}

export function useVoicePip(props: VoicePipProps) {
  return {
    channelName: () => props.channelName,
    participantCount: () => props.participantCount,
    duration: () => props.duration,
    audioEnabled: () => props.audioEnabled,
    toggleAudio: () => props.onToggleAudio(),
    expand: () => props.onExpand(),
    disconnect: () => props.onDisconnect()
  }
}

export function VoicePip(props: VoicePipProps): JSX.Element {
  const ctrl = useVoicePip(props)

  return (
    <div class="fixed bottom-4 right-4 z-50 bg-hm-bg-darker rounded-xl shadow-2xl border border-hm-bg p-3 min-w-[220px]">
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2 cursor-pointer" onClick={() => ctrl.expand()}>
          <span class="text-green-400 text-xs">●</span>
          <span class="text-sm font-medium text-white truncate max-w-[120px]">{ctrl.channelName()}</span>
        </div>
        <span class="text-xs text-hm-text-muted">{ctrl.duration()}</span>
      </div>

      <div class="flex items-center justify-between">
        <span class="text-xs text-hm-text-muted">{ctrl.participantCount()} connected</span>
        <div class="flex items-center gap-2">
          <button
            class={`w-7 h-7 flex items-center justify-center rounded-full text-xs transition-colors ${
              ctrl.audioEnabled() ? "bg-hm-bg text-white" : "bg-red-500 text-white"
            }`}
            onClick={() => ctrl.toggleAudio()}
          >
            {ctrl.audioEnabled() ? '🎤' : '🔇'}
          </button>
          <button
            class="w-7 h-7 flex items-center justify-center rounded-full bg-red-500 text-white text-xs hover:bg-red-600 transition-colors"
            onClick={() => ctrl.disconnect()}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}
