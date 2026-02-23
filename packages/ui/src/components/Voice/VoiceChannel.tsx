import { Show, For, createSignal, type JSX } from 'solid-js'
import type { VoiceParticipant } from '@harmony/voice'

export interface VoiceChannelProps {
  channelId: string
  channelName: string
  participants: VoiceParticipant[]
  isConnected: boolean
  onJoin: () => void
  onLeave: () => void
}

export function useVoiceChannel(props: VoiceChannelProps) {
  return {
    channelName: () => props.channelName,
    participants: () => props.participants,
    participantCount: () => props.participants.length,
    isConnected: () => props.isConnected,
    join: () => props.onJoin(),
    leave: () => props.onLeave(),
    speakingCount: () => props.participants.filter((p) => p.speaking).length
  }
}

export function VoiceChannel(props: VoiceChannelProps): JSX.Element {
  const ctrl = useVoiceChannel(props)

  return (
    <div class="rounded-lg bg-hm-bg-dark p-3">
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2">
          <span class="text-hm-text-muted">🔊</span>
          <span class="text-sm font-medium text-hm-text">{ctrl.channelName()}</span>
          <Show when={ctrl.participantCount() > 0}>
            <span class="text-xs text-hm-text-muted">({ctrl.participantCount()})</span>
          </Show>
        </div>

        <Show
          when={ctrl.isConnected()}
          fallback={
            <button
              class="px-3 py-1 text-xs font-medium text-white bg-hm-accent rounded hover:bg-hm-accent/80 transition-colors"
              onClick={() => ctrl.join()}
            >
              Join
            </button>
          }
        >
          <button
            class="px-3 py-1 text-xs font-medium text-white bg-red-500 rounded hover:bg-red-600 transition-colors"
            onClick={() => ctrl.leave()}
          >
            Disconnect
          </button>
        </Show>
      </div>

      <Show when={ctrl.participants().length > 0}>
        <div class="space-y-1 mt-2">
          <For each={ctrl.participants()}>
            {(participant) => (
              <div class="flex items-center gap-2 px-2 py-1 rounded hover:bg-hm-bg-darker transition-colors">
                <div
                  class={`w-2 h-2 rounded-full ${participant.speaking ? "bg-green-400 animate-pulse" : 'bg-hm-text-muted'}`}
                />
                <span class="text-sm text-hm-text truncate">{participant.did.slice(-8)}</span>
                <div class="flex items-center gap-1 ml-auto">
                  <Show when={!participant.audioEnabled}>
                    <span class="text-xs text-red-400" title="Muted">
                      🔇
                    </span>
                  </Show>
                  <Show when={participant.videoEnabled}>
                    <span class="text-xs text-hm-text-muted">📹</span>
                  </Show>
                  <Show when={participant.screenSharing}>
                    <span class="text-xs text-hm-text-muted">🖥️</span>
                  </Show>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
