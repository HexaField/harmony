import type { VoiceConnection, VoiceParticipant, JoinOptions } from './room-manager.js'
import type { E2EEBridge } from './e2ee-bridge.js'
import { createEncryptTransform, createDecryptTransform } from './insertable-streams.js'

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
 * Signaling interface for SFU communication.
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
  /** SFU mode: 'mediasoup' for real WebRTC, 'test' for InMemoryAdapter tokens */
  mode?: 'mediasoup' | 'test'
  /** Signaling interface for SFU communication */
  signaling?: VoiceSignaling
}

/**
 * Client-side voice connection. Supports both test mode (InMemoryAdapter base64 tokens)
 * and mediasoup mode (real WebRTC via mediasoup-client).
 */
export class VoiceClient {
  private connection: VoiceConnectionImpl | null = null
  private mediaProvider: MediaDeviceProvider
  private e2eeBridge?: E2EEBridge
  private mode: 'mediasoup' | 'test'
  private signaling?: VoiceSignaling

  constructor(mediaProviderOrOpts?: MediaDeviceProvider | VoiceClientOptions) {
    if (mediaProviderOrOpts && 'getUserMedia' in mediaProviderOrOpts) {
      this.mediaProvider = mediaProviderOrOpts
      this.mode = 'test'
    } else {
      const opts = mediaProviderOrOpts as VoiceClientOptions | undefined
      this.mediaProvider = opts?.mediaProvider ?? BrowserMediaProvider
      this.e2eeBridge = opts?.e2eeBridge
      this.mode = opts?.mode ?? 'test'
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

  async joinRoom(token: string, opts?: JoinOptions): Promise<VoiceConnection> {
    let roomId: string
    let participantId: string
    let sfuParams: SFUTransportParams | undefined

    if (this.mode === 'mediasoup') {
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
        roomId = payload.roomId
        participantId = payload.participantId
        sfuParams = {
          transportId: payload.transportId,
          dtlsParameters: payload.dtlsParameters,
          iceCandidates: payload.iceCandidates,
          iceParameters: payload.iceParameters,
          routerRtpCapabilities: payload.routerRtpCapabilities
        }
      } catch {
        throw new Error('Invalid mediasoup token')
      }
    } else {
      try {
        const tokenData = JSON.parse(Buffer.from(token, 'base64').toString())
        roomId = tokenData.room
        participantId = tokenData.participant
      } catch {
        throw new Error('Invalid token')
      }
    }

    const conn = new VoiceConnectionImpl(
      roomId,
      participantId,
      opts?.audioEnabled ?? true,
      opts?.videoEnabled ?? false,
      this.mediaProvider,
      this.e2eeBridge,
      sfuParams,
      this.signaling,
      () => {
        this.connection = null
      }
    )

    // In mediasoup mode, set up the WebRTC connection
    if (this.mode === 'mediasoup' && sfuParams && this.signaling) {
      await conn.initMediasoup()
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

interface SFUTransportParams {
  transportId: string
  dtlsParameters: unknown
  iceCandidates: unknown[]
  iceParameters: unknown
  routerRtpCapabilities: unknown
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
  private sfuParams?: SFUTransportParams
  private signaling?: VoiceSignaling
  private disconnectCb: () => void

  // mediasoup-client instances
  private msDevice: any | null = null
  private sendTransport: any | null = null
  private recvTransport: any | null = null
  private audioProducer: any | null = null
  private videoProducer: any | null = null
  private screenProducer: any | null = null
  private consumers = new Map<string, any>()
  /** Map producerId → { participantId, kind } for cleanup on producer-closed */
  private producerOwners = new Map<string, { participantId: string; kind: 'audio' | 'video' | 'screen' }>()

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
    sfuParams: SFUTransportParams | undefined,
    signaling: VoiceSignaling | undefined,
    disconnectCb: () => void
  ) {
    this.roomId = roomId
    this.localDID = localDID
    this.localAudioEnabled = audioEnabled
    this.localVideoEnabled = videoEnabled
    this.mediaProvider = mediaProvider
    this.e2eeBridge = e2eeBridge
    this.sfuParams = sfuParams
    this.signaling = signaling
    this.disconnectCb = disconnectCb
  }

  get hasSFUParams(): boolean {
    return this.sfuParams !== undefined
  }
  get hasE2EE(): boolean {
    return this.e2eeBridge?.hasKey() ?? false
  }

  /**
   * Initialize mediasoup-client Device and transports.
   * Called after constructor when in mediasoup mode.
   */
  async initMediasoup(): Promise<void> {
    if (!this.sfuParams || !this.signaling) return

    try {
      // Dynamic import — mediasoup-client is only available in browser
      const { Device } = await import('mediasoup-client')

      this.msDevice = new Device()
      await this.msDevice.load({
        routerRtpCapabilities: this.sfuParams.routerRtpCapabilities as any
      })

      // Create send transport
      this.sendTransport = this.msDevice.createSendTransport({
        id: this.sfuParams.transportId,
        iceParameters: this.sfuParams.iceParameters as any,
        iceCandidates: this.sfuParams.iceCandidates as any,
        dtlsParameters: this.sfuParams.dtlsParameters as any,
        iceServers: []
      })

      this.sendTransport.on(
        'connect',
        async ({ dtlsParameters }: any, callback: () => void, errback: (e: Error) => void) => {
          try {
            await this.signaling!.sendVoiceSignal('voice.transport.connect', {
              roomId: this.roomId,
              dtlsParameters
            })
            callback()
          } catch (err) {
            errback(err instanceof Error ? err : new Error(String(err)))
          }
        }
      )

      this.sendTransport.on(
        'produce',
        async (
          { kind, rtpParameters, appData }: any,
          callback: (r: { id: string }) => void,
          errback: (e: Error) => void
        ) => {
          try {
            const response = await this.signaling!.sendVoiceSignal('voice.produce', {
              roomId: this.roomId,
              kind,
              rtpParameters,
              mediaType: appData?.type ?? kind // 'audio' | 'video' | 'screen'
            })
            callback({ id: response.producerId as string })
          } catch (err) {
            errback(err instanceof Error ? err : new Error(String(err)))
          }
        }
      )

      // Request a recv transport from the server
      const recvParams = await this.signaling.sendVoiceSignal('voice.transport.create-recv', {
        roomId: this.roomId
      })

      if (recvParams.transportId) {
        this.recvTransport = this.msDevice.createRecvTransport({
          id: recvParams.transportId as string,
          iceParameters: recvParams.iceParameters as any,
          iceCandidates: recvParams.iceCandidates as any,
          dtlsParameters: recvParams.dtlsParameters as any,
          iceServers: []
        })

        this.recvTransport.on(
          'connect',
          async ({ dtlsParameters }: any, callback: () => void, errback: (e: Error) => void) => {
            try {
              await this.signaling!.sendVoiceSignal('voice.transport.connect-recv', {
                roomId: this.roomId,
                dtlsParameters
              })
              callback()
            } catch (err) {
              errback(err instanceof Error ? err : new Error(String(err)))
            }
          }
        )
      }

      // If audio enabled on join, start producing audio
      if (this.localAudioEnabled) {
        await this.startAudioProducer()
      }

      // Listen for new producers from other participants
      this.signaling.onVoiceSignal('voice.new-producer', async (payload) => {
        const kind = payload.kind as string
        const mediaKind: 'audio' | 'video' | 'screen' =
          (payload.mediaType as string) === 'screen' ? 'screen' : (kind as 'audio' | 'video')
        // Track producer ownership for cleanup
        this.producerOwners.set(payload.producerId as string, {
          participantId: payload.participantId as string,
          kind: mediaKind
        })
        await this.consumeProducer(payload.producerId as string, payload.participantId as string, mediaKind)
      })

      // Listen for producer-closed from server (remote stopped their media)
      this.signaling.onVoiceSignal('voice.producer-closed', (payload) => {
        const producerId = payload.producerId as string
        const owner = this.producerOwners.get(producerId)
        if (owner) {
          // Close the matching consumer
          for (const [consumerId, consumer] of this.consumers) {
            if (consumer.producerId === producerId) {
              consumer.close()
              this.consumers.delete(consumerId)
              break
            }
          }
          // Notify UI that this track is gone
          for (const cb of this.trackRemovedCbs) cb(owner.participantId, owner.kind)
          this.producerOwners.delete(producerId)
        }
      })

      // Request existing producers
      const existing = await this.signaling.sendVoiceSignal('voice.get-producers', {
        roomId: this.roomId
      })
      if (Array.isArray(existing.producers)) {
        for (const p of existing.producers) {
          const mediaKind: 'audio' | 'video' | 'screen' = p.mediaType === 'screen' ? 'screen' : p.kind
          this.producerOwners.set(p.producerId, { participantId: p.participantId, kind: mediaKind })
          await this.consumeProducer(p.producerId, p.participantId, mediaKind)
        }
      }

      console.debug('[Voice] Mediasoup connection established')
    } catch (err) {
      console.error('[Voice] Mediasoup init failed:', err)
      throw err
    }
  }

  private async startAudioProducer(): Promise<void> {
    try {
      this.audioStream = await this.mediaProvider.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      const audioTrack = this.audioStream.getAudioTracks()[0]
      if (!audioTrack || !this.sendTransport) return

      this.audioProducer = await this.sendTransport.produce({ track: audioTrack })

      // Attach E2EE encrypt transform if available
      this.attachSenderTransform(this.audioProducer, 'audio')

      // Set up speaking detection
      this.setupSpeakingDetection(this.audioStream)

      this.localAudioEnabled = true
    } catch (err) {
      console.error('[Voice] Failed to start audio:', err)
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
        const isSpeaking = average > 15 // threshold
        if (isSpeaking !== this.lastSpeakingState) {
          this.lastSpeakingState = isSpeaking
          // Notify local callbacks
          for (const cb of this.speakingCbs) cb(this.localDID, isSpeaking)
          // Notify server so other clients see it
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
    // If we were speaking, send not-speaking
    if (this.lastSpeakingState) {
      this.lastSpeakingState = false
      for (const cb of this.speakingCbs) cb(this.localDID, false)
      this.signaling?.fireVoiceSignal?.('voice.speaking', { speaking: false })
    }
  }

  private async consumeProducer(
    producerId: string,
    participantId: string,
    kind: 'audio' | 'video' | 'screen'
  ): Promise<void> {
    if (!this.recvTransport || !this.msDevice) return

    try {
      const consumeKind = kind === 'screen' ? 'video' : kind
      const response = await this.signaling!.sendVoiceSignal('voice.consume', {
        roomId: this.roomId,
        producerId,
        rtpCapabilities: this.msDevice.rtpCapabilities
      })

      const consumer = await this.recvTransport.consume({
        id: response.consumerId as string,
        producerId: response.producerId as string,
        kind: consumeKind,
        rtpParameters: response.rtpParameters as any
      })

      this.consumers.set(consumer.id, consumer)

      // Attach E2EE decrypt transform if available
      this.attachReceiverTransform(consumer, consumeKind as 'audio' | 'video')

      // Resume the consumer
      await this.signaling!.sendVoiceSignal('voice.consumer.resume', {
        consumerId: consumer.id
      })

      // Notify UI about the new track
      const track = consumer.track as MediaStreamTrack
      for (const cb of this.trackCbs) cb(participantId, track, kind)
    } catch (err) {
      console.error('[Voice] Failed to consume producer:', err)
    }
  }

  /**
   * Attach an encrypt TransformStream to an RTCRtpSender (via mediasoup producer).
   * Uses the Insertable Streams / Encoded Transforms API when available.
   * Fails silently if not supported (graceful degradation).
   */
  private attachSenderTransform(producer: any, kind: 'audio' | 'video'): void {
    if (!this.e2eeBridge || !producer) return

    try {
      const sender: RTCRtpSender | undefined = producer.rtpSender
      if (!sender) return

      // Encoded Transforms API (Chrome 86+)
      if ('createEncodedStreams' in sender) {
        const { readable, writable } = (sender as any).createEncodedStreams()
        const transform = createEncryptTransform(this.e2eeBridge, kind)
        readable.pipeThrough(transform).pipeTo(writable)
      }
    } catch (err) {
      console.warn('[Voice] Failed to attach sender E2EE transform (graceful degradation):', err)
    }
  }

  /**
   * Attach a decrypt TransformStream to an RTCRtpReceiver (via mediasoup consumer).
   * Uses the Insertable Streams / Encoded Transforms API when available.
   */
  private attachReceiverTransform(consumer: any, kind: 'audio' | 'video'): void {
    if (!this.e2eeBridge || !consumer) return

    try {
      const receiver: RTCRtpReceiver | undefined = consumer.rtpReceiver
      if (!receiver) return

      if ('createEncodedStreams' in receiver) {
        const { readable, writable } = (receiver as any).createEncodedStreams()
        const transform = createDecryptTransform(this.e2eeBridge, kind)
        readable.pipeThrough(transform).pipeTo(writable)
      }
    } catch (err) {
      console.warn('[Voice] Failed to attach receiver E2EE transform (graceful degradation):', err)
    }
  }

  /**
   * Close a local producer, stop its tracks, and notify the server.
   * Server will broadcast `voice.producer-closed` to other clients.
   */
  private async closeProducer(
    producer: any,
    stream: MediaStream | null,
    mediaType: 'audio' | 'video' | 'screen'
  ): Promise<void> {
    const producerId = producer?.id
    if (producer && !producer.closed) {
      producer.close()
    }
    if (stream) {
      for (const track of stream.getTracks()) track.stop()
    }
    // Tell the server this producer is gone so it can notify other clients
    if (producerId && this.signaling) {
      this.signaling.fireVoiceSignal?.('voice.producer-closed', {
        producerId,
        roomId: this.roomId,
        mediaType
      })
    }
  }

  // --- Public API ---

  async toggleAudio(): Promise<void> {
    if (this.localAudioEnabled) {
      // Fully stop audio — close producer, stop tracks, stop speaking detection
      this.cleanupSpeakingDetection()
      await this.closeProducer(this.audioProducer, this.audioStream, 'audio')
      this.audioProducer = null
      this.audioStream = null
      this.localAudioEnabled = false
      this.signaling?.fireVoiceSignal?.('voice.mute', {})
    } else {
      // Re-acquire audio and produce
      try {
        await this.startAudioProducer()
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

      if (videoTrack && this.sendTransport) {
        this.videoProducer = await this.sendTransport.produce({ track: videoTrack })
        this.attachSenderTransform(this.videoProducer, 'video')
      }

      this.localVideoEnabled = true
      this.signaling?.fireVoiceSignal?.('voice.video', { enabled: true })

      // Notify UI about local video track
      if (videoTrack) {
        for (const cb of this.trackCbs) cb(this.localDID, videoTrack, 'video')
      }
    } catch (err) {
      throw new Error(`Failed to enable video: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async disableVideo(): Promise<void> {
    await this.closeProducer(this.videoProducer, this.videoStream, 'video')
    this.videoProducer = null
    this.videoStream = null
    this.localVideoEnabled = false
    this.signaling?.fireVoiceSignal?.('voice.video', { enabled: false })
    // Notify local UI the video track is gone
    for (const cb of this.trackRemovedCbs) cb(this.localDID, 'video')
  }

  async startScreenShare(sourceId?: string): Promise<void> {
    try {
      if (sourceId) {
        // Electron: use chromeMediaSource with specific sourceId
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

      if (videoTrack && this.sendTransport) {
        this.screenProducer = await this.sendTransport.produce({
          track: videoTrack,
          appData: { type: 'screen' }
        })

        // Attach E2EE encrypt transform for screen share (treated as video)
        this.attachSenderTransform(this.screenProducer, 'video')

        // Auto-stop when user ends share via browser UI
        videoTrack.onended = () => {
          this.stopScreenShare()
        }
      }

      this.localScreenSharing = true
      this.signaling?.fireVoiceSignal?.('voice.screen', { sharing: true })

      // Notify UI
      if (videoTrack) {
        for (const cb of this.trackCbs) cb(this.localDID, videoTrack, 'screen')
      }
    } catch (err) {
      console.error('[Voice] Screen share failed:', err)
      this.localScreenSharing = false
    }
  }

  async stopScreenShare(): Promise<void> {
    await this.closeProducer(this.screenProducer, this.screenStream, 'screen')
    this.screenProducer = null
    this.screenStream = null
    this.localScreenSharing = false
    this.signaling?.fireVoiceSignal?.('voice.screen', { sharing: false })
    // Notify local UI the screen track is gone
    for (const cb of this.trackRemovedCbs) cb(this.localDID, 'screen')
  }

  setDeafened(deafened: boolean): void {
    for (const consumer of this.consumers.values()) {
      if (deafened) {
        consumer.pause()
      } else {
        consumer.resume()
      }
    }
  }

  /** Get the local audio stream (for audio level meters etc.) */
  getLocalAudioStream(): MediaStream | null {
    return this.audioStream
  }
  /** Get the local video stream (for self-view) */
  getLocalVideoStream(): MediaStream | null {
    return this.videoStream
  }
  /** Get the local screen share stream */
  getLocalScreenStream(): MediaStream | null {
    return this.screenStream
  }

  /** Debug introspection of internal state */
  debugState(): Record<string, unknown> {
    const consumers: Array<Record<string, unknown>> = []
    if (this.consumers) {
      for (const [id, c] of this.consumers) {
        consumers.push({
          id,
          kind: c.kind,
          paused: c.paused,
          closed: c.closed,
          producerId: c.producerId,
          track: c.track ? { state: c.track.readyState, kind: c.track.kind, muted: c.track.muted } : null
        })
      }
    }
    return {
      localAudioEnabled: this.localAudioEnabled,
      localVideoEnabled: this.localVideoEnabled,
      localScreenSharing: this.localScreenSharing,
      hasAudioProducer: !!this.audioProducer,
      audioProducerPaused: this.audioProducer?.paused,
      hasVideoProducer: !!this.videoProducer,
      videoProducerPaused: this.videoProducer?.paused,
      hasScreenProducer: !!this.screenProducer,
      sendTransport: this.sendTransport
        ? {
            id: this.sendTransport.id,
            closed: this.sendTransport.closed,
            connectionState: this.sendTransport.connectionState
          }
        : null,
      recvTransport: this.recvTransport
        ? {
            id: this.recvTransport.id,
            closed: this.recvTransport.closed,
            connectionState: this.recvTransport.connectionState
          }
        : null,
      deviceLoaded: this.msDevice?.loaded,
      consumers,
      producerOwners: Array.from(this.producerOwners.entries()),
      participantCount: this.participants.length
    }
  }

  /** Register callback for remote media tracks */
  onTrack(cb: MediaStreamTrackCb): void {
    this.trackCbs.push(cb)
  }

  /** Register callback for when a remote track is removed (producer closed) */
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

    // Stop speaking detection
    this.cleanupSpeakingDetection()

    // Close producers (notify server each is gone)
    if (this.audioProducer) await this.closeProducer(this.audioProducer, this.audioStream, 'audio')
    else if (this.audioStream) {
      for (const t of this.audioStream.getTracks()) t.stop()
    }
    if (this.videoProducer) await this.closeProducer(this.videoProducer, this.videoStream, 'video')
    else if (this.videoStream) {
      for (const t of this.videoStream.getTracks()) t.stop()
    }
    if (this.screenProducer) await this.closeProducer(this.screenProducer, this.screenStream, 'screen')
    else if (this.screenStream) {
      for (const t of this.screenStream.getTracks()) t.stop()
    }

    // Close consumers
    for (const consumer of this.consumers.values()) consumer.close()
    this.consumers.clear()
    this.producerOwners.clear()

    // Close transports
    this.sendTransport?.close()
    this.recvTransport?.close()

    this.audioStream = null
    this.videoStream = null
    this.screenStream = null
    this.localAudioEnabled = false
    this.localVideoEnabled = false
    this.localScreenSharing = false
    this.audioProducer = null
    this.videoProducer = null
    this.screenProducer = null
    this.sendTransport = null
    this.recvTransport = null
    this.msDevice = null

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
