import type { JSX } from 'solid-js'

export interface AvatarProps {
  did: string
  imageUrl?: string
  size?: 'sm' | 'md' | 'lg'
  presenceStatus?: 'online' | 'idle' | 'dnd' | 'offline'
}

const hashCode = (s: string) => {
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e']

// Logic hook (for testing)
export function useAvatar(props: AvatarProps) {
  return {
    initials: () => props.did.slice(-2).toUpperCase(),
    backgroundColor: () => COLORS[hashCode(props.did) % COLORS.length],
    imageUrl: () => props.imageUrl,
    size: () => props.size ?? 'md',
    presenceStatus: () => props.presenceStatus
  }
}

const SIZE_MAP = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-16 h-16 text-lg' }
const PRESENCE_COLORS: Record<string, string> = {
  online: 'bg-hm-green',
  idle: 'bg-hm-yellow',
  dnd: 'bg-hm-red',
  offline: 'bg-hm-text-muted'
}

export function Avatar(props: AvatarProps): JSX.Element {
  const ctrl = useAvatar(props)

  return (
    <div class="relative inline-block flex-shrink-0">
      {ctrl.imageUrl() ? (
        <img
          src={ctrl.imageUrl()!}
          alt={ctrl.initials()}
          class={`${SIZE_MAP[ctrl.size()]} rounded-full object-cover`}
        />
      ) : (
        <div
          class={`${SIZE_MAP[ctrl.size()]} rounded-full flex items-center justify-center text-white font-semibold`}
          style={{ 'background-color': ctrl.backgroundColor() }}
        >
          {ctrl.initials()}
        </div>
      )}
      {ctrl.presenceStatus() && (
        <span
          class={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-hm-bg-dark ${PRESENCE_COLORS[ctrl.presenceStatus()!]}`}
        />
      )}
    </div>
  )
}
