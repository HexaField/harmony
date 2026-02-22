import type { CommunityState } from '@harmony/client'

export interface CommunityListProps {
  communities: CommunityState[]
  activeCommunityId: string | null
  onSelect: (id: string) => void
}

export function CommunityList(props: CommunityListProps) {
  return {
    communities: () => props.communities,
    activeCommunityId: () => props.activeCommunityId,
    select: (id: string) => props.onSelect(id)
  }
}
