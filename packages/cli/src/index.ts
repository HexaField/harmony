import { createCryptoProvider, type CryptoProvider } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import { VCService } from '@harmony/vc'
import { ZCAPService } from '@harmony/zcap'
import { IdentityManager, type Identity } from '@harmony/identity'
import { MemoryQuadStore, type QuadStore } from '@harmony/quads'
import { MigrationService } from '@harmony/migration'
import { CloudService } from '@harmony/cloud'

export interface CLIContext {
  crypto: CryptoProvider
  identityManager: IdentityManager
  didProvider: DIDKeyProvider
  vcService: VCService
  zcapService: ZCAPService
  store: QuadStore
  cloud: CloudService
  migration: MigrationService
}

export function createCLIContext(): CLIContext {
  const crypto = createCryptoProvider()
  return {
    crypto,
    identityManager: new IdentityManager(crypto),
    didProvider: new DIDKeyProvider(crypto),
    vcService: new VCService(crypto),
    zcapService: new ZCAPService(crypto),
    store: new MemoryQuadStore(),
    cloud: new CloudService(crypto),
    migration: new MigrationService(crypto)
  }
}

export interface CommandResult {
  success: boolean
  message: string
  data?: unknown
}

export async function identityCreate(ctx: CLIContext): Promise<CommandResult> {
  const { identity, mnemonic } = await ctx.identityManager.create()
  return {
    success: true,
    message: `Identity created: ${identity.did}`,
    data: { did: identity.did, mnemonic }
  }
}

export async function identityRecover(ctx: CLIContext, mnemonic: string): Promise<CommandResult> {
  const { identity } = await ctx.identityManager.createFromMnemonic(mnemonic)
  return {
    success: true,
    message: `Identity recovered: ${identity.did}`,
    data: { did: identity.did }
  }
}

export async function identityShow(identity: Identity): Promise<CommandResult> {
  return {
    success: true,
    message: `DID: ${identity.did}\nCredentials: ${identity.credentials.length}\nCapabilities: ${identity.capabilities.length}`,
    data: identity
  }
}

export async function storeQuery(
  ctx: CLIContext,
  pattern: { subject?: string; predicate?: string }
): Promise<CommandResult> {
  const results = await ctx.store.match(pattern)
  return {
    success: true,
    message: `Found ${results.length} quads`,
    data: results
  }
}

export async function storeExport(ctx: CLIContext, _format: string = 'nquads'): Promise<CommandResult> {
  const nquads = await ctx.store.exportNQuads()
  return {
    success: true,
    message: nquads || '(empty store)',
    data: nquads
  }
}

export async function storeImport(ctx: CLIContext, nquads: string): Promise<CommandResult> {
  await ctx.store.importNQuads(nquads)
  const count = await ctx.store.count()
  return {
    success: true,
    message: `Imported. Store now has ${count} quads.`,
    data: { count }
  }
}
