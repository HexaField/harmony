import { Show, For, type JSX } from 'solid-js'
import { Avatar } from '../Shared/Avatar.js'
import { CredentialBadge } from './CredentialBadge.js'

export interface UserCardProps {
  did: string
  displayName?: string
  roles: string[]
  joinedAt: string
  presenceStatus: 'online' | 'idle' | 'dnd' | 'offline'
  credentials?: Array<{ type: string; issuer: string }>
}

export function UserCard(props: UserCardProps): JSX.Element {
  return (
    <div class="bg-hm-bg-darkest rounded-lg shadow-xl w-72 overflow-hidden">
      {/* Banner */}
      <div class="h-16 bg-hm-accent" />

      {/* Avatar */}
      <div class="px-4 -mt-8">
        <Avatar did={props.did} size="lg" presenceStatus={props.presenceStatus} />
      </div>

      {/* Info */}
      <div class="p-4 pt-2">
        <h3 class="text-white font-bold text-lg">{props.displayName ?? props.did.slice(-8)}</h3>
        <p class="text-hm-text-muted text-xs font-mono mb-3">{props.did.slice(0, 24)}...</p>

        <Show when={props.roles.length > 0}>
          <div class="flex flex-wrap gap-1 mb-3">
            <For each={props.roles}>
              {(role) => <span class="px-2 py-0.5 bg-hm-accent/20 text-hm-accent text-xs rounded-full">{role}</span>}
            </For>
          </div>
        </Show>

        <Show when={props.credentials && props.credentials.length > 0}>
          <div class="flex flex-wrap gap-1 mb-3">
            <For each={props.credentials!}>{(cred) => <CredentialBadge type={cred.type} issuer={cred.issuer} />}</For>
          </div>
        </Show>

        <p class="text-xs text-hm-text-muted">Joined {new Date(props.joinedAt).toLocaleDateString()}</p>
      </div>
    </div>
  )
}
