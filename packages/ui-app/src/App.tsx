import { Show, onMount, type Component } from 'solid-js'
import { AppContext, createAppStore } from './store.tsx'
import { OnboardingView } from './views/OnboardingView.tsx'
import { MainLayout } from './views/MainLayout.tsx'
import { SettingsView } from './views/SettingsView.tsx'
import { createCryptoProvider } from '@harmony/crypto'
import { IdentityManager } from '@harmony/identity'

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

        // Init the single HarmonyClient — it auto-connects to persisted servers
        await store.initClient(result.identity, result.keyPair)

        // Desktop mode: ensure local server is running and added
        if (window.__HARMONY_DESKTOP__) {
          try {
            const running = await window.__HARMONY_DESKTOP__.isServerRunning()
            if (running) {
              const serverUrl = await window.__HARMONY_DESKTOP__.getServerUrl()
              if (serverUrl) {
                store.addServer(serverUrl)
              }
            }
          } catch {
            // Desktop bridge not available or failed — continue without local server
          }
        }
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
          <Show when={!store.needsSetup()} fallback={<OnboardingView startAtSetup={true} />}>
            <Show when={store.showSettings()} fallback={<MainLayout />}>
              <SettingsView />
            </Show>
          </Show>
        </Show>
      </div>
    </AppContext.Provider>
  )
}
