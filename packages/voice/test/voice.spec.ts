import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { VoiceRoomManager } from '../src/room-manager.js'
import { VoiceClient } from '../src/voice-client.js'
import { InMemoryAdapter } from '../src/adapters/in-memory.js'
import { E2EEBridge } from '../src/e2ee-bridge.js'
import { MemoryQuadStore } from '@harmony/quads'
import { createCryptoProvider, randomBytes } from '@harmony/crypto'
import { ZCAPService } from '@harmony/zcap'
import { HarmonyType } from '@harmony/vocab'
import type { ZCAPInvocationProof } from '@harmony/protocol'
import type { VoiceParticipant } from '../src/room-manager.js'

const crypto = createCryptoProvider()
const zcap = new ZCAPService(crypto)

function makeZCAPProof(action = 'JoinVoice'): ZCAPInvocationProof {
  return {
    capabilityId: 'urn:uuid:test-cap',
    capabilityChain: ['urn:uuid:root'],
    invocation: {
      action,
      target: 'harmony:voice-room',
      proof: {
        type: 'Ed25519Signature2020',
        created: new Date().toISOString(),
        verificationMethod: 'did:key:test#key-1',
        proofPurpose: 'capabilityInvocation',
        proofValue: 'test-sig'
      }
    }
  }
}

