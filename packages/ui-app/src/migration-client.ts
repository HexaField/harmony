// Thin API client for the server-runtime migration endpoints

import { createCryptoProvider } from '@harmony/crypto'

const cryptoProvider = createCryptoProvider()

export interface MigrationAuth {
  did: string
  secretKey: Uint8Array
}

/** Generate Harmony-Ed25519 authorization header */
async function authHeaders(method: string, path: string, auth?: MigrationAuth): Promise<Record<string, string>> {
  if (!auth?.did || !auth?.secretKey) return {}

  const timestamp = Math.floor(Date.now() / 1000).toString()
  const message = `${timestamp}:${method}:${path}`
  const msgBytes = new TextEncoder().encode(message)

  let sigBytes: Uint8Array
  try {
    sigBytes = await cryptoProvider.sign(msgBytes, auth.secretKey)
  } catch (e) {
    console.error('[MigrationAuth] sign failed:', e)
    return {}
  }

  const sig = btoa(String.fromCharCode(...sigBytes))
  return { Authorization: `Harmony-Ed25519 ${auth.did} ${timestamp} ${sig}` }
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
  auth?: MigrationAuth
  options?: ExportOptions
}): Promise<string> {
  const base = toApiBase(params.serverUrl)
  const path = '/api/migration/export'
  const auth = await authHeaders('POST', path, params.auth)
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

export async function pollExport(serverUrl: string, exportId: string, auth?: MigrationAuth): Promise<ExportStatus> {
  const base = toApiBase(serverUrl)
  const path = `/api/migration/export/${exportId}`
  const hdrs = await authHeaders('GET', path, auth)
  const res = await fetch(`${base}${path}`, { headers: hdrs })
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
  auth?: MigrationAuth
  adminKeyPair?: { publicKey: string; secretKey: string }
}): Promise<ImportResult> {
  const base = toApiBase(params.serverUrl)
  const path = '/api/migration/import'
  const hdrs = await authHeaders('POST', path, params.auth)
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...hdrs },
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

export async function createMigration(params: {
  serverUrl: string
  serverId: string
  serverName: string
  channelMap: Record<string, string>
  auth?: MigrationAuth
}): Promise<MigrationCreateResult> {
  const base = toApiBase(params.serverUrl)
  const path = '/api/migration/create'
  const hdrs = await authHeaders('POST', path, params.auth)
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...hdrs },
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

export async function getMigrationStatus(
  serverUrl: string,
  migrationId: string,
  auth?: MigrationAuth
): Promise<MigrationStatusResult> {
  const base = toApiBase(serverUrl)
  const path = `/api/migration/${migrationId}/status`
  const hdrs = await authHeaders('GET', path, auth)
  const res = await fetch(`${base}${path}`, { headers: hdrs })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Migration status failed (${res.status}): ${text}`)
  }
  return res.json()
}

export async function verifyHashes(params: {
  serverUrl: string
  migrationId: string
  hashes: string[]
  auth?: MigrationAuth
}): Promise<VerifyResult> {
  const base = toApiBase(params.serverUrl)
  const path = `/api/migration/${params.migrationId}/verify`
  const hdrs = await authHeaders('POST', path, params.auth)
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...hdrs },
    body: JSON.stringify({ hashes: params.hashes })
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Hash verify failed (${res.status}): ${text}`)
  }
  return res.json()
}

export async function importVerifiedMessages(params: {
  serverUrl: string
  migrationId: string
  verifiedHashes: string[]
  messages: Array<{ hash: string; channelId: string; content: string; timestamp: string }>
  auth?: MigrationAuth
}): Promise<VerifiedImportResult> {
  const base = toApiBase(params.serverUrl)
  const path = `/api/migration/${params.migrationId}/import`
  const hdrs = await authHeaders('POST', path, params.auth)
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...hdrs },
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

export async function deleteMigration(params: {
  serverUrl: string
  migrationId: string
  auth?: MigrationAuth
}): Promise<void> {
  const base = toApiBase(params.serverUrl)
  const path = `/api/migration/${params.migrationId}`
  const hdrs = await authHeaders('DELETE', path, params.auth)
  const res = await fetch(`${base}${path}`, {
    method: 'DELETE',
    headers: hdrs
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Migration delete failed (${res.status}): ${text}`)
  }
}
