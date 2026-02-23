import { describe, it, expect, beforeEach } from 'vitest'
import { ClientSearchIndex } from '../src/client-index.js'
import { MetadataSearchIndex } from '../src/metadata-index.js'
import { tokenize } from '../src/tokenizer.js'
import { parseQuery } from '../src/query-parser.js'
import { extractSnippet } from '../src/snippet.js'
import type { IndexableMessage } from '../src/client-index.js'

function makeMsg(overrides: Partial<IndexableMessage> & { id: string; text: string }): IndexableMessage {
  return {
    channelId: 'ch1',
    communityId: 'comm1',
    authorDID: 'did:key:alice',
    timestamp: new Date().toISOString(),
    ...overrides
  }
}

describe('@harmony/search', () => {
  describe('Client-side Full-text Index', () => {
    let index: ClientSearchIndex

    beforeEach(() => {
      index = new ClientSearchIndex()
    })

    it('MUST index message text', () => {
      index.indexMessage(makeMsg({ id: '1', text: 'Hello world' }))
      expect(index.getIndexSize()).toBe(1)
    })

    it('MUST search by keyword (case-insensitive)', () => {
      index.indexMessage(makeMsg({ id: '1', text: 'Hello World' }))
      const results = index.search({ text: 'hello' })
      expect(results.length).toBe(1)
      expect(results[0].messageId).toBe('1')
    })

    it('MUST search by phrase (quoted)', () => {
      index.indexMessage(makeMsg({ id: '1', text: 'The quick brown fox jumps' }))
      index.indexMessage(makeMsg({ id: '2', text: 'brown dog' }))
      const results = index.search({ text: '"quick brown"' })
      expect(results.length).toBe(1)
      expect(results[0].messageId).toBe('1')
    })

    it('MUST return results sorted by relevance score', () => {
      index.indexMessage(makeMsg({ id: '1', text: 'project' }))
      index.indexMessage(makeMsg({ id: '2', text: 'project project project update' }))
      const results = index.search({ text: 'project' })
      expect(results.length).toBe(2)
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score)
    })

    it('MUST filter by communityId', () => {
      index.indexMessage(makeMsg({ id: '1', text: 'hello', communityId: 'comm1' }))
      index.indexMessage(makeMsg({ id: '2', text: 'hello', communityId: 'comm2' }))
      const results = index.search({ text: 'hello', filters: { communityId: 'comm1' } })
      expect(results.length).toBe(1)
      expect(results[0].communityId).toBe('comm1')
    })

    it('MUST filter by channelId', () => {
      index.indexMessage(makeMsg({ id: '1', text: 'hello', channelId: 'ch1' }))
      index.indexMessage(makeMsg({ id: '2', text: 'hello', channelId: 'ch2' }))
      const results = index.search({ text: 'hello', filters: { channelId: 'ch1' } })
      expect(results.length).toBe(1)
    })

    it('MUST filter by authorDID', () => {
      index.indexMessage(makeMsg({ id: '1', text: 'hello', authorDID: 'did:key:alice' }))
      index.indexMessage(makeMsg({ id: '2', text: 'hello', authorDID: 'did:key:bob' }))
      const results = index.search({ text: 'hello', filters: { authorDID: 'did:key:alice' } })
      expect(results.length).toBe(1)
    })

    it('MUST filter by date range (before/after)', () => {
      index.indexMessage(makeMsg({ id: '1', text: 'hello', timestamp: '2026-01-01T00:00:00Z' }))
      index.indexMessage(makeMsg({ id: '2', text: 'hello', timestamp: '2026-02-01T00:00:00Z' }))
      index.indexMessage(makeMsg({ id: '3', text: 'hello', timestamp: '2026-03-01T00:00:00Z' }))
      const results = index.search({
        text: 'hello',
        filters: { after: '2026-01-15T00:00:00Z', before: '2026-02-15T00:00:00Z' }
      })
      expect(results.length).toBe(1)
      expect(results[0].messageId).toBe('2')
    })

    it('MUST filter by hasAttachment', () => {
      index.indexMessage(makeMsg({ id: '1', text: 'hello', hasAttachment: true }))
      index.indexMessage(makeMsg({ id: '2', text: 'hello', hasAttachment: false }))
      const results = index.search({ text: 'hello', filters: { hasAttachment: true } })
      expect(results.length).toBe(1)
      expect(results[0].messageId).toBe('1')
    })

    it('MUST filter by inThread', () => {
      index.indexMessage(makeMsg({ id: '1', text: 'hello', threadId: 'thread1' }))
      index.indexMessage(makeMsg({ id: '2', text: 'hello' }))
      const results = index.search({ text: 'hello', filters: { inThread: true } })
      expect(results.length).toBe(1)
      expect(results[0].messageId).toBe('1')
    })

    it('MUST combine multiple filters (AND logic)', () => {
      index.indexMessage(makeMsg({ id: '1', text: 'hello', authorDID: 'did:key:alice', channelId: 'ch1' }))
      index.indexMessage(makeMsg({ id: '2', text: 'hello', authorDID: 'did:key:alice', channelId: 'ch2' }))
      index.indexMessage(makeMsg({ id: '3', text: 'hello', authorDID: 'did:key:bob', channelId: 'ch1' }))
      const results = index.search({
        text: 'hello',
        filters: { authorDID: 'did:key:alice', channelId: 'ch1' }
      })
      expect(results.length).toBe(1)
      expect(results[0].messageId).toBe('1')
    })

    it('MUST paginate results with limit/offset', () => {
      for (let i = 0; i < 10; i++) {
        index.indexMessage(makeMsg({ id: `${i}`, text: 'project update' }))
      }
      const page1 = index.search({ text: 'project', limit: 3, offset: 0 })
      const page2 = index.search({ text: 'project', limit: 3, offset: 3 })
      expect(page1.length).toBe(3)
      expect(page2.length).toBe(3)
      expect(page1[0].messageId).not.toBe(page2[0].messageId)
    })

    it('MUST generate highlighted snippet around match', () => {
      index.indexMessage(
        makeMsg({ id: '1', text: 'The project update was really important and contained many details' })
      )
      const results = index.search({ text: 'project' })
      expect(results[0].snippet).toContain('**')
    })

    it('MUST handle special characters in query', () => {
      index.indexMessage(makeMsg({ id: '1', text: 'hello@world.com is an email' }))
      const results = index.search({ text: 'hello@world' })
      expect(results.length).toBeGreaterThanOrEqual(0) // Should not throw
    })

    it('MUST remove message from index on delete', () => {
      index.indexMessage(makeMsg({ id: '1', text: 'hello world' }))
      index.removeMessage('1')
      const results = index.search({ text: 'hello' })
      expect(results.length).toBe(0)
      expect(index.getIndexSize()).toBe(0)
    })

    it('MUST update index on message edit', () => {
      index.indexMessage(makeMsg({ id: '1', text: 'original text' }))
      index.indexMessage(makeMsg({ id: '1', text: 'updated content' }))
      const origResults = index.search({ text: 'original' })
      expect(origResults.length).toBe(0)
      const updatedResults = index.search({ text: 'updated' })
      expect(updatedResults.length).toBe(1)
      expect(index.getIndexSize()).toBe(1)
    })

    it('MUST clear entire index', () => {
      index.indexMessage(makeMsg({ id: '1', text: 'hello' }))
      index.indexMessage(makeMsg({ id: '2', text: 'world' }))
      index.clear()
      expect(index.getIndexSize()).toBe(0)
    })

    it('MUST report index size', () => {
      expect(index.getIndexSize()).toBe(0)
      index.indexMessage(makeMsg({ id: '1', text: 'a' }))
      index.indexMessage(makeMsg({ id: '2', text: 'b' }))
      expect(index.getIndexSize()).toBe(2)
    })
  })

  describe('Server-side Metadata Index', () => {
    let metaIndex: MetadataSearchIndex

    beforeEach(() => {
      metaIndex = new MetadataSearchIndex()
    })

    it('MUST index message metadata (no content)', () => {
      metaIndex.indexMessageMeta({
        id: '1',
        channelId: 'ch1',
        communityId: 'comm1',
        authorDID: 'did:key:alice',
        timestamp: '2026-02-01T00:00:00Z',
        hasAttachment: false,
        clock: 1
      })
      const results = metaIndex.searchMetadata({ communityId: 'comm1', filters: {} })
      expect(results.length).toBe(1)
    })

    it('MUST search by author DID', () => {
      metaIndex.indexMessageMeta({
        id: '1',
        channelId: 'ch1',
        communityId: 'comm1',
        authorDID: 'did:key:alice',
        timestamp: '2026-02-01T00:00:00Z',
        hasAttachment: false,
        clock: 1
      })
      metaIndex.indexMessageMeta({
        id: '2',
        channelId: 'ch1',
        communityId: 'comm1',
        authorDID: 'did:key:bob',
        timestamp: '2026-02-01T00:00:00Z',
        hasAttachment: false,
        clock: 2
      })
      const results = metaIndex.searchMetadata({ communityId: 'comm1', filters: { authorDID: 'did:key:alice' } })
      expect(results.length).toBe(1)
    })

    it('MUST search by channel', () => {
      metaIndex.indexMessageMeta({
        id: '1',
        channelId: 'ch1',
        communityId: 'comm1',
        authorDID: 'did:key:alice',
        timestamp: '2026-02-01T00:00:00Z',
        hasAttachment: false,
        clock: 1
      })
      metaIndex.indexMessageMeta({
        id: '2',
        channelId: 'ch2',
        communityId: 'comm1',
        authorDID: 'did:key:alice',
        timestamp: '2026-02-01T00:00:00Z',
        hasAttachment: false,
        clock: 2
      })
      const results = metaIndex.searchMetadata({ communityId: 'comm1', filters: { channelId: 'ch1' } })
      expect(results.length).toBe(1)
    })

    it('MUST search by date range', () => {
      metaIndex.indexMessageMeta({
        id: '1',
        channelId: 'ch1',
        communityId: 'comm1',
        authorDID: 'did:key:alice',
        timestamp: '2026-01-01T00:00:00Z',
        hasAttachment: false,
        clock: 1
      })
      metaIndex.indexMessageMeta({
        id: '2',
        channelId: 'ch1',
        communityId: 'comm1',
        authorDID: 'did:key:alice',
        timestamp: '2026-03-01T00:00:00Z',
        hasAttachment: false,
        clock: 2
      })
      const results = metaIndex.searchMetadata({
        communityId: 'comm1',
        filters: { after: '2026-02-01T00:00:00Z' }
      })
      expect(results.length).toBe(1)
      expect(results[0].messageId).toBe('2')
    })

    it('MUST search by hasAttachment', () => {
      metaIndex.indexMessageMeta({
        id: '1',
        channelId: 'ch1',
        communityId: 'comm1',
        authorDID: 'did:key:alice',
        timestamp: '2026-02-01T00:00:00Z',
        hasAttachment: true,
        clock: 1
      })
      metaIndex.indexMessageMeta({
        id: '2',
        channelId: 'ch1',
        communityId: 'comm1',
        authorDID: 'did:key:alice',
        timestamp: '2026-02-01T00:00:00Z',
        hasAttachment: false,
        clock: 2
      })
      const results = metaIndex.searchMetadata({ communityId: 'comm1', filters: { hasAttachment: true } })
      expect(results.length).toBe(1)
    })

    it('MUST sort by newest/oldest', () => {
      metaIndex.indexMessageMeta({
        id: '1',
        channelId: 'ch1',
        communityId: 'comm1',
        authorDID: 'did:key:alice',
        timestamp: '2026-01-01T00:00:00Z',
        hasAttachment: false,
        clock: 1
      })
      metaIndex.indexMessageMeta({
        id: '2',
        channelId: 'ch1',
        communityId: 'comm1',
        authorDID: 'did:key:alice',
        timestamp: '2026-03-01T00:00:00Z',
        hasAttachment: false,
        clock: 2
      })
      const newest = metaIndex.searchMetadata({ communityId: 'comm1', filters: {}, sort: 'newest' })
      expect(newest[0].messageId).toBe('2')
      const oldest = metaIndex.searchMetadata({ communityId: 'comm1', filters: {}, sort: 'oldest' })
      expect(oldest[0].messageId).toBe('1')
    })

    it('MUST paginate results', () => {
      for (let i = 0; i < 10; i++) {
        metaIndex.indexMessageMeta({
          id: `${i}`,
          channelId: 'ch1',
          communityId: 'comm1',
          authorDID: 'did:key:alice',
          timestamp: `2026-02-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
          hasAttachment: false,
          clock: i
        })
      }
      const page1 = metaIndex.searchMetadata({ communityId: 'comm1', filters: {}, limit: 3 })
      const page2 = metaIndex.searchMetadata({ communityId: 'comm1', filters: {}, limit: 3, offset: 3 })
      expect(page1.length).toBe(3)
      expect(page2.length).toBe(3)
    })

    it('MUST remove metadata on message delete', () => {
      metaIndex.indexMessageMeta({
        id: '1',
        channelId: 'ch1',
        communityId: 'comm1',
        authorDID: 'did:key:alice',
        timestamp: '2026-02-01T00:00:00Z',
        hasAttachment: false,
        clock: 1
      })
      metaIndex.removeMessageMeta('1')
      const results = metaIndex.searchMetadata({ communityId: 'comm1', filters: {} })
      expect(results.length).toBe(0)
    })

    it('MUST NOT store or index message content', () => {
      // The MetadataSearchIndex interface doesn't accept message text — verified by type
      metaIndex.indexMessageMeta({
        id: '1',
        channelId: 'ch1',
        communityId: 'comm1',
        authorDID: 'did:key:alice',
        timestamp: '2026-02-01T00:00:00Z',
        hasAttachment: false,
        clock: 1
      })
      const results = metaIndex.searchMetadata({ communityId: 'comm1', filters: {} })
      // Result has no 'text' or 'content' field
      expect('text' in results[0]).toBe(false)
      expect('content' in results[0]).toBe(false)
    })
  })

  describe('Tokenizer', () => {
    it('MUST tokenize text into words', () => {
      const tokens = tokenize('Hello World')
      expect(tokens.length).toBeGreaterThan(0)
    })

    it('MUST lowercase tokens', () => {
      const tokens = tokenize('HELLO')
      expect(tokens.every((t) => t === t.toLowerCase())).toBe(true)
    })

    it('MUST remove stop words', () => {
      const tokens = tokenize('the quick brown fox')
      expect(tokens).not.toContain('the')
    })
  })

  describe('Query Parser', () => {
    it('MUST parse simple terms', () => {
      const parsed = parseQuery('hello world')
      expect(parsed.terms).toContain('hello')
      expect(parsed.terms).toContain('world')
    })

    it('MUST parse quoted phrases', () => {
      const parsed = parseQuery('"hello world" test')
      expect(parsed.phrases).toContain('hello world')
      expect(parsed.terms).toContain('test')
    })
  })

  describe('Snippet Extraction', () => {
    it('MUST extract snippet with highlight', () => {
      const snippet = extractSnippet('The quick brown fox jumps over the lazy dog', 'fox')
      expect(snippet).toContain('**fox**')
    })

    it('MUST handle text without match', () => {
      const snippet = extractSnippet('Hello world', 'zzzzz')
      expect(snippet).toBeTruthy()
    })
  })
})
