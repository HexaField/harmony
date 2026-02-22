import { Show, For, type JSX } from 'solid-js'
import type { DecryptedMessage } from '@harmony/client'

export interface MessageListProps {
  messages: DecryptedMessage[]
  loading: boolean
  hasMore: boolean
  onLoadMore: () => void
}

// Logic hook (for testing)
export function useMessageList(props: MessageListProps) {
  return {
    messages: () => props.messages,
    loading: () => props.loading,
    hasMore: () => props.hasMore,
    loadMore: () => props.onLoadMore(),
    messageCount: () => props.messages.length
  }
}

export function MessageList(
  props: MessageListProps & { renderMessage?: (msg: DecryptedMessage) => JSX.Element }
): JSX.Element {
  const ctrl = useMessageList(props)
  let containerRef: HTMLDivElement | undefined

  return (
    <div ref={containerRef} class="flex-1 overflow-y-auto flex flex-col">
      <Show when={ctrl.hasMore()}>
        <div class="flex justify-center py-3">
          <button
            class="text-sm text-hm-text-link hover:underline disabled:opacity-50"
            disabled={ctrl.loading()}
            onClick={() => ctrl.loadMore()}
          >
            {ctrl.loading() ? 'Loading...' : 'Load more messages'}
          </button>
        </div>
      </Show>

      <div class="flex-1" />

      <div class="py-2">
        <For each={ctrl.messages()}>
          {(msg) =>
            props.renderMessage ? (
              props.renderMessage(msg)
            ) : (
              <div class="px-4 py-1 text-sm text-hm-text">{msg.content.text}</div>
            )
          }
        </For>
      </div>

      <Show when={ctrl.messages().length === 0 && !ctrl.loading()}>
        <div class="flex-1 flex items-center justify-center">
          <p class="text-hm-text-muted text-sm">No messages yet. Say something!</p>
        </div>
      </Show>
    </div>
  )
}
