import { createSignal, For, Show, onMount, onCleanup, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { t } from '../i18n/strings.js'
import { createCryptoProvider } from '@harmony/crypto'
import { IdentityManager } from '@harmony/identity'
import { openExternal } from '../utils/open-external.js'
// HarmonyClient is now managed by the store

type OnboardingStep = 'welcome' | 'mnemonic-display' | 'mnemonic-confirm' | 'recover' | 'setup'

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
                      <button
                        onClick={async () => {
                          // TODO: POST /recovery/complete
                          setLoading(true)
                          try {
                            // Complete recovery when cloud API available
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
                    <Show when={!socialRecoveryStatus()?.thresholdMet}>
                      <button
                        onClick={async () => {
                          // TODO: GET /recovery/:requestId/status
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
                          // TODO: POST /recovery/initiate
                          const requestId = `recovery-${Date.now()}`
                          setSocialRecoveryRequestId(requestId)
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
      </div>
    </div>
  )
}
