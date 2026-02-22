import type { DMChannelState } from '@harmony/client'

export interface DMListProps {
  channels: DMChannelState[]
  activeRecipientDID: string | null
  onSelect: (did: string) => void
}

export function DMList(props: DMListProps) {
  return {
    channels: () => props.channels,
    activeRecipientDID: () => props.activeRecipientDID,
    select: (did: string) => props.onSelect(did),
    totalUnread: () => props.channels.reduce((sum, c) => sum + c.unreadCount, 0)
  }
}
