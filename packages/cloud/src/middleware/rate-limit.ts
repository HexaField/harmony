import type { Request, Response, NextFunction } from 'express'

export interface RateLimitOptions {
  windowMs: number
  maxRequests: number
}

interface RateLimitEntry {
  count: number
  resetAt: number
}

export function rateLimitMiddleware(options: RateLimitOptions) {
  const entries: Map<string, RateLimitEntry> = new Map()

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = (req as any).holderDID || req.ip || 'unknown'
    const now = Date.now()

    let entry = entries.get(key)
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + options.windowMs }
      entries.set(key, entry)
    }

    entry.count++

    res.setHeader('X-RateLimit-Limit', options.maxRequests)
    res.setHeader('X-RateLimit-Remaining', Math.max(0, options.maxRequests - entry.count))
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000))

    if (entry.count > options.maxRequests) {
      res.status(429).json({ error: 'Rate limit exceeded' })
      return
    }

    next()
  }
}

export function clearRateLimits(): void {
  // For testing - creates a fresh middleware each time
}
