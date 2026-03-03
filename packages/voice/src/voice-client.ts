import type { VoiceConnection, VoiceParticipant, JoinOptions } from './room-manager.js'
import type { E2EEBridge } from './e2ee-bridge.js'
import type { ClientSFUAdapter } from './sfu-adapter.js'
import { createEncryptTransform, createDecryptTransform } from './insertable-streams.js'
import { P2PMeshManager } from './p2p-mesh.js'
import type { P2PMeshConfig } from './p2p-mesh.js'

type ParticipantJoinedCb = (p: VoiceParticipant) => void
type ParticipantLeftCb = (did: string) => void
type SpeakingChangedCb = (did: string, speaking: boolean) => void
type MediaStreamTrackCb = (did: string, track: MediaStreamTrack, kind: 'audio' | 'video' | 'screen') => void
type TrackRemovedCb = (did: string, kind: 'audio' | 'video' | 'screen') => void

/** Injectable media device provider for testability */
export interface MediaDeviceProvider {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>
  getDisplayMedia(constraints: DisplayMediaStreamOptions): Promise<MediaStream>
}

/** Default browser-based media provider */
export const BrowserMediaProvider: MediaDeviceProvider = {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      throw new Error('Media devices not available in this environment')
    }
    return navigator.mediaDevices.getUserMedia(constraints)
  },
  getDisplayMedia(constraints: DisplayMediaStreamOptions): Promise<MediaStream> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      throw new Error('Media devices not available in this environment')
    }
    return navigator.mediaDevices.getDisplayMedia(constraints)
  }
}

/**
 * Signaling interface for voice communication.
 * The HarmonyClient implements this to route messages through the existing WebSocket.
 */
export interface VoiceSignaling {
  /** Send a signaling message to the server and await response */
  sendVoiceSignal(type: string, payload: Record<string, unknown>): Promise<Record<string, unknown>>
  /** Send a signaling message without awaiting a response (fire-and-forget) */
  fireVoiceSignal?(type: string, payload: Record<string, unknown>): void
  /** Register a handler for incoming voice signaling messages */
  onVoiceSignal(type: string, handler: (payload: Record<string, unknown>) => void): void
  /** Remove a handler */
  offVoiceSignal(type: string, handler: (payload: Record<string, unknown>) => void): void
}

export interface VoiceClientOptions {
  mediaProvider?: MediaDeviceProvider
  e2eeBridge?: E2EEBridge
  /** Client-side SFU adapter. If not provided, voice operates in signaling-only mode (no media). */
  sfuAdapter?: ClientSFUAdapter
  /** Signaling interface for voice communication */
  signaling?: VoiceSignaling
  /**
   * @deprecated Use sfuAdapter instead. Kept for backward compat with test code.
   * 'cf' = CloudflareSFUAdapter, 'test' = no SFU adapter (signaling only)
   */
  mode?: 'cf' | 'test'
}

export interface JoinRoomOptions extends JoinOptions {
  /** Voice mode from server. 'signaling' = P2P mesh, 'cf' = CF SFU */
  mode?: 'signaling' | 'cf'
  /** ICE servers from server config */
  iceServers?: RTCIceServer[]
}

/**
 * Client-side voice connection. Supports CF Realtime SFU (via ClientSFUAdapter)
 * and a test/signaling-only mode for environments without WebRTC.
 */
export class VoiceClient {
  private connection: VoiceConnectionImpl | null = null
  private mediaProvider: MediaDeviceProvider
  private e2eeBridge?: E2EEBridge
  private sfuAdapter?: ClientSFUAdapter
  private signaling?: VoiceSignaling

  constructor(mediaProviderOrOpts?: MediaDeviceProvider | VoiceClientOptions) {
    if (mediaProviderOrOpts && 'getUserMedia' in mediaProviderOrOpts) {
      this.mediaProvider = mediaProviderOrOpts
    } else {
      const opts = mediaProviderOrOpts as VoiceClientOptions | undefined
      this.mediaProvider = opts?.mediaProvider ?? BrowserMediaProvider
      this.e2eeBridge = opts?.e2eeBridge
      this.sfuAdapter = opts?.sfuAdapter
      this.signaling = opts?.signaling
    }
  }

  /**
   * Set or rotate the E2EE encryption key for voice frames.
   * Delegates to the E2EEBridge's epoch change mechanism.
   */
  setEncryptionKey(key: Uint8Array, epoch: number): void {
    if (!this.e2eeBridge) {
      throw new Error('E2EE bridge not configured')
    }
    this.e2eeBridge.onEpochChange(key, epoch)
  }

