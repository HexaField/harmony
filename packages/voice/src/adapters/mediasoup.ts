import type { SFUAdapter, RoomOptions } from './types.js'
import * as mediasoup from 'mediasoup'
import type { types as msTypes } from 'mediasoup'
import jwt from 'jsonwebtoken'

const MEDIA_CODECS = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000
  },
  {
    kind: 'video',
    mimeType: 'video/H264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '42e01f',
      'level-asymmetry-allowed': 1
    }
  }
]

interface RoomState {
  router: msTypes.Router
  transports: Map<string, msTypes.WebRtcTransport>
  producers: Map<string, msTypes.Producer[]>
  consumers: Map<string, msTypes.Consumer[]>
  participants: Set<string>
}

/**
 * MediasoupAdapter — embeds mediasoup SFU in-process for self-hosted Harmony.
 */
export class MediasoupAdapter implements SFUAdapter {
  private workers: msTypes.Worker[] = []
  private rooms = new Map<string, RoomState>()
  private jwtSecret: string
  private webRtcListenIp: msTypes.TransportListenIp
  private nextWorkerIdx = 0

  constructor(opts?: { jwtSecret?: string; listenIp?: string; announcedIp?: string }) {
    this.jwtSecret = opts?.jwtSecret ?? 'harmony-mediasoup-dev-secret'
    this.webRtcListenIp = {
      ip: opts?.listenIp ?? '0.0.0.0',
      announcedIp: opts?.announcedIp ?? '127.0.0.1'
    }
  }

  /**
   * Initialize mediasoup Workers. Call before using the adapter.
   */
  async init(numWorkers?: number): Promise<void> {
    const count = numWorkers ?? Math.min(require('os').cpus().length, 4)
    for (let i = 0; i < count; i++) {
      const workerOptions: Record<string, unknown> = {
        rtcMinPort: 19923,
        rtcMaxPort: 19999,
        logLevel: 'warn'
      }
      // In Electron packaged app, mediasoup worker binary is in app.asar.unpacked
      if (process.env.MEDIASOUP_WORKER_BIN) {
        workerOptions.workerBin = process.env.MEDIASOUP_WORKER_BIN
      }
      const worker = await mediasoup.createWorker(workerOptions as any)
      worker.on('died', () => {
        console.error(`mediasoup Worker ${worker.pid} died, restarting...`)
        this.workers = this.workers.filter((w) => w !== worker)
      })
      this.workers.push(worker)
    }
  }

  async createRoom(roomId: string, _opts: RoomOptions): Promise<void> {
    if (this.rooms.has(roomId)) return
    if (this.workers.length === 0) throw new Error('No mediasoup workers available. Call init() first.')

    const worker = this.workers[this.nextWorkerIdx % this.workers.length]
    this.nextWorkerIdx++

    const router = await worker.createRouter({ mediaCodecs: MEDIA_CODECS as msTypes.RtpCodecCapability[] })

    this.rooms.set(roomId, {
      router,
      transports: new Map(),
      producers: new Map(),
      consumers: new Map(),
      participants: new Set()
    })
  }

  async generateToken(roomId: string, participantId: string, metadata: Record<string, string>): Promise<string> {
    const room = this.rooms.get(roomId)
    if (!room) throw new Error('Room not found')

    // Create WebRtcTransport for this participant
    const transport = await room.router.createWebRtcTransport({
      listenIps: [this.webRtcListenIp],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true
    })

    room.transports.set(participantId, transport)
    room.participants.add(participantId)

    // Encode transport params into JWT
    const token = jwt.sign(
      {
        roomId,
        participantId,
        metadata,
        transportId: transport.id,
        dtlsParameters: transport.dtlsParameters,
        iceCandidates: transport.iceCandidates,
        iceParameters: transport.iceParameters,
        routerRtpCapabilities: room.router.rtpCapabilities
      },
      this.jwtSecret,
      { expiresIn: '1h' }
    )

    return token
  }

  async deleteRoom(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId)
    if (!room) return

    // Close all transports (which closes producers/consumers)
    for (const transport of room.transports.values()) {
      transport.close()
    }

