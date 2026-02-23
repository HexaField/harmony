// i18n string table — all user-facing text
export const en = {
  // Onboarding
  ONBOARDING_WELCOME: 'Welcome to Harmony',
  ONBOARDING_CREATE_IDENTITY: 'Create your identity',
  ONBOARDING_RECOVER_IDENTITY: 'Recover existing identity',
  ONBOARDING_IMPORT_DISCORD: 'Import from Discord',
  ONBOARDING_MNEMONIC_BACKUP: 'Save your recovery phrase',
  ONBOARDING_MNEMONIC_CONFIRM: 'Confirm your recovery phrase',
  ONBOARDING_LINK_DISCORD: 'Link your Discord account',

  // Community
  COMMUNITY_CREATE: 'Create a community',
  COMMUNITY_JOIN: 'Join a community',
  COMMUNITY_SETTINGS: 'Community settings',
  COMMUNITY_MEMBERS: 'Members',
  COMMUNITY_ROLES: 'Roles',
  COMMUNITY_BOTS: 'Bots',
  COMMUNITY_GOVERNANCE: 'Governance',

  // Channel
  CHANNEL_CREATE: 'Create channel',
  CHANNEL_SETTINGS: 'Channel settings',
  CHANNEL_PINNED: 'Pinned messages',
  CHANNEL_HEADER_TOPIC: 'Topic',

  // Messages
  MESSAGE_PLACEHOLDER: 'Message {channel}',
  MESSAGE_EDIT: 'Edit message',
  MESSAGE_DELETE: 'Delete message',
  MESSAGE_REPLY: 'Reply',
  MESSAGE_THREAD: 'Start thread',
  MESSAGE_REACTIONS: 'Add reaction',

  // Voice
  VOICE_JOIN: 'Join voice',
  VOICE_LEAVE: 'Leave voice',
  VOICE_MUTE: 'Mute',
  VOICE_UNMUTE: 'Unmute',
  VOICE_DEAFEN: 'Deafen',
  VOICE_UNDEAFEN: 'Undeafen',
  VOICE_VIDEO_ON: 'Turn on camera',
  VOICE_VIDEO_OFF: 'Turn off camera',

  // Members
  MEMBER_ONLINE: 'Online',
  MEMBER_OFFLINE: 'Offline',
  MEMBER_PROFILE: 'View profile',

  // DM
  DM_NEW: 'New message',
  DM_EMPTY: 'No direct messages',

  // Settings
  SETTINGS_USER: 'User settings',
  SETTINGS_IDENTITY: 'Identity',
  SETTINGS_CREDENTIALS: 'Credentials',
  SETTINGS_DEVICES: 'Devices',
  SETTINGS_RECOVERY: 'Recovery',
  SETTINGS_APPEARANCE: 'Appearance',
  SETTINGS_NOTIFICATIONS: 'Notifications',
  SETTINGS_NODE: 'Node',
  SETTINGS_THEME_DARK: 'Dark',
  SETTINGS_THEME_LIGHT: 'Light',

  // Friends
  FRIENDS_LIST: 'Friends',
  FRIENDS_REQUESTS: 'Friend requests',
  FRIENDS_FIND: 'Find friends',
  FRIENDS_DISCORD: 'Find Discord friends',

  // Migration
  MIGRATION_TITLE: 'Import from Discord',
  MIGRATION_STEP_TOKEN: 'Enter bot token',
  MIGRATION_STEP_SELECT: 'Select server',
  MIGRATION_STEP_EXPORT: 'Exporting...',
  MIGRATION_STEP_COMPLETE: 'Import complete',
  MIGRATION_CANCEL: 'Cancel',

  // Search
  SEARCH_PLACEHOLDER: 'Search messages...',
  SEARCH_NO_RESULTS: 'No results found',

  // Shared
  OFFLINE_BANNER: 'You are offline',
  RECONNECTING: 'Reconnecting...',
  TYPING_INDICATOR: '{user} is typing...',
  TYPING_MANY: '{count} people are typing...',
  LOADING: 'Loading...',
  ERROR_GENERIC: 'Something went wrong',
  COPY_LINK: 'Copy link',
  COPIED: 'Copied!',

  // Governance
  PROPOSAL_CREATE: 'Create proposal',
  PROPOSAL_VOTE: 'Vote',
  PROPOSAL_TALLY: 'Results',

  // Credentials
  CREDENTIAL_PORTFOLIO: 'Credential portfolio',
  CREDENTIAL_DETAIL: 'Credential details',
  CREDENTIAL_ISSUE: 'Issue credential',

  // Bots
  BOT_STORE: 'Bot store',
  BOT_SETTINGS: 'Bot settings',
  BOT_DASHBOARD: 'Bot dashboard',

  // PWA
  PWA_INSTALL: 'Install Harmony'
} as const

export type StringKey = keyof typeof en
export type StringTable = typeof en

let currentTable: StringTable = en

export function setStringTable(table: StringTable): void {
  currentTable = table
}

export function t(key: StringKey, params?: Record<string, string | number>): string {
  let text: string = currentTable[key]
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, String(v))
    }
  }
  return text
}
