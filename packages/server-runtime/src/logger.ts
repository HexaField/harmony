// Structured JSON logger
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export interface LogEntry {
  timestamp: string
  level: string
  message: string
  [key: string]: unknown
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
  child(meta: Record<string, unknown>): Logger
  getEntries(): LogEntry[]
}

const LEVELS: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 }

export function createLogger(options: {
  level?: string
  format?: 'json' | 'text'
  file?: string
  silent?: boolean
}): Logger {
  const level = options.level ?? 'info'
  const format = options.format ?? 'json'
  const file = options.file
  const silent = options.silent ?? false
  const entries: LogEntry[] = []
  const baseMeta: Record<string, unknown> = {}

  if (file) {
    try {
      mkdirSync(dirname(file), { recursive: true })
    } catch {
      // directory may already exist
    }
  }

  function shouldLog(entryLevel: string): boolean {
    return (LEVELS[entryLevel] ?? 0) >= (LEVELS[level] ?? 0)
  }

  function log(entryLevel: string, message: string, meta?: Record<string, unknown>): void {
    if (!shouldLog(entryLevel)) return

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: entryLevel,
      message,
      ...baseMeta,
      ...meta
    }

    entries.push(entry)

    if (silent) return

    const line =
      format === 'json'
        ? JSON.stringify(entry)
        : `[${entry.timestamp}] ${entryLevel.toUpperCase()} ${message}${meta ? ' ' + JSON.stringify(meta) : ''}`

    if (file) {
      appendFileSync(file, line + '\n')
    }
  }

  function child(meta: Record<string, unknown>): Logger {
    const childLogger = createLogger({ level, format, file, silent })
    Object.assign(baseMeta, meta)
    return childLogger
  }

  return {
    debug: (msg, meta?) => log('debug', msg, meta),
    info: (msg, meta?) => log('info', msg, meta),
    warn: (msg, meta?) => log('warn', msg, meta),
    error: (msg, meta?) => log('error', msg, meta),
    child,
    getEntries: () => [...entries]
  }
}
