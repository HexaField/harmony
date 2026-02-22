import { createCryptoProvider, type CryptoProvider, type KeyPair } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import { VCService } from '@harmony/vc'
import { ZCAPService } from '@harmony/zcap'
import { IdentityManager, type Identity } from '@harmony/identity'
import { MemoryQuadStore, type QuadStore } from '@harmony/quads'
import { MigrationService, type EncryptedExportBundle } from '@harmony/migration'
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

// --- Identity commands ---

export async function identityLinkDiscord(ctx: CLIContext, userDID: string): Promise<CommandResult> {
  const { redirectUrl, state } = await ctx.cloud.initiateOAuthLink({ provider: 'discord', userDID })
  return {
    success: true,
    message: `Open this URL to link Discord: ${redirectUrl}`,
    data: { redirectUrl, state }
  }
}

export async function identityExport(ctx: CLIContext, identity: Identity, keyPair: KeyPair): Promise<CommandResult> {
  const payload = await ctx.identityManager.exportSyncPayload(identity, keyPair)
  return {
    success: true,
    message: 'Identity exported as encrypted sync payload',
    data: { payload }
  }
}

export async function identityImport(
  ctx: CLIContext,
  payload: import('@harmony/crypto').EncryptedPayload,
  mnemonic: string
): Promise<CommandResult> {
  const { identity } = await ctx.identityManager.importSyncPayload(payload, mnemonic)
  return {
    success: true,
    message: `Identity imported: ${identity.did}`,
    data: { did: identity.did, identity }
  }
}

// --- Community commands ---

export async function communityExport(
  ctx: CLIContext,
  serverExport: import('@harmony/migration').DiscordServerExport,
  adminDID: string,
  adminKeyPair: KeyPair
): Promise<CommandResult> {
  const { quads, pendingMemberMap } = ctx.migration.transformServerExport(serverExport, adminDID)
  const bundle = await ctx.migration.encryptExport(quads, adminKeyPair, {
    exportDate: new Date().toISOString(),
    sourceServerId: serverExport.server.id,
    sourceServerName: serverExport.server.name,
    adminDID,
    channelCount: serverExport.channels.length,
    messageCount: Array.from(serverExport.messages.values()).reduce((s, m) => s + m.length, 0),
    memberCount: serverExport.members.length
  })
  return {
    success: true,
    message: `Exported ${quads.length} quads, ${pendingMemberMap.size} members`,
    data: { bundle, pendingMemberMap: Object.fromEntries(pendingMemberMap) }
  }
}

export async function communityImport(
  ctx: CLIContext,
  bundle: EncryptedExportBundle,
  adminKeyPair: KeyPair
): Promise<CommandResult> {
  const quads = await ctx.migration.decryptExport(bundle, adminKeyPair)
  await ctx.store.addAll(quads)
  return {
    success: true,
    message: `Imported ${quads.length} quads into local store`,
    data: { count: quads.length }
  }
}

export async function communityPush(ctx: CLIContext, bundle: EncryptedExportBundle): Promise<CommandResult> {
  await ctx.cloud.initialize()
  const { exportId } = await ctx.cloud.storeExport(bundle)
  return {
    success: true,
    message: `Pushed to cloud. Export ID: ${exportId}`,
    data: { exportId }
  }
}

export async function communityPull(ctx: CLIContext, exportId: string, adminDID: string): Promise<CommandResult> {
  await ctx.cloud.initialize()
  const bundle = await ctx.cloud.retrieveExport(exportId, adminDID)
  return {
    success: true,
    message: `Pulled export ${exportId} from cloud`,
    data: { bundle }
  }
}

export async function communityResign(
  ctx: CLIContext,
  quads: import('@harmony/quads').Quad[],
  adminDID: string,
  adminKeyPair: KeyPair,
  newServiceEndpoint: string
): Promise<CommandResult> {
  const result = await ctx.migration.resignCommunityCredentials({
    quads,
    adminDID,
    adminKeyPair,
    newServiceEndpoint
  })
  return {
    success: true,
    message: `Re-signed ${result.reissuedVCs.length} VCs and root capability`,
    data: result
  }
}

export async function communityDeleteRemote(
  ctx: CLIContext,
  exportId: string,
  adminDID: string
): Promise<CommandResult> {
  await ctx.cloud.initialize()
  await ctx.cloud.deleteExport(exportId, adminDID)
  return {
    success: true,
    message: `Deleted export ${exportId} from cloud`,
    data: { exportId }
  }
}

// --- Friends commands ---

export async function friendsFind(ctx: CLIContext, discordUserIds: string[]): Promise<CommandResult> {
  await ctx.cloud.initialize()
  const linked = await ctx.cloud.findLinkedIdentities(discordUserIds)
  return {
    success: true,
    message: `Found ${linked.size} linked identities`,
    data: { linked: Object.fromEntries(linked) }
  }
}

export async function friendsList(ctx: CLIContext, discordUserIds: string[]): Promise<CommandResult> {
  await ctx.cloud.initialize()
  const linked = await ctx.cloud.findLinkedIdentities(discordUserIds)
  const entries = Array.from(linked.entries()).map(([discordId, did]) => ({ discordId, did }))
  return {
    success: true,
    message:
      entries.length > 0 ? entries.map((e) => `${e.discordId} → ${e.did}`).join('\n') : 'No linked connections found',
    data: entries
  }
}