  /** Get the E2EE bridge instance (if configured) */
  getE2EEBridge(): E2EEBridge | undefined {
    return this.e2eeBridge
  }

  setSignaling(signaling: VoiceSignaling): void {
    this.signaling = signaling
  }

  setSFUAdapter(adapter: ClientSFUAdapter): void {
    this.sfuAdapter = adapter
  }

  async joinRoom(token: string, opts?: JoinRoomOptions): Promise<VoiceConnection> {
    let roomId: string
    let participantId: string

    try {
      const decoded = typeof Buffer !== 'undefined' ? Buffer.from(token, 'base64').toString() : atob(token)
      const tokenData = JSON.parse(decoded)
      roomId = tokenData.room ?? tokenData.roomId ?? ''
      participantId = tokenData.participant ?? tokenData.participantId ?? ''
    } catch {
      // Try JWT-style token (base64url segments)
      try {
        const base64 = token.split('.')[1]
        const json =
          typeof Buffer !== 'undefined'
            ? Buffer.from(base64, 'base64').toString()
            : decodeURIComponent(
                atob(base64)
                  .split('')
                  .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                  .join('')
              )
        const payload = JSON.parse(json)
        roomId = payload.room ?? payload.roomId ?? ''
        participantId = payload.participant ?? payload.participantId ?? ''
      } catch {
        throw new Error('Invalid token')
      }
    }

    const voiceMode = opts?.mode ?? 'signaling'

    const conn = new VoiceConnectionImpl(
      roomId,
      participantId,
      opts?.audioEnabled ?? true,
      opts?.videoEnabled ?? false,
      this.mediaProvider,
      this.e2eeBridge,
      voiceMode === 'cf' ? this.sfuAdapter : undefined,
      this.signaling,
      voiceMode,
      opts?.iceServers,
      () => {
        this.connection = null
      }
    )

    if (voiceMode === 'cf' && this.sfuAdapter && this.signaling) {
      // CF SFU mode
      try {
        await conn.initSFUSession()
      } catch (err) {
        console.debug('[Voice] SFU init failed, proceeding in signaling-only mode:', err)
      }
    } else if (voiceMode === 'signaling' && this.signaling) {
      // P2P mesh mode
      await conn.initP2PMesh()
    }

    this.connection = conn
    return conn
  }

  async leaveRoom(): Promise<void> {
    if (this.connection) {
      await this.connection.disconnect()
      this.connection = null
    }
  }

  getActiveRoom(): VoiceConnection | null {
    return this.connection
  }
}

class VoiceConnectionImpl implements VoiceConnection {
  roomId: string
  participants: VoiceParticipant[] = []
  localAudioEnabled: boolean
  localVideoEnabled: boolean
  localScreenSharing: boolean = false
  private localDID: string
  private joinedCbs: ParticipantJoinedCb[] = []
  private leftCbs: ParticipantLeftCb[] = []
  private speakingCbs: SpeakingChangedCb[] = []
  private trackCbs: MediaStreamTrackCb[] = []
  private trackRemovedCbs: TrackRemovedCb[] = []
  private disconnected = false
  private mediaProvider: MediaDeviceProvider
  private e2eeBridge?: E2EEBridge
  private sfuAdapter?: ClientSFUAdapter
  private signaling?: VoiceSignaling
  private disconnectCb: () => void

  // SFU session state
  private sessionId: string | null = null

  // P2P mesh state
  private meshManager: P2PMeshManager | null = null
  private voiceMode: 'signaling' | 'cf'
  private iceServers?: RTCIceServer[]
  private signalingHandlers: Array<{ type: string; handler: (payload: Record<string, unknown>) => void }> = []

  // Track management
  private localTrackMids = new Map<string, string>() // trackName → mid
  private remoteTrackOwners = new Map<string, { participantId: string; kind: 'audio' | 'video' | 'screen' }>()

  // Local media streams
  private audioStream: MediaStream | null = null
  private videoStream: MediaStream | null = null
  private screenStream: MediaStream | null = null

  // Audio analysis for speaking detection
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private speakingInterval: ReturnType<typeof setInterval> | null = null
  private lastSpeakingState = false

