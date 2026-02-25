// Members components
import type { MemberListProps, MemberCardProps, MemberProfileProps } from '../../types.js'
import { t } from '../../i18n/strings.js'

export function MemberList(props: MemberListProps) {
  const linked = props.members.filter((m) => m.linked !== false)
  const unlinked = props.members.filter((m) => m.linked === false)
  const online = linked.filter((m) => m.status === 'online' || m.status === 'idle' || m.status === 'dnd')
  const offline = linked.filter((m) => m.status === 'offline')
  return {
    online,
    offline,
    unlinked,
    onlineLabel: t('MEMBER_ONLINE'),
    offlineLabel: t('MEMBER_OFFLINE'),
    unlinkedLabel: t('MEMBER_UNLINKED'),
    onSelect: props.onSelect
  }
}

export function MemberCard(props: MemberCardProps) {
  return { member: props.member }
}

export function MemberProfile(props: MemberProfileProps) {
  return { member: props.member, title: t('MEMBER_PROFILE') }
}
