// Members components
import type { MemberListProps, MemberCardProps, MemberProfileProps } from '../../types.js'
import { t } from '../../i18n/strings.js'

export function MemberList(props: MemberListProps) {
  const online = props.members.filter((m) => m.status === 'online' || m.status === 'idle' || m.status === 'dnd')
  const offline = props.members.filter((m) => m.status === 'offline')
  return {
    online,
    offline,
    onlineLabel: t('MEMBER_ONLINE'),
    offlineLabel: t('MEMBER_OFFLINE'),
    onSelect: props.onSelect
  }
}

export function MemberCard(props: MemberCardProps) {
  return { member: props.member }
}

export function MemberProfile(props: MemberProfileProps) {
  return { member: props.member, title: t('MEMBER_PROFILE') }
}
