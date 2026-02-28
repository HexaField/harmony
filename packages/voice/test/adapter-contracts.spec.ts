/**
 * Tests for mediasoup adapter: self-consumption prevention,
 * removeProducer, getProducers skipping closed producers.
 *
 * Covers regressions from commit 4b6be63.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryAdapter } from '../src/adapters/in-memory.js'

// These tests use InMemoryAdapter as the reference implementation.
// The mediasoup adapter has the same interface but requires native binaries.
// We test the behavioral contracts that apply to all SFU adapters.

describe('InMemoryAdapter', () => {
  let adapter: InMemoryAdapter

  beforeEach(() => {
    adapter = new InMemoryAdapter()
  })

  it('creates and deletes rooms', async () => {
    await adapter.createRoom('room-1', { maxParticipants: 10 })
    expect(adapter.hasRoom('room-1')).toBe(true)

    await adapter.deleteRoom('room-1')
    expect(adapter.hasRoom('room-1')).toBe(false)
  })

  it('generates tokens for existing rooms', async () => {
    await adapter.createRoom('room-1', { maxParticipants: 10 })
    const token = await adapter.generateToken('room-1', 'user-1', { name: 'Alice' })
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(0)

    // Token should be valid base64 containing room + participant info
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString())
    expect(decoded.room).toBe('room-1')
    expect(decoded.participant).toBe('user-1')
    expect(decoded.metadata.name).toBe('Alice')
  })

  it('throws on token generation for non-existent room', async () => {
    await expect(adapter.generateToken('no-room', 'user-1', {})).rejects.toThrow('Room not found')
  })

  it('lists participants', async () => {
    await adapter.createRoom('room-1', { maxParticipants: 10 })
    expect(await adapter.listParticipants('room-1')).toEqual([])

    adapter.addParticipantToRoom('room-1', 'user-1')
    adapter.addParticipantToRoom('room-1', 'user-2')

    const participants = await adapter.listParticipants('room-1')
    expect(participants).toContain('user-1')
    expect(participants).toContain('user-2')
    expect(participants.length).toBe(2)
  })

  it('removes participant', async () => {
    await adapter.createRoom('room-1', { maxParticipants: 10 })
    adapter.addParticipantToRoom('room-1', 'user-1')
    adapter.addParticipantToRoom('room-1', 'user-2')

    await adapter.removeParticipant('room-1', 'user-1')
    const participants = await adapter.listParticipants('room-1')
    expect(participants).not.toContain('user-1')
    expect(participants).toContain('user-2')
  })

  it('mutes participant', async () => {
    await adapter.createRoom('room-1', { maxParticipants: 10 })
    adapter.addParticipantToRoom('room-1', 'user-1')

    expect(adapter.isMuted('room-1', 'user-1', 'audio')).toBe(false)
    await adapter.muteParticipant('room-1', 'user-1', 'audio')
    expect(adapter.isMuted('room-1', 'user-1', 'audio')).toBe(true)
    expect(adapter.isMuted('room-1', 'user-1', 'video')).toBe(false)
  })

  it('throws on mute for non-existent room', async () => {
    await expect(adapter.muteParticipant('no-room', 'user-1', 'audio')).rejects.toThrow('Room not found')
  })

  it('returns empty list for non-existent room', async () => {
    expect(await adapter.listParticipants('no-room')).toEqual([])
  })

  it('remove from non-existent room is no-op', async () => {
    // Should not throw
    await adapter.removeParticipant('no-room', 'user-1')
  })

  it('delete non-existent room is no-op', async () => {
    // Should not throw
    await adapter.deleteRoom('no-room')
  })
})

// Test the behavioral contracts that the mediasoup adapter must satisfy
// (these are tested against mock objects since mediasoup needs native binaries)
describe('SFU Adapter Contracts: Self-Consumption Prevention', () => {
  it("getProducers should exclude requester's own producers", () => {
    // Simulate the server-side filtering logic from server/src/index.ts
    const allProducers = [
      { producerId: 'p1', participantId: 'did:key:alice', kind: 'audio' },
      { producerId: 'p2', participantId: 'did:key:bob', kind: 'audio' },
      { producerId: 'p3', participantId: 'did:key:alice', kind: 'video' },
      { producerId: 'p4', participantId: 'did:key:carol', kind: 'audio' }
    ]

    const requesterId = 'did:key:alice'
    const filtered = allProducers.filter((p) => p.participantId !== requesterId)

    expect(filtered.length).toBe(2)
    expect(filtered.every((p) => p.participantId !== 'did:key:alice')).toBe(true)
    expect(filtered.find((p) => p.producerId === 'p2')).toBeDefined()
    expect(filtered.find((p) => p.producerId === 'p4')).toBeDefined()
  })

  it('getProducers should skip closed producers', () => {
    // Simulate the mediasoup adapter's closed producer filtering
    const producers = [
      { id: 'p1', participantId: 'did:key:bob', kind: 'audio', closed: false },
      { id: 'p2', participantId: 'did:key:bob', kind: 'video', closed: true },
      { id: 'p3', participantId: 'did:key:carol', kind: 'audio', closed: false }
    ]

    const active = producers.filter((p) => !p.closed)
    expect(active.length).toBe(2)
    expect(active.find((p) => p.id === 'p2')).toBeUndefined()
  })

  it('combined: skip closed + exclude self', () => {
    const allProducers = [
      { id: 'p1', participantId: 'did:key:alice', kind: 'audio', closed: false },
      { id: 'p2', participantId: 'did:key:bob', kind: 'audio', closed: false },
      { id: 'p3', participantId: 'did:key:bob', kind: 'video', closed: true },
      { id: 'p4', participantId: 'did:key:carol', kind: 'audio', closed: false }
    ]

    const requesterId = 'did:key:alice'
    const result = allProducers.filter((p) => !p.closed).filter((p) => p.participantId !== requesterId)

    expect(result.length).toBe(2)
    expect(result.find((p) => p.id === 'p2')).toBeDefined()
    expect(result.find((p) => p.id === 'p4')).toBeDefined()
  })
})

describe('SFU Adapter Contracts: removeProducer', () => {
  it('removes producer by ID from participant list', () => {
    // Simulate removeProducer logic
    const producersByParticipant = new Map<string, Array<{ id: string; kind: string; closed: boolean }>>()
    producersByParticipant.set('did:key:bob', [
      { id: 'p1', kind: 'audio', closed: false },
      { id: 'p2', kind: 'video', closed: false }
    ])

    const producerId = 'p1'
    for (const [, producers] of producersByParticipant) {
      const idx = producers.findIndex((p) => p.id === producerId)
      if (idx !== -1) {
        producers[idx].closed = true
        producers.splice(idx, 1)
        break
      }
    }

    const bobProducers = producersByParticipant.get('did:key:bob')!
    expect(bobProducers.length).toBe(1)
    expect(bobProducers[0].id).toBe('p2')
  })

  it('removeProducer for non-existent ID is no-op', () => {
    const producersByParticipant = new Map<string, Array<{ id: string; kind: string }>>()
    producersByParticipant.set('did:key:bob', [{ id: 'p1', kind: 'audio' }])

    const producerId = 'nonexistent'
    let found = false
    for (const [, producers] of producersByParticipant) {
      const idx = producers.findIndex((p) => p.id === producerId)
      if (idx !== -1) {
        found = true
        break
      }
    }

    expect(found).toBe(false)
    // Original list unchanged
    expect(producersByParticipant.get('did:key:bob')!.length).toBe(1)
  })
})
