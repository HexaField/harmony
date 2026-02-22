import { describe, it, expect } from 'vitest'
import {
  createCLIContext,
  identityCreate,
  identityRecover,
  identityShow,
  storeQuery,
  storeExport,
  storeImport
} from '../src/index.js'

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
})
