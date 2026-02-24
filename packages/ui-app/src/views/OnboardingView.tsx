import { createSignal, For, Show, onMount, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { t } from '../i18n/strings.js'
import { createCryptoProvider } from '@harmony/crypto'
import { IdentityManager } from '@harmony/identity'
// HarmonyClient is now managed by the store

type OnboardingStep = 'welcome' | 'mnemonic-display' | 'mnemonic-confirm' | 'recover'

const STORAGE_PREFIX = 'harmony:'

function persistOnboarding(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(STORAGE_PREFIX + 'onboarding:' + key)
    else localStorage.setItem(STORAGE_PREFIX + 'onboarding:' + key, value)
  } catch {
    /* quota / SSR */
  }
}

function restoreOnboarding(key: string): string | null {
  try {
    return localStorage.getItem(STORAGE_PREFIX + 'onboarding:' + key)
  } catch {
    return null
  }
}

function clearOnboardingState() {
  try {
    for (const key of ['step', 'mnemonic']) {
      localStorage.removeItem(STORAGE_PREFIX + 'onboarding:' + key)
    }
  } catch {
    /* SSR */
  }
}

export const OnboardingView: Component = () => {
  const store = useAppStore()
  const [step, _setStep] = createSignal<OnboardingStep>('welcome')
  const [generatedMnemonic, setGeneratedMnemonic] = createSignal('')
  const [recoverInput, setRecoverInput] = createSignal('')
  const [error, setError] = createSignal('')
  const [loading, setLoading] = createSignal(false)
  const [copied, setCopied] = createSignal(false)

  // Confirmation quiz state
  const [quizIndices, setQuizIndices] = createSignal<number[]>([])
  const [quizAnswers, setQuizAnswers] = createSignal<Record<number, string>>({})
  const [quizError, setQuizError] = createSignal(false)

  // Pending identity — not committed to store until mnemonic backup confirmed
  let pendingIdentity: import('@harmony/identity').Identity | null = null
  let pendingKeyPair: import('@harmony/crypto').KeyPair | null = null
  let pendingMnemonic = ''

  // Persisted step setter
  const setStep = (s: OnboardingStep) => {
    _setStep(s)
    persistOnboarding('step', s)
  }

  // Restore onboarding state on mount
  onMount(async () => {
    const savedStep = restoreOnboarding('step') as OnboardingStep | null
    const savedMnemonic = restoreOnboarding('mnemonic')

    if (savedMnemonic && savedStep && savedStep !== 'welcome') {
      // Re-derive identity from saved mnemonic
      try {
        const crypto = createCryptoProvider()
        const idMgr = new IdentityManager(crypto)
        const result = await idMgr.createFromMnemonic(savedMnemonic)
        pendingIdentity = result.identity
        pendingKeyPair = result.keyPair
        pendingMnemonic = savedMnemonic
        setGeneratedMnemonic(savedMnemonic)

        if (savedStep === 'mnemonic-confirm') {
          const indices = pickQuizIndices()
          setQuizIndices(indices)
          setQuizAnswers({})
          _setStep('mnemonic-confirm')
        } else {
          _setStep(savedStep)
        }
      } catch {
        // Corrupted state — start fresh
        clearOnboardingState()
      }
    } else if (savedStep) {
      _setStep(savedStep)
    }
  })

  async function initClientFromStore() {
    const id = store.identity()
    const kp = store.keyPair()
    if (id && kp) {
      await store.initClient(id, kp)
    }
  }

  function pickQuizIndices(): number[] {
    const indices: number[] = []
    while (indices.length < 3) {
      const idx = Math.floor(Math.random() * 12)
      if (!indices.includes(idx)) indices.push(idx)
    }
    return indices.sort((a, b) => a - b)
  }

  async function handleCreate() {
    setLoading(true)
    setError('')
    try {
      const crypto = createCryptoProvider()
      const idMgr = new IdentityManager(crypto)
      const result = await idMgr.create()
      setGeneratedMnemonic(result.mnemonic)
      // Store locally — don't commit to app store yet (would trigger isOnboarded)
      pendingIdentity = result.identity
      pendingKeyPair = result.keyPair
      pendingMnemonic = result.mnemonic
      persistOnboarding('mnemonic', result.mnemonic)
      setStep('mnemonic-display')
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  function handleMnemonicSaved() {
    const indices = pickQuizIndices()
    setQuizIndices(indices)
    setQuizAnswers({})
    setQuizError(false)
    setStep('mnemonic-confirm')
  }

  function handleVerify() {
    const words = generatedMnemonic().split(/\s+/)
    const answers = quizAnswers()
    const allCorrect = quizIndices().every((idx) => answers[idx]?.trim().toLowerCase() === words[idx].toLowerCase())
    if (allCorrect) {
      finishOnboarding()
    } else {
      setQuizError(true)
    }
  }

  function finishOnboarding() {
    if (pendingIdentity && pendingKeyPair) {
      store.setDid(pendingIdentity.did)
      store.setMnemonic(pendingMnemonic)
      store.setIdentity(pendingIdentity)
      store.setKeyPair(pendingKeyPair)
    }
    clearOnboardingState()
    initClientFromStore()
    // Identity is now set in store — App.tsx will show MainLayout
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(generatedMnemonic())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
    }
  }

  async function handleRecover() {
    setLoading(true)
    setError('')
    try {
      const words = recoverInput().trim()
      if (words.split(/\s+/).length !== 12) {
        setError(t('ONBOARDING_RECOVER_INVALID'))
        setLoading(false)
        return
      }
      const crypto = createCryptoProvider()
      const idMgr = new IdentityManager(crypto)
      const result = await idMgr.createFromMnemonic(words)
      store.setDid(result.identity.did)
      store.setMnemonic(words)
      store.setIdentity(result.identity)
      store.setKeyPair(result.keyPair)
      clearOnboardingState()
      initClientFromStore()
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const mnemonicWords = () => generatedMnemonic().split(/\s+/)

  return (
    <div class="flex items-center justify-center h-screen bg-[var(--bg-primary)]">
      <div class="max-w-md w-full mx-4 p-8 rounded-2xl bg-[var(--bg-surface)] shadow-2xl">
        {/* Step 1: Welcome */}
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

        {/* Step 2: Mnemonic Display */}
        <Show when={step() === 'mnemonic-display'}>
          <div class="text-center">
            <h2 class="text-2xl font-bold mb-2">{t('ONBOARDING_MNEMONIC_BACKUP')}</h2>
            <div class="bg-[var(--error)]/10 border border-[var(--error)]/30 rounded-lg p-3 mb-4">
              <p class="text-sm text-[var(--error)]">⚠️ {t('ONBOARDING_MNEMONIC_WARNING')}</p>
            </div>
            <div class="grid grid-cols-4 gap-2 mb-4">
              <For each={mnemonicWords()}>
                {(word, idx) => (
                  <div class="bg-[var(--bg-input)] rounded-lg px-2 py-2 text-sm">
                    <span class="text-[var(--text-muted)] text-xs mr-1">{idx() + 1}.</span>
                    <span class="font-mono">{word}</span>
                  </div>
                )}
              </For>
            </div>
            <button
              onClick={handleCopy}
              class="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-4 transition-colors"
            >
              {copied() ? `✓ ${t('ONBOARDING_MNEMONIC_COPIED')}` : `📋 ${t('ONBOARDING_MNEMONIC_COPY')}`}
            </button>
            <p class="text-xs text-[var(--text-muted)] mb-6">
              {t('IDENTITY_LABEL')}: <span class="font-semibold">{store.displayName() || t('IDENTITY_ANONYMOUS')}</span>
            </p>
            <button
              onClick={handleMnemonicSaved}
              class="w-full py-3 px-6 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold transition-colors"
            >
              {t('ONBOARDING_MNEMONIC_SAVED')}
            </button>
          </div>
        </Show>

        {/* Step 3: Mnemonic Confirmation */}
        <Show when={step() === 'mnemonic-confirm'}>
          <div>
            <h2 class="text-2xl font-bold mb-2 text-center">{t('ONBOARDING_MNEMONIC_VERIFY_TITLE')}</h2>
            <p class="text-[var(--text-secondary)] text-sm mb-6 text-center">{t('ONBOARDING_MNEMONIC_CONFIRM')}</p>
            <div class="space-y-4 mb-6">
              <For each={quizIndices()}>
                {(idx) => (
                  <div>
                    <label class="text-sm text-[var(--text-muted)] mb-1 block">
                      {t('ONBOARDING_MNEMONIC_VERIFY_PROMPT', { position: String(idx + 1) })}
                    </label>
                    <input
                      type="text"
                      value={quizAnswers()[idx] || ''}
                      onInput={(e) => setQuizAnswers((prev) => ({ ...prev, [idx]: e.currentTarget.value }))}
                      class="w-full p-3 rounded-lg bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none font-mono text-sm"
                      autocomplete="off"
                    />
                  </div>
                )}
              </For>
            </div>
            <Show when={quizError()}>
              <p class="text-[var(--error)] text-sm mb-4 text-center">{t('ONBOARDING_MNEMONIC_VERIFY_FAIL')}</p>
            </Show>
            <button
              onClick={handleVerify}
              class="w-full py-3 px-6 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold transition-colors mb-3"
            >
              {t('ONBOARDING_MNEMONIC_VERIFY')}
            </button>
            <button
              onClick={finishOnboarding}
              class="w-full text-center text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
            >
              {t('ONBOARDING_MNEMONIC_SKIP')}
            </button>
          </div>
        </Show>

        {/* Recover */}
        <Show when={step() === 'recover'}>
          <div>
            <h2 class="text-2xl font-bold mb-2 text-center">{t('ONBOARDING_RECOVER_IDENTITY')}</h2>
            <p class="text-[var(--text-secondary)] text-sm mb-4 text-center">{t('ONBOARDING_RECOVER_PROMPT')}</p>
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
                {t('ONBOARDING_BACK')}
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
