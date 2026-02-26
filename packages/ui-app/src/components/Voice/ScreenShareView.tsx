import { Show, For, type Component } from 'solid-js'
import type { VoiceParticipantInfo } from '../../types.js'
import { t } from '../../i18n/strings.js'
import { initialsFromName } from '../../utils/pseudonym.js'

export interface ScreenShareViewProps {
  sharingUser: VoiceParticipantInfo
  otherParticipants: VoiceParticipantInfo[]
  isLocalSharing: boolean
  onStopSharing?: () => void
}

export const ScreenShareView: Component<ScreenShareViewProps> = (props) => {
  return (
    <div class="flex flex-col flex-1" data-testid="screen-share-view">
      {/* Main screen share area */}
      <div class="flex-1 bg-black rounded-lg flex items-center justify-center relative min-h-[300px]">
        <span class="text-white text-lg">🖥️ {props.sharingUser.displayName}'s screen</span>
        <Show when={props.isLocalSharing}>
          <div class="absolute top-4 left-1/2 -translate-x-1/2 bg-red-600/90 text-white px-4 py-2 rounded-lg text-sm font-semibold">
            You are sharing your screen
          </div>
          <Show when={props.onStopSharing}>
            <button
              onClick={props.onStopSharing}
              class="absolute bottom-4 left-1/2 -translate-x-1/2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              data-testid="stop-sharing-btn"
            >
              {t('VOICE_STOP_SCREEN_SHARE')}
            </button>
          </Show>
        </Show>
      </div>

      {/* Floating video strip */}
      <Show when={props.otherParticipants.length > 0}>
        <div class="flex gap-2 mt-2 overflow-x-auto pb-1">
          <For each={props.otherParticipants}>
            {(participant) => (
              <div
                class="w-24 h-16 rounded-lg bg-[var(--bg-secondary)] flex items-center justify-center relative flex-shrink-0"
                classList={{ 'ring-2 ring-green-400': participant.speaking }}
              >
                <Show
                  when={participant.videoEnabled}
                  fallback={
                    <div class="text-lg font-bold text-[var(--text-muted)]">
                      {initialsFromName(participant.displayName)}
                    </div>
                  }
                >
                  <div class="w-full h-full bg-gray-800 flex items-center justify-center text-white text-xs">📹</div>
                </Show>
                <span class="absolute bottom-0.5 left-0.5 text-[9px] text-white bg-black/50 px-1 rounded">
                  {participant.displayName}
                </span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
