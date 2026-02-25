// Tests for protocol POLISH.md fixes
import { describe, it, expect } from 'vitest'
import type { ClientEvent } from '../src/events.js'

describe('P1 #7 — ClientEvent type completeness', () => {
  it('includes community.list', () => {
    const event: ClientEvent = 'community.list'
    expect(event).toBe('community.list')
  })

  it('includes community.member.updated', () => {
    const event: ClientEvent = 'community.member.updated'
    expect(event).toBe('community.member.updated')
  })

  it('includes all connection lifecycle events', () => {
    const events: ClientEvent[] = ['connected', 'disconnected', 'reconnecting']
    expect(events).toHaveLength(3)
  })

  it('includes all DM events', () => {
    const events: ClientEvent[] = ['dm', 'dm.edited', 'dm.deleted']
    expect(events).toHaveLength(3)
  })

  it('includes all role events', () => {
    const events: ClientEvent[] = ['role.created', 'role.updated', 'role.deleted']
    expect(events).toHaveLength(3)
  })

  it('includes sync event', () => {
    const event: ClientEvent = 'sync'
    expect(event).toBe('sync')
  })

  it('includes community.auto-joined', () => {
    const event: ClientEvent = 'community.auto-joined'
    expect(event).toBe('community.auto-joined')
  })
})
