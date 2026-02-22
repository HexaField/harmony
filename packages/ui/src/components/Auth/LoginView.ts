import { createSignal } from 'solid-js'

export interface LoginViewProps {
  onLogin: (mnemonic: string) => void
  onCreate: () => void
}

export function LoginView(props: LoginViewProps) {
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
