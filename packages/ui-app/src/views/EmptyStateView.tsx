import { createSignal, Show, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { t } from '../i18n/strings.js'
import type { CommunityInfo, ChannelInfo } from '../types.js'
import { MigrationWizard } from './MigrationWizard.tsx'

export const EmptyStateView: Component = () => {
  const store = useAppStore()
  const [showJoinInput, setShowJoinInput] = createSignal(false)
  const [showMigration, setShowMigration] = createSignal(false)
  const [inviteLink, setInviteLink] = createSignal('')
  const [joining, setJoining] = createSignal(false)
  const [joinError, setJoinError] = createSignal('')
  const [communityPreview, setCommunityPreview] = createSignal<{
    name: string
    memberCount?: number
    channels?: Array<{ id: string; name: string; type: string }>
  } | null>(null)
  const [parsedInvite, setParsedInvite] = createSignal<{ serverUrl: string; communityId?: string } | null>(null)

  function parseInvite(input: string): { serverUrl: string; communityId?: string } {
    const trimmed = input.trim()

    if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
      const match = trimmed.match(/^(wss?:\/\/[^/]+)(?:\/invite\/(.+))?$/)
      if (match) {
        return { serverUrl: match[1], communityId: match[2] }
      }
      return { serverUrl: trimmed }
    }

    if (trimmed.startsWith('http://')) {
      return parseInvite(trimmed.replace('http://', 'ws://'))
    }
    if (trimmed.startsWith('https://')) {
      return parseInvite(trimmed.replace('https://', 'wss://'))
    }

    if (/^[\w.-]+:\d+/.test(trimmed)) {
      return { serverUrl: `ws://${trimmed}` }
    }

    return { serverUrl: `ws://${trimmed}` }
  }

  async function handlePreview() {
    const link = inviteLink().trim()
    if (!link) return
    const parsed = parseInvite(link)
    setParsedInvite(parsed)
    if (parsed.communityId) {
      setJoinError('')
      setCommunityPreview({ name: 'Community', memberCount: undefined })
    } else {
      // No community ID, just go straight to join
      handleJoin()
    }
  }

  async function handleJoin() {
    const link = inviteLink().trim()
    if (!link) return

    setJoining(true)
    setJoinError('')

    const identity = store.identity()
    const keyPair = store.keyPair()

    if (!identity || !keyPair) {
      setJoinError(t('ERROR_GENERIC'))
      setJoining(false)
      return
    }

    const { serverUrl, communityId } = parseInvite(link)

    try {
      // Ensure the client is initialized
      if (!store.client()) {
        await store.initClient(identity, keyPair)
      }

      const client = store.client()!

      // Add & connect to this server via the store
      store.addServer(serverUrl)

      // Wait briefly for connection
      if (!client.isConnectedTo(serverUrl)) {
        store.setConnectionState('reconnecting')
        await Promise.race([
          client.connect({ serverUrl, identity, keyPair }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 5000))
        ])
        store.refreshServers()
        store.setConnectionState('connected')
        store.setConnectionError('')
      }

      if (communityId) {
        const communityState = await client.joinCommunity(communityId)

        const communityInfo: CommunityInfo = {
          id: communityState.id,
          name: communityState.info.name || 'Community',
          description: communityState.info.description,
          memberCount: communityState.info.memberCount,
          serverUrl
        }

        const channelInfos: ChannelInfo[] = communityState.channels.map((ch) => ({
          id: ch.id,
          name: ch.name,
          type: ch.type,
          communityId: communityState.id,
          topic: ch.topic
        }))

        store.setCommunities([...store.communities(), communityInfo])
        store.setChannels([...store.channels(), ...channelInfos])
        store.setActiveCommunityId(communityState.id)

        const firstText = channelInfos.find((c) => c.type === 'text')
        if (firstText) store.setActiveChannelId(firstText.id)
      } else {
        const communities = client.communities()
        if (communities.length > 0) {
          for (const cs of communities) {
            const info: CommunityInfo = {
              id: cs.id,
              name: cs.info.name,
              description: cs.info.description,
              memberCount: cs.info.memberCount,
              serverUrl
            }
            store.setCommunities([...store.communities(), info])
          }
          store.setActiveCommunityId(communities[0].id)
        } else {
          store.setShowCreateCommunity(true)
        }
      }
    } catch (err) {
      store.setConnectionState('disconnected')
      const errorMsg = err instanceof Error ? err.message : String(err)

      if (errorMsg.includes('Auth') || errorMsg.includes('auth')) {
        setJoinError(t('ERROR_AUTH_FAILED'))
      } else {
        setJoinError(t('ERROR_CONNECTION_FAILED', { url: serverUrl }))
      }
    } finally {
      setJoining(false)
    }
  }

  return (
    <div class="flex items-center justify-center h-screen bg-[var(--bg-primary)]">
      <div class="max-w-md w-full mx-4 p-8 rounded-2xl bg-[var(--bg-surface)] shadow-2xl text-center">
        <div class="text-5xl mb-4">🎵</div>
        <h1 class="text-2xl font-bold mb-2">{t('EMPTY_NO_COMMUNITIES')}</h1>
        <p class="text-[var(--text-secondary)] mb-8">{t('EMPTY_GET_STARTED')}</p>

        <div class="space-y-3">
          <button
            onClick={() => store.setShowCreateCommunity(true)}
            class="w-full py-3 px-6 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold transition-colors"
          >
            {t('COMMUNITY_CREATE')}
          </button>

          <Show
            when={showJoinInput()}
            fallback={
              <button
                onClick={() => setShowJoinInput(true)}
                class="w-full py-3 px-6 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--border)] text-[var(--text-primary)] font-semibold transition-colors"
              >
                {t('EMPTY_JOIN_COMMUNITY')}
              </button>
            }
          >
            <div class="space-y-2">
              <label class="block text-sm font-medium text-[var(--text-secondary)] text-left">
                {t('JOIN_COMMUNITY_URL_LABEL')}
              </label>
              {/* Community preview card */}
              <Show when={communityPreview() && parsedInvite()?.communityId}>
                <div class="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg p-4 text-left">
                  <h3 class="font-semibold text-[var(--text-primary)]">{t('INVITE_JOIN_TITLE')}</h3>
                  <p class="text-sm text-[var(--text-muted)] mt-1">{t('INVITE_JOIN_DESCRIPTION')}</p>
                  <p class="text-xs text-[var(--text-muted)] mt-2 font-mono">{parsedInvite()?.communityId}</p>
                  <div class="flex gap-2 mt-3">
                    <button
                      onClick={handleJoin}
                      disabled={joining()}
                      class="py-2 px-4 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold transition-colors disabled:opacity-50"
                    >
                      {joining() ? t('JOIN_COMMUNITY_JOINING') : t('INVITE_JOIN_CONFIRM')}
                    </button>
                    <button
                      onClick={() => {
                        setCommunityPreview(null)
                        setParsedInvite(null)
                      }}
                      class="py-2 px-4 rounded-lg bg-[var(--bg-input)] text-[var(--text-secondary)] text-sm font-semibold hover:bg-[var(--border)] transition-colors"
                    >
                      {t('INVITE_JOIN_CANCEL')}
                    </button>
                  </div>
                </div>
              </Show>
              <Show when={!communityPreview()}>
                <div class="flex gap-2">
                  <input
                    value={inviteLink()}
                    onInput={(e) => setInviteLink(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handlePreview()}
                    class="flex-1 py-3 px-4 rounded-lg bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none text-sm"
                    placeholder={t('JOIN_COMMUNITY_URL_PLACEHOLDER')}
                    disabled={joining()}
                    autofocus
                  />
                  <button
                    onClick={handlePreview}
                    disabled={!inviteLink().trim() || joining()}
                    class="py-3 px-6 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold transition-colors disabled:opacity-50"
                  >
                    {joining() ? t('JOIN_COMMUNITY_CONNECTING') : t('JOIN_COMMUNITY_CONNECT')}
                  </button>
                </div>
              </Show>
              <Show when={joinError()}>
                <p class="text-[var(--error)] text-sm text-left">{joinError()}</p>
              </Show>
              <button
                onClick={() => {
                  setShowJoinInput(false)
                  setJoinError('')
                  setCommunityPreview(null)
                  setParsedInvite(null)
                }}
                class="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                {t('JOIN_COMMUNITY_CANCEL')}
              </button>
            </div>
          </Show>

          <button
            onClick={() => setShowMigration(true)}
            class="w-full py-3 px-6 rounded-lg bg-[#5865F2]/20 hover:bg-[#5865F2]/30 border border-[#5865F2]/30 text-[var(--text-primary)] font-semibold transition-colors"
          >
            {t('ONBOARDING_IMPORT_DISCORD')}
          </button>
        </div>

        <Show when={showMigration()}>
          <MigrationWizard initialStep="hosting" onClose={() => setShowMigration(false)} />
        </Show>

        <div class="mt-6 pt-4 border-t border-[var(--border)]">
          <p class="text-xs text-[var(--text-muted)]">
            {t('IDENTITY_LABEL')}: <span class="font-semibold">{store.displayName() || t('IDENTITY_ANONYMOUS')}</span>
          </p>
        </div>
      </div>
    </div>
  )
}
