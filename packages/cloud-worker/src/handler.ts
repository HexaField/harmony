// Worker request handler / router
import type { CloudWorkerEnv, CommunityPreview } from './types.js'
import { createIdentityStore } from './identity-store.js'
import { createExportStore } from './export-store.js'
import { createInviteResolver } from './invite-resolver.js'
import { createOAuthHandler } from './oauth.js'
import { createRateLimiter } from './rate-limiter.js'
import { createDirectoryStore } from './directory.js'
import { t } from './strings.js'

export interface WorkerRequest {
  method: string
  url: string
  headers: Record<string, string>
  body?: string
  ip?: string
}

export interface WorkerResponse {
  status: number
  headers: Record<string, string>
  body: string
}

function corsHeaders(origin: string, allowedOrigins: string): Record<string, string> {
  const allowed = allowedOrigins.split(',').map((o) => o.trim())
  if (allowed.includes('*') || allowed.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  }
  return {}
}

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): WorkerResponse {
  return {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(data)
  }
}

function html(content: string, status = 200): WorkerResponse {
  return {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: content
  }
}

export async function handleRequest(req: WorkerRequest, env: CloudWorkerEnv): Promise<WorkerResponse> {
  const url = new URL(req.url, 'https://cloud.harmony.chat')
  const path = url.pathname
  const origin = req.headers.origin ?? req.headers.Origin ?? ''
  const cors = corsHeaders(origin, env.ALLOWED_ORIGINS)

  // Rate limiting
  const rateLimiter = createRateLimiter(env.KV)
  const ip = req.ip ?? 'unknown'
  const rateCheck = await rateLimiter.check(`ip:${ip}`, 60, 60)
  if (!rateCheck.allowed) {
    return json({ error: t('RATE_LIMITED') }, 429, cors)
  }

  // Routes
  if (path === '/health' && req.method === 'GET') {
    return json({ status: t('HEALTH_OK') }, 200, cors)
  }

  // Identity routes
  const identityStore = createIdentityStore(env.DB)

  if (path === '/api/identity/link' && req.method === 'POST') {
    const body = JSON.parse(req.body ?? '{}')
    try {
      await identityStore.linkIdentity(body.discordUserId, body.did, body.proof)
      return json({ success: true, message: t('IDENTITY_LINKED') }, 200, cors)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message === 'DUPLICATE_DISCORD_ID') {
        return json({ error: t('IDENTITY_ALREADY_LINKED_DISCORD') }, 409, cors)
      }
      if (message === 'DUPLICATE_DID') {
        return json({ error: t('IDENTITY_ALREADY_LINKED_DID') }, 409, cors)
      }
      return json({ error: message }, 500, cors)
    }
  }

  if (path === '/api/identity/verify' && req.method === 'POST') {
    const body = JSON.parse(req.body ?? '{}')
    const did = await identityStore.getByDiscordId(body.discordUserId)
    if (!did) {
      return json({ error: t('IDENTITY_NOT_FOUND') }, 404, cors)
    }
    return json({ did }, 200, cors)
  }

  // Friends
  if (path === '/api/friends/find' && req.method === 'POST') {
    const body = JSON.parse(req.body ?? '{}')
    const friends = await identityStore.findFriends(body.discordUserIds ?? [])
    return json({ friends }, 200, cors)
  }

  // Export routes
  const exportStore = createExportStore(env.EXPORTS, env.DB)

  if (path === '/api/storage/upload' && req.method === 'POST') {
    const body = JSON.parse(req.body ?? '{}')
    const bundle = {
      ciphertext: new Uint8Array(body.ciphertext),
      nonce: new Uint8Array(body.nonce),
      metadata: body.metadata
    }
    const result = await exportStore.upload(bundle)
    return json(result, 200, cors)
  }

  const downloadMatch = path.match(/^\/api\/storage\/download\/(.+)$/)
  if (downloadMatch && req.method === 'GET') {
    const bundle = await exportStore.download(downloadMatch[1])
    if (!bundle) {
      return json({ error: t('EXPORT_NOT_FOUND') }, 404, cors)
    }
    return json(
      {
        ciphertext: Array.from(bundle.ciphertext),
        nonce: Array.from(bundle.nonce),
        metadata: bundle.metadata
      },
      200,
      cors
    )
  }

  const deleteMatch = path.match(/^\/api\/storage\/delete\/(.+)$/)
  if (deleteMatch && req.method === 'DELETE') {
    await exportStore.delete(deleteMatch[1])
    return json({ success: true, message: t('EXPORT_DELETED') }, 200, cors)
  }

  if (path === '/api/storage/list' && req.method === 'POST') {
    const body = JSON.parse(req.body ?? '{}')
    const exports = await exportStore.listByAdmin(body.adminDID)
    return json({ exports }, 200, cors)
  }

  // OAuth routes
  const oauthHandler = createOAuthHandler(env.KV)

  if (path === '/api/oauth/discord' && req.method === 'GET') {
    const state = Math.random().toString(36).substring(2, 18)
    const did = url.searchParams.get('did') ?? ''
    await oauthHandler.storeState(state, { did, provider: 'discord' })
    const authUrl = oauthHandler.getDiscordAuthUrl(env.DISCORD_CLIENT_ID, env.DISCORD_REDIRECT_URI, state)
    return json({ url: authUrl, state }, 200, cors)
  }

  if (path === '/api/oauth/discord/callback' && req.method === 'GET') {
    const state = url.searchParams.get('state') ?? ''
    const code = url.searchParams.get('code') ?? ''
    const stateData = await oauthHandler.validateState(state)
    if (!stateData) {
      return json({ error: t('OAUTH_STATE_INVALID') }, 400, cors)
    }
    // In production, exchange code for token and get user info
    // For now, store the linking
    if (code && stateData.did) {
      try {
        await identityStore.linkIdentity(code, stateData.did, 'oauth-proof')
      } catch {
        // May fail if already linked
      }
    }
    return json({ success: true, did: stateData.did }, 200, cors)
  }

  // Invite routes
  const inviteResolver = createInviteResolver(env.DB)

  if (path === '/api/invite/create' && req.method === 'POST') {
    const body = JSON.parse(req.body ?? '{}')
    const code = await inviteResolver.create(
      body.communityId,
      body.endpoint,
      body.metadata as CommunityPreview,
      body.createdBy,
      { maxUses: body.maxUses, expiresAt: body.expiresAt }
    )
    return json({ code, link: `https://harmony.chat/invite/${code}` }, 200, cors)
  }

  const inviteMatch = path.match(/^\/invite\/(.+)$/)
  if (inviteMatch && req.method === 'GET') {
    const code = inviteMatch[1]
    const validity = await inviteResolver.checkValidity(code)
    if (!validity.valid) {
      return json(
        {
          error: t(
            validity.reason === 'expired'
              ? 'INVITE_EXPIRED'
              : validity.reason === 'max_uses'
                ? 'INVITE_MAX_USES'
                : validity.reason === 'revoked'
                  ? 'INVITE_REVOKED'
                  : 'INVITE_NOT_FOUND'
          )
        },
        410,
        cors
      )
    }

    const target = await inviteResolver.resolve(code)
    if (!target) {
      return json({ error: t('INVITE_NOT_FOUND') }, 404, cors)
    }

    // Check User-Agent for app detection
    const ua = req.headers['user-agent'] ?? ''
    if (ua.includes('Harmony/')) {
      // Deep link
      return json({ redirect: `harmony://invite/${code}`, target }, 200, cors)
    }

    // Landing page HTML
    return html(`<!DOCTYPE html>
<html><head><title>${t('LANDING_TITLE', { name: target.preview.name })}</title></head>
<body>
<h1>${t('LANDING_TITLE', { name: target.preview.name })}</h1>
<p>${target.preview.description ?? t('LANDING_DESCRIPTION')}</p>
<p>${t('LANDING_MEMBERS', { count: target.preview.memberCount })}</p>
<a href="harmony://invite/${code}">${t('LANDING_DOWNLOAD')}</a>
</body></html>`)
  }

  const inviteDeleteMatch = path.match(/^\/api\/invite\/(.+)$/)
  if (inviteDeleteMatch && req.method === 'DELETE') {
    await inviteResolver.revoke(inviteDeleteMatch[1])
    return json({ success: true }, 200, cors)
  }

  // Directory routes
  const directoryStore = createDirectoryStore(env.DB)

  if (path === '/api/directory' && req.method === 'GET') {
    const entries = await directoryStore.list()
    return json({ communities: entries }, 200, cors)
  }

  if (path === '/api/directory/register' && req.method === 'POST') {
    const body = JSON.parse(req.body ?? '{}')
    await directoryStore.register({
      communityId: body.communityId,
      name: body.name,
      description: body.description,
      endpoint: body.endpoint,
      memberCount: body.memberCount ?? 0,
      inviteCode: body.inviteCode,
      ownerDID: body.ownerDID,
      listedAt: new Date().toISOString()
    })
    return json({ success: true, message: t('DIRECTORY_REGISTERED') }, 200, cors)
  }

  return json({ error: 'Not found' }, 404, cors)
}
