import { createSignal, createEffect, onCleanup, For, Show } from 'solid-js'
import type { JSX } from 'solid-js'
import { useStore } from '../../store'

interface VideoParticipant {
  did: string
  displayName: string
  audioTrack?: MediaStreamTrack
  videoTrack?: MediaStreamTrack
  screenTrack?: MediaStreamTrack
  speaking: boolean
  muted: boolean
}

function VideoTile(props: { participant: VideoParticipant; isLocal?: boolean; isScreen?: boolean }): JSX.Element {
  let videoRef: HTMLVideoElement | undefined

  createEffect(() => {
    const track = props.isScreen ? props.participant.screenTrack : props.participant.videoTrack
    if (videoRef && track) {
      const stream = new MediaStream([track])
      videoRef.srcObject = stream
      videoRef.play().catch(() => {})
    } else if (videoRef) {
      videoRef.srcObject = null
    }
  })

  onCleanup(() => {
    if (videoRef) videoRef.srcObject = null
  })

  const hasVideo = () => (props.isScreen ? !!props.participant.screenTrack : !!props.participant.videoTrack)
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
  const store = useStore()
  const [participants, setParticipants] = createSignal<VideoParticipant[]>([])
  const [screenSharer, setScreenSharer] = createSignal<VideoParticipant | null>(null)

  createEffect(() => {
    const connection = store.client()?.getVoiceConnection()
    if (!connection) {
      setParticipants([])
      setScreenSharer(null)
      return
    }

    // Listen for tracks
    const conn = connection as any
    if (typeof conn.onTrack === 'function') {
      conn.onTrack((did: string, track: MediaStreamTrack, kind: 'audio' | 'video' | 'screen') => {
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
            displayName: did.substring(0, 8),
            speaking: false,
            muted: false
          }
          if (kind === 'audio') newP.audioTrack = track
          if (kind === 'video') newP.videoTrack = track
          if (kind === 'screen') newP.screenTrack = track
          return [...prev, newP]
        })

        if (kind === 'screen') {
          setScreenSharer((prev) => {
            const p = participants().find((p) => p.did === did)
            return p ?? { did, displayName: did.substring(0, 8), screenTrack: track, speaking: false, muted: false }
          })
        }
      })

      // Speaking changes
      conn.onSpeakingChanged?.((did: string, speaking: boolean) => {
        setParticipants((prev) => prev.map((p) => (p.did === did ? { ...p, speaking } : p)))
      })
    }

    // Add local participant
    const localStream = conn.getLocalVideoStream?.() as MediaStream | null
    const localAudio = conn.getLocalAudioStream?.() as MediaStream | null
    const localDID = store.did?.() ?? 'local'
    const localName = store.displayName?.() ?? 'You'

    setParticipants([
      {
        did: localDID,
        displayName: localName,
        videoTrack: localStream?.getVideoTracks()[0],
        audioTrack: localAudio?.getAudioTracks()[0],
        speaking: false,
        muted: store.isMuted()
      }
    ])
  })

  const gridCols = () => {
    const count = participants().length
    if (count <= 1) return 'grid-cols-1'
    if (count <= 4) return 'grid-cols-2'
    if (count <= 9) return 'grid-cols-3'
    return 'grid-cols-4'
  }

  return (
    <div class="flex-1 p-4">
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
