import { Router, type Request, type Response } from 'express'
import type { DiscordLinkService } from '../discord-link.js'

// In-memory state store for cloud OAuth flows
const pendingStates = new Map<string, { userDID: string; createdAt: number }>()

function cleanExpiredStates(): void {
  const now = Date.now()
  for (const [state, entry] of pendingStates) {
    if (now - entry.createdAt > 10 * 60 * 1000) {
      pendingStates.delete(state)
    }
  }
}

export function oauthRoutes(discordLink: DiscordLinkService): Router {
  const router = Router()

  // POST /api/oauth/discord/initiate — Start Discord OAuth (original route)
  router.post('/oauth/discord/initiate', async (req: Request, res: Response) => {
    try {
      const { userDID, clientId, redirectUri } = req.body
      if (!userDID || !clientId || !redirectUri) {
        res.status(400).json({ error: 'userDID, clientId, and redirectUri required' })
        return
      }
      const result = discordLink.initiateLink({ userDID, clientId, redirectUri })
      res.json(result)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // GET /api/oauth/discord/authorize — Redirect to Discord OAuth
  router.get('/oauth/discord/authorize', (req: Request, res: Response) => {
    try {
      const clientId = process.env.DISCORD_CLIENT_ID
      const discordRedirectUri = process.env.DISCORD_REDIRECT_URI
      if (!clientId || !discordRedirectUri) {
        res
          .status(500)
          .json({ error: 'Discord OAuth not configured (missing DISCORD_CLIENT_ID or DISCORD_REDIRECT_URI)' })
        return
      }

      const userDID = req.query.userDID as string
      if (!userDID) {
        res.status(400).json({ error: 'Missing userDID query parameter' })
        return
      }

      cleanExpiredStates()

      const result = discordLink.initiateLink({ userDID, clientId, redirectUri: discordRedirectUri })
      pendingStates.set(result.state, { userDID, createdAt: Date.now() })

      res.redirect(result.redirectUrl)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // GET /api/oauth/discord/callback — Handle Discord OAuth callback with real API calls
  router.get('/oauth/discord/callback', async (req: Request, res: Response) => {
    try {
      const { code, state, error: oauthError } = req.query

      if (oauthError) {
        res.status(400).json({ error: `Discord OAuth error: ${oauthError}` })
        return
      }

      if (!code || !state) {
        res.status(400).json({ error: 'Missing code or state parameter' })
        return
      }

      const clientId = process.env.DISCORD_CLIENT_ID
      const clientSecret = process.env.DISCORD_CLIENT_SECRET
      const discordRedirectUri = process.env.DISCORD_REDIRECT_URI

      if (!clientId || !clientSecret || !discordRedirectUri) {
        res.status(500).json({ error: 'Discord OAuth not configured' })
        return
      }

      // Exchange code for access token
      const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code: code as string,
          redirect_uri: discordRedirectUri
        })
      })

      if (!tokenRes.ok) {
        const errBody = await tokenRes.text()
        res.status(502).json({ error: `Failed to exchange code: ${tokenRes.status} ${errBody}` })
        return
      }

      const tokenData = (await tokenRes.json()) as { access_token: string; token_type: string }

      // Fetch Discord user profile
      const userRes = await fetch('https://discord.com/api/v10/users/@me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      })

      if (!userRes.ok) {
        res.status(502).json({ error: `Failed to fetch Discord profile: ${userRes.status}` })
        return
      }

      const discordUser = (await userRes.json()) as { id: string; username: string; discriminator?: string }

      // Complete the link using DiscordLinkService
      const result = await discordLink.completeLink({
        state: state as string,
        discordProfile: {
          userId: discordUser.id,
          username: discordUser.username,
          discriminator: discordUser.discriminator
        }
      })

      res.status(201).json({ vc: result.vc, userDID: result.userDID })
    } catch (err: any) {
      const status = err.message.includes('expired') || err.message.includes('Invalid') ? 400 : 500
      res.status(status).json({ error: err.message })
    }
  })

  // POST /api/oauth/discord/callback — Original route (accepts pre-fetched profile)
  router.post('/oauth/discord/callback', async (req: Request, res: Response) => {
    try {
      const { state, discordProfile } = req.body
      if (!state || !discordProfile) {
        res.status(400).json({ error: 'state and discordProfile required' })
        return
      }
      const result = await discordLink.completeLink({ state, discordProfile })
      res.status(201).json({ vc: result.vc, userDID: result.userDID })
    } catch (err: any) {
      const status = err.message.includes('expired') || err.message.includes('Invalid') ? 400 : 500
      res.status(status).json({ error: err.message })
    }
  })

  // GET /api/oauth/discord/lookup/:discordUserId — Lookup linked DID
  router.get('/oauth/discord/lookup/:discordUserId', async (req: Request, res: Response) => {
    const did = discordLink.lookupByDiscordId(req.params.discordUserId as string)
    if (!did) {
      res.status(404).json({ error: 'No linked identity found' })
      return
    }
    res.json({ did })
  })

  return router
}

export { pendingStates as _pendingStates }
