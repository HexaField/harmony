import { createSignal, createEffect, onCleanup, For, Show } from 'solid-js'
import type { JSX } from 'solid-js'
import { useAppStore } from '../../store'

interface VideoParticipant {
  did: string
  displayName: string
  audioTrack?: MediaStreamTrack
  videoTrack?: MediaStreamTrack
  videoStream?: MediaStream
  screenTrack?: MediaStreamTrack
  screenStream?: MediaStream
  speaking: boolean
  muted: boolean
}

function VideoTile(props: { participant: VideoParticipant; isLocal?: boolean; isScreen?: boolean }): JSX.Element {
  let videoRef: HTMLVideoElement | undefined

  createEffect(() => {
    const track = props.isScreen ? props.participant.screenTrack : props.participant.videoTrack
    const stream = props.isScreen ? props.participant.screenStream : props.participant.videoStream
    if (videoRef && track && track.readyState === 'live') {
      // Use original stream if available (avoids clone issues), otherwise wrap track
      videoRef.srcObject = stream && stream.active ? stream : new MediaStream([track])
      const attemptPlay = () => {
        videoRef?.play().catch(() => {})
      }
      attemptPlay()
      // If track is muted (TCC delay), retry on unmute
      if (track.muted) {
        const onUnmute = () => {
          attemptPlay()
          track.removeEventListener('unmute', onUnmute)
        }
        track.addEventListener('unmute', onUnmute)
      }
      // Also retry after a short delay (some browsers need time)
      setTimeout(attemptPlay, 500)
    } else if (videoRef) {
      videoRef.srcObject = null
    }
  })

  onCleanup(() => {
    if (videoRef) videoRef.srcObject = null
  })

  const hasVideo = () => {
    const track = props.isScreen ? props.participant.screenTrack : props.participant.videoTrack
    return !!track && track.readyState === 'live'
  }

  const initials = () => {
    const parts = props.participant.displayName.split(' ')
    return parts
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('')
      .substring(0, 2)
  }

  return (
    <div
      class="relative rounded-lg overflow-hidden bg-gray-800 flex items-center justify-center"
      classList={{
        'ring-2 ring-green-500': props.participant.speaking,
        'min-h-[180px]': true
      }}
    >
      <Show
        when={hasVideo()}
        fallback={
          <div class="flex flex-col items-center gap-2">
            <div class="w-16 h-16 rounded-full bg-gray-600 flex items-center justify-center text-xl font-bold text-gray-300">
              {initials()}
            </div>
            <span class="text-sm text-gray-400">{props.participant.displayName}</span>
          </div>
        }
      >
        <video
          ref={videoRef}
          autoplay
          playsinline
          muted={props.isLocal}
          class="w-full h-full object-cover"
          classList={{ 'transform scale-x-[-1]': props.isLocal && !props.isScreen }}
        />
      </Show>
      <div class="absolute bottom-2 left-2 flex items-center gap-1 bg-black/60 rounded px-2 py-0.5 text-xs text-white">
        <Show when={props.participant.muted}>
          <span class="text-red-400">🔇</span>
        </Show>
        <span>{props.participant.displayName}</span>
        <Show when={props.isLocal}>
          <span class="text-gray-400">(You)</span>
        </Show>
      </div>
    </div>
  )
}

function AudioPlayer(props: { track: MediaStreamTrack }): JSX.Element {
  let audioRef: HTMLAudioElement | undefined

  createEffect(() => {
    if (audioRef && props.track) {
      const stream = new MediaStream([props.track])
      audioRef.srcObject = stream
      audioRef.play().catch(() => {})
    }
  })

  onCleanup(() => {
    if (audioRef) audioRef.srcObject = null
  })

  return <audio ref={audioRef} autoplay />
}

