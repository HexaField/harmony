import { createSignal, Show, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { Onboarding } from '../components/Shell/index.js'
import { t } from '../i18n/strings.js'
import { createCryptoProvider } from '@harmony/crypto'
import { IdentityManager } from '@harmony/identity'

export const OnboardingView: Component = () => {
  const store = useAppStore()
  const [step, setStep] = createSignal<'welcome' | 'create' | 'recover'>('welcome')
  const [mnemonic, setMnemonic] = createSignal('')
  const [generatedMnemonic, setGeneratedMnemonic] = createSignal('')
  const [recoverInput, setRecoverInput] = createSignal('')
  const [error, setError] = createSignal('')
  const [loading, setLoading] = createSignal(false)

  async function handleCreate() {
    setLoading(true)
    setError('')
    try {
      const crypto = createCryptoProvider()
      const idMgr = new IdentityManager(crypto)
      const result = await idMgr.create()
      setGeneratedMnemonic(result.mnemonic)
      store.setDid(result.identity.did)
      store.setMnemonic(result.mnemonic)
      setStep('create')
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleRecover() {
    setLoading(true)
    setError('')
    try {
      const words = recoverInput().trim()
      if (words.split(/\s+/).length !== 12) {
        setError(t('ONBOARDING_MNEMONIC_CONFIRM'))
        setLoading(false)
        return
      }
      const crypto = createCryptoProvider()
      const idMgr = new IdentityManager(crypto)
      const result = await idMgr.createFromMnemonic(words)
      store.setDid(result.identity.did)
      store.setMnemonic(words)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="flex items-center justify-center h-screen bg-[var(--bg-primary)]">
      <div class="max-w-md w-full mx-4 p-8 rounded-2xl bg-[var(--bg-surface)] shadow-2xl">
        <Show when={step() === 'welcome'}>
          <div class="text-center">
            <div class="text-5xl mb-4">🎵</div>
            <h1 class="text-3xl font-bold mb-2">{t('ONBOARDING_WELCOME')}</h1>
            <p class="text-[var(--text-secondary)] mb-8">{t('COMMUNITY_CREATE')}</p>
            <div class="space-y-3">
              <button
                onClick={handleCreate}
                disabled={loading()}
                class="w-full py-3 px-6 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold transition-colors disabled:opacity-50"
              >
                {loading() ? t('LOADING') : t('ONBOARDING_CREATE_IDENTITY')}
              </button>
              <button
                onClick={() => setStep('recover')}
                class="w-full py-3 px-6 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--border)] text-[var(--text-primary)] font-semibold transition-colors"
              >
                {t('ONBOARDING_RECOVER_IDENTITY')}
              </button>
            </div>
            <Show when={error()}>
              <p class="mt-4 text-[var(--error)] text-sm">{error()}</p>
            </Show>
          </div>
        </Show>

        <Show when={step() === 'create'}>
          <div class="text-center">
            <h2 class="text-2xl font-bold mb-2">{t('ONBOARDING_MNEMONIC_BACKUP')}</h2>
            <p class="text-[var(--text-secondary)] text-sm mb-4">{t('ONBOARDING_MNEMONIC_CONFIRM')}</p>
            <div class="bg-[var(--bg-input)] p-4 rounded-lg mb-4 font-mono text-sm leading-relaxed select-all">
              {generatedMnemonic()}
            </div>
            <p class="text-xs text-[var(--text-muted)] mb-6">
              DID: <span class="font-mono">{store.did()}</span>
            </p>
            <button
              onClick={() => {
                store.setConnectionState('connected')
              }}
              class="w-full py-3 px-6 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold transition-colors"
            >
              {t('ONBOARDING_CREATE_IDENTITY')}
            </button>
          </div>
        </Show>

        <Show when={step() === 'recover'}>
          <div>
            <h2 class="text-2xl font-bold mb-2 text-center">{t('ONBOARDING_RECOVER_IDENTITY')}</h2>
            <p class="text-[var(--text-secondary)] text-sm mb-4 text-center">{t('ONBOARDING_MNEMONIC_CONFIRM')}</p>
            <textarea
              value={recoverInput()}
              onInput={(e) => setRecoverInput(e.currentTarget.value)}
              rows={3}
              class="w-full p-3 rounded-lg bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none font-mono text-sm resize-none"
              placeholder="word1 word2 word3 ..."
            />
            <Show when={error()}>
              <p class="mt-2 text-[var(--error)] text-sm">{error()}</p>
            </Show>
            <div class="flex gap-3 mt-4">
              <button
                onClick={() => {
                  setStep('welcome')
                  setError('')
                }}
                class="flex-1 py-3 px-6 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--border)] text-[var(--text-primary)] font-semibold transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={handleRecover}
                disabled={loading()}
                class="flex-1 py-3 px-6 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold transition-colors disabled:opacity-50"
              >
                {loading() ? t('LOADING') : t('ONBOARDING_RECOVER_IDENTITY')}
              </button>
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}
