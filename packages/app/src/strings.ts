export const strings = {
  APP_LAUNCHING: 'Starting Harmony...',
  APP_STARTED: 'Harmony is running',
  APP_STOPPING: 'Shutting down...',
  APP_STOPPED: 'Harmony has stopped',
  APP_SERVER_CRASHED: 'Server crashed. Restarting...',
  APP_SERVER_RESTARTED: 'Server restarted successfully',
  TRAY_OPEN: 'Open Harmony',
  TRAY_QUIT: 'Quit',
  TRAY_STATUS_ONLINE: 'Online — {members} connected',
  TRAY_STATUS_OFFLINE: 'Offline',
  TRAY_COPY_INVITE: 'Copy invite link',
  DEEP_LINK_JOIN: 'Joining community...',
  UPDATE_AVAILABLE: 'Update available: v{version}',
  UPDATE_DOWNLOADING: 'Downloading update...',
  UPDATE_READY: 'Update ready. Restart to apply.',
  FIRST_RUN_WELCOME: 'Welcome to Harmony',
  FIRST_RUN_CREATE: 'Create your identity',
  FIRST_RUN_RECOVER: 'Recover existing identity',
  FIRST_RUN_IMPORT: 'Import from Discord',
  MIGRATION_START: "Let's bring your Discord community to Harmony",
  MIGRATION_TOKEN: 'Create a Discord bot for the migration',
  MIGRATION_INVITE_BOT: 'Invite the bot to your server',
  MIGRATION_SELECT: 'Select a server to export',
  MIGRATION_EXPORTING: 'Exporting...',
  MIGRATION_COMPLETE: 'Export complete',
  MIGRATION_SHARE: 'Share this invite link with your community members',
  MIGRATION_CANCEL: 'Cancel',
  MIGRATION_CANCELLED: 'Migration cancelled',
  OFFLINE_MODE: 'Working offline — changes will sync when connected',
  RECONNECTING: 'Reconnecting...',
  RECONNECTED: 'Connected',
  FILE_DROP: 'Drop file to upload',
  VOICE_CONNECTING: 'Connecting to voice...',
  VOICE_CONNECTED: 'Connected to voice',
  DATA_DIR_MAC: '~/Library/Application Support/Harmony/',
  DATA_DIR_WIN: '%APPDATA%\\Harmony\\',
  DATA_DIR_LINUX: '~/.local/share/harmony/'
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
