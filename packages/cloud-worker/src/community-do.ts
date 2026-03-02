// CommunityDurableObject — one per community, handles WebSocket connections
// Uses Hibernatable WebSockets and DO SQLite storage

import { DurableObject } from 'cloudflare:workers'
import { serialise, deserialise } from '@harmony/protocol'
import type { ProtocolMessage } from '@harmony/protocol'
import { HarmonyPredicate, HarmonyType, HARMONY } from '@harmony/vocab'
import { DOQuadStore } from './do-quad-store.js'
import { parseVP, verifyVP } from './auth.js'
import type { Env, ConnectionMeta, HealthResponse } from './types.js'

// ── Validation Constants ──
const MAX_CONTENT_LENGTH = 4000
const MAX_NAME_LENGTH = 100
const MAX_TOPIC_LENGTH = 500
const RATE_LIMIT_MAX = 50
const RATE_LIMIT_WINDOW_MS = 10_000

function validateDID(did: unknown): string | null {
  if (typeof did !== 'string' || !did.startsWith('did:')) return 'Invalid DID format'
  return null
}

function validateStringLength(value: string, maxLength: number, fieldName: string): string | null {
  if (value.length > maxLength) return `${fieldName} exceeds maximum length of ${maxLength}`
  return null
}

function validateRequiredStrings(fields: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return `Missing or empty required field: ${key}`
    }
  }
  return null
}

