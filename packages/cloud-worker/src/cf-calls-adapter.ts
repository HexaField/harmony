// CloudflareCallsAdapter — SFUAdapter implementation for Cloudflare Realtime SFU.
// Uses CF Realtime REST API for session management with WHIP/WHEP media transport.

import type { SFUAdapter, RoomOptions } from '@harmony/voice'

interface CFSession {
  sessionId: string
  roomId: string
  participantId: string
}

interface CFRoomState {
  sessions: Map<string, CFSession> // participantId → session
  roomSessionId: string // primary room session
}

/**
 * CloudflareCallsAdapter — implements SFUAdapter against Cloudflare Realtime REST API.
 *
 * In production, this makes HTTP requests to the CF Realtime API.
 * In tests, use the mock version.
 */
export class CloudflareCallsAdapter implements SFUAdapter {
  private readonly appId: string
  private readonly appSecret: string
  private readonly accountId: string
  private baseUrl: string
  private rooms = new Map<string, CFRoomState>()

  constructor(opts: { appId: string; appSecret: string; accountId: string; baseUrl?: string }) {
    this.appId = opts.appId
    this.appSecret = opts.appSecret
    this.accountId = opts.accountId
    this.baseUrl = opts.baseUrl ?? `https://rtc.live.cloudflare.com/v1/apps/${opts.appId}`
  }

  async createRoom(roomId: string, _opts: RoomOptions): Promise<void> {
    if (this.rooms.has(roomId)) return

    // Create a CF Realtime session for this room
    const response = await this.cfRequest('POST', '/sessions/new', {
      metadata: { roomId, type: 'room' }
    })

    this.rooms.set(roomId, {
      sessions: new Map(),
      roomSessionId: response.sessionId
    })
  }

  async generateToken(roomId: string, participantId: string, metadata: Record<string, string>): Promise<string> {
    const room = this.rooms.get(roomId)
    if (!room) throw new Error('Room not found')

    // Create a participant session
    const response = await this.cfRequest('POST', '/sessions/new', {
      metadata: { ...metadata, roomId, participantId, type: 'participant' }
    })

    const session: CFSession = {
      sessionId: response.sessionId,
      roomId,
      participantId
    }
    room.sessions.set(participantId, session)

    // Return session info as token (includes WHIP/WHEP endpoints)
    return JSON.stringify({
      sessionId: response.sessionId,
      roomId,
      participantId,
      whipEndpoint: `${this.baseUrl}/sessions/${response.sessionId}/publish`,
      whepEndpoint: `${this.baseUrl}/sessions/${response.sessionId}/subscribe`,
      metadata
    })
  }

  async deleteRoom(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId)
    if (!room) return

    // Close all participant sessions
    for (const session of room.sessions.values()) {
      await this.cfRequest('DELETE', `/sessions/${session.sessionId}`).catch(() => {})
    }

    // Close room session
    await this.cfRequest('DELETE', `/sessions/${room.roomSessionId}`).catch(() => {})

    this.rooms.delete(roomId)
  }

  async listParticipants(roomId: string): Promise<string[]> {
    const room = this.rooms.get(roomId)
    if (!room) return []
    return Array.from(room.sessions.keys())
  }

  async removeParticipant(roomId: string, participantId: string): Promise<void> {
    const room = this.rooms.get(roomId)
    if (!room) return

    const session = room.sessions.get(participantId)
    if (session) {
      await this.cfRequest('DELETE', `/sessions/${session.sessionId}`).catch(() => {})
      room.sessions.delete(participantId)
    }
  }

  async muteParticipant(roomId: string, participantId: string, _trackKind: 'audio' | 'video'): Promise<void> {
    const room = this.rooms.get(roomId)
    if (!room) throw new Error('Room not found')

    const session = room.sessions.get(participantId)
    if (!session) throw new Error('Participant not found')

    // In CF Realtime, muting is done by pausing the track on the session
    // This would use the track API in production
    await this.cfRequest('PUT', `/sessions/${session.sessionId}/tracks/mute`, {
      participantId,
      trackKind: _trackKind
    }).catch(() => {})
  }

  private async cfRequest(method: string, path: string, body?: unknown): Promise<any> {
    const url = `${this.baseUrl}${path}`
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.appSecret}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    })

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error')
      throw new Error(`CF Realtime API error: ${response.status} ${text}`)
    }

    if (response.status === 204) return {}
    return response.json()
  }
}

/**
 * MockCloudflareCallsAdapter — for testing without real CF API.
 * Simulates session creation/deletion in memory.
 */
export class MockCloudflareCallsAdapter implements SFUAdapter {
  private rooms = new Map<string, { participants: Set<string>; muted: Map<string, Set<string>> }>()
  public callLog: Array<{ method: string; args: unknown[] }> = []

  async createRoom(roomId: string, _opts: RoomOptions): Promise<void> {
    this.callLog.push({ method: 'createRoom', args: [roomId, _opts] })
    this.rooms.set(roomId, { participants: new Set(), muted: new Map() })
  }

  async generateToken(roomId: string, participantId: string, metadata: Record<string, string>): Promise<string> {
    this.callLog.push({ method: 'generateToken', args: [roomId, participantId, metadata] })
    const room = this.rooms.get(roomId)
    if (!room) throw new Error('Room not found')
    room.participants.add(participantId)
    return JSON.stringify({
      sessionId: `mock-session-${participantId}`,
      roomId,
      participantId,
      whipEndpoint: `https://mock.cf/sessions/mock-session-${participantId}/publish`,
      whepEndpoint: `https://mock.cf/sessions/mock-session-${participantId}/subscribe`,
      metadata
    })
  }

  async deleteRoom(roomId: string): Promise<void> {
    this.callLog.push({ method: 'deleteRoom', args: [roomId] })
    this.rooms.delete(roomId)
  }

  async listParticipants(roomId: string): Promise<string[]> {
    const room = this.rooms.get(roomId)
    return room ? Array.from(room.participants) : []
  }

  async removeParticipant(roomId: string, participantId: string): Promise<void> {
    this.callLog.push({ method: 'removeParticipant', args: [roomId, participantId] })
    this.rooms.get(roomId)?.participants.delete(participantId)
  }

  async muteParticipant(roomId: string, participantId: string, trackKind: 'audio' | 'video'): Promise<void> {
    this.callLog.push({ method: 'muteParticipant', args: [roomId, participantId, trackKind] })
    const room = this.rooms.get(roomId)
    if (!room) throw new Error('Room not found')
    if (!room.muted.has(participantId)) room.muted.set(participantId, new Set())
    room.muted.get(participantId)!.add(trackKind)
  }
}
