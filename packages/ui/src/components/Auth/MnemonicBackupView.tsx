import { createSignal, For, type JSX } from 'solid-js'

export interface MnemonicBackupViewProps {
  mnemonic: string
  onConfirm: () => void
  onBack: () => void
}

export function MnemonicBackupView(props: MnemonicBackupViewProps): JSX.Element {
  const [confirmed, setConfirmed] = createSignal(false)
  const [copied, setCopied] = createSignal(false)
  const words = () => props.mnemonic.split(' ')

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(props.mnemonic)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div class="flex items-center justify-center min-h-screen bg-hm-bg-darkest">
      <div class="bg-hm-bg rounded-lg shadow-xl p-8 w-full max-w-md">
        <h2 class="text-xl font-bold text-white mb-2">Backup Your Recovery Phrase</h2>
        <p class="text-hm-text-muted text-sm mb-6">
          Write down these words in order. This is the only way to recover your identity.
        </p>

        <div class="bg-hm-bg-dark rounded-md p-4 mb-4">
          <div class="grid grid-cols-3 gap-2">
            <For each={words()}>
              {(word, i) => (
                <div class="flex items-center gap-1.5 text-sm">
                  <span class="text-hm-text-muted w-5 text-right">{i() + 1}.</span>
                  <span class="text-white font-mono">{word}</span>
                </div>
              )}
            </For>
          </div>
        </div>

        <button
          class="w-full py-2 mb-4 bg-hm-bg-dark hover:bg-hm-bg-darker text-hm-text rounded-md text-sm transition-colors"
          onClick={copyToClipboard}
        >
          {copied() ? '✓ Copied!' : 'Copy to Clipboard'}
        </button>

        <label class="flex items-center gap-2 text-sm text-hm-text mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed()}
            onChange={(e) => setConfirmed(e.currentTarget.checked)}
            class="rounded border-hm-bg-darker"
          />
          I have written down my recovery phrase
        </label>

        <div class="flex gap-3">
          <button
            class="flex-1 py-2.5 bg-hm-bg-dark hover:bg-hm-bg-darker text-hm-text rounded-md font-medium transition-colors"
            onClick={() => props.onBack()}
          >
            Back
          </button>
          <button
            class="flex-1 py-2.5 bg-hm-green hover:bg-hm-green/80 text-white rounded-md font-medium transition-colors disabled:opacity-50"
            disabled={!confirmed()}
            onClick={() => props.onConfirm()}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}