  constructor(
    roomId: string,
    localDID: string,
    audioEnabled: boolean,
    videoEnabled: boolean,
    mediaProvider: MediaDeviceProvider,
    e2eeBridge: E2EEBridge | undefined,
    sfuAdapter: ClientSFUAdapter | undefined,
    signaling: VoiceSignaling | undefined,
    voiceMode: 'signaling' | 'cf',
    iceServers: RTCIceServer[] | undefined,
    disconnectCb: () => void
  ) {
    this.roomId = roomId
    this.localDID = localDID
    this.localAudioEnabled = audioEnabled
    this.localVideoEnabled = videoEnabled
    this.mediaProvider = mediaProvider
    this.e2eeBridge = e2eeBridge
    this.sfuAdapter = sfuAdapter
    this.signaling = signaling
    this.voiceMode = voiceMode
    this.iceServers = iceServers
    this.disconnectCb = disconnectCb
  }

  get hasSFU(): boolean {
    return this.sfuAdapter !== undefined && this.sessionId !== null
  }
  get hasE2EE(): boolean {
    return this.e2eeBridge?.hasKey() ?? false
  }

  /**
   * Initialize SFU session — create session, push initial tracks, set up listeners.
   */
  async initSFUSession(): Promise<void> {
    if (!this.sfuAdapter || !this.signaling) return

    try {
      this.sessionId = await this.sfuAdapter.createSession()

      // If audio enabled on join, acquire and push audio
      if (this.localAudioEnabled) {
        await this.startAudioTrack()
      }

      // Attach E2EE transforms to the peer connection
      this.attachE2EETransforms()

      // Listen for new tracks from other participants
      this.signaling.onVoiceSignal('voice.track.published', async (payload) => {
        const kind = payload.kind as string
        const mediaKind: 'audio' | 'video' | 'screen' =
          (payload.mediaType as string) === 'screen' ? 'screen' : (kind as 'audio' | 'video')
        const trackName = payload.trackName as string
        const remoteSessionId = payload.sessionId as string
        const participantId = payload.participantId as string

        this.remoteTrackOwners.set(trackName, { participantId, kind: mediaKind })
        await this.pullRemoteTrack(remoteSessionId, trackName, participantId, mediaKind)
      })

      // Listen for track removal
      this.signaling.onVoiceSignal('voice.track.removed', (payload) => {
        const trackName = payload.trackName as string
        const owner = this.remoteTrackOwners.get(trackName)
        if (owner) {
          for (const cb of this.trackRemovedCbs) cb(owner.participantId, owner.kind)
          this.remoteTrackOwners.delete(trackName)
        }
      })

      // Request existing tracks from other participants already in the room
      const existing = await this.signaling.sendVoiceSignal('voice.get-producers', {
        roomId: this.roomId
      })
      if (Array.isArray(existing.producers)) {
        for (const p of existing.producers) {
          const mediaKind: 'audio' | 'video' | 'screen' = p.mediaType === 'screen' ? 'screen' : p.kind
          const trackName = p.trackName ?? p.producerId
          const remoteSessionId = p.sessionId ?? ''
          this.remoteTrackOwners.set(trackName, { participantId: p.participantId, kind: mediaKind })
          await this.pullRemoteTrack(remoteSessionId, trackName, p.participantId, mediaKind)
        }
      }

      console.debug('[Voice] SFU session established:', this.sessionId)
    } catch (err) {
      console.error('[Voice] SFU init failed:', err)
      throw err
    }
  }

