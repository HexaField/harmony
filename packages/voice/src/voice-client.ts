import type { VoiceConnection, VoiceParticipant, JoinOptions } from './room-manager.js'

type ParticipantJoinedCb = (p: VoiceParticipant) => void
type ParticipantLeftCb = (did: string) => void
type SpeakingChangedCb = (did: string, speaking: boolean) => void

/**
 * Client-side voice connection. In production this wraps livekit-client.
 * Tests use this directly with simulated events.
 */
export class VoiceClient {
  private connection: VoiceConnectionImpl | null = null

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
  private localDID: string
  private localScreenSharing = false
  private joinedCbs: ParticipantJoinedCb[] = []
  private leftCbs: ParticipantLeftCb[] = []
  private speakingCbs: SpeakingChangedCb[] = []
  private disconnected = false

  private disconnectCb: () => void

  constructor(
    roomId: string,
    localDID: string,
    audioEnabled: boolean,
    videoEnabled: boolean,
    disconnectCb: () => void
  ) {
    this.roomId = roomId
    this.localDID = localDID
    this.localAudioEnabled = audioEnabled
    this.localVideoEnabled = videoEnabled
    this.disconnectCb = disconnectCb
  }

  async toggleAudio(): Promise<void> {
    this.localAudioEnabled = !this.localAudioEnabled
  }

  async toggleVideo(): Promise<void> {
    this.localVideoEnabled = !this.localVideoEnabled
  }

  async startScreenShare(): Promise<void> {
    this.localScreenSharing = true
    const participant = this.participants.find((p) => p.did === this.localDID)
    if (participant) participant.screenSharing = true
  }

  async stopScreenShare(): Promise<void> {
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
