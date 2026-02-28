import { createSignal, createEffect, onCleanup, For, Show } from 'solid-js'
import type { JSX } from 'solid-js'
import { useAppStore } from '../../store'
import { pseudonymFromDid, initialsFromName } from '../../utils/pseudonym'
import { MicOffIcon } from './VoiceIcons'

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
      videoRef.srcObject = stream && stream.active ? stream : new MediaStream([track])
      const attemptPlay = () => {
        videoRef?.play().catch(() => {})
      }
      attemptPlay()
      if (track.muted) {
        const onUnmute = () => {
          attemptPlay()
          track.removeEventListener('unmute', onUnmute)
        }
        track.addEventListener('unmute', onUnmute)
      }
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

  const initials = () => initialsFromName(props.participant.displayName)

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
          <MicOffIcon size={12} class="text-red-400" />
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
  let callbacksRegistered = false

  const resolveDisplayName = (did: string) => {
    const member = store.members().find((m) => m.did === did)
    return member?.displayName || pseudonymFromDid(did)
  }

  // Setup: register callbacks once when we enter a voice channel
  createEffect(() => {
    const voiceChannelId = store.voiceChannelId()
    const connection = store.client()?.getVoiceConnection()

    if (!connection || !voiceChannelId) {
      setParticipants([])
      setScreenSharer(null)
      callbacksRegistered = false
      return
    }

    if (!callbacksRegistered) {
      callbacksRegistered = true

      // New remote track arrived
      connection.onTrack((did: string, track: MediaStreamTrack, kind: 'audio' | 'video' | 'screen') => {
        const localDID = store.did?.() ?? 'local'
        if (did === localDID) return // local handled separately

        setParticipants((prev) => {
          const existing = prev.find((p) => p.did === did)
          const name = resolveDisplayName(did)
          if (existing) {
            return prev.map((p) => {
              if (p.did !== did) return p
              if (kind === 'audio') return { ...p, audioTrack: track, displayName: name }
              if (kind === 'video') return { ...p, videoTrack: track, displayName: name }
              if (kind === 'screen') return { ...p, screenTrack: track, displayName: name }
              return p
            })
          }
          const newP: VideoParticipant = { did, displayName: name, speaking: false, muted: false }
          if (kind === 'audio') newP.audioTrack = track
          if (kind === 'video') newP.videoTrack = track
          if (kind === 'screen') newP.screenTrack = track
          return [...prev, newP]
        })

        if (kind === 'screen') {
          setScreenSharer({
            did,
            displayName: resolveDisplayName(did),
            screenTrack: track,
            speaking: false,
            muted: false
          })
        }
      })

      // Remote track removed (producer closed on other side)
      connection.onTrackRemoved((did: string, kind: 'audio' | 'video' | 'screen') => {
        setParticipants((prev) =>
          prev
            .map((p) => {
              if (p.did !== did) return p
              if (kind === 'audio') return { ...p, audioTrack: undefined }
              if (kind === 'video') return { ...p, videoTrack: undefined, videoStream: undefined }
              if (kind === 'screen') return { ...p, screenTrack: undefined, screenStream: undefined }
              return p
            })
            .filter((p) => {
              // Remove participant entirely if they have no tracks left
              const localDID = store.did?.() ?? 'local'
              if (p.did === localDID) return true
              return p.audioTrack || p.videoTrack || p.screenTrack
            })
        )
        if (kind === 'screen') {
          setScreenSharer((prev) => (prev?.did === did ? null : prev))
        }
      })

      // Speaking state from voice client (local)
      connection.onSpeakingChanged((did: string, speaking: boolean) => {
        setParticipants((prev) => prev.map((p) => (p.did === did ? { ...p, speaking } : p)))
      })
    }
  })

  // Reactive: update local participant and sync speaking from store
  createEffect(() => {
    const voiceChannelId = store.voiceChannelId()
    const isVideoEnabled = store.isVideoEnabled()
    const isMuted = store.isMuted()
    const speakingSet = store.speakingUsers()
    const connection = store.client()?.getVoiceConnection()

    if (!connection || !voiceChannelId) return

    const localDID = store.did?.() ?? 'local'
    const localName = store.displayName?.() ?? 'You'

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
      speaking: speakingSet.has(localDID),
      muted: isMuted
    }

    setParticipants((prev) => {
      const remotes = prev
        .filter((p) => p.did !== localDID)
        .map((p) => ({
          ...p,
          speaking: speakingSet.has(p.did), // sync remote speaking from store signal
          displayName: resolveDisplayName(p.did) // keep names fresh
        }))
      return [localParticipant, ...remotes]
    })

    if (localParticipant.screenTrack) {
      setScreenSharer(localParticipant)
    } else {
      setScreenSharer((prev) => (prev?.did === localDID ? null : prev))
    }
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