  /**
   * Initialize P2P mesh mode — wire signaling listeners for participant events and WebRTC signaling.
   */
  async initP2PMesh(): Promise<void> {
    if (!this.signaling) return

    const config: P2PMeshConfig = {
      e2eeBridge: this.e2eeBridge
    }
    if (this.iceServers) {
      config.rtcConfig = { iceServers: this.iceServers }
    }

    this.meshManager = new P2PMeshManager(this.signaling, this.localDID, config)

    // Wire callbacks
    this.meshManager.onRemoteTrack = (did, track, kind) => {
      for (const cb of this.trackCbs) cb(did, track, kind)
    }
    this.meshManager.onRemoteTrackRemoved = (did, kind) => {
      for (const cb of this.trackRemovedCbs) cb(did, kind)
    }
    this.meshManager.onPeerConnectionStateChanged = (did, state) => {
      console.debug(`[Voice P2P] Peer ${did} connection state: ${state}`)
    }

    // Acquire audio BEFORE registering signaling handlers so localTracks
    // is populated when addPeer() runs in response to voice.state
    if (this.localAudioEnabled) {
      await this.startAudioTrackP2P()
    }

    // Listen for participant joined/left from voice.state events
    const stateHandler = (payload: Record<string, unknown>) => {
      // voice.state carries the full participant list — used on initial join
      const participants = payload.participants as string[] | undefined
      const participantDetails = payload.participantDetails as Array<{ did: string }> | undefined
      if (participants) {
        for (const did of participants) {
          if (did !== this.localDID && !this.meshManager?.getPeers().has(did)) {
            // We're the joiner — existing participants are already there, we initiate
            const isInitiator = this.localDID > did
            this.meshManager?.addPeer(did, isInitiator)
          }
        }
      }
      if (participantDetails) {
        // Update participants array
        this.participants = participantDetails.map((p) => ({
          did: (p as Record<string, unknown>).did as string,
          joinedAt: ((p as Record<string, unknown>).joinedAt as string) ?? new Date().toISOString(),
          audioEnabled: ((p as Record<string, unknown>).audioEnabled as boolean) ?? false,
          videoEnabled: ((p as Record<string, unknown>).videoEnabled as boolean) ?? false,
          screenSharing: ((p as Record<string, unknown>).screenSharing as boolean) ?? false,
          speaking: ((p as Record<string, unknown>).speaking as boolean) ?? false
        }))
      }
    }
    this.signaling.onVoiceSignal('voice.state', stateHandler)
    this.signalingHandlers.push({ type: 'voice.state', handler: stateHandler })

    // Participant joined
    const joinedHandler = (payload: Record<string, unknown>) => {
      const did = (payload.did as string) ?? (payload.sender as string)
      if (!did || did === this.localDID) return
      // New participant joined — they will be the "newer" peer, we initiate if our DID > theirs
      const isInitiator = this.localDID > did
      this.meshManager?.addPeer(did, isInitiator)

      const p: VoiceParticipant = {
        did,
        joinedAt: new Date().toISOString(),
        audioEnabled: false,
        videoEnabled: false,
        screenSharing: false,
        speaking: false
      }
      this.participants.push(p)
      for (const cb of this.joinedCbs) cb(p)
    }
    this.signaling.onVoiceSignal('voice.participant.joined', joinedHandler)
    this.signalingHandlers.push({ type: 'voice.participant.joined', handler: joinedHandler })

    // Participant left
    const leftHandler = (payload: Record<string, unknown>) => {
      const did = (payload.did as string) ?? (payload.sender as string)
      if (!did || did === this.localDID) return
      this.meshManager?.removePeer(did)
      this.participants = this.participants.filter((p) => p.did !== did)
      for (const cb of this.leftCbs) cb(did)
    }
    this.signaling.onVoiceSignal('voice.participant.left', leftHandler)
    this.signalingHandlers.push({ type: 'voice.participant.left', handler: leftHandler })

    // WebRTC signaling: offer/answer/ice
    const offerHandler = (payload: Record<string, unknown>) => {
      const msg = payload as Record<string, unknown>
      const fromDID = (msg.sender as string) ?? (msg.fromDID as string)
      const sdp = (msg.payload as Record<string, unknown>)?.sdp ?? msg.sdp
      if (fromDID && sdp) {
        this.meshManager?.handleOffer(fromDID, sdp as RTCSessionDescriptionInit)
      }
    }
    this.signaling.onVoiceSignal('voice.offer', offerHandler)
    this.signalingHandlers.push({ type: 'voice.offer', handler: offerHandler })

    const answerHandler = (payload: Record<string, unknown>) => {
      const msg = payload as Record<string, unknown>
      const fromDID = (msg.sender as string) ?? (msg.fromDID as string)
      const sdp = (msg.payload as Record<string, unknown>)?.sdp ?? msg.sdp
      if (fromDID && sdp) {
        this.meshManager?.handleAnswer(fromDID, sdp as RTCSessionDescriptionInit)
      }
    }
    this.signaling.onVoiceSignal('voice.answer', answerHandler)
    this.signalingHandlers.push({ type: 'voice.answer', handler: answerHandler })

    const iceHandler = (payload: Record<string, unknown>) => {
      const msg = payload as Record<string, unknown>
      const fromDID = (msg.sender as string) ?? (msg.fromDID as string)
      const candidate = (msg.payload as Record<string, unknown>)?.candidate ?? msg.candidate
      if (fromDID && candidate) {
        this.meshManager?.handleIceCandidate(fromDID, candidate as RTCIceCandidateInit)
      }
    }
    this.signaling.onVoiceSignal('voice.ice', iceHandler)
    this.signalingHandlers.push({ type: 'voice.ice', handler: iceHandler })

    console.debug('[Voice] P2P mesh mode initialized')
  }

