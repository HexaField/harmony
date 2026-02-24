import { createSignal, Show, For, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { t } from '../i18n/strings.js'
import { createServerProvider, type HostingMode } from '../server-provider.js'

type MigrationStep = 'intro' | 'hosting' | 'bot-setup' | 'bot-running' | 'importing' | 'linking' | 'complete'

const provider = createServerProvider()

const HOSTING_OPTIONS: Record<HostingMode, { icon: string; titleKey: string; descKey: string }> = {
  local: { icon: '💻', titleKey: 'HOSTING_LOCAL_TITLE', descKey: 'HOSTING_LOCAL_DESC' },
  cloud: { icon: '☁️', titleKey: 'HOSTING_CLOUD_TITLE', descKey: 'HOSTING_CLOUD_DESC' },
  remote: { icon: '🔗', titleKey: 'HOSTING_REMOTE_TITLE', descKey: 'HOSTING_REMOTE_DESC' }
}

export const MigrationWizard: Component<{ onClose: () => void }> = (props) => {
  const store = useAppStore()
  const [step, setStep] = createSignal<MigrationStep>('intro')
  const [hostingMode, setHostingMode] = createSignal<HostingMode | null>(null)
  const [remoteUrl, setRemoteUrl] = createSignal('')
  const portalUrl = () => import.meta.env.VITE_PORTAL_URL || 'http://localhost:3001'
  const [botToken, setBotToken] = createSignal('')
  const [discordServerId, setDiscordServerId] = createSignal('')
  const [exportProgress, _setExportProgress] = createSignal(0)
  const [error, setError] = createSignal('')
  const [_exportId, _setExportId] = createSignal('')

  const availableModes = provider.availableModes()

  const allSteps: MigrationStep[] = ['intro', 'hosting', 'bot-setup', 'bot-running', 'importing', 'linking', 'complete']
  const stepIndex = () => allSteps.indexOf(step())

  function selectHosting(mode: HostingMode) {
    setHostingMode(mode)
    setError('')
    setStep('bot-setup')
  }

  return (
    <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div class="max-w-lg w-full mx-4 p-8 rounded-2xl bg-[var(--bg-surface)] shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Progress bar */}
        <div class="flex gap-1 mb-6">
          <For each={allSteps.slice(0, -1)}>
            {(_, i) => (
              <div class={`h-1 flex-1 rounded ${i() <= stepIndex() ? 'bg-[var(--accent)]' : 'bg-[var(--bg-input)]'}`} />
            )}
          </For>
        </div>

        {/* Header */}
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-xl font-bold">{t('MIGRATION_TITLE')}</h2>
          <button onClick={props.onClose} class="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl">
            ✕
          </button>
        </div>

        <Show when={error()}>
          <div class="mb-4 p-3 rounded-lg bg-[var(--error)]/20 border border-[var(--error)]/30 text-[var(--error)] text-sm">
            {error()}
          </div>
        </Show>

        {/* Step: Intro */}
        <Show when={step() === 'intro'}>
          <div class="space-y-4">
            <p class="text-[var(--text-secondary)]">{t('MIGRATION_INTRO')}</p>

            <div class="space-y-3">
              <div class="p-4 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]">
                <h3 class="font-semibold mb-1">{t('MIGRATION_OPTION_COMMUNITY')}</h3>
                <p class="text-sm text-[var(--text-secondary)]">{t('MIGRATION_OPTION_COMMUNITY_DESC')}</p>
                <button
                  onClick={() => setStep('hosting')}
                  class="mt-3 py-2 px-4 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold transition-colors"
                >
                  {t('MIGRATION_START_COMMUNITY')}
                </button>
              </div>

              <div class="p-4 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]">
                <h3 class="font-semibold mb-1">{t('MIGRATION_OPTION_LINK')}</h3>
                <p class="text-sm text-[var(--text-secondary)]">{t('MIGRATION_OPTION_LINK_DESC')}</p>
                <button
                  onClick={() => setStep('linking')}
                  class="mt-3 py-2 px-4 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)] text-sm font-semibold transition-colors"
                >
                  {t('MIGRATION_START_LINK')}
                </button>
              </div>
            </div>
          </div>
        </Show>

        {/* Step: Choose hosting */}
        <Show when={step() === 'hosting'}>
          <div class="space-y-4">
            <h3 class="text-lg font-semibold">{t('HOSTING_CHOOSE')}</h3>
            <p class="text-sm text-[var(--text-secondary)]">{t('MIGRATION_HOSTING_DESC')}</p>

            <div class="space-y-3">
              <For each={availableModes}>
                {(mode) => {
                  const opt = HOSTING_OPTIONS[mode]
                  return (
                    <button
                      onClick={() => selectHosting(mode)}
                      class="w-full p-4 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] hover:border-[var(--accent)] text-left transition-colors"
                    >
                      <div class="flex items-center gap-3">
                        <span class="text-2xl">{opt.icon}</span>
                        <div>
                          <h3 class="font-semibold">{t(opt.titleKey as any)}</h3>
                          <p class="text-sm text-[var(--text-secondary)]">{t(opt.descKey as any)}</p>
                        </div>
                      </div>
                    </button>
                  )
                }}
              </For>
            </div>

            {/* Remote URL input */}
            <Show when={hostingMode() === 'remote'}>
              <div>
                <label class="block text-sm font-medium mb-1">{t('SERVER_URL_LABEL')}</label>
                <input
                  value={remoteUrl()}
                  onInput={(e) => setRemoteUrl(e.currentTarget.value)}
                  class="w-full p-3 rounded-lg bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none text-sm font-mono"
                  placeholder={t('SERVER_URL_PLACEHOLDER')}
                />
              </div>
            </Show>

            <div class="flex gap-3 mt-4">
              <button
                onClick={() => setStep('intro')}
                class="flex-1 py-3 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--border)] text-[var(--text-primary)] font-semibold transition-colors"
              >
                {t('ONBOARDING_BACK')}
              </button>
            </div>
          </div>
        </Show>

        {/* Step: Bot Setup */}
        <Show when={step() === 'bot-setup'}>
          <div class="space-y-4">
            <h3 class="text-lg font-semibold">{t('MIGRATION_BOT_SETUP_TITLE')}</h3>
            <div class="space-y-3 text-sm text-[var(--text-secondary)]">
              <p>
                {'1. '}
                <a
                  href="https://discord.com/developers/applications"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-[var(--accent)] hover:underline"
                >
                  {t('MIGRATION_BOT_SETUP_STEP1_LINK')}
                </a>
                {' ' + t('MIGRATION_BOT_SETUP_STEP1_SUFFIX')}
              </p>
              <p>{t('MIGRATION_BOT_SETUP_STEP2')}</p>
              <p>{t('MIGRATION_BOT_SETUP_STEP3')}</p>
            </div>

            <div class="space-y-3 mt-4">
              <div>
                <label class="block text-sm font-medium mb-1">{t('MIGRATION_BOT_TOKEN')}</label>
                <input
                  type="password"
                  value={botToken()}
                  onInput={(e) => setBotToken(e.currentTarget.value)}
                  class="w-full p-3 rounded-lg bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none text-sm font-mono"
                  placeholder={t('MIGRATION_BOT_TOKEN_PLACEHOLDER')}
                />
              </div>

              <div>
                <label class="block text-sm font-medium mb-1">{t('MIGRATION_DISCORD_SERVER_ID')}</label>
                <input
                  value={discordServerId()}
                  onInput={(e) => setDiscordServerId(e.currentTarget.value)}
                  class="w-full p-3 rounded-lg bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none text-sm font-mono"
                  placeholder={t('MIGRATION_DISCORD_SERVER_ID_PLACEHOLDER')}
                />
              </div>
            </div>

            <div class="flex gap-3 mt-6">
              <button
                onClick={() => setStep('hosting')}
                class="flex-1 py-3 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--border)] text-[var(--text-primary)] font-semibold transition-colors"
              >
                {t('ONBOARDING_BACK')}
              </button>
              <button
                onClick={() => {
                  if (!botToken() || !discordServerId()) {
                    setError(t('MIGRATION_FIELDS_REQUIRED'))
                    return
                  }
                  setError('')
                  setStep('bot-running')
                }}
                disabled={!botToken() || !discordServerId()}
                class="flex-1 py-3 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold transition-colors disabled:opacity-50"
              >
                {t('MIGRATION_START_EXPORT')}
              </button>
            </div>
          </div>
        </Show>

        {/* Step: Bot Running / Exporting */}
        <Show when={step() === 'bot-running'}>
          <div class="space-y-4 text-center">
            <div class="text-4xl mb-2">📦</div>
            <h3 class="text-lg font-semibold">{t('MIGRATION_EXPORTING')}</h3>
            <p class="text-sm text-[var(--text-secondary)]">{t('MIGRATION_EXPORTING_DESC')}</p>

            <div class="w-full bg-[var(--bg-input)] rounded-full h-3 mt-4">
              <div
                class="bg-[var(--accent)] h-3 rounded-full transition-all duration-300"
                style={{ width: `${exportProgress()}%` }}
              />
            </div>
            <p class="text-sm text-[var(--text-muted)]">{exportProgress()}%</p>

            <p class="text-xs text-[var(--text-muted)] mt-4">{t('MIGRATION_EXPORTING_NOTE')}</p>
          </div>
        </Show>

        {/* Step: Importing into Harmony */}
        <Show when={step() === 'importing'}>
          <div class="space-y-4 text-center">
            <div class="text-4xl mb-2">🔐</div>
            <h3 class="text-lg font-semibold">{t('MIGRATION_IMPORTING')}</h3>
            <p class="text-sm text-[var(--text-secondary)]">{t('MIGRATION_IMPORTING_DESC')}</p>
            <div class="flex justify-center mt-4">
              <div class="animate-spin w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full" />
            </div>
          </div>
        </Show>

        {/* Step: Identity Linking */}
        <Show when={step() === 'linking'}>
          <div class="space-y-4">
            <h3 class="text-lg font-semibold">{t('MIGRATION_LINK_TITLE')}</h3>
            <p class="text-sm text-[var(--text-secondary)]">{t('MIGRATION_LINK_DESC')}</p>

            <div class="p-4 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]">
              <p class="text-sm font-medium mb-2">{t('MIGRATION_LINK_YOUR_DID')}</p>
              <p class="font-mono text-xs text-[var(--text-muted)] break-all">{store.did()}</p>
            </div>

            <button
              onClick={async () => {
                setError('')
                try {
                  const res = await fetch(`${portalUrl()}/api/identity/link`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      provider: 'discord',
                      userDID: store.did()
                    })
                  })
                  if (!res.ok) throw new Error(`Portal returned ${res.status}`)
                  const data = await res.json()
                  if (data.redirectUrl) {
                    window.open(data.redirectUrl, '_blank', 'width=500,height=700')
                  }
                } catch (err) {
                  setError(t('ERROR_CONNECTION_FAILED', { url: portalUrl() }))
                }
              }}
              class="w-full py-3 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] text-white font-semibold transition-colors"
            >
              {t('MIGRATION_LINK_DISCORD_BUTTON')}
            </button>

            <div class="flex gap-3 mt-2">
              <button
                onClick={() => setStep('intro')}
                class="flex-1 py-3 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--border)] text-[var(--text-primary)] font-semibold transition-colors"
              >
                {t('ONBOARDING_BACK')}
              </button>
              <button
                onClick={() => setStep('complete')}
                class="flex-1 py-3 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--border)] text-[var(--text-primary)] font-semibold transition-colors"
              >
                {t('MIGRATION_SKIP_LINKING')}
              </button>
            </div>
          </div>
        </Show>

        {/* Step: Complete */}
        <Show when={step() === 'complete'}>
          <div class="space-y-4 text-center">
            <div class="text-5xl mb-2">✅</div>
            <h3 class="text-lg font-semibold">{t('MIGRATION_COMPLETE_TITLE')}</h3>
            <p class="text-sm text-[var(--text-secondary)]">{t('MIGRATION_COMPLETE_DESC')}</p>
            <button
              onClick={props.onClose}
              class="w-full py-3 mt-4 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold transition-colors"
            >
              {t('MIGRATION_COMPLETE_CONTINUE')}
            </button>
          </div>
        </Show>
      </div>
    </div>
  )
}
