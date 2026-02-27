// VoiceRoomDO — Dedicated Durable Object for voice room coordination (cloud tier).
// Tracks participants, manages CF Realtime sessions, handles WebSocket connections.

import { DurableObject } from 'cloudflare:workers'
import type { Env, ConnectionMeta } from './types.js'

interface ParticipantState {
  did: string
  audioEnabled: boolean
  videoEnabled: boolean
  joinedAt: string
  sessionId?: string // CF Realtime session ID
}

export class VoiceRoomDO extends DurableObject {
  private participants = new Map<string, ParticipantState>()
  private cfSessionId?: string
  private roomId?: string

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Restore state from storage
    this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<Map<string, ParticipantState>>('participants')
      if (stored) this.participants = stored
      this.cfSessionId = (await this.ctx.storage.get<string>('cfSessionId')) ?? undefined
      this.roomId = (await this.ctx.storage.get<string>('roomId')) ?? undefined
    })
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/info') {
      return Response.json({
        roomId: this.roomId,
        participants: Array.from(this.participants.values()),
        cfSessionId: this.cfSessionId
      })
    }

    // WebSocket upgrade for voice signaling
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 })
    }

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)

    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ did: '', authenticated: false, connectedAt: new Date().toISOString() })

    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const msgStr = typeof message === 'string' ? message : new TextDecoder().decode(message)
    let msg: { type: string; payload: Record<string, unknown> }

    try {
      msg = JSON.parse(msgStr)
    } catch {
      ws.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid JSON' } }))
      return
    }

    switch (msg.type) {
      case 'join':
        await this.handleJoin(ws, msg.payload as { did: string; audioEnabled?: boolean; videoEnabled?: boolean })
        break
      case 'leave':
        await this.handleLeave(ws, msg.payload as { did: string })
        break
      case 'mute':
        await this.handleMute(msg.payload as { did: string; trackKind: 'audio' | 'video'; muted: boolean })
        break
      default:
        ws.send(JSON.stringify({ type: 'error', payload: { message: `Unknown type: ${msg.type}` } }))
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    // Find and remove the participant associated with this WebSocket
    const meta: ConnectionMeta = ws.deserializeAttachment()
    if (meta.did) {
      this.participants.delete(meta.did)
      await this.persist()
      this.broadcastParticipants(ws)

      if (this.participants.size === 0) {
        await this.destroyRoom()
      }
    }
  }

  private async handleJoin(
    ws: WebSocket,
    payload: { did: string; audioEnabled?: boolean; videoEnabled?: boolean }
  ): Promise<void> {
    const participant: ParticipantState = {
      did: payload.did,
      audioEnabled: payload.audioEnabled !== false,
      videoEnabled: payload.videoEnabled ?? false,
      joinedAt: new Date().toISOString()
    }

    this.participants.set(payload.did, participant)

    // Store DID in WebSocket attachment for cleanup on disconnect
    ws.serializeAttachment({ did: payload.did, authenticated: true, connectedAt: participant.joinedAt })

    await this.persist()

    // Send current participants to the joiner
    ws.send(
      JSON.stringify({
        type: 'joined',
        payload: {
          participants: Array.from(this.participants.values()),
          cfSessionId: this.cfSessionId
        }
      })
    )

    // Broadcast updated participant list to others
    this.broadcastParticipants(ws)
  }

  private async handleLeave(_ws: WebSocket, payload: { did: string }): Promise<void> {
    this.participants.delete(payload.did)
    await this.persist()
    this.broadcastParticipants()

    if (this.participants.size === 0) {
      await this.destroyRoom()
    }
  }

  private async handleMute(payload: { did: string; trackKind: 'audio' | 'video'; muted: boolean }): Promise<void> {
    const participant = this.participants.get(payload.did)
    if (!participant) return

    if (payload.trackKind === 'audio') {
      participant.audioEnabled = !payload.muted
    } else {
      participant.videoEnabled = !payload.muted
    }

    await this.persist()
    this.broadcastParticipants()
  }

  private broadcastParticipants(exclude?: WebSocket): void {
    const msg = JSON.stringify({
      type: 'participants.updated',
      payload: { participants: Array.from(this.participants.values()) }
    })

    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== exclude) {
        try {
          ws.send(msg)
        } catch {
          // Connection may be closing
        }
      }
    }
  }

  private async persist(): Promise<void> {
    await this.ctx.storage.put('participants', this.participants)
    if (this.cfSessionId) {
      await this.ctx.storage.put('cfSessionId', this.cfSessionId)
    }
  }

  private async destroyRoom(): Promise<void> {
    this.participants.clear()
    await this.ctx.storage.deleteAll()
    // In production, also close CF Realtime session
    this.cfSessionId = undefined
  }

  /** Set CF Realtime session ID (called by CloudflareCallsAdapter) */
  async setCFSession(sessionId: string): Promise<void> {
    this.cfSessionId = sessionId
    await this.ctx.storage.put('cfSessionId', sessionId)
  }

  /** Initialize room with ID */
  async initRoom(roomId: string): Promise<void> {
    this.roomId = roomId
    await this.ctx.storage.put('roomId', roomId)
  }
}
