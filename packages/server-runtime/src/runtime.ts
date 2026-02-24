// Server runtime — wraps HarmonyServer with config, SQLite, logging, health, lifecycle
import { createServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createServer as createTlsServer } from 'node:https'
import { readFileSync } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { WebSocket } from 'ws'

import { HarmonyServer, type ServerConfig } from '@harmony/server'
import { createCryptoProvider } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import { IdentityManager } from '@harmony/identity'
import type { DIDDocument } from '@harmony/did'
import type { RevocationStore, RevocationEntry } from '@harmony/vc'

import { SQLiteQuadStore } from './sqlite-quad-store.js'
import { loadConfig, type RuntimeConfig } from './config.js'
import { createLogger, type Logger } from './logger.js'
import { MediaFileStore } from './media-store.js'
import { MigrationEndpoint } from './migration-endpoint.js'
import { t } from './strings.js'

export interface ServerStatus {
  running: boolean
  uptime: number
  connections: number
  communities: number
  channels: number
  messagesTotal: number
  storageUsed: number
  version: string
}

// Minimal DID resolver for local use — DIDResolver is a function type
function createLocalDIDResolver(): (did: string) => Promise<DIDDocument | null> {
  const didProvider = new DIDKeyProvider(createCryptoProvider())
  return async (did: string) => didProvider.resolve(did)
}

// Simple in-memory revocation store
class InMemoryRevocationStore implements RevocationStore {
  private entries: RevocationEntry[] = []
  async isRevoked(credentialId: string): Promise<boolean> {
    return this.entries.some((e) => e.credentialId === credentialId)
  }
  async revoke(credentialId: string, reason?: string): Promise<void> {
    if (!this.entries.find((e) => e.credentialId === credentialId)) {
      this.entries.push({ credentialId, reason, revokedAt: new Date().toISOString() })
    }
  }
  async list(): Promise<RevocationEntry[]> {
    return [...this.entries]
  }
}

export class ServerRuntime {
  private config: RuntimeConfig
  private configPath: string | undefined
  private server: HarmonyServer | null = null
  private httpServer: HttpServer | null = null
  private store: SQLiteQuadStore | null = null
  private mediaStore: MediaFileStore | null = null
  private migrationEndpoint: MigrationEndpoint | null = null
  private logger: Logger
  private startTime: number = 0
  private _running = false
  private _shuttingDown = false
  private relayWs: WebSocket | null = null
  private identityDID: string | undefined
  private signalHandlers: Array<{ signal: string; handler: () => void }> = []

  constructor(config?: RuntimeConfig, configPath?: string) {
    this.config = config ?? {
      server: { host: '0.0.0.0', port: 4000 },
      storage: { database: './harmony.db', media: './media' },
      identity: {},
      federation: { enabled: false },
      relay: { enabled: false },
      moderation: {},
      voice: { enabled: false },
      logging: { level: 'info', format: 'json' },
      limits: {
        maxConnections: 1000,
        maxCommunities: 100,
        maxChannelsPerCommunity: 500,
        maxMessageSize: 16384,
        mediaMaxSize: 52428800
      },
      portal: { enabled: false }
    }
    this.configPath = configPath
    this.logger = createLogger({
      level: this.config.logging.level,
      format: this.config.logging.format,
      file: this.config.logging.file,
      silent: false
    })
  }

