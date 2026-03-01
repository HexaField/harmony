/**
 * Cloudflare Realtime SFU adapter.
 * All API calls are proxied through the SignalingFn callback — no direct CF API access.
 */

import type { ClientSFUAdapter, SignalingFn, TrackObject, PushTracksResult, PullTracksResult } from './sfu-adapter.js'

export class CloudflareSFUAdapter implements ClientSFUAdapter {
  private signaling: SignalingFn
  private pc: RTCPeerConnection | null = null

  constructor(signaling: SignalingFn) {
    this.signaling = signaling
  }

  async createSession(): Promise<string> {
    this.pc = new RTCPeerConnection({
      bundlePolicy: 'max-bundle',
      iceServers: []
    })

    // Add a transceiver so the initial offer has something to negotiate
    this.pc.addTransceiver('audio', { direction: 'inactive' })

    const response = await this.signaling('cf.session.new', {})
    return response.sessionId as string
  }

  async pushTracks(sessionId: string, tracks: TrackObject[], offer: string): Promise<PushTracksResult> {
    const trackDescriptions = tracks.map((t) => ({
      location: t.location,
      trackName: t.trackName,
      ...(t.mid !== undefined ? { mid: t.mid } : {}),
      ...(t.sessionId !== undefined ? { sessionId: t.sessionId } : {})
    }))

    const response = await this.signaling('cf.tracks.new', {
      sessionId,
      tracks: trackDescriptions,
      sessionDescription: {
        type: 'offer',
        sdp: offer
      }
    })

    const sessionDescription = response.sessionDescription as { sdp: string } | undefined
    const remoteTracks = response.tracks as Array<{ trackName: string; mid: string }> | undefined

    // Apply the SFU's answer to our peer connection
    if (sessionDescription?.sdp && this.pc) {
      await this.pc.setRemoteDescription({
        type: 'answer',
        sdp: sessionDescription.sdp
      })
    }

    return {
      sdpAnswer: sessionDescription?.sdp ?? '',
      tracks: remoteTracks ?? []
    }
  }

  async pullTracks(sessionId: string, remoteSessionId: string, trackNames: string[]): Promise<PullTracksResult> {
    const tracks = trackNames.map((name) => ({
      location: 'remote' as const,
      trackName: name,
      sessionId: remoteSessionId
    }))

    // Request to pull remote tracks — CF returns an offer we need to answer
    const response = await this.signaling('cf.tracks.new', {
      sessionId,
      tracks,
      sessionDescription: undefined
    })

    const sessionDescription = response.sessionDescription as { type: string; sdp: string } | undefined
    const remoteTracks = response.tracks as Array<{ trackName: string; mid: string }> | undefined

    if (!sessionDescription?.sdp || !this.pc) {
      return {
        sdpAnswer: '',
        tracks: remoteTracks ?? []
      }
    }

    if (sessionDescription.type === 'offer') {
      // CF sent us an offer — set it as remote, create answer, then renegotiate
      await this.pc.setRemoteDescription({
        type: 'offer',
        sdp: sessionDescription.sdp
      })

      const answer = await this.pc.createAnswer()
      await this.pc.setLocalDescription(answer)

      const renegResponse = await this.signaling('cf.renegotiate', {
        sessionId,
        sessionDescription: {
          type: 'answer',
          sdp: answer.sdp
        }
      })

      const finalSdp = renegResponse.sessionDescription as { sdp: string } | undefined

      return {
        sdpAnswer: finalSdp?.sdp ?? answer.sdp ?? '',
        tracks: remoteTracks ?? []
      }
    }

    // If it's already an answer, just apply it
    await this.pc.setRemoteDescription({
      type: 'answer',
      sdp: sessionDescription.sdp
    })

    return {
      sdpAnswer: sessionDescription.sdp,
      tracks: remoteTracks ?? []
    }
  }

  async closeTracks(sessionId: string, trackMids: string[], force?: boolean): Promise<void> {
    await this.signaling('cf.tracks.close', {
      sessionId,
      tracks: trackMids.map((mid) => ({ mid })),
      force: force ?? false
    })
  }

  async renegotiate(sessionId: string, sdp: string): Promise<{ sdpAnswer: string }> {
    const response = await this.signaling('cf.renegotiate', {
      sessionId,
      sessionDescription: {
        type: 'offer',
        sdp
      }
    })

    const sessionDescription = response.sessionDescription as { sdp: string } | undefined

    if (sessionDescription?.sdp && this.pc) {
      await this.pc.setRemoteDescription({
        type: 'answer',
        sdp: sessionDescription.sdp
      })
    }

    return {
      sdpAnswer: sessionDescription?.sdp ?? ''
    }
  }

  async closeSession(sessionId: string): Promise<void> {
    await this.signaling('cf.session.close', { sessionId })

    if (this.pc) {
      this.pc.close()
      this.pc = null
    }
  }

  getPeerConnection(): RTCPeerConnection | null {
    return this.pc
  }
}
