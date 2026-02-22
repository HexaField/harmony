import type { CommunityState } from '@harmony/client'

export interface CommunityHeaderProps {
  community: CommunityState | null
}

export function CommunityHeader(props: CommunityHeaderProps) {
  return {
    name: () => props.community?.info.name ?? '',
    memberCount: () => props.community?.info.memberCount ?? 0
  }
}
