// ── Lamport Clock ──

export interface LamportClock {
  counter: number
  authorDID: string
}

/**
 * Compare two Lamport clocks. Counter first, then authorDID lexicographic for tie-breaking.
 * Returns: -1 if a < b, 0 if equal, 1 if a > b
 */
export function clockCompare(a: LamportClock, b: LamportClock): number {
  if (a.counter < b.counter) return -1
  if (a.counter > b.counter) return 1
  if (a.authorDID < b.authorDID) return -1
  if (a.authorDID > b.authorDID) return 1
  return 0
}

/** Return the clock with the higher value */
export function clockMax(a: LamportClock, b: LamportClock): LamportClock {
  return clockCompare(a, b) >= 0 ? a : b
}

/** Merge local and remote clocks: max(local.counter, remote.counter) + 1, keep local authorDID */
export function clockMerge(local: LamportClock, remote: LamportClock): LamportClock {
  return {
    counter: Math.max(local.counter, remote.counter) + 1,
    authorDID: local.authorDID
  }
}

/** Create a new clock with counter 0 */
export function clockCreate(authorDID: string): LamportClock {
  return { counter: 0, authorDID }
}

/** Tick the clock: increment counter */
export function clockTick(clock: LamportClock): LamportClock {
  return { counter: clock.counter + 1, authorDID: clock.authorDID }
}
