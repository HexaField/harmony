// Cloudflare-specific type definitions for harmony-cloud

export interface Env {
  COMMUNITY: DurableObjectNamespace
  DB: D1Database
  MEDIA: R2Bucket
  ALLOWED_ORIGINS: string
  CALLS_APP_ID?: string
  CALLS_APP_SECRET?: string
}

export interface Instance {
  id: string
  name: string
  ownerDID: string
  status: 'active' | 'suspended' | 'deleted'
  createdAt: string
  serverUrl: string
}

export interface ConnectionMeta {
  did: string
  authenticated: boolean
  connectedAt: string
  rateLimitCounter?: number
  rateLimitWindowStart?: number
}

export interface HealthResponse {
  status: 'ok'
  connections: number
}