  async start(configPath?: string): Promise<void> {
    if (this._running) return

    if (configPath) {
      this.configPath = configPath
      this.config = loadConfig(configPath)
      this.logger = createLogger({
        level: this.config.logging.level,
        format: this.config.logging.format,
        file: this.config.logging.file,
        silent: false
      })
    }

    this.logger.info(t('SERVER_STARTING', { host: this.config.server.host, port: this.config.server.port }))

    // Ensure storage directories exist
    mkdirSync(dirname(this.config.storage.database), { recursive: true })

    // Init SQLite store
    this.store = new SQLiteQuadStore(this.config.storage.database)

    // Init media store
    this.mediaStore = new MediaFileStore({
      basePath: this.config.storage.media,
      maxSize: this.config.limits.mediaMaxSize
    })

    // Load identity from mnemonic if configured
    if (this.config.identity.mnemonic) {
      const crypto = createCryptoProvider()
      const idMgr = new IdentityManager(crypto)
      const { identity } = await idMgr.createFromMnemonic(this.config.identity.mnemonic)
      this.identityDID = identity.did
      this.logger.info('Identity loaded', { did: identity.did })
    } else if (this.config.identity.did) {
      this.identityDID = this.config.identity.did
    }

    // Create the HarmonyServer
    const serverConfig: ServerConfig = {
      port: this.config.server.port,
      host: this.config.server.host,
      store: this.store,
      didResolver: createLocalDIDResolver(),
      revocationStore: new InMemoryRevocationStore(),
      cryptoProvider: createCryptoProvider(),
      maxConnections: this.config.limits.maxConnections,
      rateLimit: this.config.moderation.rateLimit
        ? {
            windowMs: this.config.moderation.rateLimit.windowMs,
            maxMessages: this.config.moderation.rateLimit.maxMessages
          }
        : undefined
    }

    this.server = new HarmonyServer(serverConfig)

    // Init migration endpoint
    this.migrationEndpoint = new MigrationEndpoint(this.logger, this.store, this.config.storage.media)
    this.migrationEndpoint.setHarmonyServer(this.server)

    // Set up health endpoint HTTP server
    if (this.config.server.tls?.cert && this.config.server.tls?.key) {
      try {
        const cert = readFileSync(this.config.server.tls.cert)
        const key = readFileSync(this.config.server.tls.key)
        this.httpServer = createTlsServer({ cert, key })
        this.logger.info(t('TLS_LOADED'))
      } catch (err) {
        this.logger.error(t('TLS_FAILED', { error: String(err) }))
        throw err
      }
    } else {
      this.httpServer = createServer()
    }

    this.httpServer.on('request', (req: IncomingMessage, res: ServerResponse) => {
      // CORS preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        })
        res.end()
        return
      }

      // Add CORS headers to all responses
      res.setHeader('Access-Control-Allow-Origin', '*')

      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: t('HEALTH_OK'), uptime: this.getUptime() }))
      } else if (req.url?.startsWith('/api/migration/') || req.url?.startsWith('/api/user-data/')) {
        void this.migrationEndpoint!.handleRequest(req, res)
          .then((handled) => {
            if (!handled) {
              res.writeHead(404)
              res.end()
            }
          })
          .catch((err) => {
            this.logger.error('Migration endpoint error', { error: String(err) })
            if (!res.headersSent) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'Internal server error' }))
            }
          })
      } else {
        res.writeHead(404)
        res.end()
      }
    })

    // Start the servers
    await this.server.start()
    this.startTime = Date.now()
    this._running = true

    // Start health endpoint on port + 1
    const healthPort = this.config.server.port + 1
    await new Promise<void>((resolve) => {
      this.httpServer!.listen(healthPort, this.config.server.host, () => resolve())
    })

    // Register signal handlers
    this.registerSignalHandlers()

    // Connect to relay if configured
    if (this.config.relay.enabled && this.config.relay.url) {
      this.connectToRelay()
    }

    this.logger.info(t('SERVER_STARTED'))
  }

  async stop(): Promise<void> {
    if (!this._running || this._shuttingDown) return
    this._shuttingDown = true
    this.logger.info(t('SERVER_STOPPING'))

    // Disconnect from relay
    if (this.relayWs) {
      this.relayWs.close()
      this.relayWs = null
    }

    // Stop HarmonyServer (drains WebSocket connections)
    if (this.server) {
      await this.server.stop()
      this.server = null
    }

    // Stop health endpoint
    if (this.httpServer) {
      await new Promise<void>((resolve) => this.httpServer!.close(() => resolve()))
      this.httpServer = null
    }

    // Close SQLite (flush WAL)
    if (this.store) {
      this.store.close()
      this.store = null
    }

    // Remove signal handlers
    this.removeSignalHandlers()

    this._running = false
    this._shuttingDown = false
    this.logger.info(t('SERVER_STOPPED'))
  }

  async reload(): Promise<void> {
    if (!this.configPath) return
    this.logger.info(t('SERVER_RELOAD'))

    const newConfig = loadConfig(this.configPath)

    // Apply mutable config changes without restart
    if (newConfig.moderation.rateLimit && this.server) {
      // The server's rate limit is applied per-connection on the fly
      this.config.moderation = newConfig.moderation
    }
    if (newConfig.logging) {
      this.config.logging = newConfig.logging
      this.logger = createLogger({
        level: newConfig.logging.level,
        format: newConfig.logging.format,
        file: newConfig.logging.file,
        silent: false
      })
    }
    this.config = { ...this.config, ...newConfig }
    this.logger.info(t('SERVER_RELOAD_COMPLETE'))
  }

  status(): ServerStatus {
    const conns = this.server?.connections() ?? []
    const communities = this.server?.communities() ?? []
    return {
      running: this._running,
      uptime: this.getUptime(),
      connections: conns.length,
      communities: communities.length,
      channels: 0, // would need to query store
      messagesTotal: 0,
      storageUsed: this.store?.stats().sizeBytes ?? 0,
      version: '0.1.0'
    }
  }

  getConfig(): RuntimeConfig {
    return this.config
  }

  getStore(): SQLiteQuadStore | null {
    return this.store
  }

  getMediaStore(): MediaFileStore | null {
    return this.mediaStore
  }

  getServer(): HarmonyServer | null {
    return this.server
  }

  getLogger(): Logger {
    return this.logger
  }

  getDID(): string | undefined {
    return this.identityDID
  }

  isRunning(): boolean {
    return this._running
  }

  private getUptime(): number {
    if (!this._running) return 0
    return Math.floor((Date.now() - this.startTime) / 1000)
  }

  private registerSignalHandlers(): void {
    const shutdownHandler = () => {
      void this.stop()
    }
    const reloadHandler = () => {
      void this.reload()
    }

    process.on('SIGTERM', shutdownHandler)
    process.on('SIGINT', shutdownHandler)
    process.on('SIGHUP', reloadHandler)

    this.signalHandlers = [
      { signal: 'SIGTERM', handler: shutdownHandler },
      { signal: 'SIGINT', handler: shutdownHandler },
      { signal: 'SIGHUP', handler: reloadHandler }
    ]
  }

  private removeSignalHandlers(): void {
    for (const { signal, handler } of this.signalHandlers) {
      process.removeListener(signal, handler)
    }
    this.signalHandlers = []
  }

  private connectToRelay(): void {
    if (!this.config.relay.url) return
    try {
      const did = this.identityDID ?? 'unknown'
      this.logger.info(t('RELAY_REGISTERING', { url: this.config.relay.url }))
      this.relayWs = new WebSocket(`${this.config.relay.url}/relay/${did}`)
      this.relayWs.on('open', () => {
        this.logger.info(t('RELAY_REGISTERED'))
      })
      this.relayWs.on('error', (err) => {
        this.logger.error(t('RELAY_FAILED', { error: String(err) }))
      })
      this.relayWs.on('close', () => {
        this.relayWs = null
      })
    } catch (err) {
      this.logger.error(t('RELAY_FAILED', { error: String(err) }))
    }
  }
}
