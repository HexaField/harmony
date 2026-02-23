import { Show, type Component } from 'solid-js'
import { Route, useNavigate } from '@solidjs/router'
import { AppContext, createAppStore } from './store.tsx'
import { OnboardingView } from './views/OnboardingView.tsx'
import { MainLayout } from './views/MainLayout.tsx'
import { SettingsView } from './views/SettingsView.tsx'
import { t } from './i18n/strings.js'

export const App: Component = () => {
  const store = createAppStore()

  return (
    <AppContext.Provider value={store}>
      <div class="h-screen flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)]">
        <Show when={store.isOnboarded()} fallback={<OnboardingView />}>
          <MainLayout />
        </Show>
      </div>
    </AppContext.Provider>
  )
}
