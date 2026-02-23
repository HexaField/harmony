// Electron app — manages server runtime in main process, UI in renderer
import { join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { ServerRuntime, type RuntimeConfig } from '@harmony/server-runtime'
import { createCryptoProvider } from '@harmony/crypto'
import { IdentityManager } from '@harmony/identity'
import { t } from './strings.js'

// Platform-specific data directory
export function getDataDir(): string {
  const plat = platform()
  if (plat === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Harmony')
  if (plat === 'win32') return join(process.env.APPDATA ?? homedir(), 'Harmony')
  return join(homedir(), '.local', 'share', 'harmony')
}

export interface AppState {
  running: boolean
  serverPort: number
  identity?: { did: string; createdAt: string }
  communities: string[]
  connectionState: 'connected' | 'disconnected' | 'reconnecting'
  updateAvailable?: string
  offlineMode: boolean
}

export interface TrayState {
  status: 'online' | 'offline'
  connectedMembers: number
  menuItems: TrayMenuItem[]
}

export interface TrayMenuItem {
  label: string
  action: string
  enabled: boolean
}

export interface MigrationState {
  step: 'idle' | 'token' | 'select' | 'export' | 'complete' | 'cancelled'
  token?: string
  guildId?: string
  progress?: { phase: string; current: number; total: number; channelName: string }
  result?: { channels: number; messages: number; members: number; inviteLink: string }
}

export interface DeepLinkHandler {
  handle(url: string): { action: string; params: Record<string, string> } | null
}

export interface AutoUpdater {
  checkForUpdates(): Promise<{ available: boolean; version?: string }>
  downloadUpdate(): Promise<void>
  applyUpdate(): void
}

export class HarmonyApp {
  private runtime: ServerRuntime | null = null
  private dataDir: string
  private state: AppState
  private migrationState: MigrationState = { step: 'idle' }
  private trayState: TrayState
  private restartCount = 0
  private maxRestarts = 3

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? getDataDir()
    mkdirSync(this.dataDir, { recursive: true })

    this.state = {
      running: false,
      serverPort: 4000 + Math.floor(Math.random() * 1000),
      communities: [],
      connectionState: 'disconnected',
      offlineMode: false
    }

    this.trayState = {
      status: 'offline',
      connectedMembers: 0,
      menuItems: [
        { label: t('TRAY_OPEN'), action: 'open', enabled: true },
        { label: t('TRAY_COPY_INVITE'), action: 'copy-invite', enabled: false },
        { label: t('TRAY_QUIT'), action: 'quit', enabled: true }
      ]
    }
  }

  async launch(): Promise<void> {
    // Check for first run
    const configPath = join(this.dataDir, 'config.json')
    if (!existsSync(configPath)) {
      // First run — identity needs to be created
      this.state.running = false
      return
    }

    await this.startServer()
  }

  async startServer(): Promise<void> {
    const dbPath = join(this.dataDir, 'harmony.db')
    const mediaPath = join(this.dataDir, 'media')

    const config: RuntimeConfig = {
      server: { host: '127.0.0.1', port: this.state.serverPort },
      storage: { database: dbPath, media: mediaPath },
      identity: this.loadIdentityConfig(),
      federation: { enabled: false },
      relay: { enabled: false },
      moderation: {},
      voice: { enabled: false },
      logging: { level: 'info', format: 'json' },
      limits: {
        maxConnections: 100,
        maxCommunities: 50,
        maxChannelsPerCommunity: 200,
        maxMessageSize: 16384,
        mediaMaxSize: 52428800
      }
    }

    this.runtime = new ServerRuntime(config)
    await this.runtime.start()
    this.state.running = true
    this.state.connectionState = 'connected'
    this.trayState.status = 'online'
  }

  async stopServer(): Promise<void> {
    if (this.runtime) {
      await this.runtime.stop()
      this.runtime = null
    }
    this.state.running = false
    this.state.connectionState = 'disconnected'
    this.trayState.status = 'offline'
  }

  async restartServer(): Promise<boolean> {
    if (this.restartCount >= this.maxRestarts) return false
    this.restartCount++
    await this.stopServer()
    await this.startServer()
    return true
  }

  // Identity management
  async createIdentity(): Promise<{ did: string; mnemonic: string }> {
    const crypto = createCryptoProvider()
    const idMgr = new IdentityManager(crypto)
    const { identity, mnemonic } = await idMgr.create()

    this.state.identity = { did: identity.did, createdAt: new Date().toISOString() }
    this.saveConfig()

    return { did: identity.did, mnemonic }
  }

  async recoverIdentity(mnemonic: string): Promise<{ did: string }> {
    const crypto = createCryptoProvider()
    const idMgr = new IdentityManager(crypto)
    const { identity } = await idMgr.createFromMnemonic(mnemonic)

    this.state.identity = { did: identity.did, createdAt: new Date().toISOString() }
    this.saveConfig()

    return { did: identity.did }
  }

  // Migration wizard
  startMigration(): void {
    this.migrationState = { step: 'token' }
  }

  setMigrationToken(token: string): boolean {
    if (!token || token.length < 10) return false
    this.migrationState.token = token
    this.migrationState.step = 'select'
    return true
  }

  selectMigrationGuild(guildId: string): void {
    this.migrationState.guildId = guildId
    this.migrationState.step = 'export'
  }

  updateMigrationProgress(phase: string, current: number, total: number, channelName: string): void {
    this.migrationState.progress = { phase, current, total, channelName }
  }

  completeMigration(channels: number, messages: number, members: number, inviteLink: string): void {
    this.migrationState.step = 'complete'
    this.migrationState.result = { channels, messages, members, inviteLink }
  }

  cancelMigration(): void {
    this.migrationState = { step: 'cancelled' }
  }

  getMigrationState(): MigrationState {
    return { ...this.migrationState }
  }

  // Community management
  createCommunity(_name: string): string {
    const id = 'community:' + Date.now().toString(36)
    this.state.communities.push(id)
    return id
  }

  exportCommunity(communityId: string, outputPath: string): void {
    const data = JSON.stringify({ communityId, exportedAt: new Date().toISOString() })
    writeFileSync(outputPath, data)
  }

  importCommunity(inputPath: string): string {
    const data = JSON.parse(readFileSync(inputPath, 'utf-8'))
    const id = data.communityId ?? 'community:imported:' + Date.now().toString(36)
    this.state.communities.push(id)
    return id
  }

  // Deep links
  handleDeepLink(url: string): { action: string; params: Record<string, string> } | null {
    if (url.startsWith('harmony://invite/')) {
      const code = url.replace('harmony://invite/', '')
      return { action: 'join', params: { code } }
    }
    if (url.startsWith('harmony://identity/import')) {
      return { action: 'import-identity', params: {} }
    }
    return null
  }

  // Auto-update
  async checkForUpdates(): Promise<{ available: boolean; version?: string }> {
    // In production, checks GitHub releases or update server
    return { available: false }
  }

  // Tray
  getTrayState(): TrayState {
    return { ...this.trayState }
  }

  minimizeToTray(): void {
    // App window hides, server keeps running
    // This is a no-op in test — the actual Electron implementation hides the window
  }

  // State
  getState(): AppState {
    return { ...this.state }
  }

  getDataDirectory(): string {
    return this.dataDir
  }

  isFirstRun(): boolean {
    return !existsSync(join(this.dataDir, 'config.json'))
  }

  // Offline mode
  setOfflineMode(offline: boolean): void {
    this.state.offlineMode = offline
    this.state.connectionState = offline ? 'disconnected' : 'connected'
  }

  // Reconnection
  async reconnect(): Promise<boolean> {
    this.state.connectionState = 'reconnecting'
    // Simulate reconnection
    this.state.connectionState = 'connected'
    return true
  }

  // File handling
  handleFileDrop(filePath: string): { encrypted: boolean; size: number } | null {
    if (!existsSync(filePath)) return null
    const { statSync } = require('node:fs') as typeof import('node:fs')
    const stat = statSync(filePath)
    return { encrypted: false, size: stat.size }
  }

  // Voice
  async joinVoice(_channelId: string): Promise<boolean> {
    // Would connect to LiveKit in production
    return true
  }

  // Persistence
  private saveConfig(): void {
    const configPath = join(this.dataDir, 'config.json')
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          identity: this.state.identity,
          serverPort: this.state.serverPort
        },
        null,
        2
      )
    )
  }

  private loadIdentityConfig(): { did?: string; mnemonic?: string } {
    const configPath = join(this.dataDir, 'config.json')
    if (!existsSync(configPath)) return {}
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'))
      return { did: config.identity?.did }
    } catch {
      return {}
    }
  }
}
