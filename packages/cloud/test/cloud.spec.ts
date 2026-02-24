import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { createCryptoProvider } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import { VCService } from '@harmony/vc'
import { IdentityManager } from '@harmony/identity'
import { CloudIdentityService } from '../src/identity-service.js'
import { HostingService } from '../src/hosting-service.js'
import { DiscordLinkService } from '../src/discord-link.js'
import { RecoveryService } from '../src/recovery.js'
import { rateLimitMiddleware } from '../src/middleware/rate-limit.js'
import { vpAuthMiddleware } from '../src/middleware/auth.js'

const crypto = createCryptoProvider()
const didProvider = new DIDKeyProvider(crypto)
const vcService = new VCService(crypto)

describe('@harmony/cloud', () => {
  describe('CloudIdentityService', () => {
    let service: CloudIdentityService

    beforeEach(async () => {
      service = new CloudIdentityService(crypto)
      await service.initialize()
    })

    it('MUST create identity with DID and mnemonic', async () => {
      const result = await service.createIdentity()
      expect(result.identity.did).toMatch(/^did:key:z/)
      expect(result.mnemonic.split(' ')).toHaveLength(12)
      expect(result.keyPair.publicKey).toHaveLength(32)
      expect(result.keyPair.secretKey).toHaveLength(32)
    })

    it('MUST resolve a created identity', async () => {
      const { identity } = await service.createIdentity()
      const resolved = await service.resolveIdentity(identity.did)
      expect(resolved).not.toBeNull()
      expect(resolved!.did).toBe(identity.did)
    })

    it('MUST return null for unknown DID', async () => {
      const resolved = await service.resolveIdentity('did:key:zUnknown')
      expect(resolved).toBeNull()
    })

    it('MUST issue identity credentials signed by cloud DID', async () => {
      const { identity } = await service.createIdentity()
      const vc = await service.issueIdentityCredential({
        subjectDID: identity.did,
        type: 'TestCredential',
        claims: { role: 'admin' }
      })
      expect(vc.issuer).toBe(service.getCloudDID())
      expect(vc.type).toContain('TestCredential')
      expect(vc.credentialSubject.id).toBe(identity.did)
      expect(vc.credentialSubject.role).toBe('admin')
      expect(vc.proof).toBeDefined()
      expect(vc.proof.type).toBe('Ed25519Signature2020')
    })

    it('MUST verify credentials it issued', async () => {
      const { identity } = await service.createIdentity()
      const vc = await service.issueIdentityCredential({
        subjectDID: identity.did,
        type: 'MemberCredential',
        claims: { level: 'gold' }
      })
      const valid = await service.verifyCredential(vc)
      expect(valid).toBe(true)
    })

    it('MUST issue credential with expiration date', async () => {
      const { identity } = await service.createIdentity()
      const future = new Date(Date.now() + 86400000).toISOString()
      const vc = await service.issueIdentityCredential({
        subjectDID: identity.did,
        type: 'TimedCredential',
        claims: {},
        expirationDate: future
      })
      expect(vc.expirationDate).toBe(future)
    })

    it('MUST reject verification of expired credential', async () => {
      const { identity } = await service.createIdentity()
      const past = new Date(Date.now() - 86400000).toISOString()
      const vc = await service.issueIdentityCredential({
        subjectDID: identity.did,
        type: 'ExpiredCredential',
        claims: {},
        expirationDate: past
      })
      const valid = await service.verifyCredential(vc)
      expect(valid).toBe(false)
    })

    it('MUST throw if not initialized', async () => {
      const uninitService = new CloudIdentityService(crypto)
      await expect(
        uninitService.issueIdentityCredential({
          subjectDID: 'did:key:z123',
          type: 'Test',
          claims: {}
        })
      ).rejects.toThrow('not initialized')
    })
  })

  describe('DiscordLinkService', () => {
    let discordLink: DiscordLinkService
    let cloudKeyPair: Awaited<ReturnType<typeof crypto.generateSigningKeyPair>>
    let cloudDID: string

    beforeEach(async () => {
      discordLink = new DiscordLinkService(crypto)
      cloudKeyPair = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(cloudKeyPair)
      cloudDID = doc.id
      await discordLink.initialize(cloudDID, cloudKeyPair)
    })

    it('MUST generate OAuth redirect URL with state', () => {
      const result = discordLink.initiateLink({
        userDID: 'did:key:zUser1',
        clientId: 'client123',
        redirectUri: 'https://example.com/callback'
      })
      expect(result.redirectUrl).toContain('discord.com')
      expect(result.redirectUrl).toContain('client123')
      expect(result.redirectUrl).toContain(encodeURIComponent('https://example.com/callback'))
      expect(result.state).toHaveLength(32) // 16 bytes hex
    })

    it('MUST complete link and issue DiscordIdentityCredential', async () => {
      const link = discordLink.initiateLink({
        userDID: 'did:key:zUser1',
        clientId: 'c1',
        redirectUri: 'https://example.com/cb'
      })
      const { vc, userDID } = await discordLink.completeLink({
        state: link.state,
        discordProfile: { userId: 'discord456', username: 'TestUser#1234' }
      })
      expect(userDID).toBe('did:key:zUser1')
      expect(vc.type).toContain('DiscordIdentityCredential')
      expect(vc.credentialSubject.discordUserId).toBe('discord456')
      expect(vc.credentialSubject.discordUsername).toBe('TestUser#1234')
      expect(vc.issuer).toBe(cloudDID)
    })

    it('MUST reject invalid OAuth state', async () => {
      await expect(
        discordLink.completeLink({
          state: 'nonexistent',
          discordProfile: { userId: '1', username: 'x' }
        })
      ).rejects.toThrow('Invalid or expired OAuth state')
    })

    it('MUST lookup DID by Discord ID after linking', async () => {
      const link = discordLink.initiateLink({
        userDID: 'did:key:zLinked',
        clientId: 'c1',
        redirectUri: 'https://x.com/cb'
      })
      await discordLink.completeLink({
        state: link.state,
        discordProfile: { userId: 'disc789', username: 'Linked' }
      })
      expect(discordLink.lookupByDiscordId('disc789')).toBe('did:key:zLinked')
      expect(discordLink.lookupByDID('did:key:zLinked')).toBe('disc789')
    })

    it('MUST return null for unlinked Discord ID', () => {
      expect(discordLink.lookupByDiscordId('unknown')).toBeNull()
    })

    it.skip('GET /api/oauth/discord/authorize redirects to Discord (needs DISCORD_CLIENT_ID)', async () => {
      // Requires DISCORD_CLIENT_ID and DISCORD_REDIRECT_URI env vars
    })

    it.skip('GET /api/oauth/discord/callback exchanges real code (needs Discord credentials)', async () => {
      // Requires real Discord OAuth credentials
    })

    it('MUST consume state after use (prevent replay)', async () => {
      const link = discordLink.initiateLink({
        userDID: 'did:key:z1',
        clientId: 'c',
        redirectUri: 'https://x.com'
      })
      await discordLink.completeLink({
        state: link.state,
        discordProfile: { userId: '1', username: 'x' }
      })
      await expect(
        discordLink.completeLink({
          state: link.state,
          discordProfile: { userId: '1', username: 'x' }
        })
      ).rejects.toThrow('Invalid or expired')
    })
  })

  describe('HostingService', () => {
    let hosting: HostingService
    let ownerDID: string

    beforeEach(async () => {
      hosting = new HostingService(crypto, {
        maxInstancesPerUser: 3,
        defaultMaxStorageBytes: 1024,
        serverRuntimePath: '/nonexistent/harmony-server.js',
        basePort: 19000 + Math.floor(Math.random() * 10000)
      })
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)
      ownerDID = doc.id
    })

    it('MUST create a managed instance', async () => {
      const inst = await hosting.createInstance({ name: 'Test Community', ownerDID })
      expect(inst.id).toMatch(/^inst_/)
      expect(inst.name).toBe('Test Community')
      expect(inst.ownerDID).toBe(ownerDID)
      expect(inst.status).toBe('active')
      expect(inst.storageUsedBytes).toBe(0)
    })

    it('MUST list instances for an owner', async () => {
      await hosting.createInstance({ name: 'A', ownerDID })
      await hosting.createInstance({ name: 'B', ownerDID })
      const list = hosting.listInstances(ownerDID)
      expect(list).toHaveLength(2)
      expect(list.map((i) => i.name).sort()).toEqual(['A', 'B'])
    })

    it('MUST get instance by ID', async () => {
      const inst = await hosting.createInstance({ name: 'Get Test', ownerDID })
      const found = hosting.getInstance(inst.id)
      expect(found).not.toBeNull()
      expect(found!.name).toBe('Get Test')
    })

    it('MUST delete instance and exclude from listings', async () => {
      const inst = await hosting.createInstance({ name: 'ToDelete', ownerDID })
      await hosting.deleteInstance(inst.id, ownerDID)
      const list = hosting.listInstances(ownerDID)
      expect(list).toHaveLength(0)
      // Instance still exists but marked deleted
      const found = hosting.getInstance(inst.id)
      expect(found!.status).toBe('deleted')
    })

    it('MUST reject deletion by non-owner', async () => {
      const inst = await hosting.createInstance({ name: 'Protected', ownerDID })
      await expect(hosting.deleteInstance(inst.id, 'did:key:zOther')).rejects.toThrow('Unauthorized')
    })

    it('MUST enforce instance quota', async () => {
      await hosting.createInstance({ name: '1', ownerDID })
      await hosting.createInstance({ name: '2', ownerDID })
      await hosting.createInstance({ name: '3', ownerDID })
      await expect(hosting.createInstance({ name: '4', ownerDID })).rejects.toThrow('quota exceeded')
    })

    it('MUST suspend an instance', async () => {
      const inst = await hosting.createInstance({ name: 'Suspend', ownerDID })
      await hosting.suspendInstance(inst.id)
      expect(hosting.getInstance(inst.id)!.status).toBe('suspended')
    })

    it('MUST return null serverUrl when server-runtime is unavailable', async () => {
      const inst = await hosting.createInstance({ name: 'No Server', ownerDID })
      // In test env, server-runtime won't be running, so serverUrl should be undefined
      expect(inst.serverUrl).toBeUndefined()
    })

    it('MUST return null from getServerUrl for non-running instance', () => {
      expect(hosting.getServerUrl('nonexistent')).toBeNull()
    })

    it('MUST return unhealthy from getInstanceHealth for non-running instance', async () => {
      const inst = await hosting.createInstance({ name: 'Health Test', ownerDID })
      const health = await hosting.getInstanceHealth(inst.id)
      expect(health.healthy).toBe(false)
      expect(health.connections).toBe(0)
      expect(health.uptime).toBe(0)
    })

    it('MUST clear serverUrl on delete', async () => {
      const inst = await hosting.createInstance({ name: 'Delete URL', ownerDID })
      await hosting.deleteInstance(inst.id, ownerDID)
      const deleted = hosting.getInstance(inst.id)!
      expect(deleted.serverUrl).toBeUndefined()
      expect(deleted.httpUrl).toBeUndefined()
    })

    it('MUST clear serverUrl on suspend', async () => {
      const inst = await hosting.createInstance({ name: 'Suspend URL', ownerDID })
      await hosting.suspendInstance(inst.id)
      const suspended = hosting.getInstance(inst.id)!
      expect(suspended.serverUrl).toBeUndefined()
      expect(suspended.httpUrl).toBeUndefined()
    })

    describe('Encrypted Storage', () => {
      let instanceId: string

      beforeEach(async () => {
        const inst = await hosting.createInstance({ name: 'Storage Test', ownerDID })
        instanceId = inst.id
      })

      it('MUST upload and retrieve encrypted blob', async () => {
        const data = { ciphertext: new Uint8Array([1, 2, 3, 4]), nonce: new Uint8Array([5, 6, 7]) }
        const blob = await hosting.uploadBlob({ instanceId, uploaderDID: ownerDID, data })
        expect(blob.id).toMatch(/^blob_/)
        expect(blob.sizeBytes).toBe(7) // 4 + 3

        const retrieved = hosting.getBlob(blob.id)
        expect(retrieved).not.toBeNull()
        expect(retrieved!.encrypted.ciphertext).toEqual(data.ciphertext)
        expect(retrieved!.encrypted.nonce).toEqual(data.nonce)
      })

      it('MUST track storage usage', async () => {
        const data = { ciphertext: new Uint8Array(100), nonce: new Uint8Array(12) }
        await hosting.uploadBlob({ instanceId, uploaderDID: ownerDID, data })
        const inst = hosting.getInstance(instanceId)!
        expect(inst.storageUsedBytes).toBe(112)
      })

      it('MUST enforce storage quota', async () => {
        // maxStorageBytes is 1024
        const data = { ciphertext: new Uint8Array(1000), nonce: new Uint8Array(12) }
        await hosting.uploadBlob({ instanceId, uploaderDID: ownerDID, data })
        const data2 = { ciphertext: new Uint8Array(100), nonce: new Uint8Array(12) }
        await expect(hosting.uploadBlob({ instanceId, uploaderDID: ownerDID, data: data2 })).rejects.toThrow(
          'Storage quota exceeded'
        )
      })

      it('MUST reject upload to suspended instance', async () => {
        await hosting.suspendInstance(instanceId)
        const data = { ciphertext: new Uint8Array([1]), nonce: new Uint8Array([2]) }
        await expect(hosting.uploadBlob({ instanceId, uploaderDID: ownerDID, data })).rejects.toThrow('not active')
      })

      it('MUST delete blob and reclaim storage', async () => {
        const data = { ciphertext: new Uint8Array(50), nonce: new Uint8Array(12) }
        const blob = await hosting.uploadBlob({ instanceId, uploaderDID: ownerDID, data })
        expect(hosting.getInstance(instanceId)!.storageUsedBytes).toBe(62)

        await hosting.deleteBlob(blob.id, ownerDID)
        expect(hosting.getBlob(blob.id)).toBeNull()
        expect(hosting.getInstance(instanceId)!.storageUsedBytes).toBe(0)
      })

      it('MUST reject blob deletion by unauthorized user', async () => {
        const data = { ciphertext: new Uint8Array([1]), nonce: new Uint8Array([2]) }
        const blob = await hosting.uploadBlob({ instanceId, uploaderDID: ownerDID, data })
        await expect(hosting.deleteBlob(blob.id, 'did:key:zStranger')).rejects.toThrow('Unauthorized')
      })

      it('MUST list blobs for an instance', async () => {
        const d1 = { ciphertext: new Uint8Array([1]), nonce: new Uint8Array([2]) }
        const d2 = { ciphertext: new Uint8Array([3]), nonce: new Uint8Array([4]) }
        await hosting.uploadBlob({ instanceId, uploaderDID: ownerDID, data: d1 })
        await hosting.uploadBlob({ instanceId, uploaderDID: ownerDID, data: d2 })
        const blobs = hosting.listBlobs(instanceId)
        expect(blobs).toHaveLength(2)
      })

      it('MUST clean up blobs when instance is deleted', async () => {
        const data = { ciphertext: new Uint8Array([1]), nonce: new Uint8Array([2]) }
        const blob = await hosting.uploadBlob({ instanceId, uploaderDID: ownerDID, data })
        await hosting.deleteInstance(instanceId, ownerDID)
        expect(hosting.getBlob(blob.id)).toBeNull()
        expect(hosting.listBlobs(instanceId)).toHaveLength(0)
      })
    })
  })

  describe('RecoveryService', () => {
    let recovery: RecoveryService
    let identityManager: IdentityManager

    beforeEach(() => {
      recovery = new RecoveryService(crypto)
      identityManager = new IdentityManager(crypto)
    })

    it('MUST setup social recovery with threshold', async () => {
      const { identity, keyPair } = await identityManager.create()
      const trustedKP1 = await crypto.generateSigningKeyPair()
      const trustedDoc1 = await didProvider.create(trustedKP1)
      const trustedKP2 = await crypto.generateSigningKeyPair()
      const trustedDoc2 = await didProvider.create(trustedKP2)

      const config = await recovery.setupSocialRecovery({
        identity,
        trustedDIDs: [trustedDoc1.id, trustedDoc2.id],
        threshold: 2,
        keyPair
      })

      expect(config.trustedDIDs).toHaveLength(2)
      expect(config.threshold).toBe(2)
      expect(config.configuredBy).toBe(identity.did)
    })

    it('MUST reject threshold greater than trusted DIDs', async () => {
      const { identity, keyPair } = await identityManager.create()
      await expect(
        recovery.setupSocialRecovery({
          identity,
          trustedDIDs: ['did:key:z1'],
          threshold: 5,
          keyPair
        })
      ).rejects.toThrow('Threshold cannot exceed')
    })

    it('MUST reject threshold of 0', async () => {
      const { identity, keyPair } = await identityManager.create()
      await expect(
        recovery.setupSocialRecovery({
          identity,
          trustedDIDs: ['did:key:z1'],
          threshold: 0,
          keyPair
        })
      ).rejects.toThrow('at least 1')
    })

    it('MUST reject empty trusted DIDs', async () => {
      const { identity, keyPair } = await identityManager.create()
      await expect(
        recovery.setupSocialRecovery({
          identity,
          trustedDIDs: [],
          threshold: 1,
          keyPair
        })
      ).rejects.toThrow('at least one trusted')
    })

    it('MUST complete full social recovery flow', async () => {
      // Setup
      const { identity, keyPair } = await identityManager.create()
      const trusted1KP = await crypto.generateSigningKeyPair()
      const trusted1Doc = await didProvider.create(trusted1KP)
      const trusted2KP = await crypto.generateSigningKeyPair()
      const trusted2Doc = await didProvider.create(trusted2KP)

      await recovery.setupSocialRecovery({
        identity,
        trustedDIDs: [trusted1Doc.id, trusted2Doc.id],
        threshold: 2,
        keyPair
      })

      // Initiate
      const recovererKP = await crypto.generateSigningKeyPair()
      const request = await recovery.initiateRecovery({
        claimedDID: identity.did,
        recovererKeyPair: recovererKP
      })
      expect(request.claimedDID).toBe(identity.did)

      // Approve
      const approval1 = await identityManager.approveRecovery({
        request,
        approverDID: trusted1Doc.id,
        approverKeyPair: trusted1KP
      })
      const result1 = await recovery.submitApproval(approval1)
      expect(result1.approved).toBe(false)
      expect(result1.approvalsCount).toBe(1)

      const approval2 = await identityManager.approveRecovery({
        request,
        approverDID: trusted2Doc.id,
        approverKeyPair: trusted2KP
      })
      const result2 = await recovery.submitApproval(approval2)
      expect(result2.approved).toBe(true)
      expect(result2.approvalsCount).toBe(2)

      // Complete
      const newKP = await crypto.generateSigningKeyPair()
      const recovered = await recovery.completeRecovery({
        requestId: request.id,
        newKeyPair: newKP
      })
      expect(recovered.identity.did).toMatch(/^did:key:z/)
      expect(recovered.keyPair).toBe(newKP)
    })

    it('MUST reject recovery initiation without config', async () => {
      const kp = await crypto.generateSigningKeyPair()
      await expect(
        recovery.initiateRecovery({
          claimedDID: 'did:key:zNonexistent',
          recovererKeyPair: kp
        })
      ).rejects.toThrow('No recovery config')
    })

    it('MUST reject duplicate approvals', async () => {
      const { identity, keyPair } = await identityManager.create()
      const trustedKP = await crypto.generateSigningKeyPair()
      const trustedDoc = await didProvider.create(trustedKP)

      await recovery.setupSocialRecovery({
        identity,
        trustedDIDs: [trustedDoc.id],
        threshold: 1,
        keyPair
      })

      const recovererKP = await crypto.generateSigningKeyPair()
      const request = await recovery.initiateRecovery({
        claimedDID: identity.did,
        recovererKeyPair: recovererKP
      })

      const approval = await identityManager.approveRecovery({
        request,
        approverDID: trustedDoc.id,
        approverKeyPair: trustedKP
      })

      await recovery.submitApproval(approval)
      await expect(recovery.submitApproval(approval)).rejects.toThrow('Duplicate approval')
    })

    it('MUST reject approval from untrusted DID', async () => {
      const { identity, keyPair } = await identityManager.create()
      const trustedKP = await crypto.generateSigningKeyPair()
      const trustedDoc = await didProvider.create(trustedKP)

      await recovery.setupSocialRecovery({
        identity,
        trustedDIDs: [trustedDoc.id],
        threshold: 1,
        keyPair
      })

      const recovererKP = await crypto.generateSigningKeyPair()
      const request = await recovery.initiateRecovery({
        claimedDID: identity.did,
        recovererKeyPair: recovererKP
      })

      const untrustedKP = await crypto.generateSigningKeyPair()
      const untrustedDoc = await didProvider.create(untrustedKP)

      await expect(
        recovery.submitApproval({
          requestId: request.id,
          approverDID: untrustedDoc.id,
          approvedAt: new Date().toISOString(),
          proof: {} as any
        })
      ).rejects.toThrow('not a trusted DID')
    })

    it('MUST support OAuth recovery registration and lookup', async () => {
      const { identity } = await identityManager.create()
      await recovery.registerOAuthRecovery({
        did: identity.did,
        provider: 'discord',
        providerUserId: 'disc123'
      })

      const result = await recovery.recoverViaOAuth({
        provider: 'discord',
        providerUserId: 'disc123'
      })
      expect(result).not.toBeNull()
      expect(result!.identity.did).toMatch(/^did:key:z/)
    })

    it('MUST return null for unknown OAuth recovery', async () => {
      const result = await recovery.recoverViaOAuth({
        provider: 'discord',
        providerUserId: 'unknown'
      })
      expect(result).toBeNull()
    })
  })

  describe('VP Authentication Middleware', () => {
    it('MUST reject requests without Authorization header', async () => {
      const middleware = vpAuthMiddleware(crypto)
      const req = { headers: {} } as any
      const res = {
        status: (code: number) => {
          res._status = code
          return res
        },
        json: (data: any) => {
          res._json = data
        },
        _status: 0,
        _json: null as any
      }
      const next = () => {
        res._status = 200
      }

      await middleware(req, res as any, next)
      expect(res._status).toBe(401)
      expect(res._json.error).toContain('Missing VP')
    })

    it('MUST reject invalid VP in header', async () => {
      const middleware = vpAuthMiddleware(crypto)
      const invalidVP = Buffer.from(JSON.stringify({ type: ['Invalid'] })).toString('base64')
      const req = { headers: { authorization: `Bearer ${invalidVP}` } } as any
      const res = {
        status: (code: number) => {
          res._status = code
          return res
        },
        json: (data: any) => {
          res._json = data
        },
        _status: 0,
        _json: null as any
      }
      const next = () => {
        res._status = 200
      }

      await middleware(req, res as any, next)
      expect(res._status).toBe(401)
    })

    it('MUST authenticate valid VP and set holderDID', async () => {
      const middleware = vpAuthMiddleware(crypto)
      const kp = await crypto.generateSigningKeyPair()
      const doc = await didProvider.create(kp)

      // Create a valid VP
      const vp = await vcService.present({
        holderDID: doc.id,
        holderKeyPair: kp,
        credentials: []
      })

      const vpBase64 = Buffer.from(JSON.stringify(vp)).toString('base64')
      const req = { headers: { authorization: `Bearer ${vpBase64}` } } as any
      const res = {
        status: (code: number) => {
          res._status = code
          return res
        },
        json: (data: any) => {
          res._json = data
        },
        _status: 0,
        _json: null as any
      }
      let nextCalled = false
      const next = () => {
        nextCalled = true
      }

      await middleware(req, res as any, next)
      expect(nextCalled).toBe(true)
      expect(req.holderDID).toBe(doc.id)
      expect(req.presentation).toBeDefined()
    })
  })

  describe('Rate Limiting', () => {
    it('MUST allow requests within limit', () => {
      const middleware = rateLimitMiddleware({ windowMs: 60000, maxRequests: 3 })
      const req = { ip: '127.0.0.1' } as any
      const headers: Record<string, any> = {}
      const res = {
        setHeader: (k: string, v: any) => {
          headers[k] = v
        },
        status: () => res,
        json: () => {}
      } as any
      let nextCount = 0
      const next = () => {
        nextCount++
      }

      middleware(req, res, next)
      middleware(req, res, next)
      middleware(req, res, next)
      expect(nextCount).toBe(3)
    })

    it('MUST block requests exceeding limit', () => {
      const middleware = rateLimitMiddleware({ windowMs: 60000, maxRequests: 2 })
      const req = { ip: '127.0.0.1' } as any
      const headers: Record<string, any> = {}
      let blocked = false
      let statusCode = 0
      const res = {
        setHeader: (k: string, v: any) => {
          headers[k] = v
        },
        status: (code: number) => {
          statusCode = code
          return res
        },
        json: (data: any) => {
          blocked = data.error?.includes('Rate limit')
        }
      } as any
      let nextCount = 0
      const next = () => {
        nextCount++
      }

      middleware(req, res, next)
      middleware(req, res, next)
      middleware(req, res, next) // should be blocked
      expect(nextCount).toBe(2)
      expect(statusCode).toBe(429)
      expect(blocked).toBe(true)
    })

    it('MUST set rate limit headers', () => {
      const middleware = rateLimitMiddleware({ windowMs: 60000, maxRequests: 5 })
      const req = { ip: '10.0.0.1' } as any
      const headers: Record<string, any> = {}
      const res = {
        setHeader: (k: string, v: any) => {
          headers[k] = v
        },
        status: () => res,
        json: () => {}
      } as any

      middleware(req, res, () => {})
      expect(headers['X-RateLimit-Limit']).toBe(5)
      expect(headers['X-RateLimit-Remaining']).toBe(4)
      expect(headers['X-RateLimit-Reset']).toBeDefined()
    })

    it('MUST track rate limits per identity (holderDID)', () => {
      const middleware = rateLimitMiddleware({ windowMs: 60000, maxRequests: 1 })
      const req1 = { ip: '1.1.1.1', holderDID: 'did:key:zA' } as any
      const req2 = { ip: '1.1.1.1', holderDID: 'did:key:zB' } as any
      const res = {
        setHeader: () => {},
        status: () => res,
        json: () => {}
      } as any
      let nextCount = 0
      const next = () => {
        nextCount++
      }

      middleware(req1, res, next)
      middleware(req2, res, next)
      expect(nextCount).toBe(2) // different identities, both allowed
    })
  })
})
