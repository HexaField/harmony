import { createSignal } from 'solid-js'
import type { CommunityState } from '@harmony/client'

export function createCommunityStore() {
  const [communities, setCommunities] = createSignal<CommunityState[]>([])
  const [activeCommunityId, setActiveCommunityId] = createSignal<string | null>(null)

  return {
    communities,
    activeCommunityId,
    setActiveCommunity(id: string) {
      setActiveCommunityId(id)
    },
    addCommunity(community: CommunityState) {
      setCommunities((prev) => [...prev, community])
    },
    removeCommunity(id: string) {
      setCommunities((prev) => prev.filter((c) => c.id !== id))
      if (activeCommunityId() === id) setActiveCommunityId(null)
    },
    updateCommunities(communities: CommunityState[]) {
      setCommunities(communities)
    }
  }
}

export type CommunityStore = ReturnType<typeof createCommunityStore>
