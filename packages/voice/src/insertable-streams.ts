/**
 * Insertable Streams — RTCRtpScriptTransform encrypt/decrypt for E2EE voice.
 *
 * In browsers with Insertable Streams API support, this creates transform
 * functions that encrypt outgoing and decrypt incoming media frames.
 *
 * For non-browser environments (tests, Node.js), provides graceful degradation.
 */

import type { E2EEBridge } from './e2ee-bridge.js'

/** Header bytes to skip (not encrypted) — allows SFU to route by RTP header */
const UNENCRYPTED_HEADER_BYTES = {
  audio: 1, // Opus TOC byte
  video: 10 // VP8 payload descriptor (variable, 10 is safe max)
}

export interface FrameTransform {
  readable: ReadableStream
  writable: WritableStream
}

/**
 * Creates a sender (encrypt) transform for Insertable Streams.
 * Preserves the first N header bytes unencrypted so the SFU can route.
 */
export function createEncryptTransform(
  bridge: E2EEBridge,
  kind: 'audio' | 'video'
): TransformStream<ArrayBuffer, ArrayBuffer> {
  const headerSize = UNENCRYPTED_HEADER_BYTES[kind]

  return new TransformStream({
    async transform(frame: ArrayBuffer, controller) {
      if (!bridge.hasKey()) {
        controller.enqueue(frame)
        return
      }

      try {
        const data = new Uint8Array(frame)
        if (data.length <= headerSize) {
          controller.enqueue(frame)
          return
        }

        const header = data.slice(0, headerSize)
        const payload = data.slice(headerSize)
        const encrypted = await bridge.encryptFrame(payload)

        const result = new Uint8Array(headerSize + encrypted.length)
        result.set(header, 0)
        result.set(encrypted, headerSize)
        controller.enqueue(result.buffer)
      } catch {
        // On encryption failure, pass through unencrypted (graceful degradation)
        controller.enqueue(frame)
      }
    }
  })
}

/**
 * Creates a receiver (decrypt) transform for Insertable Streams.
 */
export function createDecryptTransform(
  bridge: E2EEBridge,
  kind: 'audio' | 'video'
): TransformStream<ArrayBuffer, ArrayBuffer> {
  const headerSize = UNENCRYPTED_HEADER_BYTES[kind]

  return new TransformStream({
    async transform(frame: ArrayBuffer, controller) {
      if (!bridge.hasKey()) {
        controller.enqueue(frame)
        return
      }

      try {
        const data = new Uint8Array(frame)
        if (data.length <= headerSize + 12) {
          // Too small to be encrypted (header + IV minimum)
          controller.enqueue(frame)
          return
        }

        const header = data.slice(0, headerSize)
        const encryptedPayload = data.slice(headerSize)
        const decrypted = await bridge.decryptFrame(encryptedPayload)

        const result = new Uint8Array(headerSize + decrypted.length)
        result.set(header, 0)
        result.set(decrypted, headerSize)
        controller.enqueue(result.buffer)
      } catch {
        // On decryption failure (key mismatch during ratchet), drop frame
        // The UI should show "reconnecting encryption..." indicator
      }
    }
  })
}
