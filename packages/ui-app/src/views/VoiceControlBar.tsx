import { Show, For, type Component, createMemo, createEffect, onCleanup } from 'solid-js'
import { useAppStore } from '../store.tsx'
import { t } from '../i18n/strings.js'
import { pseudonymFromDid, initialsFromName } from '../utils/pseudonym.js'
import {
  MicIcon,
  MicOffIcon,
  HeadphonesIcon,
  HeadphonesOffIcon,
  VideoIcon,
  VideoOffIcon,
  ScreenShareIcon,
  ScreenShareOffIcon,
  PhoneOffIcon,
  SignalIcon,
  LoaderIcon,
  SpeakerIcon
} from '../components/Voice/VoiceIcons.tsx'

const ConnectionStateBadge: Component = () => {
  const store = useAppStore()
  const state = () => store.voiceConnectionState()

  const label = createMemo(() => {
    switch (state()) {
      case 'connecting':
        return 'Connecting…'
      case 'connected':
        return t('VOICE_CONNECTED')
      case 'reconnecting':
        return 'Reconnecting…'
      case 'disconnected':
        return 'Disconnected'
      default:
        return ''
    }
  })

  const colorClass = createMemo(() => {
    switch (state()) {
      case 'connecting':
        return 'text-yellow-400'
      case 'connected':
        return 'text-green-400'
      case 'reconnecting':
        return 'text-orange-400'
      case 'disconnected':
        return 'text-red-400'
      default:
        return 'text-[var(--text-muted)]'
    }
  })

  return (
    <div class="flex items-center gap-1.5">
      <Show when={state() === 'connecting' || state() === 'reconnecting'}>
        <LoaderIcon size={12} class={colorClass()} />
      </Show>
      <Show when={state() === 'connected'}>
        <SignalIcon size={12} class={colorClass()} />
      </Show>
      <span class={`text-xs font-semibold ${colorClass()}`}>{label()}</span>
    </div>
  )
}

