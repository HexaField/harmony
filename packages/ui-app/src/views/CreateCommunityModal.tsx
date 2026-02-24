import { createSignal, Show, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import type { ServerEntry } from '../store.tsx'
import { t } from '../i18n/strings.js'
import { HarmonyClient } from '@harmony/client'
import { createAuthVP } from '../auth.js'
import type { CommunityInfo, ChannelInfo, MemberData } from '../types.js'

const DEFAULT_SERVER_URL = import.meta.env.VITE_DEFAULT_SERVER_URL || 'ws://localhost:4000'

export const CreateCommunityModal: Component = () => {
  const store = useAppStore()
  const [name, setName] = createSignal('')
  const [description, setDescription] = createSignal('')
  const [serverUrl, setServerUrl] = createSignal(DEFAULT_SERVER_URL)
  const [creating, setCreating] = createSignal(false)
  const [error, setError] = createSignal('')
  const [status, setStatus] = createSignal('')

  function close() {
    store.setShowCreateCommunity(false)
    setName('')
    setDescription('')
    setServerUrl(DEFAULT_SERVER_URL)
    setError('')
    setStatus('')
    setCreating(false)
  }

  async function connectToServer(url: string): Promise<HarmonyClient> {
    const identity = store.identity()
    const keyPair = store.keyPair()
    if (!identity || !keyPair) throw new Error(t('ERROR_GENERIC'))

    // Check if we already have a connected client for this server
    const existing = store.servers().find((s) => s.url === url)
    if (existing?.client?.isConnected()) {
      return existing.client
    }

    // Update/add server entry
    const serverEntry: ServerEntry = {
      url,
      name: new URL(url.replace('ws://', 'http://').replace('wss://', 'https://')).hostname,
      status: 'connecting',
      client: null
    }

    if (existing) {
      store.updateServer(url, { status: 'connecting', error: undefined })
    } else {
      store.setServers([...store.servers(), serverEntry])
    }

    // Create VP for authentication
    setStatus(t('SERVER_AUTH_CREATING_VP'))
    const vp = await createAuthVP(identity.did, keyPair)

    // Create client and connect with VP
    const client = new HarmonyClient({
      wsFactory: (wsUrl: string) => new WebSocket(wsUrl) as any
    })

    setStatus(t('CONNECTION_CONNECTING'))

    await Promise.race([
      client.connect({
        serverUrl: url,
        identity,
        keyPair,
        vp
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(t('ERROR_CONNECTION_FAILED', { url }))), 10000)
      )
    ])

    // Update server entry as connected
    store.updateServer(url, { status: 'connected', client, error: undefined })
    return client
  }

  async function handleCreate() {
    const communityName = name().trim()
    if (!communityName) return

    setCreating(true)
    setError('')

    const identity = store.identity()
    const keyPair = store.keyPair()

    if (!identity || !keyPair) {
      setError(t('ERROR_GENERIC'))
      setCreating(false)
      return
    }

    const url = serverUrl().trim() || DEFAULT_SERVER_URL

    try {
      const client = await connectToServer(url)

      // Create community via server
      const communityState = await client.createCommunity({
        name: communityName,
        description: description().trim() || undefined,
        defaultChannels: ['general', 'random']
      })

      // Map to UI types
      const communityInfo: CommunityInfo = {
        id: communityState.id,
        name: communityState.info.name,
        description: communityState.info.description,
        memberCount: communityState.info.memberCount,
        serverUrl: url
      }

      const channelInfos: ChannelInfo[] = communityState.channels.map((ch) => ({
        id: ch.id,
        name: ch.name,
        type: ch.type,
        communityId: communityState.id,
        topic: ch.topic
      }))

      const memberInfos: MemberData[] = communityState.members.map((m) => ({
        did: m.did,
        displayName: m.displayName ?? m.did.substring(0, 16),
        roles: m.roles,
        status: m.presence.status === 'online' ? ('online' as const) : ('offline' as const)
      }))

      store.setCommunities([...store.communities(), communityInfo])
      store.setChannels([...store.channels(), ...channelInfos])
      store.setMembers(memberInfos)
      store.setActiveCommunityId(communityState.id)

      // Auto-select first text channel
      const firstText = channelInfos.find((c) => c.type === 'text')
      if (firstText) {
        store.setActiveChannelId(firstText.id)
      }

      // Listen for incoming messages
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

      // Listen for member events
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

      // Also update the legacy single client ref
      store.setClient(client)
      store.setConnectionState('connected')
      store.setConnectionError('')

      close()
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      setError(errMsg)
      store.updateServer(url, { status: 'error', error: errMsg })
      setCreating(false)
    }
  }

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div class="max-w-md w-full mx-4 p-6 rounded-2xl bg-[var(--bg-surface)] shadow-2xl">
        <h2 class="text-xl font-bold mb-4">{t('CREATE_COMMUNITY_TITLE')}</h2>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t('SERVER_URL_LABEL')}</label>
            <input
              value={serverUrl()}
              onInput={(e) => setServerUrl(e.currentTarget.value)}
              class="w-full py-2.5 px-4 rounded-lg bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none text-sm font-mono"
              placeholder={t('SERVER_URL_PLACEHOLDER')}
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              {t('CREATE_COMMUNITY_NAME')}
            </label>
            <input
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              class="w-full py-2.5 px-4 rounded-lg bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none text-sm"
              placeholder={t('CREATE_COMMUNITY_NAME_PLACEHOLDER')}
              autofocus
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              {t('CREATE_COMMUNITY_DESCRIPTION')}
            </label>
            <textarea
              value={description()}
              onInput={(e) => setDescription(e.currentTarget.value)}
              rows={3}
              class="w-full py-2.5 px-4 rounded-lg bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none text-sm resize-none"
              placeholder={t('CREATE_COMMUNITY_DESCRIPTION_PLACEHOLDER')}
            />
          </div>

          <Show when={status() && !error()}>
            <p class="text-[var(--text-secondary)] text-sm flex items-center gap-2">
              <span class="inline-block w-3 h-3 rounded-full bg-[var(--warning)] animate-pulse" />
              {status()}
            </p>
          </Show>

          <Show when={error()}>
            <p class="text-[var(--error)] text-sm">{error()}</p>
          </Show>

          <div class="flex gap-3 pt-2">
            <button
              onClick={close}
              class="flex-1 py-2.5 px-6 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--border)] text-[var(--text-primary)] font-semibold transition-colors"
            >
              {t('CREATE_COMMUNITY_CANCEL')}
            </button>
            <button
              onClick={handleCreate}
              disabled={!name().trim() || creating()}
              class="flex-1 py-2.5 px-6 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold transition-colors disabled:opacity-50"
            >
              {creating() ? t('CREATE_COMMUNITY_CREATING') : t('CREATE_COMMUNITY_SUBMIT')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
