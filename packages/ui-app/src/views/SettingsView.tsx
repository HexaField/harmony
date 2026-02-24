import { createSignal, Show, For, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { t } from '../i18n/strings.js'

type SettingsSection = 'identity' | 'servers' | 'friends' | 'appearance' | 'about'

export const SettingsView: Component = () => {
  const store = useAppStore()
  const [section, setSection] = createSignal<SettingsSection>('identity')
  const [showMnemonic, setShowMnemonic] = createSignal(false)
  const [copiedDid, setCopiedDid] = createSignal(false)
  const [copiedMnemonic, setCopiedMnemonic] = createSignal(false)

  async function copyText(text: string, setter: (v: boolean) => void) {
    try {
      await navigator.clipboard.writeText(text)
      setter(true)
      setTimeout(() => setter(false), 2000)
    } catch {}
  }

  const navItems: { key: SettingsSection; label: () => string }[] = [
    { key: 'identity', label: () => t('SETTINGS_IDENTITY') },
    { key: 'servers', label: () => t('SETTINGS_SERVERS') },
    { key: 'friends', label: () => t('FRIENDS_CONNECTIONS') },
    { key: 'appearance', label: () => t('SETTINGS_APPEARANCE') },
    { key: 'about', label: () => t('SETTINGS_ABOUT') }
  ]

  return (
    <div class="flex h-screen bg-[var(--bg-primary)]">
      {/* Sidebar */}
      <div class="w-60 bg-[var(--bg-secondary)] p-4 flex flex-col">
        <button
          onClick={() => store.setShowSettings(false)}
          class="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-4 text-left transition-colors"
        >
          {t('SETTINGS_BACK')}
        </button>
        <h2 class="text-lg font-bold mb-4">{t('SETTINGS_USER')}</h2>
        <ul class="space-y-1">
          <For each={navItems}>
            {(item) => (
              <li
                onClick={() => setSection(item.key)}
                class="px-3 py-2 rounded text-sm cursor-pointer transition-colors"
                classList={{
                  'bg-[var(--bg-input)] text-[var(--text-primary)]': section() === item.key,
                  'hover:bg-[var(--bg-input)] text-[var(--text-muted)]': section() !== item.key
                }}
              >
                {item.label()}
              </li>
            )}
          </For>
        </ul>
      </div>

      {/* Content */}
      <div class="flex-1 p-8 overflow-y-auto">
        {/* Identity */}
        <Show when={section() === 'identity'}>
          <h3 class="text-xl font-bold mb-6">{t('SETTINGS_IDENTITY')}</h3>

          {/* DID */}
          <div class="bg-[var(--bg-surface)] p-4 rounded-lg mb-4">
            <label class="text-sm text-[var(--text-muted)]">{t('SETTINGS_DID')}</label>
            <div class="flex items-center gap-2 mt-1">
              <p class="font-mono text-sm break-all flex-1">{store.did()}</p>
              <button
                onClick={() => copyText(store.did(), setCopiedDid)}
                class="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0 transition-colors"
              >
                {copiedDid() ? `✓ ${t('COPIED')}` : '📋'}
              </button>
            </div>
          </div>

          {/* Display Name */}
          <div class="bg-[var(--bg-surface)] p-4 rounded-lg mb-4">
            <label class="text-sm text-[var(--text-muted)]">{t('SETTINGS_DISPLAY_NAME')}</label>
            <div class="flex gap-2 mt-1">
              <input
                type="text"
                value={store.displayName()}
                onInput={(e) => store.setDisplayName(e.currentTarget.value)}
                class="flex-1 p-2 rounded-lg bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none text-sm"
                placeholder={t('SETTINGS_DISPLAY_NAME_PLACEHOLDER')}
              />
              <button
                onClick={() => {
                  const client = store.client()
                  if (client?.isConnected()) {
                    client.setPresence('online', store.displayName()).catch(() => {})
                  }
                }}
                class="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold transition-colors"
              >
                {t('SETTINGS_DISPLAY_NAME_SAVE')}
              </button>
            </div>
          </div>

          {/* Mnemonic */}
          <div class="bg-[var(--bg-surface)] p-4 rounded-lg">
            <label class="text-sm text-[var(--text-muted)]">{t('SETTINGS_MNEMONIC')}</label>
            <Show
              when={showMnemonic()}
              fallback={
                <button
                  onClick={() => setShowMnemonic(true)}
                  class="block mt-2 text-sm text-[var(--accent)] hover:underline"
                >
                  {t('SETTINGS_MNEMONIC_REVEAL')}
                </button>
              }
            >
              <div class="mt-2">
                <div class="bg-[var(--error)]/10 border border-[var(--error)]/30 rounded-lg p-3 mb-3">
                  <p class="text-xs text-[var(--error)]">⚠️ {t('SETTINGS_MNEMONIC_REVEAL_WARNING')}</p>
                </div>
                <div class="bg-[var(--bg-input)] p-3 rounded-lg font-mono text-sm mb-2 select-all">
                  {store.mnemonic()}
                </div>
                <div class="flex gap-2">
                  <button
                    onClick={() => copyText(store.mnemonic(), setCopiedMnemonic)}
                    class="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    {copiedMnemonic() ? `✓ ${t('COPIED')}` : `📋 ${t('ONBOARDING_MNEMONIC_COPY')}`}
                  </button>
                  <button
                    onClick={() => setShowMnemonic(false)}
                    class="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    {t('SETTINGS_MNEMONIC_HIDE')}
                  </button>
                </div>
              </div>
            </Show>
          </div>
        </Show>

        {/* Servers */}
        <Show when={section() === 'servers'}>
          <h3 class="text-xl font-bold mb-6">{t('SETTINGS_SERVERS')}</h3>
          <div class="bg-[var(--bg-surface)] p-4 rounded-lg mb-4">
            <p class="text-sm text-[var(--text-muted)]">{t('SETTINGS_NO_SERVERS')}</p>
          </div>
          <button class="py-2 px-4 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold transition-colors">
            {t('SETTINGS_ADD_SERVER')}
          </button>
        </Show>

        {/* Friends & Connections */}
        <Show when={section() === 'friends'}>
          <h3 class="text-xl font-bold mb-6">{t('FRIENDS_CONNECTIONS')}</h3>
          <div class="bg-[var(--bg-surface)] p-4 rounded-lg mb-4">
            <p class="text-sm text-[var(--text-secondary)] mb-4">{t('FRIENDS_DISCORD')}</p>
            <button
              onClick={() => {
                store.setShowSettings(false)
                store.setShowFriendFinder(true)
              }}
              class="py-2 px-4 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold transition-colors"
            >
              {t('FRIENDS_FIND')}
            </button>
          </div>
        </Show>

        {/* Appearance */}
        <Show when={section() === 'appearance'}>
          <h3 class="text-xl font-bold mb-6">{t('SETTINGS_APPEARANCE')}</h3>
          <div class="bg-[var(--bg-surface)] p-4 rounded-lg">
            <label class="text-sm text-[var(--text-muted)] mb-3 block">Theme</label>
            <div class="flex gap-2">
              <button
                onClick={() => store.setTheme('dark')}
                class="py-2 px-4 rounded-lg text-sm font-semibold transition-colors"
                classList={{
                  'bg-[var(--accent)] text-white': store.theme() === 'dark',
                  'bg-[var(--bg-input)] text-[var(--text-secondary)]': store.theme() !== 'dark'
                }}
              >
                {t('SETTINGS_THEME_DARK')}
              </button>
              <button
                onClick={() => store.setTheme('light')}
                class="py-2 px-4 rounded-lg text-sm font-semibold transition-colors"
                classList={{
                  'bg-[var(--accent)] text-white': store.theme() === 'light',
                  'bg-[var(--bg-input)] text-[var(--text-secondary)]': store.theme() !== 'light'
                }}
              >
                {t('SETTINGS_THEME_LIGHT')}
              </button>
            </div>
          </div>
        </Show>

        {/* About */}
        <Show when={section() === 'about'}>
          <h3 class="text-xl font-bold mb-6">{t('SETTINGS_ABOUT')}</h3>
          <div class="bg-[var(--bg-surface)] p-4 rounded-lg space-y-3">
            <div>
              <label class="text-sm text-[var(--text-muted)]">{t('SETTINGS_VERSION')}</label>
              <p class="text-sm mt-1">0.1.0</p>
            </div>
            <div>
              <label class="text-sm text-[var(--text-muted)]">{t('SETTINGS_LICENSE')}</label>
              <p class="text-sm mt-1">CAL-1.0 (Cryptographic Autonomy License)</p>
            </div>
            <div>
              <label class="text-sm text-[var(--text-muted)]">{t('SETTINGS_REPO')}</label>
              <a
                href="https://github.com/nicoth-in/harmony"
                target="_blank"
                rel="noopener"
                class="text-sm mt-1 block text-[var(--accent)] hover:underline"
              >
                github.com/nicoth-in/harmony
              </a>
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}
