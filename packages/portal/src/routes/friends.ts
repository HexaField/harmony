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

  // POST /api/friends/store — Store a user's Discord friend IDs
  router.post('/friends/store', async (req: Request, res: Response) => {
    try {
      const { did, discordFriendIds } = req.body
      if (!did || !Array.isArray(discordFriendIds)) {
        res.status(400).json({ error: 'Missing did or discordFriendIds array' })
        return
      }
      portal.storeFriendsList(did, discordFriendIds)
      res.json({ stored: discordFriendIds.length })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // GET /api/friends/:did — Get a user's discovered friends
  router.get('/friends/:did', async (req: Request, res: Response) => {
    try {
      const { did } = req.params as { did: string }
      const friends = await portal.discoverFriends(did)
      res.json({ friends })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // POST /api/friends/discover — Discover friends for the current user
  router.post('/friends/discover', async (req: Request, res: Response) => {
    try {
      const { did } = req.body
      if (!did) {
        res.status(400).json({ error: 'Missing did' })
        return
      }
      const friends = await portal.discoverFriends(did)
      res.json({ friends })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  return router
}
