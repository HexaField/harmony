import { createSignal } from 'solid-js'
import type { HarmonyClient } from '@harmony/client'

const [clientInstance, setClientInstance] = createSignal<HarmonyClient | null>(null)

export function useClient() {
  return {
    client: clientInstance,
    setClient: setClientInstance
  }
}
