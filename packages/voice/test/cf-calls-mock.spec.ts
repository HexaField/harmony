import { describe, it, expect, beforeEach } from 'vitest'
import { MockCloudflareCallsAdapter } from '../../cloud-worker/src/cf-calls-adapter.js'

describe('MockCloudflareCallsAdapter', () => {
  let adapter: MockCloudflareCallsAdapter

  beforeEach(() => {
    adapter = new MockCloudflareCallsAdapter()
  })

  it('should create and delete rooms', async () => {
    await adapter.createRoom('room-1', {})
    const participants = await adapter.listParticipants('room-1')
    expect(participants).toEqual([])

    await adapter.deleteRoom('room-1')
    expect(await adapter.listParticipants('room-1')).toEqual([])
  })

  it('should generate token with WHIP/WHEP endpoints', async () => {
    await adapter.createRoom('room-1', {})
    const token = await adapter.generateToken('room-1', 'alice', { did: 'did:key:alice' })
    const parsed = JSON.parse(token)

    expect(parsed.sessionId).toBe('mock-session-alice')
    expect(parsed.roomId).toBe('room-1')
    expect(parsed.participantId).toBe('alice')
    expect(parsed.whipEndpoint).toContain('/publish')
    expect(parsed.whepEndpoint).toContain('/subscribe')
  })

  it('should track participants', async () => {
    await adapter.createRoom('room-1', {})
    await adapter.generateToken('room-1', 'alice', {})
    await adapter.generateToken('room-1', 'bob', {})

    const participants = await adapter.listParticipants('room-1')
    expect(participants).toContain('alice')
    expect(participants).toContain('bob')
  })

  it('should remove participants', async () => {
    await adapter.createRoom('room-1', {})
    await adapter.generateToken('room-1', 'alice', {})
    await adapter.removeParticipant('room-1', 'alice')

    expect(await adapter.listParticipants('room-1')).not.toContain('alice')
  })

  it('should log all calls', async () => {
    await adapter.createRoom('room-1', {})
    await adapter.generateToken('room-1', 'alice', {})
    await adapter.muteParticipant('room-1', 'alice', 'audio')

    expect(adapter.callLog).toHaveLength(3)
    expect(adapter.callLog[0].method).toBe('createRoom')
    expect(adapter.callLog[1].method).toBe('generateToken')
    expect(adapter.callLog[2].method).toBe('muteParticipant')
  })

  it('should throw on token for nonexistent room', async () => {
    await expect(adapter.generateToken('nonexistent', 'alice', {})).rejects.toThrow('Room not found')
  })
})
