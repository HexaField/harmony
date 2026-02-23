// YAML/JSON config parsing and validation
import { readFileSync } from 'node:fs'
import yaml from 'js-yaml'
import { t } from './strings.js'

export interface TLSSection {
  cert: string
  key: string
}

export interface ServerSection {
  host: string
  port: number
  tls?: TLSSection
}

export interface StorageSection {
  database: string
  media: string
}

export interface IdentitySection {
  did?: string
  mnemonic?: string
}

export interface FederationSection {
  enabled: boolean
  allowlist?: string[]
}

export interface RelaySection {
  enabled: boolean
  url?: string
  fallback?: boolean
}

export interface ModerationSection {
  rateLimit?: {
    windowMs: number
    maxMessages: number
  }
  raidDetection?: {
    enabled: boolean
    joinThreshold: number
    windowSeconds: number
  }
}

export interface VoiceSection {
  enabled: boolean
  livekit?: {
    host: string
    apiKey: string
    apiSecret: string
  }
}

export interface LoggingSection {
  level: 'debug' | 'info' | 'warn' | 'error'
  format: 'json' | 'text'
  file?: string
}

export interface LimitsSection {
  maxConnections: number
  maxCommunities: number
  maxChannelsPerCommunity: number
  maxMessageSize: number
  mediaMaxSize: number
}

export interface RuntimeConfig {
  server: ServerSection
  storage: StorageSection
  identity: IdentitySection
  federation: FederationSection
  relay: RelaySection
  moderation: ModerationSection
  voice: VoiceSection
  logging: LoggingSection
  limits: LimitsSection
}

const defaults: RuntimeConfig = {
  server: { host: '0.0.0.0', port: 4000 },
  storage: { database: './harmony.db', media: './media' },
  identity: {},
  federation: { enabled: false },
  relay: { enabled: false },
  moderation: {},
  voice: { enabled: false },
  logging: { level: 'info', format: 'json' },
  limits: {
    maxConnections: 1000,
    maxCommunities: 100,
    maxChannelsPerCommunity: 500,
    maxMessageSize: 16384,
    mediaMaxSize: 52428800
  }
}

export function parseConfig(content: string, format: 'yaml' | 'json'): RuntimeConfig {
  const raw =
    format === 'yaml'
      ? (yaml.load(content) as Record<string, unknown>)
      : (JSON.parse(content) as Record<string, unknown>)
  return mergeWithDefaults(raw)
}

