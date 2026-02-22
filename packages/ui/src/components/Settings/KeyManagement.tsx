import { createSignal, Show, type JSX } from 'solid-js'

export interface KeyManagementProps {
  mnemonic: string | null
  did: string
  onBackupMnemonic: () => void
  onSetupRecovery: () => void
}

export function KeyManagement(props: KeyManagementProps): JSX.Element {
  const [showMnemonic, setShowMnemonic] = createSignal(false)
  const [copied, setCopied] = createSignal(false)

  const copyDID = async () => {
    await navigator.clipboard.writeText(props.did)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div class="p-6 max-w-lg mx-auto">
      <h2 class="text-xl font-bold text-white mb-6">Key Management</h2>

      <div class="space-y-4">
        {/* DID */}
        <div class="bg-hm-bg-dark rounded-lg p-4">
          <h3 class="text-sm font-semibold text-hm-text mb-2">Your DID</h3>
          <div class="flex items-center gap-2">
            <code class="text-xs text-hm-text-muted flex-1 break-all">{props.did}</code>
            <button
              class="text-sm text-hm-accent hover:text-hm-accent-hover transition-colors shrink-0"
              onClick={copyDID}
            >
              {copied() ? '✓' : '📋'}
            </button>
          </div>
        </div>

        {/* Mnemonic Backup */}
        <div class="bg-hm-bg-dark rounded-lg p-4">
          <h3 class="text-sm font-semibold text-hm-text mb-2">Recovery Phrase</h3>
          <Show when={props.mnemonic} fallback={<p class="text-hm-text-muted text-sm">No mnemonic available</p>}>
            <Show
              when={showMnemonic()}
              fallback={
                <button
                  class="text-sm text-hm-yellow hover:text-hm-yellow/80 transition-colors"
                  onClick={() => setShowMnemonic(true)}
                >
                  🔒 Click to reveal
                </button>
              }
            >
              <p class="text-sm text-white font-mono bg-hm-bg-darkest p-3 rounded break-words">{props.mnemonic}</p>
              <button
                class="mt-2 text-sm text-hm-text-muted hover:text-white transition-colors"
                onClick={() => setShowMnemonic(false)}
              >
                Hide
              </button>
            </Show>
          </Show>
        </div>

        {/* Actions */}
        <div class="space-y-2">
          <button
            class="w-full py-2.5 bg-hm-accent hover:bg-hm-accent-hover text-white rounded-md text-sm font-medium transition-colors"
            onClick={() => props.onBackupMnemonic()}
          >
            🔑 Backup Recovery Phrase
          </button>
          <button
            class="w-full py-2.5 bg-hm-bg-dark hover:bg-hm-bg-darker text-hm-text rounded-md text-sm font-medium transition-colors"
            onClick={() => props.onSetupRecovery()}
          >
            👥 Setup Social Recovery
          </button>
        </div>
      </div>
    </div>
  )
}
