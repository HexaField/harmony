import { createSignal, For, Show, onMount, onCleanup, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { t } from '../i18n/strings.js'
import { createCryptoProvider } from '@harmony/crypto'
import { IdentityManager } from '@harmony/identity'
import { initiateRecovery, RECOVERY_FEATURES } from '../services/recovery.js'
import { openExternal } from '../utils/open-external.js'
import { MigrationWizard } from './MigrationWizard.tsx'
// HarmonyClient is now managed by the store

type OnboardingStep =
  | 'welcome'
  | 'mnemonic-display'
  | 'mnemonic-confirm'
  | 'recover'
  | 'setup'
  | 'discord-migrate'
  | 'portal-login'

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

export const OnboardingView: Component<{ startAtSetup?: boolean }> = (props) => {
  const store = useAppStore()
  const [step, _setStep] = createSignal<OnboardingStep>(props.startAtSetup ? 'setup' : 'welcome')
  const [generatedMnemonic, setGeneratedMnemonic] = createSignal('')
  const [recoverInput, setRecoverInput] = createSignal('')
  const [recoverMode, setRecoverMode] = createSignal<'mnemonic' | 'social'>('mnemonic')
  const [socialRecoveryDid, setSocialRecoveryDid] = createSignal('')
  const [socialRecoveryRequestId, setSocialRecoveryRequestId] = createSignal('')
  const [socialRecoveryStatus, setSocialRecoveryStatus] = createSignal<{
    approvalsCount: number
    threshold: number
    thresholdMet: boolean
  } | null>(null)
  const [error, setError] = createSignal('')
  const [loading, setLoading] = createSignal(false)
  const [copied, setCopied] = createSignal(false)

  // Setup step state
  const [setupName, setSetupName] = createSignal('')
  const [discordLinked, setDiscordLinked] = createSignal(false)
  const [discordUsername, setDiscordUsername] = createSignal('')
  const [portalUrl] = createSignal((import.meta as any).env?.VITE_PORTAL_URL || 'http://localhost:3000')
  const [portalWaiting, setPortalWaiting] = createSignal(false)

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
    // If we're explicitly starting at setup, don't restore prior state
    if (props.startAtSetup) return

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

  // Listen for OAuth completion from popup window or desktop deep link
  function handleOAuthResult(data: any) {
    if (data?.type === 'harmony:oauth-complete' && data.provider === 'discord') {
      setDiscordLinked(true)
      if (data.discordUsername) {
        setDiscordUsername(data.discordUsername)
        // Auto-fill display name if empty
        if (!setupName().trim()) setSetupName(data.discordUsername)
      }
      // Deduplication: if the Discord account was already linked to a different DID,
      // the portal returns existingDID — auto-recover that identity
      if (data.existingDID && data.existingDID !== store.did()) {
        handleDedup(data.existingDID)
      }
    }
  }
  function handleOAuthMessage(event: MessageEvent) {
    handleOAuthResult(event.data)
  }
  onMount(() => {
    window.addEventListener('message', handleOAuthMessage)
    // Desktop: listen for OAuth deep link result via IPC
    const desktop = (window as any).__HARMONY_DESKTOP__
    if (desktop?.onOAuthResult) {
      desktop.onOAuthResult(handleOAuthResult)
    }
    // Check if Discord is already linked (e.g. page refresh after linking)
    checkDiscordLink()
  })
  onCleanup(() => window.removeEventListener('message', handleOAuthMessage))

  async function checkDiscordLink() {
    const did = store.did()
    if (!did) return
    try {
      const portalUrl = (import.meta as any).env?.VITE_PORTAL_URL || 'http://localhost:3000'
      const res = await fetch(`${portalUrl}/api/identity/${encodeURIComponent(did)}/discord-profile`)
      if (res.ok) {
        const data = await res.json()
        if (data?.username) {
          setDiscordLinked(true)
          setDiscordUsername(data.username)
        }
      }
    } catch {
      // Portal unavailable — no problem
    }
  }

  let oauthPollTimer: ReturnType<typeof setInterval> | undefined
  onCleanup(() => {
    if (oauthPollTimer) clearInterval(oauthPollTimer)
  })

  function startOAuthPolling(portalUrl: string, did: string) {
    if (oauthPollTimer) clearInterval(oauthPollTimer)
    let attempts = 0
    oauthPollTimer = setInterval(async () => {
      attempts++
      if (attempts > 60) {
        // 2 minutes max
        clearInterval(oauthPollTimer!)
        oauthPollTimer = undefined
        return
      }
      try {
        const res = await fetch(`${portalUrl}/api/oauth/result/${encodeURIComponent(did)}`)
        if (res.ok) {
          const data = await res.json()
          if (data.complete) {
            clearInterval(oauthPollTimer!)
            oauthPollTimer = undefined
            handleOAuthResult(data)
          }
        }
      } catch {
        // Portal unreachable — keep trying
      }
    }, 2000)
  }

  async function handleDedup(existingDID: string) {
    // The user's Discord account is already linked to an existing Harmony identity.
    // Fetch that identity's mnemonic hint or prompt recovery — for now, if we have the
    // existing DID's mnemonic in localStorage (same device), auto-switch to it.
    const storedMnemonic = (() => {
      try {
        return localStorage.getItem('harmony:mnemonic')
      } catch {
        return null
      }
    })()

    if (storedMnemonic) {
      try {
        const crypto = createCryptoProvider()
        const idMgr = new IdentityManager(crypto)
        const result = await idMgr.createFromMnemonic(storedMnemonic)
        if (result.identity.did === existingDID) {
          // Same mnemonic → same identity, auto-login
          store.setDid(existingDID)
          store.setMnemonic(storedMnemonic)
          store.setIdentity(result.identity)
          store.setKeyPair(result.keyPair)
          clearOnboardingState()
          await initClientFromStore()
          return
        }
      } catch {
        /* fall through */
      }
    }

    // Different device or mnemonic not available — tell the user
    setError(t('SETUP_DEDUP_EXISTING', { did: existingDID }))
  }

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
    // Transition to setup step instead of ending onboarding
    setStep('setup')
  }

  function finishSetup() {
    const name = setupName().trim()
    if (name) {
      store.setDisplayName(name)
    }
    // needsSetup() will now be false → App.tsx will show MainLayout
  }

  function skipSetup() {
    // Set a display name to mark setup as complete
    store.setDisplayName(setupName().trim() || store.displayName() || 'Anonymous')
    // needsSetup() will now be false → App.tsx will show MainLayout
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
      // Recovery means existing user — set a default display name to skip setup
      // The server will provide the real display name via community.info
      if (!store.displayName()) {
        store.setDisplayName(result.identity.did.slice(-8))
      }
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
            <p class="text-[var(--text-secondary)] mb-8">{t('ONBOARDING_WELCOME_DESC')}</p>
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

              {/* Divider */}
              <div class="flex items-center gap-3 py-2">
                <div class="flex-1 h-px bg-[var(--border)]" />
                <span class="text-xs text-[var(--text-muted)] uppercase">{t('ONBOARDING_OR_DIVIDER')}</span>
                <div class="flex-1 h-px bg-[var(--border)]" />
              </div>

              {/* Discord migration */}
              <button
                onClick={() => setStep('discord-migrate')}
                class="w-full py-3 px-6 rounded-lg bg-[#5865F2]/20 hover:bg-[#5865F2]/30 border border-[#5865F2]/30 text-[var(--text-primary)] font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <svg width="20" height="15" viewBox="0 0 71 55" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M60.1 4.9A58.5 58.5 0 0 0 45.4.2a.2.2 0 0 0-.2.1 40.7 40.7 0 0 0-1.8 3.7 54 54 0 0 0-16.2 0A26.4 26.4 0 0 0 25.4.3a.2.2 0 0 0-.2-.1A58.3 58.3 0 0 0 10.5 5a.2.2 0 0 0-.1 0A60.1 60.1 0 0 0 .1 45a.2.2 0 0 0 .1.2 58.8 58.8 0 0 0 17.7 9 .2.2 0 0 0 .3-.1 42 42 0 0 0 3.6-5.9.2.2 0 0 0-.1-.3 38.8 38.8 0 0 1-5.5-2.6.2.2 0 0 1 0-.4c.4-.3.7-.6 1.1-.8a.2.2 0 0 1 .2 0 42 42 0 0 0 35.6 0 .2.2 0 0 1 .2 0l1 .9a.2.2 0 0 1 0 .3 36.4 36.4 0 0 1-5.5 2.6.2.2 0 0 0-.1.4 47.1 47.1 0 0 0 3.6 5.8.2.2 0 0 0 .3.1A58.6 58.6 0 0 0 70.5 45a.2.2 0 0 0 .1-.2 59.7 59.7 0 0 0-10.5-40z M23.7 36.8c-3.5 0-6.3-3.2-6.3-7s2.8-7 6.3-7 6.4 3.2 6.3 7-2.8 7-6.3 7zm23.2 0c-3.5 0-6.3-3.2-6.3-7s2.8-7 6.3-7 6.4 3.2 6.3 7-2.8 7-6.3 7z" />
                </svg>
                {t('ONBOARDING_IMPORT_DISCORD')}
              </button>

              {/* Portal sign-in */}
              <button
                onClick={() => setStep('portal-login')}
                class="w-full py-3 px-6 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--border)] border border-[var(--border)] text-[var(--text-primary)] font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <span>🌐</span>
                {t('ONBOARDING_SIGN_IN_PORTAL')}
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

            {/* Recovery mode tabs */}
            <div class="flex gap-2 mb-4">
              <button
                onClick={() => setRecoverMode('mnemonic')}
                class="flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-colors"
                classList={{
                  'bg-[var(--accent)] text-white': recoverMode() === 'mnemonic',
                  'bg-[var(--bg-input)] text-[var(--text-muted)] hover:bg-[var(--border)]': recoverMode() !== 'mnemonic'
                }}
              >
                {t('RECOVERY_VIA_MNEMONIC')}
              </button>
              <button
                onClick={() => setRecoverMode('social')}
                class="flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-colors"
                classList={{
                  'bg-[var(--accent)] text-white': recoverMode() === 'social',
                  'bg-[var(--bg-input)] text-[var(--text-muted)] hover:bg-[var(--border)]': recoverMode() !== 'social'
                }}
              >
                {t('RECOVERY_VIA_CONTACTS')}
              </button>
            </div>

            {/* Mnemonic recovery */}
            <Show when={recoverMode() === 'mnemonic'}>
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
            </Show>

            {/* Social recovery */}
            <Show when={recoverMode() === 'social'}>
              <Show
                when={!socialRecoveryRequestId()}
                fallback={
                  <div class="space-y-4">
                    <div class="bg-[var(--bg-input)] p-4 rounded-lg">
                      <p class="text-xs text-[var(--text-muted)] mb-1">{t('RECOVERY_REQUEST_ID')}</p>
                      <p class="font-mono text-sm break-all">{socialRecoveryRequestId()}</p>
                    </div>
                    <p class="text-sm text-[var(--text-secondary)]">{t('RECOVERY_SHARE_INSTRUCTIONS')}</p>
                    <Show when={socialRecoveryStatus()}>
                      <p class="text-sm text-[var(--text-muted)]">
                        {t('RECOVERY_APPROVALS', {
                          count: socialRecoveryStatus()!.approvalsCount,
                          threshold: socialRecoveryStatus()!.threshold
                        })}
                      </p>
                    </Show>
                    <Show when={socialRecoveryStatus()?.thresholdMet}>
                      <Show
                        when={RECOVERY_FEATURES.complete}
                        fallback={
                          <div class="w-full py-3 px-6 rounded-lg bg-[var(--bg-input)] text-center">
                            <p class="text-sm text-[var(--text-muted)]">
                              Recovery completion requires server coordination — coming in a future update.
                            </p>
                          </div>
                        }
                      >
                        <button
                          onClick={async () => {
                            setLoading(true)
                            try {
                              setError('Social recovery completion not yet connected to backend')
                            } finally {
                              setLoading(false)
                            }
                          }}
                          class="w-full py-3 px-6 rounded-lg bg-green-600 hover:bg-green-500 text-white font-semibold transition-colors"
                        >
                          {t('RECOVERY_COMPLETE')}
                        </button>
                      </Show>
                    </Show>
                    <Show when={!socialRecoveryStatus()?.thresholdMet}>
                      <Show
                        when={RECOVERY_FEATURES.statusCheck}
                        fallback={
                          <div class="w-full py-3 px-6 rounded-lg bg-[var(--bg-input)] text-center">
                            <p class="text-sm text-[var(--text-muted)]">
                              Status checking requires server relay — coming in a future update.
                            </p>
                            <p class="text-xs text-[var(--text-muted)] mt-1">
                              Share your request ID with your trusted contacts:{' '}
                              <span class="font-mono text-[var(--accent)]">{socialRecoveryRequestId()}</span>
                            </p>
                          </div>
                        }
                      >
                        <button
                          onClick={async () => {
                            setSocialRecoveryStatus({
                              approvalsCount: 0,
                              threshold: 2,
                              thresholdMet: false
                            })
                          }}
                          class="w-full py-3 px-6 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--border)] text-[var(--text-primary)] font-semibold transition-colors"
                        >
                          {t('RECOVERY_CHECK_STATUS')}
                        </button>
                      </Show>
                    </Show>
                    <button
                      onClick={() => {
                        setStep('welcome')
                        setSocialRecoveryRequestId('')
                        setSocialRecoveryStatus(null)
                      }}
                      class="w-full py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                      {t('ONBOARDING_BACK')}
                    </button>
                  </div>
                }
              >
                <div class="space-y-4">
                  <div>
                    <label class="text-sm text-[var(--text-muted)] block mb-1">{t('RECOVERY_ENTER_DID')}</label>
                    <input
                      type="text"
                      value={socialRecoveryDid()}
                      onInput={(e) => setSocialRecoveryDid(e.currentTarget.value)}
                      placeholder="did:key:z..."
                      class="w-full p-3 rounded-lg bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none font-mono text-sm"
                    />
                  </div>
                  <Show when={error()}>
                    <p class="text-[var(--error)] text-sm">{error()}</p>
                  </Show>
                  <div class="flex gap-3">
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
                      onClick={async () => {
                        if (!socialRecoveryDid().trim()) return
                        setLoading(true)
                        setError('')
                        try {
                          const result = await initiateRecovery({
                            claimedDID: socialRecoveryDid().trim(),
                            recovererDID: 'did:key:z' + Date.now().toString(36) // temp DID for unauthed user
                          })
                          if (!result.ok) {
                            setError(result.error!)
                            return
                          }
                          setSocialRecoveryRequestId(result.data!.requestId)
                        } catch (err) {
                          setError(String(err))
                        } finally {
                          setLoading(false)
                        }
                      }}
                      disabled={loading() || !socialRecoveryDid().trim()}
                      class="flex-1 py-3 px-6 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold transition-colors disabled:opacity-50"
                    >
                      {loading() ? t('LOADING') : t('RECOVERY_INITIATE')}
                    </button>
                  </div>
                </div>
              </Show>
            </Show>
          </div>
        </Show>
        {/* Setup — post-identity profile & community setup */}
        <Show when={step() === 'setup'}>
          <div>
            <h2 class="text-2xl font-bold mb-2 text-center">{t('SETUP_TITLE')}</h2>

            {/* Display name (required) */}
            <div class="mb-6">
              <label class="text-sm text-[var(--text-secondary)] mb-1 block">{t('SETUP_DISPLAY_NAME_LABEL')}</label>
              <input
                type="text"
                value={setupName()}
                onInput={(e) => setSetupName(e.currentTarget.value)}
                class="w-full p-3 rounded-lg bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none text-sm"
                placeholder={t('SETUP_DISPLAY_NAME_PLACEHOLDER')}
                autofocus
              />
            </div>

            {/* Discord linking (optional) */}
            <div class="mb-6">
              <Show
                when={discordLinked()}
                fallback={
                  <div class="flex items-center justify-between">
                    <span class="text-sm text-[var(--text-muted)]">{t('SETUP_DISCORD_NOT_LINKED')}</span>
                    <button
                      onClick={async () => {
                        const portalUrl = (import.meta as any).env?.VITE_PORTAL_URL || 'http://localhost:3000'
                        const did = store.did()
                        if (!portalUrl || !did) return
                        try {
                          const res = await fetch(`${portalUrl}/api/identity/link`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              provider: 'discord',
                              userDID: did,
                              source: (window as any).__HARMONY_DESKTOP__ ? 'desktop' : 'browser'
                            })
                          })
                          const data = await res.json()
                          if (data.redirectUrl) {
                            openExternal(data.redirectUrl)
                            // Poll portal for OAuth completion
                            startOAuthPolling(portalUrl, did)
                          }
                        } catch (err) {
                          console.error('Discord link failed:', err)
                          setError(String(err))
                        }
                      }}
                      class="py-2 px-4 rounded-lg bg-[#5865F2]/20 hover:bg-[#5865F2]/30 border border-[#5865F2]/30 text-[var(--text-primary)] text-sm font-semibold transition-colors"
                    >
                      {t('SETUP_LINK_DISCORD')}
                    </button>
                  </div>
                }
              >
                <p class="text-sm text-green-400">✓ {t('SETUP_DISCORD_LINKED', { username: discordUsername() })}</p>
              </Show>
            </div>

            <Show when={error()}>
              <p class="mb-4 text-[var(--error)] text-sm">{error()}</p>
            </Show>

            {/* Continue button (requires display name) */}
            <button
              onClick={finishSetup}
              disabled={!setupName().trim()}
              class="w-full py-3 px-6 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold transition-colors disabled:opacity-50 mb-4"
            >
              {t('SETUP_CONTINUE')}
            </button>

            {/* Skip link */}
            <button
              onClick={skipSetup}
              class="w-full text-center text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors mt-4"
            >
              {t('SETUP_SKIP')}
            </button>
          </div>
        </Show>

        {/* Discord Migration — creates identity then opens migration wizard */}
        <Show when={step() === 'discord-migrate'}>
          <div>
            <h2 class="text-2xl font-bold mb-2 text-center">{t('ONBOARDING_IMPORT_DISCORD')}</h2>
            <p class="text-[var(--text-secondary)] text-sm mb-6 text-center">{t('ONBOARDING_IMPORT_DISCORD_DESC')}</p>

            <div class="space-y-4">
              {/* Step 1: Create identity first (if not already created) */}
              <Show when={!store.isOnboarded()}>
                <div class="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg p-4">
                  <p class="text-sm text-[var(--text-secondary)] mb-3">
                    First, we'll create your Harmony identity. This is your sovereign key — no email, no password, no
                    server controls it.
                  </p>
                  <button
                    onClick={async () => {
                      await handleCreate()
                      // After create, skip straight to mnemonic display — migration continues after setup
                    }}
                    disabled={loading()}
                    class="w-full py-3 px-6 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold transition-colors disabled:opacity-50"
                  >
                    {loading() ? t('LOADING') : t('ONBOARDING_CREATE_IDENTITY')}
                  </button>
                </div>
              </Show>

              {/* If identity exists, show migration wizard inline */}
              <Show when={store.isOnboarded()}>
                <MigrationWizard initialStep="hosting" onClose={() => setStep('welcome')} />
              </Show>

              <Show when={error()}>
                <p class="text-[var(--error)] text-sm">{error()}</p>
              </Show>

              <button
                onClick={() => {
                  setStep('welcome')
                  setError('')
                }}
                class="w-full text-center text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                {t('ONBOARDING_BACK')}
              </button>
            </div>
          </div>
        </Show>

        {/* Portal Sign-in — authenticate via portal OAuth, recover identity */}
        <Show when={step() === 'portal-login'}>
          <div>
            <h2 class="text-2xl font-bold mb-2 text-center">{t('ONBOARDING_SIGN_IN_PORTAL')}</h2>
            <p class="text-[var(--text-secondary)] text-sm mb-6 text-center">{t('ONBOARDING_SIGN_IN_PORTAL_DESC')}</p>

            <div class="space-y-4">
              {/* Sign in with Discord through portal */}
              <button
                onClick={async () => {
                  setLoading(true)
                  setError('')
                  try {
                    // First create a temporary identity
                    const crypto = createCryptoProvider()
                    const idMgr = new IdentityManager(crypto)
                    const result = await idMgr.create()

                    // Store it temporarily
                    pendingIdentity = result.identity
                    pendingKeyPair = result.keyPair
                    pendingMnemonic = result.mnemonic

                    // Open Discord OAuth directly via portal
                    const url = portalUrl().replace(/\/$/, '')
                    const oauthUrl = `${url}/api/oauth/discord/authorize?userDID=${encodeURIComponent(result.identity.did)}`
                    openExternal(oauthUrl)

                    // Start polling for completion
                    startOAuthPolling(url, result.identity.did)
                    setPortalWaiting(true)

                    // Commit identity to store so OAuth completion handler works
                    store.setDid(result.identity.did)
                    store.setMnemonic(result.mnemonic)
                    store.setIdentity(result.identity)
                    store.setKeyPair(result.keyPair)
                  } catch (err) {
                    setError(err instanceof Error ? err.message : String(err))
                  } finally {
                    setLoading(false)
                  }
                }}
                disabled={loading() || portalWaiting()}
                class="w-full py-3 px-6 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] text-white font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Show when={!portalWaiting()} fallback={<span>Waiting for Discord login...</span>}>
                  <svg
                    width="20"
                    height="15"
                    viewBox="0 0 71 55"
                    fill="currentColor"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M60.1 4.9A58.5 58.5 0 0 0 45.4.2a.2.2 0 0 0-.2.1 40.7 40.7 0 0 0-1.8 3.7 54 54 0 0 0-16.2 0A26.4 26.4 0 0 0 25.4.3a.2.2 0 0 0-.2-.1A58.3 58.3 0 0 0 10.5 5a.2.2 0 0 0-.1 0A60.1 60.1 0 0 0 .1 45a.2.2 0 0 0 .1.2 58.8 58.8 0 0 0 17.7 9 .2.2 0 0 0 .3-.1 42 42 0 0 0 3.6-5.9.2.2 0 0 0-.1-.3 38.8 38.8 0 0 1-5.5-2.6.2.2 0 0 1 0-.4c.4-.3.7-.6 1.1-.8a.2.2 0 0 1 .2 0 42 42 0 0 0 35.6 0 .2.2 0 0 1 .2 0l1 .9a.2.2 0 0 1 0 .3 36.4 36.4 0 0 1-5.5 2.6.2.2 0 0 0-.1.4 47.1 47.1 0 0 0 3.6 5.8.2.2 0 0 0 .3.1A58.6 58.6 0 0 0 70.5 45a.2.2 0 0 0 .1-.2 59.7 59.7 0 0 0-10.5-40z M23.7 36.8c-3.5 0-6.3-3.2-6.3-7s2.8-7 6.3-7 6.4 3.2 6.3 7-2.8 7-6.3 7zm23.2 0c-3.5 0-6.3-3.2-6.3-7s2.8-7 6.3-7 6.4 3.2 6.3 7-2.8 7-6.3 7z" />
                  </svg>
                  Sign in with Discord
                </Show>
              </button>

              {/* Show success when Discord linked */}
              <Show when={discordLinked()}>
                <div class="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-center">
                  <p class="text-green-400 font-semibold">
                    ✓ {t('SETUP_DISCORD_LINKED', { username: discordUsername() })}
                  </p>
                  <p class="text-sm text-[var(--text-muted)] mt-2">Your identity has been created and linked.</p>
                  <button
                    onClick={() => {
                      setGeneratedMnemonic(pendingMnemonic)
                      setStep('mnemonic-display')
                    }}
                    class="mt-3 py-2 px-6 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold transition-colors"
                  >
                    Continue
                  </button>
                </div>
              </Show>

              {/* Recover with mnemonic */}
              <div class="flex items-center gap-3 py-1">
                <div class="flex-1 h-px bg-[var(--border)]" />
                <span class="text-xs text-[var(--text-muted)] uppercase">{t('ONBOARDING_OR_DIVIDER')}</span>
                <div class="flex-1 h-px bg-[var(--border)]" />
              </div>

              <button
                onClick={() => setStep('recover')}
                class="w-full py-2 px-6 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--border)] text-[var(--text-primary)] text-sm font-semibold transition-colors"
              >
                {t('ONBOARDING_RECOVER_IDENTITY')}
              </button>

              <Show when={error()}>
                <p class="text-[var(--error)] text-sm text-center">{error()}</p>
              </Show>

              <button
                onClick={() => {
                  setStep('welcome')
                  setError('')
                  setPortalWaiting(false)
                }}
                class="w-full text-center text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                {t('ONBOARDING_BACK')}
              </button>
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}
