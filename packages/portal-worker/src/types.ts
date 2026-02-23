// Cloudflare Workers environment interface
export interface PortalWorkerEnv {
  DB: D1Database
  EXPORTS: R2Bucket
  KV: KVNamespace
  RELAY: DurableObjectNamespace
  DISCORD_CLIENT_ID: string
  DISCORD_CLIENT_SECRET: string
  DISCORD_REDIRECT_URI: string
  ALLOWED_ORIGINS: string
}

// Cloudflare D1 types (simplified interface)
export interface D1Database {
  prepare(query: string): D1PreparedStatement
  exec(query: string): Promise<D1ExecResult>
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>
  run(): Promise<D1Result>
}

export interface D1Result<T = Record<string, unknown>> {
  results: T[]
  success: boolean
  meta: Record<string, unknown>
}

export interface D1ExecResult {
  count: number
  duration: number
}

// Cloudflare R2 types
export interface R2Bucket {
  put(key: string, value: ArrayBuffer | string, options?: R2PutOptions): Promise<R2Object>
  get(key: string): Promise<R2ObjectBody | null>
  delete(key: string): Promise<void>
  list(options?: R2ListOptions): Promise<R2Objects>
}

export interface R2PutOptions {
  httpMetadata?: Record<string, string>
  customMetadata?: Record<string, string>
}

export interface R2Object {
  key: string
  size: number
  etag: string
}

export interface R2ObjectBody extends R2Object {
  arrayBuffer(): Promise<ArrayBuffer>
  text(): Promise<string>
}

export interface R2ListOptions {
  prefix?: string
  limit?: number
  cursor?: string
}

export interface R2Objects {
  objects: R2Object[]
  truncated: boolean
  cursor?: string
}

// Cloudflare KV types
export interface KVNamespace {
  get(key: string, options?: { type?: string }): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

// Cloudflare Durable Objects types
export interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId
  get(id: DurableObjectId): DurableObjectStub
}

export interface DurableObjectId {
  toString(): string
}

export interface DurableObjectStub {
  fetch(input: string | Request, init?: RequestInit): Promise<Response>
}

// Export bundle types
export interface EncryptedExportBundle {
  ciphertext: Uint8Array
  nonce: Uint8Array
  metadata: {
    exportDate: string
    sourceServerId: string
    sourceServerName: string
    adminDID: string
    channelCount: number
    messageCount: number
    memberCount: number
    quadCount: number
  }
}

export interface ExportMetadata {
  exportId: string
  adminDID: string
  communityName: string
  quadCount: number
  sizeBytes: number
  createdAt: string
}

// Invite types
export interface CommunityPreview {
  name: string
  description?: string
  memberCount: number
}

export interface InviteTarget {
  communityId: string
  endpoint: string
  preview: CommunityPreview
}

export interface InviteStats {
  code: string
  uses: number
  maxUses?: number
  createdAt: string
  expiresAt?: string
}

// Directory types
export interface DirectoryEntry {
  communityId: string
  name: string
  description?: string
  endpoint: string
  memberCount: number
  inviteCode?: string
  ownerDID: string
  listedAt: string
}
