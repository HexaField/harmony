import type { IncomingMessage, ServerResponse } from 'node:http'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createCryptoProvider, type CryptoProvider, type KeyPair } from '@harmony/crypto'
import { MigrationBot, DiscordRESTAPI } from '@harmony/migration-bot'
import { MigrationService, type EncryptedExportBundle } from '@harmony/migration'
import type { ExportProgress } from '@harmony/migration-bot'
import { HarmonyType, HarmonyPredicate, RDFPredicate, HARMONY } from '@harmony/vocab'
import { decodeMultibase, ED25519_MULTICODEC } from '@harmony/did'
import type { Quad } from '@harmony/quads'
import type { HarmonyServer } from '@harmony/server'
import type { SQLiteQuadStore } from './sqlite-quad-store.js'
import type { Logger } from './logger.js'

/** Max clock skew for auth signature timestamps (5 minutes) */
const AUTH_TIMESTAMP_WINDOW_MS = 5 * 60 * 1000

interface ExportJob {
  id: string
  status: 'running' | 'complete' | 'error'
  progress: ExportProgress | null
  bundle: EncryptedExportBundle | null
  adminKeyPair: KeyPair | null
  error: string | null
  createdAt: number
}

/** Hash-based migration metadata */
interface MigrationRecord {
  id: string
  serverId: string
  serverName: string
  adminDID: string
  channelMap: Record<string, string> // discordChannelId → harmonyChannelId
  hashCount: number
  createdAt: string
  expiresAt: string
  status: 'active' | 'expired' | 'deleted'
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
  private migrations: Map<string, MigrationRecord> = new Map()
  private migrationHashes: Map<string, Set<string>> = new Map() // migrationId → set of hashes
  private logger: Logger
  private store: SQLiteQuadStore | null
  private harmonyServer: HarmonyServer | null = null
  private mediaPath: string
  private crypto: CryptoProvider

  constructor(logger: Logger, store: SQLiteQuadStore | null, mediaPath?: string) {
    this.logger = logger
    this.store = store
    this.mediaPath = mediaPath ?? './media'
    this.crypto = createCryptoProvider()
  }

  /** Wire up the live HarmonyServer so imported communities can be registered */
  setHarmonyServer(server: HarmonyServer): void {
    this.harmonyServer = server
  }

  /**
   * Verify Ed25519 signed authorization header.
   *
   * Header format: `Authorization: Harmony-Ed25519 <did> <timestamp> <base64-signature>`
   * Signature is over: `${timestamp}:${method}:${path}`
   * Timestamp must be within AUTH_TIMESTAMP_WINDOW_MS of server time.
   *
   * Returns the authenticated DID, or null if auth fails.
   */
  private async authenticateRequest(req: IncomingMessage, res: ServerResponse): Promise<string | null> {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Harmony-Ed25519 ')) {
      this.json(res, 401, {
        error: 'Missing or invalid Authorization header. Expected: Harmony-Ed25519 <did> <timestamp> <base64-signature>'
      })
      return null
    }

    const parts = authHeader.slice('Harmony-Ed25519 '.length).split(' ')
    if (parts.length !== 3) {
      this.json(res, 401, { error: 'Malformed Authorization header' })
      return null
    }

    const [did, timestampStr, signatureB64] = parts

    // Validate DID format
    if (!did.startsWith('did:key:z6Mk')) {
      this.json(res, 401, { error: 'Only did:key (Ed25519) DIDs are supported' })
      return null
    }

    // Validate timestamp
    const timestamp = parseInt(timestampStr, 10)
    if (Number.isNaN(timestamp)) {
      this.json(res, 401, { error: 'Invalid timestamp' })
      return null
    }
    const now = Date.now()
    if (Math.abs(now - timestamp) > AUTH_TIMESTAMP_WINDOW_MS) {
      this.json(res, 401, { error: 'Timestamp outside acceptable window (±5 minutes)' })
      return null
    }

    // Extract public key from DID
    let publicKey: Uint8Array
    try {
      const multibase = did.slice('did:key:'.length)
      const decoded = decodeMultibase(multibase)
      if (decoded.prefix !== ED25519_MULTICODEC) {
        this.json(res, 401, { error: 'DID does not use Ed25519 key' })
        return null
      }
      publicKey = decoded.key
    } catch {
      this.json(res, 401, { error: 'Failed to decode DID public key' })
      return null
    }

