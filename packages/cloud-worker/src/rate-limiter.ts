// Rate limiter using KV
import type { KVNamespace } from './types.js'

export interface RateLimiter {
  check(key: string, maxRequests: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number }>
}

export function createRateLimiter(kv: KVNamespace): RateLimiter {
  return {
    async check(
      key: string,
      maxRequests: number,
      windowSeconds: number
    ): Promise<{ allowed: boolean; remaining: number }> {
      const kvKey = `rate:${key}`
      const existing = await kv.get(kvKey)
      const now = Math.floor(Date.now() / 1000)

      if (!existing) {
        await kv.put(kvKey, JSON.stringify({ count: 1, start: now }), { expirationTtl: windowSeconds })
        return { allowed: true, remaining: maxRequests - 1 }
      }

      const data = JSON.parse(existing) as { count: number; start: number }

      if (now - data.start > windowSeconds) {
        // Window expired, reset
        await kv.put(kvKey, JSON.stringify({ count: 1, start: now }), { expirationTtl: windowSeconds })
        return { allowed: true, remaining: maxRequests - 1 }
      }

      if (data.count >= maxRequests) {
        return { allowed: false, remaining: 0 }
      }

      data.count++
      await kv.put(kvKey, JSON.stringify(data), { expirationTtl: windowSeconds })
      return { allowed: true, remaining: maxRequests - data.count }
    }
  }
}
