// String table for cloud worker
export const strings = {
  IDENTITY_LINKED: 'Identity linked successfully',
  IDENTITY_ALREADY_LINKED_DISCORD: 'Discord ID already linked to a DID',
  IDENTITY_ALREADY_LINKED_DID: 'DID already linked to a Discord account',
  IDENTITY_NOT_FOUND: 'Identity not found',
  EXPORT_UPLOADED: 'Export uploaded successfully',
  EXPORT_NOT_FOUND: 'Export not found',
  EXPORT_DELETED: 'Export deleted',
  INVITE_CREATED: 'Invite created',
  INVITE_NOT_FOUND: 'Invite not found',
  INVITE_EXPIRED: 'Invite has expired',
  INVITE_MAX_USES: 'Invite has reached maximum uses',
  INVITE_REVOKED: 'Invite has been revoked',
  DIRECTORY_REGISTERED: 'Community registered in directory',
  RATE_LIMITED: 'Rate limit exceeded. Try again later.',
  OAUTH_STATE_INVALID: 'Invalid or expired OAuth state',
  OAUTH_STATE_STORED: 'OAuth state stored',
  HEALTH_OK: 'ok',
  CORS_ORIGIN_DENIED: 'Origin not allowed',
  LANDING_TITLE: 'Join {name} on Harmony',
  LANDING_DESCRIPTION: 'A sovereign community platform',
  LANDING_DOWNLOAD: 'Download Harmony',
  LANDING_MEMBERS: '{count} members'
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
