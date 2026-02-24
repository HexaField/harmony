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
  VOICE_CONNECTED: 'Voice Connected',
  VOICE_DISCONNECT: 'Disconnect',
  VOICE_CHANNEL_USERS: '{count} connected',
  VOICE_SPEAKING: 'Speaking',
  VOICE_MIC_ERROR: 'Could not access microphone',
  VOICE_USER_MUTED: 'Muted',

  // Members
  MEMBER_ONLINE: 'Online',
  MEMBER_OFFLINE: 'Offline',
  MEMBER_PROFILE: 'View profile',

  // DM
  DM_NEW: 'New message',
  DM_EMPTY: 'No direct messages',
  DM_SECTION_TITLE: 'Direct Messages',
  DM_SEND_PLACEHOLDER: 'Message {recipient}',
  DM_NEW_TITLE: 'New Direct Message',
  DM_NEW_RECIPIENT_LABEL: 'Recipient DID',
  DM_NEW_RECIPIENT_PLACEHOLDER: 'Enter a DID or select a member',
  DM_NEW_START: 'Start conversation',
  DM_NEW_CANCEL: 'Cancel',
  DM_NEW_INVALID_DID: 'Please enter a valid DID',
  DM_CONVERSATION_EMPTY: 'No messages yet. Say hello!',
  DM_TYPING_SINGLE: '{user} is typing...',
  DM_TYPING_MULTIPLE: '{count} people are typing...',
  DM_BACK_TO_COMMUNITY: 'Back to community',
  DM_UNREAD_COUNT: '{count} unread',
  DM_OR_SELECT_MEMBER: 'Or select a community member:',

  // Onboarding — mnemonic backup
  ONBOARDING_MNEMONIC_WARNING:
    'Write these words down and store them safely. This is the ONLY way to recover your identity.',
  ONBOARDING_MNEMONIC_COPY: 'Copy to clipboard',
  ONBOARDING_MNEMONIC_COPIED: 'Copied!',
  ONBOARDING_MNEMONIC_SAVED: "I've saved my recovery phrase",
  ONBOARDING_MNEMONIC_VERIFY_TITLE: 'Verify your recovery phrase',
  ONBOARDING_MNEMONIC_VERIFY_PROMPT: 'What is word #{position}?',
  ONBOARDING_MNEMONIC_VERIFY: 'Verify',
  ONBOARDING_MNEMONIC_VERIFY_FAIL: 'Some words are incorrect. Please try again.',
  ONBOARDING_MNEMONIC_SKIP: 'Skip verification',
  ONBOARDING_RECOVER_PROMPT: 'Enter your 12-word recovery phrase to restore your identity.',
  ONBOARDING_RECOVER_INVALID: 'Please enter a valid 12-word recovery phrase.',
  ONBOARDING_BACK: '← Back',

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
  SETTINGS_SERVERS: 'Servers',
  SETTINGS_ABOUT: 'About',
  SETTINGS_BACK: '← Back',
  SETTINGS_DID: 'DID',
  SETTINGS_DISPLAY_NAME: 'Display name',
  SETTINGS_DISPLAY_NAME_PLACEHOLDER: 'Enter display name',
  SETTINGS_MNEMONIC: 'Recovery phrase',
  SETTINGS_MNEMONIC_REVEAL: 'Reveal recovery phrase',
  SETTINGS_MNEMONIC_REVEAL_WARNING:
    'Never share your recovery phrase. Anyone with these words can take control of your identity.',
  SETTINGS_MNEMONIC_HIDE: 'Hide',
  SETTINGS_ADD_SERVER: 'Add server',
  SETTINGS_NO_SERVERS: 'No servers connected',
  SETTINGS_VERSION: 'Version',
  SETTINGS_LICENSE: 'License',
  SETTINGS_REPO: 'Repository',

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

  // Empty state
  EMPTY_NO_COMMUNITIES: "You don't have any communities yet",
  EMPTY_GET_STARTED: 'Create or join a community to get started',
  EMPTY_JOIN_COMMUNITY: 'Join a community',
  EMPTY_JOIN_INVITE_PLACEHOLDER: 'Paste an invite link...',
  EMPTY_JOIN_SUBMIT: 'Join',

  // Create community
  CREATE_COMMUNITY_TITLE: 'Create a community',
  CREATE_COMMUNITY_NAME: 'Community name',
  CREATE_COMMUNITY_NAME_PLACEHOLDER: 'My awesome community',
  CREATE_COMMUNITY_DESCRIPTION: 'Description (optional)',
  CREATE_COMMUNITY_DESCRIPTION_PLACEHOLDER: 'What is this community about?',
  CREATE_COMMUNITY_SUBMIT: 'Create',
  CREATE_COMMUNITY_CANCEL: 'Cancel',
  CREATE_COMMUNITY_CREATING: 'Creating...',

  // Connection
  CONNECTION_CONNECTING: 'Connecting to server...',
  CONNECTION_FAILED: 'Failed to connect to server',
  CONNECTION_RETRY: 'Retry',
  CONNECTION_RECONNECT: 'Reconnect',

  // Server
  SERVER_URL_LABEL: 'Server URL',
  SERVER_URL_PLACEHOLDER: 'ws://localhost:4000',
  SERVER_CONNECTED: 'Connected',
  SERVER_CONNECTING: 'Connecting',
  SERVER_DISCONNECTED: 'Disconnected',
  SERVER_ERROR: 'Connection error',
  SERVER_AUTH_FAILED: 'Authentication failed',
  SERVER_AUTH_CREATING_VP: 'Authenticating...',

  // Hosting
  HOSTING_CHOOSE: 'Where should your community live?',
  HOSTING_LOCAL_TITLE: 'This device',
  HOSTING_LOCAL_DESC: 'Run a server on your computer. Free, private, and under your control.',
  HOSTING_CLOUD_TITLE: 'Harmony Cloud',
  HOSTING_CLOUD_DESC: 'Hosted for you. Always online, no setup required.',
  HOSTING_REMOTE_TITLE: 'Existing server',
  HOSTING_REMOTE_DESC: 'Connect to a server you or someone else is already running.',
  HOSTING_REMOTE_URL_REQUIRED: 'Please enter a server URL.',
  HOSTING_CHECKING_SERVER: 'Checking server...',
  HOSTING_STARTING_LOCAL: 'Starting local server...',
  HOSTING_PROVISIONING_CLOUD: 'Setting up your cloud server...',

  // Migration — hosting
  MIGRATION_HOSTING_DESC: 'Your migrated Discord community needs a Harmony server. Choose where to host it.',

  // Roles
  ROLE_MANAGER_TITLE: 'Manage Roles',
  ROLE_CREATE: 'Create Role',
  ROLE_EDIT: 'Edit Role',
  ROLE_DELETE: 'Delete Role',
  ROLE_DELETE_CONFIRM: 'Are you sure you want to delete the role "{name}"?',
  ROLE_NAME: 'Role name',
  ROLE_NAME_PLACEHOLDER: 'New role',
  ROLE_COLOR: 'Color',
  ROLE_PERMISSIONS: 'Permissions',
  ROLE_SAVE: 'Save',
  ROLE_CANCEL: 'Cancel',
  ROLE_MOVE_UP: 'Move up',
  ROLE_MOVE_DOWN: 'Move down',
  ROLE_PERM_SEND_MESSAGES: 'Send Messages',
  ROLE_PERM_MANAGE_CHANNELS: 'Manage Channels',
  ROLE_PERM_MANAGE_ROLES: 'Manage Roles',
  ROLE_PERM_KICK_MEMBERS: 'Kick Members',
  ROLE_PERM_BAN_MEMBERS: 'Ban Members',
  ROLE_PERM_MANAGE_COMMUNITY: 'Manage Community',
  ROLE_ASSIGN: 'Assign role',
  ROLE_REMOVE: 'Remove role',
  ROLE_NO_ROLES: 'No roles defined',
  ROLE_MEMBER_MENU_TITLE: 'Manage Roles for {name}',

  // Channel settings
  CHANNEL_SETTINGS_TITLE: 'Channel Settings',
  CHANNEL_SETTINGS_NAME: 'Channel name',
  CHANNEL_SETTINGS_TOPIC: 'Topic',
  CHANNEL_SETTINGS_TOPIC_PLACEHOLDER: 'Set a topic for this channel',
  CHANNEL_SETTINGS_SAVE: 'Save Changes',
  CHANNEL_SETTINGS_DELETE: 'Delete Channel',
  CHANNEL_SETTINGS_DELETE_CONFIRM: 'Are you sure you want to delete #{name}? This cannot be undone.',
  CHANNEL_SETTINGS_DELETE_YES: 'Delete',
  CHANNEL_SETTINGS_DELETE_NO: 'Cancel',
  CHANNEL_SETTINGS_PERMISSIONS: 'Permission Overrides',
  CHANNEL_SETTINGS_PERM_READ: 'Read',
  CHANNEL_SETTINGS_PERM_SEND: 'Send',
  CHANNEL_SETTINGS_PERM_MANAGE: 'Manage',
  CHANNEL_SETTINGS_NO_ROLES: 'No roles to configure',

  // Delegation
  DELEGATION_TITLE: 'Delegations',
  DELEGATION_CREATE: 'Create Delegation',
  DELEGATION_REVOKE: 'Revoke',
  DELEGATION_MEMBER: 'Delegate to',
  DELEGATION_MEMBER_PLACEHOLDER: 'Select a member',
  DELEGATION_PERMISSIONS: 'Permissions to delegate',
  DELEGATION_EXPIRY: 'Expiry',
  DELEGATION_EXPIRY_NONE: 'No expiry',
  DELEGATION_EXPIRY_1H: '1 hour',
  DELEGATION_EXPIRY_24H: '24 hours',
  DELEGATION_EXPIRY_7D: '7 days',
  DELEGATION_EXPIRY_CUSTOM: 'Custom',
  DELEGATION_CHANNEL_SCOPE: 'Channel scope (optional)',
  DELEGATION_CHANNEL_ALL: 'All channels',
  DELEGATION_SAVE: 'Delegate',
  DELEGATION_CANCEL: 'Cancel',
  DELEGATION_EMPTY: 'No delegations yet',
  DELEGATION_FROM: 'From',
  DELEGATION_TO: 'To',
  DELEGATION_EXPIRES: 'Expires {time}',
  DELEGATION_ACTIVE: 'Active',
  DELEGATION_EXPIRED: 'Expired',

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

  // Invite
  INVITE_GENERATE: 'Generate invite link',
  INVITE_LINK_COPIED: 'Invite link copied!',
  INVITE_JOIN_TITLE: 'Join Community',
  INVITE_JOIN_DESCRIPTION: 'You have been invited to join this community.',
  INVITE_JOIN_CONFIRM: 'Join',
  INVITE_JOIN_CANCEL: 'Cancel',

  // Channel creation
  CHANNEL_CREATE_NAME: 'Channel name',
  CHANNEL_CREATE_NAME_PLACEHOLDER: 'new-channel',
  CHANNEL_CREATE_TYPE: 'Channel type',
  CHANNEL_CREATE_SUBMIT: 'Create Channel',
  CHANNEL_CREATE_CANCEL: 'Cancel',
  CHANNEL_CREATE_ERROR: 'Failed to create channel: {error}',

  // Message actions
  MESSAGE_EDIT_SAVE: 'Save',
  MESSAGE_EDIT_CANCEL: 'Cancel',
  MESSAGE_DELETE_CONFIRM: 'Are you sure you want to delete this message?',
  MESSAGE_DELETE_YES: 'Delete',
  MESSAGE_DELETE_NO: 'Cancel',
  MESSAGE_EDITED_LABEL: '(edited)',

  // Reactions
  REACTION_ADD: 'Add reaction',
  REACTION_PICKER_TITLE: 'Pick a reaction',

  // Typing
  TYPING_SINGLE: '{user} is typing...',
  TYPING_MULTIPLE: '{count} people are typing...',

  // Settings persistence
  SETTINGS_DISPLAY_NAME_SAVED: 'Display name updated',
  SETTINGS_DISPLAY_NAME_SAVE: 'Save',

  // Search
  SEARCH_RESULTS_COUNT: '{count} results found',

  // File upload
  FILE_UPLOAD_BUTTON: 'Attach file',
  FILE_UPLOAD_DROP_ZONE: 'Drop files here to upload',
  FILE_UPLOAD_SIZE_LIMIT: '25MB max file size',
  FILE_UPLOAD_TOO_LARGE: 'File is too large. Maximum size is {maxSize}.',
  FILE_UPLOAD_FAILED: 'Failed to upload file: {error}',
  FILE_UPLOAD_UPLOADING: 'Uploading {filename}...',
  FILE_UPLOAD_PROCESSING: 'Processing...',
  FILE_DOWNLOAD: 'Download',

  // Bots
  BOT_STORE: 'Bot store',
  BOT_SETTINGS: 'Bot settings',
  BOT_DASHBOARD: 'Bot dashboard',

  // PWA
  PWA_INSTALL: 'Install Harmony',

  // Message persistence
  MESSAGES_CONNECTING: 'Messages will appear when connected',
  MESSAGES_LOADING_HISTORY: 'Loading message history...',

  // Join community
  JOIN_COMMUNITY_TITLE: 'Join a community',
  JOIN_COMMUNITY_URL_LABEL: 'Server URL',
  JOIN_COMMUNITY_URL_PLACEHOLDER: 'ws://localhost:4000',
  JOIN_COMMUNITY_CONNECTING: 'Connecting...',
  JOIN_COMMUNITY_JOINING: 'Joining...',
  JOIN_COMMUNITY_CANCEL: 'Cancel',
  JOIN_COMMUNITY_CONNECT: 'Connect',

  // Error messages
  ERROR_CONNECTION_FAILED: 'Could not connect to server at {url}. Check that the server is running.',
  ERROR_AUTH_FAILED: 'Authentication failed. Your identity may not be recognized by this server.',
  ERROR_COMMUNITY_CREATE_FAILED: 'Failed to create community: {error}',
  ERROR_NETWORK_LOST: 'Network connection lost. Reconnecting...',
  ERROR_COMMUNITY_JOIN_FAILED: 'Failed to join community: {error}',

  // Migration wizard
  MIGRATION_INTRO:
    'Bring your Discord community to Harmony. Your history, roles, and members come with you — encrypted and under your control.',
  MIGRATION_OPTION_COMMUNITY: 'Migrate a community',
  MIGRATION_OPTION_COMMUNITY_DESC:
    "Export your Discord server's channels, messages, roles, and members to Harmony. You'll need admin access and a bot token.",
  MIGRATION_START_COMMUNITY: 'Start community migration',
  MIGRATION_OPTION_LINK: 'Link your Discord account',
  MIGRATION_OPTION_LINK_DESC:
    'Connect your Discord identity to your Harmony DID. This lets other communities recognise you when they migrate.',
  MIGRATION_START_LINK: 'Link account',
  MIGRATION_BOT_SETUP_TITLE: 'Set up the migration bot',
  MIGRATION_BOT_SETUP_STEP1_LINK: 'Open the Discord Developer Portal',
  MIGRATION_BOT_SETUP_STEP1_SUFFIX: 'and create a new application.',
  MIGRATION_BOT_SETUP_STEP2: '2. Go to the "Bot" tab and click "Reset Token" to get your bot token. Copy it.',
  MIGRATION_BOT_SETUP_STEP3:
    '3. Enable "Server Members Intent" and "Message Content Intent" under Privileged Gateway Intents, then save.',
  MIGRATION_BOT_SETUP_STEP4:
    '4. Go to "OAuth2" → "URL Generator". First, tick the "bot" scope. In the "Bot Permissions" section that appears below, tick "Read Message History" and "View Channels".',
  MIGRATION_BOT_SETUP_STEP5:
    '5. Copy the generated URL at the bottom and open it in your browser to invite the bot to your server.',
  MIGRATION_BOT_SETUP_STEP6:
    '6. Find your server ID: enable Developer Mode in Discord settings (App Settings → Advanced), then right-click your server name and click "Copy Server ID".',
  MIGRATION_BOT_TOKEN: 'Bot token',
  MIGRATION_BOT_TOKEN_PLACEHOLDER: 'Paste your bot token here',
  MIGRATION_DISCORD_SERVER_ID: 'Discord server ID',
  MIGRATION_DISCORD_SERVER_ID_PLACEHOLDER: 'Right-click server → Copy Server ID',
  MIGRATION_FIELDS_REQUIRED: 'Bot token and server ID are required.',
  MIGRATION_START_EXPORT: 'Start export',
  MIGRATION_EXPORTING: 'Exporting your Discord server...',
  MIGRATION_EXPORTING_DESC:
    "The bot is reading your server's channels, messages, and roles. This may take a few minutes for large servers.",
  MIGRATION_EXPORTING_NOTE: 'The bot runs locally on your machine. Your data never passes through a third party.',
  MIGRATION_IMPORTING: 'Importing into Harmony...',
  MIGRATION_IMPORTING_DESC:
    'Encrypting and importing your community data. Messages are encrypted with your DID keypair.',
  MIGRATION_LINK_TITLE: 'Link your Discord account',
  MIGRATION_LINK_DESC:
    'Connect your Discord identity to your Harmony DID through the portal. This creates a verifiable credential proving the link.',
  MIGRATION_LINK_YOUR_DID: 'Your Harmony DID',
  MIGRATION_LINK_DISCORD_BUTTON: 'Link with Discord',
  MIGRATION_SKIP_LINKING: 'Skip for now',
  MIGRATION_COMPLETE_TITLE: 'Migration complete',
  MIGRATION_COMPLETE_DESC:
    'Your community is ready. Members can link their Discord accounts to claim their Harmony identity.',
  MIGRATION_COMPLETE_CONTINUE: 'Go to your community',

  // Migration phases
  MIGRATION_PHASE_CHANNELS: 'Fetching channels...',
  MIGRATION_PHASE_ROLES: 'Fetching roles...',
  MIGRATION_PHASE_MEMBERS: 'Fetching members...',
  MIGRATION_PHASE_MESSAGES: 'Exporting #{channelName} ({current} of {total} channels)...',
  MIGRATION_PHASE_ENCRYPTING: 'Encrypting export...',
  MIGRATION_PHASE_IMPORTING: 'Creating community...',
  MIGRATION_EXPORT_ERROR: 'Export failed: {error}',
  MIGRATION_EXPORT_RETRY: 'Retry export',
  MIGRATION_IMPORT_SUCCESS: 'Community imported successfully!'
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