export function VideoGrid(): JSX.Element {
  const store = useAppStore()
  const [participants, setParticipants] = createSignal<VideoParticipant[]>([])
  const [screenSharer, setScreenSharer] = createSignal<VideoParticipant | null>(null)

  // Re-run when voice channel, video, or mute state changes
  createEffect(() => {
    const voiceChannelId = store.voiceChannelId()
    const isVideoEnabled = store.isVideoEnabled()
    const isMuted = store.isMuted()
    const connection = store.client()?.getVoiceConnection()

    if (!connection || !voiceChannelId) {
      setParticipants([])
      setScreenSharer(null)
      return
    }

    const localDID = store.did?.() ?? 'local'
    const localName = store.displayName?.() ?? 'You'

    // Build local participant from current stream state
    const videoStream = connection.getLocalVideoStream()
    const audioStream = connection.getLocalAudioStream()
    const screenStream = connection.getLocalScreenStream()

    const localParticipant: VideoParticipant = {
      did: localDID,
      displayName: localName,
      videoTrack: isVideoEnabled ? videoStream?.getVideoTracks()[0] : undefined,
      videoStream: isVideoEnabled ? (videoStream ?? undefined) : undefined,
      audioTrack: audioStream?.getAudioTracks()[0],
      screenTrack: connection.localScreenSharing ? screenStream?.getVideoTracks()[0] : undefined,
      screenStream: connection.localScreenSharing ? (screenStream ?? undefined) : undefined,
      speaking: false,
      muted: isMuted
    }

    // Preserve existing remote participants, update local
    setParticipants((prev) => {
      const remotes = prev.filter((p) => p.did !== localDID)
      return [localParticipant, ...remotes]
    })

    if (localParticipant.screenTrack) {
      setScreenSharer(localParticipant)
    }

    // Register track callback for remote participants
    connection.onTrack((did: string, track: MediaStreamTrack, kind: 'audio' | 'video' | 'screen') => {
      if (did === localDID) return // Local tracks are handled above

      setParticipants((prev) => {
        const existing = prev.find((p) => p.did === did)
        if (existing) {
          return prev.map((p) => {
            if (p.did !== did) return p
            if (kind === 'audio') return { ...p, audioTrack: track }
            if (kind === 'video') return { ...p, videoTrack: track }
            if (kind === 'screen') return { ...p, screenTrack: track }
            return p
          })
        }
        const newP: VideoParticipant = {
          did,
          displayName: did.substring(0, 12) + '…',
          speaking: false,
          muted: false
        }
        if (kind === 'audio') newP.audioTrack = track
        if (kind === 'video') newP.videoTrack = track
        if (kind === 'screen') newP.screenTrack = track
        return [...prev, newP]
      })

      if (kind === 'screen') {
        setScreenSharer({
          did,
          displayName: did.substring(0, 12) + '…',
          screenTrack: track,
          speaking: false,
          muted: false
        })
      }
    })

    // Speaking detection
    connection.onSpeakingChanged((did: string, speaking: boolean) => {
      setParticipants((prev) => prev.map((p) => (p.did === did ? { ...p, speaking } : p)))
    })
  })

  const gridCols = () => {
    const count = participants().length
    if (count <= 1) return 'grid-cols-1'
    if (count <= 4) return 'grid-cols-2'
    if (count <= 9) return 'grid-cols-3'
    return 'grid-cols-4'
  }

  return (
    <div class="flex-shrink-0 p-4">
      <Show when={screenSharer()}>
        {(sharer) => (
          <div class="mb-4">
            <VideoTile participant={sharer()} isScreen />
          </div>
        )}
      </Show>
      <div class={`grid ${gridCols()} gap-2`}>
        <For each={participants()}>
          {(p) => (
            <>
              <VideoTile participant={p} isLocal={p.did === (store.did?.() ?? 'local')} />
              <Show when={p.audioTrack && p.did !== (store.did?.() ?? 'local')}>
                <AudioPlayer track={p.audioTrack!} />
              </Show>
            </>
          )}
        </For>
      </div>
    </div>
  )
}

export default VideoGrid
