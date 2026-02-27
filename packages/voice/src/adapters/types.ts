import type { RoomOptions } from '../room-manager.js'

export type { RoomOptions }

/**
 * SFUAdapter — abstract interface for voice SFU backends.
 * Renamed from LiveKitAdapter to support multiple implementations.
 */
export interface SFUAdapter {
  createRoom(roomId: string, opts: RoomOptions): Promise<void>
  deleteRoom(roomId: string): Promise<void>
  generateToken(roomId: string, participantId: string, metadata: Record<string, string>): Promise<string>
  listParticipants(roomId: string): Promise<string[]>
  removeParticipant(roomId: string, participantId: string): Promise<void>
  muteParticipant(roomId: string, participantId: string, trackKind: 'audio' | 'video'): Promise<void>
}
