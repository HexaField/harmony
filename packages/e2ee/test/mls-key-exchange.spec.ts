/**
 * MLS Key Exchange — Comprehensive tests for the full key exchange lifecycle.
 * Tests: group creation, key package generation/verification, member addition,
 * Welcome processing, encryption/decryption across members, epoch advancement,
 * member removal, concurrent operations, re-keying, and state serialization.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createCryptoProvider, type KeyPair } from '@harmony/crypto'
import { SimplifiedMLSProvider, verifyKeyPackageSignature } from '../src/mls.js'
import type { MLSGroup, KeyPackage, MLSProvider } from '../src/keypackage.js'

const crypto = createCryptoProvider()

describe('MLS Key Exchange — Full Lifecycle', () => {
  let mlsProvider: MLSProvider
  let aliceSig: KeyPair, aliceEnc: KeyPair
  let bobSig: KeyPair, bobEnc: KeyPair
  let carolSig: KeyPair, carolEnc: KeyPair

  beforeEach(async () => {
    mlsProvider = new SimplifiedMLSProvider()
    aliceSig = await crypto.generateSigningKeyPair()
    aliceEnc = await crypto.generateEncryptionKeyPair()
    bobSig = await crypto.generateSigningKeyPair()
    bobEnc = await crypto.generateEncryptionKeyPair()
    carolSig = await crypto.generateSigningKeyPair()
    carolEnc = await crypto.generateEncryptionKeyPair()
  })

  // ── Group Creation ──

  describe('Group Creation', () => {
    it('creates a group with creator as sole member', async () => {
      const group = await mlsProvider.createGroup({
        groupId: 'test:group:1',
        creatorDID: 'did:key:alice',
        creatorKeyPair: aliceSig,
        creatorEncryptionKeyPair: aliceEnc
      })
      expect(group.groupId).toBe('test:group:1')
      expect(group.epoch).toBe(0)
      expect(group.memberCount()).toBe(1)
      expect(group.myLeafIndex).toBe(0)
      expect(group.members()[0].did).toBe('did:key:alice')
    })

    it('creator can encrypt/decrypt own messages', async () => {
      const group = await mlsProvider.createGroup({
        groupId: 'test:group:solo',
        creatorDID: 'did:key:alice',
        creatorKeyPair: aliceSig,
        creatorEncryptionKeyPair: aliceEnc
      })
      const plaintext = new TextEncoder().encode('hello self')
      const ct = await group.encrypt(plaintext)
      expect(ct.epoch).toBe(0)
      expect(ct.senderIndex).toBe(0)
      const { plaintext: decrypted } = await group.decrypt(ct)
      expect(new TextDecoder().decode(decrypted)).toBe('hello self')
    })

    it('different groups have different epoch secrets (different ciphertexts)', async () => {
      const g1 = await mlsProvider.createGroup({
        groupId: 'test:group:a',
        creatorDID: 'did:key:alice',
        creatorKeyPair: aliceSig,
        creatorEncryptionKeyPair: aliceEnc
      })
      const g2 = await mlsProvider.createGroup({
        groupId: 'test:group:b',
        creatorDID: 'did:key:alice',
        creatorKeyPair: aliceSig,
        creatorEncryptionKeyPair: aliceEnc
      })
      const pt = new TextEncoder().encode('same message')
      const ct1 = await g1.encrypt(pt)
      const ct2 = await g2.encrypt(pt)
      // Ciphertexts must differ (different epoch secrets, different nonces)
      expect(ct1.ciphertext).not.toEqual(ct2.ciphertext)
    })
  })

  // ── Key Package ──

  describe('Key Packages', () => {
    it('creates a valid key package', async () => {
      const kp = await mlsProvider.createKeyPackage({
        did: 'did:key:bob',
        signingKeyPair: bobSig,
        encryptionKeyPair: bobEnc
      })
      expect(kp.protocolVersion).toBe(1)
      expect(kp.cipherSuite).toBe(1)
      expect(kp.leafNode.did).toBe('did:key:bob')
      expect(kp.initKey).toBeInstanceOf(Uint8Array)
      expect(kp.signature).toBeInstanceOf(Uint8Array)
    })

    it('signature verification succeeds for valid key package', async () => {
      const kp = await mlsProvider.createKeyPackage({
        did: 'did:key:bob',
        signingKeyPair: bobSig,
        encryptionKeyPair: bobEnc
      })
      expect(verifyKeyPackageSignature(kp)).toBe(true)
    })

    it('signature verification fails for tampered key package', async () => {
      const kp = await mlsProvider.createKeyPackage({
        did: 'did:key:bob',
        signingKeyPair: bobSig,
        encryptionKeyPair: bobEnc
      })
      // Tamper with DID
      const tampered = { ...kp, leafNode: { ...kp.leafNode, did: 'did:key:eve' } }
      expect(verifyKeyPackageSignature(tampered)).toBe(false)
    })

    it('signature verification fails with wrong public key', async () => {
      const kp = await mlsProvider.createKeyPackage({
        did: 'did:key:bob',
        signingKeyPair: bobSig,
        encryptionKeyPair: bobEnc
      })
      // Replace signature key with Carol's
      const tampered = {
        ...kp,
        leafNode: { ...kp.leafNode, signatureKey: carolSig.publicKey }
      }
      expect(verifyKeyPackageSignature(tampered)).toBe(false)
    })

    it('initKey matches encryption public key', async () => {
      const kp = await mlsProvider.createKeyPackage({
        did: 'did:key:bob',
        signingKeyPair: bobSig,
        encryptionKeyPair: bobEnc
      })
      expect(kp.initKey).toEqual(bobEnc.publicKey)
    })
  })

  // ── Member Addition + Welcome ──

  describe('Member Addition via Welcome', () => {
    let aliceGroup: MLSGroup
    let bobKP: KeyPackage

    beforeEach(async () => {
      aliceGroup = await mlsProvider.createGroup({
        groupId: 'test:group:1',
        creatorDID: 'did:key:alice',
        creatorKeyPair: aliceSig,
        creatorEncryptionKeyPair: aliceEnc
      })
      bobKP = await mlsProvider.createKeyPackage({
        did: 'did:key:bob',
        signingKeyPair: bobSig,
        encryptionKeyPair: bobEnc
      })
    })

    it('addMember returns welcome and commit', async () => {
      const { welcome, commit } = await aliceGroup.addMember(bobKP)
      expect(welcome.groupId).toBe('test:group:1')
      expect(welcome.epoch).toBe(1)
      expect(welcome.encryptedGroupState).toBeInstanceOf(Uint8Array)
      expect(commit.groupId).toBe('test:group:1')
      expect(commit.epoch).toBe(1)
      expect(commit.proposals.length).toBe(1)
      expect(commit.proposals[0].type).toBe('add')
    })

    it('addMember advances epoch for creator', async () => {
      expect(aliceGroup.epoch).toBe(0)
      await aliceGroup.addMember(bobKP)
      expect(aliceGroup.epoch).toBe(1)
      expect(aliceGroup.memberCount()).toBe(2)
    })

    it('Bob joins from Welcome and can decrypt Alice messages', async () => {
      const { welcome } = await aliceGroup.addMember(bobKP)
      const bobGroup = await mlsProvider.joinFromWelcome(welcome, bobEnc, bobSig)

      expect(bobGroup.groupId).toBe('test:group:1')
      expect(bobGroup.epoch).toBe(1)
      expect(bobGroup.memberCount()).toBe(2)

      // Alice encrypts
      const ct = await aliceGroup.encrypt(new TextEncoder().encode('hello bob'))
      // Bob decrypts
      const { plaintext } = await bobGroup.decrypt(ct)
      expect(new TextDecoder().decode(plaintext)).toBe('hello bob')
    })

    it('Bob can encrypt and Alice can decrypt', async () => {
      const { welcome } = await aliceGroup.addMember(bobKP)
      const bobGroup = await mlsProvider.joinFromWelcome(welcome, bobEnc, bobSig)

      const ct = await bobGroup.encrypt(new TextEncoder().encode('hello alice'))
      const { plaintext } = await aliceGroup.decrypt(ct)
      expect(new TextDecoder().decode(plaintext)).toBe('hello alice')
    })

    it('bidirectional encryption works for multiple messages', async () => {
      const { welcome } = await aliceGroup.addMember(bobKP)
      const bobGroup = await mlsProvider.joinFromWelcome(welcome, bobEnc, bobSig)

      for (let i = 0; i < 10; i++) {
        const msgA = `alice-${i}`
        const msgB = `bob-${i}`
        const ctA = await aliceGroup.encrypt(new TextEncoder().encode(msgA))
        const ctB = await bobGroup.encrypt(new TextEncoder().encode(msgB))
        expect(new TextDecoder().decode((await bobGroup.decrypt(ctA)).plaintext)).toBe(msgA)
        expect(new TextDecoder().decode((await aliceGroup.decrypt(ctB)).plaintext)).toBe(msgB)
      }
    })

    it('Welcome decryption fails with wrong encryption key', async () => {
      const { welcome } = await aliceGroup.addMember(bobKP)
      // Use Carol's encryption key instead of Bob's
      await expect(mlsProvider.joinFromWelcome(welcome, carolEnc, bobSig)).rejects.toThrow()
    })

    it('ciphertext from pre-Welcome epoch cannot be decrypted by new member', async () => {
      // Alice encrypts BEFORE adding Bob
      const ct = await aliceGroup.encrypt(new TextEncoder().encode('secret'))

      const { welcome } = await aliceGroup.addMember(bobKP)
      const bobGroup = await mlsProvider.joinFromWelcome(welcome, bobEnc, bobSig)

      // Bob is at epoch 1, message was epoch 0
      await expect(bobGroup.decrypt(ct)).rejects.toThrow('Epoch mismatch')
    })
  })

  // ── Three-Member Group ──

  describe('Three-Member Group', () => {
    it('Alice adds Bob, then Carol — all can encrypt/decrypt', async () => {
      const group = await mlsProvider.createGroup({
        groupId: 'test:group:3',
        creatorDID: 'did:key:alice',
        creatorKeyPair: aliceSig,
        creatorEncryptionKeyPair: aliceEnc
      })

      // Add Bob
      const bobKP = await mlsProvider.createKeyPackage({
        did: 'did:key:bob',
        signingKeyPair: bobSig,
        encryptionKeyPair: bobEnc
      })
      const { welcome: bobWelcome, commit: bobCommit } = await group.addMember(bobKP)
      const bobGroup = await mlsProvider.joinFromWelcome(bobWelcome, bobEnc, bobSig)

      // Add Carol (Alice does this)
      const carolKP = await mlsProvider.createKeyPackage({
        did: 'did:key:carol',
        signingKeyPair: carolSig,
        encryptionKeyPair: carolEnc
      })
      const { welcome: carolWelcome, commit: carolCommit } = await group.addMember(carolKP)
      // Bob processes the commit so he advances epoch
      await bobGroup.processCommit(carolCommit)
      const carolGroup = await mlsProvider.joinFromWelcome(carolWelcome, carolEnc, carolSig)

      // All at epoch 2, 3 members
      expect(group.epoch).toBe(2)
      expect(bobGroup.epoch).toBe(2)
      expect(carolGroup.epoch).toBe(2)
      expect(group.memberCount()).toBe(3)
      expect(bobGroup.memberCount()).toBe(3)
      expect(carolGroup.memberCount()).toBe(3)

      // Alice → Bob, Carol
      const ct1 = await group.encrypt(new TextEncoder().encode('from alice'))
      expect(new TextDecoder().decode((await bobGroup.decrypt(ct1)).plaintext)).toBe('from alice')
      expect(new TextDecoder().decode((await carolGroup.decrypt(ct1)).plaintext)).toBe('from alice')

      // Bob → Alice, Carol
      const ct2 = await bobGroup.encrypt(new TextEncoder().encode('from bob'))
      expect(new TextDecoder().decode((await group.decrypt(ct2)).plaintext)).toBe('from bob')
      expect(new TextDecoder().decode((await carolGroup.decrypt(ct2)).plaintext)).toBe('from bob')

      // Carol → Alice, Bob
      const ct3 = await carolGroup.encrypt(new TextEncoder().encode('from carol'))
      expect(new TextDecoder().decode((await group.decrypt(ct3)).plaintext)).toBe('from carol')
      expect(new TextDecoder().decode((await bobGroup.decrypt(ct3)).plaintext)).toBe('from carol')
    })
  })

  // ── Member Removal ──

  describe('Member Removal', () => {
    it('removed member cannot decrypt new messages', async () => {
      const group = await mlsProvider.createGroup({
        groupId: 'test:group:rm',
        creatorDID: 'did:key:alice',
        creatorKeyPair: aliceSig,
        creatorEncryptionKeyPair: aliceEnc
      })
      const bobKP = await mlsProvider.createKeyPackage({
        did: 'did:key:bob',
        signingKeyPair: bobSig,
        encryptionKeyPair: bobEnc
      })
      const { welcome } = await group.addMember(bobKP)
      const bobGroup = await mlsProvider.joinFromWelcome(welcome, bobEnc, bobSig)

      // Remove Bob (Alice does this)
      const removeCommit = await group.removeMember(1) // Bob is leafIndex 1
      // Alice at epoch 2 now
      expect(group.epoch).toBe(2)
      expect(group.memberCount()).toBe(1)

      // Alice encrypts at epoch 2
      const ct = await group.encrypt(new TextEncoder().encode('bob is gone'))
      // Bob still at epoch 1 — epoch mismatch
      await expect(bobGroup.decrypt(ct)).rejects.toThrow('Epoch mismatch')
    })
  })

  // ── Epoch Advancement ──

  describe('Epoch Advancement', () => {
    it('updateKeys advances epoch for all members', async () => {
      const group = await mlsProvider.createGroup({
        groupId: 'test:group:rekey',
        creatorDID: 'did:key:alice',
        creatorKeyPair: aliceSig,
        creatorEncryptionKeyPair: aliceEnc
      })
      const bobKP = await mlsProvider.createKeyPackage({
        did: 'did:key:bob',
        signingKeyPair: bobSig,
        encryptionKeyPair: bobEnc
      })
      const { welcome } = await group.addMember(bobKP)
      const bobGroup = await mlsProvider.joinFromWelcome(welcome, bobEnc, bobSig)

      // Alice re-keys
      const commit = await group.updateKeys()
      expect(group.epoch).toBe(2)

      // Bob processes commit
      await bobGroup.processCommit(commit)
      expect(bobGroup.epoch).toBe(2)

      // Still works
      const ct = await group.encrypt(new TextEncoder().encode('new epoch'))
      const { plaintext } = await bobGroup.decrypt(ct)
      expect(new TextDecoder().decode(plaintext)).toBe('new epoch')
    })

    it('messages from old epoch rejected after re-key', async () => {
      const group = await mlsProvider.createGroup({
        groupId: 'test:group:oldepoch',
        creatorDID: 'did:key:alice',
        creatorKeyPair: aliceSig,
        creatorEncryptionKeyPair: aliceEnc
      })
      const bobKP = await mlsProvider.createKeyPackage({
        did: 'did:key:bob',
        signingKeyPair: bobSig,
        encryptionKeyPair: bobEnc
      })
      const { welcome } = await group.addMember(bobKP)
      const bobGroup = await mlsProvider.joinFromWelcome(welcome, bobEnc, bobSig)

      // Encrypt at epoch 1
      const oldCt = await group.encrypt(new TextEncoder().encode('old'))

      // Re-key → epoch 2
      const commit = await group.updateKeys()
      await bobGroup.processCommit(commit)

      // New message works at epoch 2
      const newCt = await group.encrypt(new TextEncoder().encode('new'))
      expect(new TextDecoder().decode((await bobGroup.decrypt(newCt)).plaintext)).toBe('new')

      // Old message fails — epoch mismatch
      await expect(bobGroup.decrypt(oldCt)).rejects.toThrow('Epoch mismatch')
    })
  })

  // ── State Serialization ──

  describe('State Serialization', () => {
    it('exported state can be loaded and used', async () => {
      const group = await mlsProvider.createGroup({
        groupId: 'test:group:serial',
        creatorDID: 'did:key:alice',
        creatorKeyPair: aliceSig,
        creatorEncryptionKeyPair: aliceEnc
      })
      const bobKP = await mlsProvider.createKeyPackage({
        did: 'did:key:bob',
        signingKeyPair: bobSig,
        encryptionKeyPair: bobEnc
      })
      const { welcome } = await group.addMember(bobKP)

      // Serialize Alice's group state
      const exported = group.exportState()
      expect(exported).toBeInstanceOf(Uint8Array)

      // Load into new group instance
      const loaded = await mlsProvider.loadGroup(exported, aliceSig)
      expect(loaded.groupId).toBe('test:group:serial')
      expect(loaded.epoch).toBe(1)
      expect(loaded.memberCount()).toBe(2)

      // Bob joins from welcome
      const bobGroup = await mlsProvider.joinFromWelcome(welcome, bobEnc, bobSig)

      // Loaded group can encrypt, Bob can decrypt
      const ct = await loaded.encrypt(new TextEncoder().encode('from loaded state'))
      const { plaintext } = await bobGroup.decrypt(ct)
      expect(new TextDecoder().decode(plaintext)).toBe('from loaded state')
    })
  })

  // ── Wire Format (serialization through JSON) ──

  describe('Wire Format — JSON round-trip', () => {
    it('Welcome survives JSON serialise/deserialise via base64 Uint8Array encoding', async () => {
      const group = await mlsProvider.createGroup({
        groupId: 'test:group:wire',
        creatorDID: 'did:key:alice',
        creatorKeyPair: aliceSig,
        creatorEncryptionKeyPair: aliceEnc
      })
      const bobKP = await mlsProvider.createKeyPackage({
        did: 'did:key:bob',
        signingKeyPair: bobSig,
        encryptionKeyPair: bobEnc
      })
      const { welcome } = await group.addMember(bobKP)

      // Simulate wire: JSON stringify with Uint8Array → base64, then parse back
      const replacer = (_k: string, v: unknown) => {
        if (v instanceof Uint8Array) {
          return { __type: 'Uint8Array', data: Buffer.from(v).toString('base64') }
        }
        return v
      }
      const reviver = (_k: string, v: unknown) => {
        if (v && typeof v === 'object' && (v as any).__type === 'Uint8Array') {
          return new Uint8Array(Buffer.from((v as any).data, 'base64'))
        }
        return v
      }

      const json = JSON.stringify(welcome, replacer)
      const restored = JSON.parse(json, reviver)

      // Bob joins from restored welcome
      const bobGroup = await mlsProvider.joinFromWelcome(restored, bobEnc, bobSig)
      expect(bobGroup.groupId).toBe('test:group:wire')
      expect(bobGroup.epoch).toBe(1)
      expect(bobGroup.memberCount()).toBe(2)

      // Encryption/decryption works
      const ct = await group.encrypt(new TextEncoder().encode('wire test'))
      const { plaintext } = await bobGroup.decrypt(ct)
      expect(new TextDecoder().decode(plaintext)).toBe('wire test')
    })

    it('MLSCiphertext survives JSON round-trip', async () => {
      const group = await mlsProvider.createGroup({
        groupId: 'test:group:ctwire',
        creatorDID: 'did:key:alice',
        creatorKeyPair: aliceSig,
        creatorEncryptionKeyPair: aliceEnc
      })

      const ct = await group.encrypt(new TextEncoder().encode('round trip'))

      const replacer = (_k: string, v: unknown) => {
        if (v instanceof Uint8Array) return { __type: 'Uint8Array', data: Buffer.from(v).toString('base64') }
        return v
      }
      const reviver = (_k: string, v: unknown) => {
        if (v && typeof v === 'object' && (v as any).__type === 'Uint8Array')
          return new Uint8Array(Buffer.from((v as any).data, 'base64'))
        return v
      }

      const json = JSON.stringify(ct, replacer)
      const restored = JSON.parse(json, reviver)

      const { plaintext } = await group.decrypt(restored)
      expect(new TextDecoder().decode(plaintext)).toBe('round trip')
    })

    it('KeyPackage survives JSON round-trip and verifies', async () => {
      const kp = await mlsProvider.createKeyPackage({
        did: 'did:key:bob',
        signingKeyPair: bobSig,
        encryptionKeyPair: bobEnc
      })

      const replacer = (_k: string, v: unknown) => {
        if (v instanceof Uint8Array) return { __type: 'Uint8Array', data: Buffer.from(v).toString('base64') }
        return v
      }
      const reviver = (_k: string, v: unknown) => {
        if (v && typeof v === 'object' && (v as any).__type === 'Uint8Array')
          return new Uint8Array(Buffer.from((v as any).data, 'base64'))
        return v
      }

      const json = JSON.stringify(kp, replacer)
      const restored = JSON.parse(json, reviver)
      expect(verifyKeyPackageSignature(restored)).toBe(true)
    })
  })

  // ── Security / Penetration ──

  describe('Security — Penetration Tests', () => {
    it('cannot decrypt with forged epoch secret', async () => {
      const group = await mlsProvider.createGroup({
        groupId: 'test:group:sec1',
        creatorDID: 'did:key:alice',
        creatorKeyPair: aliceSig,
        creatorEncryptionKeyPair: aliceEnc
      })
      const ct = await group.encrypt(new TextEncoder().encode('secret'))

      // Create attacker group with different epoch secret
      const attackerGroup = await mlsProvider.createGroup({
        groupId: 'test:group:sec1', // Same groupId
        creatorDID: 'did:key:eve',
        creatorKeyPair: carolSig, // Using Carol's keys as "Eve"
        creatorEncryptionKeyPair: carolEnc
      })
      // Attacker at epoch 0 like Alice, but different secret
      await expect(attackerGroup.decrypt(ct)).rejects.toThrow()
    })

    it('cannot forge a valid Welcome without the real epoch secret', async () => {
      const group = await mlsProvider.createGroup({
        groupId: 'test:group:sec2',
        creatorDID: 'did:key:alice',
        creatorKeyPair: aliceSig,
        creatorEncryptionKeyPair: aliceEnc
      })

      // Create fake Welcome with attacker's group state
      const attackerGroup = await mlsProvider.createGroup({
        groupId: 'test:group:sec2',
        creatorDID: 'did:key:eve',
        creatorKeyPair: carolSig,
        creatorEncryptionKeyPair: carolEnc
      })

      // Attacker adds Bob to their own group — Welcome encrypted with Bob's initKey
      const bobKP = await mlsProvider.createKeyPackage({
        did: 'did:key:bob',
        signingKeyPair: bobSig,
        encryptionKeyPair: bobEnc
      })
      const { welcome: fakeWelcome } = await attackerGroup.addMember(bobKP)

      // Bob joins from fake Welcome — gets attacker's epoch secret
      const bobGroup = await mlsProvider.joinFromWelcome(fakeWelcome, bobEnc, bobSig)

      // Bob cannot decrypt Alice's messages (different epoch secret)
      const ct = await group.encrypt(new TextEncoder().encode('alice-only'))
      await expect(bobGroup.decrypt(ct)).rejects.toThrow()
    })

    it('tampered ciphertext fails authentication', async () => {
      const group = await mlsProvider.createGroup({
        groupId: 'test:group:sec3',
        creatorDID: 'did:key:alice',
        creatorKeyPair: aliceSig,
        creatorEncryptionKeyPair: aliceEnc
      })
      const ct = await group.encrypt(new TextEncoder().encode('authentic'))

      // Tamper with ciphertext bytes
      const tampered = {
        ...ct,
        ciphertext: new Uint8Array(ct.ciphertext)
      }
      tampered.ciphertext[tampered.ciphertext.length - 1] ^= 0xff

      await expect(group.decrypt(tampered)).rejects.toThrow()
    })

    it('truncated ciphertext fails', async () => {
      const group = await mlsProvider.createGroup({
        groupId: 'test:group:sec4',
        creatorDID: 'did:key:alice',
        creatorKeyPair: aliceSig,
        creatorEncryptionKeyPair: aliceEnc
      })
      const ct = await group.encrypt(new TextEncoder().encode('complete'))

      const truncated = { ...ct, ciphertext: ct.ciphertext.slice(0, 10) }
      await expect(group.decrypt(truncated)).rejects.toThrow()
    })

    it('replayed ciphertext decrypts to same plaintext (no replay protection at crypto layer)', async () => {
      // Note: Replay protection is at the application layer (CRDT log dedup by message ID)
      const group = await mlsProvider.createGroup({
        groupId: 'test:group:sec5',
        creatorDID: 'did:key:alice',
        creatorKeyPair: aliceSig,
        creatorEncryptionKeyPair: aliceEnc
      })
      const ct = await group.encrypt(new TextEncoder().encode('replay me'))
      const { plaintext: first } = await group.decrypt(ct)
      const { plaintext: second } = await group.decrypt(ct)
      expect(new TextDecoder().decode(first)).toBe('replay me')
      expect(new TextDecoder().decode(second)).toBe('replay me')
    })

    it('unknown sender index rejected', async () => {
      const group = await mlsProvider.createGroup({
        groupId: 'test:group:sec6',
        creatorDID: 'did:key:alice',
        creatorKeyPair: aliceSig,
        creatorEncryptionKeyPair: aliceEnc
      })
      const ct = await group.encrypt(new TextEncoder().encode('test'))
      // Forge sender index
      const forged = { ...ct, senderIndex: 99 }
      await expect(group.decrypt(forged)).rejects.toThrow('Unknown sender')
    })

    it('Welcome with corrupted encryptedGroupState fails', async () => {
      const group = await mlsProvider.createGroup({
        groupId: 'test:group:sec7',
        creatorDID: 'did:key:alice',
        creatorKeyPair: aliceSig,
        creatorEncryptionKeyPair: aliceEnc
      })
      const bobKP = await mlsProvider.createKeyPackage({
        did: 'did:key:bob',
        signingKeyPair: bobSig,
        encryptionKeyPair: bobEnc
      })
      const { welcome } = await group.addMember(bobKP)

      // Corrupt the encrypted state
      const corrupted = {
        ...welcome,
        encryptedGroupState: new Uint8Array(welcome.encryptedGroupState)
      }
      corrupted.encryptedGroupState[corrupted.encryptedGroupState.length - 5] ^= 0xff

      await expect(mlsProvider.joinFromWelcome(corrupted, bobEnc, bobSig)).rejects.toThrow()
    })

    it('cannot decrypt after removal even with cached group state', async () => {
      const group = await mlsProvider.createGroup({
        groupId: 'test:group:sec8',
        creatorDID: 'did:key:alice',
        creatorKeyPair: aliceSig,
        creatorEncryptionKeyPair: aliceEnc
      })
      const bobKP = await mlsProvider.createKeyPackage({
        did: 'did:key:bob',
        signingKeyPair: bobSig,
        encryptionKeyPair: bobEnc
      })
      const { welcome } = await group.addMember(bobKP)
      const bobGroup = await mlsProvider.joinFromWelcome(welcome, bobEnc, bobSig)

      // Save Bob's state before removal
      const bobState = bobGroup.exportState()

      // Remove Bob and re-key
      await group.removeMember(1)
      const rekey = await group.updateKeys()

      // Alice sends at new epoch
      const ct = await group.encrypt(new TextEncoder().encode('post-removal'))

      // Bob loads old state — epoch mismatch
      const oldBob = await mlsProvider.loadGroup(bobState, bobSig)
      await expect(oldBob.decrypt(ct)).rejects.toThrow('Epoch mismatch')
    })

    it('each ciphertext has unique nonce (no nonce reuse)', async () => {
      const group = await mlsProvider.createGroup({
        groupId: 'test:group:sec9',
        creatorDID: 'did:key:alice',
        creatorKeyPair: aliceSig,
        creatorEncryptionKeyPair: aliceEnc
      })
      const nonces = new Set<string>()
      for (let i = 0; i < 100; i++) {
        const ct = await group.encrypt(new TextEncoder().encode(`msg${i}`))
        // First 24 bytes of ciphertext are the nonce
        const nonce = Buffer.from(ct.ciphertext.slice(0, 24)).toString('hex')
        expect(nonces.has(nonce)).toBe(false)
        nonces.add(nonce)
      }
    })

    it('empty plaintext encrypts and decrypts correctly', async () => {
      const group = await mlsProvider.createGroup({
        groupId: 'test:group:sec10',
        creatorDID: 'did:key:alice',
        creatorKeyPair: aliceSig,
        creatorEncryptionKeyPair: aliceEnc
      })
      const ct = await group.encrypt(new Uint8Array(0))
      const { plaintext } = await group.decrypt(ct)
      expect(plaintext.length).toBe(0)
    })

    it('large plaintext (1MB) encrypts and decrypts', async () => {
      const group = await mlsProvider.createGroup({
        groupId: 'test:group:sec11',
        creatorDID: 'did:key:alice',
        creatorKeyPair: aliceSig,
        creatorEncryptionKeyPair: aliceEnc
      })
      const large = new Uint8Array(1024 * 1024)
      for (let i = 0; i < large.length; i++) large[i] = i % 256
      const ct = await group.encrypt(large)
      const { plaintext } = await group.decrypt(ct)
      expect(plaintext).toEqual(large)
    })
  })
})
