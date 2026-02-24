// Cloudflare-specific type definitions for harmony-cloud

export interface Env {
  COMMUNITY: DurableObjectNamespace
  DB: D1Database
  MEDIA: R2Bucket
  ALLOWED_ORIGINS: string
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
}

export interface HealthResponse {
  status: 'ok'
  connections: number
}
