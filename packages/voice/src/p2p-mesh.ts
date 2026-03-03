/**
 * P2P Mesh Manager for WebRTC voice/video/screen sharing.
 * Full mesh topology: each participant maintains a direct peer connection to every other participant.
 * Used when server returns mode: 'signaling' (no CF credentials available).
 */

import type { VoiceSignaling } from './voice-client.js'
import type { E2EEBridge } from './e2ee-bridge.js'
import { createEncryptTransform, createDecryptTransform } from './insertable-streams.js'

export interface P2PMeshConfig {
  rtcConfig?: RTCConfiguration
  e2eeBridge?: E2EEBridge
}

const DEFAULT_RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]
}

interface PeerState {
  pc: RTCPeerConnection
  /** Tracks we've added to this peer's senders, keyed by kind */
  senders: Map<string, RTCRtpSender>
  makingOffer: boolean
  ignoreOffer: boolean
}

export class P2PMeshManager {
  private peers = new Map<string, PeerState>()
  private localTracks = new Map<string, MediaStreamTrack>() // kind → track
  private signaling: VoiceSignaling
  private rtcConfig: RTCConfiguration
  private e2eeBridge?: E2EEBridge
  private localDID: string
  private destroyed = false

  // Callbacks
  onRemoteTrack: ((did: string, track: MediaStreamTrack, kind: 'audio' | 'video' | 'screen') => void) | null = null
  onRemoteTrackRemoved: ((did: string, kind: 'audio' | 'video' | 'screen') => void) | null = null
  onPeerConnectionStateChanged: ((did: string, state: RTCPeerConnectionState) => void) | null = null

  constructor(signaling: VoiceSignaling, localDID: string, config?: P2PMeshConfig) {
    this.signaling = signaling
    this.localDID = localDID
    this.rtcConfig = config?.rtcConfig ?? DEFAULT_RTC_CONFIG
    this.e2eeBridge = config?.e2eeBridge
  }

