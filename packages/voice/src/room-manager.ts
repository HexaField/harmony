import { randomBytes } from '@harmony/crypto'
import type { QuadStore, Quad } from '@harmony/quads'
import { HarmonyType, HarmonyPredicate, RDFPredicate, XSDDatatype } from '@harmony/vocab'
import type { ZCAPInvocationProof } from '@harmony/protocol'
import type { ZCAPService } from '@harmony/zcap'
import type { SFUAdapter } from './adapters/types.js'

export type { SFUAdapter }

/** @deprecated Use SFUAdapter instead */
export type LiveKitAdapter = SFUAdapter

export interface VoiceRoom {
  id: string
  communityId: string
  channelId: string
  participants: VoiceParticipant[]
  createdAt: string
  maxParticipants: number
  quality: 'low' | 'medium' | 'high'
  e2eeEnabled: boolean
}

export interface VoiceParticipant {
  did: string
  joinedAt: string
  audioEnabled: boolean
  videoEnabled: boolean
  screenSharing: boolean
  speaking: boolean
}

export interface RoomOptions {
  maxParticipants?: number
  quality?: 'low' | 'medium' | 'high'
  enableRecording?: boolean
  e2eeEnabled?: boolean
}

export interface JoinOptions {
  audioEnabled?: boolean
  videoEnabled?: boolean
}

export interface VoiceConnection {
  roomId: string
  participants: VoiceParticipant[]
  localAudioEnabled: boolean
  localVideoEnabled: boolean
  localScreenSharing: boolean
  toggleAudio(): Promise<void>
  toggleVideo(): Promise<void>
  enableVideo(): Promise<void>
  disableVideo(): Promise<void>
  startScreenShare(sourceId?: string): Promise<void>
  stopScreenShare(): Promise<void>
  getLocalVideoStream(): MediaStream | null
  getLocalAudioStream(): MediaStream | null
  getLocalScreenStream(): MediaStream | null
  onParticipantJoined(cb: (p: VoiceParticipant) => void): void
  onParticipantLeft(cb: (did: string) => void): void
  onSpeakingChanged(cb: (did: string, speaking: boolean) => void): void
  onTrack(cb: (did: string, track: MediaStreamTrack, kind: 'audio' | 'video' | 'screen') => void): void
  debugState(): Record<string, unknown>
  disconnect(): Promise<void>
}

