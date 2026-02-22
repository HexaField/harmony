export interface AvatarProps {
  did: string
  imageUrl?: string
  size?: 'sm' | 'md' | 'lg'
  presenceStatus?: 'online' | 'idle' | 'dnd' | 'offline'
}

export function Avatar(props: AvatarProps) {
  // Generate a deterministic color from the DID
  const hashCode = (s: string) => {
    let hash = 0
    for (let i = 0; i < s.length; i++) {
      hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0
    }
    return Math.abs(hash)
  }

  return {
    initials: () => props.did.slice(-2).toUpperCase(),
    backgroundColor: () => {
      const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e']
      return colors[hashCode(props.did) % colors.length]
    },
    imageUrl: () => props.imageUrl,
    size: () => props.size ?? 'md',
    presenceStatus: () => props.presenceStatus
  }
}