    // Verify signature over `timestamp:method:path`
    const method = req.method ?? 'GET'
    const path = req.url ?? '/'
    const message = `${timestampStr}:${method}:${path}`
    const messageBytes = new TextEncoder().encode(message)

    let signature: Uint8Array
    try {
      signature = Uint8Array.from(Buffer.from(signatureB64, 'base64'))
    } catch {
      this.json(res, 401, { error: 'Invalid signature encoding' })
      return null
    }

    try {
      const valid = await this.crypto.verify(messageBytes, signature, publicKey)
      if (!valid) {
        this.json(res, 401, { error: 'Signature verification failed' })
        return null
      }
    } catch {
      this.json(res, 401, { error: 'Signature verification error' })
      return null
    }

    return did
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
      const authedDID = await this.authenticateRequest(req, res)
      if (!authedDID) return true // 401 already sent
      await this.handleExport(req, res)
      return true
    }

    const exportStatusMatch = url.match(/^\/api\/migration\/export\/([a-f0-9-]+)$/)
    if (req.method === 'GET' && exportStatusMatch) {
      this.handleExportStatus(exportStatusMatch[1], res)
      return true
    }

    if (req.method === 'POST' && url === '/api/migration/import') {
      const authedDID = await this.authenticateRequest(req, res)
      if (!authedDID) return true
      await this.handleImport(req, res)
      return true
    }

    // ── Hash-based migration endpoints ──

    if (req.method === 'POST' && url === '/api/migration/create') {
      const authedDID = await this.authenticateRequest(req, res)
      if (!authedDID) return true
      await this.handleMigrationCreate(req, res, authedDID)
      return true
    }

    const migrationHashesMatch = url.match(/^\/api\/migration\/([a-f0-9-]+)\/hashes$/)
    if (req.method === 'POST' && migrationHashesMatch) {
      const authedDID = await this.authenticateRequest(req, res)
      if (!authedDID) return true
      await this.handleMigrationHashes(migrationHashesMatch[1], req, res, authedDID)
      return true
    }

    const migrationVerifyMatch = url.match(/^\/api\/migration\/([a-f0-9-]+)\/verify$/)
    if (req.method === 'POST' && migrationVerifyMatch) {
      const authedDID = await this.authenticateRequest(req, res)
      if (!authedDID) return true
      await this.handleMigrationVerify(migrationVerifyMatch[1], req, res)
      return true
    }

    const migrationImportMatch = url.match(/^\/api\/migration\/([a-f0-9-]+)\/import$/)
    if (req.method === 'POST' && migrationImportMatch) {
      const authedDID = await this.authenticateRequest(req, res)
      if (!authedDID) return true
      await this.handleMigrationImportVerified(migrationImportMatch[1], req, res, authedDID)
      return true
    }

    const migrationStatusMatch = url.match(/^\/api\/migration\/([a-f0-9-]+)\/status$/)
    if (req.method === 'GET' && migrationStatusMatch) {
      this.handleMigrationStatus(migrationStatusMatch[1], res)
      return true
    }

    const migrationDeleteMatch = url.match(/^\/api\/migration\/([a-f0-9-]+)$/)
    if (req.method === 'DELETE' && migrationDeleteMatch) {
      const authedDID = await this.authenticateRequest(req, res)
      if (!authedDID) return true
      this.handleMigrationDelete(migrationDeleteMatch[1], res, authedDID)
      return true
    }

    // User data claim endpoints — require DID ownership proof
    if (req.method === 'POST' && url === '/api/user-data/upload') {
      const authedDID = await this.authenticateRequest(req, res)
      if (!authedDID) return true
      await this.handleUserDataUpload(req, res, authedDID)
      return true
    }

    const userDataMatch = url.match(/^\/api\/user-data\/(.+)$/)
    if (userDataMatch) {
      const did = decodeURIComponent(userDataMatch[1])
      if (req.method === 'GET') {
        const authedDID = await this.authenticateRequest(req, res)
        if (!authedDID) return true
        if (authedDID !== did) {
          this.json(res, 403, { error: 'DID mismatch: you can only access your own data' })
          return true
        }
        await this.handleUserDataGet(did, req, res)
        return true
      }
      if (req.method === 'DELETE') {
        const authedDID = await this.authenticateRequest(req, res)
        if (!authedDID) return true
        if (authedDID !== did) {
          this.json(res, 403, { error: 'DID mismatch: you can only delete your own data' })
          return true
        }
        await this.handleUserDataDelete(did, req, res)
        return true
      }
    }

    return false
  }

  private static readonly MAX_BODY_SIZE = 5 * 1024 * 1024 // 5MB

  private async readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      let totalSize = 0
      req.on('data', (chunk: Buffer) => {
        totalSize += chunk.length
        if (totalSize > MigrationEndpoint.MAX_BODY_SIZE) {
          req.destroy()
          reject(new Error('Request body too large'))
          return
        }
        chunks.push(chunk)
      })
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

  private async handleUserDataUpload(req: IncomingMessage, res: ServerResponse, authedDID: string): Promise<void> {
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

    // Enforce DID ownership: body.did must match authenticated DID
    if (body.did !== authedDID) {
      this.json(res, 403, { error: 'DID mismatch: you can only upload data for your own DID' })
      return
    }

    // Validate DID length to prevent storage abuse
    if (body.did.length > 256) {
      this.json(res, 400, { error: 'DID exceeds maximum length of 256 characters' })
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

  private async handleUserDataDelete(did: string, _req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Auth already verified in handleRequest — authedDID === did enforced there

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

  // ── Hash-based migration methods ──

  private async handleMigrationCreate(req: IncomingMessage, res: ServerResponse, authedDID: string): Promise<void> {
    let body: {
      serverId: string
      serverName: string
      channelMap: Record<string, string>
    }

    try {
      body = JSON.parse(await this.readBody(req))
    } catch {
      this.json(res, 400, { error: 'Invalid JSON body' })
      return
    }

    if (!body.serverId || !body.serverName || !body.channelMap) {
      this.json(res, 400, { error: 'Missing required fields: serverId, serverName, channelMap' })
      return
    }

    const TTL_DAYS = 30
    const now = new Date()
    const expiresAt = new Date(now.getTime() + TTL_DAYS * 24 * 60 * 60 * 1000)

    const id = crypto.randomUUID()
    const record: MigrationRecord = {
      id,
      serverId: body.serverId,
      serverName: body.serverName,
      adminDID: authedDID,
      channelMap: body.channelMap,
      hashCount: 0,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: 'active'
    }

    this.migrations.set(id, record)
    this.migrationHashes.set(id, new Set())

    this.logger.info('Migration created', { id, serverId: body.serverId, adminDID: authedDID })
    this.json(res, 201, { id, expiresAt: expiresAt.toISOString() })
  }

  private async handleMigrationHashes(
    migrationId: string,
    req: IncomingMessage,
    res: ServerResponse,
    authedDID: string
  ): Promise<void> {
    const migration = this.migrations.get(migrationId)
    if (!migration) {
      this.json(res, 404, { error: 'Migration not found' })
      return
    }
    if (migration.adminDID !== authedDID) {
      this.json(res, 403, { error: 'Only the migration admin can upload hashes' })
      return
    }
    if (migration.status !== 'active') {
      this.json(res, 410, { error: 'Migration is no longer active' })
      return
    }

    let body: { hashes: Array<{ hash: string; channelId: string; messageId: string }> }
    try {
      body = JSON.parse(await this.readBody(req))
    } catch {
      this.json(res, 400, { error: 'Invalid JSON body' })
      return
    }

    if (!body.hashes || !Array.isArray(body.hashes)) {
      this.json(res, 400, { error: 'Missing required field: hashes (array)' })
      return
    }

    const hashSet = this.migrationHashes.get(migrationId)!
    for (const entry of body.hashes) {
      hashSet.add(entry.hash)
    }
    migration.hashCount = hashSet.size

    this.logger.info('Migration hashes uploaded', { migrationId, count: body.hashes.length, total: hashSet.size })
    this.json(res, 200, { ok: true, totalHashes: hashSet.size })
  }

  private async handleMigrationVerify(migrationId: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const migration = this.migrations.get(migrationId)
    if (!migration) {
      this.json(res, 404, { error: 'Migration not found' })
      return
    }
    if (migration.status !== 'active') {
      this.json(res, 410, { error: 'Migration is no longer active' })
      return
    }

    let body: { hashes: string[] }
    try {
      body = JSON.parse(await this.readBody(req))
    } catch {
      this.json(res, 400, { error: 'Invalid JSON body' })
      return
    }

    if (!body.hashes || !Array.isArray(body.hashes)) {
      this.json(res, 400, { error: 'Missing required field: hashes (array of hash strings)' })
      return
    }

    const storedIndex = this.migrationHashes.get(migrationId)!
    const verified: string[] = []
    const rejected: string[] = []

    for (const hash of body.hashes) {
      if (storedIndex.has(hash)) {
        verified.push(hash)
      } else {
        rejected.push(hash)
      }
    }

    this.json(res, 200, {
      verified: verified.length,
      rejected: rejected.length,
      total: body.hashes.length,
      verifiedHashes: verified
    })
  }

  private async handleMigrationImportVerified(
    migrationId: string,
    req: IncomingMessage,
    res: ServerResponse,
    authedDID: string
  ): Promise<void> {
    const migration = this.migrations.get(migrationId)
    if (!migration) {
      this.json(res, 404, { error: 'Migration not found' })
      return
    }
    if (migration.status !== 'active') {
      this.json(res, 410, { error: 'Migration is no longer active' })
      return
    }

    let body: {
      verifiedHashes: string[]
      messages: Array<{
        hash: string
        channelId: string
        content: string
        timestamp: string
      }>
    }

    try {
      body = JSON.parse(await this.readBody(req))
    } catch {
      this.json(res, 400, { error: 'Invalid JSON body' })
      return
    }

    if (!body.messages || !Array.isArray(body.messages)) {
      this.json(res, 400, { error: 'Missing required field: messages' })
      return
    }

    // Only import messages whose hashes were verified
    const storedIndex = this.migrationHashes.get(migrationId)!
    const verifiedSet = new Set(body.verifiedHashes)
    let imported = 0

    for (const msg of body.messages) {
      if (!storedIndex.has(msg.hash) || !verifiedSet.has(msg.hash)) continue

      // Import into store if available
      if (this.store && this.harmonyServer) {
        const harmonyChannelId = migration.channelMap[msg.channelId] ?? msg.channelId
        const communityId = `harmony:community:${migration.serverId}`

        const protocolMessage = {
          id: `harmony:message:${msg.hash.slice(0, 16)}`,
          type: 'channel.send' as const,
          timestamp: msg.timestamp,
          sender: authedDID,
          payload: { content: msg.content, clock: { counter: 0, nodeId: authedDID } }
        }

        await this.harmonyServer.messageStoreInstance.storeMessage(communityId, harmonyChannelId, protocolMessage)
        imported++
      }
    }

    this.logger.info('Migration messages imported', { migrationId, imported, userDID: authedDID })
    this.json(res, 200, { ok: true, imported })
  }

  private handleMigrationStatus(migrationId: string, res: ServerResponse): void {
    const migration = this.migrations.get(migrationId)
    if (!migration) {
      this.json(res, 404, { error: 'Migration not found' })
      return
    }

    // Check TTL
    if (new Date() > new Date(migration.expiresAt) && migration.status === 'active') {
      migration.status = 'expired'
      this.migrationHashes.delete(migrationId)
    }

    this.json(res, 200, {
      id: migration.id,
      serverId: migration.serverId,
      serverName: migration.serverName,
      hashCount: migration.hashCount,
      status: migration.status,
      createdAt: migration.createdAt,
      expiresAt: migration.expiresAt
    })
  }

  private handleMigrationDelete(migrationId: string, res: ServerResponse, authedDID: string): void {
    const migration = this.migrations.get(migrationId)
    if (!migration) {
      this.json(res, 404, { error: 'Migration not found' })
      return
    }
    if (migration.adminDID !== authedDID) {
      this.json(res, 403, { error: 'Only the migration admin can delete' })
      return
    }

    migration.status = 'deleted'
    this.migrationHashes.delete(migrationId)
    this.migrations.delete(migrationId)

    this.logger.info('Migration deleted', { migrationId })
    this.json(res, 200, { ok: true })
  }

  /**
   * Periodic cleanup of expired migrations (call from server tick or cron).
   */
  cleanupExpiredMigrations(): number {
    const now = new Date()
    let cleaned = 0
    for (const [id, record] of this.migrations) {
      if (now > new Date(record.expiresAt)) {
        record.status = 'expired'
        this.migrationHashes.delete(id)
        this.migrations.delete(id)
        cleaned++
      }
    }
    if (cleaned > 0) {
      this.logger.info('Cleaned up expired migrations', { count: cleaned })
    }
    return cleaned
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
