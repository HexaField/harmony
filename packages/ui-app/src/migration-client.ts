// Thin API client for the server-runtime migration endpoints

export interface ExportOptions {
  maxMessagesPerChannel?: number
  skipChannels?: string[]
}

export interface ExportProgress {
  phase: 'channels' | 'roles' | 'members' | 'messages' | 'encrypting'
  current: number
  total: number
  channelName?: string
}

export interface ExportStatus {
  status: 'running' | 'complete' | 'error'
  progress: ExportProgress
  bundle?: any
  adminKeyPair?: { publicKey: string; secretKey: string }
  error?: string
}

export interface ImportResult {
  communityId: string
  channels: any[]
  members: any[]
}

// ── Hash-based migration types ──

export interface MigrationCreateResult {
  id: string
  expiresAt: string
}

export interface MigrationStatusResult {
  id: string
  serverId: string
  serverName: string
  hashCount: number
  status: 'active' | 'expired' | 'deleted'
  createdAt: string
  expiresAt: string
}

export interface VerifyResult {
  verified: number
  rejected: number
  total: number
  verifiedHashes: string[]
}

export interface VerifiedImportResult {
  ok: boolean
  imported: number
}

/** Convert a ws:// or wss:// URL to the HTTP health/API base URL (port + 1) */
export function toApiBase(serverUrl: string): string {
  if (!serverUrl || !serverUrl.trim()) throw new Error('No server URL configured')
  let normalized = serverUrl.trim()
  // Add protocol if missing
  if (!normalized.match(/^(ws|wss|http|https):\/\//)) {
    normalized = 'ws://' + normalized
  }
  const url = new URL(normalized.replace('ws://', 'http://').replace('wss://', 'https://'))
  const port = parseInt(url.port || '4000', 10)
  return `${url.protocol}//${url.hostname}:${port + 1}`
}

export async function startExport(params: {
  serverUrl: string
  botToken: string
  guildId: string
  adminDID: string
  options?: ExportOptions
}): Promise<string> {
  const base = toApiBase(params.serverUrl)
  const res = await fetch(`${base}/api/migration/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      botToken: params.botToken,
      guildId: params.guildId,
      adminDID: params.adminDID,
      options: params.options
    })
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Export start failed (${res.status}): ${text}`)
  }
  const data = await res.json()
  return data.exportId
}

export async function pollExport(serverUrl: string, exportId: string): Promise<ExportStatus> {
  const base = toApiBase(serverUrl)
  const res = await fetch(`${base}/api/migration/export/${exportId}`)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Export poll failed (${res.status}): ${text}`)
  }
  return res.json()
}

export async function importBundle(params: {
  serverUrl: string
  bundle: any
  adminDID: string
  communityName: string
  adminKeyPair?: { publicKey: string; secretKey: string }
}): Promise<ImportResult> {
  const base = toApiBase(params.serverUrl)
  const res = await fetch(`${base}/api/migration/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bundle: params.bundle,
      adminDID: params.adminDID,
      communityName: params.communityName,
      adminKeyPair: params.adminKeyPair
    })
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Import failed (${res.status}): ${text}`)
  }
  return res.json()
}

// ── Hash-based migration client functions ──

/**
 * Create a new hash-based migration on the server.
 */
export async function createMigration(params: {
  serverUrl: string
  serverId: string
  serverName: string
  channelMap: Record<string, string>
  authHeader: string
}): Promise<MigrationCreateResult> {
  const base = toApiBase(params.serverUrl)
  const res = await fetch(`${base}/api/migration/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: params.authHeader
    },
    body: JSON.stringify({
      serverId: params.serverId,
      serverName: params.serverName,
      channelMap: params.channelMap
    })
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Migration create failed (${res.status}): ${text}`)
  }
  return res.json()
}

/**
 * Get migration status.
 */
export async function getMigrationStatus(serverUrl: string, migrationId: string): Promise<MigrationStatusResult> {
  const base = toApiBase(serverUrl)
  const res = await fetch(`${base}/api/migration/${migrationId}/status`)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Migration status failed (${res.status}): ${text}`)
  }
  return res.json()
}

/**
 * Verify user message hashes against the stored index.
 */
export async function verifyHashes(params: {
  serverUrl: string
  migrationId: string
  hashes: string[]
  authHeader: string
}): Promise<VerifyResult> {
  const base = toApiBase(params.serverUrl)
  const res = await fetch(`${base}/api/migration/${params.migrationId}/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: params.authHeader
    },
    body: JSON.stringify({ hashes: params.hashes })
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Hash verify failed (${res.status}): ${text}`)
  }
  return res.json()
}

/**
 * Import verified messages to Harmony.
 */
export async function importVerifiedMessages(params: {
  serverUrl: string
  migrationId: string
  verifiedHashes: string[]
  messages: Array<{ hash: string; channelId: string; content: string; timestamp: string }>
  authHeader: string
}): Promise<VerifiedImportResult> {
  const base = toApiBase(params.serverUrl)
  const res = await fetch(`${base}/api/migration/${params.migrationId}/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: params.authHeader
    },
    body: JSON.stringify({
      verifiedHashes: params.verifiedHashes,
      messages: params.messages
    })
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Import verified failed (${res.status}): ${text}`)
  }
  return res.json()
}

/**
 * Delete a migration.
 */
export async function deleteMigration(params: {
  serverUrl: string
  migrationId: string
  authHeader: string
}): Promise<void> {
  const base = toApiBase(params.serverUrl)
  const res = await fetch(`${base}/api/migration/${params.migrationId}`, {
    method: 'DELETE',
    headers: { Authorization: params.authHeader }
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Migration delete failed (${res.status}): ${text}`)
  }
}
