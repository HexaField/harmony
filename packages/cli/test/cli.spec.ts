import { describe, it, expect } from 'vitest'
import {
  createCLIContext,
  identityCreate,
  identityRecover,
  identityShow,
  identityLinkDiscord,
  identityExport,
  identityImport,
  communityExport,
  communityImport,
  communityPush,
  communityPull,
  communityResign,
  communityDeleteRemote,
  friendsFind,
  friendsList,
  storeQuery,
  storeExport,
  storeImport
} from '../src/index.js'
import type { DiscordServerExport } from '@harmony/migration'

describe('@harmony/cli', () => {
  describe('identity create', () => {
    it('MUST create identity and return DID + mnemonic', async () => {
      const ctx = createCLIContext()
      const result = await identityCreate(ctx)
      expect(result.success).toBe(true)
      expect(result.data).toHaveProperty('did')
      expect(result.data).toHaveProperty('mnemonic')
      expect((result.data as any).did).toMatch(/^did:key:z/)
    })
  })

  describe('identity recover', () => {
    it('MUST recover identity from mnemonic', async () => {
      const ctx = createCLIContext()
      const created = await identityCreate(ctx)
      const mnemonic = (created.data as any).mnemonic
      const recovered = await identityRecover(ctx, mnemonic)
      expect(recovered.success).toBe(true)
      expect((recovered.data as any).did).toBe((created.data as any).did)
    })
  })

  describe('identity show', () => {
    it('MUST display identity info', async () => {
      const ctx = createCLIContext()
      const { identity } = await ctx.identityManager.create()
      const result = await identityShow(identity)
      expect(result.success).toBe(true)
      expect(result.message).toContain(identity.did)
    })
  })

  describe('store query', () => {
    it('MUST query quad store by pattern', async () => {
      const ctx = createCLIContext()
      await ctx.store.add({ subject: 's:1', predicate: 'p:name', object: { value: 'test' }, graph: 'g:1' })
      const result = await storeQuery(ctx, { subject: 's:1' })
      expect(result.success).toBe(true)
      expect((result.data as any[]).length).toBe(1)
    })
  })

  describe('store export/import', () => {
    it('MUST export and import N-Quads', async () => {
      const ctx = createCLIContext()
      await ctx.store.add({
        subject: 'http://ex.org/s',
        predicate: 'http://ex.org/p',
        object: 'http://ex.org/o',
        graph: 'http://ex.org/g'
      })
      const exported = await storeExport(ctx)
      expect(exported.success).toBe(true)

      const ctx2 = createCLIContext()
      const imported = await storeImport(ctx2, exported.data as string)
      expect(imported.success).toBe(true)
      expect((imported.data as any).count).toBe(1)
    })
  })

  describe('identity link discord', () => {
    it('MUST initiate OAuth linking and return redirect URL', async () => {
      const ctx = createCLIContext()
      const result = await identityLinkDiscord(ctx, 'did:key:zTest')
      expect(result.success).toBe(true)
      expect((result.data as any).redirectUrl).toContain('discord')
      expect((result.data as any).state).toBeTruthy()
    })
  })

  describe('identity export/import', () => {
    it('MUST export and import identity via sync chain', async () => {
      const ctx = createCLIContext()
      const { identity, keyPair, mnemonic } = await ctx.identityManager.create()
      const exportResult = await identityExport(ctx, identity, keyPair)
      expect(exportResult.success).toBe(true)

      const importResult = await identityImport(ctx, (exportResult.data as any).payload, mnemonic)
      expect(importResult.success).toBe(true)
      expect((importResult.data as any).did).toBe(identity.did)
    })
  })

  describe('community export', () => {
    it('MUST export server data as encrypted bundle', async () => {
      const ctx = createCLIContext()
      const { identity, keyPair } = await ctx.identityManager.create()
      const serverExport: DiscordServerExport = {
        server: { id: 's1', name: 'Test', ownerId: 'u1' },
        channels: [{ id: 'ch1', name: 'general', type: 'text' }],
        roles: [],
        members: [{ userId: 'u1', username: 'Admin', roles: [], joinedAt: '2023-01-01T00:00:00Z' }],
        messages: new Map(),
        pins: new Map()
      }
      const result = await communityExport(ctx, serverExport, identity.did, keyPair)
      expect(result.success).toBe(true)
      expect((result.data as any).bundle.ciphertext).toBeInstanceOf(Uint8Array)
    })
  })

  describe('community import', () => {
    it('MUST decrypt and import bundle into local store', async () => {
      const ctx = createCLIContext()
      const { identity, keyPair } = await ctx.identityManager.create()
      const serverExport: DiscordServerExport = {
        server: { id: 's1', name: 'Test', ownerId: 'u1' },
        channels: [{ id: 'ch1', name: 'general', type: 'text' }],
        roles: [],
        members: [{ userId: 'u1', username: 'Admin', roles: [], joinedAt: '2023-01-01T00:00:00Z' }],
        messages: new Map(),
        pins: new Map()
      }
      const expResult = await communityExport(ctx, serverExport, identity.did, keyPair)
      const bundle = (expResult.data as any).bundle
      const result = await communityImport(ctx, bundle, keyPair)
      expect(result.success).toBe(true)
      expect((result.data as any).count).toBeGreaterThan(0)
    })
  })

  describe('community push/pull', () => {
    it('MUST push and pull from portal', async () => {
      const ctx = createCLIContext()
      const { identity, keyPair } = await ctx.identityManager.create()
      const serverExport: DiscordServerExport = {
        server: { id: 's1', name: 'Test', ownerId: 'u1' },
        channels: [],
        roles: [],
        members: [],
        messages: new Map(),
        pins: new Map()
      }
      const expResult = await communityExport(ctx, serverExport, identity.did, keyPair)
      const bundle = (expResult.data as any).bundle

      const pushResult = await communityPush(ctx, bundle)
      expect(pushResult.success).toBe(true)
      const exportId = (pushResult.data as any).exportId

      const pullResult = await communityPull(ctx, exportId, identity.did)
      expect(pullResult.success).toBe(true)
      expect((pullResult.data as any).bundle.metadata).toBeDefined()
    })
  })

  describe('community resign', () => {
    it('MUST re-sign VCs for new service endpoint', async () => {
      const ctx = createCLIContext()
      const { identity, keyPair } = await ctx.identityManager.create()
      const serverExport: DiscordServerExport = {
        server: { id: 's1', name: 'Test', ownerId: 'u1' },
        channels: [],
        roles: [],
        members: [{ userId: 'u1', username: 'Admin', roles: [], joinedAt: '2023-01-01T00:00:00Z' }],
        messages: new Map(),
        pins: new Map()
      }
      const { quads } = ctx.migration.transformServerExport(serverExport, identity.did)
      const result = await communityResign(ctx, quads, identity.did, keyPair, 'https://new.example.com')
      expect(result.success).toBe(true)
      expect((result.data as any).reissuedVCs.length).toBeGreaterThan(0)
    })
  })

  describe('community delete-remote', () => {
    it('MUST delete export from portal', async () => {
      const ctx = createCLIContext()
      const { identity, keyPair } = await ctx.identityManager.create()
      const serverExport: DiscordServerExport = {
        server: { id: 's1', name: 'Test', ownerId: 'u1' },
        channels: [],
        roles: [],
        members: [],
        messages: new Map(),
        pins: new Map()
      }
      const expResult = await communityExport(ctx, serverExport, identity.did, keyPair)
      const bundle = (expResult.data as any).bundle
      const pushResult = await communityPush(ctx, bundle)
      const exportId = (pushResult.data as any).exportId

      const result = await communityDeleteRemote(ctx, exportId, identity.did)
      expect(result.success).toBe(true)
    })
  })

  describe('friends find', () => {
    it('MUST find linked Discord identities', async () => {
      const ctx = createCLIContext()
      // No links yet
      const result = await friendsFind(ctx, ['user1', 'user2'])
      expect(result.success).toBe(true)
      expect((result.data as any).linked).toEqual({})
    })
  })

  describe('friends list', () => {
    it('MUST list linked connections', async () => {
      const ctx = createCLIContext()
      const result = await friendsList(ctx, [])
      expect(result.success).toBe(true)
      expect(result.message).toContain('No linked connections')
    })
  })
})
