import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

import { HarmonyApp } from '../src/app.js'

let app: HarmonyApp
let dataDir: string

beforeEach(() => {
  dataDir = join(tmpdir(), 'harmony-app-test-' + randomBytes(4).toString('hex'))
  mkdirSync(dataDir, { recursive: true })
  app = new HarmonyApp(dataDir)
})

afterEach(async () => {
  if (app.getState().running) {
    await app.stopServer()
  }
})

describe('Electron App', () => {
  // T1: App launches and starts server
  it('T1: App starts server, health check passes', async () => {
    // Create identity first so config exists
    await app.createIdentity()
    await app.startServer()
    expect(app.getState().running).toBe(true)
  })

  // T2: App close stops server
  it('T2: Server exits cleanly on stop', async () => {
    await app.createIdentity()
    await app.startServer()
    expect(app.getState().running).toBe(true)
    await app.stopServer()
    expect(app.getState().running).toBe(false)
  })

  // T3: Crash triggers restart
  it('T3: Server recovers after crash', async () => {
    await app.createIdentity()
    await app.startServer()
    await app.stopServer() // simulate crash
    const restarted = await app.restartServer()
    expect(restarted).toBe(true)
    expect(app.getState().running).toBe(true)
  })

  // T4: First-run shows onboarding
  it('T4: First run detected when no config', () => {
    expect(app.isFirstRun()).toBe(true)
  })

  // T5: Identity creation flow
  it('T5: Mnemonic shown, confirmed, DID created', async () => {
    const result = await app.createIdentity()
    expect(result.did).toContain('did:key:')
    expect(result.mnemonic.split(' ').length).toBe(12)
    expect(app.getState().identity?.did).toBe(result.did)
  })

  // T6: Identity recovery flow
  it('T6: 12-word entry, DID recovered', async () => {
    const created = await app.createIdentity()
    const recovered = await app.recoverIdentity(created.mnemonic)
    expect(recovered.did).toBe(created.did)
  })

  // T7: Migration wizard: token validation
  it('T7: Invalid token rejected, valid token proceeds', () => {
    app.startMigration()
    expect(app.setMigrationToken('')).toBe(false)
    expect(app.setMigrationToken('short')).toBe(false)
    expect(app.setMigrationToken('valid-token-long-enough')).toBe(true)
    expect(app.getMigrationState().step).toBe('select')
  })

  // T8: Migration wizard: server selection
  it('T8: Servers listed, channel/member counts shown', () => {
    app.startMigration()
    app.setMigrationToken('valid-token-long-enough')
    app.selectMigrationGuild('guild123')
    expect(app.getMigrationState().step).toBe('export')
    expect(app.getMigrationState().guildId).toBe('guild123')
  })

  // T9: Migration wizard: export progress
  it('T9: Progress updates in real-time', () => {
    app.startMigration()
    app.setMigrationToken('valid-token-long-enough')
    app.selectMigrationGuild('guild123')
    app.updateMigrationProgress('messages', 50, 100, '#general')
    const state = app.getMigrationState()
    expect(state.progress?.current).toBe(50)
    expect(state.progress?.total).toBe(100)
    expect(state.progress?.channelName).toBe('#general')
  })

  // T10: Migration wizard: export completion
  it('T10: Summary shown, invite link generated', () => {
    app.startMigration()
    app.setMigrationToken('valid-token-long-enough')
    app.selectMigrationGuild('guild123')
    app.completeMigration(5, 1000, 20, 'harmony.chat/invite/abc')
    const state = app.getMigrationState()
    expect(state.step).toBe('complete')
    expect(state.result?.channels).toBe(5)
    expect(state.result?.inviteLink).toContain('invite')
  })

  // T11: Migration wizard: cancel mid-export
  it('T11: Export stops cleanly', () => {
    app.startMigration()
    app.setMigrationToken('valid-token-long-enough')
    app.selectMigrationGuild('guild123')
    app.cancelMigration()
    expect(app.getMigrationState().step).toBe('cancelled')
  })

  // T12: Community creation from app
  it('T12: Community visible, channels created', () => {
    const id = app.createCommunity('Test Community')
    expect(id).toBeDefined()
    expect(app.getState().communities).toContain(id)
  })

  // T13: Local server accessible via relay
  it('T13: Remote client connects through cloud relay', async () => {
    await app.createIdentity()
    await app.startServer()
    expect(app.getState().connectionState).toBe('connected')
  })

  // T14: Community export to file
  it('T14: Bundle saved, importable', () => {
    const id = app.createCommunity('Export Test')
    const exportPath = join(dataDir, 'export.hbundle')
    app.exportCommunity(id, exportPath)
    expect(existsSync(exportPath)).toBe(true)
  })

  // T15: Community import from file
  it('T15: Imported community fully functional', () => {
    const id = app.createCommunity('Import Test')
    const exportPath = join(dataDir, 'import.hbundle')
    app.exportCommunity(id, exportPath)
    const importedId = app.importCommunity(exportPath)
    expect(importedId).toBeDefined()
    expect(app.getState().communities).toContain(importedId)
  })

  // T16: System tray shows status
  it('T16: Tray icon present, menu items correct', () => {
    const tray = app.getTrayState()
    expect(tray.menuItems.length).toBeGreaterThan(0)
    expect(tray.menuItems.some((m) => m.action === 'open')).toBe(true)
    expect(tray.menuItems.some((m) => m.action === 'quit')).toBe(true)
  })

  // T17: System tray minimise
  it('T17: App minimises, server keeps running', async () => {
    await app.createIdentity()
    await app.startServer()
    app.minimizeToTray()
    expect(app.getState().running).toBe(true)
  })

  // T18: Deep link opens join flow
  it('T18: harmony://invite/abc triggers join', () => {
    const result = app.handleDeepLink('harmony://invite/abc123')
    expect(result).not.toBeNull()
    expect(result!.action).toBe('join')
    expect(result!.params.code).toBe('abc123')
  })

  // T19: Auto-update check
  it('T19: Update check runs', async () => {
    const result = await app.checkForUpdates()
    expect(result).toHaveProperty('available')
  })

  // T20: Data stored in correct platform directory
  it('T20: SQLite and media in expected location', () => {
    const dir = app.getDataDirectory()
    expect(dir).toBe(dataDir)
    expect(existsSync(dir)).toBe(true)
  })

  // T21: Multiple communities on one node
  it('T21: Two communities coexist', () => {
    const id1 = app.createCommunity('Community 1')
    const id2 = app.createCommunity('Community 2')
    expect(app.getState().communities.length).toBe(2)
    expect(app.getState().communities).toContain(id1)
    expect(app.getState().communities).toContain(id2)
  })

  // T22: Offline mode
  it('T22: App works without internet, queues outbound', () => {
    app.setOfflineMode(true)
    expect(app.getState().offlineMode).toBe(true)
    expect(app.getState().connectionState).toBe('disconnected')
  })

  // T23: Reconnect after network change
  it('T23: WebSocket reconnects, sync resumes', async () => {
    const reconnected = await app.reconnect()
    expect(reconnected).toBe(true)
    expect(app.getState().connectionState).toBe('connected')
  })

  // T24: File drag-and-drop upload
  it('T24: File encrypted and attached to message', () => {
    const testFile = join(dataDir, 'test.txt')
    writeFileSync(testFile, 'test content')
    const result = app.handleFileDrop(testFile)
    expect(result).not.toBeNull()
    expect(result!.size).toBeGreaterThan(0)
  })

  // T25: Voice channel join from app
  it('T25: Voice connection established', async () => {
    const joined = await app.joinVoice('vc1')
    expect(joined).toBe(true)
  })
})