export class CommunityDurableObject extends DurableObject {
  private quadStore: DOQuadStore
  private communityId: string | null = null

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.quadStore = new DOQuadStore(ctx.storage.sql)
    this.initSchema()
  }

  private initSchema(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS quads (
        subject TEXT NOT NULL,
        predicate TEXT NOT NULL,
        object TEXT NOT NULL,
        graph TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (subject, predicate, object, graph)
      );
      CREATE INDEX IF NOT EXISTS idx_quads_graph ON quads(graph);
      CREATE INDEX IF NOT EXISTS idx_quads_subject ON quads(subject);

      CREATE TABLE IF NOT EXISTS members (
        did TEXT PRIMARY KEY,
        display_name TEXT,
        roles TEXT DEFAULT '[]',
        joined_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS channels (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'text',
        category_id TEXT,
        topic TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS voice_participants (
        room_id TEXT NOT NULL,
        did TEXT NOT NULL,
        audio_enabled INTEGER NOT NULL DEFAULT 1,
        video_enabled INTEGER NOT NULL DEFAULT 0,
        joined_at TEXT NOT NULL,
        PRIMARY KEY (room_id, did)
      );

      CREATE TABLE IF NOT EXISTS pins (channel_id TEXT NOT NULL, message_id TEXT NOT NULL, pinned_by TEXT NOT NULL, pinned_at TEXT NOT NULL, PRIMARY KEY (channel_id, message_id));
      CREATE TABLE IF NOT EXISTS banned_users (did TEXT PRIMARY KEY, banned_by TEXT NOT NULL, banned_at TEXT NOT NULL, reason TEXT);
      CREATE TABLE IF NOT EXISTS threads (id TEXT PRIMARY KEY, parent_message_id TEXT NOT NULL, channel_id TEXT NOT NULL, name TEXT NOT NULL, creator_did TEXT NOT NULL, created_at TEXT NOT NULL, message_count INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT, permissions TEXT NOT NULL DEFAULT '[]', position INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS member_roles (member_did TEXT NOT NULL, role_id TEXT NOT NULL, PRIMARY KEY (member_did, role_id));
      CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, recipient_did TEXT NOT NULL, type TEXT NOT NULL, from_did TEXT NOT NULL, community_id TEXT, channel_id TEXT, message_id TEXT, content TEXT, read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS key_packages (did TEXT NOT NULL, package_data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS e2ee_groups (group_id TEXT PRIMARY KEY, creator_did TEXT NOT NULL, channel_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, filename TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL, data TEXT NOT NULL, uploaded_by TEXT NOT NULL, channel_id TEXT NOT NULL, uploaded_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS moderation_rules (id TEXT PRIMARY KEY, type TEXT NOT NULL, config TEXT NOT NULL);

      CREATE TABLE IF NOT EXISTS voice_tracks (
        room_id TEXT NOT NULL,
        did TEXT NOT NULL,
        track_name TEXT NOT NULL,
        session_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        media_type TEXT NOT NULL,
        PRIMARY KEY (room_id, did, track_name)
      );
    `)
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // Extract communityId from request path (set by worker routing: /ws/:communityId)
    const pathCommunityId = url.pathname.split('/')[2] || url.searchParams.get('community')
    if (pathCommunityId) {
      if (this.communityId && this.communityId !== pathCommunityId) {
        return new Response('Community ID mismatch', { status: 403 })
      }
      this.communityId = pathCommunityId
    }

    // Health endpoint (called internally)
    if (url.pathname === '/health') {
      const connections = this.ctx.getWebSockets().length
      return Response.json({ status: 'ok', connections } satisfies HealthResponse)
    }

    // WebSocket upgrade
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 })
    }

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)

    this.ctx.acceptWebSocket(server, ['unauthenticated'])
    server.serializeAttachment({
      did: '',
      authenticated: false,
      connectedAt: new Date().toISOString()
    } satisfies ConnectionMeta)

    // Set auth timeout — close if not authenticated within 30s
    this.ctx.storage.setAlarm(Date.now() + 30_000)

    return new Response(null, { status: 101, webSocket: client })
  }

  async alarm(): Promise<void> {
    // Close unauthenticated connections
    for (const ws of this.ctx.getWebSockets('unauthenticated')) {
      const meta: ConnectionMeta = ws.deserializeAttachment()
      if (!meta.authenticated) {
        this.sendError(ws, 'Authentication timeout')
        ws.close(4001, 'Authentication timeout')
      }
    }
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const meta: ConnectionMeta = ws.deserializeAttachment()
    const msgStr = typeof message === 'string' ? message : new TextDecoder().decode(message)

    // If not authenticated, expect a VP
    if (!meta.authenticated) {
      await this.handleAuth(ws, meta, msgStr)
      return
    }

    // Rate limiting
    const now = Date.now()
    const windowStart = meta.rateLimitWindowStart ?? now
    if (now - windowStart > RATE_LIMIT_WINDOW_MS) {
      meta.rateLimitCounter = 1
      meta.rateLimitWindowStart = now
    } else {
      meta.rateLimitCounter = (meta.rateLimitCounter ?? 0) + 1
    }
    ws.serializeAttachment(meta)

    if (meta.rateLimitCounter > RATE_LIMIT_MAX) {
      this.sendError(ws, 'Rate limit exceeded', 'RATE_LIMITED')
      return
    }

    // Parse protocol message
    let msg: ProtocolMessage
    try {
      msg = deserialise<ProtocolMessage>(msgStr)
    } catch {
      this.sendError(ws, 'Invalid message format')
      return
    }

    await this.handleMessage(ws, meta, msg)
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    const meta: ConnectionMeta = ws.deserializeAttachment()
    if (meta.authenticated && meta.did) {
      // Broadcast presence offline
      this.broadcast(
        serialise({
          id: crypto.randomUUID(),
          type: 'presence.changed',
          timestamp: new Date().toISOString(),
          sender: 'server',
          payload: { did: meta.did, status: 'offline' }
        }),
        ws
      )
    }
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    ws.close(1011, 'Internal error')
  }

  // ── Auth ──

  private async handleAuth(ws: WebSocket, meta: ConnectionMeta, msgStr: string): Promise<void> {
    const vp = parseVP(msgStr)
    if (!vp) {
      this.sendError(ws, 'Expected VerifiablePresentation for authentication')
      ws.close(4001, 'Invalid auth')
      return
    }

    const did = await verifyVP(vp)
    if (!did) {
      this.sendError(ws, 'VP verification failed')
      ws.close(4001, 'Auth failed')
      return
    }

    const didErr = validateDID(did)
    if (didErr) {
      this.sendError(ws, didErr)
      ws.close(4001, 'Invalid DID')
      return
    }

    // Check if banned
    if (this.isBanned(did)) {
      this.sendError(ws, 'You are banned from this community')
      ws.close(4003, 'Banned')
      return
    }

    // Authenticated — update metadata
    meta.did = did
    meta.authenticated = true
    ws.serializeAttachment(meta)

    // Update tags to remove 'unauthenticated'
    // (CF doesn't support re-tagging, but we track via attachment)

    // Add member to community if not already
    this.ensureMember(did)

    // Send auth success
    ws.send(
      serialise({
        id: crypto.randomUUID(),
        type: 'sync.response',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { authenticated: true, did }
      })
    )

    // Broadcast presence online
    this.broadcast(
      serialise({
        id: crypto.randomUUID(),
        type: 'presence.changed',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { did, status: 'online' }
      }),
      ws
    )
  }

  // ── Message Handling ──

  private async handleMessage(ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): Promise<void> {
    // Validate communityId if present in payload
    const payload = msg.payload as Record<string, unknown> | undefined
    if (payload && typeof payload.communityId === 'string' && this.communityId) {
      if (payload.communityId !== this.communityId) {
        this.sendError(
          ws,
          `Community ID mismatch: message targets '${payload.communityId}' but this DO owns '${this.communityId}'`
        )
        return
      }
    }

    switch (msg.type) {
      case 'channel.send':
        await this.handleChannelSend(ws, meta, msg)
        break
      case 'channel.edit':
        await this.handleChannelEdit(ws, meta, msg)
        break
      case 'channel.delete':
        await this.handleChannelDelete(meta, msg)
        break
      case 'channel.typing':
        this.handleChannelTyping(meta, msg)
        break
      case 'community.create':
        await this.handleCommunityCreate(ws, meta, msg)
        break
      case 'community.join':
        await this.handleCommunityJoin(ws, meta, msg)
        break
      case 'community.leave':
        await this.handleCommunityLeave(meta, msg)
        break
      case 'channel.create':
        await this.handleChannelCreate(ws, meta, msg)
        break
      case 'presence.update':
        this.handlePresenceUpdate(meta, msg)
        break
      case 'sync.request':
        await this.handleSyncRequest(ws, meta)
        break
      case 'voice.join':
        await this.handleVoiceJoin(ws, meta, msg)
        break
      case 'voice.leave':
        await this.handleVoiceLeave(ws, meta, msg)
        break
      case 'voice.mute':
        await this.handleVoiceMute(ws, meta, msg)
        break
      case 'channel.update':
        this.handleChannelUpdate(ws, meta, msg)
        break
      case 'channel.delete.admin':
        this.handleChannelDeleteAdmin(ws, meta, msg)
        break
      case 'channel.pin':
        this.handleChannelPin(ws, meta, msg)
        break
      case 'channel.unpin':
        this.handleChannelUnpin(ws, meta, msg)
        break
      case 'channel.pins.list':
        this.handleChannelPinsList(ws, meta, msg)
        break
      case 'channel.reaction.add':
        this.handleChannelReactionAdd(meta, msg)
        break
      case 'channel.reaction.remove':
        this.handleChannelReactionRemove(meta, msg)
        break
      case 'channel.history':
        this.handleChannelHistory(ws, msg)
        break
      case 'community.update':
        this.handleCommunityUpdate(ws, meta, msg)
        break
      case 'community.info':
        this.handleCommunityInfo(ws, msg)
        break
      case 'community.list':
        this.handleCommunityList(ws, msg)
        break
      case 'community.ban':
        this.handleCommunityBan(ws, meta, msg)
        break
      case 'community.unban':
        this.handleCommunityUnban(ws, meta, msg)
        break
      case 'community.kick':
        this.handleCommunityKick(ws, meta, msg)
        break
      case 'community.member.reconciled':
        ws.send(
          serialise({
            id: msg.id,
            type: 'community.member.reconciled.ack',
            timestamp: new Date().toISOString(),
            sender: 'server',
            payload: {}
          })
        )
        break
      case 'dm.send':
        this.handleDmSend(ws, meta, msg)
        break
      case 'dm.edit':
        this.handleDmEdit(ws, meta, msg)
        break
      case 'dm.delete':
        this.handleDmDelete(ws, meta, msg)
        break
      case 'dm.typing':
        this.handleDmTyping(ws, meta, msg)
        break
      case 'dm.keyexchange':
        this.handleDmKeyexchange(ws, meta, msg)
        break
      case 'thread.create':
        this.handleThreadCreate(meta, msg)
        break
      case 'thread.send':
        this.handleThreadSend(meta, msg)
        break
      case 'role.create':
        this.handleRoleCreate(ws, meta, msg)
        break
      case 'role.update':
        this.handleRoleUpdate(ws, meta, msg)
        break
      case 'role.delete':
        this.handleRoleDelete(ws, meta, msg)
        break
      case 'role.assign':
        this.handleRoleAssign(ws, meta, msg)
        break
      case 'role.remove':
        this.handleRoleRemove(ws, meta, msg)
        break
      case 'member.update':
        this.handleMemberUpdate(meta, msg)
        break
      case 'search.query':
        this.handleSearchQuery(ws, msg)
        break
      case 'media.upload.request':
        this.handleMediaUploadRequest(ws, meta, msg)
        break
      case 'media.delete':
        this.handleMediaDelete(ws, meta, msg)
        break
      case 'mls.keypackage.upload':
        this.handleMlsKeypackageUpload(meta, msg)
        break
      case 'mls.keypackage.fetch':
        this.handleMlsKeypackageFetch(ws, msg)
        break
      case 'mls.welcome':
        this.handleMlsWelcome(ws, meta, msg)
        break
      case 'mls.commit':
        this.handleMlsCommit(ws, meta, msg)
        break
      case 'mls.group.setup':
        this.handleMlsGroupSetup(ws, meta, msg)
        break
      case 'mls.member.joined':
        // no-op client-to-client
        break
      case 'moderation.config.update':
        this.handleModerationConfigUpdate(ws, meta, msg)
        break
      case 'moderation.config.get':
        this.handleModerationConfigGet(ws, msg)
        break
      case 'notification.list':
        this.handleNotificationList(ws, meta)
        break
      case 'notification.mark-read':
        this.handleNotificationMarkRead(ws, meta, msg)
        break
      case 'notification.count':
        this.handleNotificationCount(ws, meta)
        break
      case 'voice.unmute':
        await this.handleVoiceMute(ws, meta, msg)
        break
      case 'voice.offer':
      case 'voice.answer':
      case 'voice.ice':
        this.handleVoiceSignaling(ws, meta, msg)
        break
      case 'voice.video':
        this.handleVoiceVideo(meta, msg)
        break
      case 'voice.screen':
        this.handleVoiceScreen(meta, msg)
        break
      case 'voice.speaking':
        this.handleVoiceSpeaking(ws, meta, msg)
        break
      case 'voice.token':
        this.handleVoiceToken(ws, msg)
        break
      case 'voice.session.create':
        this.handleVoiceSessionCreate(ws, meta, msg)
        break
      case 'voice.tracks.push':
        this.handleVoiceTracksPush(ws, msg)
        break
      case 'voice.tracks.pull':
        this.handleVoiceTracksPull(ws, msg)
        break
      case 'voice.renegotiate':
        this.handleVoiceRenegotiate(ws, msg)
        break
      case 'voice.transport.connect':
      case 'voice.transport.connect-recv':
      case 'voice.transport.create-recv':
      case 'voice.produce':
      case 'voice.consume':
      case 'voice.consumer.resume':
        this.sendError(ws, 'NO_SFU: SFU mode not available in cloud worker')
        break
      case 'voice.get-producers':
        this.handleVoiceGetProducers(ws, meta, msg)
        break
      case 'voice.track.published':
        this.handleVoiceTrackPublished(ws, meta, msg)
        break
      case 'voice.track.removed':
        this.handleVoiceTrackRemoved(ws, meta, msg)
        break
      case 'voice.tracks.close':
        this.handleVoiceTracksClose(ws, msg)
        break
      case 'voice.producer-closed':
        this.handleVoiceProducerClosed(ws, meta, msg)
        break
      default:
        this.sendError(ws, `Unsupported message type: ${msg.type}`)
    }
  }

  private async handleChannelSend(ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { communityId: string; channelId: string; content: unknown; nonce: string }

    // Validate content length
    const contentStr = typeof payload.content === 'string' ? payload.content : JSON.stringify(payload.content)
    const lengthErr = validateStringLength(contentStr, MAX_CONTENT_LENGTH, 'content')
    if (lengthErr) {
      this.sendError(ws, lengthErr)
      return
    }

    // Store message as quads
    const graph = `${payload.communityId}:${payload.channelId}`
    this.quadStore.addAll([
      { subject: msg.id, predicate: 'rdf:type', object: HarmonyType.Message, graph },
      { subject: msg.id, predicate: HarmonyPredicate.author, object: meta.did, graph },
      { subject: msg.id, predicate: HarmonyPredicate.timestamp, object: msg.timestamp, graph },
      { subject: msg.id, predicate: HarmonyPredicate.inChannel, object: payload.channelId, graph },
      { subject: msg.id, predicate: HarmonyPredicate.community, object: payload.communityId, graph },
      { subject: msg.id, predicate: `${HARMONY}content`, object: JSON.stringify(payload.content), graph }
    ])

    // Broadcast to all connected clients
    this.broadcast(
      serialise({
        id: msg.id,
        type: 'channel.message',
        timestamp: msg.timestamp,
        sender: meta.did,
        payload
      })
    )
  }

  private async handleChannelEdit(_unused: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { communityId: string; channelId: string; messageId: string; content: unknown }
    const graph = `${payload.communityId}:${payload.channelId}`

    // Verify author
    const author = this.quadStore.getValue(payload.messageId, HarmonyPredicate.author, graph)
    if (author !== meta.did) return

    // Remove old content quad by fetching its current value
    const oldContent = this.quadStore.getValue(payload.messageId, `${HARMONY}content`, graph)
    if (oldContent !== null) {
      this.quadStore.remove({
        subject: payload.messageId,
        predicate: `${HARMONY}content`,
        object: oldContent,
        graph
      })
    }
    this.quadStore.add({
      subject: payload.messageId,
      predicate: `${HARMONY}content`,
      object: JSON.stringify(payload.content),
      graph
    })

    this.broadcast(
      serialise({
        id: msg.id,
        type: 'channel.message.updated',
        timestamp: msg.timestamp,
        sender: meta.did,
        payload
      })
    )
  }

  private async handleChannelDelete(meta: ConnectionMeta, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { communityId: string; channelId: string; messageId: string }
    const graph = `${payload.communityId}:${payload.channelId}`

    const author = this.quadStore.getValue(payload.messageId, HarmonyPredicate.author, graph)
    if (author !== meta.did) return

    this.quadStore.removeBySubject(payload.messageId, graph)

    this.broadcast(
      serialise({
        id: msg.id,
        type: 'channel.message.deleted',
        timestamp: msg.timestamp,
        sender: meta.did,
        payload
      })
    )
  }

  private handleChannelTyping(meta: ConnectionMeta, msg: ProtocolMessage): void {
    this.broadcast(
      serialise({
        id: msg.id,
        type: 'channel.typing.indicator',
        timestamp: msg.timestamp,
        sender: meta.did,
        payload: msg.payload
      })
    )
  }

  private async handleCommunityCreate(ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { name: string; description?: string }

    const reqErr = validateRequiredStrings({ name: payload.name })
    if (reqErr) {
      this.sendError(ws, reqErr)
      return
    }
    const nameErr = validateStringLength(payload.name, MAX_NAME_LENGTH, 'name')
    if (nameErr) {
      this.sendError(ws, nameErr)
      return
    }

    const communityId = crypto.randomUUID()

    this.quadStore.addAll([
      { subject: communityId, predicate: 'rdf:type', object: HarmonyType.Community, graph: communityId },
      { subject: communityId, predicate: HarmonyPredicate.name, object: payload.name, graph: communityId },
      {
        subject: communityId,
        predicate: `${HARMONY}creator`,
        object: meta.did,
        graph: communityId
      },
      {
        subject: communityId,
        predicate: HarmonyPredicate.timestamp,
        object: new Date().toISOString(),
        graph: communityId
      }
    ])

    if (payload.description) {
      this.quadStore.add({
        subject: communityId,
        predicate: `${HARMONY}description`,
        object: payload.description,
        graph: communityId
      })
    }

    this.ensureMember(meta.did)

    // Create default #general channel
    const channelId = crypto.randomUUID()
    this.ctx.storage.sql.exec(
      "INSERT INTO channels (id, name, type, created_at) VALUES (?, 'general', 'text', ?)",
      channelId,
      new Date().toISOString()
    )

    ws.send(
      serialise({
        id: msg.id,
        type: 'community.updated',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { communityId, name: payload.name, channelId }
      })
    )
  }

  private async handleCommunityJoin(ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): Promise<void> {
    this.ensureMember(meta.did)

    this.broadcast(
      serialise({
        id: msg.id,
        type: 'community.member.joined',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { did: meta.did }
      })
    )

    // Send current state to the joining member
    await this.handleSyncRequest(ws, meta)
  }

  private async handleCommunityLeave(meta: ConnectionMeta, msg: ProtocolMessage): Promise<void> {
    this.ctx.storage.sql.exec('DELETE FROM members WHERE did = ?', meta.did)

    this.broadcast(
      serialise({
        id: msg.id,
        type: 'community.member.left',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { did: meta.did }
      })
    )
  }

  private async handleChannelCreate(ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { name: string; type?: string; categoryId?: string; topic?: string }

    const reqErr = validateRequiredStrings({ name: payload.name })
    if (reqErr) {
      this.sendError(ws, reqErr)
      return
    }
    const nameErr = validateStringLength(payload.name, MAX_NAME_LENGTH, 'name')
    if (nameErr) {
      this.sendError(ws, nameErr)
      return
    }
    if (payload.topic) {
      const topicErr = validateStringLength(payload.topic, MAX_TOPIC_LENGTH, 'topic')
      if (topicErr) {
        this.sendError(ws, topicErr)
        return
      }
    }

    const channelId = crypto.randomUUID()
    const now = new Date().toISOString()

    this.ctx.storage.sql.exec(
      'INSERT INTO channels (id, name, type, category_id, topic, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      channelId,
      payload.name,
      payload.type || 'text',
      payload.categoryId || null,
      payload.topic || null,
      now
    )

    this.broadcast(
      serialise({
        id: msg.id,
        type: 'channel.created',
        timestamp: now,
        sender: meta.did,
        payload: { channelId, ...payload }
      })
    )
  }

  private handlePresenceUpdate(meta: ConnectionMeta, msg: ProtocolMessage): void {
    this.broadcast(
      serialise({
        id: msg.id,
        type: 'presence.changed',
        timestamp: msg.timestamp,
        sender: meta.did,
        payload: { did: meta.did, ...(msg.payload as object) }
      })
    )
  }

  private async handleSyncRequest(ws: WebSocket, _unused: ConnectionMeta): Promise<void> {
    // Send members
    const members: Array<{ did: string; displayName: string | null; roles: string; joinedAt: string }> = []
    for (const row of this.ctx.storage.sql.exec('SELECT did, display_name, roles, joined_at FROM members')) {
      members.push({
        did: row.did as string,
        displayName: row.display_name as string | null,
        roles: row.roles as string,
        joinedAt: row.joined_at as string
      })
    }

    // Send channels
    const channels: Array<{ id: string; name: string; type: string; categoryId: string | null; topic: string | null }> =
      []
    for (const row of this.ctx.storage.sql.exec('SELECT id, name, type, category_id, topic FROM channels')) {
      channels.push({
        id: row.id as string,
        name: row.name as string,
        type: row.type as string,
        categoryId: row.category_id as string | null,
        topic: row.topic as string | null
      })
    }

    ws.send(
      serialise({
        id: crypto.randomUUID(),
        type: 'sync.response',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { members, channels }
      })
    )
  }

  // ── Voice ──

  private async handleVoiceJoin(ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { channelId: string; audioEnabled?: boolean; videoEnabled?: boolean }
    const roomId = payload.channelId // One voice room per channel
    const now = new Date().toISOString()

    // Add participant to voice room
    this.ctx.storage.sql.exec(
      'INSERT OR REPLACE INTO voice_participants (room_id, did, audio_enabled, video_enabled, joined_at) VALUES (?, ?, ?, ?, ?)',
      roomId,
      meta.did,
      payload.audioEnabled !== false ? 1 : 0,
      payload.videoEnabled ? 1 : 0,
      now
    )

    // Get current participants for this room
    const participants = this.getVoiceParticipants(roomId)

    // Notify the joining client
    ws.send(
      serialise({
        id: msg.id,
        type: 'voice.joined',
        timestamp: now,
        sender: 'server',
        payload: { channelId: roomId, participants }
      })
    )

    // Broadcast to all other clients
    this.broadcast(
      serialise({
        id: crypto.randomUUID(),
        type: 'voice.participant.joined',
        timestamp: now,
        sender: 'server',
        payload: {
          channelId: roomId,
          did: meta.did,
          audioEnabled: payload.audioEnabled !== false,
          videoEnabled: payload.videoEnabled ?? false
        }
      }),
      ws
    )
  }

  private async handleVoiceLeave(_ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { channelId: string }
    const roomId = payload.channelId

    this.ctx.storage.sql.exec('DELETE FROM voice_participants WHERE room_id = ? AND did = ?', roomId, meta.did)
    this.ctx.storage.sql.exec('DELETE FROM voice_tracks WHERE room_id = ? AND did = ?', roomId, meta.did)

    this.broadcast(
      serialise({
        id: msg.id,
        type: 'voice.participant.left',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { channelId: roomId, did: meta.did }
      })
    )

    // Clean up empty room
    const remaining = this.getVoiceParticipants(roomId)
    if (remaining.length === 0) {
      // Room is empty — no cleanup needed for DO storage, participants table is empty
    }
  }

  private async handleVoiceMute(_ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { channelId: string; trackKind: 'audio' | 'video'; muted: boolean }
    const roomId = payload.channelId

    if (payload.trackKind === 'audio') {
      this.ctx.storage.sql.exec(
        'UPDATE voice_participants SET audio_enabled = ? WHERE room_id = ? AND did = ?',
        payload.muted ? 0 : 1,
        roomId,
        meta.did
      )
    } else {
      this.ctx.storage.sql.exec(
        'UPDATE voice_participants SET video_enabled = ? WHERE room_id = ? AND did = ?',
        payload.muted ? 0 : 1,
        roomId,
        meta.did
      )
    }

    this.broadcast(
      serialise({
        id: msg.id,
        type: 'voice.participant.muted',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: {
          channelId: roomId,
          did: meta.did,
          trackKind: payload.trackKind,
          muted: payload.muted
        }
      })
    )
  }

  private getVoiceParticipants(
    roomId: string
  ): Array<{ did: string; audioEnabled: boolean; videoEnabled: boolean; joinedAt: string }> {
    const result: Array<{ did: string; audioEnabled: boolean; videoEnabled: boolean; joinedAt: string }> = []
    for (const row of this.ctx.storage.sql.exec(
      'SELECT did, audio_enabled, video_enabled, joined_at FROM voice_participants WHERE room_id = ?',
      roomId
    )) {
      result.push({
        did: row.did as string,
        audioEnabled: (row.audio_enabled as number) === 1,
        videoEnabled: (row.video_enabled as number) === 1,
        joinedAt: row.joined_at as string
      })
    }
    return result
  }

  // ── Channel (additional) ──

  private handleChannelUpdate(ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as { channelId: string; name?: string; topic?: string }
    if (!this.isAdmin(meta.did)) {
      this.sendError(ws, 'Not authorized')
      return
    }
    if (payload.name !== undefined) {
      this.ctx.storage.sql.exec('UPDATE channels SET name = ? WHERE id = ?', payload.name, payload.channelId)
    }
    if (payload.topic !== undefined) {
      this.ctx.storage.sql.exec('UPDATE channels SET topic = ? WHERE id = ?', payload.topic, payload.channelId)
    }
    this.broadcast(
      serialise({ id: msg.id, type: 'channel.updated', timestamp: new Date().toISOString(), sender: meta.did, payload })
    )
  }

  private handleChannelDeleteAdmin(ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as { channelId: string }
    if (!this.isAdmin(meta.did)) {
      this.sendError(ws, 'Not authorized')
      return
    }
    this.ctx.storage.sql.exec('DELETE FROM channels WHERE id = ?', payload.channelId)
    this.broadcast(
      serialise({ id: msg.id, type: 'channel.deleted', timestamp: new Date().toISOString(), sender: meta.did, payload })
    )
  }

  private handleChannelPin(ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as { channelId: string; messageId: string }
    // Enforce max 50
    let count = 0
    for (const row of this.ctx.storage.sql.exec(
      'SELECT COUNT(*) as cnt FROM pins WHERE channel_id = ?',
      payload.channelId
    )) {
      count = row.cnt as number
    }
    if (count >= 50) {
      this.sendError(ws, 'Max 50 pins per channel')
      return
    }
    this.ctx.storage.sql.exec(
      'INSERT OR IGNORE INTO pins (channel_id, message_id, pinned_by, pinned_at) VALUES (?, ?, ?, ?)',
      payload.channelId,
      payload.messageId,
      meta.did,
      new Date().toISOString()
    )
    this.broadcast(
      serialise({
        id: msg.id,
        type: 'channel.message.pinned',
        timestamp: new Date().toISOString(),
        sender: meta.did,
        payload
      })
    )
  }

  private handleChannelUnpin(_ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as { channelId: string; messageId: string }
    this.ctx.storage.sql.exec(
      'DELETE FROM pins WHERE channel_id = ? AND message_id = ?',
      payload.channelId,
      payload.messageId
    )
    this.broadcast(
      serialise({
        id: msg.id,
        type: 'channel.message.unpinned',
        timestamp: new Date().toISOString(),
        sender: meta.did,
        payload
      })
    )
  }

  private handleChannelPinsList(ws: WebSocket, _meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as { channelId: string }
    const pins: string[] = []
    for (const row of this.ctx.storage.sql.exec(
      'SELECT message_id FROM pins WHERE channel_id = ?',
      payload.channelId
    )) {
      pins.push(row.message_id as string)
    }
    ws.send(
      serialise({
        id: msg.id,
        type: 'channel.pins.list.response',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { channelId: payload.channelId, messageIds: pins }
      })
    )
  }

  private handleChannelReactionAdd(meta: ConnectionMeta, msg: ProtocolMessage): void {
    this.broadcast(
      serialise({
        id: msg.id,
        type: 'channel.reaction.added',
        timestamp: new Date().toISOString(),
        sender: meta.did,
        payload: msg.payload
      })
    )
  }

  private handleChannelReactionRemove(meta: ConnectionMeta, msg: ProtocolMessage): void {
    this.broadcast(
      serialise({
        id: msg.id,
        type: 'channel.reaction.removed',
        timestamp: new Date().toISOString(),
        sender: meta.did,
        payload: msg.payload
      })
    )
  }

  private handleChannelHistory(ws: WebSocket, msg: ProtocolMessage): void {
    const payload = msg.payload as { communityId: string; channelId: string; limit?: number; before?: string }
    const graph = `${payload.communityId}:${payload.channelId}`
    const allMsgs = this.quadStore.match({ predicate: 'rdf:type', object: HarmonyType.Message, graph })
    // Get message details
    const limit = payload.limit ?? 50
    const messages: Array<{ id: string; author: string; content: string; timestamp: string }> = []
    for (const quad of allMsgs) {
      const id = quad.subject
      const author = this.quadStore.getValue(id, HarmonyPredicate.author, graph)
      const content = this.quadStore.getValue(id, `${HARMONY}content`, graph)
      const timestamp = this.quadStore.getValue(id, HarmonyPredicate.timestamp, graph)
      if (payload.before && timestamp && timestamp >= payload.before) continue
      messages.push({ id, author: author ?? '', content: content ?? '', timestamp: timestamp ?? '' })
    }
    messages.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    const sliced = messages.slice(0, limit)
    ws.send(
      serialise({
        id: msg.id,
        type: 'channel.history.response',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { channelId: payload.channelId, messages: sliced }
      })
    )
  }

  // ── Community (additional) ──

  private handleCommunityUpdate(ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as { name?: string; description?: string }
    if (!this.isAdmin(meta.did)) {
      this.sendError(ws, 'Not authorized')
      return
    }
    if (!this.communityId) return
    if (payload.name !== undefined) {
      const old = this.quadStore.getValue(this.communityId, HarmonyPredicate.name, this.communityId)
      if (old !== null)
        this.quadStore.remove({
          subject: this.communityId,
          predicate: HarmonyPredicate.name,
          object: old,
          graph: this.communityId
        })
      this.quadStore.add({
        subject: this.communityId,
        predicate: HarmonyPredicate.name,
        object: payload.name,
        graph: this.communityId
      })
    }
    if (payload.description !== undefined) {
      const old = this.quadStore.getValue(this.communityId, `${HARMONY}description`, this.communityId)
      if (old !== null)
        this.quadStore.remove({
          subject: this.communityId,
          predicate: `${HARMONY}description`,
          object: old,
          graph: this.communityId
        })
      this.quadStore.add({
        subject: this.communityId,
        predicate: `${HARMONY}description`,
        object: payload.description,
        graph: this.communityId
      })
    }
    this.broadcast(
      serialise({
        id: msg.id,
        type: 'community.updated',
        timestamp: new Date().toISOString(),
        sender: meta.did,
        payload: { communityId: this.communityId, ...payload }
      })
    )
  }

  private handleCommunityInfo(ws: WebSocket, msg: ProtocolMessage): void {
    const info = this.getCommunityInfo()
    ws.send(
      serialise({
        id: msg.id,
        type: 'community.info.response',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: info
      })
    )
  }

  private handleCommunityList(ws: WebSocket, msg: ProtocolMessage): void {
    const info = this.getCommunityInfo()
    ws.send(
      serialise({
        id: msg.id,
        type: 'community.list.response',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { communities: [info] }
      })
    )
  }

  private getCommunityInfo(): {
    communityId: string | null
    name: string | null
    description: string | null
    members: Array<{ did: string; displayName: string | null }>
  } {
    const name = this.communityId
      ? this.quadStore.getValue(this.communityId, HarmonyPredicate.name, this.communityId)
      : null
    const description = this.communityId
      ? this.quadStore.getValue(this.communityId, `${HARMONY}description`, this.communityId)
      : null
    const members: Array<{ did: string; displayName: string | null }> = []
    for (const row of this.ctx.storage.sql.exec('SELECT did, display_name FROM members')) {
      members.push({ did: row.did as string, displayName: row.display_name as string | null })
    }
    return { communityId: this.communityId, name, description, members }
  }

  private handleCommunityBan(ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as { did: string; reason?: string }
    if (!this.isAdmin(meta.did)) {
      this.sendError(ws, 'Not authorized')
      return
    }
    this.ctx.storage.sql.exec(
      'INSERT OR REPLACE INTO banned_users (did, banned_by, banned_at, reason) VALUES (?, ?, ?, ?)',
      payload.did,
      meta.did,
      new Date().toISOString(),
      payload.reason ?? null
    )
    this.ctx.storage.sql.exec('DELETE FROM members WHERE did = ?', payload.did)
    // Notify banned user
    this.createNotification(payload.did, {
      type: 'community.ban',
      fromDID: meta.did,
      communityId: this.communityId ?? undefined,
      content: payload.reason
    })
    // Disconnect banned user
    for (const target of this.findConnectionsByDID(payload.did)) {
      target.send(
        serialise({
          id: msg.id,
          type: 'community.ban.applied',
          timestamp: new Date().toISOString(),
          sender: 'server',
          payload: { did: payload.did, reason: payload.reason }
        })
      )
      target.close(4003, 'Banned')
    }
    this.broadcast(
      serialise({
        id: msg.id,
        type: 'community.ban.applied',
        timestamp: new Date().toISOString(),
        sender: meta.did,
        payload: { did: payload.did }
      })
    )
  }

  private handleCommunityUnban(ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as { did: string }
    if (!this.isAdmin(meta.did)) {
      this.sendError(ws, 'Not authorized')
      return
    }
    this.ctx.storage.sql.exec('DELETE FROM banned_users WHERE did = ?', payload.did)
    ws.send(
      serialise({
        id: msg.id,
        type: 'community.unban.applied',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { did: payload.did }
      })
    )
  }

  private handleCommunityKick(ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as { did: string }
    if (!this.isAdmin(meta.did)) {
      this.sendError(ws, 'Not authorized')
      return
    }
    this.ctx.storage.sql.exec('DELETE FROM members WHERE did = ?', payload.did)
    for (const target of this.findConnectionsByDID(payload.did)) {
      target.send(
        serialise({
          id: msg.id,
          type: 'member.kicked',
          timestamp: new Date().toISOString(),
          sender: 'server',
          payload: { did: payload.did }
        })
      )
      target.close(4004, 'Kicked')
    }
    this.broadcast(
      serialise({
        id: msg.id,
        type: 'member.kicked',
        timestamp: new Date().toISOString(),
        sender: meta.did,
        payload: { did: payload.did }
      })
    )
  }

  // ── DM ──

  private handleDmSend(ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as { recipientDID: string; content: unknown; nonce?: string }
    const targets = this.findConnectionsByDID(payload.recipientDID)
    if (targets.length === 0) {
      this.sendError(ws, 'Recipient not connected')
      return
    }
    const outMsg = serialise({ id: msg.id, type: 'dm.message', timestamp: msg.timestamp, sender: meta.did, payload })
    for (const t of targets) t.send(outMsg)
  }

  private handleDmEdit(ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as { recipientDID: string; messageId: string; content: unknown }
    const targets = this.findConnectionsByDID(payload.recipientDID)
    if (targets.length === 0) {
      this.sendError(ws, 'Recipient not connected')
      return
    }
    const outMsg = serialise({ id: msg.id, type: 'dm.edited', timestamp: msg.timestamp, sender: meta.did, payload })
    for (const t of targets) t.send(outMsg)
  }

  private handleDmDelete(ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as { recipientDID: string; messageId: string }
    const targets = this.findConnectionsByDID(payload.recipientDID)
    if (targets.length === 0) {
      this.sendError(ws, 'Recipient not connected')
      return
    }
    const outMsg = serialise({ id: msg.id, type: 'dm.deleted', timestamp: msg.timestamp, sender: meta.did, payload })
    for (const t of targets) t.send(outMsg)
  }

  private handleDmTyping(_ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as { recipientDID: string }
    const targets = this.findConnectionsByDID(payload.recipientDID)
    const outMsg = serialise({
      id: msg.id,
      type: 'dm.typing.indicator',
      timestamp: msg.timestamp,
      sender: meta.did,
      payload
    })
    for (const t of targets) t.send(outMsg)
  }

  private handleDmKeyexchange(_ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as { recipientDID: string }
    const targets = this.findConnectionsByDID(payload.recipientDID)
    const outMsg = serialise({
      id: msg.id,
      type: 'dm.keyexchange',
      timestamp: msg.timestamp,
      sender: meta.did,
      payload
    })
    for (const t of targets) t.send(outMsg)
  }

  // ── Threads ──

  private handleThreadCreate(meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as { parentMessageId: string; channelId: string; name: string }
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    this.ctx.storage.sql.exec(
      'INSERT INTO threads (id, parent_message_id, channel_id, name, creator_did, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      id,
      payload.parentMessageId,
      payload.channelId,
      payload.name,
      meta.did,
      now
    )
    this.broadcast(
      serialise({
        id: msg.id,
        type: 'thread.created',
        timestamp: now,
        sender: meta.did,
        payload: { threadId: id, ...payload }
      })
    )
  }

  private handleThreadSend(meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as { threadId: string; content: unknown }
    this.ctx.storage.sql.exec('UPDATE threads SET message_count = message_count + 1 WHERE id = ?', payload.threadId)
    this.broadcast(
      serialise({ id: msg.id, type: 'thread.message', timestamp: msg.timestamp, sender: meta.did, payload })
    )
  }

  // ── Roles ──

  private handleRoleCreate(ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as { name: string; color?: string; permissions?: string[]; position?: number }
    if (!this.isAdmin(meta.did)) {
      this.sendError(ws, 'Not authorized')
      return
    }
    const id = crypto.randomUUID()
    this.ctx.storage.sql.exec(
      'INSERT INTO roles (id, name, color, permissions, position, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      id,
      payload.name,
      payload.color ?? null,
      JSON.stringify(payload.permissions ?? []),
      payload.position ?? 0,
      meta.did
    )
    this.broadcast(
      serialise({
        id: msg.id,
        type: 'role.created',
        timestamp: new Date().toISOString(),
        sender: meta.did,
        payload: { roleId: id, ...payload }
      })
    )
  }

  private handleRoleUpdate(ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as {
      roleId: string
      name?: string
      color?: string
      permissions?: string[]
      position?: number
    }
    if (!this.isAdmin(meta.did)) {
      this.sendError(ws, 'Not authorized')
      return
    }
    if (payload.name !== undefined)
      this.ctx.storage.sql.exec('UPDATE roles SET name = ? WHERE id = ?', payload.name, payload.roleId)
    if (payload.color !== undefined)
      this.ctx.storage.sql.exec('UPDATE roles SET color = ? WHERE id = ?', payload.color, payload.roleId)
    if (payload.permissions !== undefined)
      this.ctx.storage.sql.exec(
        'UPDATE roles SET permissions = ? WHERE id = ?',
        JSON.stringify(payload.permissions),
        payload.roleId
      )
    if (payload.position !== undefined)
      this.ctx.storage.sql.exec('UPDATE roles SET position = ? WHERE id = ?', payload.position, payload.roleId)
    this.broadcast(
      serialise({ id: msg.id, type: 'role.updated', timestamp: new Date().toISOString(), sender: meta.did, payload })
    )
  }

  private handleRoleDelete(ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as { roleId: string }
    if (!this.isAdmin(meta.did)) {
      this.sendError(ws, 'Not authorized')
      return
    }
    this.ctx.storage.sql.exec('DELETE FROM roles WHERE id = ?', payload.roleId)
    this.ctx.storage.sql.exec('DELETE FROM member_roles WHERE role_id = ?', payload.roleId)
    this.broadcast(
      serialise({ id: msg.id, type: 'role.deleted', timestamp: new Date().toISOString(), sender: meta.did, payload })
    )
  }

  private handleRoleAssign(ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as { did: string; roleId: string }
    if (!this.isAdmin(meta.did)) {
      this.sendError(ws, 'Not authorized')
      return
    }
    this.ctx.storage.sql.exec(
      'INSERT OR IGNORE INTO member_roles (member_did, role_id) VALUES (?, ?)',
      payload.did,
      payload.roleId
    )
    this.broadcast(
      serialise({
        id: msg.id,
        type: 'community.member.updated',
        timestamp: new Date().toISOString(),
        sender: meta.did,
        payload
      })
    )
  }

  private handleRoleRemove(ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as { did: string; roleId: string }
    if (!this.isAdmin(meta.did)) {
      this.sendError(ws, 'Not authorized')
      return
    }
    this.ctx.storage.sql.exec(
      'DELETE FROM member_roles WHERE member_did = ? AND role_id = ?',
      payload.did,
      payload.roleId
    )
    this.broadcast(
      serialise({
        id: msg.id,
        type: 'community.member.updated',
        timestamp: new Date().toISOString(),
        sender: meta.did,
        payload
      })
    )
  }

  // ── Member ──

  private handleMemberUpdate(meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as { displayName: string }
    this.ctx.storage.sql.exec('UPDATE members SET display_name = ? WHERE did = ?', payload.displayName, meta.did)
    this.broadcast(
      serialise({
        id: msg.id,
        type: 'community.member.updated',
        timestamp: new Date().toISOString(),
        sender: meta.did,
        payload: { did: meta.did, displayName: payload.displayName }
      })
    )
  }

  // ── Search ──

  private handleSearchQuery(ws: WebSocket, msg: ProtocolMessage): void {
    const payload = msg.payload as { query: string; channelId?: string; communityId?: string }
    const pattern: { predicate: string; graph?: string } = { predicate: `${HARMONY}content` }
    if (payload.communityId && payload.channelId) {
      ;(pattern as Record<string, string>).graph = `${payload.communityId}:${payload.channelId}`
    }
    const allContent = this.quadStore.match(pattern)
    const queryLower = payload.query.toLowerCase()
    const results: Array<{ messageId: string; content: string }> = []
    for (const quad of allContent) {
      if (quad.object.toLowerCase().includes(queryLower)) {
        results.push({ messageId: quad.subject, content: quad.object })
      }
    }
    ws.send(
      serialise({
        id: msg.id,
        type: 'search.results',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { query: payload.query, results: results.slice(0, 50) }
      })
    )
  }

  // ── Media ──

  private handleMediaUploadRequest(ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as { filename: string; mimeType: string; size: number; data: string; channelId: string }
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    this.ctx.storage.sql.exec(
      'INSERT INTO media (id, filename, mime_type, size, data, uploaded_by, channel_id, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      payload.filename,
      payload.mimeType,
      payload.size,
      payload.data,
      meta.did,
      payload.channelId,
      now
    )
    ws.send(
      serialise({
        id: msg.id,
        type: 'media.upload.complete',
        timestamp: now,
        sender: 'server',
        payload: { mediaId: id, filename: payload.filename }
      })
    )
  }

  private handleMediaDelete(ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as { mediaId: string }
    // Verify uploader
    let uploader: string | null = null
    for (const row of this.ctx.storage.sql.exec('SELECT uploaded_by FROM media WHERE id = ?', payload.mediaId)) {
      uploader = row.uploaded_by as string
    }
    if (uploader !== meta.did) {
      this.sendError(ws, 'Not authorized')
      return
    }
    this.ctx.storage.sql.exec('DELETE FROM media WHERE id = ?', payload.mediaId)
    ws.send(
      serialise({
        id: msg.id,
        type: 'media.deleted',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { mediaId: payload.mediaId }
      })
    )
  }

  // ── MLS E2EE ──

  private handleMlsKeypackageUpload(meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as { packageData: string }
    this.ctx.storage.sql.exec(
      'INSERT INTO key_packages (did, package_data) VALUES (?, ?)',
      meta.did,
      payload.packageData
    )
    void msg // used above
  }

  private handleMlsKeypackageFetch(ws: WebSocket, msg: ProtocolMessage): void {
    const payload = msg.payload as { dids: string[] }
    const packages: Record<string, string[]> = {}
    for (const did of payload.dids) {
      packages[did] = []
      for (const row of this.ctx.storage.sql.exec('SELECT package_data FROM key_packages WHERE did = ?', did)) {
        packages[did].push(row.package_data as string)
      }
    }
    ws.send(
      serialise({
        id: msg.id,
        type: 'mls.keypackage.response',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { packages }
      })
    )
  }

  private handleMlsWelcome(_ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as { recipientDID: string }
    const targets = this.findConnectionsByDID(payload.recipientDID)
    const outMsg = serialise({ id: msg.id, type: 'mls.welcome', timestamp: msg.timestamp, sender: meta.did, payload })
    for (const t of targets) t.send(outMsg)
  }

  private handleMlsCommit(ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): void {
    this.broadcast(
      serialise({ id: msg.id, type: 'mls.commit', timestamp: msg.timestamp, sender: meta.did, payload: msg.payload }),
      ws
    )
  }

  private handleMlsGroupSetup(_ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as { groupId: string; channelId: string }
    this.ctx.storage.sql.exec(
      'INSERT OR REPLACE INTO e2ee_groups (group_id, creator_did, channel_id) VALUES (?, ?, ?)',
      payload.groupId,
      meta.did,
      payload.channelId
    )
    this.broadcast(
      serialise({ id: msg.id, type: 'mls.group.setup', timestamp: msg.timestamp, sender: meta.did, payload })
    )
  }

  // ── Moderation ──

  private handleModerationConfigUpdate(ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as { rules: Array<{ id: string; type: string; config: string }> }
    if (!this.isAdmin(meta.did)) {
      this.sendError(ws, 'Not authorized')
      return
    }
    for (const rule of payload.rules) {
      this.ctx.storage.sql.exec(
        'INSERT OR REPLACE INTO moderation_rules (id, type, config) VALUES (?, ?, ?)',
        rule.id,
        rule.type,
        rule.config
      )
    }
    ws.send(
      serialise({
        id: msg.id,
        type: 'moderation.config.updated',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: {}
      })
    )
  }

  private handleModerationConfigGet(ws: WebSocket, msg: ProtocolMessage): void {
    const rules: Array<{ id: string; type: string; config: string }> = []
    for (const row of this.ctx.storage.sql.exec('SELECT id, type, config FROM moderation_rules')) {
      rules.push({ id: row.id as string, type: row.type as string, config: row.config as string })
    }
    ws.send(
      serialise({
        id: msg.id,
        type: 'moderation.config.response',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { rules }
      })
    )
  }

  // ── Notifications ──

  private handleNotificationList(ws: WebSocket, meta: ConnectionMeta): void {
    const notifs: Array<Record<string, unknown>> = []
    for (const row of this.ctx.storage.sql.exec(
      'SELECT id, type, from_did, community_id, channel_id, message_id, content, read, created_at FROM notifications WHERE recipient_did = ? ORDER BY created_at DESC LIMIT 50',
      meta.did
    )) {
      notifs.push({
        id: row.id,
        type: row.type,
        fromDID: row.from_did,
        communityId: row.community_id,
        channelId: row.channel_id,
        messageId: row.message_id,
        content: row.content,
        read: (row.read as number) === 1,
        createdAt: row.created_at
      })
    }
    ws.send(
      serialise({
        id: crypto.randomUUID(),
        type: 'notification.list.response',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { notifications: notifs }
      })
    )
  }

  private handleNotificationMarkRead(ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as { notificationId: string }
    this.ctx.storage.sql.exec(
      'UPDATE notifications SET read = 1 WHERE id = ? AND recipient_did = ?',
      payload.notificationId,
      meta.did
    )
    ws.send(
      serialise({
        id: msg.id,
        type: 'notification.marked-read',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { notificationId: payload.notificationId }
      })
    )
  }

  private handleNotificationCount(ws: WebSocket, meta: ConnectionMeta): void {
    let count = 0
    for (const row of this.ctx.storage.sql.exec(
      'SELECT COUNT(*) as cnt FROM notifications WHERE recipient_did = ? AND read = 0',
      meta.did
    )) {
      count = row.cnt as number
    }
    ws.send(
      serialise({
        id: crypto.randomUUID(),
        type: 'notification.count.response',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { count }
      })
    )
  }

  // ── Voice (additional) ──

  private handleVoiceSignaling(ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as { targetDID: string }
    const targets = this.findConnectionsByDID(payload.targetDID)
    if (targets.length === 0) {
      this.sendError(ws, 'Target not connected')
      return
    }
    const outMsg = serialise({
      id: msg.id,
      type: msg.type,
      timestamp: msg.timestamp,
      sender: meta.did,
      payload: msg.payload
    })
    for (const t of targets) t.send(outMsg)
  }

  private handleVoiceVideo(meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as { channelId: string; videoEnabled: boolean }
    this.ctx.storage.sql.exec(
      'UPDATE voice_participants SET video_enabled = ? WHERE room_id = ? AND did = ?',
      payload.videoEnabled ? 1 : 0,
      payload.channelId,
      meta.did
    )
    this.broadcast(
      serialise({
        id: msg.id,
        type: 'voice.video.changed',
        timestamp: new Date().toISOString(),
        sender: meta.did,
        payload
      })
    )
  }

  private handleVoiceScreen(meta: ConnectionMeta, msg: ProtocolMessage): void {
    this.broadcast(
      serialise({
        id: msg.id,
        type: 'voice.screen.changed',
        timestamp: new Date().toISOString(),
        sender: meta.did,
        payload: msg.payload
      })
    )
  }

  private handleVoiceSpeaking(ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as { channelId: string; speaking: boolean }
    const participants = this.getVoiceParticipants(payload.channelId)
    const outMsg = serialise({
      id: msg.id,
      type: 'voice.speaking',
      timestamp: new Date().toISOString(),
      sender: meta.did,
      payload
    })
    for (const p of participants) {
      if (p.did === meta.did) continue
      for (const target of this.findConnectionsByDID(p.did, ws)) {
        target.send(outMsg)
      }
    }
  }

  private async callCFApi(path: string, method: string, body?: unknown): Promise<Record<string, unknown>> {
    const appId = (this.env as Env).CALLS_APP_ID
    const appSecret = (this.env as Env).CALLS_APP_SECRET
    if (!appId || !appSecret) {
      throw new Error('CF Realtime SFU not configured')
    }
    const url = `https://rtc.live.cloudflare.com/v1/apps/${appId}${path}`
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${appSecret}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`CF API error ${response.status}: ${text}`)
    }
    return response.json() as Promise<Record<string, unknown>>
  }

  private async handleVoiceSessionCreate(ws: WebSocket, _meta: ConnectionMeta, msg: ProtocolMessage): Promise<void> {
    try {
      const result = await this.callCFApi('/sessions/new', 'POST')
      ws.send(
        serialise({
          id: msg.id,
          type: 'voice.session.created',
          timestamp: new Date().toISOString(),
          sender: 'server',
          payload: { sessionId: result.sessionId }
        })
      )
    } catch (err) {
      this.sendError(ws, `CF session create failed: ${err}`)
    }
  }

  private async handleVoiceTracksPush(ws: WebSocket, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { sessionId: string; tracks: unknown[]; sessionDescription?: unknown }
    try {
      const result = await this.callCFApi(`/sessions/${payload.sessionId}/tracks/new`, 'POST', {
        tracks: payload.tracks,
        sessionDescription: payload.sessionDescription
      })
      ws.send(
        serialise({
          id: msg.id,
          type: 'voice.tracks.pushed',
          timestamp: new Date().toISOString(),
          sender: 'server',
          payload: result
        })
      )
    } catch (err) {
      this.sendError(ws, `CF tracks push failed: ${err}`)
    }
  }

  private async handleVoiceTracksPull(ws: WebSocket, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as {
      sessionId: string
      tracks: unknown[]
      sessionDescription?: unknown
    }

    try {
      const result = await this.callCFApi(`/sessions/${payload.sessionId}/tracks/new`, 'POST', {
        tracks: payload.tracks,
        sessionDescription: payload.sessionDescription
      })
      ws.send(
        serialise({
          id: msg.id,
          type: 'voice.tracks.pulled',
          timestamp: new Date().toISOString(),
          sender: 'server',
          payload: result
        })
      )
    } catch (err) {
      this.sendError(ws, `CF tracks pull failed: ${err}`)
    }
  }

  private async handleVoiceTracksClose(ws: WebSocket, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as {
      sessionId: string
      tracks: unknown[]
      force?: boolean
    }
    try {
      await this.callCFApi(`/sessions/${payload.sessionId}/tracks/close`, 'PUT', {
        tracks: payload.tracks,
        force: payload.force ?? false
      })
      ws.send(
        serialise({
          id: msg.id,
          type: 'voice.tracks.closed',
          timestamp: new Date().toISOString(),
          sender: 'server',
          payload: { closed: true }
        })
      )
    } catch (err) {
      this.sendError(ws, `CF tracks close failed: ${err}`)
    }
  }

  private handleVoiceGetProducers(ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): void {
    // Find which room the caller is in
    let roomId: string | null = null
    for (const row of this.ctx.storage.sql.exec(
      'SELECT room_id FROM voice_participants WHERE did = ? LIMIT 1',
      meta.did
    )) {
      roomId = row.room_id as string
    }

    const producers: Array<{
      trackName: string
      sessionId: string
      kind: string
      mediaType: string
      participantId: string
    }> = []
    if (roomId) {
      for (const row of this.ctx.storage.sql.exec(
        'SELECT track_name, session_id, kind, media_type, did FROM voice_tracks WHERE room_id = ? AND did != ?',
        roomId,
        meta.did
      )) {
        producers.push({
          trackName: row.track_name as string,
          sessionId: row.session_id as string,
          kind: row.kind as string,
          mediaType: row.media_type as string,
          participantId: row.did as string
        })
      }
    }

    ws.send(
      serialise({
        id: msg.id,
        type: 'voice.get-producers.response',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { producers }
      })
    )
  }

  private handleVoiceTrackPublished(_ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as {
      roomId: string
      sessionId: string
      trackName: string
      kind: string
      mediaType: string
    }
    const roomId = payload.roomId

    // Store in DB
    this.ctx.storage.sql.exec(
      'INSERT OR REPLACE INTO voice_tracks (room_id, did, track_name, session_id, kind, media_type) VALUES (?, ?, ?, ?, ?, ?)',
      roomId,
      meta.did,
      payload.trackName,
      payload.sessionId,
      payload.kind,
      payload.mediaType
    )

    // Broadcast to all other participants
    const outMsg = serialise({
      id: `vtp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'voice.track.published',
      timestamp: new Date().toISOString(),
      sender: meta.did,
      payload: {
        roomId,
        sessionId: payload.sessionId,
        trackName: payload.trackName,
        kind: payload.kind,
        mediaType: payload.mediaType,
        participantId: meta.did
      }
    })
    const participants = this.getVoiceParticipants(roomId)
    for (const p of participants) {
      if (p.did === meta.did) continue
      for (const target of this.findConnectionsByDID(p.did)) {
        target.send(outMsg)
      }
    }
  }

  private handleVoiceTrackRemoved(_ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as {
      roomId: string
      sessionId: string
      trackName: string
    }
    const roomId = payload.roomId

    // Remove from DB
    this.ctx.storage.sql.exec(
      'DELETE FROM voice_tracks WHERE room_id = ? AND did = ? AND track_name = ?',
      roomId,
      meta.did,
      payload.trackName
    )

    // Broadcast to all other participants
    const outMsg = serialise({
      id: `vtr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'voice.track.removed',
      timestamp: new Date().toISOString(),
      sender: meta.did,
      payload: {
        roomId,
        sessionId: payload.sessionId,
        trackName: payload.trackName,
        participantId: meta.did
      }
    })
    const participants = this.getVoiceParticipants(roomId)
    for (const p of participants) {
      if (p.did === meta.did) continue
      for (const target of this.findConnectionsByDID(p.did)) {
        target.send(outMsg)
      }
    }
  }

  private async handleVoiceRenegotiate(ws: WebSocket, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { sessionId: string; sessionDescription: unknown }
    try {
      const result = await this.callCFApi(`/sessions/${payload.sessionId}/renegotiate`, 'PUT', {
        sessionDescription: payload.sessionDescription
      })
      ws.send(
        serialise({
          id: msg.id,
          type: 'voice.renegotiated',
          timestamp: new Date().toISOString(),
          sender: 'server',
          payload: result
        })
      )
    } catch (err) {
      this.sendError(ws, `CF renegotiate failed: ${err}`)
    }
  }

  private handleVoiceToken(ws: WebSocket, msg: ProtocolMessage): void {
    const hasCF = !!(this.env as Env).CALLS_APP_ID && !!(this.env as Env).CALLS_APP_SECRET
    const mode = hasCF ? 'cf' : 'signaling'
    const token = btoa(JSON.stringify({ mode, timestamp: Date.now() }))
    ws.send(
      serialise({
        id: msg.id,
        type: 'voice.token.response',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { token, mode }
      })
    )
  }

  private handleVoiceProducerClosed(_ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): void {
    const payload = msg.payload as { channelId: string }
    const participants = this.getVoiceParticipants(payload.channelId)
    const outMsg = serialise({
      id: msg.id,
      type: 'voice.producer-closed',
      timestamp: new Date().toISOString(),
      sender: meta.did,
      payload
    })
    for (const p of participants) {
      if (p.did === meta.did) continue
      for (const target of this.findConnectionsByDID(p.did)) {
        target.send(outMsg)
      }
    }
  }

  // ── Helpers ──

  private findConnectionsByDID(did: string, exclude?: WebSocket): WebSocket[] {
    const result: WebSocket[] = []
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue
      const meta: ConnectionMeta = ws.deserializeAttachment()
      if (meta.did === did) result.push(ws)
    }
    return result
  }

  private isAdmin(did: string): boolean {
    if (!this.communityId) return false
    const creator = this.quadStore.getValue(this.communityId, `${HARMONY}creator`, this.communityId)
    return creator === did
  }

  private isBanned(did: string): boolean {
    for (const _row of this.ctx.storage.sql.exec('SELECT 1 FROM banned_users WHERE did = ?', did)) {
      return true
    }
    return false
  }

  private createNotification(
    recipientDID: string,
    opts: {
      type: string
      fromDID: string
      communityId?: string
      channelId?: string
      messageId?: string
      content?: string
    }
  ): void {
    const id = `notif-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
    const now = new Date().toISOString()
    this.ctx.storage.sql.exec(
      'INSERT INTO notifications (id, recipient_did, type, from_did, community_id, channel_id, message_id, content, read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
      id,
      recipientDID,
      opts.type,
      opts.fromDID,
      opts.communityId ?? null,
      opts.channelId ?? null,
      opts.messageId ?? null,
      opts.content ?? null,
      now
    )
    for (const ws of this.findConnectionsByDID(recipientDID)) {
      ws.send(
        serialise({
          id,
          type: 'notification.new',
          timestamp: now,
          sender: 'server',
          payload: {
            id,
            type: opts.type,
            fromDID: opts.fromDID,
            communityId: opts.communityId,
            channelId: opts.channelId,
            messageId: opts.messageId,
            content: opts.content,
            read: false,
            createdAt: now
          }
        })
      )
    }
  }

  private ensureMember(did: string): void {
    this.ctx.storage.sql.exec(
      'INSERT OR IGNORE INTO members (did, joined_at) VALUES (?, ?)',
      did,
      new Date().toISOString()
    )
  }

  private sendError(ws: WebSocket, message: string, code?: string): void {
    ws.send(
      serialise({
        id: crypto.randomUUID(),
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { message, ...(code ? { code } : {}) }
      })
    )
  }

  private broadcast(message: string, exclude?: WebSocket): void {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== exclude) {
        try {
          ws.send(message)
        } catch {
          // Connection may be closing
        }
      }
    }
  }
}
