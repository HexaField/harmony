import type { DecryptedMessage } from '@harmony/client'

export interface MessageListProps {
  messages: DecryptedMessage[]
  loading: boolean
  hasMore: boolean
  onLoadMore: () => void
}

export function MessageList(props: MessageListProps) {
  return {
    messages: () => props.messages,
    loading: () => props.loading,
    hasMore: () => props.hasMore,
    loadMore: () => props.onLoadMore(),
    messageCount: () => props.messages.length
  }
}
