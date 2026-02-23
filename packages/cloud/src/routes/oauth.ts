import { Router, type Request, type Response } from 'express'
import type { DiscordLinkService } from '../discord-link.js'

export function oauthRoutes(discordLink: DiscordLinkService): Router {
  const router = Router()

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
