// Thin API client for the server-runtime migration endpoints

import { signAsync } from '@noble/ed25519'

let _authDID: string | null = null
let _authSecretKey: Uint8Array | null = null

/** Configure Ed25519 credentials for migration API auth */
export function setMigrationAuth(did: string, secretKey: Uint8Array): void {
  _authDID = did
  _authSecretKey = secretKey
}

/** Generate Harmony-Ed25519 authorization header */
async function authHeaders(method: string, path: string): Promise<Record<string, string>> {
  if (!_authDID || !_authSecretKey) return {}

  const timestamp = Math.floor(Date.now() / 1000).toString()
  const message = `${timestamp}:${method}:${path}`
  const msgBytes = new TextEncoder().encode(message)

  let sigBytes: Uint8Array
  try {
    sigBytes = await signAsync(msgBytes, _authSecretKey.slice(0, 32))
  } catch {
    return {}
  }

  const sig = btoa(String.fromCharCode(...sigBytes))
  return { Authorization: `Harmony-Ed25519 ${_authDID} ${timestamp} ${sig}` }
}

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
  const path = '/api/migration/export'
  const auth = await authHeaders('POST', path)
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
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
  const path = `/api/migration/export/${exportId}`
  const auth = await authHeaders('GET', path)
  const res = await fetch(`${base}${path}`, { headers: auth })
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
  const path = '/api/migration/import'
  const auth = await authHeaders('POST', path)
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
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
}): Promise<MigrationCreateResult> {
  const base = toApiBase(params.serverUrl)
  const path = '/api/migration/create'
  const auth = await authHeaders('POST', path)
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...auth
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
  const path = `/api/migration/${migrationId}/status`
  const auth = await authHeaders('GET', path)
  const res = await fetch(`${base}${path}`, { headers: auth })
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
}): Promise<VerifyResult> {
  const base = toApiBase(params.serverUrl)
  const path = `/api/migration/${params.migrationId}/verify`
  const auth = await authHeaders('POST', path)
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...auth
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
}): Promise<VerifiedImportResult> {
  const base = toApiBase(params.serverUrl)
  const path = `/api/migration/${params.migrationId}/import`
  const auth = await authHeaders('POST', path)
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...auth
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
export async function deleteMigration(params: { serverUrl: string; migrationId: string }): Promise<void> {
  const base = toApiBase(params.serverUrl)
  const path = `/api/migration/${params.migrationId}`
  const auth = await authHeaders('DELETE', path)
  const res = await fetch(`${base}${path}`, {
    method: 'DELETE',
    headers: auth
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Migration delete failed (${res.status}): ${text}`)
  }
}
