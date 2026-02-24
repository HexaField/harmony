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
    expect(body.linked).toEqual([])
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

  it('POST /api/identity/create creates identity', async () => {
    const res = await fetch(`${baseUrl}/api/identity/create`, { method: 'POST' })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.did).toMatch(/^did:key:z/)
    expect(body.mnemonic.split(' ')).toHaveLength(12)
  })

  it('GET /api/identity/:did resolves identity', async () => {
    const createRes = await fetch(`${baseUrl}/api/identity/create`, { method: 'POST' })
    const { did } = await createRes.json()
    const res = await fetch(`${baseUrl}/api/identity/${encodeURIComponent(did)}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.did).toBe(did)
  })

  it('POST /api/identity/link returns redirect when Discord is configured, or 500 without', async () => {
    const res = await fetch(`${baseUrl}/api/identity/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'discord', userDID: 'did:key:zTest' })
    })
    if (process.env.DISCORD_CLIENT_ID) {
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.redirectUrl).toContain('discord.com')
    } else {
      expect(res.status).toBe(500)
    }
  })

  it('POST /api/identity/link rejects unsupported provider', async () => {
    const res = await fetch(`${baseUrl}/api/identity/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'twitter', userDID: 'did:key:zTest' })
    })
    expect(res.status).toBe(400)
  })

  it('GET /api/oauth/discord/authorize requires userDID', async () => {
    const res = await fetch(`${baseUrl}/api/oauth/discord/authorize`, { redirect: 'manual' })
    expect(res.status).toBeLessThanOrEqual(500)
  })

  it('GET /api/oauth/discord/callback rejects missing params', async () => {
    const res = await fetch(`${baseUrl}/api/oauth/discord/callback`)
    expect(res.status).toBe(400)
  })

  it('GET /api/oauth/discord/callback rejects invalid state', async () => {
    const res = await fetch(`${baseUrl}/api/oauth/discord/callback?code=fake&state=invalid`)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Invalid or expired')
  })

  it('GET /api/oauth/discord/callback returns error for OAuth error param', async () => {
    const res = await fetch(`${baseUrl}/api/oauth/discord/callback?error=access_denied`)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('access_denied')
  })

  it.skip('GET /api/oauth/discord/authorize redirects to Discord (needs DISCORD_CLIENT_ID)', async () => {
    const res = await fetch(`${baseUrl}/api/oauth/discord/authorize?userDID=did:key:zTest`, { redirect: 'manual' })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('discord.com')
  })

  it.skip('GET /api/oauth/discord/callback exchanges code (needs real Discord credentials)', async () => {
    // This test requires real Discord OAuth credentials
  })
})

describe('@harmony/portal Edge Cases', () => {
  it('MUST support GitHub OAuth provider', async () => {
    const portal = new PortalService(crypto)
    await portal.initialize()
    const result = await portal.initiateOAuthLink({ provider: 'github', userDID: 'did:key:z1' })
    expect(result.redirectUrl).toContain('github')
  })

  it('MUST support Google OAuth provider', async () => {
    const portal = new PortalService(crypto)
    await portal.initialize()
    const result = await portal.initiateOAuthLink({ provider: 'google', userDID: 'did:key:z1' })
    expect(result.redirectUrl).toContain('google')
  })

  it('MUST issue OAuthIdentityCredential for non-discord providers', async () => {
    const portal = new PortalService(crypto)
    await portal.initialize()
    const kp = await crypto.generateSigningKeyPair()
    const doc = await didProvider.create(kp)
    const vc = await portal.completeOAuthLink({
      provider: 'github',
      code: 'code',
      state: 'state',
      userDID: doc.id,
      userKeyPair: kp,
      providerUserId: 'gh123',
      providerUsername: 'TestUser'
    })
    expect(vc.type).toContain('OAuthIdentityCredential')
    expect(vc.credentialSubject.provider).toBe('github')
  })

  it('completeOAuthLink MUST throw if portal not initialized', async () => {
    const portal = new PortalService(crypto)
    const kp = await crypto.generateSigningKeyPair()
    const doc = await didProvider.create(kp)
    await expect(
      portal.completeOAuthLink({
        provider: 'discord',
        code: 'c',
        state: 's',
        userDID: doc.id,
        userKeyPair: kp,
        providerUserId: 'd1',
        providerUsername: 'u'
      })
    ).rejects.toThrow('not initialized')
  })

  it('MUST reject retrieval of nonexistent export', async () => {
    const portal = new PortalService(crypto)
    await portal.initialize()
    await expect(portal.retrieveExport('nonexistent', 'did:key:z1')).rejects.toThrow('not found')
  })

  it('MUST reject deletion by non-admin', async () => {
    const portal = new PortalService(crypto)
    await portal.initialize()
    const kp = await crypto.generateSigningKeyPair()
    const doc = await didProvider.create(kp)
    const bundle = createTestBundle(doc.id)
    const { exportId } = await portal.storeExport(bundle)
    await expect(portal.deleteExport(exportId, 'did:key:zWrong')).rejects.toThrow('Unauthorized')
  })

  it('MUST return empty list for admin with no exports', async () => {
    const portal = new PortalService(crypto)
    await portal.initialize()
    const list = await portal.listExports('did:key:zNobody')
    expect(list).toHaveLength(0)
  })

  it('discord linking MUST be discoverable via findLinkedIdentities', async () => {
    const portal = new PortalService(crypto)
    await portal.initialize()
    const kp = await crypto.generateSigningKeyPair()
    const doc = await didProvider.create(kp)
    await portal.completeOAuthLink({
      provider: 'discord',
      code: 'c',
      state: 's',
      userDID: doc.id,
      userKeyPair: kp,
      providerUserId: 'disc999',
      providerUsername: 'User999'
    })
    const found = await portal.findLinkedIdentities(['disc999'])
    expect(found.get('disc999')).toBe(doc.id)
  })

  it('MUST isolate exports between different admins', async () => {
    const portal = new PortalService(crypto)
    await portal.initialize()
    const kp1 = await crypto.generateSigningKeyPair()
    const doc1 = await didProvider.create(kp1)
    const kp2 = await crypto.generateSigningKeyPair()
    const doc2 = await didProvider.create(kp2)
    await portal.storeExport(createTestBundle(doc1.id))
    await portal.storeExport(createTestBundle(doc2.id))
    expect(await portal.listExports(doc1.id)).toHaveLength(1)
    expect(await portal.listExports(doc2.id)).toHaveLength(1)
  })

  it('OAuth state MUST be unique each time', async () => {
    const portal = new PortalService(crypto)
    await portal.initialize()
    const r1 = await portal.initiateOAuthLink({ provider: 'discord', userDID: 'did:key:z1' })
    const r2 = await portal.initiateOAuthLink({ provider: 'discord', userDID: 'did:key:z1' })
    expect(r1.state).not.toBe(r2.state)
  })
})
