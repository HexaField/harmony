import { createSignal, Switch, Match, type JSX } from 'solid-js'

export interface ImportWizardProps {
  onImport: (data: { platform: string; token: string; serverId: string }) => void
  onClose: () => void
}

type Step = 'platform' | 'connect' | 'select' | 'importing' | 'done'

export function ImportWizard(props: ImportWizardProps): JSX.Element {
  const [step, setStep] = createSignal<Step>('platform')
  const [platform, setPlatform] = createSignal('discord')
  const [token, setToken] = createSignal('')
  const [serverId, setServerId] = createSignal('')

  const handleImport = () => {
    setStep('importing')
    props.onImport({ platform: platform(), token: token(), serverId: serverId() })
    setTimeout(() => setStep('done'), 2000)
  }

  return (
    <div class="p-6 max-w-lg mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-xl font-bold text-white">Import Data</h2>
        <button class="text-hm-text-muted hover:text-white transition-colors" onClick={() => props.onClose()}>
          ✕
        </button>
      </div>

      {/* Progress */}
      <div class="flex gap-2 mb-6">
        {(['platform', 'connect', 'select', 'importing'] as Step[]).map((s, i) => (
          <div
            class={`h-1 flex-1 rounded ${step() === s || ['platform', 'connect', 'select', 'importing', 'done'].indexOf(step()) > i ? 'bg-hm-accent' : 'bg-hm-bg-darker'}`}
          />
        ))}
      </div>

      <Switch>
        <Match when={step() === 'platform'}>
          <p class="text-hm-text text-sm mb-4">Choose the platform to import from:</p>
          <div class="space-y-2">
            <button
              class="w-full p-3 bg-[#5865F2]/20 border border-[#5865F2]/30 rounded-lg text-left hover:bg-[#5865F2]/30 transition-colors"
              onClick={() => {
                setPlatform('discord')
                setStep('connect')
              }}
            >
              <span class="text-white font-medium">🎮 Discord</span>
              <span class="text-hm-text-muted text-xs block mt-0.5">Import servers, channels, and roles</span>
            </button>
          </div>
        </Match>

        <Match when={step() === 'connect'}>
          <p class="text-hm-text text-sm mb-4">Connect to your {platform()} account:</p>
          <input
            class="w-full bg-hm-bg-dark text-hm-text rounded-md px-3 py-2 text-sm border border-hm-bg-darker focus:border-hm-accent focus:outline-none mb-4"
            placeholder="Bot token or OAuth token"
            value={token()}
            onInput={(e) => setToken(e.currentTarget.value)}
          />
          <div class="flex gap-3">
            <button class="px-4 py-2 text-sm text-hm-text-muted" onClick={() => setStep('platform')}>
              Back
            </button>
            <button
              class="px-4 py-2 bg-hm-accent text-white rounded-md text-sm disabled:opacity-50"
              disabled={!token().trim()}
              onClick={() => setStep('select')}
            >
              Connect
            </button>
          </div>
        </Match>

        <Match when={step() === 'select'}>
          <p class="text-hm-text text-sm mb-4">Enter the server ID to import:</p>
          <input
            class="w-full bg-hm-bg-dark text-hm-text rounded-md px-3 py-2 text-sm border border-hm-bg-darker focus:border-hm-accent focus:outline-none mb-4 font-mono"
            placeholder="Server ID"
            value={serverId()}
            onInput={(e) => setServerId(e.currentTarget.value)}
          />
          <div class="flex gap-3">
            <button class="px-4 py-2 text-sm text-hm-text-muted" onClick={() => setStep('connect')}>
              Back
            </button>
            <button
              class="px-4 py-2 bg-hm-green text-white rounded-md text-sm disabled:opacity-50"
              disabled={!serverId().trim()}
              onClick={handleImport}
            >
              Start Import
            </button>
          </div>
        </Match>

        <Match when={step() === 'importing'}>
          <div class="text-center py-8">
            <div class="text-4xl mb-4 animate-spin">⏳</div>
            <p class="text-white font-medium">Importing data...</p>
            <p class="text-hm-text-muted text-sm mt-1">This may take a few minutes</p>
          </div>
        </Match>

        <Match when={step() === 'done'}>
          <div class="text-center py-8">
            <div class="text-4xl mb-4">✅</div>
            <p class="text-white font-medium">Import Complete!</p>
            <p class="text-hm-text-muted text-sm mt-1">Your data has been migrated successfully</p>
            <button class="mt-4 px-6 py-2 bg-hm-accent text-white rounded-md text-sm" onClick={() => props.onClose()}>
              Done
            </button>
          </div>
        </Match>
      </Switch>
    </div>
  )
}