function mergeWithDefaults(raw: Record<string, unknown>): RuntimeConfig {
  const config = structuredClone(defaults)

  if (raw.server && typeof raw.server === 'object') {
    const s = raw.server as Record<string, unknown>
    if (typeof s.host === 'string') config.server.host = s.host
    if (typeof s.port === 'number') config.server.port = s.port
    if (s.tls && typeof s.tls === 'object') {
      const tls = s.tls as Record<string, unknown>
      config.server.tls = {
        cert: String(tls.cert ?? ''),
        key: String(tls.key ?? '')
      }
    }
  }

  if (raw.storage && typeof raw.storage === 'object') {
    const s = raw.storage as Record<string, unknown>
    if (typeof s.database === 'string') config.storage.database = s.database
    if (typeof s.media === 'string') config.storage.media = s.media
  }

  if (raw.identity && typeof raw.identity === 'object') {
    const s = raw.identity as Record<string, unknown>
    if (typeof s.did === 'string') config.identity.did = s.did
    if (typeof s.mnemonic === 'string') config.identity.mnemonic = s.mnemonic
  }

  if (raw.federation && typeof raw.federation === 'object') {
    const s = raw.federation as Record<string, unknown>
    if (typeof s.enabled === 'boolean') config.federation.enabled = s.enabled
    if (Array.isArray(s.allowlist)) config.federation.allowlist = s.allowlist.map(String)
  }

  if (raw.relay && typeof raw.relay === 'object') {
    const s = raw.relay as Record<string, unknown>
    if (typeof s.enabled === 'boolean') config.relay.enabled = s.enabled
    if (typeof s.url === 'string') config.relay.url = s.url
    if (typeof s.fallback === 'boolean') config.relay.fallback = s.fallback
  }

  if (raw.moderation && typeof raw.moderation === 'object') {
    const s = raw.moderation as Record<string, unknown>
    if (s.rateLimit && typeof s.rateLimit === 'object') {
      const rl = s.rateLimit as Record<string, unknown>
      config.moderation.rateLimit = {
        windowMs: Number(rl.windowMs ?? 60000),
        maxMessages: Number(rl.maxMessages ?? 30)
      }
    }
    if (s.raidDetection && typeof s.raidDetection === 'object') {
      const rd = s.raidDetection as Record<string, unknown>
      config.moderation.raidDetection = {
        enabled: Boolean(rd.enabled),
        joinThreshold: Number(rd.joinThreshold ?? 10),
        windowSeconds: Number(rd.windowSeconds ?? 30)
      }
    }
  }

  if (raw.voice && typeof raw.voice === 'object') {
    const s = raw.voice as Record<string, unknown>
    if (typeof s.enabled === 'boolean') config.voice.enabled = s.enabled
    if (s.livekit && typeof s.livekit === 'object') {
      const lk = s.livekit as Record<string, unknown>
      config.voice.livekit = {
        host: String(lk.host ?? ''),
        apiKey: String(lk.apiKey ?? ''),
        apiSecret: String(lk.apiSecret ?? '')
      }
    }
  }

  if (raw.logging && typeof raw.logging === 'object') {
    const s = raw.logging as Record<string, unknown>
    if (typeof s.level === 'string' && ['debug', 'info', 'warn', 'error'].includes(s.level)) {
      config.logging.level = s.level as LoggingSection['level']
    }
    if (typeof s.format === 'string' && ['json', 'text'].includes(s.format)) {
      config.logging.format = s.format as LoggingSection['format']
    }
    if (typeof s.file === 'string') config.logging.file = s.file
  }

  if (raw.limits && typeof raw.limits === 'object') {
    const s = raw.limits as Record<string, unknown>
    if (typeof s.maxConnections === 'number') config.limits.maxConnections = s.maxConnections
    if (typeof s.maxCommunities === 'number') config.limits.maxCommunities = s.maxCommunities
    if (typeof s.maxChannelsPerCommunity === 'number') config.limits.maxChannelsPerCommunity = s.maxChannelsPerCommunity
    if (typeof s.maxMessageSize === 'number') config.limits.maxMessageSize = s.maxMessageSize
    if (typeof s.mediaMaxSize === 'number') config.limits.mediaMaxSize = s.mediaMaxSize
  }

  return config
}

export interface ConfigValidationError {
  field: string
  message: string
}

export function validateConfig(config: RuntimeConfig): ConfigValidationError[] {
  const errors: ConfigValidationError[] = []

  if (!config.server) {
    errors.push({ field: 'server', message: t('CONFIG_MISSING_REQUIRED', { field: 'server' }) })
  } else {
    if (config.server.port < 1 || config.server.port > 65535) {
      errors.push({ field: 'server.port', message: t('CONFIG_INVALID_PORT') })
    }
  }

  if (!config.storage) {
    errors.push({ field: 'storage', message: t('CONFIG_MISSING_REQUIRED', { field: 'storage' }) })
  }

  if (config.logging) {
    if (!['debug', 'info', 'warn', 'error'].includes(config.logging.level)) {
      errors.push({ field: 'logging.level', message: t('CONFIG_INVALID_LOG_LEVEL', { level: config.logging.level }) })
    }
    if (!['json', 'text'].includes(config.logging.format)) {
      errors.push({
        field: 'logging.format',
        message: t('CONFIG_INVALID_LOG_FORMAT', { format: config.logging.format })
      })
    }
  }

  return errors
}

export function loadConfig(filePath: string): RuntimeConfig {
  const content = readFileSync(filePath, 'utf-8')
  const format = filePath.endsWith('.json') ? 'json' : 'yaml'
  const config = parseConfig(content, format)
  const errors = validateConfig(config)
  if (errors.length > 0) {
    throw new Error(`Config validation failed: ${errors.map((e) => e.message).join('; ')}`)
  }
  return config
}
