import { sha256 } from '@noble/hashes/sha2.js'

export function computeChecksum(data: Uint8Array): string {
  const hash = sha256(data)
  return 'sha256:' + Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function verifyChecksum(data: Uint8Array, expected: string): boolean {
  return computeChecksum(data) === expected
}
