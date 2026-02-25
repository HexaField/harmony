/**
 * Regression tests for backend config persistence.
 *
 * These tests verify that identity, server config, and app state
 * survive restarts by being persisted to config.json on disk
 * (NOT localStorage).
 *
 * Regressions covered:
 * - Fixed port 4515 (was random, broke reconnection after restart)
 * - Identity saved to disk config on createIdentity/recoverIdentity
 * - Config survives app reconstruction (simulating restart)
 * - updateConfig merges patches correctly
 * - Port override via constructor options (tests use random ports)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

import { HarmonyApp } from '../src/app.js'

let dataDir: string

beforeEach(() => {
  dataDir = join(tmpdir(), 'harmony-config-test-' + randomBytes(4).toString('hex'))
  mkdirSync(dataDir, { recursive: true })
})

function readConfig(dir: string) {
  const p = join(dir, 'config.json')
  if (!existsSync(p)) return null
  return JSON.parse(readFileSync(p, 'utf-8'))
}

describe('Config Persistence — Identity', () => {
  it('createIdentity writes identity to config.json on disk', async () => {
    const app = new HarmonyApp(dataDir, { port: 0 })
    const { did, mnemonic } = await app.createIdentity()

    const config = readConfig(dataDir)
    expect(config).not.toBeNull()
    expect(config.identity.did).toBe(did)
    expect(config.identity.mnemonic).toBe(mnemonic)
    expect(config.identity.createdAt).toBeTruthy()
  })

  it('recoverIdentity writes identity to config.json on disk', async () => {
    const app = new HarmonyApp(dataDir, { port: 0 })
    const { mnemonic } = await app.createIdentity()

    // Simulate restart with fresh dataDir that has the mnemonic
    const dataDir2 = join(tmpdir(), 'harmony-config-test-' + randomBytes(4).toString('hex'))
    mkdirSync(dataDir2, { recursive: true })
    const app2 = new HarmonyApp(dataDir2, { port: 0 })
    const { did: recoveredDid } = await app2.recoverIdentity(mnemonic)

    const config = readConfig(dataDir2)
    expect(config.identity.did).toBe(recoveredDid)
    expect(config.identity.mnemonic).toBe(mnemonic)
  })

  it('identity survives app reconstruction (simulating restart)', async () => {
    const app1 = new HarmonyApp(dataDir, { port: 0 })
    const { did, mnemonic } = await app1.createIdentity()

    // Reconstruct from same dataDir — simulates app restart
    const app2 = new HarmonyApp(dataDir, { port: 0 })
    const config = app2.getConfig()
    expect(config.identity?.did).toBe(did)
    expect(config.identity?.mnemonic).toBe(mnemonic)
  })

  it('recoverIdentity from same mnemonic produces same DID', async () => {
    const app1 = new HarmonyApp(dataDir, { port: 0 })
    const { did, mnemonic } = await app1.createIdentity()

    const dataDir2 = join(tmpdir(), 'harmony-config-test-' + randomBytes(4).toString('hex'))
    mkdirSync(dataDir2, { recursive: true })
    const app2 = new HarmonyApp(dataDir2, { port: 0 })
    const { did: recoveredDid } = await app2.recoverIdentity(mnemonic)
    expect(recoveredDid).toBe(did)
  })
})

describe('Config Persistence — updateConfig', () => {
  it('updateConfig patches identity and persists to disk', () => {
    const app = new HarmonyApp(dataDir, { port: 0 })
    app.updateConfig({
      identity: {
        did: 'did:key:z6MkTest',
        mnemonic: 'test words here and more words to fill twelve slots ok done',
        displayName: 'Alice',
        createdAt: '2026-01-01T00:00:00Z'
      }
    })

    const config = readConfig(dataDir)
    expect(config.identity.did).toBe('did:key:z6MkTest')
    expect(config.identity.mnemonic).toContain('test words')
    expect(config.identity.displayName).toBe('Alice')
  })

  it('updateConfig preserves existing fields when patching', async () => {
    const app = new HarmonyApp(dataDir, { port: 0 })
    const { did, mnemonic } = await app.createIdentity()

    // Patch just displayName via identity replacement
    app.updateConfig({
      identity: { did, mnemonic, displayName: 'Bob', createdAt: '' }
    })

    const config = readConfig(dataDir)
    expect(config.identity.did).toBe(did)
    expect(config.identity.mnemonic).toBe(mnemonic)
    expect(config.identity.displayName).toBe('Bob')
    expect(config.version).toBe(1)
  })

  it('getConfig returns current in-memory config', async () => {
    const app = new HarmonyApp(dataDir, { port: 0 })
    await app.createIdentity()
    const config = app.getConfig()
    expect(config.version).toBe(1)
    expect(config.identity).toBeDefined()
    expect(config.identity!.did).toMatch(/^did:key:/)
  })

  it('getConfig returns shallow copy (nested objects shared — safe for IPC serialization)', async () => {
    const app = new HarmonyApp(dataDir, { port: 0 })
    await app.createIdentity()
    const config1 = app.getConfig()
    const config2 = app.getConfig()
    // Top-level is a different object
    expect(config1).not.toBe(config2)
    // But identity is the same reference (shallow copy)
    expect(config1.identity).toBe(config2.identity)
  })
})

describe('Config Persistence — Fixed Port', () => {
  it('default port is 4515', () => {
    const app = new HarmonyApp(dataDir)
    expect(app.getState().serverPort).toBe(4515)
  })

  it('port override via constructor options', () => {
    const app = new HarmonyApp(dataDir, { port: 9999 })
    expect(app.getState().serverPort).toBe(9999)
  })

  it('port 0 is accepted (for tests that do not start server)', () => {
    const app = new HarmonyApp(dataDir, { port: 0 })
    expect(app.getState().serverPort).toBe(0)
  })

  it('fixed port ensures reconnection after restart (regression)', () => {
    // The bug: random port meant persisted WS URLs were stale after restart
    const app1 = new HarmonyApp(dataDir)
    const port1 = app1.getState().serverPort

    // Simulate restart
    const app2 = new HarmonyApp(dataDir)
    const port2 = app2.getState().serverPort

    expect(port1).toBe(port2)
    expect(port1).toBe(4515)
  })
})

describe('Config Persistence — Fresh State', () => {
  it('fresh app with no config.json returns version 1 defaults', () => {
    const app = new HarmonyApp(dataDir, { port: 0 })
    const config = app.getConfig()
    expect(config.version).toBe(1)
    expect(config.identity).toBeUndefined()
    expect(config.servers).toBeUndefined()
  })

  it('corrupted config.json falls back to defaults', () => {
    writeFileSync(join(dataDir, 'config.json'), 'NOT VALID JSON{{{')
    const app = new HarmonyApp(dataDir, { port: 0 })
    const config = app.getConfig()
    expect(config.version).toBe(1)
  })

  it('config.json is created on first write', () => {
    expect(existsSync(join(dataDir, 'config.json'))).toBe(false)
    const app = new HarmonyApp(dataDir, { port: 0 })
    app.updateConfig({ servers: [{ url: 'ws://localhost:4515' }] })
    expect(existsSync(join(dataDir, 'config.json'))).toBe(true)
  })
})

describe('Config Persistence — Server Start with Fixed Port', () => {
  it('server starts on the configured port', async () => {
    const port = 4000 + Math.floor(Math.random() * 1000)
    const app = new HarmonyApp(dataDir, { port })
    await app.createIdentity()
    await app.startServer()
    expect(app.getState().running).toBe(true)
    expect(app.getState().serverPort).toBe(port)
    await app.stopServer()
  })

  it('double startServer is a no-op (idempotent)', async () => {
    const port = 4000 + Math.floor(Math.random() * 1000)
    const app = new HarmonyApp(dataDir, { port })
    await app.createIdentity()
    await app.startServer()
    await app.startServer() // should not throw or start a second server
    expect(app.getState().running).toBe(true)
    await app.stopServer()
  })
})
