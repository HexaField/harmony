import { For, Show, createSignal, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { t } from '../i18n/strings.js'
import { VoiceControlBar } from './VoiceControlBar.tsx'
import { pseudonymFromDid, initialsFromName } from '../utils/pseudonym.js'

export const ChannelSidebarView: Component = () => {
  const store = useAppStore()
  const [showInviteCopied, setShowInviteCopied] = createSignal(false)

  const activeCommunity = () => store.communities().find((c) => c.id === store.activeCommunityId())

  const textChannels = () =>
    store.channels().filter((c) => c.type === 'text' && c.communityId === store.activeCommunityId())

  const voiceChannels = () =>
    store.channels().filter((c) => c.type === 'voice' && c.communityId === store.activeCommunityId())

  const canManageChannels = () => {
    const myDid = store.did()
    const me = store.members().find((m) => m.did === myDid)
    if (!me) return false
    if (me.roles.includes('admin')) return true
    const myRoles = store.roles().filter((r) => me.roles.includes(r.id))
    return myRoles.some((r) => r.permissions.includes('manage_channels'))
  }

  return (
    <div class="w-[var(--sidebar-width)] bg-[var(--bg-secondary)] flex flex-col shrink-0 border-r border-[var(--border)]">
      {/* Community header */}
      <div class="h-12 flex items-center px-4 border-b border-[var(--border)] font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-input)] cursor-pointer transition-colors">
        <span class="truncate">{activeCommunity()?.name ?? 'Harmony'}</span>
        <div class="ml-auto flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              const community = activeCommunity()
              if (community) {
                const serverUrl = community.serverUrl ?? 'ws://localhost:4000'
                const inviteUrl = `${serverUrl}/invite/${community.id}`
                navigator.clipboard
                  .writeText(inviteUrl)
                  .then(() => {
                    setShowInviteCopied(true)
                    setTimeout(() => setShowInviteCopied(false), 2000)
                  })
                  .catch(() => {})
              }
            }}
            class="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1"
            title={t('INVITE_GENERATE')}
          >
            {showInviteCopied() ? '✓' : '🔗'}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              store.setShowCommunitySettings(true)
            }}
            class="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1"
            title="Community Settings"
          >
            ⚙️
          </button>
          <span class="text-[var(--text-muted)]">▾</span>
        </div>
      </div>

      {/* Channel list */}
      <div class="flex-1 overflow-y-auto py-2">
        {/* Add channel button when no channels exist */}
        <Show when={textChannels().length === 0 && voiceChannels().length === 0}>
          <div class="px-3 py-1 flex items-center justify-between">
            <h3 class="text-xs font-semibold uppercase text-[var(--text-muted)] tracking-wider mb-1">Channels</h3>
            <button
              onClick={() => store.setShowCreateChannel(true)}
              class="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm transition-colors"
              title={t('CHANNEL_CREATE')}
            >
              +
            </button>
          </div>
        </Show>
        {/* Text channels */}
        <Show when={textChannels().length > 0}>
          <div class="px-3 py-1 flex items-center justify-between">
            <h3 class="text-xs font-semibold uppercase text-[var(--text-muted)] tracking-wider mb-1">Text Channels</h3>
            <button
              onClick={() => store.setShowCreateChannel(true)}
              class="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm transition-colors"
              title={t('CHANNEL_CREATE')}
            >
              +
            </button>
          </div>
          <For each={textChannels()}>
            {(channel) => {
              const isActive = () => store.activeChannelId() === channel.id
              return (
                <button
                  onClick={() => store.setActiveChannelId(channel.id)}
                  class="w-full flex items-center px-3 py-1.5 mx-2 rounded text-sm transition-colors group"
                  classList={{
                    'bg-[var(--bg-input)] text-[var(--text-primary)]': isActive(),
                    'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]/50':
                      !isActive()
                  }}
                  style={{ width: 'calc(100% - 16px)' }}
                >
                  <span class="mr-1.5 text-[var(--text-muted)]">#</span>
                  <span class="truncate">{channel.name}</span>
                  <Show when={canManageChannels()}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        store.setShowChannelSettings(channel.id)
                      }}
                      class="ml-auto text-[var(--text-muted)] hover:text-[var(--text-primary)] opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                      title={t('CHANNEL_SETTINGS')}
                    >
                      ⚙️
                    </button>
                  </Show>
                </button>
              )
            }}
          </For>
        </Show>

        {/* Voice channels */}
        <Show when={voiceChannels().length > 0}>
          <div class="px-3 py-1 mt-3">
            <h3 class="text-xs font-semibold uppercase text-[var(--text-muted)] tracking-wider mb-1">Voice Channels</h3>
          </div>
          <For each={voiceChannels()}>
            {(channel) => {
              const isInChannel = () => store.voiceChannelId() === channel.id
              const handleVoiceClick = async () => {
                if (isInChannel()) return
                // Leave current voice channel if in one
                if (store.voiceChannelId()) {
                  const client = store.client()
                  if (client) {
                    try {
                      await client.leaveVoice()
                    } catch {
                      /* ignore */
                    }
                  }
                }
                // Join new voice channel
                const client = store.client()
                if (client) {
                  try {
                    await client.joinVoice(channel.id)
                  } catch {
                    /* voice client not configured — update store directly */
                    store.setVoiceChannelId(channel.id)
                  }
                } else {
                  store.setVoiceChannelId(channel.id)
                }
              }

              return (
                <div>
                  <button
                    onClick={handleVoiceClick}
                    class="w-full flex items-center px-3 py-1.5 mx-2 rounded text-sm transition-colors"
                    classList={{
                      'bg-[var(--bg-input)] text-[var(--text-primary)]': isInChannel(),
                      'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]/50':
                        !isInChannel()
                    }}
                    style={{ width: 'calc(100% - 16px)' }}
                    title={isInChannel() ? t('VOICE_LEAVE') : t('VOICE_JOIN')}
                  >
                    <span class="mr-1.5">{isInChannel() ? '🔊' : '🔈'}</span>
                    <span class="truncate">{channel.name}</span>
                  </button>
                  {/* Show connected users in this voice channel */}
                  <Show when={isInChannel() && store.voiceUsers().length > 0}>
                    <div class="ml-8 mr-2 mb-1">
                      <For each={store.voiceUsers()}>
                        {(did) => {
                          const member = store.members().find((m) => m.did === did)
                          const name = member?.displayName || pseudonymFromDid(did)
                          const initials = initialsFromName(name)
                          return (
                            <div class="flex items-center gap-1.5 py-0.5 text-xs text-[var(--text-muted)]">
                              <div
                                class="w-4 h-4 rounded-full bg-[var(--accent)] flex items-center justify-center text-[8px] font-bold text-white transition-shadow"
                                classList={{
                                  'ring-2 ring-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]': store
                                    .speakingUsers()
                                    .has(did)
                                }}
                              >
                                {initials}
                              </div>
                              <span class="truncate">{name}</span>
                              <Show when={store.isMuted() && did === store.did()}>
                                <span title={t('VOICE_USER_MUTED')}>🔇</span>
                              </Show>
                            </div>
                          )
                        }}
                      </For>
                    </div>
                  </Show>
                </div>
              )
            }}
          </For>
        </Show>
      </div>

      {/* Voice control bar */}
      <VoiceControlBar />

      {/* User panel */}
      <div class="h-14 flex items-center px-3 bg-[var(--bg-primary)]/50 border-t border-[var(--border)]">
        <div class="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center text-xs font-bold text-white">
          {initialsFromName(store.displayName() || pseudonymFromDid(store.did()))}
        </div>
        <div class="ml-2 flex-1 min-w-0">
          <div class="text-sm font-semibold truncate">{store.displayName() || pseudonymFromDid(store.did())}</div>
        </div>
        <button class="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]" title={t('SETTINGS_USER')}>
          ⚙️
        </button>
      </div>
    </div>
  )
}
