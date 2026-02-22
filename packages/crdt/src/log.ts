import type { LamportClock } from './clock.js'
import { clockCompare, clockMax, clockTick } from './clock.js'

// ── CRDT Entry ──

export interface CRDTEntry<T> {
  id: string
  clock: LamportClock
  data: T
  tombstone?: boolean
}

// ── CRDT Log ──

export class CRDTLog<T> {
  private _entries: CRDTEntry<T>[] = []
  private _clock: LamportClock
  private _idSet: Set<string> = new Set()

  constructor(authorDID: string) {
    this._clock = { counter: 0, authorDID }
  }

  /** Append a new entry */
  append(entry: T, clock: LamportClock, id?: string): void {
    const entryId = id ?? `${clock.authorDID}:${clock.counter}`
    if (this._idSet.has(entryId)) return // dedup
    const newEntry: CRDTEntry<T> = { id: entryId, clock, data: entry }
    this._insertSorted(newEntry)
    this._idSet.add(entryId)
    // Advance our clock
    this._clock = {
      counter: Math.max(this._clock.counter, clock.counter),
      authorDID: this._clock.authorDID
    }
  }

  /** Merge a remote entry */
  merge(remoteClock: LamportClock, entry: T, id?: string): void {
    const entryId = id ?? `${remoteClock.authorDID}:${remoteClock.counter}`
    if (this._idSet.has(entryId)) return // dedup
    const newEntry: CRDTEntry<T> = { id: entryId, clock: remoteClock, data: entry }
    this._insertSorted(newEntry)
    this._idSet.add(entryId)
    // Advance our clock beyond remote
    this._clock = {
      counter: Math.max(this._clock.counter, remoteClock.counter),
      authorDID: this._clock.authorDID
    }
  }

  /** Return all non-tombstoned entries in clock order */
  entries(): CRDTEntry<T>[] {
    return this._entries.filter((e) => !e.tombstone)
  }

  /** Return all entries including tombstoned in clock order */
  allEntries(): CRDTEntry<T>[] {
    return [...this._entries]
  }

  /** Return entries since a given clock */
  entriesSince(clock: LamportClock): CRDTEntry<T>[] {
    return this._entries.filter((e) => !e.tombstone && clockCompare(e.clock, clock) > 0)
  }

  /** Return entries before a given clock (pagination) */
  entriesBefore(clock: LamportClock, limit: number): CRDTEntry<T>[] {
    const before = this._entries.filter((e) => !e.tombstone && clockCompare(e.clock, clock) < 0)
    return before.slice(-limit)
  }

  /** Get the latest entry */
  latest(): CRDTEntry<T> | null {
    const nonTomb = this._entries.filter((e) => !e.tombstone)
    return nonTomb.length > 0 ? nonTomb[nonTomb.length - 1] : null
  }

  /** Tick the internal clock and return a new clock value */
  tick(authorDID: string): LamportClock {
    this._clock = clockTick({ counter: this._clock.counter, authorDID })
    return { ...this._clock }
  }

  /** Get the current clock */
  currentClock(): LamportClock {
    return { ...this._clock }
  }

  /** Number of entries (including tombstoned) */
  size(): number {
    return this._entries.length
  }

  /** Diff: return entries the remote is missing (entries after remoteClock, including tombstones) */
  diff(remoteClock: LamportClock): CRDTEntry<T>[] {
    return this._entries.filter((e) => clockCompare(e.clock, remoteClock) > 0)
  }

  /** Tombstone an entry by id */
  tombstone(entryId: string): void {
    const entry = this._entries.find((e) => e.id === entryId)
    if (entry) {
      entry.tombstone = true
    }
  }

  /** Get entry by id */
  getEntry(entryId: string): CRDTEntry<T> | undefined {
    return this._entries.find((e) => e.id === entryId)
  }

  /** Update data for an entry (for edit ops) */
  updateEntry(entryId: string, data: T): void {
    const entry = this._entries.find((e) => e.id === entryId)
    if (entry) {
      entry.data = data
    }
  }

  private _insertSorted(entry: CRDTEntry<T>): void {
    // Binary search for insertion point
    let lo = 0
    let hi = this._entries.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (clockCompare(this._entries[mid].clock, entry.clock) < 0) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }
    this._entries.splice(lo, 0, entry)
  }
}
