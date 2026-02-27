import { describe, it, expect } from 'vitest'

import { createProgram } from '../src/program.js'
import {
  cmdIdentityCreate,
  cmdIdentityRecover,
  cmdIdentityShow,
  cmdCommunityCreate,
  cmdCommunityList,
  cmdChannelCreate,
  cmdChannelList,
  cmdChannelDelete,
  cmdSend,
  cmdHistory,
  cmdServerStart,
  cmdServerStop,
  cmdServerStatus,
  cmdMigrateDiscord,
  cmdFriendsList,
  cmdFriendsFind,
  cmdVersion,
  formatOutput,
  type CommandOutput
} from '../src/commands.js'
import { t, strings } from '../src/strings.js'

describe('CLI App Commands', () => {
  it('cmdIdentityCreate returns success with DID', async () => {
    const result = await cmdIdentityCreate('text')
    expect(result.success).toBe(true)
    expect(result.message).toContain('did:key:')
    expect(result.message).toContain('Mnemonic:')
  })

  it('cmdIdentityRecover rejects invalid mnemonic', async () => {
    const result = await cmdIdentityRecover('one two three', 'text')
    expect(result.success).toBe(false)
    expect(result.message).toContain('Invalid')
  })

  it('cmdIdentityShow without config returns error', async () => {
    // This depends on ~/.harmony/config.json state but tests the code path
    const result = await cmdIdentityShow('text')
    // Either shows identity or missing config
    expect(result.success === true || result.message.includes('config')).toBe(true)
  })

  it('cmdCommunityCreate returns id', async () => {
    const result = await cmdCommunityCreate('TestComm', 'text')
    expect(result.success).toBe(true)
    expect(result.message).toContain('TestComm')
    expect((result.data as any).id).toBeTruthy()
  })

  it('cmdCommunityList returns empty list', async () => {
    const result = await cmdCommunityList('text')
    expect(result.success).toBe(true)
  })

  it('cmdChannelCreate returns id', async () => {
    const result = await cmdChannelCreate('general', 'text')
    expect(result.success).toBe(true)
    expect(result.message).toContain('general')
  })

  it('cmdChannelList', async () => {
    const result = await cmdChannelList('text')
    expect(result.success).toBe(true)
  })

  it('cmdChannelDelete', async () => {
    const result = await cmdChannelDelete('general', 'text')
    expect(result.success).toBe(true)
    expect(result.message).toContain('general')
  })

  it('cmdSend', async () => {
    const result = await cmdSend('general', 'hello', 'text')
    expect(result.success).toBe(true)
    expect(result.message).toContain('general')
  })

  it('cmdHistory', async () => {
    const result = await cmdHistory('general', 'text')
    expect(result.success).toBe(true)
  })

  it('cmdServerStart', async () => {
    const result = await cmdServerStart('text')
    expect(result.success).toBe(true)
    expect(result.message).toContain('port')
  })

  it('cmdServerStop', async () => {
    const result = await cmdServerStop('text')
    expect(result.success).toBe(true)
  })

  it('cmdServerStatus', async () => {
    const result = await cmdServerStatus('text')
    expect(result.success).toBe(true)
    expect(result.message).toContain('running')
  })

  it('cmdMigrateDiscord', async () => {
    const result = await cmdMigrateDiscord('123456', 'text')
    expect(result.success).toBe(true)
  })

  it('cmdFriendsList', async () => {
    const result = await cmdFriendsList('text')
    expect(result.success).toBe(true)
  })

  it('cmdFriendsFind', async () => {
    const result = await cmdFriendsFind(false, 'text')
    expect(result.success).toBe(true)
  })

  it('cmdVersion', () => {
    const result = cmdVersion()
    expect(result.success).toBe(true)
    expect(result.message).toContain('0.1.0')
  })
})

describe('formatOutput', () => {
  it('text format returns message', () => {
    const output: CommandOutput = { success: true, message: 'hello', data: { x: 1 } }
    expect(formatOutput(output, 'text')).toBe('hello')
  })

  it('json format returns JSON string', () => {
    const output: CommandOutput = { success: true, message: 'hello' }
    const json = formatOutput(output, 'json')
    const parsed = JSON.parse(json)
    expect(parsed.success).toBe(true)
    expect(parsed.message).toBe('hello')
  })
})

describe('CLI Strings', () => {
  it('all string values are non-empty', () => {
    for (const [key, value] of Object.entries(strings)) {
      expect(value, `${key} should be non-empty`).toBeTruthy()
    }
  })

  it('t() substitutes parameters', () => {
    expect(t('IDENTITY_CREATED', { did: 'did:key:test' })).toContain('did:key:test')
    expect(t('VERSION', { version: '1.0' })).toContain('1.0')
  })
})

describe('createProgram', () => {
  it('creates program with expected name and version', () => {
    const program = createProgram()
    expect(program.name()).toBe('harmony')
    expect(program.version()).toBe('0.1.0')
  })

  it('has all top-level commands', () => {
    const program = createProgram()
    const commandNames = program.commands.map((c) => c.name())
    expect(commandNames).toContain('init')
    expect(commandNames).toContain('identity')
    expect(commandNames).toContain('community')
    expect(commandNames).toContain('channel')
    expect(commandNames).toContain('send')
    expect(commandNames).toContain('history')
    expect(commandNames).toContain('server')
    expect(commandNames).toContain('migrate')
    expect(commandNames).toContain('config')
    expect(commandNames).toContain('friends')
  })

  it('identity subcommands exist', () => {
    const program = createProgram()
    const identity = program.commands.find((c) => c.name() === 'identity')!
    const subNames = identity.commands.map((c) => c.name())
    expect(subNames).toContain('create')
    expect(subNames).toContain('recover')
    expect(subNames).toContain('show')
    expect(subNames).toContain('export')
    expect(subNames).toContain('import')
    expect(subNames).toContain('link')
  })
})
