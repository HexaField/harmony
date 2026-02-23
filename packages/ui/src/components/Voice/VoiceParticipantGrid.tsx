import { For, type JSX } from 'solid-js'
import type { VoiceParticipant } from '@harmony/voice'

export interface VoiceParticipantGridProps {
  participants: VoiceParticipant[]
  activeSpeakerDID?: string
}

export function useVoiceParticipantGrid(props: VoiceParticipantGridProps) {
  const gridCols = () => {
    const count = props.participants.length
    if (count <= 1) return 'grid-cols-1'
    if (count <= 4) return 'grid-cols-2'
    if (count <= 9) return 'grid-cols-3'
    return 'grid-cols-4'
  }

  return {
    participants: () => props.participants,
    gridCols,
    activeSpeakerDID: () => props.activeSpeakerDID,
    count: () => props.participants.length
  }
}

export function VoiceParticipantGrid(props: VoiceParticipantGridProps): JSX.Element {
  const ctrl = useVoiceParticipantGrid(props)

  return (
    <div class={`grid ${ctrl.gridCols()} gap-2 p-2 flex-1`}>
      <For each={ctrl.participants()}>
        {(participant) => {
          const isActive = () => ctrl.activeSpeakerDID() === participant.did || participant.speaking
          return (
            <div
              class={`relative flex items-center justify-center rounded-lg bg-hm-bg-dark min-h-[120px] transition-all ${
                isActive() ? "ring-2 ring-green-400" : ''
              }`}
            >
              <div class="flex flex-col items-center gap-2">
                <div class="w-16 h-16 rounded-full bg-hm-accent flex items-center justify-center text-white text-xl font-bold">
                  {participant.did.slice(-2).toUpperCase()}
                </div>
                <span class="text-xs text-hm-text-muted">{participant.did.slice(-8)}</span>
              </div>

              <div class="absolute bottom-2 left-2 flex items-center gap-1">
                {!participant.audioEnabled && <span class="text-xs bg-red-500/80 rounded px-1">🔇</span>}
                {participant.screenSharing && <span class="text-xs bg-hm-accent/80 rounded px-1">🖥️</span>}
              </div>
            </div>
          )
        }}
      </For>
    </div>
  )
}
