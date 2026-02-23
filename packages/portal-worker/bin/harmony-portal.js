#!/usr/bin/env node
// @harmony/portal-worker — Local development portal server
// Wraps the Cloudflare Worker handler with a Node.js HTTP server
// Uses in-memory implementations of D1, R2, KV, and WebSocket relay

import { createServer } from 'node:http'
import { parseArgs } from 'node:util'
import { WebSocketServer } from 'ws'
import { handleRequest } from '../src/handler.ts'
import { InMemoryD1, InMemoryR2, InMemoryKV, SCHEMA_SQL } from '../src/d1-schema.ts'
import { RelayDurableObject } from '../src/relay.ts'

const { values } = parseArgs({
  options: {
    port: { type: 'string', short: 'p', default: '3001' },
    host: { type: 'string', short: 'H', default: '0.0.0.0' },
    help: { type: 'boolean', short: 'h' }
  },
  strict: false,
  allowPositionals: true
})

if (values.help) {
  console.log(`
Harmony Cloud Server (Local Development)

Usage:
  harmony-portal [options]

Options:
  -p, --port <number>   Port to listen on (default: 3001)
  -H, --host <string>   Host to bind to (default: 0.0.0.0)
  -h, --help            Show this help message

Routes:
  GET  /health                      Health check
  POST /api/identity/link           Link Discord ↔ DID
  POST /api/identity/verify         Verify identity link
  POST /api/friends/find            Find linked friends
  POST /api/storage/upload          Upload encrypted export
  GET  /api/storage/download/:id    Download export
  DELETE /api/storage/delete/:id    Delete export
  POST /api/storage/list            List exports by admin
  GET  /api/oauth/discord           Start Discord OAuth
  GET  /api/oauth/discord/callback  OAuth callback
  POST /api/invite/create           Create invite
  GET  /invite/:code                Resolve invite
  DELETE /api/invite/:code          Revoke invite
  GET  /api/directory               List communities
  POST /api/directory/register      Register community
  WS   /relay/:nodeDID              WebSocket relay
`)
  process.exit(0)
}

const port = parseInt(values.port, 10)
const host = values.host

// Initialize in-memory stores
const db = new InMemoryD1()
const r2 = new InMemoryR2()
const kv = new InMemoryKV()
const relay = new RelayDurableObject()

// Apply D1 schema
await db.exec(SCHEMA_SQL)

// Build the environment matching PortalWorkerEnv
const env = {
  DB: db,
  EXPORTS: r2,
  KV: kv,
  RELAY: {
    idFromName: (name) => ({ toString: () => name }),
    get: (_id) => ({
      fetch: async () => new Response('relay stub', { status: 200 })
    })
  },
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID ?? 'local-dev-client-id',
  DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET ?? 'local-dev-client-secret',
  DISCORD_REDIRECT_URI: process.env.DISCORD_REDIRECT_URI ?? `http://localhost:${port}/api/oauth/discord/callback`,
  ALLOWED_ORIGINS: '*'
}

// Create HTTP server
const server = createServer(async (req, res) => {
  try {
    // Collect body
    let body = ''
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = await new Promise((resolve) => {
        const chunks = []
        req.on('data', (chunk) => chunks.push(chunk))
        req.on('end', () => resolve(Buffer.concat(chunks).toString()))
      })
    }

    // Build worker request
    const url = `http://${host}:${port}${req.url}`
    const workerReq = {
      method: req.method ?? 'GET',
      url,
      headers: Object.fromEntries(
        Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : (v ?? '')])
      ),
      body: body || undefined,
      ip: req.socket.remoteAddress ?? 'unknown'
    }

    // Handle via the worker handler
    const workerRes = await handleRequest(workerReq, env)

    // Send response
    res.writeHead(workerRes.status, workerRes.headers)
    res.end(workerRes.body)
  } catch (err) {
    console.error('Request error:', err)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Internal server error' }))
  }
})

// WebSocket relay for /relay/:nodeDID
const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  const urlMatch = req.url?.match(/^\/relay\/(.+)$/)
  if (!urlMatch) {
    socket.destroy()
    return
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    const nodeDID = urlMatch[1]
    console.log(`Relay connection from: ${nodeDID}`)

    // Wrap Node.js ws as a minimal relay-compatible interface
    const mockWs = {
      readyState: 1,
      send: (data) => {
        if (ws.readyState === 1) ws.send(data)
      },
      close: (code, reason) => ws.close(code, reason),
      addEventListener: (event, handler) => {
        if (event === 'message') {
          ws.on('message', (data) => handler({ data, type: 'message' }))
        } else if (event === 'close') {
          ws.on('close', () => handler(new Event('close')))
        }
      },
      removeEventListener: () => {},
      dispatchEvent: () => {}
    }

    relay.handleNodeConnection(mockWs, nodeDID)

    ws.on('close', () => {
      console.log(`Relay disconnected: ${nodeDID}`)
    })
  })
})

// Start
server.listen(port, host, () => {
  console.log(`Harmony Cloud Server (local) listening on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`)
  console.log(`Health: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/health`)
  console.log(`Relay:  ws://${host === '0.0.0.0' ? 'localhost' : host}:${port}/relay/<nodeDID>`)
  console.log('')
  console.log('Stores: In-memory D1, R2, KV (data resets on restart)')
})
