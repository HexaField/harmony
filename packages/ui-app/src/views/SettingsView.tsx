import { type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { t } from '../i18n/strings.js'

export const SettingsView: Component = () => {
  const store = useAppStore()

  return (
    <div class="flex h-screen bg-[var(--bg-primary)]">
      <div class="w-60 bg-[var(--bg-secondary)] p-4">
        <h2 class="text-lg font-bold mb-4">{t('SETTINGS_USER')}</h2>
        <ul class="space-y-1">
          <li class="px-3 py-2 rounded bg-[var(--bg-input)] text-sm">{t('SETTINGS_IDENTITY')}</li>
          <li class="px-3 py-2 rounded hover:bg-[var(--bg-input)] text-sm text-[var(--text-muted)] cursor-pointer">
            {t('SETTINGS_APPEARANCE')}
          </li>
          <li class="px-3 py-2 rounded hover:bg-[var(--bg-input)] text-sm text-[var(--text-muted)] cursor-pointer">
            {t('SETTINGS_NOTIFICATIONS')}
          </li>
          <li class="px-3 py-2 rounded hover:bg-[var(--bg-input)] text-sm text-[var(--text-muted)] cursor-pointer">
            {t('SETTINGS_DEVICES')}
          </li>
          <li class="px-3 py-2 rounded hover:bg-[var(--bg-input)] text-sm text-[var(--text-muted)] cursor-pointer">
            {t('SETTINGS_RECOVERY')}
          </li>
        </ul>
      </div>
      <div class="flex-1 p-8">
        <h3 class="text-xl font-bold mb-4">{t('SETTINGS_IDENTITY')}</h3>
        <div class="bg-[var(--bg-surface)] p-4 rounded-lg">
          <label class="text-sm text-[var(--text-muted)]">DID</label>
          <p class="font-mono text-sm mt-1 break-all">{store.did()}</p>
        </div>
      </div>
    </div>
  )
}
