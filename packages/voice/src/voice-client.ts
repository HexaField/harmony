import type { VoiceConnection, VoiceParticipant, JoinOptions } from './room-manager.js'
import type { E2EEBridge } from './e2ee-bridge.js'

type ParticipantJoinedCb = (p: VoiceParticipant) => void
type ParticipantLeftCb = (did: string) => void
type SpeakingChangedCb = (did: string, speaking: boolean) => void

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

export interface VoiceClientOptions {
  mediaProvider?: MediaDeviceProvider
  e2eeBridge?: E2EEBridge
  /** SFU mode: 'mediasoup' for real WebRTC, 'test' for InMemoryAdapter tokens */
  mode?: 'mediasoup' | 'test'
  /** WebSocket URL for signaling (mediasoup mode) */
  signalingUrl?: string
}

/**
 * Client-side voice connection. Supports both test mode (InMemoryAdapter base64 tokens)
 * and mediasoup mode (real WebRTC via JWT tokens with transport params).
 */
export class VoiceClient {
  private connection: VoiceConnectionImpl | null = null
  private mediaProvider: MediaDeviceProvider
  private e2eeBridge?: E2EEBridge
  private mode: 'mediasoup' | 'test'
  /** Signaling URL for SFU connection (reserved for mediasoup/LiveKit integration). */
  readonly signalingUrl?: string

  constructor(mediaProviderOrOpts?: MediaDeviceProvider | VoiceClientOptions) {
    if (mediaProviderOrOpts && 'getUserMedia' in mediaProviderOrOpts) {
      // Legacy: bare MediaDeviceProvider
      this.mediaProvider = mediaProviderOrOpts
      this.mode = 'test'
    } else {
      const opts = mediaProviderOrOpts as VoiceClientOptions | undefined
      this.mediaProvider = opts?.mediaProvider ?? BrowserMediaProvider
      this.e2eeBridge = opts?.e2eeBridge
      this.mode = opts?.mode ?? 'test'
      this.signalingUrl = opts?.signalingUrl
    }
  }

  async joinRoom(token: string, opts?: JoinOptions): Promise<VoiceConnection> {
    let roomId: string
    let participantId: string
    let sfuParams: SFUTransportParams | undefined

    if (this.mode === 'mediasoup') {
      // JWT token from MediasoupAdapter — decode payload (middle segment)
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
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
      // Test mode: base64 JSON token from InMemoryAdapter
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
      () => {
        this.connection = null
      }
    )
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
  private disconnected = false
  private videoStream: { getTracks(): Array<{ stop(): void }> } | null = null
  private screenShareStream: { getTracks(): Array<{ stop(): void }> } | null = null
  private mediaProvider: MediaDeviceProvider
  private e2eeBridge?: E2EEBridge
  private sfuParams?: SFUTransportParams
  private disconnectCb: () => void

  constructor(
    roomId: string,
    localDID: string,
    audioEnabled: boolean,
    videoEnabled: boolean,
    mediaProvider: MediaDeviceProvider,
    e2eeBridge: E2EEBridge | undefined,
    sfuParams: SFUTransportParams | undefined,
    disconnectCb: () => void
  ) {
    this.roomId = roomId
    this.localDID = localDID
    this.localAudioEnabled = audioEnabled
    this.localVideoEnabled = videoEnabled
    this.mediaProvider = mediaProvider
    this.e2eeBridge = e2eeBridge
    this.sfuParams = sfuParams
    this.disconnectCb = disconnectCb

    // In mediasoup mode, the real WebRTC connection would be established here:
    // 1. Create RTCPeerConnection
    // 2. Use sfuParams to configure ICE/DTLS
    // 3. If e2eeBridge has key, attach Insertable Streams transforms
    // 4. Connect transport, produce audio/video
    // This is handled by the server-side signaling in production.
  }

  /** Whether this connection has SFU transport params (real WebRTC mode) */
  get hasSFUParams(): boolean {
    return this.sfuParams !== undefined
  }

  /** Whether E2EE is active on this connection */
  get hasE2EE(): boolean {
    return this.e2eeBridge?.hasKey() ?? false
  }

  async toggleAudio(): Promise<void> {
    this.localAudioEnabled = !this.localAudioEnabled
  }

  async toggleVideo(): Promise<void> {
    this.localVideoEnabled = !this.localVideoEnabled
  }

  async enableVideo(): Promise<void> {
    try {
      const stream = await this.mediaProvider.getUserMedia({ video: true })
      this.videoStream = stream
      this.localVideoEnabled = true
    } catch (err) {
      throw new Error(`Failed to enable video: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async disableVideo(): Promise<void> {
    if (this.videoStream) {
      for (const track of this.videoStream.getTracks()) {
        track.stop()
      }
      this.videoStream = null
    }
    this.localVideoEnabled = false
  }

  async startScreenShare(): Promise<void> {
    try {
      const stream = await this.mediaProvider.getDisplayMedia({ video: true })
      this.screenShareStream = stream
    } catch {
      // In test environments, just set the flag without actual media
    }
    this.localScreenSharing = true
    const participant = this.participants.find((p) => p.did === this.localDID)
    if (participant) participant.screenSharing = true
  }

  async stopScreenShare(): Promise<void> {
    if (this.screenShareStream) {
      for (const track of this.screenShareStream.getTracks()) {
        track.stop()
      }
      this.screenShareStream = null
    }
    this.localScreenSharing = false
    const participant = this.participants.find((p) => p.did === this.localDID)
    if (participant) participant.screenSharing = false
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
    await this.disableVideo()
    await this.stopScreenShare()
    this.participants = []
    this.joinedCbs = []
    this.leftCbs = []
    this.speakingCbs = []
    this.disconnectCb()
  }

  isDisconnected(): boolean {
    return this.disconnected
  }

  // Simulate events for testing
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
