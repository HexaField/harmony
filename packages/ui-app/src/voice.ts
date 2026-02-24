// Voice Activity Detection — WebRTC audio manager with speaking detection
// Only used in browser environments; gracefully handles missing APIs.

/** Callback for speaking state changes */
export type SpeakingCallback = (did: string, isSpeaking: boolean) => void

/** Threshold (0–255 from getByteFrequencyData) above which a user is "speaking" */
const SPEAKING_THRESHOLD = 30
/** How often to poll audio levels (ms) */
const POLL_INTERVAL_MS = 100

export class VoiceManager {
  private localStream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private localAnalyser: AnalyserNode | null = null
  private localPollTimer: ReturnType<typeof setInterval> | null = null
  private remoteAnalysers = new Map<string, { analyser: AnalyserNode; source: MediaStreamAudioSourceNode }>()
  private remotePollTimer: ReturnType<typeof setInterval> | null = null
  private onSpeaking: SpeakingCallback
  private localDid: string
  private _destroyed = false

  constructor(localDid: string, onSpeaking: SpeakingCallback) {
    this.localDid = localDid
    this.onSpeaking = onSpeaking
  }

  /** Acquire mic and start local speaking detection. Returns false on failure. */
  async start(): Promise<boolean> {
    if (this._destroyed) return false
    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        console.warn('[VoiceManager] getUserMedia not available')
        return false
      }
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.audioContext = new AudioContext()
      const source = this.audioContext.createMediaStreamSource(this.localStream)
      this.localAnalyser = this.audioContext.createAnalyser()
      this.localAnalyser.fftSize = 256
      source.connect(this.localAnalyser)

      let wasSpeaking = false
      const buf = new Uint8Array(this.localAnalyser.frequencyBinCount)
      this.localPollTimer = setInterval(() => {
        if (!this.localAnalyser) return
        this.localAnalyser.getByteFrequencyData(buf)
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length
        const speaking = avg > SPEAKING_THRESHOLD
        if (speaking !== wasSpeaking) {
          wasSpeaking = speaking
          this.onSpeaking(this.localDid, speaking)
        }
      }, POLL_INTERVAL_MS)

      return true
    } catch (err) {
      console.warn('[VoiceManager] Failed to start:', err)
      return false
    }
  }

  /** Add a remote peer's audio stream for speaking detection */
  addRemoteStream(did: string, stream: MediaStream): void {
    if (this._destroyed || !this.audioContext) return
    // Clean up previous if exists
    this.removeRemoteStream(did)

    const source = this.audioContext.createMediaStreamSource(stream)
    const analyser = this.audioContext.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)
    // Also connect to destination so audio plays
    source.connect(this.audioContext.destination)
    this.remoteAnalysers.set(did, { analyser, source })

    // Start remote poll if not running
    if (!this.remotePollTimer) {
      const speakingState = new Map<string, boolean>()
      this.remotePollTimer = setInterval(() => {
        for (const [remoteDid, { analyser: a }] of this.remoteAnalysers) {
          const buf = new Uint8Array(a.frequencyBinCount)
          a.getByteFrequencyData(buf)
          const avg = buf.reduce((s, b) => s + b, 0) / buf.length
          const speaking = avg > SPEAKING_THRESHOLD
          if (speaking !== (speakingState.get(remoteDid) ?? false)) {
            speakingState.set(remoteDid, speaking)
            this.onSpeaking(remoteDid, speaking)
          }
        }
      }, POLL_INTERVAL_MS)
    }
  }

  /** Remove a remote peer's audio tracking */
  removeRemoteStream(did: string): void {
    const entry = this.remoteAnalysers.get(did)
    if (entry) {
      try {
        entry.source.disconnect()
      } catch {
        /* ignore */
      }
      this.remoteAnalysers.delete(did)
      this.onSpeaking(did, false)
    }
    if (this.remoteAnalysers.size === 0 && this.remotePollTimer) {
      clearInterval(this.remotePollTimer)
      this.remotePollTimer = null
    }
  }

  /** Mute/unmute local mic track */
  setMuted(muted: boolean): void {
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        track.enabled = !muted
      }
    }
    if (muted) {
      this.onSpeaking(this.localDid, false)
    }
  }

  /** Deafen/undeafen — mute all remote audio outputs */
  setDeafened(deafened: boolean): void {
    if (!this.audioContext) return
    // Suspend/resume context to mute/unmute all remote audio
    if (deafened) {
      void this.audioContext.suspend()
    } else {
      void this.audioContext.resume()
    }
  }

  /** Get the local MediaStream (for passing to RTCPeerConnection) */
  getLocalStream(): MediaStream | null {
    return this.localStream
  }

  /** Tear everything down */
  destroy(): void {
    this._destroyed = true
    if (this.localPollTimer) {
      clearInterval(this.localPollTimer)
      this.localPollTimer = null
    }
    if (this.remotePollTimer) {
      clearInterval(this.remotePollTimer)
      this.remotePollTimer = null
    }
    // Clear all remote speaking states
    for (const did of this.remoteAnalysers.keys()) {
      this.onSpeaking(did, false)
    }
    this.remoteAnalysers.clear()
    this.onSpeaking(this.localDid, false)

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop()
      }
      this.localStream = null
    }
    if (this.audioContext) {
      void this.audioContext.close()
      this.audioContext = null
    }
    this.localAnalyser = null
  }
}
