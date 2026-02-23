import { Show, type JSX } from 'solid-js'

export interface VoiceControlsProps {
  audioEnabled: boolean
  videoEnabled: boolean
  screenSharing: boolean
  onToggleAudio: () => void
  onToggleVideo: () => void
  onToggleScreenShare: () => void
  onDisconnect: () => void
}

export function useVoiceControls(props: VoiceControlsProps) {
  return {
    audioEnabled: () => props.audioEnabled,
    videoEnabled: () => props.videoEnabled,
    screenSharing: () => props.screenSharing,
    toggleAudio: () => props.onToggleAudio(),
    toggleVideo: () => props.onToggleVideo(),
    toggleScreenShare: () => props.onToggleScreenShare(),
    disconnect: () => props.onDisconnect()
  }
}

export function VoiceControls(props: VoiceControlsProps): JSX.Element {
  const ctrl = useVoiceControls(props)

  return (
    <div class="flex items-center justify-center gap-3 py-3 px-4 bg-hm-bg-darker rounded-lg">
      <button
        class={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
          ctrl.audioEnabled() ? "bg-hm-bg-dark text-white hover:bg-hm-bg" : "bg-red-500 text-white hover:bg-red-600"
        }`}
        onClick={() => ctrl.toggleAudio()}
        title={ctrl.audioEnabled() ? 'Mute' : 'Unmute'}
      >
        {ctrl.audioEnabled() ? '🎤' : '🔇'}
      </button>

      <button
        class={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
          ctrl.videoEnabled()
            ? "bg-hm-accent text-white hover:bg-hm-accent/80"
            : "bg-hm-bg-dark text-white hover:bg-hm-bg"
        }`}
        onClick={() => ctrl.toggleVideo()}
        title={ctrl.videoEnabled() ? 'Stop Video' : 'Start Video'}
      >
        📹
      </button>

      <button
        class={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
          ctrl.screenSharing()
            ? "bg-hm-accent text-white hover:bg-hm-accent/80"
            : "bg-hm-bg-dark text-white hover:bg-hm-bg"
        }`}
        onClick={() => ctrl.toggleScreenShare()}
        title={ctrl.screenSharing() ? 'Stop Sharing' : 'Share Screen'}
      >
        🖥️
      </button>

      <div class="w-px h-6 bg-hm-bg mx-1" />

      <button
        class="w-10 h-10 flex items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
        onClick={() => ctrl.disconnect()}
        title="Disconnect"
      >
        ✕
      </button>
    </div>
  )
}
