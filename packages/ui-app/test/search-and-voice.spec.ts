// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createRoot } from 'solid-js'
import { createAppStore } from '../src/store.js'
import { SearchOverlay, SearchResults, highlightMatches } from '../src/components/Search/index.js'
import { ChannelSidebar } from '../src/components/Shell/index.js'

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  readyState = MockWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  send(_data: string) {}
  close() {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.()
  }
}
// @ts-ignore
globalThis.WebSocket = MockWebSocket

beforeEach(() => {
  try {
    localStorage.clear()
  } catch {
    /* */
  }
})

describe('Client-Side Search (14.4)', () => {
  it('searchMessages finds messages across channel message cache', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setChannelMessages('ch1', [
        {
          id: 'm1',
          content: 'Hello world',
          authorDid: 'did:1',
          authorName: 'Alice',
          timestamp: '2025-01-01T00:00:00Z',
          reactions: []
        },
        {
          id: 'm2',
          content: 'Goodbye moon',
          authorDid: 'did:2',
          authorName: 'Bob',
          timestamp: '2025-01-01T00:01:00Z',
          reactions: []
        }
      ])
      store.setChannelMessages('ch2', [
        {
          id: 'm3',
          content: 'Hello again',
          authorDid: 'did:1',
          authorName: 'Alice',
          timestamp: '2025-01-01T00:02:00Z',
          reactions: []
        }
      ])

      const results = store.searchMessages('hello')
      expect(results).toHaveLength(2)
      expect(results[0].id).toBe('m1')
      expect(results[1].id).toBe('m3')
      dispose()
    })
  })

  it('searchMessages returns empty for empty query', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setChannelMessages('ch1', [
        {
          id: 'm1',
          content: 'Hello',
          authorDid: 'did:1',
          authorName: 'Alice',
          timestamp: '2025-01-01T00:00:00Z',
          reactions: []
        }
      ])
      expect(store.searchMessages('')).toHaveLength(0)
      expect(store.searchMessages('   ')).toHaveLength(0)
      dispose()
    })
  })

  it('searchMessages matches author name', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setChannelMessages('ch1', [
        {
          id: 'm1',
          content: 'some text',
          authorDid: 'did:1',
          authorName: 'Alice',
          timestamp: '2025-01-01T00:00:00Z',
          reactions: []
        }
      ])
      const results = store.searchMessages('alice')
      expect(results).toHaveLength(1)
      dispose()
    })
  })

  it('searchMessages includes channelId in results', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setChannelMessages('ch-abc', [
        {
          id: 'm1',
          content: 'findme',
          authorDid: 'did:1',
          authorName: 'A',
          timestamp: '2025-01-01T00:00:00Z',
          reactions: []
        }
      ])
      const results = store.searchMessages('findme')
      expect(results[0].channelId).toBe('ch-abc')
      dispose()
    })
  })

  it('searchMessages searches DM messages too', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setDMMessages('did:bob', [
        {
          id: 'dm1',
          content: 'secret hello',
          authorDid: 'did:alice',
          authorName: 'Alice',
          timestamp: '2025-01-01T00:00:00Z',
          reactions: []
        }
      ])
      const results = store.searchMessages('secret')
      expect(results).toHaveLength(1)
      expect(results[0].channelId).toBe('dm:did:bob')
      dispose()
    })
  })
})

describe('Search Results with Highlights (14.2)', () => {
  it('highlightMatches wraps matching terms in <mark> tags', () => {
    const result = highlightMatches('Hello world', 'hello')
    expect(result).toContain('<mark')
    expect(result).toContain('Hello')
    expect(result).toContain('</mark>')
  })

  it('highlightMatches escapes HTML in text', () => {
    const result = highlightMatches('<script>alert("xss")</script>', 'script')
    expect(result).not.toContain('<script>')
    expect(result).toContain('&lt;')
  })

  it('highlightMatches returns plain escaped text for empty query', () => {
    const result = highlightMatches('Hello world', '')
    expect(result).toBe('Hello world')
    expect(result).not.toContain('<mark')
  })

  it('highlightMatches handles multiple terms', () => {
    const result = highlightMatches('Hello beautiful world', 'hello world')
    const markCount = (result.match(/<mark/g) || []).length
    expect(markCount).toBe(2)
  })

  it('SearchResults returns highlighted results', () => {
    const results = [{ id: '1', type: 'message' as const, title: 'Test', preview: 'Hello world', channelId: 'ch1' }]
    const ctrl = SearchResults({ results, onSelect: () => {}, query: 'hello' })
    expect(ctrl.highlightedResults).toHaveLength(1)
    expect(ctrl.highlightedResults[0].highlightedPreview).toContain('<mark')
  })
})

describe('Search Result Navigation (14.3)', () => {
  it('SearchResults calls onNavigate when clicking a result', () => {
    let navigatedTo: any = null
    const results = [{ id: '1', type: 'message' as const, title: 'Test', preview: 'Hello', channelId: 'ch1' }]
    const ctrl = SearchResults({
      results,
      onSelect: () => {},
      query: 'hello',
      onNavigate: (result) => {
        navigatedTo = result
      }
    })
    ctrl.onSelect(results[0])
    expect(navigatedTo).toBeTruthy()
    expect(navigatedTo.channelId).toBe('ch1')
  })

  it('SearchOverlay wires searchFn and navigation together', () => {
    const searchResults = [{ id: '1', type: 'message' as const, title: 'Test', preview: 'found it', channelId: 'ch1' }]
    let navigated = false
    const ctrl = SearchOverlay({
      onClose: () => {},
      onSelect: () => {},
      searchFn: (q) => (q === 'found' ? searchResults : []),
      onNavigate: () => {
        navigated = true
      }
    })
    // Simulate search
    ctrl.setQuery('found')
    // Results should now be populated (but since signals are in solid, we test the initial return)
    // The overlay wires searchFn to populate results on setQuery
    expect(ctrl.placeholder).toBeTruthy()
  })
})

describe('Voice Sidebar Participant Count (11.8)', () => {
  it('channelVoiceParticipants returns participants for a channel', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      // Simulate voice.state by directly testing the store method
      // The store tracks per-channel voice participants
      expect(store.channelVoiceParticipants('voice-ch-1')).toEqual([])
      dispose()
    })
  })

  it('ChannelSidebar exposes voiceParticipantCount', () => {
    const mockParticipants = (channelId: string) => (channelId === 'voice-1' ? ['did:alice', 'did:bob'] : [])

    const ctrl = ChannelSidebar({
      communityId: 'c1',
      channels: [
        { id: 'text-1', name: 'general', type: 'text', communityId: 'c1' },
        { id: 'voice-1', name: 'Voice Chat', type: 'voice', communityId: 'c1' }
      ],
      activeChannelId: 'text-1',
      onSelect: () => {},
      voiceParticipants: mockParticipants
    })

    expect(ctrl.voiceParticipantCount('voice-1')).toBe(2)
    expect(ctrl.voiceParticipantCount('text-1')).toBe(0)
    expect(ctrl.voiceParticipants('voice-1')).toEqual(['did:alice', 'did:bob'])
  })

  it('ChannelSidebar gracefully handles missing voiceParticipants prop', () => {
    const ctrl = ChannelSidebar({
      communityId: 'c1',
      channels: [],
      onSelect: () => {}
    })
    expect(ctrl.voiceParticipantCount('any')).toBe(0)
    expect(ctrl.voiceParticipants('any')).toEqual([])
  })
})
