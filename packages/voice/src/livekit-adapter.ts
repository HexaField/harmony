import type { LiveKitAdapter, RoomOptions } from './room-manager.js'
import { randomBytes } from '@harmony/crypto'

/**
 * In-memory test implementation of LiveKitAdapter.
 * Used for testing without a real LiveKit server.
 */
export class InMemoryLiveKitAdapter implements LiveKitAdapter {
  private rooms = new Map<string, { opts: RoomOptions; participants: Set<string>; muted: Map<string, Set<string>> }>()

  async createRoom(roomId: string, opts: RoomOptions): Promise<void> {
    this.rooms.set(roomId, { opts, participants: new Set(), muted: new Map() })
  }

  async deleteRoom(roomId: string): Promise<void> {
    this.rooms.delete(roomId)
  }

  async generateToken(roomId: string, participantId: string, metadata: Record<string, string>): Promise<string> {
    if (!this.rooms.has(roomId)) throw new Error('Room not found')
    // Generate a fake JWT-like token
    const token = Buffer.from(
      JSON.stringify({
        room: roomId,
        participant: participantId,
        metadata,
        iat: Date.now(),
        nonce: Array.from(randomBytes(8), (b) => b.toString(16)).join('')
      })
    ).toString('base64')
    return token
  }

  async listParticipants(roomId: string): Promise<string[]> {
    const room = this.rooms.get(roomId)
    if (!room) return []
    return Array.from(room.participants)
  }

  async removeParticipant(roomId: string, participantId: string): Promise<void> {
    const room = this.rooms.get(roomId)
    if (room) {
      room.participants.delete(participantId)
    }
  }

  async muteParticipant(roomId: string, participantId: string, trackKind: 'audio' | 'video'): Promise<void> {
    const room = this.rooms.get(roomId)
    if (!room) throw new Error('Room not found')
    if (!room.muted.has(participantId)) {
      room.muted.set(participantId, new Set())
    }
    room.muted.get(participantId)!.add(trackKind)
  }

  // Test helpers
  addParticipantToRoom(roomId: string, participantId: string): void {
    const room = this.rooms.get(roomId)
    if (room) room.participants.add(participantId)
  }

  hasRoom(roomId: string): boolean {
    return this.rooms.has(roomId)
  }

  isMuted(roomId: string, participantId: string, trackKind: string): boolean {
    const room = this.rooms.get(roomId)
    if (!room) return false
    return room.muted.get(participantId)?.has(trackKind) ?? false
  }
}
