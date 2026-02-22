import type { MemberInfo } from '@harmony/client'

export interface MemberListProps {
  members: MemberInfo[]
}

export function MemberList(props: MemberListProps) {
  return {
    members: () => props.members,
    onlineCount: () => props.members.filter((m) => m.presence.status !== 'offline').length,
    offlineCount: () => props.members.filter((m) => m.presence.status === 'offline').length
  }
}
