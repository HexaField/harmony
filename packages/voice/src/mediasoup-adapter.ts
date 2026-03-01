/**
 * Client-side mediasoup adapter.
 * Wraps mediasoup-client Device/transports into the ClientSFUAdapter interface,
 * using VoiceSignaling for all server communication.
 */

import type { ClientSFUAdapter, TrackObject, PushTracksResult, PullTracksResult } from './sfu-adapter.js'
import type { VoiceSignaling } from './voice-client.js'

interface TransportParams {
  transportId: string
  dtlsParameters: unknown
  iceCandidates: unknown[]
  iceParameters: unknown
}

interface ProducerEntry {
  producer: any
  trackName: string
}

interface ConsumerEntry {
  consumer: any
  trackName: string
  remoteSessionId: string
}

export class MediasoupClientAdapter implements ClientSFUAdapter {
  private signaling: VoiceSignaling
  private device: any | null = null
  private sendTransport: any | null = null
  private recvTransport: any | null = null
  private producers = new Map<string, ProducerEntry>()
  private consumers = new Map<string, ConsumerEntry>()
  private roomId: string

  constructor(signaling: VoiceSignaling, roomId: string) {
    this.signaling = signaling
    this.roomId = roomId
  }

  async createSession(): Promise<string> {
    const { Device } = await import('mediasoup-client')
    this.device = new Device()

    // Get router capabilities from server
    const capsResponse = await this.signaling.sendVoiceSignal('voice.router.rtpCapabilities', {
      roomId: this.roomId
    })

    await this.device.load({
      routerRtpCapabilities: capsResponse.rtpCapabilities as any
    })

    // Create send transport
    const sendParams = (await this.signaling.sendVoiceSignal('voice.transport.create', {
      roomId: this.roomId,
      direction: 'send'
    })) as unknown as TransportParams & { routerRtpCapabilities?: unknown }

    this.sendTransport = this.device.createSendTransport({
      id: sendParams.transportId,
      iceParameters: sendParams.iceParameters as any,
      iceCandidates: sendParams.iceCandidates as any,
      dtlsParameters: sendParams.dtlsParameters as any,
      iceServers: [],
      additionalSettings: { encodedInsertableStreams: true }
    })

    this.sendTransport.on(
      'connect',
      async ({ dtlsParameters }: any, callback: () => void, errback: (e: Error) => void) => {
        try {
          await this.signaling.sendVoiceSignal('voice.transport.connect', {
            roomId: this.roomId,
            transportId: this.sendTransport.id,
            dtlsParameters
          })
          callback()
        } catch (err) {
          errback(err instanceof Error ? err : new Error(String(err)))
        }
      }
    )

    this.sendTransport.on(
      'produce',
      async (
        { kind, rtpParameters, appData }: any,
        callback: (r: { id: string }) => void,
        errback: (e: Error) => void
      ) => {
        try {
          const response = await this.signaling.sendVoiceSignal('voice.produce', {
            roomId: this.roomId,
            kind,
            rtpParameters,
            mediaType: appData?.trackName ?? kind
          })
          callback({ id: response.producerId as string })
        } catch (err) {
          errback(err instanceof Error ? err : new Error(String(err)))
        }
      }
    )

    // Create recv transport
    const recvParams = (await this.signaling.sendVoiceSignal('voice.transport.create', {
      roomId: this.roomId,
      direction: 'recv'
    })) as unknown as TransportParams

    this.recvTransport = this.device.createRecvTransport({
      id: recvParams.transportId,
      iceParameters: recvParams.iceParameters as any,
      iceCandidates: recvParams.iceCandidates as any,
      dtlsParameters: recvParams.dtlsParameters as any,
      iceServers: [],
      additionalSettings: { encodedInsertableStreams: true }
    })

    this.recvTransport.on(
      'connect',
      async ({ dtlsParameters }: any, callback: () => void, errback: (e: Error) => void) => {
        try {
          await this.signaling.sendVoiceSignal('voice.transport.connect', {
            roomId: this.roomId,
            transportId: this.recvTransport.id,
            dtlsParameters
          })
          callback()
        } catch (err) {
          errback(err instanceof Error ? err : new Error(String(err)))
        }
      }
    )

    return this.roomId
  }

