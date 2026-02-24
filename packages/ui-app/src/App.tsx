import { Show, onMount, type Component } from 'solid-js'
import { AppContext, createAppStore } from './store.tsx'
import { OnboardingView } from './views/OnboardingView.tsx'
import { MainLayout } from './views/MainLayout.tsx'
import { SettingsView } from './views/SettingsView.tsx'
import { createCryptoProvider } from '@harmony/crypto'
import { IdentityManager } from '@harmony/identity'
import { HarmonyClient } from '@harmony/client'

export const App: Component = () => {
  const store = createAppStore()

  // Re-derive identity from persisted mnemonic on boot
  onMount(async () => {
    const m = store.mnemonic()
    if (m && store.isOnboarded() && !store.identity()) {
      try {
        const crypto = createCryptoProvider()
        const idMgr = new IdentityManager(crypto)
        const result = await idMgr.createFromMnemonic(m)
        store.setIdentity(result.identity)
        store.setKeyPair(result.keyPair)
        // Init client
        const client = new HarmonyClient({
          wsFactory: (url: string) => new WebSocket(url) as any
        })
        store.setClient(client)
      } catch {
        // Corrupted mnemonic — reset to onboarding
        store.setDid('')
        store.setMnemonic('')
      }
    }
  })

  return (
    <AppContext.Provider value={store}>
      <div class="h-screen flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)]">
        <Show when={store.isOnboarded()} fallback={<OnboardingView />}>
          <Show when={store.showSettings()} fallback={<MainLayout />}>
            <SettingsView />
          </Show>
        </Show>
      </div>
    </AppContext.Provider>
  )
}
