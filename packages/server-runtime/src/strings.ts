// String table for externalisable user-facing text
export const strings = {
  CONFIG_MISSING_REQUIRED: 'Missing required config field: {field}',
  CONFIG_INVALID_TYPE: 'Invalid type for config field {field}: expected {expected}, got {got}',
  CONFIG_INVALID_PORT: 'Invalid port: must be between 1 and 65535',
  CONFIG_INVALID_LOG_LEVEL: 'Invalid log level: {level}. Must be one of: debug, info, warn, error',
  CONFIG_INVALID_LOG_FORMAT: 'Invalid log format: {format}. Must be one of: json, text',
  SERVER_STARTING: 'Server starting on {host}:{port}',
  SERVER_STARTED: 'Server started successfully',
  SERVER_STOPPING: 'Server shutting down gracefully...',
  SERVER_STOPPED: 'Server stopped',
  SERVER_RELOAD: 'Reloading configuration...',
  SERVER_RELOAD_COMPLETE: 'Configuration reloaded',
  SERVER_CONNECTION_LIMIT: 'Connection rejected: max connections ({max}) reached',
  HEALTH_OK: 'healthy',
  DB_MIGRATION_APPLIED: 'Database migration applied: {name}',
  DB_MIGRATION_FAILED: 'Database migration failed: {name}: {error}',
  RELAY_REGISTERING: 'Registering with relay at {url}',
  RELAY_REGISTERED: 'Registered with relay',
  RELAY_FAILED: 'Relay registration failed: {error}',
  MEDIA_TOO_LARGE: 'File size {size} exceeds maximum {max}',
  TLS_LOADED: 'TLS certificate loaded',
  TLS_FAILED: 'Failed to load TLS certificate: {error}'
} as const

export type StringKey = keyof typeof strings

export function t(key: StringKey, params?: Record<string, string | number>): string {
  let text: string = strings[key]
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, String(v))
    }
  }
  return text
}
