import { createSignal, Show, For, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { t } from '../i18n/strings.js'
import { createAuthVP } from '../auth.js'
import { createServerProvider, type HostingMode } from '../server-provider.js'
import type { CommunityInfo, ChannelInfo, MemberData } from '../types.js'

const provider = createServerProvider()

const HOSTING_OPTIONS: Record<HostingMode, { icon: string; titleKey: string; descKey: string }> = {
  local: {
    icon: '💻',
    titleKey: 'HOSTING_LOCAL_TITLE',
    descKey: 'HOSTING_LOCAL_DESC'
  },
  cloud: {
    icon: '☁️',
    titleKey: 'HOSTING_CLOUD_TITLE',
    descKey: 'HOSTING_CLOUD_DESC'
  },
  remote: {
    icon: '🔗',
    titleKey: 'HOSTING_REMOTE_TITLE',
    descKey: 'HOSTING_REMOTE_DESC'
  }
}

export const CreateCommunityModal: Component = () => {
  const store = useAppStore()
  const [step, setStep] = createSignal<'hosting' | 'details'>('hosting')
  const [hostingMode, setHostingMode] = createSignal<HostingMode | null>(null)
  const [remoteUrl, setRemoteUrl] = createSignal(import.meta.env.VITE_DEFAULT_SERVER_URL || '')
  const [name, setName] = createSignal('')
  const [description, setDescription] = createSignal('')
  const [creating, setCreating] = createSignal(false)
  const [error, setError] = createSignal('')
  const [status, setStatus] = createSignal('')

  const availableModes = provider.availableModes()

  const skipHostingStep = availableModes.length === 1

  function init() {
    if (skipHostingStep) {
      setHostingMode(availableModes[0])
      setStep('details')
    }
  }
  init()

  function close() {
    store.setShowCreateCommunity(false)
    setStep(skipHostingStep ? 'details' : 'hosting')
    setHostingMode(skipHostingStep ? availableModes[0] : null)
    setName('')
    setDescription('')
    setRemoteUrl('')
    setError('')
    setStatus('')
    setCreating(false)
  }

  function selectHosting(mode: HostingMode) {
    setHostingMode(mode)
    setError('')
    setStep('details')
  }

  async function ensureClientConnectedTo(url: string): Promise<void> {
    const identity = store.identity()
    const keyPair = store.keyPair()
    if (!identity || !keyPair) throw new Error(t('ERROR_GENERIC'))

    // Ensure client is initialized
    if (!store.client()) {
      await store.initClient(identity, keyPair)
    }

    const client = store.client()!

    // If not yet connected, connect with VP auth
    if (!client.isConnectedTo(url)) {
      setStatus(t('SERVER_AUTH_CREATING_VP'))
      const vp = await createAuthVP(identity.did, keyPair)

      setStatus(t('CONNECTION_CONNECTING'))

      await Promise.race([
        client.connect({ serverUrl: url, identity, keyPair, vp }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(t('ERROR_CONNECTION_FAILED', { url }))), 10000)
        )
      ])
      store.refreshServers()
    }
  }

  async function handleCreate() {
    const communityName = name().trim()
    const mode = hostingMode()
    if (!communityName || !mode) return

    setCreating(true)
    setError('')

    const identity = store.identity()
    const keyPair = store.keyPair()
    if (!identity || !keyPair) {
      setError(t('ERROR_GENERIC'))
      setCreating(false)
      return
    }

    try {
      let serverUrl: string

      if (mode === 'remote') {
        const url = remoteUrl().trim()
        if (!url) {
          setError(t('HOSTING_REMOTE_URL_REQUIRED'))
          setCreating(false)
          return
        }
        serverUrl =
          url.startsWith('ws://') || url.startsWith('wss://')
            ? url
            : url.startsWith('http://')
              ? url.replace('http://', 'ws://')
              : url.startsWith('https://')
                ? url.replace('https://', 'wss://')
                : `ws://${url}`

        setStatus(t('HOSTING_CHECKING_SERVER'))
        const healthy = await provider.checkHealth(serverUrl)
        if (!healthy) {
          setError(t('ERROR_CONNECTION_FAILED', { url: serverUrl }))
          setCreating(false)
          return
        }
      } else {
        setStatus(mode === 'local' ? t('HOSTING_STARTING_LOCAL') : t('HOSTING_PROVISIONING_CLOUD'))
        const result = await provider.provision({
          mode,
          name: communityName,
          ownerDID: identity.did
        })
        serverUrl = result.serverUrl
      }

      // Connect via store's client
      await ensureClientConnectedTo(serverUrl)

      const client = store.client()!
      const communityState = await client.createCommunity({
        name: communityName,
        description: description().trim() || undefined,
        defaultChannels: ['general', 'random']
      })

      const communityInfo: CommunityInfo = {
        id: communityState.id,
        name: communityState.info.name,
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

      const memberInfos: MemberData[] = communityState.members.map((m) => ({
        did: m.did,
        displayName:
          m.did === store.did()
            ? store.displayName() || store.did().substring(0, 16)
            : (m.displayName ?? m.did.substring(0, 16)),
        roles: m.roles,
        status: m.presence.status === 'online' ? ('online' as const) : ('offline' as const)
      }))

      store.setCommunities([...store.communities(), communityInfo])
      store.setChannels([...store.channels(), ...channelInfos])
      store.setMembers(memberInfos)
      store.setActiveCommunityId(communityState.id)

      const firstText = channelInfos.find((c) => c.type === 'text')
      if (firstText) store.setActiveChannelId(firstText.id)

      store.setConnectionState('connected')
      store.setConnectionError('')

      close()
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      setError(errMsg)
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
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold">{t('CREATE_COMMUNITY_TITLE')}</h2>
          <button onClick={close} class="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl">
            ✕
          </button>
        </div>

        <Show when={error()}>
          <div class="mb-4 p-3 rounded-lg bg-[var(--error)]/20 border border-[var(--error)]/30 text-[var(--error)] text-sm">
            {error()}
          </div>
        </Show>

        {/* Step 1: Choose hosting */}
        <Show when={step() === 'hosting'}>
          <div class="space-y-3">
            <p class="text-sm text-[var(--text-secondary)] mb-4">{t('HOSTING_CHOOSE')}</p>
            <For each={availableModes}>
              {(mode) => {
                const opt = HOSTING_OPTIONS[mode]
                return (
                  <button
                    onClick={() => selectHosting(mode)}
                    class="w-full p-4 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] hover:border-[var(--accent)] text-left transition-colors"
                  >
                    <div class="flex items-center gap-3">
                      <span class="text-2xl">{opt.icon}</span>
                      <div>
                        <h3 class="font-semibold">{t(opt.titleKey as any)}</h3>
                        <p class="text-sm text-[var(--text-secondary)]">{t(opt.descKey as any)}</p>
                      </div>
                    </div>
                  </button>
                )
              }}
            </For>
          </div>
        </Show>

        {/* Step 2: Community details */}
        <Show when={step() === 'details'}>
          <div class="space-y-4">
            <Show when={!skipHostingStep}>
              <button
                onClick={() => setStep('hosting')}
                class="flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                <span>←</span>
                <span>
                  {HOSTING_OPTIONS[hostingMode()!].icon} {t(HOSTING_OPTIONS[hostingMode()!].titleKey as any)}
                </span>
              </button>
            </Show>

            <Show when={hostingMode() === 'remote'}>
              <div>
                <label class="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  {t('SERVER_URL_LABEL')}
                </label>
                <input
                  value={remoteUrl()}
                  onInput={(e) => setRemoteUrl(e.currentTarget.value)}
                  class="w-full py-2.5 px-4 rounded-lg bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none text-sm font-mono"
                  placeholder={t('SERVER_URL_PLACEHOLDER')}
                />
              </div>
            </Show>

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

            <div class="flex gap-3 pt-2">
              <button
                onClick={close}
                class="flex-1 py-2.5 px-6 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--border)] text-[var(--text-primary)] font-semibold transition-colors"
              >
                {t('CREATE_COMMUNITY_CANCEL')}
              </button>
              <button
                onClick={handleCreate}
                disabled={!name().trim() || creating() || (hostingMode() === 'remote' && !remoteUrl().trim())}
                class="flex-1 py-2.5 px-6 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold transition-colors disabled:opacity-50"
              >
                {creating() ? t('CREATE_COMMUNITY_CREATING') : t('CREATE_COMMUNITY_SUBMIT')}
              </button>
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}
