import type { IncomingMessage, ServerResponse } from 'node:http'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createCryptoProvider, type KeyPair } from '@harmony/crypto'
import { MigrationBot, DiscordRESTAPI } from '@harmony/migration-bot'
import { MigrationService, type EncryptedExportBundle } from '@harmony/migration'
import type { ExportProgress } from '@harmony/migration-bot'
import { HarmonyType, HarmonyPredicate, RDFPredicate, HARMONY, XSDDatatype } from '@harmony/vocab'
import type { Quad } from '@harmony/quads'
import type { HarmonyServer } from '@harmony/server'
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

export interface ImportChannel {
  id: string
  name: string
  type: string
}

export interface ImportMember {
  did: string
  displayName: string
}

export interface ImportRole {
  id: string
  name: string
  permissions: string[]
}

export interface ImportResult {
  communityId: string
  channels: ImportChannel[]
  members: ImportMember[]
  roles: ImportRole[]
  categories: ImportChannel[]
}

export class MigrationEndpoint {
  private exports: Map<string, ExportJob> = new Map()
  private logger: Logger
  private store: SQLiteQuadStore | null
  private harmonyServer: HarmonyServer | null = null
  private mediaPath: string

  constructor(logger: Logger, store: SQLiteQuadStore | null, mediaPath?: string) {
    this.logger = logger
    this.store = store
    this.mediaPath = mediaPath ?? './media'
  }

  /** Wire up the live HarmonyServer so imported communities can be registered */
  setHarmonyServer(server: HarmonyServer): void {
    this.harmonyServer = server
  }

