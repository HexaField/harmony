import { describe, it, expect } from 'vitest'
import { VoiceClient, E2EEBridge } from '../src/index.js'
import type { MediaDeviceProvider } from '../src/voice-client.js'

const mockMedia: MediaDeviceProvider = {
  async getUserMedia() {
    return new MediaStream()
  },
  async getDisplayMedia() {
    return new MediaStream()
  }
}

describe('E2EE wiring', () => {
  it('VoiceClient accepts E2EEBridge in options', () => {
    const bridge = new E2EEBridge()
    const client = new VoiceClient({ mediaProvider: mockMedia, e2eeBridge: bridge, mode: 'test' })
    expect(client.getE2EEBridge()).toBe(bridge)
  })

  it('VoiceClient without E2EEBridge returns undefined', () => {
    const client = new VoiceClient({ mediaProvider: mockMedia, mode: 'test' })
    expect(client.getE2EEBridge()).toBeUndefined()
  })

  it('setEncryptionKey delegates to E2EEBridge.onEpochChange', () => {
    const bridge = new E2EEBridge()
    const client = new VoiceClient({ mediaProvider: mockMedia, e2eeBridge: bridge, mode: 'test' })

    const key = new Uint8Array(32).fill(0xab)
    client.setEncryptionKey(key, 5)

    expect(bridge.getCurrentEpoch()).toBe(5)
    expect(bridge.getEncryptionKey()).toEqual(key)
    expect(bridge.hasKey()).toBe(true)
  })

  it('setEncryptionKey throws without E2EEBridge', () => {
    const client = new VoiceClient({ mediaProvider: mockMedia, mode: 'test' })
    const key = new Uint8Array(32)
    expect(() => client.setEncryptionKey(key, 1)).toThrow('E2EE bridge not configured')
  })

  it('epoch rotation updates key and epoch', () => {
    const bridge = new E2EEBridge()
    const client = new VoiceClient({ mediaProvider: mockMedia, e2eeBridge: bridge, mode: 'test' })

    const key1 = new Uint8Array(32).fill(0x01)
    client.setEncryptionKey(key1, 1)
    expect(bridge.getCurrentEpoch()).toBe(1)

    const key2 = new Uint8Array(32).fill(0x02)
    client.setEncryptionKey(key2, 2)
    expect(bridge.getCurrentEpoch()).toBe(2)
    expect(bridge.getEncryptionKey()).toEqual(key2)
  })

  it('E2EEBridge epoch change listener fires on setEncryptionKey', () => {
    const bridge = new E2EEBridge()
    const client = new VoiceClient({ mediaProvider: mockMedia, e2eeBridge: bridge, mode: 'test' })

    const epochs: number[] = []
    bridge.addEpochChangeListener((epoch) => epochs.push(epoch))

    client.setEncryptionKey(new Uint8Array(32), 1)
    client.setEncryptionKey(new Uint8Array(32), 2)
    client.setEncryptionKey(new Uint8Array(32), 3)

    expect(epochs).toEqual([1, 2, 3])
  })

  it('E2EEBridge encrypt/decrypt round-trip works', async () => {
    const bridge = new E2EEBridge()
    const key = new Uint8Array(32).fill(0xca)
    bridge.setGroupKey(key, 1)

    const plaintext = new Uint8Array([1, 2, 3, 4, 5])
    const encrypted = await bridge.encryptFrame(plaintext)
    const decrypted = await bridge.decryptFrame(encrypted)

    expect(decrypted).toEqual(plaintext)
  })
})
