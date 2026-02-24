// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createRoot } from 'solid-js'
import { createAppStore } from '../src/store.js'
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

describe('Voice Store', () => {
  it('initializes with no voice channel', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.voiceChannelId()).toBeNull()
      expect(store.voiceUsers()).toEqual([])
      expect(store.isMuted()).toBe(false)
      expect(store.isDeafened()).toBe(false)
      dispose()
    })
  })

  it('can join a voice channel', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setVoiceChannelId('voice-1')
      expect(store.voiceChannelId()).toBe('voice-1')
      dispose()
    })
  })

  it('can leave a voice channel', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setVoiceChannelId('voice-1')
      store.setVoiceUsers(['did:key:abc', 'did:key:def'])
      store.setVoiceChannelId(null)
      expect(store.voiceChannelId()).toBeNull()
      dispose()
    })
  })

  it('tracks voice users', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      store.setVoiceUsers(['did:key:abc', 'did:key:def'])
      expect(store.voiceUsers()).toEqual(['did:key:abc', 'did:key:def'])
      dispose()
    })
  })

  it('can toggle mute', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.isMuted()).toBe(false)
      store.setMuted(true)
      expect(store.isMuted()).toBe(true)
      store.setMuted(false)
      expect(store.isMuted()).toBe(false)
      dispose()
    })
  })

  it('can toggle deafen', () => {
    createRoot((dispose) => {
      const store = createAppStore()
      expect(store.isDeafened()).toBe(false)
      store.setDeafened(true)
      expect(store.isDeafened()).toBe(true)
      store.setDeafened(false)
      expect(store.isDeafened()).toBe(false)
      dispose()
    })
  })
})

describe('Voice i18n strings', () => {
  it('has all voice-related strings', () => {
    expect(t('VOICE_JOIN')).toBe('Join voice')
    expect(t('VOICE_LEAVE')).toBe('Leave voice')
    expect(t('VOICE_MUTE')).toBe('Mute')
    expect(t('VOICE_UNMUTE')).toBe('Unmute')
    expect(t('VOICE_DEAFEN')).toBe('Deafen')
    expect(t('VOICE_UNDEAFEN')).toBe('Undeafen')
    expect(t('VOICE_CONNECTED')).toBe('Voice Connected')
    expect(t('VOICE_DISCONNECT')).toBe('Disconnect')
    expect(t('VOICE_CHANNEL_USERS', { count: 3 })).toBe('3 connected')
  })
})

describe('Voice WebRTC', () => {
  it.skip('getUserMedia requires browser environment — cannot test in jsdom', () => {
    // Would test: joining voice channel triggers navigator.mediaDevices.getUserMedia
  })

  it.skip('RTCPeerConnection requires browser environment — cannot test in jsdom', () => {
    // Would test: creating peer connections for each participant
    // and exchanging offers/answers/ICE candidates
  })

  it.skip('AnalyserNode speaking detection requires Web Audio API — cannot test in jsdom', () => {
    // Would test: audio level detection via AnalyserNode for speaking indicators
  })
})
