// ── Error Codes ──

export type ErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID'
  | 'ZCAP_INVALID'
  | 'ZCAP_EXPIRED'
  | 'ZCAP_REVOKED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'INTERNAL'

export interface ErrorPayload {
  code: ErrorCode
  message: string
  details?: unknown
}
