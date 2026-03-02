// Discord Data Package Parser — parses the ZIP file users download from Discord
// (Settings → Privacy & Safety → Request All of My Data)
import { unzipSync, strFromU8 } from 'fflate'

export interface ParsedMessage {
  id: string
  timestamp: string
  content: string
  attachments: string
  channelId?: string
  authorId?: string
}

export interface DiscordDataPackage {
  account: { username: string; id: string; email?: string }
  messages: Array<{
    channelId: string
    channelName?: string
    messages: ParsedMessage[]
  }>
  servers: Array<{ id: string; name: string }>
}

export interface ParseProgress {
  phase: 'extracting' | 'account' | 'messages' | 'servers' | 'complete'
  channelsFound: number
  messagesFound: number
}

/**
 * Parse a Discord data export ZIP file (the one users request from Discord Privacy settings).
 *
 * The ZIP structure is typically:
 * - account/user.json
 * - messages/c{id}/messages.json (or messages.csv)
 * - messages/c{id}/channel.json
 * - messages/index.json
 * - servers/{id}/guild.json
 * - activity/ (ignored)
 */
export async function parseDiscordExport(
  zipBuffer: ArrayBuffer,
  onProgress?: (progress: ParseProgress) => void
): Promise<DiscordDataPackage> {
  const progress: ParseProgress = {
    phase: 'extracting',
    channelsFound: 0,
    messagesFound: 0
  }
  onProgress?.(progress)

  const files = unzipSync(new Uint8Array(zipBuffer))

  // Parse account info
  progress.phase = 'account'
  onProgress?.(progress)

  const account = parseAccountInfo(files)

  // Parse servers
  progress.phase = 'servers'
  onProgress?.(progress)

  const servers = parseServers(files)

  // Parse messages
  progress.phase = 'messages'
  onProgress?.(progress)

  const messages = parseMessages(files, (channelsFound, messagesFound) => {
    progress.channelsFound = channelsFound
    progress.messagesFound = messagesFound
    onProgress?.(progress)
  })

  progress.phase = 'complete'
  onProgress?.(progress)

  return { account, messages, servers }
}

function readJson(files: Record<string, Uint8Array>, path: string): unknown | null {
  const data = files[path]
  if (!data) return null
  try {
    return JSON.parse(strFromU8(data))
  } catch {
    return null
  }
}

function parseAccountInfo(files: Record<string, Uint8Array>): DiscordDataPackage['account'] {
  const user = readJson(files, 'account/user.json') as Record<string, unknown> | null
  if (user) {
    return {
      id: String(user.id ?? ''),
      username: String(user.username ?? user.global_name ?? 'Unknown'),
      email: user.email ? String(user.email) : undefined
    }
  }
  // Fallback: no account info found
  return { id: 'unknown', username: 'Unknown' }
}

function parseServers(files: Record<string, Uint8Array>): Array<{ id: string; name: string }> {
  const servers: Array<{ id: string; name: string }> = []

  // Check servers/index.json first
  const serverIndex = readJson(files, 'servers/index.json') as Record<string, string> | null
  if (serverIndex) {
    for (const [id, name] of Object.entries(serverIndex)) {
      servers.push({ id, name: String(name) })
    }
    return servers
  }

  // Fallback: look for servers/{id}/guild.json
  for (const path of Object.keys(files)) {
    const match = path.match(/^servers\/(\d+)\/guild\.json$/)
    if (match) {
      const guild = readJson(files, path) as Record<string, unknown> | null
      if (guild) {
        servers.push({
          id: match[1],
          name: String(guild.name ?? 'Unknown Server')
        })
      }
    }
  }

  return servers
}

function parseMessages(
  files: Record<string, Uint8Array>,
  onUpdate?: (channelsFound: number, messagesFound: number) => void
): DiscordDataPackage['messages'] {
  const channels: DiscordDataPackage['messages'] = []

  // Build channel name map from messages/index.json
  const msgIndex = readJson(files, 'messages/index.json') as Record<string, string | null> | null
  const channelNames = new Map<string, string>()
  if (msgIndex) {
    for (const [key, name] of Object.entries(msgIndex)) {
      if (name) channelNames.set(key, name)
    }
  }

  // Find all message directories
  const channelDirs = new Set<string>()
  for (const path of Object.keys(files)) {
    const match = path.match(/^messages\/(c?\d+)\//)
    if (match) {
      channelDirs.add(match[1])
    }
  }

  let totalMessages = 0
  let channelsFound = 0

  for (const channelDir of channelDirs) {
    // Try channel.json for channel metadata
    const channelMeta = readJson(files, `messages/${channelDir}/channel.json`) as Record<string, unknown> | null
    const channelId = channelMeta ? String(channelMeta.id ?? channelDir) : channelDir
    const channelName = channelMeta
      ? String(channelMeta.name ?? channelNames.get(channelDir) ?? undefined)
      : channelNames.get(channelDir)

    // Try messages.json first
    const messagesJson = readJson(files, `messages/${channelDir}/messages.json`) as Array<
      Record<string, unknown>
    > | null

    const parsedMessages: ParsedMessage[] = []

    if (messagesJson && Array.isArray(messagesJson)) {
      for (const msg of messagesJson) {
        parsedMessages.push({
          id: String(msg.ID ?? msg.id ?? ''),
          timestamp: String(msg.Timestamp ?? msg.timestamp ?? ''),
          content: String(msg.Contents ?? msg.content ?? ''),
          attachments: String(msg.Attachments ?? msg.attachments ?? ''),
          channelId,
          authorId: msg.Author ? String((msg.Author as Record<string, unknown>).id ?? '') : undefined
        })
      }
    } else {
      // Try messages.csv
      const csvData = files[`messages/${channelDir}/messages.csv`]
      if (csvData) {
        const csvStr = strFromU8(csvData)
        const rows = parseCSV(csvStr)
        for (const row of rows) {
          parsedMessages.push({
            id: row['ID'] ?? row['id'] ?? '',
            timestamp: row['Timestamp'] ?? row['timestamp'] ?? '',
            content: row['Contents'] ?? row['content'] ?? '',
            attachments: row['Attachments'] ?? row['attachments'] ?? '',
            channelId
          })
        }
      }
    }

    if (parsedMessages.length > 0) {
      channels.push({
        channelId,
        channelName: channelName !== 'undefined' ? channelName : undefined,
        messages: parsedMessages
      })
      totalMessages += parsedMessages.length
      channelsFound++
      onUpdate?.(channelsFound, totalMessages)
    }
  }

  return channels
}

/** Simple CSV parser that handles quoted fields */
function parseCSV(csv: string): Array<Record<string, string>> {
  const lines = csv.split('\n')
  if (lines.length < 2) return []

  const headers = parseCSVLine(lines[0])
  const rows: Array<Record<string, string>> = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = parseCSVLine(line)
    const row: Record<string, string> = {}
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? ''
    }
    rows.push(row)
  }

  return rows
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        fields.push(current)
        current = ''
      } else {
        current += ch
      }
    }
  }
  fields.push(current)
  return fields
}
