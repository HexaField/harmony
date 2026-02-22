import { createSignal } from 'solid-js'

export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'offline'

export interface PresenceState {
  status: PresenceStatus
  customStatus?: string
}

export function createPresenceStore() {
  const [myPresence, setMyPresence] = createSignal<PresenceState>({ status: 'online' })
  const [userPresences, setUserPresences] = createSignal<Map<string, PresenceState>>(new Map())

  return {
    myPresence,
    userPresences,
    setMyStatus(status: PresenceStatus, customStatus?: string) {
      setMyPresence({ status, customStatus })
    },
    updateUserPresence(did: string, presence: PresenceState) {
      setUserPresences((prev) => {
        const next = new Map(prev)
        next.set(did, presence)
        return next
      })
    },
    getUserPresence(did: string): PresenceState {
      return userPresences().get(did) ?? { status: 'offline' }
    }
  }
}

export type PresenceStore = ReturnType<typeof createPresenceStore>
