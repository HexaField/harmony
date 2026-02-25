import { Show, onMount, type Component } from 'solid-js'
import { AppContext, createAppStore } from './store.tsx'
import { OnboardingView } from './views/OnboardingView.tsx'
import { MainLayout } from './views/MainLayout.tsx'
import { SettingsView } from './views/SettingsView.tsx'
import { createCryptoProvider } from '@harmony/crypto'
import { IdentityManager } from '@harmony/identity'

export const App: Component = () => {
  const store = createAppStore()

  // Load identity from backend config (disk) and auto-connect
  onMount(async () => {
    // Desktop mode: load persisted identity from disk
    if (window.__HARMONY_DESKTOP__?.getConfig) {
      try {
        const config = await window.__HARMONY_DESKTOP__.getConfig()
        if (config?.identity?.did && config?.identity?.mnemonic) {
          const crypto = createCryptoProvider()
          const idMgr = new IdentityManager(crypto)
          const result = await idMgr.createFromMnemonic(config.identity.mnemonic)
          store.setDid(result.identity.did)
          store.setMnemonic(config.identity.mnemonic)
          store.setIdentity(result.identity)
          store.setKeyPair(result.keyPair)
          if (config.identity.displayName) {
            store.setDisplayName(config.identity.displayName)
          }

          // Init client and connect to server
          await store.initClient(result.identity, result.keyPair)

          // Wait for embedded server and add it
          const serverUrl = window.__HARMONY_DESKTOP__.waitForServer
            ? await window.__HARMONY_DESKTOP__.waitForServer()
            : await window.__HARMONY_DESKTOP__.getServerUrl()
          if (serverUrl) {
            store.addServer(serverUrl)
          }
          return
        }
      } catch {
        // Config load failed — fall through to onboarding
      }
    }

    // Non-desktop fallback: use localStorage mnemonic (browser mode)
    const m = store.mnemonic()
    if (m && store.isOnboarded() && !store.identity()) {
      try {
        const crypto = createCryptoProvider()
        const idMgr = new IdentityManager(crypto)
        const result = await idMgr.createFromMnemonic(m)
        store.setIdentity(result.identity)
        store.setKeyPair(result.keyPair)
        await store.initClient(result.identity, result.keyPair)
      } catch {
        store.setDid('')
        store.setMnemonic('')
      }
    }
  })

  return (
    <AppContext.Provider value={store}>
      <div class="h-screen flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)]">
        {/* Draggable title bar region for desktop app (hiddenInset) */}
        <Show when={(window as any).__HARMONY_DESKTOP__}>
          <div class="h-8 w-full flex-shrink-0" style={{ '-webkit-app-region': 'drag', 'padding-left': '78px' }} />
        </Show>
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
