import { Show, For, type Component } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { t } from '../i18n/strings.js'

export const VoiceControlBar: Component = () => {
  const store = useAppStore()

  const voiceChannel = () => store.channels().find((c) => c.id === store.voiceChannelId())

  const handleDisconnect = async () => {
    const client = store.client()
    if (client) {
      try {
        await client.leaveVoice()
      } catch {
        /* ignore */
      }
    }
    store.setVoiceChannelId(null)
    store.setVoiceUsers([])
    store.setMuted(false)
    store.setDeafened(false)
  }

  const handleToggleMute = () => {
    store.setMuted(!store.isMuted())
  }

  const handleToggleDeafen = () => {
    const newDeafened = !store.isDeafened()
    store.setDeafened(newDeafened)
    if (newDeafened) store.setMuted(true)
  }

  return (
    <Show when={store.voiceChannelId()}>
      <div class="bg-[var(--bg-primary)] border-t border-[var(--border)] px-3 py-2" data-testid="voice-control-bar">
        {/* Channel info */}
        <div class="flex items-center justify-between mb-1">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-green-400 text-xs font-semibold">{t('VOICE_CONNECTED')}</span>
            <span class="text-[var(--text-muted)] text-xs truncate">🔊 {voiceChannel()?.name ?? ''}</span>
          </div>
        </div>

        {/* Connected users */}
        <Show when={store.voiceUsers().length > 0}>
          <div class="flex items-center gap-1 mb-2">
            <For each={store.voiceUsers()}>
              {(did) => (
                <div
                  class="w-6 h-6 rounded-full bg-[var(--accent)] flex items-center justify-center text-[10px] font-bold text-white transition-shadow"
                  classList={{
                    'ring-2 ring-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]': store.speakingUsers().has(did)
                  }}
                  title={did + (store.speakingUsers().has(did) ? ` — ${t('VOICE_SPEAKING')}` : '')}
                >
                  {did.substring(did.length - 2).toUpperCase()}
                </div>
              )}
            </For>
          </div>
        </Show>

        {/* Controls */}
        <div class="flex items-center gap-2">
          <button
            onClick={handleToggleMute}
            class="p-1.5 rounded hover:bg-[var(--bg-input)] transition-colors text-sm"
            classList={{
              'text-[var(--error)]': store.isMuted(),
              'text-[var(--text-muted)]': !store.isMuted()
            }}
            title={store.isMuted() ? t('VOICE_UNMUTE') : t('VOICE_MUTE')}
            data-testid="voice-mute-btn"
          >
            {store.isMuted() ? '🔇' : '🎤'}
          </button>
          <button
            onClick={handleToggleDeafen}
            class="p-1.5 rounded hover:bg-[var(--bg-input)] transition-colors text-sm"
            classList={{
              'text-[var(--error)]': store.isDeafened(),
              'text-[var(--text-muted)]': !store.isDeafened()
            }}
            title={store.isDeafened() ? t('VOICE_UNDEAFEN') : t('VOICE_DEAFEN')}
            data-testid="voice-deafen-btn"
          >
            {store.isDeafened() ? '🔇' : '🎧'}
          </button>
          <div class="flex-1" />
          <button
            onClick={handleDisconnect}
            class="p-1.5 rounded hover:bg-[var(--error)]/20 text-[var(--error)] transition-colors text-sm"
            title={t('VOICE_DISCONNECT')}
            data-testid="voice-disconnect-btn"
          >
            📞
          </button>
        </div>
      </div>
    </Show>
  )
}
