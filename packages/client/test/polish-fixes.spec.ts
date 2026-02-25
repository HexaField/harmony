// Tests for client POLISH.md fixes
import { describe, it, expect, vi } from 'vitest'
import { HarmonyClient } from '../src/index.js'

describe('P1 #8 — client.off() method', () => {
  it('off() removes a handler', () => {
    const client = new HarmonyClient()
    const handler = vi.fn()

    client.on('message', handler)
    // Emit — handler should be called
    ;(client as any).emitter.emit('message', { id: '1' })
    expect(handler).toHaveBeenCalledTimes(1)

    // Remove via off
    client.off('message', handler)
    ;(client as any).emitter.emit('message', { id: '2' })
    expect(handler).toHaveBeenCalledTimes(1) // not called again
  })

  it('on() unsubscribe function still works', () => {
    const client = new HarmonyClient()
    const handler = vi.fn()

    const unsub = client.on('message', handler)
    ;(client as any).emitter.emit('message', { id: '1' })
    expect(handler).toHaveBeenCalledTimes(1)

    unsub()
    ;(client as any).emitter.emit('message', { id: '2' })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('off() is safe to call with unknown handler', () => {
    const client = new HarmonyClient()
    const handler = vi.fn()
    // Should not throw
    expect(() => client.off('message', handler)).not.toThrow()
  })
})

describe('P0 #3 — Sync messages also emitted as message events', () => {
  it('sync handler emits both sync and message events', () => {
    const client = new HarmonyClient()
    const syncHandler = vi.fn()
    const messageHandler = vi.fn()

    client.on('sync', syncHandler)
    client.on('message', messageHandler)

    // Simulate a sync response
    ;(client as any).handleServerMessage({
      id: 'sync-1',
      type: 'sync.response',
      timestamp: new Date().toISOString(),
      sender: 'server',
      payload: {
        communityId: 'c1',
        channelId: 'ch1',
        messages: [
          {
            id: 'msg-1',
            type: 'channel.send',
            timestamp: new Date().toISOString(),
            sender: 'did:key:sender1',
            payload: {
              content: { text: 'Hello' },
              clock: { counter: 1, authorDID: 'did:key:sender1' }
            }
          }
        ],
        hasMore: false,
        latestClock: { counter: 1, authorDID: 'did:key:sender1' }
      }
    })

    expect(syncHandler).toHaveBeenCalledTimes(1)
    expect(messageHandler).toHaveBeenCalled()

    // The sync event should contain channel and community info
    const syncEvent = syncHandler.mock.calls[0][0] as any
    expect(syncEvent.communityId).toBe('c1')
    expect(syncEvent.channelId).toBe('ch1')
    expect(syncEvent.messages.length).toBeGreaterThan(0)
  })
})
