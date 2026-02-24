// Harmony Cloud Worker — routes requests to CommunityDurableObject instances

import { handleProvisioningRequest } from './provisioning.js'
import type { Env } from './types.js'

export type { Env } from './types.js'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Health check
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok' })
    }

    // Provisioning API (HTTP)
    if (url.pathname.startsWith('/api/instances')) {
      return handleProvisioningRequest(request, env)
    }

    // WebSocket upgrade — route to community DO
    // Path: /ws/:communityId or /ws?community=:id
    if (url.pathname.startsWith('/ws/') || url.pathname === '/ws') {
      const communityId = url.pathname.split('/')[2] || url.searchParams.get('community')
      if (!communityId) {
        return new Response('Missing community ID', { status: 400 })
      }

      const doId = env.COMMUNITY.idFromName(communityId)
      const stub = env.COMMUNITY.get(doId)
      return stub.fetch(request)
    }

    return new Response('Not found', { status: 404 })
  }
}

export { CommunityDurableObject } from './community-do.js'
