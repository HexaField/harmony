import { describe, it, expect } from 'vitest'

/**
 * Tests for sync response message content parsing.
 * The client must handle multiple content formats from the server:
 * 1. Bare string content (migration-imported messages)
 * 2. Object with {text} (normal messages)
 * 3. Object with {ciphertext} (E2EE messages)
 */

// Simulate the content extraction logic from HarmonyClient.handleSyncResponse
function extractText(payload: Record<string, unknown>): string {
  let text = '[synced]'
  if (typeof payload?.content === 'string') {
    text = payload.content
  } else if (payload?.content) {
    const c = payload.content as Record<string, unknown>
    if (typeof c.text === 'string') {
      text = c.text
    } else if (c.ciphertext) {
      const ct = c.ciphertext
      if (ct instanceof Uint8Array) {
        text = new TextDecoder().decode(ct)
      } else if (typeof ct === 'object' && ct !== null) {
        const keys = Object.keys(ct as Record<string, number>).sort((a, b) => Number(a) - Number(b))
        const bytes = new Uint8Array(keys.map((k) => (ct as Record<string, number>)[k]))
        text = new TextDecoder().decode(bytes)
      }
    }
  }
  return text
}

describe('Sync message content extraction', () => {
  it('extracts bare string content (migration format)', () => {
    expect(extractText({ content: 'Hello from Discord!' })).toBe('Hello from Discord!')
  })

  it('extracts {text} object content (normal messages)', () => {
    expect(extractText({ content: { text: 'Hello from Harmony!' } })).toBe('Hello from Harmony!')
  })

  it('extracts ciphertext Uint8Array', () => {
    const bytes = new TextEncoder().encode('encrypted message')
    expect(extractText({ content: { ciphertext: bytes } })).toBe('encrypted message')
  })

  it('extracts serialized ciphertext object', () => {
    const text = 'secret'
    const bytes = new TextEncoder().encode(text)
    const serialized: Record<string, number> = {}
    for (let i = 0; i < bytes.length; i++) serialized[String(i)] = bytes[i]
    expect(extractText({ content: { ciphertext: serialized } })).toBe('secret')
  })

  it('returns [synced] for null content', () => {
    expect(extractText({ content: null })).toBe('[synced]')
  })

  it('returns [synced] for missing content', () => {
    expect(extractText({})).toBe('[synced]')
  })

  it('returns [synced] for empty object content', () => {
    expect(extractText({ content: {} })).toBe('[synced]')
  })

  it('handles empty string content', () => {
    expect(extractText({ content: '' })).toBe('')
  })

  it('handles multiline message content', () => {
    const multiline = 'line 1\nline 2\nline 3'
    expect(extractText({ content: multiline })).toBe(multiline)
  })

  it('handles unicode content', () => {
    expect(extractText({ content: '你好世界 🌍' })).toBe('你好世界 🌍')
  })

  it('handles content with special characters', () => {
    expect(extractText({ content: '<script>alert("xss")</script>' })).toBe('<script>alert("xss")</script>')
  })
})
