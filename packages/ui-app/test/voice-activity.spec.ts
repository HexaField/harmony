// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createRoot } from 'solid-js'
import { createAppStore } from '../src/store.js'
import { VoiceManager } from '../src/voice.js'
import { t } from '../src/i18n/strings.js'

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
  } catch {
    /* ignore */
  }
})

describe('Speaking State in Store', () => {
  it('initializes with empty speaking set', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.speakingUsers().size).toBe(0)
      dispose()
    })
  })

  it('adds a speaking user', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setSpeaking('did:key:abc', true)
      expect(store.speakingUsers().has('did:key:abc')).toBe(true)
      dispose()
    })
  })

  it('removes a speaking user', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setSpeaking('did:key:abc', true)
      store.setSpeaking('did:key:abc', false)
      expect(store.speakingUsers().has('did:key:abc')).toBe(false)
      expect(store.speakingUsers().size).toBe(0)
      dispose()
    })
  })

  it('tracks multiple speaking users', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setSpeaking('did:key:abc', true)
      store.setSpeaking('did:key:def', true)
      expect(store.speakingUsers().size).toBe(2)
      store.setSpeaking('did:key:abc', false)
      expect(store.speakingUsers().size).toBe(1)
      expect(store.speakingUsers().has('did:key:def')).toBe(true)
      dispose()
    })
  })

  it('mute/deafen state is independent of speaking state', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setSpeaking('did:key:abc', true)
      store.setMuted(true)
      // Speaking state is managed by VoiceManager, not automatically cleared by store
      expect(store.speakingUsers().has('did:key:abc')).toBe(true)
      expect(store.isMuted()).toBe(true)
      dispose()
    })
  })
})

describe('VoiceManager', () => {
  it('can be instantiated', () => {
    const cb = vi.fn()
    const vm = new VoiceManager('did:key:local', cb)
    expect(vm).toBeDefined()
    vm.destroy()
  })

  it('destroy clears speaking state via callback', () => {
    const cb = vi.fn()
    const vm = new VoiceManager('did:key:local', cb)
    vm.destroy()
    expect(cb).toHaveBeenCalledWith('did:key:local', false)
  })

  it('setMuted calls speaking callback with false when muting', () => {
    const cb = vi.fn()
    const vm = new VoiceManager('did:key:local', cb)
    vm.setMuted(true)
    expect(cb).toHaveBeenCalledWith('did:key:local', false)
    vm.destroy()
  })

  it('start returns false when getUserMedia is unavailable', async () => {
    const cb = vi.fn()
    const vm = new VoiceManager('did:key:local', cb)
    // jsdom has no navigator.mediaDevices.getUserMedia
    const result = await vm.start()
    expect(result).toBe(false)
    vm.destroy()
  })

  it.todo('start acquires mic and sets up AnalyserNode — requires browser APIs', () => {
    // Would test actual getUserMedia + AudioContext + AnalyserNode
  })

  it.todo('addRemoteStream sets up remote speaking detection — requires Web Audio API', () => {
    // Would test AnalyserNode on remote streams
  })

  it.todo('setDeafened suspends/resumes AudioContext — requires Web Audio API', () => {
    // Would test AudioContext suspend/resume
  })
})

describe('Voice Activity i18n strings', () => {
  it('has speaking-related strings', () => {
    expect(t('VOICE_SPEAKING')).toBe('Speaking')
    expect(t('VOICE_MIC_ERROR')).toBe('Could not access microphone')
    expect(t('VOICE_USER_MUTED')).toBe('Muted')
  })
})