  /**
   * Start audio track in P2P mode — acquire media and add to mesh.
   */
  private async startAudioTrackP2P(): Promise<void> {
    try {
      this.audioStream = await this.mediaProvider.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      const audioTrack = this.audioStream.getAudioTracks()[0]
      if (!audioTrack) return

      this.meshManager?.addLocalTrack(audioTrack, 'audio')
      this.setupSpeakingDetection(this.audioStream)
      this.localAudioEnabled = true
    } catch (err) {
      console.error('[Voice] P2P audio start failed:', err)
    }
  }

  /**
   * Push a local media track to the SFU.
   */
  private async pushLocalTrack(track: MediaStreamTrack, trackName: string): Promise<void> {
    if (!this.sfuAdapter || !this.sessionId) return

    const pc = this.sfuAdapter.getPeerConnection()
    if (pc) {
      pc.addTrack(track)

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const result = await this.sfuAdapter.pushTracks(
        this.sessionId,
        [{ location: 'local', trackName }],
        offer.sdp ?? ''
      )

      // Store the mid for this track
      const trackInfo = result.tracks.find((t) => t.trackName === trackName)
      if (trackInfo) {
        this.localTrackMids.set(trackName, trackInfo.mid)
      }

      // Notify server about the new published track
      this.signaling?.fireVoiceSignal?.('voice.track.published', {
        roomId: this.roomId,
        sessionId: this.sessionId,
        trackName,
        kind: track.kind,
        mediaType: trackName // 'audio', 'video', or 'screen'
      })
    }
  }

  /**
   * Pull a remote track from the SFU.
   */
  private async pullRemoteTrack(
    remoteSessionId: string,
    trackName: string,
    participantId: string,
    kind: 'audio' | 'video' | 'screen'
  ): Promise<void> {
    if (!this.sfuAdapter || !this.sessionId) return

    try {
      await this.sfuAdapter.pullTracks(this.sessionId, remoteSessionId, [trackName])

      // The track should now be available on the peer connection
      const pc = this.sfuAdapter.getPeerConnection()
      if (pc) {
        // Find the new track by looking at receivers
        const receivers = pc.getReceivers()
        const receiver = receivers.find((r) => {
          if (!r.track) return false
          // Match by track kind for the most recently added track
          const expectedKind = kind === 'screen' ? 'video' : kind
          return r.track.kind === expectedKind && r.track.readyState === 'live'
        })

        if (receiver?.track) {
          // Attach E2EE decrypt transform
          this.attachReceiverTransform(receiver, kind === 'screen' ? 'video' : kind)
          for (const cb of this.trackCbs) cb(participantId, receiver.track, kind)
        }
      }
    } catch (err) {
      console.error('[Voice] Failed to pull remote track:', err)
    }
  }

  /**
   * Close a local track — remove from SFU and stop the media track.
   */
  private async closeLocalTrack(trackName: string, stream: MediaStream | null): Promise<void> {
    const mid = this.localTrackMids.get(trackName)

    if (mid && this.sfuAdapter && this.sessionId) {
      await this.sfuAdapter.closeTracks(this.sessionId, [mid])
    }

    if (stream) {
      for (const track of stream.getTracks()) track.stop()
    }

    this.localTrackMids.delete(trackName)

    // Notify server this track is gone
    this.signaling?.fireVoiceSignal?.('voice.track.removed', {
      roomId: this.roomId,
      sessionId: this.sessionId,
      trackName
    })
  }

  private async startAudioTrack(): Promise<void> {
    try {
      this.audioStream = await this.mediaProvider.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      const audioTrack = this.audioStream.getAudioTracks()[0]
      if (!audioTrack) return

      await this.pushLocalTrack(audioTrack, 'audio')

      // Attach E2EE encrypt transform to the sender
      this.attachSenderTransformForTrack(audioTrack, 'audio')

      // Set up speaking detection
      this.setupSpeakingDetection(this.audioStream)

      this.localAudioEnabled = true
    } catch (err) {
      console.error('[Voice] Failed to start audio:', err)
    }
  }

