import { Show, createSignal, onMount, onCleanup, type Component } from 'solid-js'
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
import { ChannelSettingsModal } from './ChannelSettingsModal.tsx'
import { DelegationView } from './DelegationView.tsx'
import { DMListView } from './DMListView.tsx'
import { DMConversationView } from './DMConversationView.tsx'
import { NewDMModal } from './NewDMModal.tsx'
import { ThreadView } from './ThreadView.tsx'

function useIsMobile() {
  const [isMobile, setIsMobile] = createSignal(typeof window !== 'undefined' && window.innerWidth < 768)
  onMount(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    onCleanup(() => mq.removeEventListener('change', handler))
  })
  return isMobile
}

export const MainLayout: Component = () => {
  const store = useAppStore()
  const isMobile = useIsMobile()
  const [showMobileSidebar, setShowMobileSidebar] = createSignal(false)
  const [showMobileMembers, setShowMobileMembers] = createSignal(false)

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
      {/* Loading state — show spinner while waiting for community data */}
      <Show when={store.loading()}>
        <div class="flex items-center justify-center h-screen bg-[var(--bg-primary)]">
          <div class="text-center">
            <div class="animate-spin w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full mx-auto mb-4" />
            <p class="text-[var(--text-muted)] text-sm">{t('LOADING_COMMUNITIES') ?? 'Loading…'}</p>
          </div>
        </div>
      </Show>

      <Show when={!store.loading() && store.communities().length === 0}>
        <EmptyStateView />
      </Show>

      <Show when={!store.loading() && store.communities().length > 0}>
        <div class="flex h-screen overflow-hidden">
          {/* Desktop: inline sidebars. Mobile: hidden, shown via drawer */}
          <Show when={!isMobile()}>
            <ServerListBar />
            <Show when={store.showDMView()} fallback={<ChannelSidebarView />}>
              <DMListView />
            </Show>
          </Show>

          {/* Mobile sidebar drawer */}
          <Show when={isMobile() && showMobileSidebar()}>
            <div class="mobile-sidebar-overlay" onClick={() => setShowMobileSidebar(false)} />
            <div class="mobile-sidebar-drawer">
              <ServerListBar />
              <Show when={store.showDMView()} fallback={<ChannelSidebarView />}>
                <DMListView />
              </Show>
            </div>
          </Show>

          {/* Main content area */}
          <div class="flex flex-col flex-1 min-w-0">
            {/* Title bar */}
            <Show when={!store.showDMView()}>
              <TitleBarView
                onHamburger={() => setShowMobileSidebar(!showMobileSidebar())}
                onMembers={() => setShowMobileMembers(!showMobileMembers())}
                isMobile={isMobile()}
              />
            </Show>

            {/* Connection state banner */}
            <Show when={store.connectionState() === 'disconnected' && store.communities().length > 0}>
              <div class="bg-[var(--error)] text-white text-center py-1 text-sm flex items-center justify-center gap-2">
                <span>{store.connectionError() || t('OFFLINE_BANNER')}</span>
                <button
                  onClick={() => store.client()?.reconnect()}
                  class="px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 text-xs font-semibold transition-colors"
                >
                  {t('RETRY') ?? 'Retry'}
                </button>
              </div>
            </Show>
            <Show when={store.connectionState() === 'reconnecting'}>
              <div class="bg-[var(--warning)] text-black text-center py-1 text-sm">
                {t('ERROR_NETWORK_LOST')}
                <span class="ml-2 inline-block w-3 h-3 border border-black/30 border-t-black rounded-full animate-spin align-middle" />
              </div>
            </Show>

            {/* Connection error */}
            <Show when={store.connectionError()}>
              <div class="bg-[var(--error)]/20 text-[var(--error)] text-center py-2 text-sm">
                {store.connectionError()}
              </div>
            </Show>

            {/* Message area — DM or channel */}
            <Show when={store.showDMView() && store.activeDMRecipient()} fallback={<MessageArea />}>
              <DMConversationView />
            </Show>
          </div>

          {/* Member sidebar — desktop inline, mobile drawer */}
          <Show when={!isMobile() && store.showMemberSidebar() && !store.activeThread()}>
            <MemberSidebarView />
          </Show>

          {/* Mobile member drawer */}
          <Show when={isMobile() && showMobileMembers()}>
            <div class="mobile-sidebar-overlay" onClick={() => setShowMobileMembers(false)} />
            <div class="mobile-member-drawer">
              <MemberSidebarView />
            </div>
          </Show>

          {/* Thread panel — desktop side panel, mobile fullscreen */}
          <Show when={store.activeThread()}>
            <Show when={isMobile()} fallback={<ThreadView />}>
              <div class="mobile-thread-fullscreen">
                <ThreadView />
              </div>
            </Show>
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

      {/* New DM modal */}
      <Show when={store.showNewDMModal()}>
        <NewDMModal />
      </Show>

      {/* Channel settings modal */}
      <ChannelSettingsModal />

      {/* Delegation view */}
      <DelegationView />
    </>
  )
}

const TitleBarView: Component<{ onHamburger?: () => void; onMembers?: () => void; isMobile?: boolean }> = (props) => {
  const store = useAppStore()

  const activeChannel = () => store.channels().find((c) => c.id === store.activeChannelId())

  return (
    <div class="h-12 flex items-center px-4 bg-[var(--bg-secondary)] border-b border-[var(--border)] shrink-0">
      <Show when={props.isMobile}>
        <button class="mobile-hamburger" onClick={props.onHamburger} aria-label="Toggle sidebar">
          ☰
        </button>
      </Show>
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
        onClick={() => {
          if (props.isMobile && props.onMembers) props.onMembers()
          else store.setShowMemberSidebar(!store.showMemberSidebar())
        }}
        class="p-2 rounded hover:bg-[var(--bg-input)] text-[var(--text-muted)] text-sm ml-1"
        title={t('COMMUNITY_MEMBERS')}
      >
        👥
      </button>
    </div>
  )
}
