import { describe, it, expect } from 'vitest'
import { E2EEBridge } from '../src/e2ee-bridge.js'
import { createEncryptTransform, createDecryptTransform } from '../src/insertable-streams.js'

describe('E2EEBridge', () => {
  it('should start with no key', () => {
    const bridge = new E2EEBridge()
    expect(bridge.hasKey()).toBe(false)
    expect(bridge.getEncryptionKey()).toBeNull()
    expect(bridge.getCurrentEpoch()).toBe(0)
  })

  it('should set and retrieve group key', () => {
    const bridge = new E2EEBridge()
    const key = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
    bridge.setGroupKey(key, 1)

    expect(bridge.hasKey()).toBe(true)
    expect(bridge.getEncryptionKey()).toBe(key)
    expect(bridge.getCurrentEpoch()).toBe(1)
  })

  it('should derive a CryptoKey via HKDF', async () => {
    const bridge = new E2EEBridge()
    const key = crypto.getRandomValues(new Uint8Array(32))
    bridge.setGroupKey(key, 1)

    const derivedKey = await bridge.deriveFrameKey()
    expect(derivedKey).toBeDefined()
    expect(derivedKey.type).toBe('secret')
    // Should be AES-GCM
    expect((derivedKey.algorithm as AesKeyAlgorithm).name).toBe('AES-GCM')
    expect((derivedKey.algorithm as AesKeyAlgorithm).length).toBe(256)
  })

  it('should cache derived key on subsequent calls', async () => {
    const bridge = new E2EEBridge()
    const key = crypto.getRandomValues(new Uint8Array(32))
    bridge.setGroupKey(key, 1)

    const key1 = await bridge.deriveFrameKey()
    const key2 = await bridge.deriveFrameKey()
    expect(key1).toBe(key2) // same reference
  })

  it('should encrypt and decrypt a frame roundtrip', async () => {
    const bridge = new E2EEBridge()
    const secret = crypto.getRandomValues(new Uint8Array(32))
    bridge.setGroupKey(secret, 1)

    const plaintext = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80])
    const encrypted = await bridge.encryptFrame(plaintext)

    // Encrypted should be larger (12 IV + 16 tag overhead)
    expect(encrypted.length).toBeGreaterThan(plaintext.length)
    // IV is first 12 bytes
    expect(encrypted.length).toBe(12 + plaintext.length + 16)

    const decrypted = await bridge.decryptFrame(encrypted)
    expect(decrypted).toEqual(plaintext)
  })

  it('should fail to decrypt with wrong key', async () => {
    const bridge1 = new E2EEBridge()
    const bridge2 = new E2EEBridge()
    bridge1.setGroupKey(crypto.getRandomValues(new Uint8Array(32)), 1)
    bridge2.setGroupKey(crypto.getRandomValues(new Uint8Array(32)), 1)

    const plaintext = new Uint8Array([1, 2, 3, 4])
    const encrypted = await bridge1.encryptFrame(plaintext)

    await expect(bridge2.decryptFrame(encrypted)).rejects.toThrow()
  })

  it('should handle key rotation via onEpochChange', async () => {
    const bridge = new E2EEBridge()
    const key1 = crypto.getRandomValues(new Uint8Array(32))
    const key2 = crypto.getRandomValues(new Uint8Array(32))

    const epochs: number[] = []
    bridge.addEpochChangeListener((epoch) => epochs.push(epoch))

    bridge.setGroupKey(key1, 1)
    const encrypted = await bridge.encryptFrame(new Uint8Array([1, 2, 3]))

    // Rotate key
    bridge.onEpochChange(key2, 2)
    expect(bridge.getCurrentEpoch()).toBe(2)
    expect(epochs).toEqual([2])

    // Old ciphertext should fail with new key
    await expect(bridge.decryptFrame(encrypted)).rejects.toThrow()

    // New encrypt/decrypt should work
    const encrypted2 = await bridge.encryptFrame(new Uint8Array([4, 5, 6]))
    const decrypted2 = await bridge.decryptFrame(encrypted2)
    expect(decrypted2).toEqual(new Uint8Array([4, 5, 6]))
  })

  it('should throw when deriving key without secret', async () => {
    const bridge = new E2EEBridge()
    await expect(bridge.deriveFrameKey()).rejects.toThrow('No epoch secret available')
  })
})

