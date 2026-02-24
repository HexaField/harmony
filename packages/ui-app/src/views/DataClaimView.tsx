import { createSignal, Show, For, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { t } from '../i18n/strings.js'
import {
  parseDiscordExport,
  type DiscordDataPackage,
  type ParseProgress,
  transformDiscordExportToQuads,
  computeDataMeta,
  deriveStorageKey,
  encryptUserData
} from '@harmony/migration'
import { createCryptoProvider } from '@harmony/crypto'
import { MemoryQuadStore } from '@harmony/quads'

type ClaimStep = 'intro' | 'upload' | 'parsing' | 'preview' | 'encrypting' | 'success'

export const DataClaimView: Component<{ onClose: () => void }> = (props) => {
  const store = useAppStore()
  const [step, setStep] = createSignal<ClaimStep>('intro')
  const [error, setError] = createSignal('')
  const [parseProgress, setParseProgress] = createSignal<ParseProgress | null>(null)
  const [parsedData, setParsedData] = createSignal<DiscordDataPackage | null>(null)
  const [dataMeta, setDataMeta] = createSignal<ReturnType<typeof computeDataMeta> | null>(null)
  const [encryptProgress, setEncryptProgress] = createSignal('')

  const serverUrl = () => import.meta.env.VITE_DEFAULT_SERVER_URL || 'http://localhost:4000'

  async function handleFile(file: File) {
    setError('')
    setStep('parsing')
    try {
      const buffer = await file.arrayBuffer()
      const data = await parseDiscordExport(buffer, (p) => setParseProgress(p))
      setParsedData(data)
      setDataMeta(computeDataMeta(data))
      setStep('preview')
    } catch (err: any) {
      setError(t('DATA_CLAIM_ERROR', { error: err.message || String(err) }))
      setStep('upload')
    }
  }

  function onFileInput(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (file) handleFile(file)
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer?.files[0]
    if (file) handleFile(file)
  }

  async function encryptAndUpload() {
    setError('')
    setStep('encrypting')
    try {
      const data = parsedData()!
      const crypto = createCryptoProvider()

      setEncryptProgress(t('DATA_CLAIM_ENCRYPTING'))

      // Transform to quads
      const quads = transformDiscordExportToQuads(data, store.did())

      // Serialize to N-Quads
      const quadStore = new MemoryQuadStore()
      await quadStore.addAll(quads)
      const nquads = await quadStore.exportNQuads()

      // Derive key from mnemonic and encrypt
      const key = await deriveStorageKey(crypto, store.mnemonic())
      const encrypted = await encryptUserData(crypto, nquads, key)

      setEncryptProgress(t('DATA_CLAIM_UPLOADING'))

      // Upload to server
      const meta = dataMeta()!
      const res = await fetch(`${serverUrl()}/api/user-data/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Harmony-DID': store.did()
        },
        body: JSON.stringify({
          did: store.did(),
          ciphertext: uint8ToBase64(encrypted.ciphertext),
          nonce: uint8ToBase64(encrypted.nonce),
          metadata: {
            ...meta,
            uploadedAt: new Date().toISOString()
          }
        })
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Upload failed' }))
        throw new Error(body.error || `HTTP ${res.status}`)
      }

      store.setHasClaimedData(true)
      store.setClaimedDataMeta(meta)
      setStep('success')
    } catch (err: any) {
      setError(t('DATA_CLAIM_ERROR', { error: err.message || String(err) }))
      setStep('preview')
    }
  }

  return (
    <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div class="max-w-lg w-full mx-4 p-8 rounded-2xl bg-[var(--bg-surface)] shadow-2xl max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-xl font-bold">{t('DATA_CLAIM_TITLE')}</h2>
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
            <p class="text-[var(--text-secondary)]">{t('DATA_CLAIM_INTRO')}</p>
            <div class="p-4 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]">
              <p class="text-sm text-[var(--text-secondary)]">{t('DATA_CLAIM_DISCORD_INSTRUCTIONS')}</p>
              <a
                href="https://discord.com/channels/@me"
                target="_blank"
                rel="noopener noreferrer"
                class="mt-2 inline-block text-[var(--accent)] hover:underline text-sm"
              >
                {t('DATA_CLAIM_DISCORD_LINK')} →
              </a>
            </div>
            <button
              onClick={() => setStep('upload')}
              class="w-full py-3 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold transition-colors"
            >
              {t('DATA_CLAIM_SELECT_FILE')}
            </button>
          </div>
        </Show>

        {/* Step: Upload */}
        <Show when={step() === 'upload'}>
          <div class="space-y-4">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              class="border-2 border-dashed border-[var(--border)] rounded-xl p-12 text-center cursor-pointer hover:border-[var(--accent)] transition-colors"
              onClick={() => document.getElementById('data-claim-file')?.click()}
            >
              <div class="text-4xl mb-3">📂</div>
              <p class="text-[var(--text-secondary)]">{t('DATA_CLAIM_DROP_FILE')}</p>
              <input id="data-claim-file" type="file" accept=".zip" class="hidden" onChange={onFileInput} />
            </div>
            <button
              onClick={() => setStep('intro')}
              class="w-full py-3 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--border)] text-[var(--text-primary)] font-semibold transition-colors"
            >
              {t('ONBOARDING_BACK')}
            </button>
          </div>
        </Show>

        {/* Step: Parsing */}
        <Show when={step() === 'parsing'}>
          <div class="space-y-4 text-center">
            <div class="text-4xl mb-2">🔍</div>
            <h3 class="text-lg font-semibold">{t('DATA_CLAIM_PARSING')}</h3>
            <Show when={parseProgress()}>
              <p class="text-sm text-[var(--text-secondary)]">
                {t('DATA_CLAIM_CHANNELS', { count: String(parseProgress()!.channelsFound) })} ·{' '}
                {t('DATA_CLAIM_MESSAGES', { count: String(parseProgress()!.messagesFound) })}
              </p>
            </Show>
            <div class="flex justify-center mt-4">
              <div class="animate-spin w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full" />
            </div>
          </div>
        </Show>

        {/* Step: Preview */}
        <Show when={step() === 'preview'}>
          <div class="space-y-4">
            <h3 class="text-lg font-semibold">{t('DATA_CLAIM_PREVIEW_TITLE')}</h3>
            <div class="grid grid-cols-3 gap-3">
              <div class="p-3 rounded-lg bg-[var(--bg-input)] text-center">
                <div class="text-2xl font-bold">{dataMeta()?.messageCount.toLocaleString()}</div>
                <div class="text-xs text-[var(--text-muted)]">Messages</div>
              </div>
              <div class="p-3 rounded-lg bg-[var(--bg-input)] text-center">
                <div class="text-2xl font-bold">{dataMeta()?.channelCount}</div>
                <div class="text-xs text-[var(--text-muted)]">Channels</div>
              </div>
              <div class="p-3 rounded-lg bg-[var(--bg-input)] text-center">
                <div class="text-2xl font-bold">{dataMeta()?.serverCount}</div>
                <div class="text-xs text-[var(--text-muted)]">Servers</div>
              </div>
            </div>
            <Show when={dataMeta()?.dateRange}>
              <p class="text-sm text-[var(--text-secondary)]">
                {t('DATA_CLAIM_DATE_RANGE', {
                  from: new Date(dataMeta()!.dateRange!.earliest).toLocaleDateString(),
                  to: new Date(dataMeta()!.dateRange!.latest).toLocaleDateString()
                })}
              </p>
            </Show>

            {/* Channel list preview */}
            <div class="max-h-40 overflow-y-auto space-y-1">
              <For each={parsedData()?.messages.slice(0, 20)}>
                {(ch) => (
                  <div class="flex justify-between text-sm px-2 py-1 rounded bg-[var(--bg-input)]">
                    <span class="text-[var(--text-primary)]">#{ch.channelName || ch.channelId}</span>
                    <span class="text-[var(--text-muted)]">{ch.messages.length}</span>
                  </div>
                )}
              </For>
              <Show when={(parsedData()?.messages.length ?? 0) > 20}>
                <p class="text-xs text-[var(--text-muted)] text-center">
                  ...and {(parsedData()?.messages.length ?? 0) - 20} more channels
                </p>
              </Show>
            </div>

            <div class="flex gap-3">
              <button
                onClick={() => setStep('upload')}
                class="flex-1 py-3 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--border)] text-[var(--text-primary)] font-semibold transition-colors"
              >
                {t('ONBOARDING_BACK')}
              </button>
              <button
                onClick={encryptAndUpload}
                class="flex-1 py-3 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold transition-colors"
              >
                {t('DATA_CLAIM_ENCRYPT_UPLOAD')}
              </button>
            </div>
          </div>
        </Show>

        {/* Step: Encrypting/Uploading */}
        <Show when={step() === 'encrypting'}>
          <div class="space-y-4 text-center">
            <div class="text-4xl mb-2">🔐</div>
            <h3 class="text-lg font-semibold">{encryptProgress()}</h3>
            <div class="flex justify-center mt-4">
              <div class="animate-spin w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full" />
            </div>
          </div>
        </Show>

        {/* Step: Success */}
        <Show when={step() === 'success'}>
          <div class="space-y-4 text-center">
            <div class="text-5xl mb-2">✅</div>
            <h3 class="text-lg font-semibold">{t('DATA_CLAIM_SUCCESS_TITLE')}</h3>
            <p class="text-sm text-[var(--text-secondary)]">{t('DATA_CLAIM_SUCCESS_DESC')}</p>
            <div class="flex gap-3 mt-4">
              <button
                onClick={() => {
                  props.onClose()
                  store.setShowDataBrowser(true)
                }}
                class="flex-1 py-3 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--border)] text-[var(--text-primary)] font-semibold transition-colors"
              >
                {t('DATA_CLAIM_BROWSE')}
              </button>
              <button
                onClick={props.onClose}
                class="flex-1 py-3 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold transition-colors"
              >
                {t('MIGRATION_COMPLETE_CONTINUE')}
              </button>
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}

function uint8ToBase64(arr: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i])
  }
  return btoa(binary)
}
