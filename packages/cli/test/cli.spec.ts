import { describe, it, expect } from 'vitest'
import {
  createCLIContext,
  identityCreate,
  identityRecover,
  identityShow,
  storeQuery,
  storeExport,
  storeImport,
  type CLIContext
} from '../src/index.js'

describe('CLI Context', () => {
  it('creates context with all services', () => {
    const ctx = createCLIContext()
    expect(ctx.crypto).toBeDefined()
    expect(ctx.identityManager).toBeDefined()
    expect(ctx.didProvider).toBeDefined()
    expect(ctx.vcService).toBeDefined()
    expect(ctx.zcapService).toBeDefined()
    expect(ctx.store).toBeDefined()
    expect(ctx.portal).toBeDefined()
    expect(ctx.migration).toBeDefined()
  })
})

describe('Identity commands', () => {
  it('identityCreate returns DID and mnemonic', async () => {
    const ctx = createCLIContext()
    const result = await identityCreate(ctx)
    expect(result.success).toBe(true)
    expect(result.message).toContain('did:key:')
    const data = result.data as { did: string; mnemonic: string }
    expect(data.did).toMatch(/^did:key:/)
    expect(data.mnemonic.split(/\s+/).length).toBe(12)
  })

  it('identityRecover produces same DID for same mnemonic', async () => {
    const ctx = createCLIContext()
    const created = await identityCreate(ctx)
    const mnemonic = (created.data as { mnemonic: string }).mnemonic

    const ctx2 = createCLIContext()
    const recovered = await identityRecover(ctx2, mnemonic)
    expect(recovered.success).toBe(true)
    expect((recovered.data as { did: string }).did).toBe((created.data as { did: string }).did)
  })

  it('identityShow returns formatted output', async () => {
    const ctx = createCLIContext()
    const { data } = await identityCreate(ctx)
    const { identity } = await ctx.identityManager.createFromMnemonic((data as any).mnemonic)
    const result = await identityShow(identity)
    expect(result.success).toBe(true)
    expect(result.message).toContain('DID:')
    expect(result.message).toContain('Credentials:')
  })
})

describe('Store commands', () => {
  it('storeExport on empty store', async () => {
    const ctx = createCLIContext()
    const result = await storeExport(ctx)
    expect(result.success).toBe(true)
    expect(result.message).toContain('empty')
  })

  it('storeImport and storeQuery', async () => {
    const ctx = createCLIContext()
    const nquads = '<http://s1> <http://p1> <http://o1> <http://g1> .'
    const importResult = await storeImport(ctx, nquads)
    expect(importResult.success).toBe(true)

    const queryResult = await storeQuery(ctx, { subject: 'http://s1' })
    expect(queryResult.success).toBe(true)
    expect((queryResult.data as any[]).length).toBeGreaterThan(0)
  })

  it('storeQuery with no matches', async () => {
    const ctx = createCLIContext()
    const result = await storeQuery(ctx, { subject: 'nonexistent' })
    expect(result.success).toBe(true)
    expect(result.message).toContain('0')
  })
})
