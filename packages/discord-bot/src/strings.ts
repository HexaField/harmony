export const strings = {
  SETUP_CONFIGURED: 'Harmony configured for this server',
  SETUP_REQUIRES_ADMIN: 'This command requires Administrator permission',
  EXPORT_STARTING: 'Starting export of {guild}...',
  EXPORT_PROGRESS: 'Exporting {channel}... {current}/{total} messages',
  EXPORT_COMPLETE: 'Export complete. {channels} channels, {messages} messages.',
  EXPORT_EMPTY: 'Server has no messages to export',
  EXPORT_ENCRYPT_UPLOAD: 'Encrypting and uploading...',
  EXPORT_DM_TOKENS: 'DMing identity linking tokens to {count} members',
  EXPORT_IN_PROGRESS: 'An export is already in progress',
  MIGRATE_STARTING: 'Starting migration of {guild}...',
  MIGRATE_STRUCTURE: 'Migrating server structure...',
  MIGRATE_HASHING: 'Building message hash index... {current}/{total} channels',
  MIGRATE_UPLOADING: 'Uploading hash index to Harmony...',
  MIGRATE_COMPLETE:
    'Migration complete! {channels} channels, {hashCount} message hashes indexed. Members can now claim their messages by uploading their Discord data export.',
  MIGRATE_IN_PROGRESS: 'A migration is already in progress',
  MIGRATE_ANNOUNCE:
    '🎉 This server has been migrated to Harmony! To claim your messages:\n1. Request your Discord data export (Settings → Privacy → Request All Data)\n2. Upload the ZIP to Harmony\n3. Your verified messages will be attributed to your identity',
  EXPORT_STATUS: 'Export progress: {percent}% — {channel}',
  LINK_DM: 'Link your Discord account to Harmony: {url}',
  LINK_ALREADY: 'Already linked to {did}',
  IDENTITY_SHOW: 'Your Harmony identity: {did}',
  IDENTITY_NOT_LINKED: 'Not linked yet. Use /harmony link to connect your Harmony identity.',
  INFO_DESCRIPTION: 'Harmony — Sovereign Community Platform',
  INFO_INVITE: 'Join: {link}',
  BOT_RECONNECTING: 'Reconnecting to Discord gateway...',
  BOT_RECONNECTED: 'Reconnected successfully',
  RATE_LIMIT_HIT: 'Rate limited by Discord. Waiting {ms}ms...',
  COMMANDS_REGISTERED: 'Slash commands registered'
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
