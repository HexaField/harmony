import { Show, type Component } from 'solid-js'
import { AppContext, createAppStore } from './store.tsx'
import { OnboardingView } from './views/OnboardingView.tsx'
import { MainLayout } from './views/MainLayout.tsx'
import { SettingsView } from './views/SettingsView.tsx'

export const App: Component = () => {
  const store = createAppStore()

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
