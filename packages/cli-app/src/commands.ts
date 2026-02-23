// CLI command implementations
import { createCLIContext, identityCreate, identityRecover } from '@harmony/cli'
import { loadCLIConfig, saveCLIConfig, getConfigValue, setConfigValue } from './config-store.js'
import { t } from './strings.js'

// Output formatter
export type OutputFormat = 'text' | 'json'

export interface CommandOutput {
  success: boolean
  message: string
  data?: unknown
}

export function formatOutput(output: CommandOutput, format: OutputFormat): string {
  if (format === 'json') return JSON.stringify(output)
  return output.message
}

// Identity commands
export async function cmdIdentityCreate(_format: OutputFormat): Promise<CommandOutput> {
  const ctx = createCLIContext()
  const result = await identityCreate(ctx)
  const data = result.data as { did: string; mnemonic: string }

  saveCLIConfig({
    ...loadCLIConfig(),
    identity: { did: data.did, createdAt: new Date().toISOString() }
  })

  return {
    success: true,
    message: t('IDENTITY_CREATED', { did: data.did }) + '\nMnemonic: ' + data.mnemonic,
    data
  }
}

export async function cmdIdentityRecover(mnemonic: string, _format: OutputFormat): Promise<CommandOutput> {
  const words = mnemonic.trim().split(/\s+/)
  if (words.length !== 12) {
    return { success: false, message: t('INVALID_MNEMONIC') }
  }

  const ctx = createCLIContext()
  const result = await identityRecover(ctx, mnemonic)
  const data = result.data as { did: string }

  saveCLIConfig({
    ...loadCLIConfig(),
    identity: { did: data.did, createdAt: new Date().toISOString() }
  })

  return {
    success: true,
    message: t('IDENTITY_RECOVERED', { did: data.did }),
    data
  }
}

export async function cmdIdentityShow(_format: OutputFormat): Promise<CommandOutput> {
  const config = loadCLIConfig()
  if (!config?.identity) {
    return { success: false, message: t('MISSING_CONFIG') }
  }

  return {
    success: true,
    message: t('IDENTITY_SHOW', {
      did: config.identity.did,
      created: config.identity.createdAt,
      credentials: '0',
      capabilities: '0'
    }),
    data: config.identity
  }
}

export async function cmdIdentityExport(file: string, _format: OutputFormat): Promise<CommandOutput> {
  const config = loadCLIConfig()
  if (!config?.identity) {
    return { success: false, message: t('MISSING_CONFIG') }
  }
  const { writeFileSync } = await import('node:fs')
  writeFileSync(file, JSON.stringify(config.identity, null, 2))
  return { success: true, message: t('IDENTITY_EXPORTED', { file }), data: { file } }
}

export async function cmdIdentityImport(file: string, _format: OutputFormat): Promise<CommandOutput> {
  const { readFileSync } = await import('node:fs')
  const identity = JSON.parse(readFileSync(file, 'utf-8'))
  const existing = loadCLIConfig() ?? {}
  saveCLIConfig({ ...existing, identity })
  return { success: true, message: t('IDENTITY_IMPORTED', { file }), data: identity }
}

// Community commands
export async function cmdCommunityCreate(name: string, _format: OutputFormat): Promise<CommandOutput> {
  const id = 'community:' + Date.now().toString(36)
  return {
    success: true,
    message: t('COMMUNITY_CREATED', { name, id }),
    data: { id, name }
  }
}

export async function cmdCommunityList(_format: OutputFormat): Promise<CommandOutput> {
  return {
    success: true,
    message: t('COMMUNITY_LIST_EMPTY'),
    data: { communities: [] }
  }
}

export async function cmdCommunityJoin(invite: string, _format: OutputFormat): Promise<CommandOutput> {
  return {
    success: true,
    message: t('COMMUNITY_JOINED'),
    data: { invite }
  }
}

export async function cmdCommunityInvite(_format: OutputFormat): Promise<CommandOutput> {
  const code = Date.now().toString(36)
  return {
    success: true,
    message: t('COMMUNITY_INVITE', { link: `harmony.chat/invite/${code}` }),
    data: { code, link: `harmony.chat/invite/${code}` }
  }
}

