import { Show, For, type Component, createMemo } from 'solid-js'
import type { VoiceParticipantInfo } from '../../types.js'
import { t } from '../../i18n/strings.js'

export interface VideoGridProps {
  participants: VoiceParticipantInfo[]
  localDid: string
  screenShareDid?: string | null
}

export const VideoGrid: Component<VideoGridProps> = (props) => {
  const gridClass = createMemo(() => {
    const count = props.participants.length
    if (count <= 1) return 'grid-cols-1'
    if (count <= 2) return 'grid-cols-2'
    if (count <= 4) return 'grid-cols-2 grid-rows-2'
    return 'grid-cols-3'
  })

  const hasScreenShare = () => !!props.screenShareDid

  return (
    <div class="flex-1 flex flex-col" data-testid="video-grid">
      <Show when={hasScreenShare()}>
        <div
          class="flex-1 bg-black rounded-lg mb-2 flex items-center justify-center relative"
          data-testid="screen-share-view"
        >
          <span class="text-white text-lg">
            {props.screenShareDid === props.localDid ? '🖥️ You are sharing your screen' : '🖥️ Screen Share'}
          </span>
          <Show when={props.screenShareDid === props.localDid}>
            <div class="absolute bottom-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold">
              {t('VOICE_STOP_SCREEN_SHARE')}
            </div>
          </Show>
        </div>
      </Show>
      <div class={`grid ${gridClass()} gap-2 ${hasScreenShare() ? 'h-32' : 'flex-1'}`} data-testid="video-tiles">
        <For each={props.participants}>
          {(participant) => (
            <div
              class="bg-[var(--bg-secondary)] rounded-lg flex items-center justify-center relative overflow-hidden"
              classList={{
                'ring-2 ring-green-400': participant.speaking,
                'min-h-[120px]': !hasScreenShare()
              }}
              data-testid={`video-tile-${participant.did}`}
            >
              <Show
                when={participant.videoEnabled}
                fallback={
                  <div class="text-3xl font-bold text-[var(--text-muted)]">
                    {participant.displayName.charAt(0).toUpperCase()}
                  </div>
                }
              >
                <div class="w-full h-full bg-gray-800 flex items-center justify-center text-white">
                  📹 {participant.displayName}
                </div>
              </Show>
              {/* Overlay */}
              <div class="absolute bottom-1 left-1 right-1 flex items-center justify-between px-2 py-1 bg-black/50 rounded text-xs text-white">
                <span>{participant.displayName}</span>
                <div class="flex gap-1">
                  <Show when={participant.muted}>
                    <span title="Muted">🔇</span>
                  </Show>
                  <Show when={participant.screenSharing}>
                    <span title="Sharing screen">🖥️</span>
                  </Show>
                </div>
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}
