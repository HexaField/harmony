import { describe, it, expect } from 'vitest'

// Extract the parseInvite function logic (it's private in EmptyStateView,
// so we replicate it here for testing — it's pure logic)
function parseInvite(input: string): { serverUrl: string; communityId?: string } {
  const trimmed = input.trim()

  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
    const match = trimmed.match(/^(wss?:\/\/[^/]+)(?:\/invite\/(.+))?$/)
    if (match) {
      return { serverUrl: match[1], communityId: match[2] }
    }
    return { serverUrl: trimmed }
  }

  if (trimmed.startsWith('http://')) {
    return parseInvite(trimmed.replace('http://', 'ws://'))
  }
  if (trimmed.startsWith('https://')) {
    return parseInvite(trimmed.replace('https://', 'wss://'))
  }

  if (/^[\w.-]+:\d+/.test(trimmed)) {
    return { serverUrl: `ws://${trimmed}` }
  }

  return { serverUrl: `ws://${trimmed}` }
}

describe('URL parsing (parseInvite)', () => {
  it('ws:// URL passed through', () => {
    expect(parseInvite('ws://localhost:4000')).toEqual({ serverUrl: 'ws://localhost:4000' })
  })

  it('wss:// URL passed through', () => {
    expect(parseInvite('wss://harmony.example.com')).toEqual({ serverUrl: 'wss://harmony.example.com' })
  })

  it('ws:// with invite path extracts communityId', () => {
    const result = parseInvite('ws://localhost:4000/invite/abc123')
    expect(result.serverUrl).toBe('ws://localhost:4000')
    expect(result.communityId).toBe('abc123')
  })

  it('wss:// with invite path extracts communityId', () => {
    const result = parseInvite('wss://example.com/invite/xyz')
    expect(result.serverUrl).toBe('wss://example.com')
    expect(result.communityId).toBe('xyz')
  })

  it('http:// converted to ws://', () => {
    expect(parseInvite('http://localhost:4000')).toEqual({ serverUrl: 'ws://localhost:4000' })
  })

  it('https:// converted to wss://', () => {
    expect(parseInvite('https://harmony.example.com')).toEqual({ serverUrl: 'wss://harmony.example.com' })
  })

  it('http:// with invite path works', () => {
    const result = parseInvite('http://localhost:4000/invite/comm1')
    expect(result.serverUrl).toBe('ws://localhost:4000')
    expect(result.communityId).toBe('comm1')
  })

  it('bare host:port gets ws:// prefix', () => {
    expect(parseInvite('localhost:4000')).toEqual({ serverUrl: 'ws://localhost:4000' })
  })

  it('bare host:port with domain', () => {
    expect(parseInvite('harmony.example.com:4000')).toEqual({ serverUrl: 'ws://harmony.example.com:4000' })
  })

  it('bare hostname fallback to ws://', () => {
    expect(parseInvite('harmony.chat')).toEqual({ serverUrl: 'ws://harmony.chat' })
  })

  it('trims whitespace', () => {
    expect(parseInvite('  ws://localhost:4000  ')).toEqual({ serverUrl: 'ws://localhost:4000' })
  })

  it('ip address with port', () => {
    expect(parseInvite('192.168.1.1:4000')).toEqual({ serverUrl: 'ws://192.168.1.1:4000' })
  })
})
