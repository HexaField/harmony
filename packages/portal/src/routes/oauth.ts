import { Router, type Request, type Response } from 'express'
import type { PortalService } from '../index.js'
import type { ReconciliationService } from '../reconciliation.js'

// In-memory state store for OAuth flows
const pendingStates = new Map<string, { userDID: string; redirectUri?: string; createdAt: number }>()

// Clean expired states (older than 10 minutes)
function cleanExpiredStates(): void {
  const now = Date.now()
  for (const [state, entry] of pendingStates) {
    if (now - entry.createdAt > 10 * 60 * 1000) {
      pendingStates.delete(state)
    }
  }
}

function generateState(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

export function oauthRoutes(portal: PortalService, reconciliationService?: ReconciliationService): Router {
  const router = Router()

  // Legacy POST initiate (kept for backward compatibility)
  router.post('/oauth/initiate', async (req: Request, res: Response) => {
    try {
      const { provider, userDID } = req.body
      if (!provider || !userDID) {
        res.status(400).json({ error: 'Missing provider or userDID' })
        return
      }
      const result = await portal.initiateOAuthLink({ provider, userDID })
      res.json(result)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // Legacy POST complete (kept for backward compatibility)
  router.post('/oauth/complete', async (req: Request, res: Response) => {
    try {
      const { provider, code, state, userDID, userKeyPair, providerUserId, providerUsername } = req.body
      if (!provider || !code || !state || !userDID) {
        res.status(400).json({ error: 'Missing required fields' })
        return
      }
      const vc = await portal.completeOAuthLink({
        provider,
        code,
        state,
        userDID,
        userKeyPair,
        providerUserId,
        providerUsername
      })
      res.json(vc)
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

      const state = generateState()
      const redirectUri = req.query.redirectUri as string | undefined

      pendingStates.set(state, { userDID, redirectUri, createdAt: Date.now() })

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: discordRedirectUri,
        response_type: 'code',
        scope: 'identify',
        state
      })

      res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // GET /api/oauth/discord/callback — Handle Discord OAuth callback
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

      const pending = pendingStates.get(state as string)
      if (!pending) {
        res.status(400).json({ error: 'Invalid or expired OAuth state' })
        return
      }

      if (Date.now() - pending.createdAt > 10 * 60 * 1000) {
        pendingStates.delete(state as string)
        res.status(400).json({ error: 'OAuth state expired' })
        return
      }

      pendingStates.delete(state as string)

      const clientId = process.env.DISCORD_CLIENT_ID!
      const clientSecret = process.env.DISCORD_CLIENT_SECRET!
      const discordRedirectUri = process.env.DISCORD_REDIRECT_URI!

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

      // Complete the OAuth link — issue VC
      // Generate a temporary key pair for the VC (the portal signs as issuer)
      // Check if this Discord account is already linked to a different DID
      const existingDID = portal.resolveDiscordUser?.(discordUser.id) || null
      const isDedup = existingDID && existingDID !== pending.userDID

      const vc = await portal.completeOAuthLink({
        provider: 'discord',
        code: code as string,
        state: state as string,
        userDID: isDedup ? existingDID : pending.userDID,
        userKeyPair: undefined as any, // Not needed — portal signs as issuer
        providerUserId: discordUser.id,
        providerUsername: discordUser.username
      })

      // Reconcile ghost member records
      let reconciledCommunities: string[] = []
      if (reconciliationService) {
        const result = await reconciliationService.onDiscordLinked(
          discordUser.id,
          discordUser.username,
          isDedup ? existingDID : pending.userDID
        )
        reconciledCommunities = result.reconciledCommunities
      }

      // If client provided a redirect URI, redirect with VC
      if (pending.redirectUri) {
        const redirectUrl = new URL(pending.redirectUri)
        redirectUrl.searchParams.set('vc', JSON.stringify(vc))
        redirectUrl.searchParams.set('did', isDedup ? existingDID : pending.userDID)
        if (isDedup) redirectUrl.searchParams.set('existingDID', existingDID)
        res.redirect(redirectUrl.toString())
      } else {
        // Return HTML that posts result to opener and closes the popup
        const html = `<!DOCTYPE html>
<html><head><title>Discord Linked</title></head>
<body style="background:#1a1a2e;color:#e0e0e0;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center">
<div style="font-size:3em;margin-bottom:0.5em">✅</div>
<h2>Discord account linked!</h2>
<p style="color:#888">This window will close automatically.</p>
</div>
<script>
try { window.opener && window.opener.postMessage({ type: 'harmony:oauth-complete', provider: 'discord', userDID: ${JSON.stringify(isDedup ? existingDID : pending.userDID)}, discordUsername: ${JSON.stringify(discordUser.username)}, reconciledCommunities: ${JSON.stringify(reconciledCommunities)}${isDedup ? `, existingDID: ${JSON.stringify(existingDID)}` : ''} }, '*'); } catch(e) {}
setTimeout(() => { try { window.close(); } catch(e) {} setTimeout(() => { document.querySelector('p').textContent = 'You can close this tab now.'; }, 500); }, 2000);
</script>
</body></html>`
        res.status(200).type('html').send(html)
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // POST /api/identity/link — Initiate OAuth linking (called by MigrationWizard UI)
  router.post('/identity/link', (req: Request, res: Response) => {
    try {
      const { provider, userDID } = req.body
      if (!provider || !userDID) {
        res.status(400).json({ error: 'Missing provider or userDID' })
        return
      }

      if (provider !== 'discord') {
        res.status(400).json({ error: `Unsupported provider: ${provider}` })
        return
      }

      const clientId = process.env.DISCORD_CLIENT_ID
      const discordRedirectUri = process.env.DISCORD_REDIRECT_URI
      if (!clientId || !discordRedirectUri) {
        res.status(500).json({ error: 'Discord OAuth not configured' })
        return
      }

      cleanExpiredStates()

      const state = generateState()
      pendingStates.set(state, { userDID, createdAt: Date.now() })

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: discordRedirectUri,
        response_type: 'code',
        scope: 'identify',
        state
      })

      res.json({ redirectUrl: `https://discord.com/api/oauth2/authorize?${params.toString()}` })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // GET /api/identity/:did/discord-profile — Get linked Discord profile for a DID
  router.get('/identity/:did/discord-profile', (req: Request, res: Response) => {
    try {
      const did = req.params.did as string
      const profile = portal.getDiscordProfile(did)
      if (!profile) {
        res.status(404).json({ error: 'No Discord profile linked for this DID' })
        return
      }
      res.json(profile)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  return router
}

// Export for testing
export { pendingStates as _pendingStates }