export const VoiceControlBar: Component = () => {
  const store = useAppStore()

  const voiceChannel = () => store.channels().find((c) => c.id === store.voiceChannelId())

  // Poll transport connection state to update store
  let stateInterval: ReturnType<typeof setInterval> | undefined
  createEffect(() => {
    if (store.voiceChannelId()) {
      const poll = () => {
        const conn = store.client()?.getVoiceConnection()
        if (!conn) {
          store.setVoiceConnectionState('disconnected')
          return
        }
        const debug = conn.debugState() as any
        const sendState = debug?.sendTransport?.connectionState
        const recvState = debug?.recvTransport?.connectionState
        if (sendState === 'connected' && recvState === 'connected') {
          store.setVoiceConnectionState('connected')
        } else if (
          sendState === 'connecting' ||
          recvState === 'connecting' ||
          sendState === 'new' ||
          recvState === 'new'
        ) {
          store.setVoiceConnectionState('connecting')
        } else if (sendState === 'failed' || recvState === 'failed') {
          store.setVoiceConnectionState('disconnected')
        } else {
          store.setVoiceConnectionState('reconnecting')
        }
      }
      poll()
      stateInterval = setInterval(poll, 2000)
    } else {
      store.setVoiceConnectionState('idle')
      if (stateInterval) clearInterval(stateInterval)
    }
  })
  onCleanup(() => {
    if (stateInterval) clearInterval(stateInterval)
  })

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
    store.setVideoEnabled(false)
    store.setScreenSharing(false)
    store.setVoiceConnectionState('idle')
  }

  const handleToggleMute = async () => {
    try {
      const conn = store.client()?.getVoiceConnection()
      if (conn) await conn.toggleAudio()
      store.setMuted(!store.isMuted())
    } catch (err) {
      console.error('[Voice] Mute toggle failed:', err)
    }
  }

  const handleToggleDeafen = async () => {
    const newDeafened = !store.isDeafened()
    store.setDeafened(newDeafened)
    if (newDeafened && !store.isMuted()) {
      const conn = store.client()?.getVoiceConnection()
      if (conn) await conn.toggleAudio()
      store.setMuted(true)
    }
    const conn = store.client()?.getVoiceConnection()
    conn?.setDeafened(newDeafened)
  }

  const handleToggleVideo = async () => {
    try {
      const conn = store.client()?.getVoiceConnection()
      if (!conn) return
      if (store.isVideoEnabled()) {
        await conn.disableVideo()
        store.setVideoEnabled(false)
      } else {
        await conn.enableVideo()
        store.setVideoEnabled(true)
      }
    } catch (err) {
      console.error('[Voice] Camera toggle failed:', err)
    }
  }

  const handleToggleScreenShare = async () => {
    try {
      const conn = store.client()?.getVoiceConnection()
      if (!conn) return
      if (store.isScreenSharing()) {
        await conn.stopScreenShare()
        store.setScreenSharing(false)
      } else {
        const desktop = (window as any).__HARMONY_DESKTOP__
        let sourceId: string | undefined
        if (desktop?.getScreenSources) {
          const sources = await desktop.getScreenSources()
          if (sources.length > 0) {
            const screen = sources.find((s: any) => s.id.startsWith('screen:')) || sources[0]
            sourceId = screen.id
          }
        }
        await conn.startScreenShare(sourceId)
        store.setScreenSharing(true)
      }
    } catch (err) {
      console.error('[Voice] Screen share toggle failed:', err)
    }
  }

  const resolveName = (did: string) => {
    const member = store.members().find((m) => m.did === did)
    return member?.displayName || pseudonymFromDid(did)
  }

  return (
    <Show when={store.voiceChannelId()}>
      <div class="bg-[var(--bg-primary)] border-t border-[var(--border)] px-3 py-2" data-testid="voice-control-bar">
        {/* Channel info + connection state */}
        <div class="flex items-center justify-between mb-1">
          <div class="flex items-center gap-2 min-w-0">
            <ConnectionStateBadge />
            <div class="flex items-center gap-1 text-[var(--text-muted)]">
              <SpeakerIcon size={12} />
              <span class="text-xs truncate">{voiceChannel()?.name ?? ''}</span>
            </div>
          </div>
        </div>

        {/* Connected users */}
        <Show when={store.voiceUsers().length > 0}>
          <div class="flex items-center gap-1 mb-2">
            <For each={store.voiceUsers()}>
              {(did) => {
                const name = resolveName(did)
                const initials = initialsFromName(name)
                return (
                  <div
                    class="w-6 h-6 rounded-full bg-[var(--accent)] flex items-center justify-center text-[10px] font-bold text-white transition-shadow"
                    classList={{
                      'ring-2 ring-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]': store.speakingUsers().has(did)
                    }}
                    title={name + (store.speakingUsers().has(did) ? ` — ${t('VOICE_SPEAKING')}` : '')}
                  >
                    {initials}
                  </div>
                )
              }}
            </For>
          </div>
        </Show>

        {/* Controls */}
        <div class="flex items-center gap-1">
          <button
            onClick={handleToggleMute}
            class="p-1.5 rounded-md hover:bg-[var(--bg-input)] transition-colors"
            classList={{
              'text-[var(--error)]': store.isMuted(),
              'text-[var(--text-secondary)]': !store.isMuted()
            }}
            title={store.isMuted() ? t('VOICE_UNMUTE') : t('VOICE_MUTE')}
            data-testid="voice-mute-btn"
          >
            <Show when={store.isMuted()} fallback={<MicIcon size={18} />}>
              <MicOffIcon size={18} />
            </Show>
          </button>

          <button
            onClick={handleToggleDeafen}
            class="p-1.5 rounded-md hover:bg-[var(--bg-input)] transition-colors"
            classList={{
              'text-[var(--error)]': store.isDeafened(),
              'text-[var(--text-secondary)]': !store.isDeafened()
            }}
            title={store.isDeafened() ? t('VOICE_UNDEAFEN') : t('VOICE_DEAFEN')}
            data-testid="voice-deafen-btn"
          >
            <Show when={store.isDeafened()} fallback={<HeadphonesIcon size={18} />}>
              <HeadphonesOffIcon size={18} />
            </Show>
          </button>

          <button
            onClick={handleToggleVideo}
            class="p-1.5 rounded-md hover:bg-[var(--bg-input)] transition-colors"
            classList={{
              'text-[var(--accent)]': store.isVideoEnabled(),
              'text-[var(--text-secondary)]': !store.isVideoEnabled()
            }}
            title={store.isVideoEnabled() ? t('VOICE_VIDEO_OFF') : t('VOICE_VIDEO_ON')}
            data-testid="voice-video-btn"
          >
            <Show when={store.isVideoEnabled()} fallback={<VideoOffIcon size={18} />}>
              <VideoIcon size={18} />
            </Show>
          </button>

          <button
            onClick={handleToggleScreenShare}
            class="p-1.5 rounded-md hover:bg-[var(--bg-input)] transition-colors"
            classList={{
              'text-[var(--accent)]': store.isScreenSharing(),
              'text-[var(--text-secondary)]': !store.isScreenSharing()
            }}
            title={store.isScreenSharing() ? t('VOICE_STOP_SCREEN_SHARE') : t('VOICE_SCREEN_SHARE')}
            data-testid="voice-screen-share-btn"
          >
            <Show when={store.isScreenSharing()} fallback={<ScreenShareIcon size={18} />}>
              <ScreenShareOffIcon size={18} />
            </Show>
          </button>

          <div class="flex-1" />

          <button
            onClick={handleDisconnect}
            class="p-1.5 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
            title={t('VOICE_DISCONNECT')}
            data-testid="voice-disconnect-btn"
          >
            <PhoneOffIcon size={18} />
          </button>
        </div>
      </div>
    </Show>
  )
}
