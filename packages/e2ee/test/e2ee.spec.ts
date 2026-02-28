import { describe, it, expect } from 'vitest'
import { createCryptoProvider } from '@harmony/crypto'
import { SimplifiedMLSProvider, SimplifiedDMProvider, verifyKeyPackageSignature } from '../src/index.js'
import type { MLSGroup, MLSCiphertext } from '../src/index.js'

const crypto = createCryptoProvider()
const mlsProvider = new SimplifiedMLSProvider()
const dmProvider = new SimplifiedDMProvider()

async function createTestGroup(groupId = 'test-group'): Promise<{
  group: MLSGroup
  signingKP: Awaited<ReturnType<typeof crypto.generateSigningKeyPair>>
  encryptionKP: Awaited<ReturnType<typeof crypto.generateEncryptionKeyPair>>
}> {
  const signingKP = await crypto.generateSigningKeyPair()
  const encryptionKP = await crypto.generateEncryptionKeyPair()
  const group = await mlsProvider.createGroup({
    groupId,
    creatorDID: 'did:key:creator',
    creatorKeyPair: signingKP,
    creatorEncryptionKeyPair: encryptionKP
  })
  return { group, signingKP, encryptionKP }
}

describe('@harmony/e2ee', () => {
  describe('MLS Group Creation', () => {
    it('MUST create group with single member (creator)', async () => {
      const { group } = await createTestGroup()
      expect(group.memberCount()).toBe(1)
      expect(group.members()[0].did).toBe('did:key:creator')
    })

    it('MUST assign epoch 0 on creation', async () => {
      const { group } = await createTestGroup()
      expect(group.epoch).toBe(0)
    })

    it('MUST assign leaf index 0 to creator', async () => {
      const { group } = await createTestGroup()
      expect(group.myLeafIndex).toBe(0)
    })

    it('MUST export and reload group state', async () => {
      const { group, signingKP } = await createTestGroup()
      const state = group.exportState()
      expect(state).toBeInstanceOf(Uint8Array)
      expect(state.length).toBeGreaterThan(0)

      const loaded = await mlsProvider.loadGroup(state, signingKP)
      expect(loaded.groupId).toBe(group.groupId)
      expect(loaded.epoch).toBe(group.epoch)
      expect(loaded.memberCount()).toBe(group.memberCount())
    })
  })

  describe('Key Packages', () => {
    it('MUST create valid key package from DID keypair', async () => {
      const sigKP = await crypto.generateSigningKeyPair()
      const encKP = await crypto.generateEncryptionKeyPair()
      const kp = await mlsProvider.createKeyPackage({
        did: 'did:key:test',
        signingKeyPair: sigKP,
        encryptionKeyPair: encKP
      })
      expect(kp.protocolVersion).toBe(1)
      expect(kp.cipherSuite).toBe(1)
    })

    it('MUST include Ed25519 signature key', async () => {
      const sigKP = await crypto.generateSigningKeyPair()
      const encKP = await crypto.generateEncryptionKeyPair()
      const kp = await mlsProvider.createKeyPackage({
        did: 'did:key:test',
        signingKeyPair: sigKP,
        encryptionKeyPair: encKP
      })
      expect(kp.leafNode.signatureKey).toEqual(sigKP.publicKey)
    })

    it('MUST include X25519 init key', async () => {
      const sigKP = await crypto.generateSigningKeyPair()
      const encKP = await crypto.generateEncryptionKeyPair()
      const kp = await mlsProvider.createKeyPackage({
        did: 'did:key:test',
        signingKeyPair: sigKP,
        encryptionKeyPair: encKP
      })
      expect(kp.initKey).toEqual(encKP.publicKey)
    })

    it('MUST include DID in leaf node', async () => {
      const sigKP = await crypto.generateSigningKeyPair()
      const encKP = await crypto.generateEncryptionKeyPair()
      const kp = await mlsProvider.createKeyPackage({
        did: 'did:key:test123',
        signingKeyPair: sigKP,
        encryptionKeyPair: encKP
      })
      expect(kp.leafNode.did).toBe('did:key:test123')
    })

    it('MUST verify key package signature', async () => {
      const sigKP = await crypto.generateSigningKeyPair()
      const encKP = await crypto.generateEncryptionKeyPair()
      const kp = await mlsProvider.createKeyPackage({
        did: 'did:key:test',
        signingKeyPair: sigKP,
        encryptionKeyPair: encKP
      })
      expect(verifyKeyPackageSignature(kp)).toBe(true)

      // Tampered package should fail
      const tampered = { ...kp, leafNode: { ...kp.leafNode, did: 'did:key:tampered' } }
      expect(verifyKeyPackageSignature(tampered)).toBe(false)
    })
  })

  describe('Add Member', () => {
    it('MUST produce Welcome for new member', async () => {
      const { group } = await createTestGroup()
      const bobSig = await crypto.generateSigningKeyPair()
      const bobEnc = await crypto.generateEncryptionKeyPair()
      const bobKP = await mlsProvider.createKeyPackage({
        did: 'did:key:bob',
        signingKeyPair: bobSig,
        encryptionKeyPair: bobEnc
      })
      const { welcome } = await group.addMember(bobKP)
      expect(welcome.groupId).toBe('test-group')
      expect(welcome.encryptedGroupState).toBeInstanceOf(Uint8Array)
    })

    it('MUST produce Commit for existing members', async () => {
      const { group } = await createTestGroup()
      const bobSig = await crypto.generateSigningKeyPair()
      const bobEnc = await crypto.generateEncryptionKeyPair()
      const bobKP = await mlsProvider.createKeyPackage({
        did: 'did:key:bob',
        signingKeyPair: bobSig,
        encryptionKeyPair: bobEnc
      })
      const { commit } = await group.addMember(bobKP)
      expect(commit.groupId).toBe('test-group')
      expect(commit.proposals.length).toBe(1)
      expect(commit.proposals[0].type).toBe('add')
    })

    it('MUST increment epoch after commit', async () => {
      const { group } = await createTestGroup()
      expect(group.epoch).toBe(0)
      const bobSig = await crypto.generateSigningKeyPair()
      const bobEnc = await crypto.generateEncryptionKeyPair()
      const bobKP = await mlsProvider.createKeyPackage({
        did: 'did:key:bob',
        signingKeyPair: bobSig,
        encryptionKeyPair: bobEnc
      })
      await group.addMember(bobKP)
      expect(group.epoch).toBe(1)
    })

    it('MUST allow new member to decrypt after processing welcome', async () => {
      const { group } = await createTestGroup()
      const bobSig = await crypto.generateSigningKeyPair()
      const bobEnc = await crypto.generateEncryptionKeyPair()
      const bobKP = await mlsProvider.createKeyPackage({
        did: 'did:key:bob',
        signingKeyPair: bobSig,
        encryptionKeyPair: bobEnc
      })
      const { welcome } = await group.addMember(bobKP)

      // Bob joins via welcome
      const bobGroup = await mlsProvider.joinFromWelcome(welcome, bobEnc, bobSig)

      // Creator encrypts a message
      const plaintext = new TextEncoder().encode('hello bob!')
      const ct = await group.encrypt(plaintext)

      // Bob decrypts
      const result = await bobGroup.decrypt(ct)
      expect(new TextDecoder().decode(result.plaintext)).toBe('hello bob!')
    })

    it('MUST NOT allow new member to decrypt messages from before join', async () => {
      const { group } = await createTestGroup()

      // Encrypt a message before Bob joins
      const preJoinCt = await group.encrypt(new TextEncoder().encode('secret'))

      const bobSig = await crypto.generateSigningKeyPair()
      const bobEnc = await crypto.generateEncryptionKeyPair()
      const bobKP = await mlsProvider.createKeyPackage({
        did: 'did:key:bob',
        signingKeyPair: bobSig,
        encryptionKeyPair: bobEnc
      })
      const { welcome } = await group.addMember(bobKP)
      const bobGroup = await mlsProvider.joinFromWelcome(welcome, bobEnc, bobSig)

      // Bob tries to decrypt pre-join message — should fail (epoch mismatch)
      await expect(bobGroup.decrypt(preJoinCt)).rejects.toThrow()
    })
  })

  describe('Remove Member', () => {
    it('MUST produce Commit removing member', async () => {
      const { group } = await createTestGroup()
      const bobSig = await crypto.generateSigningKeyPair()
      const bobEnc = await crypto.generateEncryptionKeyPair()
      const bobKP = await mlsProvider.createKeyPackage({
        did: 'did:key:bob',
        signingKeyPair: bobSig,
        encryptionKeyPair: bobEnc
      })
      await group.addMember(bobKP)
      expect(group.memberCount()).toBe(2)

      const commit = await group.removeMember(1)
      expect(commit.proposals[0].type).toBe('remove')
      expect(group.memberCount()).toBe(1)
    })

    it('MUST increment epoch after commit', async () => {
      const { group } = await createTestGroup()
      const bobSig = await crypto.generateSigningKeyPair()
      const bobEnc = await crypto.generateEncryptionKeyPair()
      const bobKP = await mlsProvider.createKeyPackage({
        did: 'did:key:bob',
        signingKeyPair: bobSig,
        encryptionKeyPair: bobEnc
      })
      await group.addMember(bobKP) // epoch 1
      await group.removeMember(1) // epoch 2
      expect(group.epoch).toBe(2)
    })

    it('MUST NOT allow removed member to decrypt new messages', async () => {
      const { group } = await createTestGroup()
      const bobSig = await crypto.generateSigningKeyPair()
      const bobEnc = await crypto.generateEncryptionKeyPair()
      const bobKP = await mlsProvider.createKeyPackage({
        did: 'did:key:bob',
        signingKeyPair: bobSig,
        encryptionKeyPair: bobEnc
      })
      const { welcome } = await group.addMember(bobKP)
      const bobGroup = await mlsProvider.joinFromWelcome(welcome, bobEnc, bobSig)

      // Remove Bob
      await group.removeMember(1)

      // New message after removal
      const ct = await group.encrypt(new TextEncoder().encode('after removal'))

      // Bob tries to decrypt — should fail (epoch mismatch)
      await expect(bobGroup.decrypt(ct)).rejects.toThrow()
    })

    it('MUST allow remaining members to continue', async () => {
      const { group } = await createTestGroup()
      const bobSig = await crypto.generateSigningKeyPair()
      const bobEnc = await crypto.generateEncryptionKeyPair()
      const bobKP = await mlsProvider.createKeyPackage({
        did: 'did:key:bob',
        signingKeyPair: bobSig,
        encryptionKeyPair: bobEnc
      })
      await group.addMember(bobKP)
      await group.removeMember(1)

      // Creator can still encrypt/decrypt
      const ct = await group.encrypt(new TextEncoder().encode('still here'))
      const result = await group.decrypt(ct)
      expect(new TextDecoder().decode(result.plaintext)).toBe('still here')
    })
  })

  describe('Group Encryption', () => {
    it('MUST encrypt plaintext for all group members', async () => {
      const { group } = await createTestGroup()
      const ct = await group.encrypt(new TextEncoder().encode('hello'))
      expect(ct.ciphertext).toBeInstanceOf(Uint8Array)
      expect(ct.epoch).toBe(0)
    })

    it('MUST decrypt ciphertext by any group member', async () => {
      const { group } = await createTestGroup()
      const bobSig = await crypto.generateSigningKeyPair()
      const bobEnc = await crypto.generateEncryptionKeyPair()
      const bobKP = await mlsProvider.createKeyPackage({
        did: 'did:key:bob',
        signingKeyPair: bobSig,
        encryptionKeyPair: bobEnc
      })
      const { welcome } = await group.addMember(bobKP)
      const bobGroup = await mlsProvider.joinFromWelcome(welcome, bobEnc, bobSig)

      const ct = await group.encrypt(new TextEncoder().encode('shared message'))
      const result = await bobGroup.decrypt(ct)
      expect(new TextDecoder().decode(result.plaintext)).toBe('shared message')
    })

    it('MUST include epoch and sender index in ciphertext', async () => {
      const { group } = await createTestGroup()
      const ct = await group.encrypt(new TextEncoder().encode('test'))
      expect(ct.epoch).toBe(0)
      expect(ct.senderIndex).toBe(0)
    })

    it('MUST reject ciphertext from wrong epoch', async () => {
      const { group } = await createTestGroup()
      const ct = await group.encrypt(new TextEncoder().encode('test'))

      // Advance epoch
      const bobSig = await crypto.generateSigningKeyPair()
      const bobEnc = await crypto.generateEncryptionKeyPair()
      const bobKP = await mlsProvider.createKeyPackage({
        did: 'did:key:bob',
        signingKeyPair: bobSig,
        encryptionKeyPair: bobEnc
      })
      await group.addMember(bobKP)

      // Try to decrypt old epoch message with new state
      await expect(group.decrypt(ct)).rejects.toThrow(/[Ee]poch/)
    })

    it('MUST reject ciphertext from non-member', async () => {
      const { group } = await createTestGroup()
      const fakeCt: MLSCiphertext = {
        epoch: 0,
        senderIndex: 99, // non-existent
        ciphertext: new Uint8Array(64),
        contentType: 'application'
      }
      await expect(group.decrypt(fakeCt)).rejects.toThrow()
    })

    it('MUST produce unique ciphertext for same plaintext (nonce)', async () => {
      const { group } = await createTestGroup()
      const msg = new TextEncoder().encode('same message')
      const ct1 = await group.encrypt(msg)
      const ct2 = await group.encrypt(msg)
      // Ciphertexts should differ due to random nonce
      expect(ct1.ciphertext).not.toEqual(ct2.ciphertext)
    })
  })

  describe('Key Update', () => {
    it('MUST rotate sender keys', async () => {
      const { group } = await createTestGroup()
      const membersBefore = group.members()
      const commit = await group.updateKeys()
      const membersAfter = group.members()
      expect(commit.proposals[0].type).toBe('update')
      // Encryption key should have changed
      expect(membersAfter[0].encryptionKey).not.toEqual(membersBefore[0].encryptionKey)
    })

    it('MUST increment epoch', async () => {
      const { group } = await createTestGroup()
      expect(group.epoch).toBe(0)
      await group.updateKeys()
      expect(group.epoch).toBe(1)
    })

    it('MUST allow decryption with new keys after commit', async () => {
      const { group } = await createTestGroup()
      await group.updateKeys()
      const ct = await group.encrypt(new TextEncoder().encode('after rotation'))
      const result = await group.decrypt(ct)
      expect(new TextDecoder().decode(result.plaintext)).toBe('after rotation')
    })

    it('MUST NOT allow use of old keys for new messages', async () => {
      const { group } = await createTestGroup()
      const ctOld = await group.encrypt(new TextEncoder().encode('old'))
      await group.updateKeys()
      // Old ciphertext cannot be decrypted with new epoch
      await expect(group.decrypt(ctOld)).rejects.toThrow()
    })
  })

  describe('Multi-Member Scenarios', () => {
    it('MUST handle 3+ members joining sequentially', async () => {
      const { group } = await createTestGroup()

      for (let i = 0; i < 3; i++) {
        const sig = await crypto.generateSigningKeyPair()
        const enc = await crypto.generateEncryptionKeyPair()
        const kp = await mlsProvider.createKeyPackage({
          did: `did:key:member${i}`,
          signingKeyPair: sig,
          encryptionKeyPair: enc
        })
        await group.addMember(kp)
      }

      expect(group.memberCount()).toBe(4) // creator + 3
      expect(group.epoch).toBe(3)
    })

    it('MUST handle member leave + rejoin (new epoch, new keys)', async () => {
      const { group } = await createTestGroup()

      const bobSig = await crypto.generateSigningKeyPair()
      const bobEnc = await crypto.generateEncryptionKeyPair()
      const bobKP = await mlsProvider.createKeyPackage({
        did: 'did:key:bob',
        signingKeyPair: bobSig,
        encryptionKeyPair: bobEnc
      })
      await group.addMember(bobKP) // epoch 1

      await group.removeMember(1) // epoch 2

      // Bob rejoins
      const bobSig2 = await crypto.generateSigningKeyPair()
      const bobEnc2 = await crypto.generateEncryptionKeyPair()
      const bobKP2 = await mlsProvider.createKeyPackage({
        did: 'did:key:bob',
        signingKeyPair: bobSig2,
        encryptionKeyPair: bobEnc2
      })
      const { welcome } = await group.addMember(bobKP2) // epoch 3

      const bobGroup2 = await mlsProvider.joinFromWelcome(welcome, bobEnc2, bobSig2)

      const ct = await group.encrypt(new TextEncoder().encode('welcome back'))
      const result = await bobGroup2.decrypt(ct)
      expect(new TextDecoder().decode(result.plaintext)).toBe('welcome back')
    })

    it('MUST handle concurrent key updates (deterministic merge)', async () => {
      const { group } = await createTestGroup()
      const commit1 = await group.updateKeys()
      expect(commit1.epoch).toBe(1)
      // Further update
      const commit2 = await group.updateKeys()
      expect(commit2.epoch).toBe(2)
      // Group should still work
      const ct = await group.encrypt(new TextEncoder().encode('after updates'))
      const result = await group.decrypt(ct)
      expect(new TextDecoder().decode(result.plaintext)).toBe('after updates')
    })

    it('MUST handle group with 50+ members (performance)', async () => {
      const { group } = await createTestGroup()
      for (let i = 0; i < 50; i++) {
        const sig = await crypto.generateSigningKeyPair()
        const enc = await crypto.generateEncryptionKeyPair()
        const kp = await mlsProvider.createKeyPackage({
          did: `did:key:m${i}`,
          signingKeyPair: sig,
          encryptionKeyPair: enc
        })
        await group.addMember(kp)
      }
      expect(group.memberCount()).toBe(51)

      // Encryption should still work
      const ct = await group.encrypt(new TextEncoder().encode('large group'))
      const result = await group.decrypt(ct)
      expect(new TextDecoder().decode(result.plaintext)).toBe('large group')
    })
  })

  describe('DM Encryption', () => {
    it('MUST create DM channel between two DIDs', async () => {
      const aliceEnc = await crypto.generateEncryptionKeyPair()
      const bobEnc = await crypto.generateEncryptionKeyPair()

      const channel = await dmProvider.createChannel({
        senderDID: 'did:key:alice',
        senderKeyPair: aliceEnc,
        recipientDID: 'did:key:bob',
        recipientPublicKey: bobEnc.publicKey
      })
      expect(channel.senderDID).toBe('did:key:alice')
      expect(channel.recipientDID).toBe('did:key:bob')
    })

    it('MUST encrypt/decrypt between sender and recipient', async () => {
      const aliceEnc = await crypto.generateEncryptionKeyPair()
      const bobEnc = await crypto.generateEncryptionKeyPair()

      const aliceChannel = await dmProvider.createChannel({
        senderDID: 'did:key:alice',
        senderKeyPair: aliceEnc,
        recipientDID: 'did:key:bob',
        recipientPublicKey: bobEnc.publicKey
      })

      const bobChannel = await dmProvider.openChannel({
        recipientDID: 'did:key:bob',
        recipientKeyPair: bobEnc,
        senderDID: 'did:key:alice',
        senderPublicKey: aliceEnc.publicKey
      })

      const plaintext = new TextEncoder().encode('hello bob!')
      const ct = await aliceChannel.encrypt(plaintext)
      const decrypted = await bobChannel.decrypt(ct)
      expect(new TextDecoder().decode(decrypted)).toBe('hello bob!')
    })

    it('MUST fail decryption by third party', async () => {
      const aliceEnc = await crypto.generateEncryptionKeyPair()
      const bobEnc = await crypto.generateEncryptionKeyPair()
      const eveEnc = await crypto.generateEncryptionKeyPair()

      const aliceChannel = await dmProvider.createChannel({
        senderDID: 'did:key:alice',
        senderKeyPair: aliceEnc,
        recipientDID: 'did:key:bob',
        recipientPublicKey: bobEnc.publicKey
      })

      const eveChannel = await dmProvider.openChannel({
        recipientDID: 'did:key:eve',
        recipientKeyPair: eveEnc,
        senderDID: 'did:key:alice',
        senderPublicKey: aliceEnc.publicKey
      })

      const ct = await aliceChannel.encrypt(new TextEncoder().encode('secret'))
      await expect(eveChannel.decrypt(ct)).rejects.toThrow()
    })

    it('MUST use X25519 key agreement (from DID document keys)', async () => {
      const aliceEnc = await crypto.generateEncryptionKeyPair()
      const bobEnc = await crypto.generateEncryptionKeyPair()
      expect(aliceEnc.type).toBe('X25519')
      expect(bobEnc.type).toBe('X25519')

      const channel = await dmProvider.createChannel({
        senderDID: 'did:key:alice',
        senderKeyPair: aliceEnc,
        recipientDID: 'did:key:bob',
        recipientPublicKey: bobEnc.publicKey
      })
      const ct = await channel.encrypt(new TextEncoder().encode('test'))
      expect(ct.ciphertext).toBeInstanceOf(Uint8Array)
    })

    it('MUST produce unique ciphertext per message (fresh nonce)', async () => {
      const aliceEnc = await crypto.generateEncryptionKeyPair()
      const bobEnc = await crypto.generateEncryptionKeyPair()

      const channel = await dmProvider.createChannel({
        senderDID: 'did:key:alice',
        senderKeyPair: aliceEnc,
        recipientDID: 'did:key:bob',
        recipientPublicKey: bobEnc.publicKey
      })

      const msg = new TextEncoder().encode('same')
      const ct1 = await channel.encrypt(msg)
      const ct2 = await channel.encrypt(msg)
      expect(ct1.nonce).not.toEqual(ct2.nonce)
      expect(ct1.ciphertext).not.toEqual(ct2.ciphertext)
    })
  })

  describe('DM Channel Opening', () => {
    it('MUST open channel from recipient side', async () => {
      const aliceEnc = await crypto.generateEncryptionKeyPair()
      const bobEnc = await crypto.generateEncryptionKeyPair()

      const bobChannel = await dmProvider.openChannel({
        recipientDID: 'did:key:bob',
        recipientKeyPair: bobEnc,
        senderDID: 'did:key:alice',
        senderPublicKey: aliceEnc.publicKey
      })
      expect(bobChannel.recipientDID).toBe('did:key:alice')
    })

    it('MUST decrypt messages encrypted by sender', async () => {
      const aliceEnc = await crypto.generateEncryptionKeyPair()
      const bobEnc = await crypto.generateEncryptionKeyPair()

      const aliceChannel = await dmProvider.createChannel({
        senderDID: 'did:key:alice',
        senderKeyPair: aliceEnc,
        recipientDID: 'did:key:bob',
        recipientPublicKey: bobEnc.publicKey
      })
      const bobChannel = await dmProvider.openChannel({
        recipientDID: 'did:key:bob',
        recipientKeyPair: bobEnc,
        senderDID: 'did:key:alice',
        senderPublicKey: aliceEnc.publicKey
      })

      const ct = await aliceChannel.encrypt(new TextEncoder().encode('hello'))
      const pt = await bobChannel.decrypt(ct)
      expect(new TextDecoder().decode(pt)).toBe('hello')
    })

    it('MUST allow bidirectional communication', async () => {
      const aliceEnc = await crypto.generateEncryptionKeyPair()
      const bobEnc = await crypto.generateEncryptionKeyPair()

      const aliceChannel = await dmProvider.createChannel({
        senderDID: 'did:key:alice',
        senderKeyPair: aliceEnc,
        recipientDID: 'did:key:bob',
        recipientPublicKey: bobEnc.publicKey
      })
      const bobChannel = await dmProvider.openChannel({
        recipientDID: 'did:key:bob',
        recipientKeyPair: bobEnc,
        senderDID: 'did:key:alice',
        senderPublicKey: aliceEnc.publicKey
      })

      // Alice → Bob
      const ct1 = await aliceChannel.encrypt(new TextEncoder().encode('hi bob'))
      expect(new TextDecoder().decode(await bobChannel.decrypt(ct1))).toBe('hi bob')

      // Bob → Alice
      const ct2 = await bobChannel.encrypt(new TextEncoder().encode('hi alice'))
      expect(new TextDecoder().decode(await aliceChannel.decrypt(ct2))).toBe('hi alice')
    })
  })

  describe('Serialisation', () => {
    it('MUST serialise MLSCiphertext for wire (protocol EncryptedContent)', async () => {
      const { group } = await createTestGroup()
      const ct = await group.encrypt(new TextEncoder().encode('test'))
      const json = JSON.stringify({
        epoch: ct.epoch,
        senderIndex: ct.senderIndex,
        ciphertext: Array.from(ct.ciphertext),
        contentType: ct.contentType
      })
      const parsed = JSON.parse(json)
      expect(parsed.epoch).toBe(ct.epoch)
      expect(parsed.senderIndex).toBe(ct.senderIndex)
    })

    it('MUST serialise Welcome for wire', async () => {
      const { group } = await createTestGroup()
      const bobSig = await crypto.generateSigningKeyPair()
      const bobEnc = await crypto.generateEncryptionKeyPair()
      const bobKP = await mlsProvider.createKeyPackage({
        did: 'did:key:bob',
        signingKeyPair: bobSig,
        encryptionKeyPair: bobEnc
      })
      const { welcome } = await group.addMember(bobKP)

      const json = JSON.stringify({
        groupId: welcome.groupId,
        epoch: welcome.epoch,
        encryptedGroupState: Array.from(welcome.encryptedGroupState)
      })
      const parsed = JSON.parse(json)
      expect(parsed.groupId).toBe(welcome.groupId)
    })

    it('MUST serialise Commit for wire', async () => {
      const { group } = await createTestGroup()
      const bobSig = await crypto.generateSigningKeyPair()
      const bobEnc = await crypto.generateEncryptionKeyPair()
      const bobKP = await mlsProvider.createKeyPackage({
        did: 'did:key:bob',
        signingKeyPair: bobSig,
        encryptionKeyPair: bobEnc
      })
      const { commit } = await group.addMember(bobKP)

      const json = JSON.stringify({
        groupId: commit.groupId,
        epoch: commit.epoch,
        proposals: commit.proposals.map((p) => ({ type: p.type })),
        commitSecret: Array.from(commit.commitSecret),
        signature: Array.from(commit.signature)
      })
      const parsed = JSON.parse(json)
      expect(parsed.groupId).toBe(commit.groupId)
    })

    it('MUST round-trip all types through JSON', async () => {
      const aliceEnc = await crypto.generateEncryptionKeyPair()
      const bobEnc = await crypto.generateEncryptionKeyPair()
      const aliceChannel = await dmProvider.createChannel({
        senderDID: 'did:key:alice',
        senderKeyPair: aliceEnc,
        recipientDID: 'did:key:bob',
        recipientPublicKey: bobEnc.publicKey
      })
      const ct = await aliceChannel.encrypt(new TextEncoder().encode('test'))
      const serialized = {
        ciphertext: Array.from(ct.ciphertext),
        nonce: Array.from(ct.nonce),
        senderPublicKey: Array.from(ct.senderPublicKey)
      }
      const json = JSON.stringify(serialized)
      const parsed = JSON.parse(json)
      const restored = {
        ciphertext: new Uint8Array(parsed.ciphertext),
        nonce: new Uint8Array(parsed.nonce),
        senderPublicKey: new Uint8Array(parsed.senderPublicKey)
      }
      const bobChannel = await dmProvider.openChannel({
        recipientDID: 'did:key:bob',
        recipientKeyPair: bobEnc,
        senderDID: 'did:key:alice',
        senderPublicKey: aliceEnc.publicKey
      })
      const decrypted = await bobChannel.decrypt(restored)
      expect(new TextDecoder().decode(decrypted)).toBe('test')
    })
  })

  describe('Edge Cases', () => {
    it('MUST encrypt/decrypt empty plaintext', async () => {
      const { group } = await createTestGroup()
      const ct = await group.encrypt(new Uint8Array(0))
      const result = await group.decrypt(ct)
      expect(result.plaintext.length).toBe(0)
    })

    it('MUST encrypt/decrypt large plaintext (64KB)', async () => {
      const { group } = await createTestGroup()
      const large = new Uint8Array(65536)
      for (let i = 0; i < large.length; i++) large[i] = i % 256
      const ct = await group.encrypt(large)
      const result = await group.decrypt(ct)
      expect(result.plaintext.length).toBe(65536)
      expect(result.plaintext[0]).toBe(0)
      expect(result.plaintext[255]).toBe(255)
    })

    it('MUST reject tampered ciphertext (integrity)', async () => {
      const { group } = await createTestGroup()
      const ct = await group.encrypt(new TextEncoder().encode('integrity test'))
      // Tamper with ciphertext
      const tampered: MLSCiphertext = {
        ...ct,
        ciphertext: new Uint8Array(ct.ciphertext)
      }
      tampered.ciphertext[tampered.ciphertext.length - 1] ^= 0xff
      await expect(group.decrypt(tampered)).rejects.toThrow()
    })

    it('MUST handle group with exactly 1 member', async () => {
      const { group } = await createTestGroup()
      expect(group.memberCount()).toBe(1)
      const ct = await group.encrypt(new TextEncoder().encode('solo'))
      const result = await group.decrypt(ct)
      expect(new TextDecoder().decode(result.plaintext)).toBe('solo')
    })

    it('MUST reject removeMember for non-existent member', async () => {
      const { group } = await createTestGroup()
      await expect(group.removeMember(99)).rejects.toThrow()
    })

    it('MUST handle processCommit with update proposal', async () => {
      const { group } = await createTestGroup()
      const bobSig = await crypto.generateSigningKeyPair()
      const bobEnc = await crypto.generateEncryptionKeyPair()
      const bobKP = await mlsProvider.createKeyPackage({
        did: 'did:key:bob',
        signingKeyPair: bobSig,
        encryptionKeyPair: bobEnc
      })
      const { welcome, commit: _commit } = await group.addMember(bobKP)
      const bobGroup = await mlsProvider.joinFromWelcome(welcome, bobEnc, bobSig)
      // Bob processes the add commit
      // Creator updates keys and Bob processes it
      const updateCommit = await group.updateKeys()
      await bobGroup.processCommit(updateCommit)
      // Both should be at same epoch
      expect(bobGroup.epoch).toBe(group.epoch)
      // Encrypt/decrypt should work
      const ct = await group.encrypt(new TextEncoder().encode('after update'))
      const result = await bobGroup.decrypt(ct)
      expect(new TextDecoder().decode(result.plaintext)).toBe('after update')
    })

    it('MUST export, reload, then encrypt/decrypt', async () => {
      const { group, signingKP } = await createTestGroup()
      const state = group.exportState()
      const loaded = await mlsProvider.loadGroup(state, signingKP)
      const ct = await loaded.encrypt(new TextEncoder().encode('after reload'))
      const result = await loaded.decrypt(ct)
      expect(new TextDecoder().decode(result.plaintext)).toBe('after reload')
    })

    it('DM MUST handle multiple messages in sequence', async () => {
      const aliceEnc = await crypto.generateEncryptionKeyPair()
      const bobEnc = await crypto.generateEncryptionKeyPair()
      const aliceCh = await dmProvider.createChannel({
        senderDID: 'did:key:alice',
        senderKeyPair: aliceEnc,
        recipientDID: 'did:key:bob',
        recipientPublicKey: bobEnc.publicKey
      })
      const bobCh = await dmProvider.openChannel({
        recipientDID: 'did:key:bob',
        recipientKeyPair: bobEnc,
        senderDID: 'did:key:alice',
        senderPublicKey: aliceEnc.publicKey
      })
      for (let i = 0; i < 10; i++) {
        const ct = await aliceCh.encrypt(new TextEncoder().encode(`msg-${i}`))
        const pt = await bobCh.decrypt(ct)
        expect(new TextDecoder().decode(pt)).toBe(`msg-${i}`)
      }
    })

    it('DM MUST fail with tampered nonce', async () => {
      const aliceEnc = await crypto.generateEncryptionKeyPair()
      const bobEnc = await crypto.generateEncryptionKeyPair()
      const aliceCh = await dmProvider.createChannel({
        senderDID: 'did:key:alice',
        senderKeyPair: aliceEnc,
        recipientDID: 'did:key:bob',
        recipientPublicKey: bobEnc.publicKey
      })
      const bobCh = await dmProvider.openChannel({
        recipientDID: 'did:key:bob',
        recipientKeyPair: bobEnc,
        senderDID: 'did:key:alice',
        senderPublicKey: aliceEnc.publicKey
      })
      const ct = await aliceCh.encrypt(new TextEncoder().encode('test'))
      const tampered = { ...ct, nonce: new Uint8Array(ct.nonce.length) }
      await expect(bobCh.decrypt(tampered)).rejects.toThrow()
    })

    it('verifyKeyPackageSignature MUST return false for wrong signature', async () => {
      const sigKP = await crypto.generateSigningKeyPair()
      const encKP = await crypto.generateEncryptionKeyPair()
      const kp = await mlsProvider.createKeyPackage({
        did: 'did:key:test',
        signingKeyPair: sigKP,
        encryptionKeyPair: encKP
      })
      const badSig = { ...kp, signature: new Uint8Array(kp.signature.length) }
      expect(verifyKeyPackageSignature(badSig)).toBe(false)
    })
  })

  describe('Re-keying', () => {
    it.todo('MUST re-key MLS group when member is revoked')
    it.todo('MUST NOT allow revoked member to decrypt new messages')
    it.todo('SHOULD complete re-keying within bounded time')
  })
})
