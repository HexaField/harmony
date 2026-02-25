// Tests for app POLISH.md fixes
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { HarmonyApp } from '../src/app.js'

describe('P2 #15 — Config deep merge', () => {
  let tmpDir: string
  let app: HarmonyApp

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'harmony-test-'))
    app = new HarmonyApp(tmpDir)
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('shallow fields are replaced', () => {
    app.updateConfig({ version: 2 })
    expect(app.getConfig().version).toBe(2)
  })

  it('deep merges nested identity object', () => {
    app.updateConfig({
      identity: {
        did: 'did:key:z6MkTest',
        mnemonic: 'word '.repeat(12).trim(),
        createdAt: '2024-01-01'
      }
    })

    // Now patch only displayName
    app.updateConfig({
      identity: {
        displayName: 'Alice'
      } as any
    })

    const config = app.getConfig()
    expect(config.identity?.did).toBe('did:key:z6MkTest')
    expect(config.identity?.mnemonic).toBe('word '.repeat(12).trim())
    expect(config.identity?.displayName).toBe('Alice')
  })

  it('deep merge does not lose existing nested keys', () => {
    app.updateConfig({
      identity: {
        did: 'did:key:z6MkTest',
        mnemonic: 'test mnemonic words here',
        displayName: 'Bob',
        createdAt: '2024-01-01'
      }
    })

    // Patch with partial identity
    app.updateConfig({
      identity: {
        displayName: 'Charlie'
      } as any
    })

    const config = app.getConfig()
    expect(config.identity?.did).toBe('did:key:z6MkTest')
    expect(config.identity?.displayName).toBe('Charlie')
  })

  it('arrays are replaced, not merged', () => {
    app.updateConfig({
      servers: [{ url: 'ws://a:4515' }, { url: 'ws://b:4515' }]
    })
    app.updateConfig({
      servers: [{ url: 'ws://c:4515' }]
    })
    expect(app.getConfig().servers).toHaveLength(1)
    expect(app.getConfig().servers![0].url).toBe('ws://c:4515')
  })

  it('config persists to disk', () => {
    app.updateConfig({ version: 3 })
    const raw = JSON.parse(readFileSync(join(tmpDir, 'config.json'), 'utf-8'))
    expect(raw.version).toBe(3)
  })
})

describe('P0 #2 — Native ABI rebuild scripts', () => {
  it('package.json has rebuild:node script', async () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf-8'))
    expect(pkg.scripts['rebuild:node']).toBeDefined()
    expect(pkg.scripts['rebuild:electron']).toBeDefined()
  })
})
