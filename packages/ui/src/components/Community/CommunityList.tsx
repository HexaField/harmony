import { For, type JSX } from 'solid-js'
import type { CommunityState } from '@harmony/client'
import { Tooltip } from '../Shared/Tooltip.js'

export interface CommunityListProps {
  communities: CommunityState[]
  activeCommunityId: string | null
  onSelect: (id: string) => void
}

// Logic hook (for testing)
export function useCommunityList(props: CommunityListProps) {
  return {
    communities: () => props.communities,
    activeCommunityId: () => props.activeCommunityId,
    select: (id: string) => props.onSelect(id)
  }
}

export function CommunityList(props: CommunityListProps): JSX.Element {
  const ctrl = useCommunityList(props)

  return (
    <div class="flex flex-col items-center gap-2 py-3">
      <For each={ctrl.communities()}>
        {(community) => {
          const isActive = () => ctrl.activeCommunityId() === community.id
          const initial = () => community.info.name.charAt(0).toUpperCase()

          return (
            <Tooltip text={community.info.name} position="right">
              <button
                class={`w-12 h-12 flex items-center justify-center text-white font-semibold transition-all ${
                  isActive()
                    ? "bg-hm-accent rounded-2xl"
                    : "bg-hm-bg-dark rounded-full hover:rounded-2xl hover:bg-hm-accent"
                }`}
                onClick={() => ctrl.select(community.id)}
              >
                {initial()}
              </button>
            </Tooltip>
          )
        }}
      </For>
    </div>
  )
}
