import { describe, it, expect } from 'vitest'
import { clockCompare, clockMax, clockMerge, clockTick, clockCreate, CRDTLog, CRDTOpLog } from '../src/index.js'
import type { LamportClock, EditOp, DeleteOp } from '../src/index.js'

describe('@harmony/crdt', () => {
  describe('Lamport Clock', () => {
    it('MUST compare by counter first', () => {
      const a: LamportClock = { counter: 1, authorDID: 'did:key:B' }
      const b: LamportClock = { counter: 2, authorDID: 'did:key:A' }
      expect(clockCompare(a, b)).toBe(-1)
      expect(clockCompare(b, a)).toBe(1)
    })

    it('MUST use authorDID as deterministic tie-breaker', () => {
      const a: LamportClock = { counter: 1, authorDID: 'did:key:A' }
      const b: LamportClock = { counter: 1, authorDID: 'did:key:B' }
      expect(clockCompare(a, b)).toBe(-1)
      expect(clockCompare(b, a)).toBe(1)
      expect(clockCompare(a, a)).toBe(0)
    })

    it('MUST merge by taking max counter + 1', () => {
      const local: LamportClock = { counter: 3, authorDID: 'did:key:L' }
      const remote: LamportClock = { counter: 5, authorDID: 'did:key:R' }
      const merged = clockMerge(local, remote)
      expect(merged.counter).toBe(6)
      expect(merged.authorDID).toBe('did:key:L')
    })

    it('MUST tick by incrementing counter', () => {
      const clock: LamportClock = { counter: 3, authorDID: 'did:key:A' }
      const ticked = clockTick(clock)
      expect(ticked.counter).toBe(4)
      expect(ticked.authorDID).toBe('did:key:A')
    })

    it('MUST produce identical ordering on all replicas given same inputs', () => {
      const clocks: LamportClock[] = [
        { counter: 3, authorDID: 'did:key:C' },
        { counter: 1, authorDID: 'did:key:A' },
        { counter: 2, authorDID: 'did:key:B' },
        { counter: 2, authorDID: 'did:key:A' },
        { counter: 1, authorDID: 'did:key:B' }
      ]
      const sorted1 = [...clocks].sort(clockCompare)
      const sorted2 = [...clocks].sort(clockCompare)
      // Shuffle and re-sort
      const shuffled = [clocks[3], clocks[0], clocks[4], clocks[1], clocks[2]]
      const sorted3 = shuffled.sort(clockCompare)
      expect(sorted1).toEqual(sorted2)
      expect(sorted1).toEqual(sorted3)
    })
  })

  describe('CRDTLog', () => {
    it('MUST append entries in clock order', () => {
      const log = new CRDTLog<string>('did:key:A')
      log.append('first', { counter: 1, authorDID: 'did:key:A' }, 'e1')
      log.append('second', { counter: 2, authorDID: 'did:key:A' }, 'e2')
      const entries = log.entries()
      expect(entries[0].data).toBe('first')
      expect(entries[1].data).toBe('second')
    })

    it('MUST merge remote entries into correct position', () => {
      const log = new CRDTLog<string>('did:key:A')
      log.append('local-1', { counter: 1, authorDID: 'did:key:A' }, 'e1')
      log.append('local-3', { counter: 3, authorDID: 'did:key:A' }, 'e3')
      log.merge({ counter: 2, authorDID: 'did:key:B' }, 'remote-2', 'e2')
      const entries = log.entries()
      expect(entries[0].data).toBe('local-1')
      expect(entries[1].data).toBe('remote-2')
      expect(entries[2].data).toBe('local-3')
    })

    it('MUST handle concurrent entries (same counter, different author)', () => {
      const log = new CRDTLog<string>('did:key:A')
      log.append('alice', { counter: 1, authorDID: 'did:key:Alice' }, 'e1')
      log.merge({ counter: 1, authorDID: 'did:key:Bob' }, 'bob', 'e2')
      const entries = log.entries()
      // Alphabetical DID ordering for tie-break
      expect(entries[0].clock.authorDID).toBe('did:key:Alice')
      expect(entries[1].clock.authorDID).toBe('did:key:Bob')
    })

    it('MUST return entries in deterministic order', () => {
      const log1 = new CRDTLog<string>('did:key:A')
      const log2 = new CRDTLog<string>('did:key:B')
      const msgs = [
        { data: 'c', clock: { counter: 3, authorDID: 'did:key:C' } as LamportClock, id: 'e3' },
        { data: 'a', clock: { counter: 1, authorDID: 'did:key:A' } as LamportClock, id: 'e1' },
        { data: 'b', clock: { counter: 2, authorDID: 'did:key:B' } as LamportClock, id: 'e2' }
      ]
      // Add in different orders
      for (const m of msgs) log1.merge(m.clock, m.data, m.id)
      for (const m of [...msgs].reverse()) log2.merge(m.clock, m.data, m.id)
      const e1 = log1.entries().map((e) => e.data)
      const e2 = log2.entries().map((e) => e.data)
      expect(e1).toEqual(e2)
    })

    it('MUST return entries since a given clock', () => {
      const log = new CRDTLog<string>('did:key:A')
      log.append('m1', { counter: 1, authorDID: 'did:key:A' }, 'e1')
      log.append('m2', { counter: 2, authorDID: 'did:key:A' }, 'e2')
      log.append('m3', { counter: 3, authorDID: 'did:key:A' }, 'e3')
      const since = log.entriesSince({ counter: 1, authorDID: 'did:key:A' })
      expect(since.length).toBe(2)
      expect(since[0].data).toBe('m2')
    })

    it('MUST return entries before a given clock (pagination)', () => {
      const log = new CRDTLog<string>('did:key:A')
      for (let i = 1; i <= 10; i++) {
        log.append(`m${i}`, { counter: i, authorDID: 'did:key:A' }, `e${i}`)
      }
      const before = log.entriesBefore({ counter: 8, authorDID: 'did:key:A' }, 3)
      expect(before.length).toBe(3)
      expect(before[0].data).toBe('m5')
      expect(before[2].data).toBe('m7')
    })

    it('MUST handle out-of-order arrival (late messages insert correctly)', () => {
      const log = new CRDTLog<string>('did:key:A')
      log.append('m3', { counter: 3, authorDID: 'did:key:A' }, 'e3')
      log.append('m1', { counter: 1, authorDID: 'did:key:A' }, 'e1')
      log.append('m2', { counter: 2, authorDID: 'did:key:A' }, 'e2')
      const entries = log.entries()
      expect(entries[0].data).toBe('m1')
      expect(entries[1].data).toBe('m2')
      expect(entries[2].data).toBe('m3')
    })

    it('MUST deduplicate entries with same id', () => {
      const log = new CRDTLog<string>('did:key:A')
      log.append('m1', { counter: 1, authorDID: 'did:key:A' }, 'e1')
      log.append('m1-dup', { counter: 1, authorDID: 'did:key:A' }, 'e1')
      expect(log.size()).toBe(1)
    })

    it('MUST report correct size', () => {
      const log = new CRDTLog<string>('did:key:A')
      expect(log.size()).toBe(0)
      log.append('m1', { counter: 1, authorDID: 'did:key:A' }, 'e1')
      log.append('m2', { counter: 2, authorDID: 'did:key:A' }, 'e2')
      expect(log.size()).toBe(2)
    })
  })

  describe('Offline Merge', () => {
    it('MUST merge two independently-grown logs into same order', () => {
      // Alice's log
      const alice = new CRDTLog<string>('did:key:Alice')
      alice.append('a1', { counter: 1, authorDID: 'did:key:Alice' }, 'a1')
      alice.append('a2', { counter: 2, authorDID: 'did:key:Alice' }, 'a2')

      // Bob's log (grown independently)
      const bob = new CRDTLog<string>('did:key:Bob')
      bob.append('b1', { counter: 1, authorDID: 'did:key:Bob' }, 'b1')
      bob.append('b2', { counter: 2, authorDID: 'did:key:Bob' }, 'b2')

      // Merge Alice → Bob
      for (const e of alice.allEntries()) {
        bob.merge(e.clock, e.data, e.id)
      }
      // Merge Bob → Alice
      const bobOriginal = new CRDTLog<string>('did:key:Bob')
      bobOriginal.append('b1', { counter: 1, authorDID: 'did:key:Bob' }, 'b1')
      bobOriginal.append('b2', { counter: 2, authorDID: 'did:key:Bob' }, 'b2')
      for (const e of bobOriginal.allEntries()) {
        alice.merge(e.clock, e.data, e.id)
      }

      const aliceEntries = alice.entries().map((e) => e.id)
      const bobEntries = bob.entries().map((e) => e.id)
      expect(aliceEntries).toEqual(bobEntries)
    })

    it('MUST handle divergent clocks (offline for N messages)', () => {
      const log1 = new CRDTLog<string>('did:key:A')
      const log2 = new CRDTLog<string>('did:key:B')

      // A sends 5 messages while B is offline
      for (let i = 1; i <= 5; i++) {
        log1.append(`a${i}`, { counter: i, authorDID: 'did:key:A' }, `a${i}`)
      }
      // B sends 3 messages offline
      for (let i = 1; i <= 3; i++) {
        log2.append(`b${i}`, { counter: i, authorDID: 'did:key:B' }, `b${i}`)
      }

      // Merge
      for (const e of log1.allEntries()) log2.merge(e.clock, e.data, e.id)
      for (const e of log2.allEntries().filter((e) => e.id.startsWith('b'))) log1.merge(e.clock, e.data, e.id)

      expect(log1.entries().map((e) => e.id)).toEqual(log2.entries().map((e) => e.id))
    })

    it('MUST produce identical result regardless of merge order (commutativity)', () => {
      const entries = [
        { id: 'x', clock: { counter: 1, authorDID: 'did:key:X' } as LamportClock, data: 'x' },
        { id: 'y', clock: { counter: 2, authorDID: 'did:key:Y' } as LamportClock, data: 'y' },
        { id: 'z', clock: { counter: 1, authorDID: 'did:key:Z' } as LamportClock, data: 'z' }
      ]

      const log1 = new CRDTLog<string>('did:key:Test')
      for (const e of entries) log1.merge(e.clock, e.data, e.id)

      const log2 = new CRDTLog<string>('did:key:Test')
      for (const e of [...entries].reverse()) log2.merge(e.clock, e.data, e.id)

      expect(log1.entries().map((e) => e.id)).toEqual(log2.entries().map((e) => e.id))
    })

    it('MUST produce identical result regardless of merge grouping (associativity)', () => {
      const e1 = { id: 'e1', clock: { counter: 1, authorDID: 'did:key:A' } as LamportClock, data: 'a' }
      const e2 = { id: 'e2', clock: { counter: 2, authorDID: 'did:key:B' } as LamportClock, data: 'b' }
      const e3 = { id: 'e3', clock: { counter: 3, authorDID: 'did:key:C' } as LamportClock, data: 'c' }

      // (A + B) + C
      const log1 = new CRDTLog<string>('did:key:Test')
      log1.merge(e1.clock, e1.data, e1.id)
      log1.merge(e2.clock, e2.data, e2.id)
      log1.merge(e3.clock, e3.data, e3.id)

      // A + (B + C)
      const log2 = new CRDTLog<string>('did:key:Test')
      log2.merge(e3.clock, e3.data, e3.id)
      log2.merge(e1.clock, e1.data, e1.id)
      log2.merge(e2.clock, e2.data, e2.id)

      expect(log1.entries().map((e) => e.id)).toEqual(log2.entries().map((e) => e.id))
    })
  })

  describe('Tombstones', () => {
    it('MUST mark entries as deleted via tombstone', () => {
      const log = new CRDTLog<string>('did:key:A')
      log.append('m1', { counter: 1, authorDID: 'did:key:A' }, 'e1')
      log.tombstone('e1')
      const entry = log.getEntry('e1')
      expect(entry?.tombstone).toBe(true)
    })

    it('MUST not return tombstoned entries in normal queries', () => {
      const log = new CRDTLog<string>('did:key:A')
      log.append('m1', { counter: 1, authorDID: 'did:key:A' }, 'e1')
      log.append('m2', { counter: 2, authorDID: 'did:key:A' }, 'e2')
      log.tombstone('e1')
      expect(log.entries().length).toBe(1)
      expect(log.entries()[0].id).toBe('e2')
      expect(log.latest()?.id).toBe('e2')
    })

    it('MUST include tombstoned entries in sync/diff', () => {
      const log = new CRDTLog<string>('did:key:A')
      log.append('m1', { counter: 1, authorDID: 'did:key:A' }, 'e1')
      log.append('m2', { counter: 2, authorDID: 'did:key:A' }, 'e2')
      log.tombstone('e1')
      const diff = log.diff({ counter: 0, authorDID: '' })
      expect(diff.length).toBe(2)
      expect(diff.find((e) => e.id === 'e1')?.tombstone).toBe(true)
    })

    it('MUST handle delete of already-deleted entry (idempotent)', () => {
      const log = new CRDTLog<string>('did:key:A')
      log.append('m1', { counter: 1, authorDID: 'did:key:A' }, 'e1')
      log.tombstone('e1')
      log.tombstone('e1') // idempotent
      expect(log.getEntry('e1')?.tombstone).toBe(true)
      expect(log.entries().length).toBe(0)
    })
  })

  describe('Operations (Edit/Delete)', () => {
    it('MUST apply edit operation to target entry', () => {
      const opLog = new CRDTOpLog()
      const edit: EditOp = {
        type: 'edit',
        targetId: 'e1',
        newContent: 'updated content',
        clock: { counter: 2, authorDID: 'did:key:A' }
      }
      opLog.applyOp(edit)
      const ops = opLog.opsForEntry('e1')
      expect(ops.length).toBe(1)
      expect(ops[0].type).toBe('edit')
    })

    it('MUST apply delete operation (sets tombstone)', () => {
      const opLog = new CRDTOpLog()
      const del: DeleteOp = {
        type: 'delete',
        targetId: 'e1',
        clock: { counter: 3, authorDID: 'did:key:A' }
      }
      opLog.applyOp(del)
      expect(opLog.isDeleted('e1')).toBe(true)
    })

    it('MUST order operations by clock', () => {
      const opLog = new CRDTOpLog()
      opLog.applyOp({ type: 'edit', targetId: 'e1', newContent: 'v2', clock: { counter: 3, authorDID: 'did:key:A' } })
      opLog.applyOp({ type: 'edit', targetId: 'e1', newContent: 'v1', clock: { counter: 1, authorDID: 'did:key:A' } })
      const ops = opLog.allOps()
      expect(ops[0].clock.counter).toBe(1)
      expect(ops[1].clock.counter).toBe(3)
    })

    it('MUST handle concurrent edits (last-writer-wins by clock)', () => {
      const opLog = new CRDTOpLog()
      opLog.applyOp({
        type: 'edit',
        targetId: 'e1',
        newContent: 'alice',
        clock: { counter: 2, authorDID: 'did:key:Alice' }
      })
      opLog.applyOp({
        type: 'edit',
        targetId: 'e1',
        newContent: 'bob',
        clock: { counter: 2, authorDID: 'did:key:Bob' }
      })
      const latest = opLog.resolveLatestEdit('e1')
      // Bob wins because 'did:key:Bob' > 'did:key:Alice' lexicographically
      expect(latest?.newContent).toBe('bob')
    })

    it('MUST return ops since a given clock (for sync)', () => {
      const opLog = new CRDTOpLog()
      opLog.applyOp({ type: 'edit', targetId: 'e1', newContent: 'v1', clock: { counter: 1, authorDID: 'did:key:A' } })
      opLog.applyOp({ type: 'edit', targetId: 'e1', newContent: 'v2', clock: { counter: 5, authorDID: 'did:key:A' } })
      opLog.applyOp({ type: 'delete', targetId: 'e2', clock: { counter: 10, authorDID: 'did:key:A' } })
      const since = opLog.opsSince({ counter: 3, authorDID: 'did:key:A' })
      expect(since.length).toBe(2)
    })
  })

  describe('Diff', () => {
    it('MUST return entries the remote is missing', () => {
      const log = new CRDTLog<string>('did:key:A')
      log.append('m1', { counter: 1, authorDID: 'did:key:A' }, 'e1')
      log.append('m2', { counter: 2, authorDID: 'did:key:A' }, 'e2')
      log.append('m3', { counter: 3, authorDID: 'did:key:A' }, 'e3')
      const diff = log.diff({ counter: 1, authorDID: 'did:key:A' })
      expect(diff.length).toBe(2)
      expect(diff[0].id).toBe('e2')
    })

    it('MUST return empty diff if remote is up to date', () => {
      const log = new CRDTLog<string>('did:key:A')
      log.append('m1', { counter: 1, authorDID: 'did:key:A' }, 'e1')
      const diff = log.diff({ counter: 1, authorDID: 'did:key:A' })
      expect(diff.length).toBe(0)
    })

    it('MUST include tombstones in diff', () => {
      const log = new CRDTLog<string>('did:key:A')
      log.append('m1', { counter: 1, authorDID: 'did:key:A' }, 'e1')
      log.append('m2', { counter: 2, authorDID: 'did:key:A' }, 'e2')
      log.tombstone('e2')
      const diff = log.diff({ counter: 0, authorDID: '' })
      expect(diff.length).toBe(2)
      const tombstoned = diff.find((e) => e.id === 'e2')
      expect(tombstoned?.tombstone).toBe(true)
    })
  })

  describe('Clock Helpers', () => {
    it('clockCreate MUST create clock with counter 0', () => {
      const c = clockCreate('did:key:A')
      expect(c.counter).toBe(0)
      expect(c.authorDID).toBe('did:key:A')
    })

    it('clockMax MUST return higher clock', () => {
      const a: LamportClock = { counter: 2, authorDID: 'did:key:A' }
      const b: LamportClock = { counter: 5, authorDID: 'did:key:B' }
      expect(clockMax(a, b)).toBe(b)
      expect(clockMax(b, a)).toBe(b)
    })

    it('clockMax MUST use authorDID tie-break', () => {
      const a: LamportClock = { counter: 1, authorDID: 'did:key:A' }
      const b: LamportClock = { counter: 1, authorDID: 'did:key:B' }
      expect(clockMax(a, b)).toBe(b) // B > A
    })

    it('clockMerge MUST keep local authorDID', () => {
      const local: LamportClock = { counter: 1, authorDID: 'did:key:L' }
      const remote: LamportClock = { counter: 10, authorDID: 'did:key:R' }
      const merged = clockMerge(local, remote)
      expect(merged.authorDID).toBe('did:key:L')
      expect(merged.counter).toBe(11)
    })

    it('clockCompare MUST return 0 for identical clocks', () => {
      const c: LamportClock = { counter: 5, authorDID: 'did:key:X' }
      expect(clockCompare(c, { ...c })).toBe(0)
    })
  })

  describe('CRDTLog Additional', () => {
    it('latest() MUST return null for empty log', () => {
      const log = new CRDTLog<string>('did:key:A')
      expect(log.latest()).toBeNull()
    })

    it('latest() MUST skip tombstoned entries', () => {
      const log = new CRDTLog<string>('did:key:A')
      log.append('m1', { counter: 1, authorDID: 'did:key:A' }, 'e1')
      log.append('m2', { counter: 2, authorDID: 'did:key:A' }, 'e2')
      log.tombstone('e2')
      expect(log.latest()?.id).toBe('e1')
    })

    it('tick() MUST increment and return new clock', () => {
      const log = new CRDTLog<string>('did:key:A')
      log.append('m1', { counter: 5, authorDID: 'did:key:A' }, 'e1')
      const ticked = log.tick('did:key:A')
      expect(ticked.counter).toBe(6)
      expect(ticked.authorDID).toBe('did:key:A')
    })

    it('currentClock() MUST return current internal clock', () => {
      const log = new CRDTLog<string>('did:key:A')
      expect(log.currentClock().counter).toBe(0)
      log.append('m1', { counter: 3, authorDID: 'did:key:A' }, 'e1')
      expect(log.currentClock().counter).toBe(3)
    })

    it('updateEntry() MUST change data for existing entry', () => {
      const log = new CRDTLog<string>('did:key:A')
      log.append('original', { counter: 1, authorDID: 'did:key:A' }, 'e1')
      log.updateEntry('e1', 'updated')
      expect(log.getEntry('e1')?.data).toBe('updated')
    })

    it('updateEntry() on non-existent entry MUST be no-op', () => {
      const log = new CRDTLog<string>('did:key:A')
      log.updateEntry('nonexistent', 'value')
      expect(log.size()).toBe(0)
    })

    it('getEntry() MUST return undefined for non-existent entry', () => {
      const log = new CRDTLog<string>('did:key:A')
      expect(log.getEntry('nonexistent')).toBeUndefined()
    })

    it('tombstone() on non-existent entry MUST be no-op', () => {
      const log = new CRDTLog<string>('did:key:A')
      log.tombstone('nonexistent')
      expect(log.size()).toBe(0)
    })

    it('entriesSince MUST exclude tombstoned entries', () => {
      const log = new CRDTLog<string>('did:key:A')
      log.append('m1', { counter: 1, authorDID: 'did:key:A' }, 'e1')
      log.append('m2', { counter: 2, authorDID: 'did:key:A' }, 'e2')
      log.append('m3', { counter: 3, authorDID: 'did:key:A' }, 'e3')
      log.tombstone('e2')
      const since = log.entriesSince({ counter: 0, authorDID: '' })
      expect(since.length).toBe(2)
      expect(since.map((e) => e.id)).toEqual(['e1', 'e3'])
    })

    it('entriesBefore MUST exclude tombstoned entries', () => {
      const log = new CRDTLog<string>('did:key:A')
      log.append('m1', { counter: 1, authorDID: 'did:key:A' }, 'e1')
      log.append('m2', { counter: 2, authorDID: 'did:key:A' }, 'e2')
      log.append('m3', { counter: 3, authorDID: 'did:key:A' }, 'e3')
      log.tombstone('e1')
      const before = log.entriesBefore({ counter: 4, authorDID: 'did:key:A' }, 10)
      expect(before.length).toBe(2)
    })

    it('MUST handle large fanout (many concurrent writers)', () => {
      const log = new CRDTLog<string>('did:key:main')
      for (let i = 0; i < 100; i++) {
        log.merge({ counter: 1, authorDID: `did:key:writer${i.toString().padStart(3, '0')}` }, `msg-${i}`, `e${i}`)
      }
      expect(log.size()).toBe(100)
      // All at same counter, should be sorted by authorDID
      const entries = log.entries()
      for (let i = 1; i < entries.length; i++) {
        expect(clockCompare(entries[i - 1].clock, entries[i].clock)).toBeLessThanOrEqual(0)
      }
    })

    it('merge MUST deduplicate by id', () => {
      const log = new CRDTLog<string>('did:key:A')
      log.merge({ counter: 1, authorDID: 'did:key:B' }, 'msg', 'e1')
      log.merge({ counter: 1, authorDID: 'did:key:B' }, 'msg-dup', 'e1')
      expect(log.size()).toBe(1)
    })

    it('merge MUST auto-generate id from clock if not provided', () => {
      const log = new CRDTLog<string>('did:key:A')
      log.merge({ counter: 1, authorDID: 'did:key:B' }, 'msg')
      expect(log.size()).toBe(1)
      const entry = log.entries()[0]
      expect(entry.id).toBe('did:key:B:1')
    })

    it('append MUST auto-generate id from clock if not provided', () => {
      const log = new CRDTLog<string>('did:key:A')
      log.append('msg', { counter: 1, authorDID: 'did:key:A' })
      expect(log.size()).toBe(1)
      expect(log.entries()[0].id).toBe('did:key:A:1')
    })
  })

  describe('CRDTOpLog Additional', () => {
    it('resolveLatestEdit MUST return null for non-existent entry', () => {
      const opLog = new CRDTOpLog()
      expect(opLog.resolveLatestEdit('nonexistent')).toBeNull()
    })

    it('isDeleted MUST return false for non-deleted entry', () => {
      const opLog = new CRDTOpLog()
      expect(opLog.isDeleted('e1')).toBe(false)
    })

    it('opsForEntry MUST return empty for unknown entry', () => {
      const opLog = new CRDTOpLog()
      expect(opLog.opsForEntry('unknown')).toEqual([])
    })

    it('allOps MUST return empty for fresh log', () => {
      const opLog = new CRDTOpLog()
      expect(opLog.allOps()).toEqual([])
    })

    it('MUST handle interleaved edit and delete ops', () => {
      const opLog = new CRDTOpLog()
      opLog.applyOp({ type: 'edit', targetId: 'e1', newContent: 'v1', clock: { counter: 1, authorDID: 'did:key:A' } })
      opLog.applyOp({ type: 'delete', targetId: 'e1', clock: { counter: 2, authorDID: 'did:key:A' } })
      opLog.applyOp({ type: 'edit', targetId: 'e1', newContent: 'v2', clock: { counter: 3, authorDID: 'did:key:A' } })
      expect(opLog.isDeleted('e1')).toBe(true)
      expect(opLog.resolveLatestEdit('e1')?.newContent).toBe('v2')
      expect(opLog.opsForEntry('e1').length).toBe(3)
    })

    it('opsSince MUST return empty when no ops after clock', () => {
      const opLog = new CRDTOpLog()
      opLog.applyOp({ type: 'edit', targetId: 'e1', newContent: 'v1', clock: { counter: 1, authorDID: 'did:key:A' } })
      expect(opLog.opsSince({ counter: 5, authorDID: 'did:key:A' })).toEqual([])
    })
  })
})
