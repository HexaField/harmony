import { describe, it, expect } from 'vitest'
import { IdentityManager } from '../src/index.js'
import { createCryptoProvider } from '@harmony/crypto'

const crypto = createCryptoProvider()

describe('deterministic encryption key from mnemonic', () => {
  it('create() returns encryptionKeyPair', async () => {
    const mgr = new IdentityManager(crypto)
    const result = await mgr.create()
    expect(result.encryptionKeyPair).toBeDefined()
    expect(result.encryptionKeyPair.type).toBe('X25519')
    expect(result.encryptionKeyPair.publicKey).toBeInstanceOf(Uint8Array)
    expect(result.encryptionKeyPair.secretKey).toBeInstanceOf(Uint8Array)
  })

  it('createFromMnemonic() produces same encryption key as create()', async () => {
    const mgr = new IdentityManager(crypto)
    const { mnemonic, encryptionKeyPair: enc1 } = await mgr.create()
    const { encryptionKeyPair: enc2 } = await mgr.createFromMnemonic(mnemonic)
    expect(Array.from(enc1.publicKey)).toEqual(Array.from(enc2.publicKey))
    expect(Array.from(enc1.secretKey)).toEqual(Array.from(enc2.secretKey))
  })

  it('different mnemonics produce different encryption keys', async () => {
    const mgr = new IdentityManager(crypto)
    const r1 = await mgr.create()
    const r2 = await mgr.create()
    expect(Array.from(r1.encryptionKeyPair.publicKey)).not.toEqual(Array.from(r2.encryptionKeyPair.publicKey))
  })
})
