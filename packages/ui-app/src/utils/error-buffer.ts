/** Circular buffer capturing recent console.error calls for bug reports */

export interface ErrorEntry {
  timestamp: number
  message: string
  stack?: string
}

const MAX_ENTRIES = 20
const buffer: ErrorEntry[] = []
let installed = false

export function installErrorBuffer(): void {
  if (installed || typeof console === 'undefined') return
  installed = true

  const originalError = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    originalError(...args)

    const message = args
      .map((a) => {
        if (a instanceof Error) return a.message
        if (typeof a === 'string') return a
        try {
          return JSON.stringify(a)
        } catch {
          return String(a)
        }
      })
      .join(' ')

    const stack =
      args.find((a) => a instanceof Error) instanceof Error
        ? (args.find((a) => a instanceof Error) as Error).stack
        : undefined

    buffer.push({ timestamp: Date.now(), message: message.slice(0, 500), stack: stack?.slice(0, 500) })
    if (buffer.length > MAX_ENTRIES) buffer.shift()
  }
}

export function getRecentErrors(): ErrorEntry[] {
  return [...buffer]
}

export function clearErrorBuffer(): void {
  buffer.length = 0
}
