import type { DecryptedMessage } from '@harmony/client'

export interface MessageProps {
  message: DecryptedMessage
  isOwn: boolean
  onReply?: (id: string) => void
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
  onReact?: (id: string, emoji: string) => void
}

export function Message(props: MessageProps) {
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
