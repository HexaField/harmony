import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CloudflareSFUAdapter } from '../src/cf-sfu-adapter.js'
import type { SignalingFn } from '../src/sfu-adapter.js'

// Mock RTCPeerConnection for Node
class MockRTCPeerConnection {
  connectionState = 'new'
  iceConnectionState = 'new'
  signalingState = 'stable'
  localDescription: { type: string; sdp: string } | null = null
  remoteDescription: { type: string; sdp: string } | null = null
  ontrack: ((event: unknown) => void) | null = null
  private transceivers: Array<{ direction: string }> = []
  private senders: Array<{ track: unknown }> = []
  private receivers: Array<{ track: { kind: string; readyState: string; enabled: boolean } }> = []

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

vi.stubGlobal('RTCPeerConnection', MockRTCPeerConnection)

describe('CloudflareSFUAdapter integration', () => {
  let signaling: SignalingFn
  let signalingCalls: Array<{ method: string; payload: Record<string, unknown> }>
  let adapter: CloudflareSFUAdapter

  beforeEach(() => {
    signalingCalls = []
    signaling = vi.fn(async (method: string, payload: Record<string, unknown>) => {
      signalingCalls.push({ method, payload })

      if (method === 'cf.session.new') {
        return { sessionId: 'sess-123' }
      }
      if (method === 'cf.tracks.new') {
        return {
          sessionDescription: { type: 'answer', sdp: 'v=0\r\nanswer-sdp\r\n' },
          tracks: [{ trackName: 'audio', mid: '0' }]
        }
      }
      if (method === 'cf.tracks.close') {
        return {}
      }
      if (method === 'cf.renegotiate') {
        return {
          sessionDescription: { type: 'answer', sdp: 'v=0\r\nrenegotiated-sdp\r\n' }
        }
      }
      if (method === 'cf.session.close') {
        return {}
      }
      return {}
    })
    adapter = new CloudflareSFUAdapter(signaling)
  })

  it('createSession calls cf.session.new and returns session ID', async () => {
    const sessionId = await adapter.createSession()

    expect(sessionId).toBe('sess-123')
    expect(signalingCalls).toHaveLength(1)
    expect(signalingCalls[0].method).toBe('cf.session.new')
  })

  it('pushTracks sends offer SDP and returns answer with track mappings', async () => {
    const sessionId = await adapter.createSession()

    const result = await adapter.pushTracks(
      sessionId,
      [{ location: 'local', trackName: 'audio' }],
      'v=0\r\noffer-sdp\r\n'
    )

    expect(result.sdpAnswer).toBe('v=0\r\nanswer-sdp\r\n')
    expect(result.tracks).toEqual([{ trackName: 'audio', mid: '0' }])

    const pushCall = signalingCalls.find((c) => c.method === 'cf.tracks.new')
    expect(pushCall).toBeDefined()
    expect(pushCall!.payload.sessionId).toBe('sess-123')
    expect(pushCall!.payload.sessionDescription).toEqual({
      type: 'offer',
      sdp: 'v=0\r\noffer-sdp\r\n'
    })
    expect(pushCall!.payload.tracks).toEqual([{ location: 'local', trackName: 'audio' }])
  })

  it('pullTracks sends remote session ID and track names', async () => {
    const sessionId = await adapter.createSession()

    // Override signaling for pull — CF sends an offer back
    ;(signaling as ReturnType<typeof vi.fn>).mockImplementation(
      async (method: string, payload: Record<string, unknown>) => {
        signalingCalls.push({ method, payload })
        if (method === 'cf.tracks.new') {
          return {
            sessionDescription: { type: 'offer', sdp: 'v=0\r\ncf-offer\r\n' },
            tracks: [{ trackName: 'remote-audio', mid: '1' }]
          }
        }
        if (method === 'cf.renegotiate') {
          return {
            sessionDescription: { sdp: 'v=0\r\nfinal-sdp\r\n' }
          }
        }
        return {}
      }
    )

    const result = await adapter.pullTracks(sessionId, 'remote-sess-456', ['remote-audio'])

    const pullCall = signalingCalls.find((c) => c.method === 'cf.tracks.new' && signalingCalls.indexOf(c) > 0)
    expect(pullCall).toBeDefined()
    expect(pullCall!.payload.sessionId).toBe('sess-123')
    expect(pullCall!.payload.tracks).toEqual([
      { location: 'remote', trackName: 'remote-audio', sessionId: 'remote-sess-456' }
    ])

    expect(result.tracks).toEqual([{ trackName: 'remote-audio', mid: '1' }])
    expect(result.sdpAnswer).toBe('v=0\r\nfinal-sdp\r\n')
  })

  it('closeTracks calls cf.tracks.close with track mids', async () => {
    const sessionId = await adapter.createSession()

    await adapter.closeTracks(sessionId, ['0', '1'])

    const closeCall = signalingCalls.find((c) => c.method === 'cf.tracks.close')
    expect(closeCall).toBeDefined()
    expect(closeCall!.payload.sessionId).toBe('sess-123')
    expect(closeCall!.payload.tracks).toEqual([{ mid: '0' }, { mid: '1' }])
    expect(closeCall!.payload.force).toBe(false)
  })

  it('renegotiate sends new SDP and returns answer', async () => {
    const sessionId = await adapter.createSession()

    const result = await adapter.renegotiate(sessionId, 'v=0\r\nnew-offer\r\n')

    const renego = signalingCalls.find((c) => c.method === 'cf.renegotiate')
    expect(renego).toBeDefined()
    expect(renego!.payload.sessionId).toBe('sess-123')
    expect(renego!.payload.sessionDescription).toEqual({
      type: 'offer',
      sdp: 'v=0\r\nnew-offer\r\n'
    })
    expect(result.sdpAnswer).toBe('v=0\r\nrenegotiated-sdp\r\n')
  })

  it('closeSession calls cf.session.close and cleans up peer connection', async () => {
    const sessionId = await adapter.createSession()
    expect(adapter.getPeerConnection()).not.toBeNull()

    await adapter.closeSession(sessionId)

    const closeCall = signalingCalls.find((c) => c.method === 'cf.session.close')
    expect(closeCall).toBeDefined()
    expect(closeCall!.payload.sessionId).toBe('sess-123')
    expect(adapter.getPeerConnection()).toBeNull()
  })
})
