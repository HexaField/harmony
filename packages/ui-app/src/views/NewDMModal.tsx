import { For, Show, createSignal, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { t } from '../i18n/strings.js'

export const NewDMModal: Component = () => {
  const store = useAppStore()
  const [recipientDid, setRecipientDid] = createSignal('')
  const [error, setError] = createSignal('')

  const availableMembers = () => {
    return store.members().filter((m) => m.did !== store.did())
  }

  function startConversation(did: string) {
    const trimmed = did.trim()
    if (!trimmed) {
      setError(t('DM_NEW_INVALID_DID'))
      return
    }

    // Find display name from members if available
    const member = store.members().find((m) => m.did === trimmed)
    const name = member?.displayName ?? trimmed.substring(0, 16)

    store.addDMConversation({
      id: `dm:${trimmed}`,
      participantDid: trimmed,
      participantName: name,
      unreadCount: 0
    })
    store.setActiveDMRecipient(trimmed)
    store.setShowDMView(true)
    store.setShowNewDMModal(false)
    setRecipientDid('')
    setError('')
  }

  function handleSubmit(e: Event) {
    e.preventDefault()
    startConversation(recipientDid())
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

        <form onSubmit={handleSubmit}>
          <label class="block text-sm font-medium text-[var(--text-secondary)] mb-1">
            {t('DM_NEW_RECIPIENT_LABEL')}
          </label>
          <input
            type="text"
            value={recipientDid()}
            onInput={(e) => {
              setRecipientDid(e.currentTarget.value)
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
                  const initials = member.displayName.substring(0, 2).toUpperCase()
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
                        <span class="text-[var(--text-primary)] truncate">{member.displayName}</span>
                        <span class="text-[var(--text-muted)] text-xs ml-2 truncate">
                          {member.did.substring(0, 24)}...
                        </span>
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
            <button
              type="submit"
              disabled={!recipientDid().trim()}
              class="px-4 py-2 text-sm bg-[var(--accent)] text-white rounded hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-default transition-colors"
            >
              {t('DM_NEW_START')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
