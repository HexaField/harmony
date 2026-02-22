import { For, Show, type JSX } from 'solid-js'
import type { ChannelInfo } from '@harmony/client'

export interface ChannelListProps {
  channels: ChannelInfo[]
  activeChannelId: string | null
  onSelect: (id: string) => void
}

// Logic hook (for testing)
export function useChannelList(props: ChannelListProps) {
  return {
    channels: () => props.channels,
    activeChannelId: () => props.activeChannelId,
    select: (id: string) => props.onSelect(id),
    textChannels: () => props.channels.filter((c) => c.type === 'text'),
    voiceChannels: () => props.channels.filter((c) => c.type === 'voice'),
    announcementChannels: () => props.channels.filter((c) => c.type === 'announcement')
  }
}

const ICONS: Record<string, string> = { text: '#', voice: '🔊', announcement: '📢' }

export function ChannelList(props: ChannelListProps): JSX.Element {
  const ctrl = useChannelList(props)

  const renderSection = (label: string, channels: ChannelInfo[]) => (
    <Show when={channels.length > 0}>
      <div class="mb-2">
        <h3 class="px-2 mb-1 text-xs font-semibold text-hm-text-muted uppercase tracking-wide">{label}</h3>
        <For each={channels}>
          {(ch) => (
            <button
              class={`w-full px-2 py-1 rounded text-sm flex items-center gap-1.5 transition-colors ${
                ctrl.activeChannelId() === ch.id
                  ? "bg-hm-bg text-white"
                  : "text-hm-text-muted hover:text-hm-text hover:bg-hm-bg/50"
              }`}
              onClick={() => ctrl.select(ch.id)}
            >
              <span class="text-hm-text-muted">{ICONS[ch.type] ?? '#'}</span>
              <span class="truncate">{ch.name}</span>
            </button>
          )}
        </For>
      </div>
    </Show>
  )

  return (
    <div class="py-2">
      {renderSection('Text Channels', ctrl.textChannels())}
      {renderSection('Voice Channels', ctrl.voiceChannels())}
      {renderSection('Announcements', ctrl.announcementChannels())}
    </div>
  )
}
