import { Show, type JSX } from 'solid-js'
import type { CommunityState } from '@harmony/client'

export interface CommunityHeaderProps {
  community: CommunityState | null
}

// Logic hook (for testing)
export function useCommunityHeader(props: CommunityHeaderProps) {
  return {
    name: () => props.community?.info.name ?? '',
    memberCount: () => props.community?.info.memberCount ?? 0
  }
}

export function CommunityHeader(props: CommunityHeaderProps): JSX.Element {
  const ctrl = useCommunityHeader(props)

  return (
    <div class="h-12 min-h-[48px] flex items-center px-4 border-b border-hm-bg-darkest shadow-sm cursor-pointer hover:bg-hm-bg/50 transition-colors">
      <Show when={props.community} fallback={<span class="text-hm-text-muted">No community selected</span>}>
        <div class="flex-1 min-w-0">
          <h2 class="text-white font-semibold text-sm truncate">{ctrl.name()}</h2>
        </div>
        <span class="text-xs text-hm-text-muted">{ctrl.memberCount()} members</span>
      </Show>
    </div>
  )
}
