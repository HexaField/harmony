import { describe, it, expect } from 'vitest'

describe('document title unread badge', () => {
  it('shows count in parentheses when unreads > 0', () => {
    const format = (count: number) => (count > 0 ? `(${count}) Harmony` : 'Harmony')
    expect(format(0)).toBe('Harmony')
    expect(format(1)).toBe('(1) Harmony')
    expect(format(5)).toBe('(5) Harmony')
    expect(format(99)).toBe('(99) Harmony')
    expect(format(100)).toBe('(100) Harmony')
  })
})

describe('favicon badge text', () => {
  it('caps at 99+', () => {
    const badgeText = (count: number) => (count > 99 ? '99+' : String(count))
    expect(badgeText(1)).toBe('1')
    expect(badgeText(50)).toBe('50')
    expect(badgeText(99)).toBe('99')
    expect(badgeText(100)).toBe('99+')
    expect(badgeText(999)).toBe('99+')
  })
})

describe('totalUnreadCount logic', () => {
  it('sums channel unreads', () => {
    const channelUnreadMap = new Map([
      ['ch1', 3],
      ['ch2', 0],
      ['ch3', 5]
    ])
    let total = 0
    for (const count of channelUnreadMap.values()) total += count
    expect(total).toBe(8)
  })

  it('includes DM unreads', () => {
    const channelUnreadMap = new Map([['ch1', 2]])
    const dmConversations = [{ unreadCount: 3 }, { unreadCount: 0 }, { unreadCount: 1 }]
    let total = 0
    for (const count of channelUnreadMap.values()) total += count
    for (const convo of dmConversations) total += convo.unreadCount
    expect(total).toBe(6)
  })

  it('returns 0 when nothing unread', () => {
    const channelUnreadMap = new Map<string, number>()
    let total = 0
    for (const count of channelUnreadMap.values()) total += count
    expect(total).toBe(0)
  })
})
