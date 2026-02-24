import { createSignal, Show, For, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import type { FriendData } from '../store.tsx'
import { t } from '../i18n/strings.js'

export const FriendFinderView: Component = () => {
  const store = useAppStore()
  const [searching, setSearching] = createSignal(false)
  const [searched, setSearched] = createSignal(false)
  const [inviteCopied, setInviteCopied] = createSignal<string | null>(null)

  async function findFriends() {
    setSearching(true)
    try {
      const portalUrl = (globalThis as any).__HARMONY_PORTAL_URL__ ?? ''
      const res = await fetch(`${portalUrl}/api/friends/discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ did: store.did() })
      })
      if (res.ok) {
        const data = await res.json()
        const friends: FriendData[] = (data.friends ?? []).map((f: any) => ({
          did: f.did,
          discordUsername: f.username ?? f.discordId,
          harmonyName: f.username ?? f.discordId,
          status: 'on-harmony' as const
        }))
        store.setFriends(friends)
      }
    } catch {
      // Silently handle errors
    } finally {
      setSearching(false)
      setSearched(true)
    }
  }

  function sendDM(did: string) {
    store.setShowFriendFinder(false)
    store.setActiveDMRecipient(did)
    store.setShowDMView(true)
  }

  async function copyInviteLink(discordUsername: string) {
    const link = `${location.origin}?invite=true`
    try {
      await navigator.clipboard.writeText(link)
      setInviteCopied(discordUsername)
      setTimeout(() => setInviteCopied(null), 2000)
    } catch {
      /* ignore */
    }
  }

  const foundFriends = () => store.friends().filter((f) => f.status === 'on-harmony')

  return (
    <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <div class="bg-[var(--bg-surface)] rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-6 max-h-[80vh] overflow-y-auto">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-bold">{t('FRIENDS_TITLE')}</h2>
          <button
            onClick={() => store.setShowFriendFinder(false)}
            class="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl transition-colors"
          >
            ✕
          </button>
        </div>

        <Show when={!searched()}>
          <div class="text-center py-8">
            <div class="text-4xl mb-4">👋</div>
            <p class="text-[var(--text-secondary)] mb-6">{t('FRIENDS_SEARCHING')}</p>
            <button
              onClick={findFriends}
              disabled={searching()}
              class="py-3 px-6 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold transition-colors disabled:opacity-50"
            >
              {searching() ? t('LOADING') : t('FRIENDS_FIND')}
            </button>
          </div>
        </Show>

        <Show when={searched()}>
          <Show when={foundFriends().length > 0}>
            <p class="text-[var(--text-secondary)] mb-4">
              {t('FRIENDS_FOUND_COUNT', { count: foundFriends().length })}
            </p>
            <div class="space-y-2 mb-6">
              <For each={foundFriends()}>
                {(friend) => (
                  <div class="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-input)]">
                    <div>
                      <p class="font-semibold text-[var(--text-primary)]">{friend.discordUsername}</p>
                      <p class="text-xs text-[var(--text-muted)]">{t('FRIENDS_ON_HARMONY')}</p>
                    </div>
                    <button
                      onClick={() => sendDM(friend.did)}
                      class="py-1.5 px-4 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold transition-colors"
                    >
                      {t('FRIENDS_SEND_DM')}
                    </button>
                  </div>
                )}
              </For>
            </div>
          </Show>

          <Show when={foundFriends().length === 0}>
            <div class="text-center py-6">
              <p class="text-[var(--text-secondary)]">{t('FRIENDS_NONE_FOUND')}</p>
            </div>
          </Show>

          <div class="border-t border-[var(--border)] pt-4">
            <p class="text-sm font-semibold text-[var(--text-secondary)] mb-3">{t('FRIENDS_INVITE_OTHERS')}</p>
            <button
              onClick={() => copyInviteLink('general')}
              class="w-full py-2.5 px-4 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--border)] text-[var(--text-primary)] text-sm font-semibold transition-colors"
            >
              {inviteCopied() ? t('FRIENDS_INVITE_COPIED') : t('FRIENDS_INVITE')}
            </button>
          </div>

          {/* Auto-joined communities */}
          <Show when={store.autoJoinedCommunities().length > 0}>
            <div class="border-t border-[var(--border)] pt-4 mt-4">
              <p class="text-sm font-semibold text-[var(--text-secondary)] mb-3">{t('FRIENDS_AUTO_JOINED_TITLE')}</p>
              <p class="text-xs text-[var(--text-muted)] mb-2">{t('FRIENDS_AUTO_JOINED_DESC')}</p>
              <div class="space-y-2">
                <For each={store.autoJoinedCommunities()}>
                  {(community) => (
                    <div class="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-input)]">
                      <span class="font-semibold text-[var(--text-primary)]">{community.communityName}</span>
                      <button
                        onClick={() => {
                          store.setActiveCommunityId(community.communityId)
                          store.setShowFriendFinder(false)
                        }}
                        class="text-sm text-[var(--accent)] hover:underline"
                      >
                        →
                      </button>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  )
}
