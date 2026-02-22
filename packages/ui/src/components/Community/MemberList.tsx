import { For, Show, type JSX } from 'solid-js'
import type { MemberInfo } from '@harmony/client'
import { Avatar } from '../Shared/Avatar.js'

export interface MemberListProps {
  members: MemberInfo[]
}

// Logic hook (for testing)
export function useMemberList(props: MemberListProps) {
  return {
    members: () => props.members,
    onlineCount: () => props.members.filter((m) => m.presence.status !== 'offline').length,
    offlineCount: () => props.members.filter((m) => m.presence.status === 'offline').length
  }
}

export function MemberList(props: MemberListProps): JSX.Element {
  const ctrl = useMemberList(props)
  const online = () => props.members.filter((m) => m.presence.status !== 'offline')
  const offline = () => props.members.filter((m) => m.presence.status === 'offline')

  const renderMember = (member: MemberInfo) => (
    <div class="flex items-center gap-2 px-2 py-1 rounded hover:bg-hm-bg/50 cursor-pointer">
      <Avatar
        did={member.did}
        size="sm"
        presenceStatus={member.presence.status as 'online' | 'idle' | 'dnd' | 'offline'}
      />
      <div class="min-w-0">
        <span
          class={`text-sm truncate block ${member.presence.status === 'offline' ? 'text-hm-text-muted' : 'text-hm-text'}`}
        >
          {member.displayName ?? member.did.slice(-8)}
        </span>
      </div>
    </div>
  )

  return (
    <div class="w-60 bg-hm-bg-dark overflow-y-auto py-4 px-2">
      <Show when={online().length > 0}>
        <h3 class="text-xs font-semibold text-hm-text-muted uppercase tracking-wide px-2 mb-2">
          Online — {ctrl.onlineCount()}
        </h3>
        <For each={online()}>{renderMember}</For>
      </Show>

      <Show when={offline().length > 0}>
        <h3 class="text-xs font-semibold text-hm-text-muted uppercase tracking-wide px-2 mt-4 mb-2">
          Offline — {ctrl.offlineCount()}
        </h3>
        <For each={offline()}>{renderMember}</For>
      </Show>
    </div>
  )
}
