import { For, Show, createSignal, createEffect, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { t } from '../i18n/strings.js'
import { ServerListBar } from './ServerListBar.tsx'
import { ChannelSidebarView } from './ChannelSidebarView.tsx'
import { MessageArea } from './MessageArea.tsx'
import { MemberSidebarView } from './MemberSidebarView.tsx'
import { SearchOverlayView } from './SearchOverlayView.tsx'
import type { CommunityInfo, ChannelInfo, MemberData } from '../types.js'

export const MainLayout: Component = () => {
  const store = useAppStore()

  // Seed demo data if empty
  createEffect(() => {
    if (store.communities().length === 0) {
      const demoCommunity: CommunityInfo = {
        id: 'community:demo',
        name: 'Harmony',
        description: 'Welcome to Harmony',
        memberCount: 3
      }
      store.setCommunities([demoCommunity])
      store.setActiveCommunityId(demoCommunity.id)

      const demoChannels: ChannelInfo[] = [
        { id: 'ch:general', name: 'general', type: 'text', communityId: demoCommunity.id },
        { id: 'ch:random', name: 'random', type: 'text', communityId: demoCommunity.id },
        { id: 'ch:voice-lounge', name: 'voice-lounge', type: 'voice', communityId: demoCommunity.id }
      ]
      store.setChannels(demoChannels)
      store.setActiveChannelId(demoChannels[0].id)

      const demoMembers: MemberData[] = [
        { did: store.did(), displayName: 'You', roles: ['admin'], status: 'online' },
        { did: 'did:key:z6MkMember1', displayName: 'Alice', roles: ['moderator'], status: 'online' },
        { did: 'did:key:z6MkMember2', displayName: 'Bob', roles: [], status: 'offline' }
      ]
      store.setMembers(demoMembers)
    }
  })

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
        <Show when={store.connectionState() === 'disconnected'}>
          <div class="bg-[var(--error)] text-white text-center py-1 text-sm">{t('OFFLINE_BANNER')}</div>
        </Show>
        <Show when={store.connectionState() === 'reconnecting'}>
          <div class="bg-[var(--warning)] text-black text-center py-1 text-sm">{t('RECONNECTING')}</div>
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
  )
}

const TitleBarView: Component = () => {
  const store = useAppStore()

  const activeCommunity = () => store.communities().find((c) => c.id === store.activeCommunityId())

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
