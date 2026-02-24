import { createSignal, Show, For, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { t } from '../i18n/strings.js'
import { decryptUserData, deriveStorageKey } from '@harmony/migration/src/user-data-encryption.js'
import { createCryptoProvider } from '@harmony/crypto'

interface BrowseMessage {
  id: string
  content: string
  timestamp: string
  channelName: string
}

export const DataBrowserView: Component<{ onClose: () => void }> = (props) => {
  const store = useAppStore()
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal('')
  const [messages, setMessages] = createSignal<BrowseMessage[]>([])
  const [searchQuery, setSearchQuery] = createSignal('')
  const [channelFilter, setChannelFilter] = createSignal('')
  const [allChannels, setAllChannels] = createSignal<string[]>([])
  const [loaded, setLoaded] = createSignal(false)

  const serverUrl = () => import.meta.env.VITE_DEFAULT_SERVER_URL || 'http://localhost:4000'

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${serverUrl()}/api/user-data/${encodeURIComponent(store.did())}`)
      if (!res.ok) {
        if (res.status === 404) {
          setError(t('DATA_BROWSER_NO_DATA'))
          return
        }
        throw new Error(`HTTP ${res.status}`)
      }
      const data = await res.json()

      // Decrypt
      const crypto = createCryptoProvider()
      const key = await deriveStorageKey(crypto, store.mnemonic())
      const nquads = await decryptUserData(
        crypto,
        {
          ciphertext: base64ToUint8(data.ciphertext),
          nonce: base64ToUint8(data.nonce),
          version: 1
        },
        key
      )

      // Parse N-Quads into browseable messages
      const parsed = parseNQuadsToMessages(nquads)
      setMessages(parsed.messages)
      setAllChannels(parsed.channels)
      setLoaded(true)
    } catch (err: any) {
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  // Load on mount
  if (!loaded()) loadData()

  const filteredMessages = () => {
    let msgs = messages()
    const q = searchQuery().toLowerCase()
    if (q) {
      msgs = msgs.filter((m) => m.content.toLowerCase().includes(q))
    }
    const ch = channelFilter()
    if (ch) {
      msgs = msgs.filter((m) => m.channelName === ch)
    }
    return msgs
  }

  async function deleteData() {
    if (!confirm(t('DATA_BROWSER_DELETE_CONFIRM'))) return
    try {
      await fetch(`${serverUrl()}/api/user-data/${encodeURIComponent(store.did())}`, {
        method: 'DELETE',
        headers: { 'X-Harmony-DID': store.did() }
      })
      store.setHasClaimedData(false)
      store.setClaimedDataMeta(null)
      props.onClose()
    } catch (err: any) {
      setError(err.message)
    }
  }

  return (
    <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div class="max-w-2xl w-full mx-4 p-6 rounded-2xl bg-[var(--bg-surface)] shadow-2xl max-h-[90vh] flex flex-col">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold">{t('DATA_BROWSER_TITLE')}</h2>
          <button onClick={props.onClose} class="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl">
            ✕
          </button>
        </div>

        <Show when={error()}>
          <div class="mb-4 p-3 rounded-lg bg-[var(--error)]/20 border border-[var(--error)]/30 text-[var(--error)] text-sm">
            {error()}
          </div>
        </Show>

        <Show when={loading()}>
          <div class="text-center py-12">
            <div class="text-4xl mb-2">🔐</div>
            <p class="text-[var(--text-secondary)]">{t('DATA_BROWSER_DECRYPTING')}</p>
            <div class="flex justify-center mt-4">
              <div class="animate-spin w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full" />
            </div>
          </div>
        </Show>

        <Show when={loaded() && !loading()}>
          {/* Filters */}
          <div class="flex gap-2 mb-4">
            <input
              type="text"
              placeholder={t('DATA_BROWSER_SEARCH')}
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
              class="flex-1 p-2 rounded-lg bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none text-sm"
            />
            <select
              value={channelFilter()}
              onChange={(e) => setChannelFilter(e.currentTarget.value)}
              class="p-2 rounded-lg bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border)] text-sm"
            >
              <option value="">{t('DATA_BROWSER_ALL_CHANNELS')}</option>
              <For each={allChannels()}>{(ch) => <option value={ch}>#{ch}</option>}</For>
            </select>
          </div>

          {/* Message list */}
          <div class="flex-1 overflow-y-auto space-y-1 min-h-0">
            <For each={filteredMessages().slice(0, 200)}>
              {(msg) => (
                <div class="p-2 rounded bg-[var(--bg-input)] text-sm">
                  <div class="flex justify-between text-xs text-[var(--text-muted)] mb-1">
                    <span>#{msg.channelName}</span>
                    <span>{new Date(msg.timestamp).toLocaleString()}</span>
                  </div>
                  <p class="text-[var(--text-primary)]">{msg.content}</p>
                </div>
              )}
            </For>
            <Show when={filteredMessages().length > 200}>
              <p class="text-xs text-center text-[var(--text-muted)] py-2">
                Showing 200 of {filteredMessages().length} messages
              </p>
            </Show>
          </div>

          {/* Footer */}
          <div class="mt-4 pt-4 border-t border-[var(--border)] flex justify-between items-center">
            <p class="text-xs text-[var(--text-muted)]">{messages().length.toLocaleString()} messages total</p>
            <button onClick={deleteData} class="text-sm text-[var(--error)] hover:underline">
              {t('DATA_BROWSER_DELETE')}
            </button>
          </div>
        </Show>
      </div>
    </div>
  )
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/** Parse N-Quads string into a flat message list for browsing */
function parseNQuadsToMessages(nquads: string): { messages: BrowseMessage[]; channels: string[] } {
  const messages: BrowseMessage[] = []
  const channelNames = new Map<string, string>()
  const msgContent = new Map<string, string>()
  const msgTimestamp = new Map<string, string>()
  const msgChannel = new Map<string, string>()
  const msgSubjects = new Set<string>()

  for (const line of nquads.split('\n')) {
    if (!line.trim()) continue
    // Very simple N-Quad parser: <s> <p> <o> <g> .  or <s> <p> "literal" <g> .
    const parts = line.match(/<([^>]+)>\s+<([^>]+)>\s+(?:<([^>]+)>|"([^"]*)"(?:\^\^<[^>]+>)?)\s+<([^>]+)>\s*\./)
    if (!parts) continue

    const [, subject, predicate, objUri, objLiteral] = parts

    if (predicate.endsWith('#type') && objUri?.endsWith('#Message')) {
      msgSubjects.add(subject)
    } else if (predicate.endsWith('#content') && objLiteral !== undefined) {
      msgContent.set(subject, objLiteral)
    } else if (predicate.endsWith('#timestamp') && objLiteral !== undefined) {
      msgTimestamp.set(subject, objLiteral)
    } else if (predicate.endsWith('#inChannel') && objUri) {
      msgChannel.set(subject, objUri)
    } else if (predicate.endsWith('#name') && objLiteral !== undefined) {
      channelNames.set(subject, objLiteral)
    }
  }

  for (const subj of msgSubjects) {
    const content = msgContent.get(subj)
    if (content === undefined) continue
    const channelUri = msgChannel.get(subj) ?? ''
    const channelName = channelNames.get(channelUri) ?? channelUri.split(':').pop() ?? 'unknown'
    messages.push({
      id: subj,
      content,
      timestamp: msgTimestamp.get(subj) ?? '',
      channelName
    })
  }

  // Sort by timestamp
  messages.sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1))

  const channels = [...new Set(messages.map((m) => m.channelName))].sort()

  return { messages, channels }
}
