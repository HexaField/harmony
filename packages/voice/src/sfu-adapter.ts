/**
 * Client-side SFU adapter interface.
 * Abstracts WebRTC session management so VoiceClient can work with
 * different SFU backends (Cloudflare Realtime, etc.)
 */

/** Signaling callback — all SFU API calls go through this so the server can proxy */
export type SignalingFn = (method: string, payload: Record<string, unknown>) => Promise<Record<string, unknown>>

export interface TrackObject {
  location: 'local' | 'remote'
  trackName: string
  sessionId?: string
  mid?: string
}

export interface PushTracksResult {
  /** SDP answer or updated offer from the SFU */
  sdpAnswer: string
  /** Track-to-mid mappings for identification */
  tracks: Array<{ trackName: string; mid: string }>
}

export interface PullTracksResult {
  /** SDP offer or answer that needs to be set on the peer connection */
  sdpAnswer: string
  /** Track info for consumed tracks */
  tracks: Array<{ trackName: string; mid: string }>
}

export interface ClientSFUAdapter {
  /** Create a new SFU session, returns session ID */
  createSession(): Promise<string>

  /** Push local tracks to the SFU. Takes the local SDP offer. */
  pushTracks(sessionId: string, tracks: TrackObject[], offer: string): Promise<PushTracksResult>

  /** Pull remote tracks from the SFU. */
  pullTracks(sessionId: string, remoteSessionId: string, trackNames: string[]): Promise<PullTracksResult>

  /** Close specific tracks */
  closeTracks(sessionId: string, trackMids: string[], force?: boolean): Promise<void>

  /** Renegotiate the session (e.g. after adding/removing tracks) */
  renegotiate(sessionId: string, sdp: string): Promise<{ sdpAnswer: string }>

  /** Close the entire session */
  closeSession(sessionId: string): Promise<void>

  /** Get the underlying RTCPeerConnection (for E2EE transform attachment) */
  getPeerConnection(): RTCPeerConnection | null
}
