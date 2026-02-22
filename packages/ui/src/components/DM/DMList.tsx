import { For, Show, type JSX } from 'solid-js'
import type { DMChannelState } from '@harmony/client'
import { Avatar } from '../Shared/Avatar.js'

export interface DMListProps {
  channels: DMChannelState[]
  activeRecipientDID: string | null
  onSelect: (did: string) => void
}

// Logic hook (for testing)
export function useDMList(props: DMListProps) {
  return {
    channels: () => props.channels,
    activeRecipientDID: () => props.activeRecipientDID,
    select: (did: string) => props.onSelect(did),
    totalUnread: () => props.channels.reduce((sum, c) => sum + c.unreadCount, 0)
  }
}

export function DMList(props: DMListProps): JSX.Element {
  const ctrl = useDMList(props)

  return (
    <div class="py-2">
      <h3 class="px-2 mb-1 text-xs font-semibold text-hm-text-muted uppercase tracking-wide">
        Direct Messages
        <Show when={ctrl.totalUnread() > 0}>
          <span class="ml-1 text-hm-red">({ctrl.totalUnread()})</span>
        </Show>
      </h3>
      <For each={ctrl.channels()}>
        {(ch) => {
          const isActive = () => ctrl.activeRecipientDID() === ch.recipientDID
          return (
            <button
              class={`w-full px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${
                isActive() ? "bg-hm-bg text-white" : "text-hm-text-muted hover:text-hm-text hover:bg-hm-bg/50"
              }`}
              onClick={() => ctrl.select(ch.recipientDID)}
            >
              <Avatar did={ch.recipientDID} size="sm" />
              <div class="flex-1 min-w-0 text-left">
                <span class="text-sm truncate block">{ch.recipientDisplayName ?? ch.recipientDID.slice(-8)}</span>
                <Show when={ch.lastMessage}>
                  <span class="text-xs text-hm-text-muted truncate block">{ch.lastMessage!.content.text}</span>
                </Show>
              </div>
              <Show when={ch.unreadCount > 0}>
                <span class="bg-hm-red text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {ch.unreadCount}
                </span>
              </Show>
            </button>
          )
        }}
      </For>
    </div>
  )
}