  /**
   * Attach E2EE transforms to all senders/receivers on the peer connection.
   */
  private attachE2EETransforms(): void {
    if (!this.e2eeBridge) return
    const pc = this.sfuAdapter?.getPeerConnection()
    if (!pc) return

    // Handle new tracks via the ontrack event
    pc.ontrack = (event) => {
      const receiver = event.receiver
      const trackKind = event.track.kind as 'audio' | 'video'
      this.attachReceiverTransform(receiver, trackKind)
    }
  }

  /**
   * Attach encrypt transform to a specific sender (found by matching the track).
   */
  private attachSenderTransformForTrack(track: MediaStreamTrack, kind: 'audio' | 'video'): void {
    if (!this.e2eeBridge) return
    const pc = this.sfuAdapter?.getPeerConnection()
    if (!pc) return

    const sender = pc.getSenders().find((s) => s.track === track)
    if (!sender) return

    this.attachSenderTransform(sender, kind)
  }

  /**
   * Attach an encrypt TransformStream to an RTCRtpSender.
   * Uses the Insertable Streams / Encoded Transforms API when available.
   */
  private attachSenderTransform(sender: RTCRtpSender, kind: 'audio' | 'video'): void {
    if (!this.e2eeBridge) return

    try {
      if ('createEncodedStreams' in sender) {
        const { readable, writable } = (
          sender as unknown as { createEncodedStreams(): { readable: ReadableStream; writable: WritableStream } }
        ).createEncodedStreams()
        const transform = createEncryptTransform(this.e2eeBridge, kind)
        readable.pipeThrough(transform).pipeTo(writable)
      } else {
        console.debug('[Voice] Insertable Streams not available on sender — no E2EE for this track')
      }
    } catch (err) {
      console.warn('[Voice] Failed to attach sender E2EE transform (graceful degradation):', err)
    }
  }

  /**
   * Attach a decrypt TransformStream to an RTCRtpReceiver.
   */
  private attachReceiverTransform(receiver: RTCRtpReceiver, kind: 'audio' | 'video'): void {
    if (!this.e2eeBridge) return

    try {
      if ('createEncodedStreams' in receiver) {
        const { readable, writable } = (
          receiver as unknown as { createEncodedStreams(): { readable: ReadableStream; writable: WritableStream } }
        ).createEncodedStreams()
        const transform = createDecryptTransform(this.e2eeBridge, kind)
        readable.pipeThrough(transform).pipeTo(writable)
      } else {
        console.debug('[Voice] Insertable Streams not available on receiver — no E2EE for this track')
      }
    } catch (err) {
      console.warn('[Voice] Failed to attach receiver E2EE transform (graceful degradation):', err)
    }
  }

  private setupSpeakingDetection(stream: MediaStream): void {
    this.cleanupSpeakingDetection()
    try {
      this.audioContext = new AudioContext()
      const source = this.audioContext.createMediaStreamSource(stream)
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 512
      this.analyser.smoothingTimeConstant = 0.4
      source.connect(this.analyser)

      const dataArray = new Uint8Array(this.analyser.frequencyBinCount)

      this.speakingInterval = setInterval(() => {
        if (!this.analyser) return
        this.analyser.getByteFrequencyData(dataArray)
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
        const isSpeaking = average > 15
        if (isSpeaking !== this.lastSpeakingState) {
          this.lastSpeakingState = isSpeaking
          for (const cb of this.speakingCbs) cb(this.localDID, isSpeaking)
          this.signaling?.fireVoiceSignal?.('voice.speaking', { speaking: isSpeaking })
        }
      }, 100)
    } catch {
      // AudioContext not available (e.g. test env)
    }
  }

