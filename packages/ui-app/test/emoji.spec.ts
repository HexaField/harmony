import { describe, it, expect } from 'vitest'
import { resolveShortcodes } from '../src/components/EmojiPicker.tsx'

describe('resolveShortcodes', () => {
  it('resolves named shortcodes', () => {
    expect(resolveShortcodes('hello :fire: world')).toBe('hello 🔥 world')
    expect(resolveShortcodes(':heart: :rocket:')).toBe('❤️ 🚀')
    expect(resolveShortcodes(':tada:')).toBe('🎉')
  })

  it('leaves unknown shortcodes unchanged', () => {
    expect(resolveShortcodes(':nonexistent:')).toBe(':nonexistent:')
  })

  it('resolves multiple shortcodes in one message', () => {
    expect(resolveShortcodes(':thumbsup: great :fire: work')).toBe('👍 great 🔥 work')
  })

  it('handles empty string', () => {
    expect(resolveShortcodes('')).toBe('')
  })

  it('handles text with no shortcodes', () => {
    expect(resolveShortcodes('just normal text')).toBe('just normal text')
  })

  it('resolves :100: and :star:', () => {
    expect(resolveShortcodes(':100:')).toBe('💯')
    expect(resolveShortcodes(':star:')).toBe('⭐')
  })
})
