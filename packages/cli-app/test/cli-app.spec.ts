import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, existsSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

import { createProgram } from '../src/program.js'
import {
  cmdIdentityCreate,
  cmdIdentityRecover,
  cmdIdentityShow,
  cmdIdentityExport,
  cmdIdentityImport,
  cmdCommunityCreate,
  cmdCommunityList,
  cmdChannelCreate,
  cmdSend,
  cmdHistory,
  cmdServerStart,
  cmdServerStop,
  cmdServerStatus,
  cmdMigrateDiscord,
  cmdConfigSet,
  cmdConfigShow,
  cmdFriendsFind,
  cmdVersion,
  formatOutput
} from '../src/commands.js'
import { saveCLIConfig, loadCLIConfig, setConfigValue, type CLIConfig } from '../src/config-store.js'

let tmpDir: string
let origHome: string | undefined

beforeEach(() => {
  tmpDir = join(tmpdir(), 'harmony-cli-test-' + randomBytes(4).toString('hex'))
  mkdirSync(tmpDir, { recursive: true })
  origHome = process.env.HOME
  process.env.HOME = tmpDir
})

afterEach(() => {
  if (origHome !== undefined) process.env.HOME = origHome
  else delete process.env.HOME
})

// ── Test 1: identity create generates valid DID ──
describe('CLI Commands', () => {
  it('T1: identity create generates valid DID and 12-word mnemonic', async () => {
    const result = await cmdIdentityCreate('text')
    expect(result.success).toBe(true)
    expect(result.message).toContain('did:key:')
    const data = result.data as { did: string; mnemonic: string }
    expect(data.did).toContain('did:key:')
    expect(data.mnemonic.split(' ').length).toBe(12)
  })

  // ── Test 2: identity recover restores same DID ──
  it('T2: identity recover restores same DID', async () => {
    const created = await cmdIdentityCreate('text')
    const mnemonic = (created.data as { mnemonic: string }).mnemonic
    const recovered = await cmdIdentityRecover(mnemonic, 'text')
    expect(recovered.success).toBe(true)
    expect((recovered.data as { did: string }).did).toBe((created.data as { did: string }).did)
  })

  // ── Test 3: identity show displays identity ──
  it('T3: identity show displays identity info', async () => {
    await cmdIdentityCreate('text')
    const result = await cmdIdentityShow('text')
    expect(result.success).toBe(true)
    expect(result.message).toContain('DID:')
    expect(result.message).toContain('did:key:')
  })

  // ── Test 4: identity export/import round-trips ──
  it('T4: identity export/import round-trips', async () => {
    await cmdIdentityCreate('text')
    const exportFile = join(tmpDir, 'identity.json')
    await cmdIdentityExport(exportFile, 'text')
    expect(existsSync(exportFile)).toBe(true)

    // Modify config to clear identity
    saveCLIConfig({ serverUrl: 'http://test' })

    await cmdIdentityImport(exportFile, 'text')
    const result = await cmdIdentityShow('text')
    expect(result.success).toBe(true)
    expect(result.message).toContain('did:key:')
  })

  // ── Test 5: community create ──
  it('T5: community create creates community', async () => {
    const result = await cmdCommunityCreate('Test Community', 'text')
    expect(result.success).toBe(true)
    expect(result.message).toContain('Test Community')
    expect((result.data as { id: string }).id).toBeDefined()
  })

  // ── Test 6: community list ──
  it('T6: community list shows communities', async () => {
    const result = await cmdCommunityList('text')
    expect(result.success).toBe(true)
  })

  // ── Test 7: channel create ──
  it('T7: channel create creates channel', async () => {
    const result = await cmdChannelCreate('general', 'text')
    expect(result.success).toBe(true)
    expect(result.message).toContain('general')
    expect((result.data as { id: string }).id).toBeDefined()
  })

  // ── Test 8: send delivers message ──
  it('T8: send delivers message', async () => {
    const result = await cmdSend('general', 'Hello!', 'text')
    expect(result.success).toBe(true)
    expect(result.message).toContain('general')
  })

  // ── Test 9: history shows messages ──
  it('T9: history shows messages', async () => {
    const result = await cmdHistory('general', 'text')
    expect(result.success).toBe(true)
  })

  // ── Test 10: server start/stop lifecycle ──
  it('T10: server start/stop lifecycle', async () => {
    const start = await cmdServerStart('text')
    expect(start.success).toBe(true)
    expect(start.message).toContain('started')

    const stop = await cmdServerStop('text')
    expect(stop.success).toBe(true)
  })

  // ── Test 11: migrate discord ──
  it('T11: migrate discord with mock API', async () => {
    const result = await cmdMigrateDiscord('123456', 'text')
    expect(result.success).toBe(true)
    expect(result.message).toContain('complete')
  })

  // ── Test 12: config set/show persists ──
  it('T12: config set/show persists', async () => {
    await cmdConfigSet('serverUrl', 'ws://localhost:4000', 'text')
    const result = await cmdConfigShow('text')
    expect(result.success).toBe(true)
    expect(JSON.stringify(result.data)).toContain('ws://localhost:4000')
  })

  // ── Test 13: friends find ──
  it('T13: friends find with linked accounts', async () => {
    const result = await cmdFriendsFind(true, 'text')
    expect(result.success).toBe(true)
  })

  // ── Test 14: --help on every command ──
  it('T14: all commands have help text', () => {
    const program = createProgram()
    const commands = program.commands
    expect(commands.length).toBeGreaterThan(0)
    for (const cmd of commands) {
      expect(cmd.description()).toBeTruthy()
    }
  })

  // ── Test 15: JSON output mode ──
  it('T15: --output json produces valid JSON', async () => {
    const result = await cmdIdentityCreate('json')
    const output = formatOutput(result, 'json')
    const parsed = JSON.parse(output)
    expect(parsed.success).toBe(true)
    expect(parsed.data.did).toBeDefined()
  })

  // ── Test 16: invalid mnemonic rejected ──
  it('T16: identity recover with garbage fails gracefully', async () => {
    const result = await cmdIdentityRecover('not a valid mnemonic', 'text')
    expect(result.success).toBe(false)
    expect(result.message).toContain('Invalid mnemonic')
  })

  // ── Test 17: missing config prompts setup ──
  it('T17: missing config returns appropriate message', async () => {
    const result = await cmdIdentityShow('text')
    // No config file exists in temp dir, so should indicate missing config
    expect(result.success).toBe(false)
    expect(result.message).toContain('harmony init')
  })

  // ── Test 18: version shows version ──
  it('T18: version shows version', () => {
    const result = cmdVersion()
    expect(result.success).toBe(true)
    expect(result.message).toContain('0.1.0')
    expect((result.data as { version: string }).version).toBe('0.1.0')
  })
})