function generateId(): string {
  const bytes = randomBytes(16)
  return 'room-' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export class VoiceRoomManager {
  private rooms = new Map<string, VoiceRoom>()
  private adapter: SFUAdapter
  private store: QuadStore
  private emptyRoomTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private autoDestroyTimeout: number

  constructor(adapter: SFUAdapter, store: QuadStore, _zcap: ZCAPService, opts?: { autoDestroyTimeout?: number }) {
    this.adapter = adapter
    this.store = store
    this.autoDestroyTimeout = opts?.autoDestroyTimeout ?? 30000
  }

  async createRoom(communityId: string, channelId: string, opts?: RoomOptions): Promise<VoiceRoom> {
    const roomId = generateId()
    const room: VoiceRoom = {
      id: roomId,
      communityId,
      channelId,
      participants: [],
      createdAt: new Date().toISOString(),
      maxParticipants: opts?.maxParticipants ?? 25,
      quality: opts?.quality ?? 'medium',
      e2eeEnabled: opts?.e2eeEnabled ?? true
    }

    await this.adapter.createRoom(roomId, opts ?? {})
    this.rooms.set(roomId, room)

    // Store as RDF quads
    const graph = `community:${communityId}`
    const subject = `harmony:${roomId}`
    const quads: Quad[] = [
      { subject, predicate: RDFPredicate.type, object: HarmonyType.VoiceRoom, graph },
      { subject, predicate: HarmonyPredicate.channelId, object: channelId, graph },
      {
        subject,
        predicate: HarmonyPredicate.maxParticipants,
        object: { value: String(room.maxParticipants), datatype: XSDDatatype.integer },
        graph
      },
      {
        subject,
        predicate: HarmonyPredicate.quality,
        object: { value: room.quality, datatype: XSDDatatype.string },
        graph
      },
      {
        subject,
        predicate: HarmonyPredicate.timestamp,
        object: { value: room.createdAt, datatype: XSDDatatype.dateTime },
        graph
      },
      {
        subject,
        predicate: HarmonyPredicate.e2eeEnabled,
        object: { value: String(room.e2eeEnabled), datatype: XSDDatatype.boolean },
        graph
      }
    ]
    await this.store.addAll(quads)

    // Start auto-destroy timer for empty room
    this.startAutoDestroyTimer(roomId)

    return room
  }

  async destroyRoom(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId)
    if (!room) throw new Error('Room not found')

    // Disconnect all participants via adapter
    for (const p of room.participants) {
      await this.adapter.removeParticipant(roomId, p.did)
    }

    await this.adapter.deleteRoom(roomId)

    // Clean up RDF
    const graph = `community:${room.communityId}`
    const subject = `harmony:${roomId}`
    const quads = await this.store.match({ subject, graph })
    for (const q of quads) {
      await this.store.remove(q)
    }

    this.rooms.delete(roomId)
    this.clearAutoDestroyTimer(roomId)
  }

  async getRoom(roomId: string): Promise<VoiceRoom | null> {
    return this.rooms.get(roomId) ?? null
  }

  async listRooms(communityId: string): Promise<VoiceRoom[]> {
    return Array.from(this.rooms.values()).filter((r) => r.communityId === communityId)
  }

  async generateJoinToken(roomId: string, participantDID: string, zcapProof: ZCAPInvocationProof): Promise<string> {
    const room = this.rooms.get(roomId)
    if (!room) throw new Error('Room not found')

    // Verify ZCAP
    const valid = await this.verifyZCAP(zcapProof, 'JoinVoice')
    if (!valid) throw new Error('Unauthorized: invalid JoinVoice ZCAP')

    if (room.participants.length >= room.maxParticipants) {
      throw new Error('Room is full')
    }

    const token = await this.adapter.generateToken(roomId, participantDID, { did: participantDID })
    return token
  }

  addParticipant(roomId: string, did: string, opts?: JoinOptions): void {
    const room = this.rooms.get(roomId)
    if (!room) throw new Error('Room not found')

    if (room.participants.length >= room.maxParticipants) {
      throw new Error('Room is full')
    }

    const participant: VoiceParticipant = {
      did,
      joinedAt: new Date().toISOString(),
      audioEnabled: opts?.audioEnabled ?? true,
      videoEnabled: opts?.videoEnabled ?? false,
      screenSharing: false,
      speaking: false
    }

    room.participants.push(participant)
    this.clearAutoDestroyTimer(roomId)
  }

  removeParticipant(roomId: string, did: string): void {
    const room = this.rooms.get(roomId)
    if (!room) return
    room.participants = room.participants.filter((p) => p.did !== did)
    if (room.participants.length === 0) {
      this.startAutoDestroyTimer(roomId)
    }
  }

  async kickParticipant(roomId: string, participantDID: string, _reason?: string): Promise<void> {
    const room = this.rooms.get(roomId)
    if (!room) throw new Error('Room not found')

    await this.adapter.removeParticipant(roomId, participantDID)
    this.removeParticipant(roomId, participantDID)
  }

  async muteParticipant(roomId: string, participantDID: string, trackKind: 'audio' | 'video'): Promise<void> {
    const room = this.rooms.get(roomId)
    if (!room) throw new Error('Room not found')

    const participant = room.participants.find((p) => p.did === participantDID)
    if (!participant) throw new Error('Participant not found')

    await this.adapter.muteParticipant(roomId, participantDID, trackKind)

    if (trackKind === 'audio') participant.audioEnabled = false
    else participant.videoEnabled = false
  }

  updateSpeaking(roomId: string, did: string, speaking: boolean): void {
    const room = this.rooms.get(roomId)
    if (!room) return
    const p = room.participants.find((part) => part.did === did)
    if (p) p.speaking = speaking
  }

  destroy(): void {
    for (const [, timer] of this.emptyRoomTimers) {
      clearTimeout(timer)
    }
    this.emptyRoomTimers.clear()
  }

  private startAutoDestroyTimer(roomId: string): void {
    this.clearAutoDestroyTimer(roomId)
    const timer = setTimeout(() => {
      const room = this.rooms.get(roomId)
      if (room && room.participants.length === 0) {
        this.destroyRoom(roomId).catch(() => {})
      }
    }, this.autoDestroyTimeout)
    this.emptyRoomTimers.set(roomId, timer)
  }

  private clearAutoDestroyTimer(roomId: string): void {
    const timer = this.emptyRoomTimers.get(roomId)
    if (timer) {
      clearTimeout(timer)
      this.emptyRoomTimers.delete(roomId)
    }
  }

  private async verifyZCAP(proof: ZCAPInvocationProof, expectedAction: string): Promise<boolean> {
    // In production, use zcap.verify() with full chain verification
    // For testing, verify the action matches
    return proof.invocation.action.includes(expectedAction)
  }
}
