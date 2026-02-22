import type { LamportClock } from './clock.js'
import { clockCompare } from './clock.js'

// ── Operations (Edit/Delete) ──

export interface EditOp {
  type: 'edit'
  targetId: string
  newContent: unknown
  clock: LamportClock
}

export interface DeleteOp {
  type: 'delete'
  targetId: string
  clock: LamportClock
}

export type CRDTOp = EditOp | DeleteOp

export class CRDTOpLog {
  private _ops: CRDTOp[] = []

  /** Apply an operation (insert sorted by clock) */
  applyOp(op: CRDTOp): void {
    // Binary search for sorted insert
    let lo = 0
    let hi = this._ops.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (clockCompare(this._ops[mid].clock, op.clock) < 0) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }
    this._ops.splice(lo, 0, op)
  }

  /** Get all ops for a given entry */
  opsForEntry(entryId: string): CRDTOp[] {
    return this._ops.filter((op) => op.targetId === entryId)
  }

  /** Get all ops */
  allOps(): CRDTOp[] {
    return [...this._ops]
  }

  /** Get ops since a given clock */
  opsSince(clock: LamportClock): CRDTOp[] {
    return this._ops.filter((op) => clockCompare(op.clock, clock) > 0)
  }

  /** Resolve the latest edit for an entry (last-writer-wins by clock) */
  resolveLatestEdit(entryId: string): EditOp | null {
    const edits = this._ops.filter((op): op is EditOp => op.type === 'edit' && op.targetId === entryId)
    if (edits.length === 0) return null
    return edits[edits.length - 1] // already sorted by clock
  }

  /** Check if an entry has been deleted */
  isDeleted(entryId: string): boolean {
    return this._ops.some((op) => op.type === 'delete' && op.targetId === entryId)
  }
}
