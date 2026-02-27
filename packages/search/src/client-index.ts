import { tokenize } from './tokenizer.js'
import { parseQuery } from './query-parser.js'
import { extractSnippet } from './snippet.js'

export interface IndexableMessage {
  id: string
  channelId: string
  communityId: string
  authorDID: string
  text: string
  timestamp: string
  threadId?: string
  hasAttachment?: boolean
}

export interface SearchQuery {
  text: string
  filters?: SearchFilters
  limit?: number
  offset?: number
}

export interface SearchFilters {
  communityId?: string
  channelId?: string
  authorDID?: string
  before?: string
  after?: string
  hasAttachment?: boolean
  inThread?: boolean
}

export interface SearchResult {
  messageId: string
  channelId: string
  communityId: string
  authorDID: string
  snippet: string
  timestamp: string
  score: number
}

interface IndexEntry {
  message: IndexableMessage
  tokens: string[]
  lowerText: string
}

export class ClientSearchIndex {
  private entries = new Map<string, IndexEntry>()
  private invertedIndex = new Map<string, Set<string>>()

  indexMessage(msg: IndexableMessage): void {
    // Remove old entry if updating
    this.removeMessage(msg.id)

    const tokens = tokenize(msg.text)
    const lowerText = msg.text.toLowerCase()
    const entry: IndexEntry = { message: msg, tokens, lowerText }
    this.entries.set(msg.id, entry)

    for (const token of tokens) {
      if (!this.invertedIndex.has(token)) {
        this.invertedIndex.set(token, new Set())
      }
      this.invertedIndex.get(token)!.add(msg.id)
    }
  }

  removeMessage(messageId: string): void {
    const entry = this.entries.get(messageId)
    if (!entry) return

    for (const token of entry.tokens) {
      const set = this.invertedIndex.get(token)
      if (set) {
        set.delete(messageId)
        if (set.size === 0) this.invertedIndex.delete(token)
      }
    }
    this.entries.delete(messageId)
  }

  search(query: SearchQuery): SearchResult[] {
    const parsed = parseQuery(query.text)
    const limit = query.limit ?? 50
    const offset = query.offset ?? 0

    // Find candidate message IDs from inverted index
    let candidates: Set<string>

    if (parsed.terms.length === 0 && parsed.phrases.length === 0) {
      // No search terms — return all (filtered)
      candidates = new Set(this.entries.keys())
    } else {
      candidates = new Set<string>()
      // Add candidates from term matches
      for (const term of parsed.terms) {
        const stemmed = tokenize(term)
        for (const s of stemmed) {
          const ids = this.invertedIndex.get(s)
          if (ids) {
            for (const id of ids) candidates.add(id)
          }
        }
      }
      // Also search all entries for phrase matches
      if (parsed.phrases.length > 0) {
        for (const [id, entry] of this.entries) {
          for (const phrase of parsed.phrases) {
            if (entry.lowerText.includes(phrase)) {
              candidates.add(id)
            }
          }
        }
      }
    }

    // Score and filter
    const results: SearchResult[] = []
    for (const id of candidates) {
      const entry = this.entries.get(id)
      if (!entry) continue

      if (!this.matchesFilters(entry.message, query.filters)) continue

      // Check phrase matches
      if (parsed.phrases.length > 0) {
        const hasAllPhrases = parsed.phrases.every((p) => entry.lowerText.includes(p))
        if (!hasAllPhrases) continue
      }

      const score = this.computeScore(entry, parsed)
      results.push({
        messageId: id,
        channelId: entry.message.channelId,
        communityId: entry.message.communityId,
        authorDID: entry.message.authorDID,
        snippet: extractSnippet(entry.message.text, query.text),
        timestamp: entry.message.timestamp,
        score
      })
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score)

    return results.slice(offset, offset + limit)
  }

  clear(): void {
    this.entries.clear()
    this.invertedIndex.clear()
  }

  getIndexSize(): number {
    return this.entries.size
  }

  /** Serialize index to a JSON-compatible object for persistence */
  serialize(): { messages: IndexableMessage[] } {
    const messages: IndexableMessage[] = []
    for (const entry of this.entries.values()) {
      messages.push(entry.message)
    }
    return { messages }
  }

  /** Restore index from serialized data */
  static deserialize(data: { messages: IndexableMessage[] }): ClientSearchIndex {
    const index = new ClientSearchIndex()
    for (const msg of data.messages) {
      index.indexMessage(msg)
    }
    return index
  }

  private matchesFilters(msg: IndexableMessage, filters?: SearchFilters): boolean {
    if (!filters) return true

    if (filters.communityId && msg.communityId !== filters.communityId) return false
    if (filters.channelId && msg.channelId !== filters.channelId) return false
    if (filters.authorDID && msg.authorDID !== filters.authorDID) return false

    if (filters.before) {
      if (msg.timestamp >= filters.before) return false
    }
    if (filters.after) {
      if (msg.timestamp <= filters.after) return false
    }

    if (filters.hasAttachment !== undefined) {
      if ((msg.hasAttachment ?? false) !== filters.hasAttachment) return false
    }

    if (filters.inThread !== undefined) {
      const isInThread = !!msg.threadId
      if (isInThread !== filters.inThread) return false
    }

    return true
  }

  private computeScore(entry: IndexEntry, parsed: { terms: string[]; phrases: string[] }): number {
    let score = 0
    const tokens = entry.tokens

    // Term frequency scoring
    for (const term of parsed.terms) {
      const stemmed = tokenize(term)
      for (const s of stemmed) {
        const count = tokens.filter((t) => t === s).length
        score += count * 10
      }
    }

    // Phrase match bonus
    for (const phrase of parsed.phrases) {
      if (entry.lowerText.includes(phrase)) {
        score += 50
      }
    }

    // Recency bonus (newer messages score slightly higher)
    try {
      const age = Date.now() - new Date(entry.message.timestamp).getTime()
      const ageHours = age / (1000 * 60 * 60)
      score += Math.max(0, 10 - ageHours * 0.01)
    } catch {
      // ignore invalid timestamps
    }

    return score
  }
}
