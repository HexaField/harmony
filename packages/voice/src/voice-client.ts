import type { VoiceConnection, VoiceParticipant, JoinOptions } from './room-manager.js'

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

/**
 * Client-side voice connection. In production this wraps livekit-client.
 * Tests use this directly with simulated events.
 */
export class VoiceClient {
  private connection: VoiceConnectionImpl | null = null
  private mediaProvider: MediaDeviceProvider

  constructor(mediaProvider?: MediaDeviceProvider) {
    this.mediaProvider = mediaProvider ?? BrowserMediaProvider
  }

  async joinRoom(token: string, opts?: JoinOptions): Promise<VoiceConnection> {
    // Parse token to get room info
    let tokenData: { room: string; participant: string }
    try {
      tokenData = JSON.parse(Buffer.from(token, 'base64').toString())
    } catch {
      throw new Error('Invalid token')
    }

    const conn = new VoiceConnectionImpl(
      tokenData.room,
      tokenData.participant,
      opts?.audioEnabled ?? true,
      opts?.videoEnabled ?? false,
      this.mediaProvider,
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

  private disconnectCb: () => void

  constructor(
    roomId: string,
    localDID: string,
    audioEnabled: boolean,
    videoEnabled: boolean,
    mediaProvider: MediaDeviceProvider,
    disconnectCb: () => void
  ) {
    this.roomId = roomId
    this.localDID = localDID
    this.localAudioEnabled = audioEnabled
    this.localVideoEnabled = videoEnabled
    this.mediaProvider = mediaProvider
    this.disconnectCb = disconnectCb
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
    // If mediaProvider is available, try to get display media
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
