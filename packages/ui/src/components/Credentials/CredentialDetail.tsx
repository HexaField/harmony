import { For, Show, type JSX } from 'solid-js'
import type { HeldCredential } from '@harmony/credentials'

export interface CredentialDetailProps {
  credential: HeldCredential
  onRevoke?: () => void
  onPresent?: () => void
  onBack: () => void
  canRevoke?: boolean
}

export function useCredentialDetail(props: CredentialDetailProps) {
  return {
    credential: () => props.credential,
    id: () => props.credential.id,
    typeName: () => props.credential.typeName,
    issuer: () => props.credential.issuer,
    status: () => props.credential.status,
    issuedAt: () => {
      try {
        return new Date(props.credential.issuedAt).toLocaleDateString()
      } catch {
        return props.credential.issuedAt
      }
    },
    expiresAt: () => {
      if (!props.credential.expiresAt) return null
      try {
        return new Date(props.credential.expiresAt).toLocaleDateString()
      } catch {
        return props.credential.expiresAt
      }
    },
    transferable: () => props.credential.transferable,
    fields: () => Object.entries(props.credential.fields),
    canRevoke: () => props.canRevoke ?? false,
    canPresent: () => props.credential.transferable && props.credential.status === 'active',
    revoke: () => props.onRevoke?.(),
    present: () => props.onPresent?.(),
    back: () => props.onBack()
  }
}

export function CredentialDetail(props: CredentialDetailProps): JSX.Element {
  const ctrl = useCredentialDetail(props)

  return (
    <div class="space-y-4 p-4">
      <button class="text-xs text-hm-text-muted hover:text-white" onClick={() => ctrl.back()}>
        ← Back
      </button>

      <div class="bg-hm-bg-dark rounded-lg p-4">
        <div class="flex items-center gap-3 mb-3">
          <span class="text-2xl">🏅</span>
          <div>
            <h2 class="text-lg font-semibold text-white">{ctrl.typeName()}</h2>
            <span
              class={`text-xs px-2 py-0.5 rounded ${
                ctrl.status() === 'active'
                  ? "bg-green-600/20 text-green-400"
                  : ctrl.status() === 'expired'
                    ? "bg-yellow-600/20 text-yellow-400"
                    : "bg-red-600/20 text-red-400"
              }`}
            >
              {ctrl.status()}
            </span>
          </div>
        </div>

        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-hm-text-muted">Issuer</span>
            <span class="text-hm-text font-mono text-xs">{ctrl.issuer().slice(-12)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-hm-text-muted">Issued</span>
            <span class="text-hm-text">{ctrl.issuedAt()}</span>
          </div>
          <Show when={ctrl.expiresAt()}>
            <div class="flex justify-between">
              <span class="text-hm-text-muted">Expires</span>
              <span class="text-hm-text">{ctrl.expiresAt()}</span>
            </div>
          </Show>
          <div class="flex justify-between">
            <span class="text-hm-text-muted">Portable</span>
            <span class="text-hm-text">{ctrl.transferable() ? 'Yes' : 'No'}</span>
          </div>
        </div>
      </div>

      <Show when={ctrl.fields().length > 0}>
        <div>
          <p class="text-xs font-medium text-hm-text-muted uppercase tracking-wider mb-2">Fields</p>
          <div class="bg-hm-bg-dark rounded-lg divide-y divide-hm-bg-darker">
            <For each={ctrl.fields()}>
              {([key, value]) => (
                <div class="flex justify-between px-3 py-2">
                  <span class="text-xs text-hm-text-muted">{key}</span>
                  <span class="text-xs text-hm-text">{String(value)}</span>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      <div class="flex gap-2 pt-2">
        <Show when={ctrl.canPresent()}>
          <button
            class="flex-1 px-4 py-2 text-sm font-medium text-white bg-hm-accent rounded hover:bg-hm-accent/80"
            onClick={() => ctrl.present()}
          >
            Present
          </button>
        </Show>
        <Show when={ctrl.canRevoke()}>
          <button class="px-4 py-2 text-sm text-red-400 hover:text-red-300" onClick={() => ctrl.revoke()}>
            Revoke
          </button>
        </Show>
      </div>
    </div>
  )
}
