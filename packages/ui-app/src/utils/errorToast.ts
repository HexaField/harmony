import { addToast } from '../components/Shared/index.js'

/**
 * Classifies an error and shows an appropriate toast.
 * Returns the toast type string for testing.
 */
export function showErrorToast(err: unknown, context?: string): string {
  const error = normaliseError(err)

  if (isRateLimited(error)) {
    const retryAfter = error.retryAfter ? ` Try again in ${error.retryAfter}s.` : ''
    addToast({ message: `Slow down! You're sending messages too fast.${retryAfter}`, type: 'info', duration: 5000 })
    return 'rate-limited'
  }

  if (isPermissionDenied(error)) {
    addToast({ message: "You don't have permission to do that.", type: 'error' })
    return 'permission-denied'
  }

  if (isConnectionLost(error)) {
    addToast({ message: 'Connection lost. Reconnecting...', type: 'info', duration: 5000 })
    return 'connection-lost'
  }

  if (isUploadError(error, context)) {
    addToast({ message: 'Upload failed. Please try again.', type: 'error' })
    return 'upload-failed'
  }

  // Generic server error
  addToast({ message: 'Something went wrong. Please try again.', type: 'error' })
  return 'server-error'
}

interface NormalisedError {
  code?: string
  message?: string
  status?: number
  retryAfter?: number
}

function normaliseError(err: unknown): NormalisedError {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>
    return {
      code: (e.code as string) ?? undefined,
      message: (e.message as string) ?? String(err),
      status: (e.status as number) ?? (e.statusCode as number) ?? undefined,
      retryAfter: (e.retryAfter as number) ?? undefined
    }
  }
  return { message: String(err) }
}

function isRateLimited(e: NormalisedError): boolean {
  return (
    e.code === 'RATE_LIMITED' ||
    e.code === 'SLOW_MODE' ||
    e.status === 429 ||
    /rate.?limit/i.test(e.message ?? '') ||
    /slow.?mode/i.test(e.message ?? '')
  )
}

function isPermissionDenied(e: NormalisedError): boolean {
  return (
    e.code === 'PERMISSION_DENIED' ||
    e.code === 'FORBIDDEN' ||
    e.status === 403 ||
    /permission/i.test(e.message ?? '') ||
    /forbidden/i.test(e.message ?? '')
  )
}

function isConnectionLost(e: NormalisedError): boolean {
  return (
    e.code === 'ECONNREFUSED' ||
    e.code === 'ECONNRESET' ||
    e.code === 'NETWORK_ERROR' ||
    /connection.?(lost|closed|reset|refused)/i.test(e.message ?? '') ||
    /network/i.test(e.message ?? '')
  )
}

function isUploadError(e: NormalisedError, context?: string): boolean {
  return context === 'upload' || /upload/i.test(e.message ?? '')
}

/**
 * Show connection state changes as toasts.
 * Call this in a createEffect watching connectionState.
 */
export function showConnectionToast(state: 'connected' | 'disconnected' | 'reconnecting', prevState?: string) {
  if (state === 'disconnected' && prevState !== 'disconnected') {
    addToast({ message: 'Connection lost. Reconnecting...', type: 'info', duration: 0 })
  } else if (state === 'reconnecting') {
    // Already shown by the banner, but we add a toast too
    addToast({ message: 'Reconnecting to server...', type: 'info', duration: 5000 })
  } else if (state === 'connected' && prevState && prevState !== 'connected') {
    addToast({ message: 'Connected!', type: 'success', duration: 2000 })
  }
}