  /**
   * Parse imported quads to extract community, channels, and members.
   */
  extractImportData(quads: Quad[]): ImportResult {
    // Find community
    let communityId = ''
    const communityQuad = quads.find((q) => q.predicate === RDFPredicate.type && q.object === HarmonyType.Community)
    if (communityQuad) {
      communityId = communityQuad.subject
    }

    // Helper to get literal value from quad object
    const litVal = (obj: Quad['object']): string =>
      typeof obj === 'object' ? obj.value : typeof obj === 'string' ? obj : 'unknown'

    // Find channels (Channel, Thread types — not Category)
    const channels: ImportChannel[] = []
    const channelQuads = quads.filter(
      (q) => q.predicate === RDFPredicate.type && (q.object === HarmonyType.Channel || q.object === HarmonyType.Thread)
    )
    for (const cq of channelQuads) {
      const nameQuad = quads.find((q) => q.subject === cq.subject && q.predicate === HarmonyPredicate.name)
      const name = nameQuad ? litVal(nameQuad.object) : 'unknown'
      const typeQuad = quads.find((q) => q.subject === cq.subject && q.predicate === `${HARMONY}channelType`)
      const type = typeQuad ? litVal(typeQuad.object) : cq.object === HarmonyType.Thread ? 'thread' : 'text'
      channels.push({ id: cq.subject, name, type })
    }

    // Find categories
    const categories: ImportChannel[] = []
    const categoryQuads = quads.filter((q) => q.predicate === RDFPredicate.type && q.object === HarmonyType.Category)
    for (const catQ of categoryQuads) {
      const nameQuad = quads.find((q) => q.subject === catQ.subject && q.predicate === HarmonyPredicate.name)
      const name = nameQuad ? litVal(nameQuad.object) : 'unknown'
      categories.push({ id: catQ.subject, name, type: 'category' })
    }

    // Find members
    const members: ImportMember[] = []
    const memberQuads = quads.filter((q) => q.predicate === RDFPredicate.type && q.object === HarmonyType.Member)
    for (const mq of memberQuads) {
      const nameQuad = quads.find((q) => q.subject === mq.subject && q.predicate === HarmonyPredicate.name)
      const displayName = nameQuad ? litVal(nameQuad.object) : 'unknown'
      members.push({ did: mq.subject, displayName })
    }

    // Find roles
    const roles: ImportRole[] = []
    const roleQuads = quads.filter((q) => q.predicate === RDFPredicate.type && q.object === HarmonyType.Role)
    for (const rq of roleQuads) {
      const nameQuad = quads.find((q) => q.subject === rq.subject && q.predicate === HarmonyPredicate.name)
      const name = nameQuad ? litVal(nameQuad.object) : 'unknown'
      const permQuads = quads.filter((q) => q.subject === rq.subject && q.predicate === HarmonyPredicate.permission)
      const permissions = permQuads.map((q) => litVal(q.object))
      roles.push({ id: rq.subject, name, permissions })
    }

    return { communityId, channels, members, roles, categories }
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

    // User data claim endpoints
    if (req.method === 'POST' && url === '/api/user-data/upload') {
      await this.handleUserDataUpload(req, res)
      return true
    }

    const userDataMatch = url.match(/^\/api\/user-data\/(.+)$/)
    if (userDataMatch) {
      const did = decodeURIComponent(userDataMatch[1])
      if (req.method === 'GET') {
        await this.handleUserDataGet(did, req, res)
        return true
      }
      if (req.method === 'DELETE') {
        await this.handleUserDataDelete(did, req, res)
        return true
      }
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

  private didToFilePath(did: string): string {
    const hash = createHash('sha256').update(did).digest('hex')
    const dir = join(this.mediaPath, 'user-data')
    return join(dir, `${hash}.enc`)
  }

  private didToMetaPath(did: string): string {
    const hash = createHash('sha256').update(did).digest('hex')
    const dir = join(this.mediaPath, 'user-data')
    return join(dir, `${hash}.meta.json`)
  }

  private extractDIDFromAuth(req: IncomingMessage): string | null {
    // Simple auth: DID passed in X-Harmony-DID header
    // In production this would be verified via VP/signature
    const did = req.headers['x-harmony-did']
    return typeof did === 'string' ? did : null
  }

  private async handleUserDataUpload(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: {
      did: string
      ciphertext: string // base64
      nonce: string // base64
      metadata: {
        messageCount: number
        channelCount: number
        serverCount: number
        dateRange: { earliest: string; latest: string } | null
        uploadedAt: string
      }
    }

    try {
      body = JSON.parse(await this.readBody(req))
    } catch {
      this.json(res, 400, { error: 'Invalid JSON body' })
      return
    }

    if (!body.did || !body.ciphertext || !body.nonce) {
      this.json(res, 400, { error: 'Missing required fields: did, ciphertext, nonce' })
      return
    }

    try {
      const filePath = this.didToFilePath(body.did)
      const metaPath = this.didToMetaPath(body.did)
      mkdirSync(dirname(filePath), { recursive: true })

      // Store the encrypted blob
      const cipherBytes = Buffer.from(body.ciphertext, 'base64')
      const nonceBytes = Buffer.from(body.nonce, 'base64')
      const blob = Buffer.concat([Buffer.from(new Uint32Array([nonceBytes.length]).buffer), nonceBytes, cipherBytes])
      writeFileSync(filePath, blob)

      // Store metadata (not sensitive — just counts)
      writeFileSync(metaPath, JSON.stringify(body.metadata))

      this.logger.info('User data uploaded', {
        did: body.did,
        size: blob.length,
        messageCount: body.metadata.messageCount
      })

      this.json(res, 200, { ok: true, size: blob.length })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error('User data upload failed', { error: message })
      this.json(res, 500, { error: `Upload failed: ${message}` })
    }
  }

  private async handleUserDataGet(did: string, _req: IncomingMessage, res: ServerResponse): Promise<void> {
    const filePath = this.didToFilePath(did)
    const metaPath = this.didToMetaPath(did)

    if (!existsSync(filePath)) {
      this.json(res, 404, { error: 'No data found for this DID' })
      return
    }

    try {
      const blob = readFileSync(filePath)
      // Parse: 4-byte nonce length, nonce, ciphertext
      const nonceLen = new Uint32Array(blob.buffer.slice(blob.byteOffset, blob.byteOffset + 4))[0]
      const nonce = blob.subarray(4, 4 + nonceLen)
      const ciphertext = blob.subarray(4 + nonceLen)

      let metadata = null
      if (existsSync(metaPath)) {
        metadata = JSON.parse(readFileSync(metaPath, 'utf-8'))
      }

      this.json(res, 200, {
        ciphertext: Buffer.from(ciphertext).toString('base64'),
        nonce: Buffer.from(nonce).toString('base64'),
        metadata
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.json(res, 500, { error: `Read failed: ${message}` })
    }
  }

  private async handleUserDataDelete(did: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Verify the requester is the DID owner
    const authDid = this.extractDIDFromAuth(req)
    if (!authDid || authDid !== did) {
      this.json(res, 403, { error: 'Not authorized to delete this data' })
      return
    }

    const filePath = this.didToFilePath(did)
    const metaPath = this.didToMetaPath(did)

    if (!existsSync(filePath)) {
      this.json(res, 404, { error: 'No data found for this DID' })
      return
    }

    try {
      unlinkSync(filePath)
      if (existsSync(metaPath)) unlinkSync(metaPath)
      this.logger.info('User data deleted', { did })
      this.json(res, 200, { ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.json(res, 500, { error: `Delete failed: ${message}` })
    }
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

      // Extract structured data from quads
      const importData = this.extractImportData(quads)

      // Register community with live server so it's immediately accessible
      if (this.harmonyServer && importData.communityId) {
        this.harmonyServer.registerCommunity(importData.communityId)

        // Populate MessageStore from imported message quads
        const messageStore = this.harmonyServer.messageStoreInstance
        const messageQuads = quads.filter((q) => q.predicate === RDFPredicate.type && q.object === HarmonyType.Message)

        for (const mq of messageQuads) {
          const subject = mq.subject
          const contentQuad = quads.find((q) => q.subject === subject && q.predicate === HarmonyPredicate.content)
          const authorQuad = quads.find((q) => q.subject === subject && q.predicate === HarmonyPredicate.author)
          const tsQuad = quads.find((q) => q.subject === subject && q.predicate === HarmonyPredicate.timestamp)
          const channelQuad = quads.find((q) => q.subject === subject && q.predicate === HarmonyPredicate.inChannel)

          if (!contentQuad || !authorQuad || !tsQuad || !channelQuad) continue

          const litVal = (obj: Quad['object']): string =>
            typeof obj === 'object' ? obj.value : typeof obj === 'string' ? obj : ''

          const content = litVal(contentQuad.object)
          const author = litVal(authorQuad.object)
          const timestamp = litVal(tsQuad.object)
          const channelId = litVal(channelQuad.object)

          const protocolMessage = {
            id: subject,
            type: 'channel.send' as const,
            timestamp,
            sender: author,
            payload: { content, clock: { counter: 0, nodeId: author } }
          }

          await messageStore.storeMessage(importData.communityId, channelId, protocolMessage)
        }
      }

      this.logger.info('Migration import complete', {
        adminDID: body.adminDID,
        communityName: body.communityName,
        communityId: importData.communityId,
        quadCount: quads.length,
        channelCount: importData.channels.length,
        memberCount: importData.members.length
      })

      this.json(res, 200, importData)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error('Migration import failed', { error: message })
      this.json(res, 500, { error: `Import failed: ${message}` })
    }
  }
}
