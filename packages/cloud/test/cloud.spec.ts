import { describe, it, expect } from 'vitest'
import { createCryptoProvider } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import type { EncryptedExportBundle } from '@harmony/migration'
import { CloudService } from '../src/index.js'

const crypto = createCryptoProvider()
const didProvider = new DIDKeyProvider(crypto)

function createTestBundle(adminDID: string): EncryptedExportBundle {
  return {
    ciphertext: new Uint8Array([1, 2, 3]),
    nonce: new Uint8Array([4, 5, 6]),
    metadata: {
      exportDate: new Date().toISOString(),
      sourceServerId: 'server1',
      sourceServerName: 'Test Server',
      adminDID,
      channelCount: 5,
      messageCount: 100,
      memberCount: 20
    }
  }
}

describe('@harmony/cloud', () => {
  describe('Identity Service', () => {
    it('MUST create identity and return mnemonic', async () => {
      const cloud = new CloudService(crypto)
      await cloud.initialize()
      const result = await cloud.createIdentity()
      expect(result.identity.did).toMatch(/^did:key:z/)
      expect(result.mnemonic.split(' ')).toHaveLength(12)
    })

    it('MUST resolve identity by DID', async () => {
      const cloud = new CloudService(crypto)
      await cloud.initialize()
      const { identity } = await cloud.createIdentity()
      const resolved = await cloud.resolveIdentity(identity.did)
      expect(resolved).not.toBeNull()
      expect(resolved!.did).toBe(identity.did)
    })

    it('MUST return null for unknown DID', async () => {
      const cloud = new CloudService(crypto)
      await cloud.initialize()
      const result = await cloud.resolveIdentity('did:key:zUnknown')
      expect(result).toBeNull()
    })
  })

  describe('OAuth Linking', () => {
    it('MUST generate valid OAuth redirect URL', async () => {
      const cloud = new CloudService(crypto)
      await cloud.initialize()
      const result = await cloud.initiateOAuthLink({ provider: 'discord', userDID: 'did:key:z1' })
      expect(result.redirectUrl).toContain('discord')
      expect(result.state).toBeTruthy()
    })

    it('MUST issue VC linking DID to provider identity', async () => {
      const cloud = new CloudService(crypto)
      await cloud.initialize()
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const vc = await cloud.completeOAuthLink({
        provider: 'discord',
        code: 'test-code',
        state: 'test-state',
        userDID: doc.id,
        userKeyPair: kp,
        providerUserId: 'discord123',
        providerUsername: 'TestUser'
      })
      expect(vc.type).toContain('DiscordIdentityCredential')
      expect(vc.credentialSubject.discordUserId).toBe('discord123')
    })
  })

  describe('Encrypted Storage', () => {
    it('MUST store and retrieve encrypted bundle', async () => {
      const cloud = new CloudService(crypto)
      await cloud.initialize()
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const bundle = createTestBundle(doc.id)
      const { exportId } = await cloud.storeExport(bundle)
      const retrieved = await cloud.retrieveExport(exportId, doc.id)
      expect(retrieved.metadata.sourceServerName).toBe('Test Server')
    })

    it('MUST reject retrieval by non-admin DID', async () => {
      const cloud = new CloudService(crypto)
      await cloud.initialize()
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const bundle = createTestBundle(doc.id)
      const { exportId } = await cloud.storeExport(bundle)
      await expect(cloud.retrieveExport(exportId, 'did:key:zWrong')).rejects.toThrow('Unauthorized')
    })

    it('MUST delete bundle with proof', async () => {
      const cloud = new CloudService(crypto)
      await cloud.initialize()
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const bundle = createTestBundle(doc.id)
      const { exportId } = await cloud.storeExport(bundle)
      await cloud.deleteExport(exportId, doc.id, {} as any)
      await expect(cloud.retrieveExport(exportId, doc.id)).rejects.toThrow('not found')
    })

    it('MUST list exports for admin DID', async () => {
      const cloud = new CloudService(crypto)
      await cloud.initialize()
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      await cloud.storeExport(createTestBundle(doc.id))
      await cloud.storeExport(createTestBundle(doc.id))
      const list = await cloud.listExports(doc.id)
      expect(list).toHaveLength(2)
    })

    it('MUST serve metadata without decryption', async () => {
      const cloud = new CloudService(crypto)
      await cloud.initialize()
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      await cloud.storeExport(createTestBundle(doc.id))
      const list = await cloud.listExports(doc.id)
      expect(list[0].metadata.channelCount).toBe(5)
      expect(list[0].metadata.memberCount).toBe(20)
    })
  })

  describe('Friend Graph', () => {
    it('MUST find DIDs for linked Discord user IDs', async () => {
      const cloud = new CloudService(crypto)
      await cloud.initialize()
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      await cloud.completeOAuthLink({
        provider: 'discord',
        code: 'code',
        state: 'state',
        userDID: doc.id,
        userKeyPair: kp,
        providerUserId: 'discord456',
        providerUsername: 'User456'
      })
      const found = await cloud.findLinkedIdentities(['discord456', 'discord789'])
      expect(found.get('discord456')).toBe(doc.id)
      expect(found.has('discord789')).toBe(false)
    })

    it('MUST return only users who have linked', async () => {
      const cloud = new CloudService(crypto)
      await cloud.initialize()
      const found = await cloud.findLinkedIdentities(['unknown1', 'unknown2'])
      expect(found.size).toBe(0)
    })
  })
})