describe('Insertable Streams Transforms', () => {
  async function pipeThrough(
    transform: TransformStream<ArrayBuffer, ArrayBuffer>,
    input: ArrayBuffer
  ): Promise<ArrayBuffer | null> {
    const reader = transform.readable.getReader()
    const writer = transform.writable.getWriter()

    // Start read before write to avoid backpressure deadlock
    const readPromise = reader.read()
    await writer.write(input)
    writer.close().catch(() => {})

    const { value, done } = await readPromise
    if (done || !value) return null
    return value
  }

  it('should pass through when bridge has no key (encrypt)', async () => {
    const bridge = new E2EEBridge()
    const transform = createEncryptTransform(bridge, 'audio')
    const frame = new Uint8Array([0xa0, 10, 20, 30, 40]).buffer

    const result = await pipeThrough(transform, frame)
    expect(result).toEqual(frame)
  })

  it('should pass through when bridge has no key (decrypt)', async () => {
    const bridge = new E2EEBridge()
    const transform = createDecryptTransform(bridge, 'audio')
    const frame = new Uint8Array([0xa0, 10, 20, 30, 40]).buffer

    const result = await pipeThrough(transform, frame)
    expect(result).toEqual(frame)
  })

  it('should encrypt and decrypt audio frames with header preservation', async () => {
    const bridge = new E2EEBridge()
    bridge.setGroupKey(crypto.getRandomValues(new Uint8Array(32)), 1)

    // Audio: 1 byte header (Opus TOC byte) preserved unencrypted
    const header = 0xfc // Opus TOC byte
    const payload = new Uint8Array([header, 1, 2, 3, 4, 5, 6, 7, 8])
    const frame = payload.buffer

    const encTransform = createEncryptTransform(bridge, 'audio')
    const encrypted = await pipeThrough(encTransform, frame)
    expect(encrypted).not.toBeNull()

    const encBytes = new Uint8Array(encrypted!)
    // First byte (header) should be preserved
    expect(encBytes[0]).toBe(header)
    // Rest should be different (encrypted)
    expect(encBytes.length).toBeGreaterThan(payload.length)

    // Decrypt
    const decTransform = createDecryptTransform(bridge, 'audio')
    const decrypted = await pipeThrough(decTransform, encrypted!)
    expect(new Uint8Array(decrypted!)).toEqual(payload)
  })

  it('should encrypt and decrypt video frames with header preservation', async () => {
    const bridge = new E2EEBridge()
    bridge.setGroupKey(crypto.getRandomValues(new Uint8Array(32)), 1)

    // Video: 10 byte header preserved
    const header = new Uint8Array([0x90, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09])
    const body = new Uint8Array([100, 200, 150, 75, 50])
    const frame = new Uint8Array(header.length + body.length)
    frame.set(header, 0)
    frame.set(body, header.length)

    const encTransform = createEncryptTransform(bridge, 'video')
    const encrypted = await pipeThrough(encTransform, frame.buffer)
    expect(encrypted).not.toBeNull()

    const encBytes = new Uint8Array(encrypted!)
    // First 10 bytes (header) preserved
    expect(encBytes.slice(0, 10)).toEqual(header)

    const decTransform = createDecryptTransform(bridge, 'video')
    const decrypted = await pipeThrough(decTransform, encrypted!)
    expect(new Uint8Array(decrypted!)).toEqual(frame)
  })

  it('should pass through frames too small to encrypt', async () => {
    const bridge = new E2EEBridge()
    bridge.setGroupKey(crypto.getRandomValues(new Uint8Array(32)), 1)

    // Audio header is 1 byte; a 1-byte frame has no payload to encrypt
    const frame = new Uint8Array([0xa0]).buffer
    const encTransform = createEncryptTransform(bridge, 'audio')
    const result = await pipeThrough(encTransform, frame)
    expect(result).toEqual(frame)
  })
})

describe('VoiceClient E2EE integration', () => {
  it('should expose setEncryptionKey and propagate to bridge', async () => {
    const { VoiceClient } = await import('../src/voice-client.js')
    const bridge = new E2EEBridge()
    const client = new VoiceClient({ e2eeBridge: bridge, mode: 'test' })

    const key = crypto.getRandomValues(new Uint8Array(32))
    client.setEncryptionKey(key, 5)

    expect(bridge.getCurrentEpoch()).toBe(5)
    expect(bridge.hasKey()).toBe(true)
    expect(bridge.getEncryptionKey()).toBe(key)
  })

  it('should throw if setEncryptionKey called without bridge', async () => {
    const { VoiceClient } = await import('../src/voice-client.js')
    const client = new VoiceClient({ mode: 'test' })

    expect(() => client.setEncryptionKey(new Uint8Array(32), 1)).toThrow('E2EE bridge not configured')
  })

  it('should expose getE2EEBridge', async () => {
    const { VoiceClient } = await import('../src/voice-client.js')
    const bridge = new E2EEBridge()
    const client = new VoiceClient({ e2eeBridge: bridge, mode: 'test' })
    expect(client.getE2EEBridge()).toBe(bridge)

    const client2 = new VoiceClient({ mode: 'test' })
    expect(client2.getE2EEBridge()).toBeUndefined()
  })
})
