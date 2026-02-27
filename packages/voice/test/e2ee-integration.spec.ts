import { describe, it, expect } from 'vitest'
import { E2EEBridge } from '../src/e2ee-bridge.js'
import { createEncryptTransform, createDecryptTransform } from '../src/insertable-streams.js'

describe('E2EE Bridge — Key Derivation + Frame Encryption', () => {
  it('should derive AES-256-GCM key from epoch secret via HKDF', async () => {
    const bridge = new E2EEBridge()
    const secret = crypto.getRandomValues(new Uint8Array(32))
    bridge.setGroupKey(secret, 1)

    const key = await bridge.deriveFrameKey()
    expect(key).toBeTruthy()
    expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 })
    expect(key.usages).toContain('encrypt')
    expect(key.usages).toContain('decrypt')
  })

  it('should encrypt and decrypt a frame roundtrip', async () => {
    const bridge = new E2EEBridge()
    const secret = crypto.getRandomValues(new Uint8Array(32))
    bridge.setGroupKey(secret, 1)

    const plaintext = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const encrypted = await bridge.encryptFrame(plaintext)

    // Encrypted should be longer (IV + ciphertext + tag)
    expect(encrypted.length).toBeGreaterThan(plaintext.length)
    // First 12 bytes are IV
    expect(encrypted.length).toBe(12 + plaintext.length + 16) // IV + data + GCM tag

    const decrypted = await bridge.decryptFrame(encrypted)
    expect(decrypted).toEqual(plaintext)
  })

  it('should fail decryption with wrong key', async () => {
    const bridge1 = new E2EEBridge()
    bridge1.setGroupKey(crypto.getRandomValues(new Uint8Array(32)), 1)

    const bridge2 = new E2EEBridge()
    bridge2.setGroupKey(crypto.getRandomValues(new Uint8Array(32)), 1)

    const plaintext = new Uint8Array([1, 2, 3, 4, 5])
    const encrypted = await bridge1.encryptFrame(plaintext)

    await expect(bridge2.decryptFrame(encrypted)).rejects.toThrow()
  })

  it('should derive same key from same secret deterministically', async () => {
    const secret = crypto.getRandomValues(new Uint8Array(32))

    const bridge1 = new E2EEBridge()
    bridge1.setGroupKey(secret, 1)
    const key1 = await bridge1.deriveFrameKey()

    const bridge2 = new E2EEBridge()
    bridge2.setGroupKey(secret, 1)
    const key2 = await bridge2.deriveFrameKey()

    // Verify by encrypting with one and decrypting with other
    const plaintext = new Uint8Array([42, 43, 44])
    const encrypted = await bridge1.encryptFrame(plaintext, key1)
    const decrypted = await bridge2.decryptFrame(encrypted, key2)
    expect(decrypted).toEqual(plaintext)
  })

  it('should handle epoch change and re-derive key', async () => {
    const bridge = new E2EEBridge()
    const secret1 = crypto.getRandomValues(new Uint8Array(32))
    bridge.setGroupKey(secret1, 1)

    const plaintext = new Uint8Array([1, 2, 3])
    const encrypted1 = await bridge.encryptFrame(plaintext)

    // Epoch change
    const secret2 = crypto.getRandomValues(new Uint8Array(32))
    bridge.onEpochChange(secret2, 2)
    expect(bridge.getCurrentEpoch()).toBe(2)

    // Old encrypted data should fail with new key
    await expect(bridge.decryptFrame(encrypted1)).rejects.toThrow()

    // New encryption should work
    const encrypted2 = await bridge.encryptFrame(plaintext)
    const decrypted = await bridge.decryptFrame(encrypted2)
    expect(decrypted).toEqual(plaintext)
  })

  it('should fire epoch change listener', () => {
    const bridge = new E2EEBridge()
    const epochs: number[] = []
    bridge.addEpochChangeListener((e) => epochs.push(e))

    bridge.onEpochChange(new Uint8Array(32), 1)
    bridge.onEpochChange(new Uint8Array(32), 2)
    expect(epochs).toEqual([1, 2])
  })
})

describe('Insertable Streams Transforms', () => {
  it('should create encrypt transform that passes through without key', async () => {
    const bridge = new E2EEBridge() // no key set
    const transform = createEncryptTransform(bridge, 'audio')

    const writer = transform.writable.getWriter()
    const reader = transform.readable.getReader()

    const frame = new Uint8Array([0xfc, 1, 2, 3, 4]).buffer
    writer.write(frame)

    const { value } = await reader.read()
    expect(new Uint8Array(value!)).toEqual(new Uint8Array(frame))

    writer.close()
  })

  it('should encrypt and decrypt audio frame roundtrip via transforms', async () => {
    const bridge = new E2EEBridge()
    bridge.setGroupKey(crypto.getRandomValues(new Uint8Array(32)), 1)
    // Pre-derive the key so transforms can use it
    await bridge.deriveFrameKey()

    const encTransform = createEncryptTransform(bridge, 'audio')
    const decTransform = createDecryptTransform(bridge, 'audio')

    const encWriter = encTransform.writable.getWriter()
    const encReader = encTransform.readable.getReader()
    const decWriter = decTransform.writable.getWriter()
    const decReader = decTransform.readable.getReader()

    // Audio frame: 1 header byte + payload
    const original = new Uint8Array([0xfc, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
    encWriter.write(original.buffer)

    const { value: encrypted } = await encReader.read()
    expect(encrypted).toBeTruthy()
    const encArr = new Uint8Array(encrypted!)
    // Header byte should be preserved
    expect(encArr[0]).toBe(0xfc)
    // Rest should be different (encrypted)
    expect(encArr.length).toBeGreaterThan(original.length)

    // Decrypt
    decWriter.write(encrypted!)
    const { value: decrypted } = await decReader.read()
    expect(new Uint8Array(decrypted!)).toEqual(original)

    encWriter.close()
    decWriter.close()
  })
})
