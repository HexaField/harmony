import { Show, type JSX } from 'solid-js'
import type { DecryptedMessage } from '@harmony/client'
import { Avatar } from '../Shared/Avatar.js'

export interface MessageProps {
  message: DecryptedMessage
  isOwn: boolean
  onReply?: (id: string) => void
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
  onReact?: (id: string, emoji: string) => void
}

// Logic hook (for testing)
export function useMessage(props: MessageProps) {
  return {
    message: () => props.message,
    isOwn: () => props.isOwn,
    authorDID: () => props.message.authorDID,
    content: () => props.message.content,
    timestamp: () => props.message.timestamp,
    edited: () => props.message.edited,
    reactions: () => props.message.reactions,
    reply: () => props.onReply?.(props.message.id),
    edit: () => props.onEdit?.(props.message.id),
    remove: () => props.onDelete?.(props.message.id),
    react: (emoji: string) => props.onReact?.(props.message.id, emoji)
  }
}

function formatTime(iso: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export function Message(props: MessageProps): JSX.Element {
  const ctrl = useMessage(props)

  return (
    <div class="group flex gap-3 px-4 py-1 hover:bg-hm-bg/30 transition-colors">
      <Avatar did={ctrl.authorDID()} size="md" />
      <div class="flex-1 min-w-0">
        <div class="flex items-baseline gap-2">
          <span class="text-white font-medium text-sm">
            {props.message.authorDisplayName ?? ctrl.authorDID().slice(-8)}
          </span>
          <span class="text-hm-text-muted text-xs">{formatTime(ctrl.timestamp())}</span>
          <Show when={ctrl.edited()}>
            <span class="text-hm-text-muted text-xs">(edited)</span>
          </Show>
        </div>
        <p class="text-hm-text text-sm break-words">{ctrl.content().text}</p>

        {/* Action buttons on hover */}
        <div class="hidden group-hover:flex gap-1 mt-0.5">
          <Show when={props.onReact}>
            <button
              class="text-xs text-hm-text-muted hover:text-white px-1.5 py-0.5 rounded bg-hm-bg-dark"
              onClick={() => ctrl.react('👍')}
            >
              😀
            </button>
          </Show>
          <Show when={props.onReply}>
            <button
              class="text-xs text-hm-text-muted hover:text-white px-1.5 py-0.5 rounded bg-hm-bg-dark"
              onClick={() => ctrl.reply()}
            >
              ↩ Reply
            </button>
          </Show>
          <Show when={ctrl.isOwn() && props.onEdit}>
            <button
              class="text-xs text-hm-text-muted hover:text-white px-1.5 py-0.5 rounded bg-hm-bg-dark"
              onClick={() => ctrl.edit()}
            >
              ✏ Edit
            </button>
          </Show>
          <Show when={ctrl.isOwn() && props.onDelete}>
            <button
              class="text-xs text-hm-red hover:text-white px-1.5 py-0.5 rounded bg-hm-bg-dark"
              onClick={() => ctrl.remove()}
            >
              🗑
            </button>
          </Show>
        </div>
      </div>
    </div>
  )
}
