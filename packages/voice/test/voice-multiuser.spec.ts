import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VoiceSignaling, MediaDeviceProvider } from '../src/voice-client.js'
import { VoiceClient } from '../src/voice-client.js'
import type { ClientSFUAdapter, PushTracksResult, PullTracksResult } from '../src/sfu-adapter.js'

// --- WebRTC mocks for Node ---

class MockMediaStreamTrack {
  kind: string
  readyState = 'live'
  enabled = true
  onended: (() => void) | null = null
  constructor(kind: string) {
    this.kind = kind
  }
  stop(): void {
    this.readyState = 'ended'
  }
}

class MockMediaStream {
  private tracks: MockMediaStreamTrack[]
  constructor(tracks: MockMediaStreamTrack[]) {
    this.tracks = tracks
  }
  getTracks(): MockMediaStreamTrack[] {
    return this.tracks
  }
  getAudioTracks(): MockMediaStreamTrack[] {
    return this.tracks.filter((t) => t.kind === 'audio')
  }
  getVideoTracks(): MockMediaStreamTrack[] {
    return this.tracks.filter((t) => t.kind === 'video')
  }
}

class MockRTCPeerConnection {
  connectionState = 'new'
  iceConnectionState = 'new'
  signalingState = 'stable'
  localDescription: { type: string; sdp: string } | null = null
  remoteDescription: { type: string; sdp: string } | null = null
  ontrack: ((event: unknown) => void) | null = null
  private senders: Array<{ track: unknown }> = []
  private receivers: Array<{ track: { kind: string; readyState: string; enabled: boolean } }> = []
  private transceivers: Array<{ direction: string }> = []

