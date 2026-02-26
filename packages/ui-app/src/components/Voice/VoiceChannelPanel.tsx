import { For, type Component } from 'solid-js'
import type { VoiceParticipantInfo } from '../../types.js'
import { initialsFromName } from '../../utils/pseudonym.js'

export interface VoiceChannelPanelProps {
  channelName: string
  participants: VoiceParticipantInfo[]
}

export const VoiceChannelPanel: Component<VoiceChannelPanelProps> = (props) => {
  return (
    <div class="flex flex-col gap-1 p-2" data-testid="voice-channel-panel">
      <div class="text-xs font-semibold text-[var(--text-muted)] uppercase mb-1">
        🔊 {props.channelName} — {props.participants.length} connected
      </div>
      <For each={props.participants}>
        {(participant) => (
          <div
            class="flex items-center gap-2 px-2 py-1 rounded hover:bg-[var(--bg-input)] transition-colors"
            classList={{ 'ring-1 ring-green-400': participant.speaking }}
            data-testid={`voice-participant-${participant.did}`}
          >
            <div
              class="w-7 h-7 rounded-full bg-[var(--accent)] flex items-center justify-center text-[10px] font-bold text-white"
              classList={{
                'ring-2 ring-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]': participant.speaking
              }}
            >
              {initialsFromName(participant.displayName)}
            </div>
            <span class="text-sm text-[var(--text-primary)] flex-1 truncate">{participant.displayName}</span>
            <div class="flex gap-1 text-xs">
              {participant.muted && <span title="Muted">🔇</span>}
              {participant.videoEnabled && <span title="Video on">📹</span>}
              {participant.screenSharing && <span title="Screen sharing">🖥️</span>}
            </div>
          </div>
        )}
      </For>
    </div>
  )
}
