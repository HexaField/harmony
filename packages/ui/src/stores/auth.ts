import { createSignal } from 'solid-js'
import type { Identity } from '@harmony/identity'
import type { KeyPair } from '@harmony/crypto'

export interface AuthState {
  identity: Identity | null
  keyPair: KeyPair | null
  mnemonic: string | null
  authenticated: boolean
}

export function createAuthStore() {
  const [state, setState] = createSignal<AuthState>({
    identity: null,
    keyPair: null,
    mnemonic: null,
    authenticated: false
  })

  return {
    state,
    setIdentity(identity: Identity, keyPair: KeyPair, mnemonic?: string) {
      setState({ identity, keyPair, mnemonic: mnemonic ?? null, authenticated: true })
    },
    logout() {
      setState({ identity: null, keyPair: null, mnemonic: null, authenticated: false })
    }
  }
}

export type AuthStore = ReturnType<typeof createAuthStore>