  private cleanupSpeakingDetection(): void {
    if (this.speakingInterval) {
      clearInterval(this.speakingInterval)
      this.speakingInterval = null
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {})
      this.audioContext = null
    }
    this.analyser = null
    if (this.lastSpeakingState) {
      this.lastSpeakingState = false
      for (const cb of this.speakingCbs) cb(this.localDID, false)
      this.signaling?.fireVoiceSignal?.('voice.speaking', { speaking: false })
    }
  }

  // --- Public API ---

  async toggleAudio(): Promise<void> {
    if (this.localAudioEnabled) {
      this.cleanupSpeakingDetection()
      if (this.meshManager) {
        this.meshManager.removeLocalTrack('audio')
        if (this.audioStream) {
          for (const t of this.audioStream.getTracks()) t.stop()
        }
      } else {
        await this.closeLocalTrack('audio', this.audioStream)
      }
      this.audioStream = null
      this.localAudioEnabled = false
      this.signaling?.fireVoiceSignal?.('voice.mute', {})
    } else {
      try {
        if (this.meshManager) {
          await this.startAudioTrackP2P()
        } else {
          await this.startAudioTrack()
        }
        this.signaling?.fireVoiceSignal?.('voice.unmute', {})
      } catch (err) {
        console.error('[Voice] Failed to re-enable audio:', err)
      }
    }
  }

  async toggleVideo(): Promise<void> {
    if (this.localVideoEnabled) {
      await this.disableVideo()
    } else {
      await this.enableVideo()
    }
  }

  async enableVideo(): Promise<void> {
    try {
      this.videoStream = await this.mediaProvider.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        }
      })

      const videoTrack = this.videoStream.getVideoTracks()[0]
      if (videoTrack) {
        if (this.meshManager) {
          this.meshManager.addLocalTrack(videoTrack, 'video')
        } else {
          await this.pushLocalTrack(videoTrack, 'video')
          this.attachSenderTransformForTrack(videoTrack, 'video')
        }
      }

      this.localVideoEnabled = true
      this.signaling?.fireVoiceSignal?.('voice.video', { enabled: true })

      if (videoTrack) {
        for (const cb of this.trackCbs) cb(this.localDID, videoTrack, 'video')
      }
    } catch (err) {
      throw new Error(`Failed to enable video: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async disableVideo(): Promise<void> {
    if (this.meshManager) {
      this.meshManager.removeLocalTrack('video')
      if (this.videoStream) {
        for (const t of this.videoStream.getTracks()) t.stop()
      }
    } else {
      await this.closeLocalTrack('video', this.videoStream)
    }
    this.videoStream = null
    this.localVideoEnabled = false
    this.signaling?.fireVoiceSignal?.('voice.video', { enabled: false })
    for (const cb of this.trackRemovedCbs) cb(this.localDID, 'video')
  }

  async startScreenShare(sourceId?: string): Promise<void> {
    try {
      if (sourceId) {
        this.screenStream = await this.mediaProvider.getUserMedia({
          audio: false,
          video: {
            // @ts-expect-error Electron-specific constraints
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId,
              maxWidth: 1920,
              maxHeight: 1080,
              maxFrameRate: 30
            }
          }
        })
      } else {
        this.screenStream = await this.mediaProvider.getDisplayMedia({
          video: true,
          audio: true
        })
      }

      const videoTrack = this.screenStream.getVideoTracks()[0]
      if (videoTrack) {
        if (this.meshManager) {
          this.meshManager.addLocalTrack(videoTrack, 'screen')
        } else {
          await this.pushLocalTrack(videoTrack, 'screen')
          this.attachSenderTransformForTrack(videoTrack, 'video')
        }

        videoTrack.onended = () => {
          this.stopScreenShare()
        }
      }

      this.localScreenSharing = true
      this.signaling?.fireVoiceSignal?.('voice.screen', { sharing: true })

      if (videoTrack) {
        for (const cb of this.trackCbs) cb(this.localDID, videoTrack, 'screen')
      }
    } catch (err) {
      console.error('[Voice] Screen share failed:', err)
      this.localScreenSharing = false
    }
  }

  async stopScreenShare(): Promise<void> {
    if (this.meshManager) {
      this.meshManager.removeLocalTrack('screen')
      if (this.screenStream) {
        for (const t of this.screenStream.getTracks()) t.stop()
      }
    } else {
      await this.closeLocalTrack('screen', this.screenStream)
    }
    this.screenStream = null
    this.localScreenSharing = false
    this.signaling?.fireVoiceSignal?.('voice.screen', { sharing: false })
    for (const cb of this.trackRemovedCbs) cb(this.localDID, 'screen')
  }

  setDeafened(deafened: boolean): void {
    if (this.meshManager) {
      this.meshManager.setDeafened(deafened)
      return
    }
    const pc = this.sfuAdapter?.getPeerConnection()
    if (!pc) return
    for (const receiver of pc.getReceivers()) {
      receiver.track.enabled = !deafened
    }
  }

  getLocalAudioStream(): MediaStream | null {
    return this.audioStream
  }
  getLocalVideoStream(): MediaStream | null {
    return this.videoStream
  }
  getLocalScreenStream(): MediaStream | null {
    return this.screenStream
  }

  debugState(): Record<string, unknown> {
    const pc = this.sfuAdapter?.getPeerConnection()
    const meshPeers: Record<string, unknown> = {}
    if (this.meshManager) {
      for (const [did, peerPc] of this.meshManager.getPeers()) {
        meshPeers[did] = {
          connectionState: peerPc.connectionState,
          iceConnectionState: peerPc.iceConnectionState,
          signalingState: peerPc.signalingState,
          senders: peerPc.getSenders().length,
          receivers: peerPc.getReceivers().length
        }
      }
    }
    return {
      voiceMode: this.voiceMode,
      localAudioEnabled: this.localAudioEnabled,
      localVideoEnabled: this.localVideoEnabled,
      localScreenSharing: this.localScreenSharing,
      sessionId: this.sessionId,
      hasSFU: this.hasSFU,
      hasE2EE: this.hasE2EE,
      localTrackMids: Object.fromEntries(this.localTrackMids),
      remoteTrackOwners: Object.fromEntries(Array.from(this.remoteTrackOwners.entries()).map(([k, v]) => [k, v])),
      peerConnection: pc
        ? {
            connectionState: pc.connectionState,
            iceConnectionState: pc.iceConnectionState,
            signalingState: pc.signalingState,
            senders: pc.getSenders().length,
            receivers: pc.getReceivers().length
          }
        : null,
      meshPeers: Object.keys(meshPeers).length > 0 ? meshPeers : undefined,
      participantCount: this.participants.length
    }
  }

  onTrack(cb: MediaStreamTrackCb): void {
    this.trackCbs.push(cb)
  }

  onTrackRemoved(cb: TrackRemovedCb): void {
    this.trackRemovedCbs.push(cb)
  }

  onParticipantJoined(cb: ParticipantJoinedCb): void {
    this.joinedCbs.push(cb)
  }
  onParticipantLeft(cb: ParticipantLeftCb): void {
    this.leftCbs.push(cb)
  }
  onSpeakingChanged(cb: SpeakingChangedCb): void {
    this.speakingCbs.push(cb)
  }

  async disconnect(): Promise<void> {
    this.disconnected = true

    this.cleanupSpeakingDetection()

    // Clean up P2P mesh
    if (this.meshManager) {
      this.meshManager.destroy()
      this.meshManager = null
      // Stop local media tracks
      for (const stream of [this.audioStream, this.videoStream, this.screenStream]) {
        if (stream) {
          for (const t of stream.getTracks()) t.stop()
        }
      }
    } else {
      // SFU mode cleanup
      await this.closeLocalTrack('audio', this.audioStream)
      await this.closeLocalTrack('video', this.videoStream)
      await this.closeLocalTrack('screen', this.screenStream)

      if (this.sfuAdapter && this.sessionId) {
        await this.sfuAdapter.closeSession(this.sessionId)
      }
    }

    // Remove signaling handlers
    if (this.signaling) {
      for (const { type, handler } of this.signalingHandlers) {
        this.signaling.offVoiceSignal(type, handler)
      }
    }
    this.signalingHandlers = []

    this.audioStream = null
    this.videoStream = null
    this.screenStream = null
    this.localAudioEnabled = false
    this.localVideoEnabled = false
    this.localScreenSharing = false
    this.sessionId = null
    this.localTrackMids.clear()
    this.remoteTrackOwners.clear()

    this.participants = []
    this.joinedCbs = []
    this.leftCbs = []
    this.speakingCbs = []
    this.trackCbs = []
    this.trackRemovedCbs = []
    this.disconnectCb()
  }

  isDisconnected(): boolean {
    return this.disconnected
  }

  // --- Testing helpers ---
  simulateParticipantJoined(p: VoiceParticipant): void {
    this.participants.push(p)
    for (const cb of this.joinedCbs) cb(p)
  }
  simulateParticipantLeft(did: string): void {
    this.participants = this.participants.filter((p) => p.did !== did)
    for (const cb of this.leftCbs) cb(did)
  }
  simulateSpeakingChanged(did: string, speaking: boolean): void {
    const p = this.participants.find((part) => part.did === did)
    if (p) p.speaking = speaking
    for (const cb of this.speakingCbs) cb(did, speaking)
  }
}
