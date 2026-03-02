import { describe, it, expect } from 'vitest'
import { computeMessageHash, buildHashIndex, verifyUserHashes } from '../src/hash.js'

describe('Hash Infrastructure', () => {
  const baseParams = {
    serverId: 'server1',
    channelId: 'ch1',
    messageId: 'msg1',
    authorId: 'user1',
    timestamp: '2023-01-15T10:00:00Z'
  }

  describe('computeMessageHash', () => {
    it('MUST produce consistent hex hash', async () => {
      const hash1 = await computeMessageHash(baseParams)
      const hash2 = await computeMessageHash(baseParams)
      expect(hash1).toBe(hash2)
      expect(hash1).toMatch(/^[a-f0-9]{64}$/)
    })

    it('MUST produce different hashes for different inputs', async () => {
      const hash1 = await computeMessageHash(baseParams)
      const hash2 = await computeMessageHash({ ...baseParams, messageId: 'msg2' })
      expect(hash1).not.toBe(hash2)
    })

    it('MUST include all fields in hash computation', async () => {
      const fields = ['serverId', 'channelId', 'messageId', 'authorId', 'timestamp'] as const
      const hashes = new Set<string>()
      for (const field of fields) {
        const modified = { ...baseParams, [field]: 'different' }
        hashes.add(await computeMessageHash(modified))
      }
      // All 5 modifications should produce unique hashes
      expect(hashes.size).toBe(5)
    })
  })

  describe('buildHashIndex', () => {
    it('MUST build index from message map', async () => {
      const messages = new Map([
        [
          'ch1',
          [
            { id: 'msg1', channelId: 'ch1', author: { id: 'user1' }, timestamp: '2023-01-15T10:00:00Z' },
            { id: 'msg2', channelId: 'ch1', author: { id: 'user2' }, timestamp: '2023-01-15T10:01:00Z' }
          ]
        ],
        ['ch2', [{ id: 'msg3', channelId: 'ch2', author: { id: 'user1' }, timestamp: '2023-01-15T11:00:00Z' }]]
      ])

      const index = await buildHashIndex('server1', messages)
      expect(index.size).toBe(3)

      // Each entry maps back to correct channel/message
      for (const [_hash, meta] of index) {
        expect(meta.channelId).toBeTruthy()
        expect(meta.messageId).toBeTruthy()
      }
    })

    it('MUST handle empty message map', async () => {
      const index = await buildHashIndex('server1', new Map())
      expect(index.size).toBe(0)
    })
  })

  describe('verifyUserHashes', () => {
    it('MUST verify matching hashes', () => {
      const stored = new Set(['aaa', 'bbb', 'ccc'])
      const result = verifyUserHashes(['aaa', 'bbb'], stored)
      expect(result.verified).toEqual(['aaa', 'bbb'])
      expect(result.rejected).toEqual([])
    })

    it('MUST reject non-matching hashes', () => {
      const stored = new Set(['aaa', 'bbb'])
      const result = verifyUserHashes(['aaa', 'ddd'], stored)
      expect(result.verified).toEqual(['aaa'])
      expect(result.rejected).toEqual(['ddd'])
    })

    it('MUST handle partial matches', () => {
      const stored = new Set(['aaa', 'bbb', 'ccc'])
      const result = verifyUserHashes(['aaa', 'ddd', 'ccc', 'eee'], stored)
      expect(result.verified).toEqual(['aaa', 'ccc'])
      expect(result.rejected).toEqual(['ddd', 'eee'])
    })

    it('MUST handle empty user hashes', () => {
      const stored = new Set(['aaa'])
      const result = verifyUserHashes([], stored)
      expect(result.verified).toEqual([])
      expect(result.rejected).toEqual([])
    })

    it('MUST handle empty stored index', () => {
      const result = verifyUserHashes(['aaa'], new Set())
      expect(result.verified).toEqual([])
      expect(result.rejected).toEqual(['aaa'])
    })
  })

  describe('End-to-end hash verification', () => {
    it('MUST verify hashes built from same messages', async () => {
      const messages = new Map([
        [
          'ch1',
          [
            { id: 'msg1', channelId: 'ch1', author: { id: 'user1' }, timestamp: '2023-01-15T10:00:00Z' },
            { id: 'msg2', channelId: 'ch1', author: { id: 'user2' }, timestamp: '2023-01-15T10:01:00Z' }
          ]
        ]
      ])

      // Bot builds index
      const botIndex = await buildHashIndex('server1', messages)
      const storedSet = new Set(botIndex.keys())

      // User recomputes hashes for their messages
      const userHash1 = await computeMessageHash({
        serverId: 'server1',
        channelId: 'ch1',
        messageId: 'msg1',
        authorId: 'user1',
        timestamp: '2023-01-15T10:00:00Z'
      })
      const userHash2 = await computeMessageHash({
        serverId: 'server1',
        channelId: 'ch1',
        messageId: 'msg2',
        authorId: 'user2',
        timestamp: '2023-01-15T10:01:00Z'
      })

      const result = verifyUserHashes([userHash1, userHash2], storedSet)
      expect(result.verified).toHaveLength(2)
      expect(result.rejected).toHaveLength(0)
    })

    it('MUST reject hashes from different server', async () => {
      const messages = new Map([
        ['ch1', [{ id: 'msg1', channelId: 'ch1', author: { id: 'user1' }, timestamp: '2023-01-15T10:00:00Z' }]]
      ])

      const botIndex = await buildHashIndex('server1', messages)
      const storedSet = new Set(botIndex.keys())

      // User tries to claim with wrong serverId
      const fakeHash = await computeMessageHash({
        serverId: 'server2',
        channelId: 'ch1',
        messageId: 'msg1',
        authorId: 'user1',
        timestamp: '2023-01-15T10:00:00Z'
      })

      const result = verifyUserHashes([fakeHash], storedSet)
      expect(result.verified).toHaveLength(0)
      expect(result.rejected).toHaveLength(1)
    })
  })
})
