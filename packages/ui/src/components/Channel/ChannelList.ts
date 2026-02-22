import type { ChannelInfo } from '@harmony/client'

export interface ChannelListProps {
  channels: ChannelInfo[]
  activeChannelId: string | null
  onSelect: (id: string) => void
}

export function ChannelList(props: ChannelListProps) {
  return {
    channels: () => props.channels,
    activeChannelId: () => props.activeChannelId,
    select: (id: string) => props.onSelect(id),
    textChannels: () => props.channels.filter((c) => c.type === 'text'),
    voiceChannels: () => props.channels.filter((c) => c.type === 'voice'),
    announcementChannels: () => props.channels.filter((c) => c.type === 'announcement')
  }
}
