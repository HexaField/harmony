import { createSignal } from 'solid-js'
import type { HarmonyClient, CommunityState, ChannelSubscription, DecryptedMessage } from '@harmony/client'

// App root component
export function App() {
  const [view, setView] = createSignal<'login' | 'chat'>('login')
  return { view, setView }
}
