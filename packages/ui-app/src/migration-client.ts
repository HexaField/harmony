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
  error?: string
}

export interface ImportResult {
  communityId: string
  channels: any[]
  members: any[]
}

/** Convert a ws:// or wss:// URL to the HTTP health/API base URL (port + 1) */
export function toApiBase(serverUrl: string): string {
  if (!serverUrl) throw new Error('No server URL configured')
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
}): Promise<ImportResult> {
  const base = toApiBase(params.serverUrl)
  const res = await fetch(`${base}/api/migration/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bundle: params.bundle,
      adminDID: params.adminDID,
      communityName: params.communityName
    })
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Import failed (${res.status}): ${text}`)
  }
  return res.json()
}
