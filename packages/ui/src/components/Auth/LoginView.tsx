import { createSignal, Show, type JSX } from 'solid-js'

export interface LoginViewProps {
  onLogin: (mnemonic: string) => void
  onCreate: () => void
}

// Logic hook (for testing)
export function useLoginView(props: LoginViewProps) {
  const [mnemonic, setMnemonic] = createSignal('')
  const [mode, setMode] = createSignal<'create' | 'recover'>('create')

  return {
    mnemonic,
    setMnemonic,
    mode,
    setMode,
    handleCreate() {
      props.onCreate()
    },
    handleRecover() {
      props.onLogin(mnemonic())
    }
  }
}

export function LoginView(props: LoginViewProps): JSX.Element {
  const ctrl = useLoginView(props)

  return (
    <div class="flex items-center justify-center min-h-screen bg-hm-bg-darkest">
      <div class="bg-hm-bg rounded-lg shadow-xl p-8 w-full max-w-md">
        <h1 class="text-2xl font-bold text-white text-center mb-2">Welcome to Harmony</h1>
        <p class="text-hm-text-muted text-center mb-8">Decentralized, encrypted chat</p>

        <div class="flex gap-2 mb-6">
          <button
            class={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              ctrl.mode() === 'create' ? "bg-hm-accent text-white" : "bg-hm-bg-dark text-hm-text-muted hover:text-white"
            }`}
            onClick={() => ctrl.setMode('create')}
          >
            Create Identity
          </button>
          <button
            class={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              ctrl.mode() === 'recover'
                ? "bg-hm-accent text-white"
                : "bg-hm-bg-dark text-hm-text-muted hover:text-white"
            }`}
            onClick={() => ctrl.setMode('recover')}
          >
            Recover Identity
          </button>
        </div>

        <Show when={ctrl.mode() === 'create'}>
          <p class="text-hm-text text-sm mb-4">
            Create a new decentralized identity. Your keys are generated locally and never leave your device.
          </p>
          <button
            class="w-full py-2.5 bg-hm-green hover:bg-hm-green/80 text-white rounded-md font-medium transition-colors"
            onClick={() => ctrl.handleCreate()}
          >
            Create New Identity
          </button>
        </Show>

        <Show when={ctrl.mode() === 'recover'}>
          <label class="block text-sm text-hm-text mb-2">Recovery Mnemonic</label>
          <textarea
            class="w-full bg-hm-bg-dark text-hm-text rounded-md p-3 border border-hm-bg-darker focus:border-hm-accent focus:outline-none resize-none text-sm"
            rows={3}
            placeholder="Enter your 12-word recovery phrase..."
            value={ctrl.mnemonic()}
            onInput={(e) => ctrl.setMnemonic(e.currentTarget.value)}
          />
          <button
            class="w-full mt-4 py-2.5 bg-hm-accent hover:bg-hm-accent-hover text-white rounded-md font-medium transition-colors disabled:opacity-50"
            disabled={!ctrl.mnemonic().trim()}
            onClick={() => ctrl.handleRecover()}
          >
            Recover Identity
          </button>
        </Show>
      </div>
    </div>
  )
}
