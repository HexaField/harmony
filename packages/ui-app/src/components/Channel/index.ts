// Channel components
import type { ChannelHeaderProps, PinnedMessagesProps, ChannelSettingsProps } from '../../types.js'
import { t } from '../../i18n/strings.js'

export function ChannelHeader(props: ChannelHeaderProps) {
  return { name: props.channel.name, topic: props.channel.topic ?? '', type: props.channel.type }
}

export function PinnedMessages(props: PinnedMessagesProps) {
  return { messages: props.messages, count: props.messages.length, title: t('CHANNEL_PINNED') }
}

export function ChannelSettings(props: ChannelSettingsProps) {
  return { channel: props.channel, title: t('CHANNEL_SETTINGS') }
}
