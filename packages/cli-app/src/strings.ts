// String table for CLI
export const strings = {
  IDENTITY_CREATED: 'Identity created: {did}',
  IDENTITY_RECOVERED: 'Identity recovered: {did}',
  IDENTITY_SHOW: 'DID: {did}\nCreated: {created}\nCredentials: {credentials}\nCapabilities: {capabilities}',
  IDENTITY_EXPORTED: 'Identity exported to {file}',
  IDENTITY_IMPORTED: 'Identity imported from {file}',
  IDENTITY_LINK_DISCORD: 'Linking Discord account via OAuth...',
  IDENTITY_RECOVERY_SETUP: 'Setting up social recovery...',
  COMMUNITY_CREATED: 'Community created: {name} ({id})',
  COMMUNITY_LIST_EMPTY: 'No communities found',
  COMMUNITY_JOINED: 'Joined community via invite',
  COMMUNITY_INVITE: 'Invite link: {link}',
  COMMUNITY_EXPORTED: 'Community exported to {file}',
  COMMUNITY_IMPORTED: 'Community imported from {file}',
  CHANNEL_CREATED: 'Channel created: {name} ({id})',
  CHANNEL_DELETED: 'Channel deleted: {name}',
  MESSAGE_SENT: 'Message sent to {channel}',
  HISTORY_EMPTY: 'No messages in {channel}',
  SERVER_STARTED: 'Server started on port {port}',
  SERVER_STOPPED: 'Server stopped',
  SERVER_STATUS: 'Server status: {status}',
  MIGRATE_STARTING: 'Starting Discord migration for guild {guildId}...',
  MIGRATE_COMPLETE: 'Migration complete: {channels} channels, {messages} messages',
  MIGRATE_IMPORT_COMPLETE: 'Import complete from {file}',
  CONFIG_UPDATED: 'Config updated: {key} = {value}',
  CONFIG_SHOW: 'Configuration:',
  FRIENDS_LIST_EMPTY: 'No friends found',
  FRIENDS_FOUND: 'Found {count} Discord friends on Harmony',
  VERSION: 'Harmony CLI v{version}',
  INIT_WELCOME: "Welcome to Harmony! Let's set up your identity.",
  INIT_CREATE_OR_RECOVER: 'Would you like to create a new identity or recover an existing one?',
  INVALID_MNEMONIC: 'Invalid mnemonic phrase',
  MISSING_CONFIG: 'No config found. Run "harmony init" to set up.',
  HELP_AVAILABLE: 'Run "harmony --help" for available commands.',
  ERROR_PREFIX: 'Error: {message}'
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