  async pushTracks(_sessionId: string, tracks: TrackObject[], _offer: string): Promise<PushTracksResult> {
    const results: Array<{ trackName: string; mid: string }> = []

    for (const track of tracks) {
      if (track.location !== 'local') continue

      const producer = await this.sendTransport.produce({
        track: null as any, // Caller must add real tracks to the transport beforehand
        appData: { trackName: track.trackName }
      })

      this.producers.set(producer.id, {
        producer,
        trackName: track.trackName
      })

      results.push({
        trackName: track.trackName,
        mid: producer.id
      })
    }

    return {
      sdpAnswer: '', // mediasoup handles SDP internally
      tracks: results
    }
  }

  async pullTracks(_sessionId: string, remoteSessionId: string, trackNames: string[]): Promise<PullTracksResult> {
    const results: Array<{ trackName: string; mid: string }> = []

    for (const trackName of trackNames) {
      const response = await this.signaling.sendVoiceSignal('voice.consume', {
        roomId: this.roomId,
        producerId: trackName, // server maps trackName to producerId
        rtpCapabilities: this.device.rtpCapabilities
      })

      const consumer = await this.recvTransport.consume({
        id: response.consumerId as string,
        producerId: response.producerId as string,
        kind: response.kind as 'audio' | 'video',
        rtpParameters: response.rtpParameters as any
      })

      await this.signaling.sendVoiceSignal('voice.consumer.resume', {
        consumerId: consumer.id
      })

      this.consumers.set(consumer.id, {
        consumer,
        trackName,
        remoteSessionId
      })

      results.push({
        trackName,
        mid: consumer.id
      })
    }

    return {
      sdpAnswer: '', // mediasoup handles SDP internally
      tracks: results
    }
  }

  async closeTracks(_sessionId: string, trackMids: string[], _force?: boolean): Promise<void> {
    for (const mid of trackMids) {
      // Check producers
      const producerEntry = this.producers.get(mid)
      if (producerEntry) {
        if (!producerEntry.producer.closed) {
          producerEntry.producer.close()
        }
        this.producers.delete(mid)
        await this.signaling.sendVoiceSignal('voice.producer.close', {
          producerId: mid
        })
        continue
      }

      // Check consumers
      const consumerEntry = this.consumers.get(mid)
      if (consumerEntry) {
        if (!consumerEntry.consumer.closed) {
          consumerEntry.consumer.close()
        }
        this.consumers.delete(mid)
        await this.signaling.sendVoiceSignal('voice.consumer.close', {
          consumerId: mid
        })
      }
    }
  }

  async renegotiate(_sessionId: string, _sdp: string): Promise<{ sdpAnswer: string }> {
    // mediasoup handles renegotiation internally via its transport events
    return { sdpAnswer: '' }
  }

  async closeSession(_sessionId: string): Promise<void> {
    // Close all producers
    for (const [, entry] of this.producers) {
      if (!entry.producer.closed) {
        entry.producer.close()
      }
    }
    this.producers.clear()

    // Close all consumers
    for (const [, entry] of this.consumers) {
      if (!entry.consumer.closed) {
        entry.consumer.close()
      }
    }
    this.consumers.clear()

    // Close transports
    if (this.sendTransport && !this.sendTransport.closed) {
      this.sendTransport.close()
    }
    if (this.recvTransport && !this.recvTransport.closed) {
      this.recvTransport.close()
    }

    this.sendTransport = null
    this.recvTransport = null
    this.device = null
  }

  getPeerConnection(): RTCPeerConnection | null {
    // mediasoup manages its own transports — no direct PC access
    return null
  }
}
