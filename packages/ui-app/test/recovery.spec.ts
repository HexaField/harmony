// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createRoot } from 'solid-js'
import { createAppStore } from '../src/store.js'
import { en } from '../src/i18n/strings.js'

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  readyState = MockWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  send(_data: string) {}
  close() {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.()
  }
}
// @ts-ignore
globalThis.WebSocket = MockWebSocket

beforeEach(() => {
  try {
    localStorage.clear()
  } catch {}
})

describe('Recovery — Store', () => {
  it('recoveryStatus starts as null', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.recoveryStatus()).toBeNull()
      dispose()
    })
  })

  it('setRecoveryStatus updates recovery config', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setRecoveryStatus({
        configured: true,
        trustedDIDs: ['did:key:a', 'did:key:b', 'did:key:c'],
        threshold: 2
      })
      const status = store.recoveryStatus()
      expect(status).not.toBeNull()
      expect(status!.configured).toBe(true)
      expect(status!.trustedDIDs).toHaveLength(3)
      expect(status!.threshold).toBe(2)
      dispose()
    })
  })

  it('pendingRecoveryRequests starts empty', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.pendingRecoveryRequests()).toEqual([])
      dispose()
    })
  })

  it('setPendingRecoveryRequests stores requests', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setPendingRecoveryRequests([
        {
          requestId: 'req1',
          claimedDID: 'did:key:lost',
          createdAt: new Date().toISOString(),
          approvalsCount: 1,
          threshold: 2,
          alreadyApproved: false
        }
      ])
      const pending = store.pendingRecoveryRequests()
      expect(pending).toHaveLength(1)
      expect(pending[0].claimedDID).toBe('did:key:lost')
      expect(pending[0].alreadyApproved).toBe(false)
      dispose()
    })
  })

  it('can update approval status in pending requests', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setPendingRecoveryRequests([
        {
          requestId: 'req1',
          claimedDID: 'did:key:lost',
          createdAt: new Date().toISOString(),
          approvalsCount: 0,
          threshold: 2,
          alreadyApproved: false
        }
      ])
      // Simulate approval
      const updated = store
        .pendingRecoveryRequests()
        .map((r) =>
          r.requestId === 'req1' ? { ...r, alreadyApproved: true, approvalsCount: r.approvalsCount + 1 } : r
        )
      store.setPendingRecoveryRequests(updated)
      expect(store.pendingRecoveryRequests()[0].alreadyApproved).toBe(true)
      expect(store.pendingRecoveryRequests()[0].approvalsCount).toBe(1)
      dispose()
    })
  })
})

describe('Recovery — i18n strings', () => {
  it('has all recovery strings', () => {
    expect(en.RECOVERY_NOT_CONFIGURED).toBeDefined()
    expect(en.RECOVERY_SETUP).toBeDefined()
    expect(en.RECOVERY_CONFIGURED).toBeDefined()
    expect(en.RECOVERY_THRESHOLD_SUMMARY).toBeDefined()
    expect(en.RECOVERY_APPROVE).toBeDefined()
    expect(en.RECOVERY_APPROVED).toBeDefined()
    expect(en.RECOVERY_VIA_CONTACTS).toBeDefined()
    expect(en.RECOVERY_VIA_MNEMONIC).toBeDefined()
    expect(en.RECOVERY_ENTER_DID).toBeDefined()
    expect(en.RECOVERY_INITIATE).toBeDefined()
    expect(en.RECOVERY_COMPLETE).toBeDefined()
    expect(en.RECOVERY_PENDING_TITLE).toBeDefined()
  })
})
