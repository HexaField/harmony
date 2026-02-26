import { createSignal, Show, For, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { t } from '../i18n/strings.js'

type SettingsSection = 'identity' | 'servers' | 'friends' | 'appearance' | 'recovery' | 'about'

export const SettingsView: Component = () => {
  const store = useAppStore()
  const [section, setSection] = createSignal<SettingsSection>('identity')
  const [showMnemonic, setShowMnemonic] = createSignal(false)
  const [copiedDid, setCopiedDid] = createSignal(false)
  const [copiedMnemonic, setCopiedMnemonic] = createSignal(false)
  const [recoverySetupMode, setRecoverySetupMode] = createSignal(false)
  const [trustedDIDs, setTrustedDIDs] = createSignal<string[]>([''])
  const [threshold, setThreshold] = createSignal(1)
  const [recoveryLoading, setRecoveryLoading] = createSignal(false)

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
    { key: 'recovery', label: () => t('SETTINGS_RECOVERY') },
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
          <Show
            when={store.servers().length > 0}
            fallback={
              <div class="bg-[var(--bg-surface)] p-4 rounded-lg mb-4">
                <p class="text-sm text-[var(--text-muted)]">{t('SETTINGS_NO_SERVERS')}</p>
              </div>
            }
          >
            <div class="space-y-3 mb-4">
              <For each={store.servers()}>
                {(server) => (
                  <div class="bg-[var(--bg-surface)] p-4 rounded-lg flex items-center justify-between">
                    <div class="flex items-center gap-3">
                      <div
                        class="w-3 h-3 rounded-full"
                        classList={{
                          'bg-green-500': server.connected,
                          'bg-red-500': !server.connected
                        }}
                      />
                      <div>
                        <p class="text-sm font-medium text-[var(--text-primary)]">{server.url}</p>
                        <p class="text-xs text-[var(--text-muted)]">
                          {server.connected ? 'Connected' : 'Disconnected'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const c = store.client()
                        if (c) {
                          c.removeServer(server.url)
                          // Also remove communities associated with this server
                          store.setCommunities(store.communities().filter((cm) => cm.serverUrl !== server.url))
                        }
                      }}
                      class="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                    >
                      {t('SETTINGS_REMOVE_SERVER')}
                    </button>
                  </div>
                )}
              </For>
            </div>
          </Show>
          <button
            onClick={() => {
              const url = prompt('Server URL (e.g. ws://localhost:4000):')
              if (url?.trim()) store.addServer(url.trim())
            }}
            class="py-2 px-4 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold transition-colors"
          >
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

        {/* Recovery */}
        <Show when={section() === 'recovery'}>
          <h3 class="text-xl font-bold mb-6">{t('SETTINGS_RECOVERY')}</h3>

          {/* Recovery Status */}
          <Show
            when={store.recoveryStatus()?.configured}
            fallback={
              <div class="bg-[var(--bg-surface)] p-4 rounded-lg mb-4">
                <p class="text-sm text-[var(--text-muted)] mb-3">{t('RECOVERY_NOT_CONFIGURED')}</p>
                <Show
                  when={recoverySetupMode()}
                  fallback={
                    <button
                      onClick={() => setRecoverySetupMode(true)}
                      class="py-2 px-4 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold transition-colors"
                    >
                      {t('RECOVERY_SETUP')}
                    </button>
                  }
                >
                  {/* Setup form */}
                  <div class="space-y-3">
                    <label class="text-sm text-[var(--text-muted)] block">{t('RECOVERY_TRUSTED_DIDS')}</label>
                    <For each={trustedDIDs()}>
                      {(did, idx) => (
                        <div class="flex gap-2">
                          <input
                            type="text"
                            value={did}
                            onInput={(e) => {
                              const updated = [...trustedDIDs()]
                              updated[idx()] = e.currentTarget.value
                              setTrustedDIDs(updated)
                            }}
                            placeholder="did:key:z..."
                            class="flex-1 p-2 rounded-lg bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none text-sm font-mono"
                          />
                          <Show when={trustedDIDs().length > 1}>
                            <button
                              onClick={() => setTrustedDIDs(trustedDIDs().filter((_, i) => i !== idx()))}
                              class="text-xs text-red-400 hover:text-red-300 px-2"
                            >
                              {t('RECOVERY_REMOVE_DID')}
                            </button>
                          </Show>
                        </div>
                      )}
                    </For>
                    <button
                      onClick={() => setTrustedDIDs([...trustedDIDs(), ''])}
                      class="text-xs text-[var(--accent)] hover:underline"
                    >
                      + {t('RECOVERY_ADD_DID')}
                    </button>

                    <div>
                      <label class="text-sm text-[var(--text-muted)] block mb-1">{t('RECOVERY_THRESHOLD')}</label>
                      <input
                        type="number"
                        min="1"
                        max={trustedDIDs().filter((d) => d.trim()).length || 1}
                        value={threshold()}
                        onInput={(e) => setThreshold(parseInt(e.currentTarget.value) || 1)}
                        class="w-20 p-2 rounded-lg bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none text-sm"
                      />
                    </div>

                    <div class="flex gap-2">
                      <button
                        onClick={async () => {
                          const dids = trustedDIDs().filter((d) => d.trim())
                          if (dids.length === 0) return
                          setRecoveryLoading(true)
                          try {
                            // TODO: Call POST /recovery/setup when cloud URL is available
                            store.setRecoveryStatus({
                              configured: true,
                              trustedDIDs: dids,
                              threshold: threshold()
                            })
                            setRecoverySetupMode(false)
                          } catch (err) {
                            console.error('Recovery setup failed:', err)
                          } finally {
                            setRecoveryLoading(false)
                          }
                        }}
                        disabled={recoveryLoading() || trustedDIDs().filter((d) => d.trim()).length === 0}
                        class="py-2 px-4 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold transition-colors disabled:opacity-50"
                      >
                        {t('RECOVERY_SAVE')}
                      </button>
                      <button
                        onClick={() => setRecoverySetupMode(false)}
                        class="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      >
                        {t('THREAD_CANCEL')}
                      </button>
                    </div>
                  </div>
                </Show>
              </div>
            }
          >
            <div class="bg-[var(--bg-surface)] p-4 rounded-lg mb-4">
              <p class="text-sm text-green-400 mb-2">✓ {t('RECOVERY_CONFIGURED')}</p>
              <p class="text-sm text-[var(--text-muted)]">
                {t('RECOVERY_THRESHOLD_SUMMARY', {
                  threshold: store.recoveryStatus()!.threshold ?? 0,
                  total: store.recoveryStatus()!.trustedDIDs?.length ?? 0
                })}
              </p>
              <Show when={store.recoveryStatus()!.trustedDIDs}>
                <div class="mt-2 space-y-1">
                  <For each={store.recoveryStatus()!.trustedDIDs!}>
                    {(did) => <p class="text-xs font-mono text-[var(--text-muted)] truncate">{did}</p>}
                  </For>
                </div>
              </Show>
              <button
                onClick={() => {
                  setRecoverySetupMode(true)
                  setTrustedDIDs(store.recoveryStatus()!.trustedDIDs ?? [''])
                  setThreshold(store.recoveryStatus()!.threshold ?? 1)
                  store.setRecoveryStatus(null)
                }}
                class="mt-3 text-sm text-[var(--accent)] hover:underline"
              >
                {t('RECOVERY_RECONFIGURE')}
              </button>
            </div>
          </Show>

          {/* Pending Recovery Requests */}
          <div class="bg-[var(--bg-surface)] p-4 rounded-lg">
            <h4 class="text-sm font-semibold mb-3">{t('RECOVERY_PENDING_TITLE')}</h4>
            <Show
              when={store.pendingRecoveryRequests().length > 0}
              fallback={<p class="text-sm text-[var(--text-muted)]">{t('RECOVERY_NO_PENDING')}</p>}
            >
              <div class="space-y-3">
                <For each={store.pendingRecoveryRequests()}>
                  {(req) => (
                    <div class="bg-[var(--bg-input)] p-3 rounded-lg">
                      <p class="text-xs text-[var(--text-muted)]">{t('RECOVERY_CLAIMED_DID')}</p>
                      <p class="text-sm font-mono truncate mb-2">{req.claimedDID}</p>
                      <p class="text-xs text-[var(--text-muted)]">
                        {t('RECOVERY_APPROVALS', {
                          count: req.approvalsCount,
                          threshold: req.threshold
                        })}
                      </p>
                      <Show
                        when={!req.alreadyApproved}
                        fallback={<p class="text-xs text-green-400 mt-2">✓ {t('RECOVERY_APPROVED')}</p>}
                      >
                        <button
                          onClick={async () => {
                            try {
                              // TODO: Call POST /recovery/approve when cloud URL available
                              const updated = store
                                .pendingRecoveryRequests()
                                .map((r) =>
                                  r.requestId === req.requestId
                                    ? { ...r, alreadyApproved: true, approvalsCount: r.approvalsCount + 1 }
                                    : r
                                )
                              store.setPendingRecoveryRequests(updated)
                            } catch (err) {
                              console.error('Approval failed:', err)
                            }
                          }}
                          class="mt-2 py-1 px-3 rounded bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold transition-colors"
                        >
                          {t('RECOVERY_APPROVE')}
                        </button>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </Show>
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
