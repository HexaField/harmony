import { For, Show, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { t } from '../i18n/strings.js'
import { RelativeTime } from '../components/Shared/index.js'
import { pseudonymFromDid, initialsFromName } from '../utils/pseudonym.js'

export const DMListView: Component = () => {
  const store = useAppStore()

  const sortedConversations = () => {
    return [...store.dmConversations()].sort((a, b) => {
      const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
      const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
      return tb - ta
    })
  }

  function selectConversation(participantDid: string) {
    store.setActiveDMRecipient(participantDid)
    store.markDMRead(participantDid)
  }

  return (
    <div class="w-[var(--sidebar-width)] bg-[var(--bg-secondary)] flex flex-col shrink-0 border-r border-[var(--border)]">
      {/* Header */}
      <div class="h-12 flex items-center px-4 border-b border-[var(--border)] font-semibold text-[var(--text-primary)]">
        <span class="truncate">{t('DM_SECTION_TITLE')}</span>
        <div class="ml-auto">
          <button
            onClick={() => store.setShowNewDMModal(true)}
            class="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg transition-colors"
            title={t('DM_NEW')}
          >
            +
          </button>
        </div>
      </div>

      {/* Back to community */}
      <button
        onClick={() => store.setShowDMView(false)}
        class="flex items-center px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]/50 transition-colors"
      >
        ← {t('DM_BACK_TO_COMMUNITY')}
      </button>

      {/* Conversation list */}
      <div class="flex-1 overflow-y-auto py-1">
        <Show when={sortedConversations().length === 0}>
          <div class="px-4 py-8 text-center text-[var(--text-muted)] text-sm">{t('DM_EMPTY')}</div>
        </Show>

        <For each={sortedConversations()}>
          {(convo) => {
            const isActive = () => store.activeDMRecipient() === convo.participantDid
            const timeInfo = () => (convo.lastMessageAt ? RelativeTime({ timestamp: convo.lastMessageAt }) : null)
            const initials = convo.participantName.substring(0, 2).toUpperCase()
            const unread = () => store.dmUnreadCount(convo.participantDid)

            return (
              <button
                onClick={() => selectConversation(convo.participantDid)}
                class="w-full flex items-center px-3 py-2 mx-2 rounded transition-colors"
                classList={{
                  'bg-[var(--bg-input)] text-[var(--text-primary)]': isActive(),
                  'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]/50':
                    !isActive()
                }}
                style={{ width: 'calc(100% - 16px)' }}
              >
                <div class="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center text-xs font-bold text-white shrink-0">
                  {initials}
                </div>
                <div class="ml-2 flex-1 min-w-0 text-left">
                  <div class="flex items-center justify-between">
                    <span class="text-sm font-semibold truncate">{convo.participantName}</span>
                    <Show when={timeInfo()}>
                      <span class="text-xs text-[var(--text-muted)] ml-1 shrink-0">{timeInfo()!.display}</span>
                    </Show>
                  </div>
                  <Show when={convo.lastMessage}>
                    <div class="flex items-center justify-between">
                      <span class="text-xs text-[var(--text-muted)] truncate">{convo.lastMessage}</span>
                      <Show when={unread() > 0}>
                        <span class="ml-1 shrink-0 w-5 h-5 rounded-full bg-[var(--accent)] text-white text-xs flex items-center justify-center font-semibold">
                          {unread()}
                        </span>
                      </Show>
                    </div>
                  </Show>
                </div>
              </button>
            )
          }}
        </For>
      </div>

      {/* User panel (same as ChannelSidebarView) */}
      <div class="h-14 flex items-center px-3 bg-[var(--bg-primary)]/50 border-t border-[var(--border)]">
        <div class="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center text-xs font-bold text-white">
          {initialsFromName(store.displayName() || pseudonymFromDid(store.did()))}
        </div>
        <div class="ml-2 flex-1 min-w-0">
          <div class="text-sm font-semibold truncate">{store.displayName() || pseudonymFromDid(store.did())}</div>
        </div>
      </div>
    </div>
  )
}
