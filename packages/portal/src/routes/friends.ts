import { Router, type Request, type Response } from 'express'
import type { PortalService } from '../index.js'

export function friendsRoutes(portal: PortalService): Router {
  const router = Router()

  // POST /api/friends/find — Find Discord friends who've linked
  router.post('/friends/find', async (req: Request, res: Response) => {
    try {
      const { discordUserIds } = req.body
      if (!Array.isArray(discordUserIds)) {
        res.status(400).json({ error: 'Missing discordUserIds array' })
        return
      }
      const linkedMap = await portal.findLinkedIdentities(discordUserIds)
      const linked = Array.from(linkedMap.entries()).map(([discordId, did]) => ({ discordId, did }))
      res.json({ linked })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  return router
}