    room.router.close()
    this.rooms.delete(roomId)
  }

  async listParticipants(roomId: string): Promise<string[]> {
    const room = this.rooms.get(roomId)
    if (!room) return []
    return Array.from(room.participants)
  }

  async removeParticipant(roomId: string, participantId: string): Promise<void> {
    const room = this.rooms.get(roomId)
    if (!room) return

    const transport = room.transports.get(participantId)
    if (transport) {
      transport.close()
      room.transports.delete(participantId)
    }

    // Clean up producers and consumers
    room.producers.delete(participantId)
    room.consumers.delete(participantId)
    room.participants.delete(participantId)
  }

  async muteParticipant(roomId: string, participantId: string, trackKind: 'audio' | 'video'): Promise<void> {
    const room = this.rooms.get(roomId)
    if (!room) throw new Error('Room not found')

    const producers = room.producers.get(participantId) ?? []
    for (const producer of producers) {
      if (producer.kind === trackKind) {
        await producer.pause()
      }
    }
  }

  /**
   * Verify and decode a token. Used by VoiceClient to get transport params.
   */
  verifyToken(token: string): {
    roomId: string
    participantId: string
    transportId: string
    dtlsParameters: msTypes.DtlsParameters
    iceCandidates: msTypes.IceCandidate[]
    iceParameters: msTypes.IceParameters
    routerRtpCapabilities: msTypes.RtpCapabilities
  } {
    return jwt.verify(token, this.jwtSecret) as any
  }

  /**
   * Connect a participant's transport (called after client-side ICE/DTLS).
   */
  async connectTransport(roomId: string, participantId: string, dtlsParameters: msTypes.DtlsParameters): Promise<void> {
    const room = this.rooms.get(roomId)
    if (!room) throw new Error('Room not found')

    const transport = room.transports.get(participantId)
    if (!transport) throw new Error('Transport not found')

    await transport.connect({ dtlsParameters })
  }

  /**
   * Create a Producer on the participant's transport.
   */
  async produce(
    roomId: string,
    participantId: string,
    rtpParameters: msTypes.RtpParameters,
    kind: msTypes.MediaKind
  ): Promise<string> {
    const room = this.rooms.get(roomId)
    if (!room) throw new Error('Room not found')

    const transport = room.transports.get(participantId)
    if (!transport) throw new Error('Transport not found')

    const producer = await transport.produce({ kind, rtpParameters })

    if (!room.producers.has(participantId)) {
      room.producers.set(participantId, [])
    }
    room.producers.get(participantId)!.push(producer)

    return producer.id
  }

  /**
   * Create a Consumer for subscribing to another participant's media.
   */
  async consume(
    roomId: string,
    consumerParticipantId: string,
    producerId: string,
    rtpCapabilities: msTypes.RtpCapabilities
  ): Promise<{
    consumerId: string
    producerId: string
    kind: msTypes.MediaKind
    rtpParameters: msTypes.RtpParameters
  }> {
    const room = this.rooms.get(roomId)
    if (!room) throw new Error('Room not found')

    if (!room.router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error('Cannot consume this producer')
    }

    const transport = room.transports.get(consumerParticipantId)
    if (!transport) throw new Error('Consumer transport not found')

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: true // Resume after client confirms
    })

    if (!room.consumers.has(consumerParticipantId)) {
      room.consumers.set(consumerParticipantId, [])
    }
    room.consumers.get(consumerParticipantId)!.push(consumer)

    return {
      consumerId: consumer.id,
      producerId: consumer.producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters
    }
  }

  /**
   * Get router RTP capabilities for a room.
   */
  getRouterRtpCapabilities(roomId: string): msTypes.RtpCapabilities | null {
    const room = this.rooms.get(roomId)
    return room?.router.rtpCapabilities ?? null
  }

  /**
   * Close all workers on shutdown.
   */
  async close(): Promise<void> {
    for (const room of this.rooms.values()) {
      room.router.close()
    }
    this.rooms.clear()
    for (const worker of this.workers) {
      worker.close()
    }
    this.workers = []
  }
}
