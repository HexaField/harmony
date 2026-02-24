import type { IncomingMessage, ServerResponse } from 'node:http'
import { createCryptoProvider, type KeyPair } from '@harmony/crypto'
import { MigrationBot, DiscordRESTAPI } from '@harmony/migration-bot'
import { MigrationService, type EncryptedExportBundle } from '@harmony/migration'
import type { ExportProgress } from '@harmony/migration-bot'
import type { SQLiteQuadStore } from './sqlite-quad-store.js'
import type { Logger } from './logger.js'

interface ExportJob {
  id: string
  status: 'running' | 'complete' | 'error'
  progress: ExportProgress | null
  bundle: EncryptedExportBundle | null
  adminKeyPair: KeyPair | null
  error: string | null
  createdAt: number
}

export class MigrationEndpoint {
  private exports: Map<string, ExportJob> = new Map()
  private logger: Logger
  private store: SQLiteQuadStore | null

  constructor(logger: Logger, store: SQLiteQuadStore | null) {
    this.logger = logger
    this.store = store
  }

  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = req.url ?? ''

    if (req.method === 'POST' && url === '/api/migration/export') {
      await this.handleExport(req, res)
      return true
    }

    const exportStatusMatch = url.match(/^\/api\/migration\/export\/([a-f0-9-]+)$/)
    if (req.method === 'GET' && exportStatusMatch) {
      this.handleExportStatus(exportStatusMatch[1], res)
      return true
    }

    if (req.method === 'POST' && url === '/api/migration/import') {
      await this.handleImport(req, res)
      return true
    }

    return false
  }

  private async readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
      req.on('error', reject)
    })
  }

  private json(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    })
    res.end(JSON.stringify(body))
  }

  private async handleExport(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: {
      botToken: string
      guildId: string
      adminDID: string
      options?: {
        channels?: string[]
        excludeUsers?: string[]
        afterDate?: string
        beforeDate?: string
      }
    }

    try {
      body = JSON.parse(await this.readBody(req))
    } catch {
      this.json(res, 400, { error: 'Invalid JSON body' })
      return
    }

    if (!body.botToken || !body.guildId || !body.adminDID) {
      this.json(res, 400, { error: 'Missing required fields: botToken, guildId, adminDID' })
      return
    }

    const exportId = crypto.randomUUID()
    const job: ExportJob = {
      id: exportId,
      status: 'running',
      progress: null,
      bundle: null,
      adminKeyPair: null,
      error: null,
      createdAt: Date.now()
    }
    this.exports.set(exportId, job)

    // Return immediately with exportId
    this.json(res, 202, { exportId })

    // Run export in background
    const cryptoProvider = createCryptoProvider()
    const api = new DiscordRESTAPI(body.botToken)
    const bot = new MigrationBot(cryptoProvider, api)

    try {
      const adminKeyPair = await cryptoProvider.generateSigningKeyPair()

      const bundle = await bot.exportServer({
        serverId: body.guildId,
        adminDID: body.adminDID,
        adminKeyPair,
        options: body.options,
        onProgress: (progress) => {
          job.progress = progress
        }
      })

      job.status = 'complete'
      job.bundle = bundle
      job.adminKeyPair = adminKeyPair
      this.logger.info('Migration export complete', { exportId, guildId: body.guildId })
    } catch (err) {
      job.status = 'error'
      job.error = err instanceof Error ? err.message : String(err)
      this.logger.error('Migration export failed', { exportId, error: job.error })
    }
  }

  private handleExportStatus(exportId: string, res: ServerResponse): void {
    const job = this.exports.get(exportId)
    if (!job) {
      this.json(res, 404, { error: 'Export not found' })
      return
    }

    const response: Record<string, unknown> = {
      exportId: job.id,
      status: job.status,
      progress: job.progress
    }

    if (job.status === 'complete' && job.bundle) {
      response.bundle = {
        ciphertext: Buffer.from(job.bundle.ciphertext).toString('base64'),
        nonce: Buffer.from(job.bundle.nonce).toString('base64'),
        metadata: job.bundle.metadata
      }
      if (job.adminKeyPair) {
        response.adminKeyPair = {
          publicKey: Buffer.from(job.adminKeyPair.publicKey).toString('base64'),
          secretKey: Buffer.from(job.adminKeyPair.secretKey).toString('base64')
        }
      }
      // Clean up after retrieval
      this.exports.delete(exportId)
    } else if (job.status === 'error') {
      response.error = job.error
      this.exports.delete(exportId)
    }

    this.json(res, 200, response)
  }

  private async handleImport(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: {
      bundle: {
        ciphertext: string
        nonce: string
        metadata: EncryptedExportBundle['metadata']
      }
      adminDID: string
      communityName: string
      adminKeyPair?: {
        publicKey: string
        secretKey: string
      }
    }

    try {
      body = JSON.parse(await this.readBody(req))
    } catch {
      this.json(res, 400, { error: 'Invalid JSON body' })
      return
    }

    if (!body.bundle || !body.adminDID || !body.communityName) {
      this.json(res, 400, { error: 'Missing required fields: bundle, adminDID, communityName' })
      return
    }

    if (!this.store) {
      this.json(res, 503, { error: 'Store not available' })
      return
    }

    try {
      const cryptoProvider = createCryptoProvider()
      const migration = new MigrationService(cryptoProvider)
      const adminKeyPair: KeyPair = body.adminKeyPair
        ? {
            publicKey: new Uint8Array(Buffer.from(body.adminKeyPair.publicKey, 'base64')),
            secretKey: new Uint8Array(Buffer.from(body.adminKeyPair.secretKey, 'base64')),
            type: 'Ed25519'
          }
        : await cryptoProvider.generateSigningKeyPair()

      const encryptedBundle: EncryptedExportBundle = {
        ciphertext: new Uint8Array(Buffer.from(body.bundle.ciphertext, 'base64')),
        nonce: new Uint8Array(Buffer.from(body.bundle.nonce, 'base64')),
        metadata: body.bundle.metadata
      }

      const quads = await migration.decryptExport(encryptedBundle, adminKeyPair)

      // Load quads into store
      await this.store.addAll(quads)

      this.logger.info('Migration import complete', {
        adminDID: body.adminDID,
        communityName: body.communityName,
        quadCount: quads.length
      })

      this.json(res, 200, {
        success: true,
        communityName: body.communityName,
        quadCount: quads.length,
        metadata: body.bundle.metadata
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error('Migration import failed', { error: message })
      this.json(res, 500, { error: `Import failed: ${message}` })
    }
  }
}
