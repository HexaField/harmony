import { describe, it, expect, vi, beforeEach } from 'vitest'
import { VoiceClient } from '../src/voice-client.js'
import type { VoiceSignaling } from '../src/voice-client.js'
import type { ClientSFUAdapter } from '../src/sfu-adapter.js'

// ---------------------------------------------------------------------------
// Mock RTCPeerConnection
// ---------------------------------------------------------------------------
class MockRTCPeerConnection {
  connectionState = 'new'
  iceConnectionState = 'new'
  signalingState = 'stable'
  localDescription: { type: string; sdp: string } | null = null
  remoteDescription: { type: string; sdp: string } | null = null
  ontrack: ((event: unknown) => void) | null = null

  private senders: Array<{ track: unknown }> = []
  private _receivers: Array<{ track: { kind: string; readyState: string; enabled: boolean } }> = []

  addTransceiver(_kind: string, _init?: { direction: string }): void {
    /* no-op */
  }

  addTrack(track: unknown): void {
    this.senders.push({ track })
  }

  getSenders(): Array<{ track: unknown }> {
    return this.senders
  }

  getReceivers(): Array<{ track: { kind: string; readyState: string; enabled: boolean } }> {
    return this._receivers
  }

  /** Test helper: inject a fake receiver so pullRemoteTrack can find it */
  _addReceiver(
    kind: 'audio' | 'video',
    readyState: string = 'live'
  ): { kind: string; readyState: string; enabled: boolean } {
    const track = { kind, readyState, enabled: true }
    this._receivers.push({ track })
    return track
  }

  async createOffer(): Promise<{ type: string; sdp: string }> {
    return { type: 'offer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' }
  }

  async createAnswer(): Promise<{ type: string; sdp: string }> {
    return { type: 'answer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=setup:active\r\n' }
  }

  async setLocalDescription(desc: { type: string; sdp?: string }): Promise<void> {
    this.localDescription = { type: desc.type, sdp: desc.sdp ?? '' }
  }

  async setRemoteDescription(desc: { type: string; sdp: string }): Promise<void> {
    this.remoteDescription = { type: desc.type, sdp: desc.sdp }
  }

  close(): void {
    this.connectionState = 'closed'
  }
}

globalThis.RTCPeerConnection = MockRTCPeerConnection as unknown as typeof RTCPeerConnection

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockSignaling(): VoiceSignaling & {
  handlers: Map<string, Array<(payload: Record<string, unknown>) => void>>
} {
  const handlers = new Map<string, Array<(payload: Record<string, unknown>) => void>>()
  return {
    handlers,
    async sendVoiceSignal(_type: string, _payload: Record<string, unknown>): Promise<Record<string, unknown>> {
      // voice.get-producers returns empty
      return { producers: [] }
    },
    fireVoiceSignal(_type: string, _payload: Record<string, unknown>): void {
      /* no-op */
    },
    onVoiceSignal(type: string, handler: (payload: Record<string, unknown>) => void): void {
      if (!handlers.has(type)) handlers.set(type, [])
      handlers.get(type)!.push(handler)
    },
    offVoiceSignal(_type: string, _handler: (payload: Record<string, unknown>) => void): void {
      /* no-op */
    }
  }
}

let mockPC: MockRTCPeerConnection

