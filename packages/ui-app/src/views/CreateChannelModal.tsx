import { createSignal, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { t } from '../i18n/strings.js'
import type { ChannelInfo } from '../types.js'

export const CreateChannelModal: Component = () => {
  const store = useAppStore()
  const [name, setName] = createSignal('')
  const [type, setType] = createSignal<'text' | 'voice'>('text')
  const [creating, setCreating] = createSignal(false)
  const [error, setError] = createSignal('')

  async function handleCreate() {
    const channelName = name().trim().toLowerCase().replace(/\s+/g, '-')
    if (!channelName) return

    const client = store.client()
    const communityId = store.activeCommunityId()
    if (!client || !communityId) return

    setCreating(true)
    setError('')

    try {
      const channel = await client.createChannel(communityId, {
        communityId,
        name: channelName,
        type: type()
      } as any)

      const channelInfo: ChannelInfo = {
        id: channel.id,
        name: channel.name,
        type: channel.type,
        communityId,
        topic: channel.topic
      }

      store.setChannels([...store.channels(), channelInfo])
      store.setActiveChannelId(channel.id)
      store.setShowCreateChannel(false)
    } catch (err) {
      setError(t('CHANNEL_CREATE_ERROR', { error: err instanceof Error ? err.message : String(err) }))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div
      class="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) store.setShowCreateChannel(false)
      }}
    >
      <div class="w-full max-w-md mx-4 bg-[var(--bg-surface)] rounded-lg shadow-2xl p-6">
        <h2 class="text-xl font-bold mb-4">{t('CHANNEL_CREATE')}</h2>

        <div class="space-y-4">
          <div>
            <label class="text-sm text-[var(--text-muted)] block mb-1">{t('CHANNEL_CREATE_NAME')}</label>
            <input
              type="text"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              class="w-full p-2 rounded-lg bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none text-sm"
              placeholder={t('CHANNEL_CREATE_NAME_PLACEHOLDER')}
              autofocus
              disabled={creating()}
            />
          </div>

          <div>
            <label class="text-sm text-[var(--text-muted)] block mb-1">{t('CHANNEL_CREATE_TYPE')}</label>
            <div class="flex gap-2">
              <button
                onClick={() => setType('text')}
                class="py-2 px-4 rounded-lg text-sm font-semibold transition-colors"
                classList={{
                  'bg-[var(--accent)] text-white': type() === 'text',
                  'bg-[var(--bg-input)] text-[var(--text-secondary)]': type() !== 'text'
                }}
              >
                # Text
              </button>
              <button
                onClick={() => setType('voice')}
                class="py-2 px-4 rounded-lg text-sm font-semibold transition-colors"
                classList={{
                  'bg-[var(--accent)] text-white': type() === 'voice',
                  'bg-[var(--bg-input)] text-[var(--text-secondary)]': type() !== 'voice'
                }}
              >
                🔊 Voice
              </button>
            </div>
          </div>

          {error() && <p class="text-[var(--error)] text-sm">{error()}</p>}

          <div class="flex gap-2 justify-end">
            <button
              onClick={() => store.setShowCreateChannel(false)}
              class="py-2 px-4 rounded-lg bg-[var(--bg-input)] text-[var(--text-secondary)] text-sm font-semibold hover:bg-[var(--border)] transition-colors"
            >
              {t('CHANNEL_CREATE_CANCEL')}
            </button>
            <button
              onClick={handleCreate}
              disabled={!name().trim() || creating()}
              class="py-2 px-4 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {creating() ? t('LOADING') : t('CHANNEL_CREATE_SUBMIT')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
