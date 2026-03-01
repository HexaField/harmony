// Instance provisioning via D1

import type { Instance, Env } from './types.js'
import { extractPublicKeyFromDIDKey, verifyEd25519Signature } from './auth.js'
import { base64ToUint8Array } from '@harmony/protocol'

export async function handleProvisioningRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const method = request.method

  // POST /api/instances — create
  if (method === 'POST' && url.pathname === '/api/instances') {
    return handleCreate(request, env)
  }

  // GET /api/instances?owner=:did — list
  if (method === 'GET' && url.pathname === '/api/instances') {
    const ownerDID = url.searchParams.get('owner')
    if (!ownerDID) return Response.json({ error: 'Missing owner param' }, { status: 400 })
    return handleList(ownerDID, env)
  }

  // DELETE /api/instances/:id
  if (method === 'DELETE' && url.pathname.startsWith('/api/instances/')) {
    const id = url.pathname.split('/')[3]
    if (!id) return new Response('Missing instance ID', { status: 400 })
    return handleDelete(id, request, env)
  }

  // GET /api/instances/:id/health
  if (method === 'GET' && url.pathname.endsWith('/health')) {
    const id = url.pathname.split('/')[3]
    if (!id) return new Response('Missing instance ID', { status: 400 })
    return handleHealth(id, env)
  }

  return new Response('Not found', { status: 404 })
}

async function handleCreate(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as { name: string; ownerDID: string }
  if (!body.name || !body.ownerDID) {
    return Response.json({ error: 'Missing name or ownerDID' }, { status: 400 })
  }

  const instance = await createInstance(env.DB, body)
  return Response.json(instance, { status: 201 })
}

async function handleList(ownerDID: string, env: Env): Promise<Response> {
  const instances = await listInstances(env.DB, ownerDID)
  return Response.json(instances)
}

async function handleDelete(id: string, request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get('Authorization')
  if (!auth) return new Response('Unauthorized', { status: 401 })
  if (!auth.startsWith('Bearer ')) {
    return new Response('Invalid authorization', { status: 403 })
  }

  const token = auth.slice(7) // Remove 'Bearer '
  const dotIndex = token.indexOf('.')
  if (dotIndex < 0) {
    return new Response('Invalid token format: expected <did>.<base64-signature>', { status: 403 })
  }

  const did = token.slice(0, dotIndex)
  const signatureB64 = token.slice(dotIndex + 1)

  if (!did.startsWith('did:key:')) {
    return new Response('Only did:key DIDs are supported', { status: 403 })
  }

  // Look up instance owner
  const row = await env.DB.prepare('SELECT owner_did FROM instances WHERE id = ? AND status != ?')
    .bind(id, 'deleted')
    .first<{ owner_did: string }>()

  if (!row) {
    return new Response('Instance not found', { status: 404 })
  }

  if (row.owner_did !== did) {
    return new Response('Forbidden: not the instance owner', { status: 403 })
  }

  // Verify Ed25519 signature over the instance ID
  const publicKeyBytes = extractPublicKeyFromDIDKey(did)
  if (!publicKeyBytes) {
    return new Response('Could not extract public key from DID', { status: 403 })
  }

  const signatureBytes = base64ToUint8Array(signatureB64)
  const messageBytes = new TextEncoder().encode(id)

  const valid = await verifyEd25519Signature(publicKeyBytes, signatureBytes, messageBytes)
  if (!valid) {
    return new Response('Signature verification failed', { status: 403 })
  }

  await deleteInstance(env.DB, id)
  return new Response(null, { status: 204 })
}

async function handleHealth(id: string, env: Env): Promise<Response> {
  // Get the DO and check its health
  const doId = env.COMMUNITY.idFromName(id)
  const stub = env.COMMUNITY.get(doId)
  const healthReq = new Request('https://internal/health')
  const res = await stub.fetch(healthReq)
  return res
}

export async function createInstance(db: D1Database, params: { name: string; ownerDID: string }): Promise<Instance> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await db
    .prepare('INSERT INTO instances (id, name, owner_did, created_at, status) VALUES (?, ?, ?, ?, ?)')
    .bind(id, params.name, params.ownerDID, now, 'active')
    .run()

  return {
    id,
    name: params.name,
    ownerDID: params.ownerDID,
    status: 'active',
    createdAt: now,
    serverUrl: `/ws/${id}`
  }
}

export async function listInstances(db: D1Database, ownerDID: string): Promise<Instance[]> {
  const result = await db
    .prepare('SELECT id, name, owner_did, created_at, status FROM instances WHERE owner_did = ? AND status != ?')
    .bind(ownerDID, 'deleted')
    .all()

  return (result.results || []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    ownerDID: row.owner_did as string,
    status: row.status as Instance['status'],
    createdAt: row.created_at as string,
    serverUrl: `/ws/${row.id}`
  }))
}

export async function deleteInstance(db: D1Database, id: string): Promise<void> {
  await db.prepare("UPDATE instances SET status = 'deleted' WHERE id = ?").bind(id).run()
}
