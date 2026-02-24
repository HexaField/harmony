import { For, Show, createSignal, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { t } from '../i18n/strings.js'
import { pseudonymFromDid, initialsFromName } from '../utils/pseudonym.js'

export const NewDMModal: Component = () => {
  const store = useAppStore()
  const [searchQuery, setSearchQuery] = createSignal('')
  const [error, setError] = createSignal('')

  const availableMembers = () => {
    const query = searchQuery().toLowerCase().trim()
    return store
      .members()
      .filter((m) => m.did !== store.did())
      .filter((m) => {
        if (!query) return true
        const name = m.displayName || pseudonymFromDid(m.did)
        return name.toLowerCase().includes(query)
      })
  }

  function startConversation(did: string) {
    const trimmed = did.trim()
    if (!trimmed) {
      setError(t('DM_NEW_INVALID_DID'))
      return
    }

    const member = store.members().find((m) => m.did === trimmed)
    const name = member?.displayName || pseudonymFromDid(trimmed)

    store.addDMConversation({
      id: `dm:${trimmed}`,
      participantDid: trimmed,
      participantName: name,
      unreadCount: 0
    })
    store.setActiveDMRecipient(trimmed)
    store.setShowDMView(true)
    store.setShowNewDMModal(false)
    setSearchQuery('')
    setError('')
  }

  return (
    <div
      class="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={() => store.setShowNewDMModal(false)}
    >
      <div
        class="bg-[var(--bg-surface)] rounded-lg shadow-xl w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 class="text-xl font-bold text-[var(--text-primary)] mb-4">{t('DM_NEW_TITLE')}</h2>

        <label class="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t('DM_NEW_RECIPIENT_LABEL')}</label>
        <input
          type="text"
          value={searchQuery()}
          onInput={(e) => {
            setSearchQuery(e.currentTarget.value)
            setError('')
          }}
          placeholder={t('DM_NEW_RECIPIENT_PLACEHOLDER')}
          class="w-full p-2 rounded bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none text-sm"
          autofocus
        />
        <Show when={error()}>
          <p class="text-[var(--error)] text-xs mt-1">{error()}</p>
        </Show>

        {/* Member list */}
        <Show when={availableMembers().length > 0}>
          <p class="text-xs text-[var(--text-muted)] mt-4 mb-2">{t('DM_OR_SELECT_MEMBER')}</p>
          <div class="max-h-40 overflow-y-auto space-y-1">
            <For each={availableMembers()}>
              {(member) => {
                const displayName = member.displayName || pseudonymFromDid(member.did)
                const initials = initialsFromName(displayName)
                return (
                  <button
                    type="button"
                    onClick={() => startConversation(member.did)}
                    class="w-full flex items-center gap-2 px-3 py-2 rounded text-sm text-left hover:bg-[var(--bg-input)] transition-colors"
                  >
                    <div class="w-7 h-7 rounded-full bg-[var(--accent)] flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                      {initials}
                    </div>
                    <div class="flex-1 min-w-0">
                      <span class="text-[var(--text-primary)] truncate">{displayName}</span>
                    </div>
                    <span
                      class={`w-2 h-2 rounded-full shrink-0 ${member.status === 'online' ? 'bg-[var(--success)]' : 'bg-[var(--text-muted)]'}`}
                    />
                  </button>
                )
              }}
            </For>
          </div>
        </Show>

        <div class="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={() => store.setShowNewDMModal(false)}
            class="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            {t('DM_NEW_CANCEL')}
          </button>
        </div>
      </div>
    </div>
  )
}
