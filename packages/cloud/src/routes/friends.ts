import { Router } from 'express'
import type { CloudService } from '../index.js'

export function friendsRoutes(cloud: CloudService): Router {
  const router = Router()

  router.post('/friends/find', async (req, res) => {
    try {
      const { discordUserIds } = req.body
      if (!Array.isArray(discordUserIds)) {
        return res.status(400).json({ error: 'Missing discordUserIds array' })
      }
      const linked = await cloud.findLinkedIdentities(discordUserIds)
      res.json(Object.fromEntries(linked))
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  return router
}
