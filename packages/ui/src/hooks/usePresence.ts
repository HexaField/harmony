import { createEffect, onCleanup } from 'solid-js'
import { useClient } from './useClient.js'
import type { PresenceStore } from '../stores/presence.js'

export function usePresence(presenceStore: PresenceStore) {
  const { client } = useClient()

  createEffect(() => {
    const c = client()
    if (!c) return

    const unsub = c.on('presence', (...args: unknown[]) => {
      const event = args[0] as { did: string; status: string; customStatus?: string }
      presenceStore.updateUserPresence(event.did, {
        status: event.status as 'online' | 'idle' | 'dnd' | 'offline',
        customStatus: event.customStatus
      })
    })

    onCleanup(unsub)
  })

  return {
    setMyPresence: async (status: 'online' | 'idle' | 'dnd' | 'offline', customStatus?: string) => {
      const c = client()
      if (c) {
        await c.setPresence(status, customStatus)
        presenceStore.setMyStatus(status, customStatus)
      }
    }
  }
}
