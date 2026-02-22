import { Router } from 'express'
import type { CloudService } from '../index.js'

export function oauthRoutes(cloud: CloudService): Router {
  const router = Router()

  router.post('/oauth/initiate', async (req, res) => {
    try {
      const { provider, userDID } = req.body
      if (!provider || !userDID) return res.status(400).json({ error: 'Missing provider or userDID' })
      const result = await cloud.initiateOAuthLink({ provider, userDID })
      res.json(result)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  router.post('/oauth/complete', async (req, res) => {
    try {
      const { provider, code, state, userDID, userKeyPair, providerUserId, providerUsername } = req.body
      if (!provider || !code || !state || !userDID) {
        return res.status(400).json({ error: 'Missing required fields' })
      }
      const vc = await cloud.completeOAuthLink({
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

  return router
}
