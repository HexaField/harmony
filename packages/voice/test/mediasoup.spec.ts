import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { MediasoupAdapter } from '../src/adapters/mediasoup.js'

describe('MediasoupAdapter', () => {
  let adapter: MediasoupAdapter

  beforeAll(async () => {
    adapter = new MediasoupAdapter({
      jwtSecret: 'test-secret',
      listenIp: '127.0.0.1',
      announcedIp: '127.0.0.1'
    })
    await adapter.init(1)
  })

  afterAll(async () => {
    await adapter.close()
  })

  it('should create and delete a room', async () => {
    await adapter.createRoom('room-1', {})
    const caps = adapter.getRouterRtpCapabilities('room-1')
    expect(caps).toBeTruthy()
    expect(caps!.codecs!.length).toBeGreaterThan(0)

    await adapter.deleteRoom('room-1')
    expect(adapter.getRouterRtpCapabilities('room-1')).toBeNull()
  })

  it('should generate token with transport params', async () => {
    await adapter.createRoom('room-2', {})
    const token = await adapter.generateToken('room-2', 'alice', { did: 'did:key:alice' })
    expect(token).toBeTruthy()

    const decoded = adapter.verifyToken(token)
    expect(decoded.roomId).toBe('room-2')
    expect(decoded.participantId).toBe('alice')
    expect(decoded.transportId).toBeTruthy()
    expect(decoded.iceCandidates).toBeTruthy()
    expect(decoded.iceParameters).toBeTruthy()
    expect(decoded.dtlsParameters).toBeTruthy()
    expect(decoded.routerRtpCapabilities).toBeTruthy()

    await adapter.deleteRoom('room-2')
  })

  it('should list participants', async () => {
    await adapter.createRoom('room-3', {})
    await adapter.generateToken('room-3', 'alice', {})
    await adapter.generateToken('room-3', 'bob', {})

    const participants = await adapter.listParticipants('room-3')
    expect(participants).toContain('alice')
    expect(participants).toContain('bob')
    expect(participants).toHaveLength(2)

    await adapter.deleteRoom('room-3')
  })

  it('should remove participant', async () => {
    await adapter.createRoom('room-4', {})
    await adapter.generateToken('room-4', 'alice', {})
    await adapter.generateToken('room-4', 'bob', {})

    await adapter.removeParticipant('room-4', 'alice')
    const participants = await adapter.listParticipants('room-4')
    expect(participants).not.toContain('alice')
    expect(participants).toContain('bob')

    await adapter.deleteRoom('room-4')
  })

  it('should throw on room not found', async () => {
    await expect(adapter.generateToken('nonexistent', 'alice', {})).rejects.toThrow('Room not found')
  })

  it('should be idempotent on createRoom', async () => {
    await adapter.createRoom('room-5', {})
    await adapter.createRoom('room-5', {}) // no error
    await adapter.deleteRoom('room-5')
  })
})
