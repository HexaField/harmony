import { Router, type Request, type Response } from 'express'
import type { PortalService } from '../index.js'

export function friendsRoutes(portal: PortalService): Router {
  const router = Router()

  router.post('/friends/find', async (req: Request, res: Response) => {
    try {
      const { discordUserIds } = req.body
      if (!Array.isArray(discordUserIds)) {
        res.status(400).json({ error: 'Missing discordUserIds array' })
        return
      }
      const linked = await portal.findLinkedIdentities(discordUserIds)
      res.json(Object.fromEntries(linked))
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  return router
}
