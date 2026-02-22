import { Show, type JSX } from 'solid-js'
import type { ChannelInfo } from '@harmony/client'

export interface ChannelHeaderProps {
  channel: ChannelInfo | null
  onSettings?: () => void
}

export function ChannelHeader(props: ChannelHeaderProps): JSX.Element {
  return (
    <div class="h-12 min-h-[48px] flex items-center px-4 border-b border-hm-bg-darker shadow-sm">
      <Show when={props.channel} fallback={<span class="text-hm-text-muted">Select a channel</span>}>
        {(channel) => (
          <>
            <span class="text-hm-text-muted mr-1.5">#</span>
            <h2 class="text-white font-semibold">{channel().name}</h2>
            <Show when={channel().topic}>
              <div class="mx-3 w-px h-6 bg-hm-bg-darker" />
              <span class="text-hm-text-muted text-sm truncate">{channel().topic}</span>
            </Show>
            <div class="flex-1" />
            <Show when={props.onSettings}>
              <button
                class="text-hm-text-muted hover:text-white transition-colors"
                onClick={() => props.onSettings?.()}
              >
                ⚙
              </button>
            </Show>
          </>
        )}
      </Show>
    </div>
  )
}
