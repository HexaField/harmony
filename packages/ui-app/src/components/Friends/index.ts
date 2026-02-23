// Friends components
import type { FriendListProps, FriendRequestsProps, DiscordFriendFinderProps } from '../../types.js'
import { t } from '../../i18n/strings.js'

export function FriendList(props: FriendListProps) {
  return { friends: props.friends, title: t('FRIENDS_LIST') }
}

export function FriendRequests(props: FriendRequestsProps) {
  return { requests: props.requests, title: t('FRIENDS_REQUESTS') }
}

export function DiscordFriendFinder(_props: DiscordFriendFinderProps) {
  return { title: t('FRIENDS_DISCORD') }
}
