import type { QuadStore } from '@harmony/quads'

export interface MessageMetadata {
  id: string
  channelId: string
  communityId: string
  authorDID: string
  timestamp: string
  hasAttachment: boolean
  replyTo?: string
  threadId?: string
  clock: number
}

export interface MetadataQuery {
  communityId: string
  filters: MetadataFilters
  limit?: number
  offset?: number
  sort?: 'newest' | 'oldest' | 'relevance'
}

export interface MetadataFilters {
  channelId?: string
  authorDID?: string
  before?: string
  after?: string
  hasAttachment?: boolean
  inThread?: boolean
}

export interface MetadataResult {
  messageId: string
  channelId: string
  authorDID: string
  timestamp: string
  hasAttachment: boolean
}

export class MetadataSearchIndex {
  private entries = new Map<string, MessageMetadata>()
  private _store: QuadStore | null

  constructor(store?: QuadStore) {
    this._store = store ?? null
  }

  indexMessageMeta(meta: MessageMetadata): void {
    this.entries.set(meta.id, meta)
  }

  removeMessageMeta(messageId: string): void {
    this.entries.delete(messageId)
  }

  searchMetadata(query: MetadataQuery): MetadataResult[] {
    const limit = query.limit ?? 50
    const offset = query.offset ?? 0
    const results: MetadataResult[] = []

    for (const [, meta] of this.entries) {
      if (meta.communityId !== query.communityId) continue
      if (!this.matchesFilters(meta, query.filters)) continue

      results.push({
        messageId: meta.id,
        channelId: meta.channelId,
        authorDID: meta.authorDID,
        timestamp: meta.timestamp,
        hasAttachment: meta.hasAttachment
      })
    }

    // Sort
    if (query.sort === 'oldest') {
      results.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    } else {
      // Default newest
      results.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    }

    return results.slice(offset, offset + limit)
  }

  async rebuildIndex(communityId: string): Promise<void> {
    if (!this._store) return

    // Clear entries for this community
    for (const [id, meta] of this.entries) {
      if (meta.communityId === communityId) {
        this.entries.delete(id)
      }
    }

    // Rebuild from quad store
    const quads = await this._store.match({ graph: `community:${communityId}` })
    const messageData = new Map<string, Partial<MessageMetadata>>()

    for (const quad of quads) {
      const msgId = quad.subject
      if (!messageData.has(msgId)) {
        messageData.set(msgId, { id: msgId, communityId })
      }
      const entry = messageData.get(msgId)!
      const predValue = typeof quad.object === 'string' ? quad.object : quad.object.value

      if (quad.predicate.endsWith('author')) entry.authorDID = predValue
      if (quad.predicate.endsWith('channelId') || quad.predicate.endsWith('inChannel')) entry.channelId = predValue
      if (quad.predicate.endsWith('timestamp')) entry.timestamp = predValue
    }

    for (const [, data] of messageData) {
      if (data.id && data.authorDID && data.channelId && data.timestamp) {
        this.indexMessageMeta({
          id: data.id,
          channelId: data.channelId,
          communityId,
          authorDID: data.authorDID,
          timestamp: data.timestamp,
          hasAttachment: false,
          clock: 0
        })
      }
    }
  }

  private matchesFilters(meta: MessageMetadata, filters: MetadataFilters): boolean {
    if (filters.channelId && meta.channelId !== filters.channelId) return false
    if (filters.authorDID && meta.authorDID !== filters.authorDID) return false

    if (filters.before && meta.timestamp >= filters.before) return false
    if (filters.after && meta.timestamp <= filters.after) return false

    if (filters.hasAttachment !== undefined && meta.hasAttachment !== filters.hasAttachment) return false
    if (filters.inThread !== undefined) {
      const isInThread = !!meta.threadId
      if (isInThread !== filters.inThread) return false
    }

    return true
  }
}
