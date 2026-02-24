// CommunityDurableObject — one per community, handles WebSocket connections
// Uses Hibernatable WebSockets and DO SQLite storage

import { DurableObject } from 'cloudflare:workers'
import { serialise, deserialise } from '@harmony/protocol'
import type { ProtocolMessage } from '@harmony/protocol'
import { HarmonyPredicate, HarmonyType, HARMONY } from '@harmony/vocab'
import { DOQuadStore } from './do-quad-store.js'
import { parseVP, verifyVP } from './auth.js'
import type { Env, ConnectionMeta, HealthResponse } from './types.js'

export class CommunityDurableObject extends DurableObject {
  private quadStore: DOQuadStore

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
    `)
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

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
      default:
        this.sendError(ws, `Unsupported message type: ${msg.type}`)
    }
  }

  private async handleChannelSend(_ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { communityId: string; channelId: string; content: unknown; nonce: string }

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

    // Update content
    this.quadStore.remove({
      subject: payload.messageId,
      predicate: `${HARMONY}content`,
      object: '', // will need match
      graph
    })
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

  private async handleChannelCreate(_ws: WebSocket, meta: ConnectionMeta, msg: ProtocolMessage): Promise<void> {
    const payload = msg.payload as { name: string; type?: string; categoryId?: string; topic?: string }
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

  // ── Helpers ──

  private ensureMember(did: string): void {
    this.ctx.storage.sql.exec(
      'INSERT OR IGNORE INTO members (did, joined_at) VALUES (?, ?)',
      did,
      new Date().toISOString()
    )
  }

  private sendError(ws: WebSocket, message: string): void {
    ws.send(
      serialise({
        id: crypto.randomUUID(),
        type: 'error',
        timestamp: new Date().toISOString(),
        sender: 'server',
        payload: { message }
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