  addTransceiver(_kind: string, init?: { direction: string }): void {
    this.transceivers.push({ direction: init?.direction ?? 'sendrecv' })
  }
  addTrack(track: unknown): void {
    this.senders.push({ track })
  }
  getSenders(): Array<{ track: unknown }> {
    return this.senders
  }
  getReceivers(): Array<{ track: { kind: string; readyState: string; enabled: boolean } }> {
    return this.receivers
  }
  async createOffer(): Promise<{ type: string; sdp: string }> {
    return { type: 'offer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' }
  }
  async createAnswer(): Promise<{ type: string; sdp: string }> {
    return { type: 'answer', sdp: 'v=0\r\nanswer\r\n' }
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

vi.stubGlobal('RTCPeerConnection', MockRTCPeerConnection)
vi.stubGlobal('MediaStream', MockMediaStream)
vi.stubGlobal('MediaStreamTrack', MockMediaStreamTrack)

function makeToken(roomId: string, participantId: string): string {
  const data = JSON.stringify({ room: roomId, participant: participantId })
  return Buffer.from(data).toString('base64')
}

function createMockSignaling(): VoiceSignaling & {
  handlers: Map<string, Array<(payload: Record<string, unknown>) => void>>
} {
  const handlers = new Map<string, Array<(payload: Record<string, unknown>) => void>>()
  return {
    handlers,
    sendVoiceSignal: vi.fn(async (_type: string, _payload: Record<string, unknown>) => {
      return { producers: [] }
    }),
    fireVoiceSignal: vi.fn((_type: string, _payload: Record<string, unknown>) => {}),
    onVoiceSignal(type: string, handler: (payload: Record<string, unknown>) => void): void {
      if (!handlers.has(type)) handlers.set(type, [])
      handlers.get(type)!.push(handler)
    },
    offVoiceSignal(_type: string, _handler: (payload: Record<string, unknown>) => void): void {
      // no-op for tests
    }
  }
}

function createMockSFUAdapter(): ClientSFUAdapter & { calls: Array<{ method: string; args: unknown[] }> } {
  const calls: Array<{ method: string; args: unknown[] }> = []
  const mockPc = new MockRTCPeerConnection()

  return {
    calls,
    async createSession(): Promise<string> {
      calls.push({ method: 'createSession', args: [] })
      return 'sfu-sess-1'
    },
    async pushTracks(sessionId: string, tracks: unknown[], offer: string): Promise<PushTracksResult> {
      calls.push({ method: 'pushTracks', args: [sessionId, tracks, offer] })
      return {
        sdpAnswer: 'v=0\r\nanswer\r\n',
        tracks: [{ trackName: 'audio', mid: '0' }]
      }
    },
    async pullTracks(sessionId: string, remoteSessionId: string, trackNames: string[]): Promise<PullTracksResult> {
      calls.push({ method: 'pullTracks', args: [sessionId, remoteSessionId, trackNames] })
      return {
        sdpAnswer: 'v=0\r\npull-answer\r\n',
        tracks: trackNames.map((name, i) => ({ trackName: name, mid: String(i + 10) }))
      }
    },
    async closeTracks(sessionId: string, mids: string[], force?: boolean): Promise<void> {
      calls.push({ method: 'closeTracks', args: [sessionId, mids, force] })
    },
    async renegotiate(sessionId: string, sdp: string): Promise<{ sdpAnswer: string }> {
      calls.push({ method: 'renegotiate', args: [sessionId, sdp] })
      return { sdpAnswer: 'v=0\r\nrenego\r\n' }
    },
    async closeSession(sessionId: string): Promise<void> {
      calls.push({ method: 'closeSession', args: [sessionId] })
    },
    getPeerConnection(): RTCPeerConnection | null {
      return mockPc as unknown as RTCPeerConnection
    }
  }
}

describe('VoiceClient multi-user flow', () => {
  let signaling: ReturnType<typeof createMockSignaling>
  let sfuAdapter: ReturnType<typeof createMockSFUAdapter>
  let mediaProvider: MediaDeviceProvider
  let fakeAudioTrack: MockMediaStreamTrack

  beforeEach(() => {
    signaling = createMockSignaling()
    sfuAdapter = createMockSFUAdapter()
    fakeAudioTrack = new MockMediaStreamTrack('audio')

    mediaProvider = {
      getUserMedia: vi.fn(async (_constraints: MediaStreamConstraints) => {
        return new MockMediaStream([fakeAudioTrack]) as unknown as MediaStream
      }),
      getDisplayMedia: vi.fn(async (_constraints: DisplayMediaStreamOptions) => {
        return new MockMediaStream([]) as unknown as MediaStream
      })
    }
  })

  it('Client A joins and publishes audio', async () => {
    const client = new VoiceClient({
      mediaProvider,
      sfuAdapter: sfuAdapter as unknown as ClientSFUAdapter,
      signaling
    })

    const token = makeToken('room-1', 'client-a')
    await client.joinRoom(token, { audioEnabled: true })

    // createSession should have been called
    expect(sfuAdapter.calls.some((c) => c.method === 'createSession')).toBe(true)

    // pushTracks should have been called for the audio track
    const pushCall = sfuAdapter.calls.find((c) => c.method === 'pushTracks')
    expect(pushCall).toBeDefined()

    // fireVoiceSignal should announce the track
    expect(signaling.fireVoiceSignal).toHaveBeenCalledWith(
      'voice.track.published',
      expect.objectContaining({
        roomId: 'room-1',
        trackName: 'audio',
        kind: 'audio'
      })
    )
  })

  it('Client B receives track.published and pulls remote track', async () => {
    const client = new VoiceClient({
      mediaProvider,
      sfuAdapter: sfuAdapter as unknown as ClientSFUAdapter,
      signaling
    })

    const token = makeToken('room-1', 'client-b')
    // Join without audio so we only test pull behavior
    await client.joinRoom(token, { audioEnabled: false })

    // Simulate receiving a voice.track.published event from Client A
    const handlers = signaling.handlers.get('voice.track.published')
    expect(handlers).toBeDefined()
    expect(handlers!.length).toBeGreaterThan(0)

    // Clear previous calls
    sfuAdapter.calls.length = 0

    // Fire the event
    handlers![0]({
      kind: 'audio',
      mediaType: 'audio',
      trackName: 'remote-audio',
      sessionId: 'remote-sess-a',
      participantId: 'client-a'
    })

    // Wait for async handler
    await new Promise((r) => setTimeout(r, 10))

    const pullCall = sfuAdapter.calls.find((c) => c.method === 'pullTracks')
    expect(pullCall).toBeDefined()
    expect(pullCall!.args[1]).toBe('remote-sess-a')
    expect(pullCall!.args[2]).toEqual(['remote-audio'])
  })

  it('Disconnect cleanup closes SFU session', async () => {
    const client = new VoiceClient({
      mediaProvider,
      sfuAdapter: sfuAdapter as unknown as ClientSFUAdapter,
      signaling
    })

    const token = makeToken('room-1', 'client-a')
    await client.joinRoom(token, { audioEnabled: true })

    sfuAdapter.calls.length = 0

    await client.leaveRoom()

    const closeCall = sfuAdapter.calls.find((c) => c.method === 'closeSession')
    expect(closeCall).toBeDefined()
    expect(closeCall!.args[0]).toBe('sfu-sess-1')

    // Connection should be null
    expect(client.getActiveRoom()).toBeNull()
  })
})