function createMockSFUAdapter(): ClientSFUAdapter {
  return {
    async createSession(): Promise<string> {
      mockPC = new MockRTCPeerConnection()
      return 'test-session-1'
    },
    getPeerConnection(): RTCPeerConnection | null {
      return mockPC as unknown as RTCPeerConnection
    },
    async pushTracks(_sessionId: string, tracks: Array<{ location: string; trackName: string }>, _sdpOffer: string) {
      return {
        sdpAnswer: 'v=0\r\nanswer\r\n',
        tracks: tracks.map((t, i) => ({ trackName: t.trackName, mid: `mid-${i}` }))
      }
    },
    async pullTracks(_sessionId: string, _remoteSessionId: string, trackNames: string[]) {
      return {
        sdpAnswer: 'v=0\r\nanswer\r\n',
        tracks: trackNames.map((tn, i) => ({ trackName: tn, mid: `rmid-${i}` }))
      }
    },
    async closeTracks() {},
    async renegotiate(_sessionId: string, _sdpOffer: string) {
      return { sdpAnswer: 'v=0\r\nrenegotiated\r\n' }
    },
    async closeSession() {
      mockPC.close()
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VoiceClient track callbacks', () => {
  let signaling: ReturnType<typeof createMockSignaling>
  let client: VoiceClient

  beforeEach(() => {
    signaling = createMockSignaling()
    client = new VoiceClient({
      sfuAdapter: createMockSFUAdapter(),
      signaling,
      mediaProvider: {
        async getUserMedia(): Promise<MediaStream> {
          throw new Error('no media in test')
        },
        async getDisplayMedia(): Promise<MediaStream> {
          throw new Error('no media in test')
        }
      }
    })
  })

  it('fires onTrack when pullRemoteTrack finds a live receiver track', async () => {
    const token = btoa(JSON.stringify({ room: 'room1', participant: 'local-did' }))
    const conn = await client.joinRoom(token, { audioEnabled: false, videoEnabled: false, mode: 'cf' })

    const trackEvents: Array<{ did: string; kind: string }> = []
    conn.onTrack((did: string, _track: MediaStreamTrack, kind: 'audio' | 'video' | 'screen') => {
      trackEvents.push({ did, kind })
    })

    // Inject a live audio receiver before the signal fires
    mockPC._addReceiver('audio', 'live')

    // Simulate voice.track.published signal
    const publishHandlers = signaling.handlers.get('voice.track.published') ?? []
    for (const h of publishHandlers) {
      h({
        kind: 'audio',
        mediaType: 'audio',
        trackName: 'remote-audio-1',
        sessionId: 'remote-session-1',
        participantId: 'alice-did'
      })
    }

    // Allow async pullRemoteTrack to resolve
    await new Promise((r) => setTimeout(r, 50))

    expect(trackEvents).toHaveLength(1)
    expect(trackEvents[0]).toEqual({ did: 'alice-did', kind: 'audio' })
  })

  it('fires onTrack with kind "screen" for screen share tracks', async () => {
    const token = btoa(JSON.stringify({ room: 'room1', participant: 'local-did' }))
    const conn = await client.joinRoom(token, { audioEnabled: false, videoEnabled: false, mode: 'cf' })

    const trackEvents: Array<{ did: string; kind: string }> = []
    conn.onTrack((did: string, _track: MediaStreamTrack, kind: 'audio' | 'video' | 'screen') => {
      trackEvents.push({ did, kind })
    })

    // Screen shares are video kind tracks with mediaType 'screen'
    mockPC._addReceiver('video', 'live')

    const publishHandlers = signaling.handlers.get('voice.track.published') ?? []
    for (const h of publishHandlers) {
      h({
        kind: 'video',
        mediaType: 'screen',
        trackName: 'remote-screen-1',
        sessionId: 'remote-session-2',
        participantId: 'bob-did'
      })
    }

    await new Promise((r) => setTimeout(r, 50))

    expect(trackEvents).toHaveLength(1)
    expect(trackEvents[0]).toEqual({ did: 'bob-did', kind: 'screen' })
  })

  it('fires onTrackRemoved when voice.track.removed signal arrives', async () => {
    const token = btoa(JSON.stringify({ room: 'room1', participant: 'local-did' }))
    const conn = await client.joinRoom(token, { audioEnabled: false, videoEnabled: false, mode: 'cf' })

    const removedEvents: Array<{ did: string; kind: string }> = []
    conn.onTrackRemoved((did: string, kind: 'audio' | 'video' | 'screen') => {
      removedEvents.push({ did, kind })
    })

    // First publish a track so remoteTrackOwners has an entry
    mockPC._addReceiver('audio', 'live')
    const publishHandlers = signaling.handlers.get('voice.track.published') ?? []
    for (const h of publishHandlers) {
      h({
        kind: 'audio',
        mediaType: 'audio',
        trackName: 'remote-audio-1',
        sessionId: 'remote-session-1',
        participantId: 'alice-did'
      })
    }
    await new Promise((r) => setTimeout(r, 50))

    // Now fire track removal
    const removeHandlers = signaling.handlers.get('voice.track.removed') ?? []
    for (const h of removeHandlers) {
      h({ trackName: 'remote-audio-1' })
    }

    expect(removedEvents).toHaveLength(1)
    expect(removedEvents[0]).toEqual({ did: 'alice-did', kind: 'audio' })
  })

  it('does not fire onTrackRemoved for unknown track names', async () => {
    const token = btoa(JSON.stringify({ room: 'room1', participant: 'local-did' }))
    const conn = await client.joinRoom(token, { audioEnabled: false, videoEnabled: false, mode: 'cf' })

    const removedEvents: Array<{ did: string; kind: string }> = []
    conn.onTrackRemoved((did: string, kind: 'audio' | 'video' | 'screen') => {
      removedEvents.push({ did, kind })
    })

    const removeHandlers = signaling.handlers.get('voice.track.removed') ?? []
    for (const h of removeHandlers) {
      h({ trackName: 'nonexistent-track' })
    }

    expect(removedEvents).toHaveLength(0)
  })
})