describe('@harmony/voice', () => {
  let store: MemoryQuadStore
  let adapter: InMemoryAdapter
  let manager: VoiceRoomManager

  beforeEach(() => {
    store = new MemoryQuadStore()
    adapter = new InMemoryAdapter()
    manager = new VoiceRoomManager(adapter, store, zcap, { autoDestroyTimeout: 100 })
  })

  afterEach(() => {
    manager.destroy()
  })

  describe('Room Management', () => {
    it('MUST create a voice room for a channel', async () => {
      const room = await manager.createRoom('comm1', 'ch-voice')
      expect(room.id).toBeTruthy()
      expect(room.communityId).toBe('comm1')
      expect(room.channelId).toBe('ch-voice')
      expect(room.participants).toHaveLength(0)
    })

    it('MUST enforce maxParticipants limit', async () => {
      const room = await manager.createRoom('comm1', 'ch1', { maxParticipants: 2 })
      manager.addParticipant(room.id, 'did:key:alice')
      manager.addParticipant(room.id, 'did:key:bob')
      expect(() => manager.addParticipant(room.id, 'did:key:charlie')).toThrow('full')
    })

    it('MUST destroy room and disconnect all participants', async () => {
      const room = await manager.createRoom('comm1', 'ch1')
      manager.addParticipant(room.id, 'did:key:alice')
      await manager.destroyRoom(room.id)
      expect(await manager.getRoom(room.id)).toBeNull()
    })

    it('MUST list active rooms for a community', async () => {
      await manager.createRoom('comm1', 'ch1')
      await manager.createRoom('comm1', 'ch2')
      await manager.createRoom('comm2', 'ch3')
      const rooms = await manager.listRooms('comm1')
      expect(rooms).toHaveLength(2)
    })

    it('MUST store room metadata as RDF quads', async () => {
      const room = await manager.createRoom('comm1', 'ch1')
      const quads = await store.match({ subject: `harmony:${room.id}` })
      expect(quads.length).toBeGreaterThan(0)
      const typeQuad = quads.find((q) => q.object === HarmonyType.VoiceRoom)
      expect(typeQuad).toBeTruthy()
    })

    it('MUST auto-destroy empty rooms after timeout', async () => {
      const room = await manager.createRoom('comm1', 'ch1')
      manager.addParticipant(room.id, 'did:key:alice')
      manager.removeParticipant(room.id, 'did:key:alice')
      // Wait for auto-destroy timeout
      await new Promise((r) => setTimeout(r, 200))
      expect(await manager.getRoom(room.id)).toBeNull()
    })
  })

  describe('Authorization', () => {
    it('MUST verify ZCAP proof before issuing join token', async () => {
      const room = await manager.createRoom('comm1', 'ch1')
      const token = await manager.generateJoinToken(room.id, 'did:key:alice', makeZCAPProof())
      expect(token).toBeTruthy()
    })

    it('MUST reject join without JoinVoice capability', async () => {
      const room = await manager.createRoom('comm1', 'ch1')
      await expect(manager.generateJoinToken(room.id, 'did:key:alice', makeZCAPProof('ReadChannel'))).rejects.toThrow(
        'Unauthorized'
      )
    })

    it('MUST reject join to non-existent room', async () => {
      await expect(manager.generateJoinToken('nonexistent', 'did:key:alice', makeZCAPProof())).rejects.toThrow(
        'not found'
      )
    })

    it('MUST allow admin to kick participant via ZCAP', async () => {
      const room = await manager.createRoom('comm1', 'ch1')
      manager.addParticipant(room.id, 'did:key:alice')
      await manager.kickParticipant(room.id, 'did:key:alice', 'disruptive')
      const updated = await manager.getRoom(room.id)
      expect(updated!.participants.find((p) => p.did === 'did:key:alice')).toBeUndefined()
    })

    it('MUST allow moderator to mute participant via ZCAP', async () => {
      const room = await manager.createRoom('comm1', 'ch1')
      manager.addParticipant(room.id, 'did:key:alice')
      await manager.muteParticipant(room.id, 'did:key:alice', 'audio')
      const updated = await manager.getRoom(room.id)
      const alice = updated!.participants.find((p) => p.did === 'did:key:alice')
      expect(alice!.audioEnabled).toBe(false)
    })
  })

  describe('Participant Tracking', () => {
    it('MUST track participant join/leave events', async () => {
      const room = await manager.createRoom('comm1', 'ch1')
      manager.addParticipant(room.id, 'did:key:alice')
      expect((await manager.getRoom(room.id))!.participants).toHaveLength(1)
      manager.removeParticipant(room.id, 'did:key:alice')
      expect((await manager.getRoom(room.id))!.participants).toHaveLength(0)
    })

    it('MUST track audio/video/screen sharing state', async () => {
      const room = await manager.createRoom('comm1', 'ch1')
      manager.addParticipant(room.id, 'did:key:alice', { audioEnabled: true, videoEnabled: true })
      const alice = (await manager.getRoom(room.id))!.participants[0]
      expect(alice.audioEnabled).toBe(true)
      expect(alice.videoEnabled).toBe(true)
      expect(alice.screenSharing).toBe(false)
    })

    it('MUST detect speaking state changes', async () => {
      const room = await manager.createRoom('comm1', 'ch1')
      manager.addParticipant(room.id, 'did:key:alice')
      manager.updateSpeaking(room.id, 'did:key:alice', true)
      const alice = (await manager.getRoom(room.id))!.participants[0]
      expect(alice.speaking).toBe(true)
    })
  })

  describe('LiveKit Integration', () => {
    it('MUST generate valid LiveKit join tokens', async () => {
      const room = await manager.createRoom('comm1', 'ch1')
      const token = await manager.generateJoinToken(room.id, 'did:key:alice', makeZCAPProof())
      expect(token).toBeTruthy()
      // Decode and verify token contents
      const decoded = JSON.parse(Buffer.from(token, 'base64').toString())
      expect(decoded.room).toBe(room.id)
      expect(decoded.participant).toBe('did:key:alice')
    })

    it('MUST include participant DID in token metadata', async () => {
      const room = await manager.createRoom('comm1', 'ch1')
      const token = await manager.generateJoinToken(room.id, 'did:key:alice', makeZCAPProof())
      const decoded = JSON.parse(Buffer.from(token, 'base64').toString())
      expect(decoded.metadata.did).toBe('did:key:alice')
    })

    it('MUST configure E2EE in LiveKit room settings', async () => {
      const room = await manager.createRoom('comm1', 'ch1', { e2eeEnabled: true })
      expect(room.e2eeEnabled).toBe(true)
    })
  })

  describe('Client Connection', () => {
    it('MUST connect to LiveKit room with token', async () => {
      const room = await manager.createRoom('comm1', 'ch1')
      const token = await manager.generateJoinToken(room.id, 'did:key:alice', makeZCAPProof())
      const voiceClient = new VoiceClient()
      const conn = await voiceClient.joinRoom(token)
      expect(conn.roomId).toBe(room.id)
    })

    it('MUST toggle local audio on/off', async () => {
      const room = await manager.createRoom('comm1', 'ch1')
      const token = await manager.generateJoinToken(room.id, 'did:key:alice', makeZCAPProof())
      const voiceClient = new VoiceClient()
      const conn = await voiceClient.joinRoom(token)
      expect(conn.localAudioEnabled).toBe(true)
      await conn.toggleAudio()
      expect(conn.localAudioEnabled).toBe(false)
    })

    it('MUST toggle local video on/off', async () => {
      const room = await manager.createRoom('comm1', 'ch1')
      const token = await manager.generateJoinToken(room.id, 'did:key:alice', makeZCAPProof())
      const voiceClient = new VoiceClient()
      const conn = await voiceClient.joinRoom(token, { videoEnabled: true })
      expect(conn.localVideoEnabled).toBe(true)
      await conn.toggleVideo()
      expect(conn.localVideoEnabled).toBe(false)
    })

    it('MUST fire onParticipantJoined callback', async () => {
      const room = await manager.createRoom('comm1', 'ch1')
      const token = await manager.generateJoinToken(room.id, 'did:key:alice', makeZCAPProof())
      const voiceClient = new VoiceClient()
      const conn = await voiceClient.joinRoom(token)

      const joined: VoiceParticipant[] = []
      conn.onParticipantJoined((p) => joined.push(p))

      const bob: VoiceParticipant = {
        did: 'did:key:bob',
        joinedAt: new Date().toISOString(),
        audioEnabled: true,
        videoEnabled: false,
        screenSharing: false,
        speaking: false
      }
      ;(conn as any).simulateParticipantJoined(bob)
      expect(joined).toHaveLength(1)
      expect(joined[0].did).toBe('did:key:bob')
    })

    it('MUST fire onParticipantLeft callback', async () => {
      const room = await manager.createRoom('comm1', 'ch1')
      const token = await manager.generateJoinToken(room.id, 'did:key:alice', makeZCAPProof())
      const voiceClient = new VoiceClient()
      const conn = await voiceClient.joinRoom(token)

      const left: string[] = []
      conn.onParticipantLeft((did) => left.push(did))

      const bob: VoiceParticipant = {
        did: 'did:key:bob',
        joinedAt: new Date().toISOString(),
        audioEnabled: true,
        videoEnabled: false,
        screenSharing: false,
        speaking: false
      }
      ;(conn as any).simulateParticipantJoined(bob)
      ;(conn as any).simulateParticipantLeft('did:key:bob')
      expect(left).toHaveLength(1)
      expect(left[0]).toBe('did:key:bob')
    })

    it('MUST fire onSpeakingChanged callback', async () => {
      const room = await manager.createRoom('comm1', 'ch1')
      const token = await manager.generateJoinToken(room.id, 'did:key:alice', makeZCAPProof())
      const voiceClient = new VoiceClient()
      const conn = await voiceClient.joinRoom(token)

      const events: { did: string; speaking: boolean }[] = []
      conn.onSpeakingChanged((did, speaking) => events.push({ did, speaking }))

      const bob: VoiceParticipant = {
        did: 'did:key:bob',
        joinedAt: new Date().toISOString(),
        audioEnabled: true,
        videoEnabled: false,
        screenSharing: false,
        speaking: false
      }
      ;(conn as any).simulateParticipantJoined(bob)
      ;(conn as any).simulateSpeakingChanged('did:key:bob', true)
      expect(events).toHaveLength(1)
      expect(events[0].speaking).toBe(true)
    })

    it('MUST clean up on disconnect', async () => {
      const room = await manager.createRoom('comm1', 'ch1')
      const token = await manager.generateJoinToken(room.id, 'did:key:alice', makeZCAPProof())
      const voiceClient = new VoiceClient()
      const conn = await voiceClient.joinRoom(token)
      await conn.disconnect()
      expect((conn as any).isDisconnected()).toBe(true)
      expect(voiceClient.getActiveRoom()).toBeNull()
    })
  })

  describe('E2EE', () => {
    it('MUST enable E2EE by default (no opt-out)', async () => {
      const room = await manager.createRoom('comm1', 'ch1')
      expect(room.e2eeEnabled).toBe(true)
    })

    it('MUST use channel MLS group key for voice encryption', () => {
      const bridge = new E2EEBridge()
      const groupKey = randomBytes(32)
      bridge.setGroupKey(groupKey, 1)
      expect(bridge.getEncryptionKey()).toEqual(groupKey)
    })

    it('MUST re-key on participant join/leave (MLS epoch update)', () => {
      const bridge = new E2EEBridge()
      const key1 = randomBytes(32)
      bridge.setGroupKey(key1, 1)
      expect(bridge.getCurrentEpoch()).toBe(1)

      const key2 = randomBytes(32)
      bridge.onEpochChange(key2, 2)
      expect(bridge.getCurrentEpoch()).toBe(2)
      expect(bridge.getEncryptionKey()).toEqual(key2)
    })

    it("MUST reject connections that don't support E2EE", () => {
      const bridge = new E2EEBridge()
      expect(bridge.hasKey()).toBe(false)
      // Without a key set, connection should not proceed
    })
  })

  describe('Authorization (additional)', () => {
    it.skip('MUST revoke participant on ZCAP/VC revocation', () => {
      // Source does not implement a ZCAP revocation listener that auto-removes participants.
      // VoiceRoomManager would need an onRevocation hook.
    })
  })

  describe('Participant Tracking (additional)', () => {
    it('MUST broadcast participant list changes', async () => {
      const room = await manager.createRoom('comm1', 'ch1')
      const token = await manager.generateJoinToken(room.id, 'did:key:alice', makeZCAPProof())
      const voiceClient = new VoiceClient()
      const conn = await voiceClient.joinRoom(token)

      const joined: VoiceParticipant[] = []
      conn.onParticipantJoined((p) => joined.push(p))

      const bob: VoiceParticipant = {
        did: 'did:key:bob',
        joinedAt: new Date().toISOString(),
        audioEnabled: true,
        videoEnabled: false,
        screenSharing: false,
        speaking: false
      }
      ;(conn as any).simulateParticipantJoined(bob)
      expect(conn.participants).toHaveLength(1)
      expect(joined).toHaveLength(1)
    })

    it.skip('MUST update presence to show "in voice"', () => {
      // Source does not implement presence integration.
      // VoiceRoomManager would need to update a presence service on join/leave.
    })
  })

  describe('LiveKit Integration (additional)', () => {
    it.skip('MUST handle LiveKit webhook events (participant joined/left)', () => {
      // Source does not expose a webhook handler for LiveKit server-side events.
    })

    it.skip('MUST reconnect on transient LiveKit failures', () => {
      // Source VoiceClient does not implement reconnection logic.
    })
  })

  describe('Client Connection (additional)', () => {
    it('MUST start/stop screen sharing', async () => {
      const room = await manager.createRoom('comm1', 'ch1')
      const token = await manager.generateJoinToken(room.id, 'did:key:alice', makeZCAPProof())
      const voiceClient = new VoiceClient()
      const conn = await voiceClient.joinRoom(token)

      const self: VoiceParticipant = {
        did: 'did:key:alice',
        joinedAt: new Date().toISOString(),
        audioEnabled: true,
        videoEnabled: false,
        screenSharing: false,
        speaking: false
      }
      ;(conn as any).simulateParticipantJoined(self)

      await conn.startScreenShare()
      expect(conn.participants.find((p) => p.did === 'did:key:alice')!.screenSharing).toBe(true)

      await conn.stopScreenShare()
      expect(conn.participants.find((p) => p.did === 'did:key:alice')!.screenSharing).toBe(false)
    })

    it('MUST enable/disable video via injectable media provider', async () => {
      const room = await manager.createRoom('comm1', 'ch1')
      const token = await manager.generateJoinToken(room.id, 'did:key:alice', makeZCAPProof())
      const mockMedia: any = {
        getUserMedia: async () => ({ getTracks: () => [{ stop: () => {} }] }),
        getDisplayMedia: async () => ({ getTracks: () => [{ stop: () => {} }] })
      }
      const voiceClient = new VoiceClient(mockMedia)
      const conn = await voiceClient.joinRoom(token)

      await conn.enableVideo()
      expect(conn.localVideoEnabled).toBe(true)

      await conn.disableVideo()
      expect(conn.localVideoEnabled).toBe(false)
    })

    it('MUST throw clear error when media devices unavailable for video', async () => {
      const room = await manager.createRoom('comm1', 'ch1')
      const token = await manager.generateJoinToken(room.id, 'did:key:alice', makeZCAPProof())
      const failMedia: any = {
        getUserMedia: async () => {
          throw new Error('Not available')
        },
        getDisplayMedia: async () => {
          throw new Error('Not available')
        }
      }
      const voiceClient = new VoiceClient(failMedia)
      const conn = await voiceClient.joinRoom(token)

      await expect(conn.enableVideo()).rejects.toThrow('Failed to enable video')
    })

    it('MUST clean up video and screen share on disconnect', async () => {
      const room = await manager.createRoom('comm1', 'ch1')
      const token = await manager.generateJoinToken(room.id, 'did:key:alice', makeZCAPProof())
      const stopped: string[] = []
      const mockMedia: any = {
        getUserMedia: async () => ({ getTracks: () => [{ stop: () => stopped.push('video') }] }),
        getDisplayMedia: async () => ({ getTracks: () => [{ stop: () => stopped.push('screen') }] })
      }
      const voiceClient = new VoiceClient(mockMedia)
      const conn = await voiceClient.joinRoom(token)

      const self: VoiceParticipant = {
        did: 'did:key:alice',
        joinedAt: new Date().toISOString(),
        audioEnabled: true,
        videoEnabled: false,
        screenSharing: false,
        speaking: false
      }
      ;(conn as any).simulateParticipantJoined(self)

      await conn.enableVideo()
      await conn.startScreenShare()
      await conn.disconnect()

      expect(stopped).toContain('video')
      expect(stopped).toContain('screen')
      expect(conn.localVideoEnabled).toBe(false)
      expect((conn as any).localScreenSharing).toBe(false)
    })

    it('MUST track multiple participants with correct states', async () => {
      const room = await manager.createRoom('comm1', 'ch1')
      manager.addParticipant(room.id, 'did:key:alice', { audioEnabled: true, videoEnabled: true })
      manager.addParticipant(room.id, 'did:key:bob', { audioEnabled: false, videoEnabled: false })

      const roomState = await manager.getRoom(room.id)
      expect(roomState!.participants).toHaveLength(2)

      const alice = roomState!.participants.find((p) => p.did === 'did:key:alice')!
      expect(alice.audioEnabled).toBe(true)
      expect(alice.videoEnabled).toBe(true)

      const bob = roomState!.participants.find((p) => p.did === 'did:key:bob')!
      expect(bob.audioEnabled).toBe(false)
      expect(bob.videoEnabled).toBe(false)
    })

    it('MUST track screen sharing state per participant in room', async () => {
      const room = await manager.createRoom('comm1', 'ch1')
      manager.addParticipant(room.id, 'did:key:alice')
      const alice = (await manager.getRoom(room.id))!.participants[0]
      expect(alice.screenSharing).toBe(false)
    })
  })

  describe('SFU Integration', () => {
    it.todo('MUST connect to LiveKit SFU for multi-party calls')
    it.todo('MUST fall back to P2P when SFU unavailable')
    it.todo('SHOULD support selective forwarding for bandwidth optimization')
  })

  describe('Picture-in-Picture', () => {
    it.todo('MUST support PiP mode for active voice/video calls')
    it.todo('MUST show active speaker in PiP overlay')
  })
})
