import { Show, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { t } from '../i18n/strings.js'
import { ServerListBar } from './ServerListBar.tsx'
import { ChannelSidebarView } from './ChannelSidebarView.tsx'
import { MessageArea } from './MessageArea.tsx'
import { MemberSidebarView } from './MemberSidebarView.tsx'
import { SearchOverlayView } from './SearchOverlayView.tsx'
import { EmptyStateView } from './EmptyStateView.tsx'
import { CreateCommunityModal } from './CreateCommunityModal.tsx'
import { CreateChannelModal } from './CreateChannelModal.tsx'

export const MainLayout: Component = () => {
  const store = useAppStore()

  // Keyboard shortcut: Ctrl+K for search
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        store.setShowSearch(!store.showSearch())
      }
      if (e.key === 'Escape' && store.showSearch()) {
        store.setShowSearch(false)
      }
    })
  }

  return (
    <>
      <Show when={store.communities().length === 0}>
        <EmptyStateView />
      </Show>

      <Show when={store.communities().length > 0}>
        <div class="flex h-screen overflow-hidden">
          {/* Server list bar (left icon strip) */}
          <ServerListBar />

          {/* Channel sidebar */}
          <ChannelSidebarView />

          {/* Main content area */}
          <div class="flex flex-col flex-1 min-w-0">
            {/* Title bar */}
            <TitleBarView />

            {/* Connection state banner */}
            <Show when={store.connectionState() === 'disconnected' && store.communities().length > 0}>
              <div class="bg-[var(--error)] text-white text-center py-1 text-sm">
                {store.connectionError() || t('OFFLINE_BANNER')}
              </div>
            </Show>
            <Show when={store.connectionState() === 'reconnecting'}>
              <div class="bg-[var(--warning)] text-black text-center py-1 text-sm">{t('ERROR_NETWORK_LOST')}</div>
            </Show>

            {/* Connection error */}
            <Show when={store.connectionError()}>
              <div class="bg-[var(--error)]/20 text-[var(--error)] text-center py-2 text-sm">
                {store.connectionError()}
              </div>
            </Show>

            {/* Message area */}
            <MessageArea />
          </div>

          {/* Member sidebar (right) */}
          <Show when={store.showMemberSidebar()}>
            <MemberSidebarView />
          </Show>

          {/* Search overlay */}
          <Show when={store.showSearch()}>
            <SearchOverlayView />
          </Show>
        </div>
      </Show>

      {/* Create community modal */}
      <Show when={store.showCreateCommunity()}>
        <CreateCommunityModal />
      </Show>

      {/* Create channel modal */}
      <Show when={store.showCreateChannel()}>
        <CreateChannelModal />
      </Show>
    </>
  )
}

const TitleBarView: Component = () => {
  const store = useAppStore()

  const activeChannel = () => store.channels().find((c) => c.id === store.activeChannelId())

  return (
    <div class="h-12 flex items-center px-4 bg-[var(--bg-secondary)] border-b border-[var(--border)] shrink-0">
      <span class="text-[var(--text-muted)] mr-2">#</span>
      <span class="font-semibold">{activeChannel()?.name ?? ''}</span>
      <Show when={activeChannel()?.topic}>
        <span class="mx-3 text-[var(--border)]">|</span>
        <span class="text-[var(--text-muted)] text-sm truncate">{activeChannel()!.topic}</span>
      </Show>
      <div class="flex-1" />
      <button
        onClick={() => store.setShowSearch(true)}
        class="p-2 rounded hover:bg-[var(--bg-input)] text-[var(--text-muted)] text-sm"
        title={t('SEARCH_PLACEHOLDER')}
      >
        🔍
      </button>
      <button
        onClick={() => store.setShowMemberSidebar(!store.showMemberSidebar())}
        class="p-2 rounded hover:bg-[var(--bg-input)] text-[var(--text-muted)] text-sm ml-1"
        title={t('COMMUNITY_MEMBERS')}
      >
        👥
      </button>
    </div>
  )
}
