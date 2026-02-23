import { createSignal, Show, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { t } from '../i18n/strings.js'
import { HarmonyClient } from '@harmony/client'
import type { CommunityInfo, ChannelInfo } from '../types.js'
import { MigrationWizard } from './MigrationWizard.tsx'

export const EmptyStateView: Component = () => {
  const store = useAppStore()
  const [showJoinInput, setShowJoinInput] = createSignal(false)
  const [showMigration, setShowMigration] = createSignal(false)
  const [inviteLink, setInviteLink] = createSignal('')
  const [joining, setJoining] = createSignal(false)
  const [joinError, setJoinError] = createSignal('')

  function parseInvite(input: string): { serverUrl: string; communityId?: string } {
    const trimmed = input.trim()

    // If it looks like a ws:// or wss:// URL, use directly
    if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
      // Check for invite path like ws://host:port/invite/COMMUNITY_ID
      const match = trimmed.match(/^(wss?:\/\/[^/]+)(?:\/invite\/(.+))?$/)
      if (match) {
        return { serverUrl: match[1], communityId: match[2] }
      }
      return { serverUrl: trimmed }
    }

    // If it's an http(s) URL, convert to ws
    if (trimmed.startsWith('http://')) {
      return parseInvite(trimmed.replace('http://', 'ws://'))
    }
    if (trimmed.startsWith('https://')) {
      return parseInvite(trimmed.replace('https://', 'wss://'))
    }

    // Bare host:port
    if (/^[\w.-]+:\d+/.test(trimmed)) {
      return { serverUrl: `ws://${trimmed}` }
    }

    // Fallback: treat as ws URL
    return { serverUrl: `ws://${trimmed}` }
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
      // Create a new client for this server
      const client =
        store.client() ??
        new HarmonyClient({
          wsFactory: (url: string) => new WebSocket(url) as any
        })

      if (!client.isConnected()) {
        store.setConnectionState('reconnecting')

        await Promise.race([
          client.connect({ serverUrl, identity, keyPair }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 5000))
        ])

        store.setClient(client)
        store.setConnectionState('connected')
        store.setConnectionError('')
      }

      if (communityId) {
        // Join a specific community
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
        // No specific community — fetch available communities from server
        // For now, create a placeholder to indicate connected state
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
          // Connected but no communities — show the create community flow
          // Store the server URL for future use
          store.setShowCreateCommunity(true)
        }
      }

      // Set up event listeners
      setupClientListeners(client)
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

  function setupClientListeners(client: HarmonyClient) {
    client.on('message', (...args: unknown[]) => {
      const msg = args[0] as {
        id: string
        channelId: string
        authorDID: string
        content: { text?: string }
        timestamp: string
      }
      if (msg && msg.content?.text) {
        const messageData = {
          id: msg.id,
          content: msg.content.text,
          authorDid: msg.authorDID,
          authorName: msg.authorDID.substring(0, 12),
          timestamp: msg.timestamp,
          reactions: [] as Array<{ emoji: string; count: number; userReacted: boolean }>
        }
        store.addMessage(messageData)
        store.addChannelMessage(msg.channelId, messageData)
      }
    })

    client.on('disconnected' as any, () => {
      store.setConnectionState('disconnected')
      store.setConnectionError(t('ERROR_NETWORK_LOST'))
    })

    client.on('reconnecting' as any, () => {
      store.setConnectionState('reconnecting')
    })

    client.on('connected' as any, () => {
      store.setConnectionState('connected')
      store.setConnectionError('')
    })

    client.on('error', (...args: unknown[]) => {
      const err = args[0] as { message?: string }
      store.setConnectionError(err?.message ?? t('ERROR_GENERIC'))
    })

    client.on('member.joined', (...args: unknown[]) => {
      const event = args[0] as { communityId: string; memberDID: string }
      if (event) {
        store.setMembers([
          ...store.members(),
          {
            did: event.memberDID,
            displayName: event.memberDID.substring(0, 12),
            roles: [],
            status: 'online'
          }
        ])
      }
    })

    client.on('member.left', (...args: unknown[]) => {
      const event = args[0] as { memberDID: string }
      if (event) {
        store.setMembers(store.members().filter((m) => m.did !== event.memberDID))
      }
    })
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
              <div class="flex gap-2">
                <input
                  value={inviteLink()}
                  onInput={(e) => setInviteLink(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                  class="flex-1 py-3 px-4 rounded-lg bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none text-sm"
                  placeholder={t('JOIN_COMMUNITY_URL_PLACEHOLDER')}
                  disabled={joining()}
                  autofocus
                />
                <button
                  onClick={handleJoin}
                  disabled={!inviteLink().trim() || joining()}
                  class="py-3 px-6 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold transition-colors disabled:opacity-50"
                >
                  {joining() ? t('JOIN_COMMUNITY_CONNECTING') : t('JOIN_COMMUNITY_CONNECT')}
                </button>
              </div>
              <Show when={joinError()}>
                <p class="text-[var(--error)] text-sm text-left">{joinError()}</p>
              </Show>
              <button
                onClick={() => {
                  setShowJoinInput(false)
                  setJoinError('')
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
          <MigrationWizard onClose={() => setShowMigration(false)} />
        </Show>

        <div class="mt-6 pt-4 border-t border-[var(--border)]">
          <p class="text-xs text-[var(--text-muted)]">
            DID: <span class="font-mono">{store.did().substring(0, 24)}...</span>
          </p>
        </div>
      </div>
    </div>
  )
}
