import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createCryptoProvider } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import type { EncryptedExportBundle } from '@harmony/migration'
import { PortalService } from '../src/index.js'
import { createApp } from '../src/server.js'
import type { Server } from 'http'

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

describe('@harmony/portal', () => {
  describe('Identity Service', () => {
    it('MUST create identity and return mnemonic', async () => {
      const portal = new PortalService(crypto)
      await portal.initialize()
      const result = await portal.createIdentity()
      expect(result.identity.did).toMatch(/^did:key:z/)
      expect(result.mnemonic.split(' ')).toHaveLength(12)
    })

    it('MUST resolve identity by DID', async () => {
      const portal = new PortalService(crypto)
      await portal.initialize()
      const { identity } = await portal.createIdentity()
      const resolved = await portal.resolveIdentity(identity.did)
      expect(resolved).not.toBeNull()
      expect(resolved!.did).toBe(identity.did)
    })

    it('MUST return null for unknown DID', async () => {
      const portal = new PortalService(crypto)
      await portal.initialize()
      const result = await portal.resolveIdentity('did:key:zUnknown')
      expect(result).toBeNull()
    })
  })

  describe('OAuth Linking', () => {
    it('MUST generate valid OAuth redirect URL', async () => {
      const portal = new PortalService(crypto)
      await portal.initialize()
      const result = await portal.initiateOAuthLink({ provider: 'discord', userDID: 'did:key:z1' })
      expect(result.redirectUrl).toContain('discord')
      expect(result.state).toBeTruthy()
    })

    it('MUST issue VC linking DID to provider identity', async () => {
      const portal = new PortalService(crypto)
      await portal.initialize()
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const vc = await portal.completeOAuthLink({
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
      const portal = new PortalService(crypto)
      await portal.initialize()
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const bundle = createTestBundle(doc.id)
      const { exportId } = await portal.storeExport(bundle)
      const retrieved = await portal.retrieveExport(exportId, doc.id)
      expect(retrieved.metadata.sourceServerName).toBe('Test Server')
    })

    it('MUST reject retrieval by non-admin DID', async () => {
      const portal = new PortalService(crypto)
      await portal.initialize()
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const bundle = createTestBundle(doc.id)
      const { exportId } = await portal.storeExport(bundle)
      await expect(portal.retrieveExport(exportId, 'did:key:zWrong')).rejects.toThrow('Unauthorized')
    })

    it('MUST delete bundle with proof', async () => {
      const portal = new PortalService(crypto)
      await portal.initialize()
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      const bundle = createTestBundle(doc.id)
      const { exportId } = await portal.storeExport(bundle)
      await portal.deleteExport(exportId, doc.id)
      await expect(portal.retrieveExport(exportId, doc.id)).rejects.toThrow('not found')
    })

    it('MUST list exports for admin DID', async () => {
      const portal = new PortalService(crypto)
      await portal.initialize()
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      await portal.storeExport(createTestBundle(doc.id))
      await portal.storeExport(createTestBundle(doc.id))
      const list = await portal.listExports(doc.id)
      expect(list).toHaveLength(2)
    })

    it('MUST serve metadata without decryption', async () => {
      const portal = new PortalService(crypto)
      await portal.initialize()
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      await portal.storeExport(createTestBundle(doc.id))
      const list = await portal.listExports(doc.id)
      expect(list[0].metadata.channelCount).toBe(5)
      expect(list[0].metadata.memberCount).toBe(20)
    })
  })

  describe('Friend Graph', () => {
    it('MUST find DIDs for linked Discord user IDs', async () => {
      const portal = new PortalService(crypto)
      await portal.initialize()
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      await portal.completeOAuthLink({
        provider: 'discord',
        code: 'code',
        state: 'state',
        userDID: doc.id,
        userKeyPair: kp,
        providerUserId: 'discord456',
        providerUsername: 'User456'
      })
      const found = await portal.findLinkedIdentities(['discord456', 'discord789'])
      expect(found.get('discord456')).toBe(doc.id)
      expect(found.has('discord789')).toBe(false)
    })

    it('MUST return only users who have linked', async () => {
      const portal = new PortalService(crypto)
      await portal.initialize()
      const found = await portal.findLinkedIdentities(['unknown1', 'unknown2'])
      expect(found.size).toBe(0)
    })
  })
})

describe('@harmony/portal HTTP Server', () => {
  let server: Server
  let baseUrl: string

  beforeAll(async () => {
    const app = await createApp()
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as any
        baseUrl = `http://127.0.0.1:${addr.port}`
        resolve()
      })
    })
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('GET /health returns ok', async () => {
    const res = await fetch(`${baseUrl}/health`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
  })

  it('POST /api/identities creates identity', async () => {
    const res = await fetch(`${baseUrl}/api/identities`, { method: 'POST' })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.did).toMatch(/^did:key:z/)
    expect(body.mnemonic.split(' ')).toHaveLength(12)
  })

  it('GET /api/identities/:did resolves identity', async () => {
    const createRes = await fetch(`${baseUrl}/api/identities`, { method: 'POST' })
    const { did } = await createRes.json()
    const res = await fetch(`${baseUrl}/api/identities/${encodeURIComponent(did)}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.did).toBe(did)
  })

  it('GET /api/identities/:did returns 404 for unknown', async () => {
    const res = await fetch(`${baseUrl}/api/identities/${encodeURIComponent('did:key:zUnknown')}`)
    expect(res.status).toBe(404)
  })

  it('POST /api/storage/exports stores bundle', async () => {
    const res = await fetch(`${baseUrl}/api/storage/exports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ciphertext: [1, 2, 3],
        nonce: [4, 5, 6],
        metadata: {
          exportDate: new Date().toISOString(),
          sourceServerId: 's1',
          sourceServerName: 'Test',
          adminDID: 'did:key:zAdmin',
          channelCount: 3,
          messageCount: 50,
          memberCount: 10
        }
      })
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.exportId).toBeTruthy()
  })

  it('GET /api/storage/exports lists by admin DID', async () => {
    const res = await fetch(`${baseUrl}/api/storage/exports?adminDID=${encodeURIComponent('did:key:zAdmin')}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })

  it('POST /api/friends/find returns linked identities', async () => {
    const res = await fetch(`${baseUrl}/api/friends/find`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discordUserIds: ['unknown1'] })
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(typeof body).toBe('object')
  })

  it('POST /api/oauth/initiate returns redirect URL', async () => {
    const res = await fetch(`${baseUrl}/api/oauth/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'discord', userDID: 'did:key:zTest' })
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.redirectUrl).toContain('discord')
    expect(body.state).toBeTruthy()
  })
})
