import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CloudflareSFUAdapter } from '../src/cf-sfu-adapter.js'
import type { SignalingFn } from '../src/sfu-adapter.js'

// Mock RTCPeerConnection for Node.js test environment
class MockRTCPeerConnection {
  connectionState = 'new'
  iceConnectionState = 'new'
  signalingState = 'stable'
  private transceivers: Array<{ direction: string }> = []
  private senders: Array<{ track: unknown }> = []
  private receivers: Array<{ track: { kind: string; readyState: string; enabled: boolean } }> = []
  localDescription: { type: string; sdp: string } | null = null
  remoteDescription: { type: string; sdp: string } | null = null
  ontrack: ((event: unknown) => void) | null = null

  addTransceiver(kind: string, init?: { direction: string }): void {
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

// Install global mock
globalThis.RTCPeerConnection = MockRTCPeerConnection as unknown as typeof RTCPeerConnection

describe('CloudflareSFUAdapter', () => {
  let adapter: CloudflareSFUAdapter
  let signaling: SignalingFn
  let signalingCalls: Array<{ method: string; payload: Record<string, unknown> }>

  beforeEach(() => {
    signalingCalls = []
    signaling = vi.fn(async (method: string, payload: Record<string, unknown>) => {
      signalingCalls.push({ method, payload })

      if (method === 'cf.session.new') {
        return { sessionId: 'test-session-123' }
      }
      if (method === 'cf.tracks.new') {
        const tracks =
          (payload.tracks as Array<{ trackName: string }>)?.map((t, i) => ({
            trackName: t.trackName,
            mid: `mid-${i}`
          })) ?? []
        return {
          sessionDescription: { type: 'answer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=setup:active\r\n' },
          tracks
        }
      }
      if (method === 'cf.renegotiate') {
        return {
          sessionDescription: { type: 'answer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=renegotiated\r\n' }
        }
      }
      if (method === 'cf.tracks.close') {
        return {}
      }
      if (method === 'cf.session.close') {
        return {}
      }
      return {}
    })

    adapter = new CloudflareSFUAdapter(signaling)
  })

  it('should create a session and return session ID', async () => {
    const sessionId = await adapter.createSession()
    expect(sessionId).toBe('test-session-123')
    expect(signalingCalls).toHaveLength(1)
    expect(signalingCalls[0].method).toBe('cf.session.new')
  })

  it('should create an RTCPeerConnection on session create', async () => {
    await adapter.createSession()
    const pc = adapter.getPeerConnection()
    expect(pc).not.toBeNull()
  })

  it('should push tracks with SDP offer', async () => {
    const sessionId = await adapter.createSession()
    const result = await adapter.pushTracks(
      sessionId,
      [{ location: 'local', trackName: 'audio' }],
      'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n'
    )

    expect(result.tracks).toHaveLength(1)
    expect(result.tracks[0].trackName).toBe('audio')
    expect(result.tracks[0].mid).toBe('mid-0')
    expect(result.sdpAnswer).toBeTruthy()

    // Should have called signaling with cf.tracks.new
    const trackCall = signalingCalls.find((c) => c.method === 'cf.tracks.new')
    expect(trackCall).toBeDefined()
    expect(trackCall!.payload.sessionId).toBe(sessionId)
  })

  it('should pull remote tracks', async () => {
    const sessionId = await adapter.createSession()
    const result = await adapter.pullTracks(sessionId, 'remote-session-456', ['remote-audio'])

    expect(result.tracks).toHaveLength(1)
    expect(result.tracks[0].trackName).toBe('remote-audio')

    // Should have called cf.tracks.new for pulling, then cf.renegotiate for the answer
    const trackCalls = signalingCalls.filter((c) => c.method === 'cf.tracks.new')
    expect(trackCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('should close tracks', async () => {
    const sessionId = await adapter.createSession()
    await adapter.closeTracks(sessionId, ['mid-0', 'mid-1'])

    const closeCall = signalingCalls.find((c) => c.method === 'cf.tracks.close')
    expect(closeCall).toBeDefined()
    expect(closeCall!.payload.sessionId).toBe(sessionId)
  })

  it('should renegotiate session', async () => {
    const sessionId = await adapter.createSession()
    const result = await adapter.renegotiate(sessionId, 'v=0\r\nm=audio 9\r\n')

    expect(result.sdpAnswer).toBeTruthy()
    const renegCall = signalingCalls.find((c) => c.method === 'cf.renegotiate')
    expect(renegCall).toBeDefined()
  })

  it('should close session and clean up peer connection', async () => {
    const sessionId = await adapter.createSession()
    expect(adapter.getPeerConnection()).not.toBeNull()

    await adapter.closeSession(sessionId)
    expect(adapter.getPeerConnection()).toBeNull()

    const closeCall = signalingCalls.find((c) => c.method === 'cf.session.close')
    expect(closeCall).toBeDefined()
  })

  it('should handle full lifecycle: create → push → pull → close', async () => {
    const sessionId = await adapter.createSession()

    // Push local audio
    await adapter.pushTracks(sessionId, [{ location: 'local', trackName: 'audio' }], 'v=0\r\n')

    // Pull remote audio
    await adapter.pullTracks(sessionId, 'remote-session', ['remote-audio'])

    // Close session
    await adapter.closeSession(sessionId)

    expect(adapter.getPeerConnection()).toBeNull()
    expect(signalingCalls.map((c) => c.method)).toEqual([
      'cf.session.new',
      'cf.tracks.new', // push
      'cf.tracks.new', // pull — returns answer, so no separate renegotiate
      'cf.session.close'
    ])
  })
})
