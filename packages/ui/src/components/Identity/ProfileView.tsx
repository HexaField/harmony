import { Show, For, type JSX } from 'solid-js'
import { Avatar } from '../Shared/Avatar.js'

export interface ProfileViewProps {
  did: string
  displayName?: string
  mnemonic?: string | null
  credentials: Array<{ type: string; issuer: string; issuedAt: string }>
  onEditName?: (name: string) => void
  onBackupMnemonic?: () => void
}

export function ProfileView(props: ProfileViewProps): JSX.Element {
  return (
    <div class="p-6 max-w-lg mx-auto">
      <div class="flex items-center gap-4 mb-6">
        <Avatar did={props.did} size="lg" />
        <div>
          <h2 class="text-xl font-bold text-white">{props.displayName ?? props.did.slice(-8)}</h2>
          <p class="text-hm-text-muted text-sm font-mono">{props.did}</p>
        </div>
      </div>

      <div class="space-y-4">
        <div class="bg-hm-bg-dark rounded-lg p-4">
          <h3 class="text-sm font-semibold text-hm-text uppercase tracking-wide mb-3">Credentials</h3>
          <Show
            when={props.credentials.length > 0}
            fallback={<p class="text-hm-text-muted text-sm">No credentials yet</p>}
          >
            <For each={props.credentials}>
              {(cred) => (
                <div class="flex items-center justify-between py-2 border-b border-hm-bg-darker last:border-0">
                  <div>
                    <span class="text-sm text-white">{cred.type}</span>
                    <span class="text-xs text-hm-text-muted block">by {cred.issuer}</span>
                  </div>
                  <span class="text-xs text-hm-text-muted">{cred.issuedAt}</span>
                </div>
              )}
            </For>
          </Show>
        </div>

        <Show when={props.onBackupMnemonic}>
          <button
            class="w-full py-2.5 bg-hm-yellow/20 text-hm-yellow rounded-md text-sm font-medium hover:bg-hm-yellow/30 transition-colors"
            onClick={() => props.onBackupMnemonic?.()}
          >
            🔑 Backup Recovery Phrase
          </button>
        </Show>
      </div>
    </div>
  )
}