  /**
   * Add a new peer connection for the given DID.
   * @param did Remote participant DID
   * @param isInitiator If true, this side creates the offer (polite peer pattern: higher DID is polite)
   */
  async addPeer(did: string, isInitiator: boolean): Promise<void> {
    if (this.destroyed || this.peers.has(did)) return

    const pc = new RTCPeerConnection(this.rtcConfig)
    const state: PeerState = {
      pc,
      senders: new Map(),
      makingOffer: false,
      ignoreOffer: false
    }
    this.peers.set(did, state)

    // Add existing local tracks to this new peer connection
    for (const [kind, track] of this.localTracks) {
      const sender = pc.addTrack(track)
      state.senders.set(kind, sender)
      this.attachSenderTransform(sender, kind === 'screen' ? 'video' : (kind as 'audio' | 'video'))
    }

    // Handle incoming tracks
    pc.ontrack = (event) => {
      const track = event.track
      // Determine kind from transceiver mid or track metadata
      const kind = this.inferTrackKind(event)
      this.attachReceiverTransform(event.receiver, kind === 'screen' ? 'video' : (kind as 'audio' | 'video'))
      this.onRemoteTrack?.(did, track, kind)

      track.onended = () => {
        this.onRemoteTrackRemoved?.(did, kind)
      }
      track.onmute = () => {
        // Track muted (could indicate removal in some browsers)
      }
    }

    // ICE candidate handling
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.signaling.fireVoiceSignal?.('voice.ice', {
          targetDID: did,
          candidate: event.candidate.toJSON()
        })
      }
    }

    // Connection state changes
    pc.onconnectionstatechange = () => {
      this.onPeerConnectionStateChanged?.(did, pc.connectionState)
      if (pc.connectionState === 'failed') {
        console.warn(`[P2PMesh] Connection to ${did} failed, attempting ICE restart`)
        pc.restartIce()
      }
    }

    // Negotiation needed — perfect negotiation pattern
    pc.onnegotiationneeded = async () => {
      try {
        state.makingOffer = true
        await pc.setLocalDescription()
        this.signaling.fireVoiceSignal?.('voice.offer', {
          targetDID: did,
          sdp: pc.localDescription!.toJSON()
        })
      } catch (err) {
        console.error(`[P2PMesh] Negotiation error with ${did}:`, err)
      } finally {
        state.makingOffer = false
      }
    }

    // If we're the initiator (our DID is lexicographically greater = impolite), create the initial offer
    if (isInitiator) {
      // The onnegotiationneeded will fire since we added tracks above
      // But if no tracks yet, we need to trigger it
      if (this.localTracks.size === 0) {
        // Add a data channel to trigger negotiation
        pc.createDataChannel('control')
      }
    }
  }

  /**
   * Remove a peer connection.
   */
  removePeer(did: string): void {
    const state = this.peers.get(did)
    if (!state) return
    state.pc.close()
    this.peers.delete(did)
  }

  /**
   * Handle an incoming SDP offer using perfect negotiation pattern.
   */
  async handleOffer(fromDID: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    let state = this.peers.get(fromDID)

    // If we don't have a peer connection for this DID yet, create one (they initiated)
    if (!state) {
      await this.addPeer(fromDID, false)
      state = this.peers.get(fromDID)!
    }

    const pc = state.pc
    // Perfect negotiation: polite peer (lower DID lexicographically)
    const isPolite = this.localDID < fromDID

    const offerCollision = state.makingOffer || pc.signalingState !== 'stable'

    if (offerCollision && !isPolite) {
      // Impolite peer: ignore the offer, our offer takes precedence
      state.ignoreOffer = true
      return
    }

    state.ignoreOffer = false

    try {
      await pc.setRemoteDescription(sdp)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      this.signaling.fireVoiceSignal?.('voice.answer', {
        targetDID: fromDID,
        sdp: pc.localDescription!.toJSON()
      })
    } catch (err) {
      console.error(`[P2PMesh] Failed to handle offer from ${fromDID}:`, err)
    }
  }

  /**
   * Handle an incoming SDP answer.
   */
  async handleAnswer(fromDID: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    const state = this.peers.get(fromDID)
    if (!state) return

    try {
      await state.pc.setRemoteDescription(sdp)
    } catch (err) {
      console.error(`[P2PMesh] Failed to handle answer from ${fromDID}:`, err)
    }
  }

  /**
   * Handle an incoming ICE candidate.
   */
  async handleIceCandidate(fromDID: string, candidate: RTCIceCandidateInit): Promise<void> {
    const state = this.peers.get(fromDID)
    if (!state) return

    try {
      await state.pc.addIceCandidate(candidate)
    } catch (err) {
      if (!state.ignoreOffer) {
        console.error(`[P2PMesh] Failed to add ICE candidate from ${fromDID}:`, err)
      }
    }
  }

  /**
   * Add a local track to be sent to all peers.
   */
  addLocalTrack(track: MediaStreamTrack, kind: 'audio' | 'video' | 'screen'): void {
    this.localTracks.set(kind, track)

    for (const [did, state] of this.peers) {
      // Remove existing sender for this kind if any
      const existingSender = state.senders.get(kind)
      if (existingSender) {
        try {
          state.pc.removeTrack(existingSender)
        } catch {
          // Peer connection might be closed
        }
      }
      try {
        const sender = state.pc.addTrack(track)
        state.senders.set(kind, sender)
        this.attachSenderTransform(sender, kind === 'screen' ? 'video' : (kind as 'audio' | 'video'))
      } catch (err) {
        console.error(`[P2PMesh] Failed to add track to peer ${did}:`, err)
      }
    }
  }

  /**
   * Remove a local track from all peers.
   */
  removeLocalTrack(kind: 'audio' | 'video' | 'screen'): void {
    this.localTracks.delete(kind)

    for (const [_did, state] of this.peers) {
      const sender = state.senders.get(kind)
      if (sender) {
        try {
          state.pc.removeTrack(sender)
        } catch {
          // Peer connection might be closed
        }
        state.senders.delete(kind)
      }
    }
  }

  /**
   * Set deafened state — enable/disable all received tracks.
   */
  setDeafened(deafened: boolean): void {
    for (const [, state] of this.peers) {
      for (const receiver of state.pc.getReceivers()) {
        if (receiver.track) {
          receiver.track.enabled = !deafened
        }
      }
    }
  }

  /**
   * Get all peer connections (for debugging).
   */
  getPeers(): Map<string, RTCPeerConnection> {
    const result = new Map<string, RTCPeerConnection>()
    for (const [did, state] of this.peers) {
      result.set(did, state.pc)
    }
    return result
  }

  /**
   * Clean up all peer connections.
   */
  destroy(): void {
    this.destroyed = true
    for (const [, state] of this.peers) {
      state.pc.close()
    }
    this.peers.clear()
    this.localTracks.clear()
    this.onRemoteTrack = null
    this.onRemoteTrackRemoved = null
    this.onPeerConnectionStateChanged = null
  }

  // --- E2EE transform helpers ---

  private attachSenderTransform(sender: RTCRtpSender, kind: 'audio' | 'video'): void {
    if (!this.e2eeBridge) return
    try {
      if ('createEncodedStreams' in sender) {
        const { readable, writable } = (
          sender as unknown as { createEncodedStreams(): { readable: ReadableStream; writable: WritableStream } }
        ).createEncodedStreams()
        const transform = createEncryptTransform(this.e2eeBridge, kind)
        readable.pipeThrough(transform).pipeTo(writable)
      }
    } catch (err) {
      console.warn('[P2PMesh] Failed to attach sender E2EE transform:', err)
    }
  }

  private attachReceiverTransform(receiver: RTCRtpReceiver, kind: 'audio' | 'video'): void {
    if (!this.e2eeBridge) return
    try {
      if ('createEncodedStreams' in receiver) {
        const { readable, writable } = (
          receiver as unknown as { createEncodedStreams(): { readable: ReadableStream; writable: WritableStream } }
        ).createEncodedStreams()
        const transform = createDecryptTransform(this.e2eeBridge, kind)
        readable.pipeThrough(transform).pipeTo(writable)
      }
    } catch (err) {
      console.warn('[P2PMesh] Failed to attach receiver E2EE transform:', err)
    }
  }

  /**
   * Infer track kind from RTCTrackEvent.
   * For screen shares, we check the transceiver's mid or rely on the track label.
   */
  private inferTrackKind(event: RTCTrackEvent): 'audio' | 'video' | 'screen' {
    if (event.track.kind === 'audio') return 'audio'
    // Check if this is a screen share by looking at the transceiver direction or track label
    // In P2P mesh, we use stream IDs to distinguish video from screen
    const streams = event.streams
    if (streams.length > 0 && streams[0].id.includes('screen')) return 'screen'
    // Also check track label
    if (event.track.label.toLowerCase().includes('screen')) return 'screen'
    return 'video'
  }
}