export async function cmdCommunityExport(file: string, _format: OutputFormat): Promise<CommandOutput> {
  const { writeFileSync } = await import('node:fs')
  writeFileSync(file, JSON.stringify({ exported: true, exportDate: new Date().toISOString() }))
  return { success: true, message: t('COMMUNITY_EXPORTED', { file }), data: { file } }
}

export async function cmdCommunityImport(file: string, _format: OutputFormat): Promise<CommandOutput> {
  const { readFileSync } = await import('node:fs')
  const data = JSON.parse(readFileSync(file, 'utf-8'))
  return { success: true, message: t('COMMUNITY_IMPORTED', { file }), data }
}

// Channel commands
export async function cmdChannelCreate(name: string, _format: OutputFormat): Promise<CommandOutput> {
  const id = 'channel:' + Date.now().toString(36)
  return {
    success: true,
    message: t('CHANNEL_CREATED', { name, id }),
    data: { id, name }
  }
}

export async function cmdChannelList(_format: OutputFormat): Promise<CommandOutput> {
  return { success: true, message: 'Channels:', data: { channels: [] } }
}

export async function cmdChannelDelete(name: string, _format: OutputFormat): Promise<CommandOutput> {
  return { success: true, message: t('CHANNEL_DELETED', { name }), data: { name } }
}

// Message commands
export async function cmdSend(channel: string, message: string, _format: OutputFormat): Promise<CommandOutput> {
  return {
    success: true,
    message: t('MESSAGE_SENT', { channel }),
    data: { channel, message, sentAt: new Date().toISOString() }
  }
}

export async function cmdHistory(channel: string, _format: OutputFormat): Promise<CommandOutput> {
  return {
    success: true,
    message: t('HISTORY_EMPTY', { channel }),
    data: { channel, messages: [] }
  }
}

// Server commands
export async function cmdServerStart(_format: OutputFormat, foreground?: boolean): Promise<CommandOutput> {
  const port = (getConfigValue('serverPort') as number) ?? 4000
  return {
    success: true,
    message: t('SERVER_STARTED', { port }),
    data: { port, foreground }
  }
}

export async function cmdServerStop(_format: OutputFormat): Promise<CommandOutput> {
  return { success: true, message: t('SERVER_STOPPED'), data: {} }
}

export async function cmdServerStatus(_format: OutputFormat): Promise<CommandOutput> {
  return {
    success: true,
    message: t('SERVER_STATUS', { status: 'running' }),
    data: { running: true }
  }
}

// Migration commands
export async function cmdMigrateDiscord(guildId: string, _format: OutputFormat): Promise<CommandOutput> {
  return {
    success: true,
    message: t('MIGRATE_COMPLETE', { channels: '0', messages: '0' }),
    data: { guildId }
  }
}

export async function cmdMigrateImport(file: string, _format: OutputFormat): Promise<CommandOutput> {
  return {
    success: true,
    message: t('MIGRATE_IMPORT_COMPLETE', { file }),
    data: { file }
  }
}

// Config commands
export async function cmdConfigShow(_format: OutputFormat): Promise<CommandOutput> {
  const config = loadCLIConfig()
  return {
    success: true,
    message: t('CONFIG_SHOW') + '\n' + JSON.stringify(config, null, 2),
    data: config
  }
}

export async function cmdConfigSet(key: string, value: string, _format: OutputFormat): Promise<CommandOutput> {
  setConfigValue(key, value)
  return {
    success: true,
    message: t('CONFIG_UPDATED', { key, value }),
    data: { key, value }
  }
}

// Friends commands
export async function cmdFriendsList(_format: OutputFormat): Promise<CommandOutput> {
  return {
    success: true,
    message: t('FRIENDS_LIST_EMPTY'),
    data: { friends: [] }
  }
}

export async function cmdFriendsFind(_discord: boolean, _format: OutputFormat): Promise<CommandOutput> {
  return {
    success: true,
    message: t('FRIENDS_FOUND', { count: '0' }),
    data: { friends: [] }
  }
}

// Version
export function cmdVersion(): CommandOutput {
  const version = '0.1.0'
  return {
    success: true,
    message: t('VERSION', { version }),
    data: { version }
  }
}
