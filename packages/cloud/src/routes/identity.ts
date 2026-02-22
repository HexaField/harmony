import { Router } from 'express'
import type { CloudService } from '../index.js'

export function identityRoutes(cloud: CloudService): Router {
  const router = Router()

  router.post('/identities', async (_req, res) => {
    try {
      const result = await cloud.createIdentity()
      res.status(201).json({
        did: result.identity.did,
        mnemonic: result.mnemonic
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  router.get('/identities/:did', async (req, res) => {
    try {
      const identity = await cloud.resolveIdentity(req.params.did)
      if (!identity) return res.status(404).json({ error: 'Not found' })
      res.json({
        did: identity.did,
        credentials: identity.credentials.length,
        capabilities: identity.capabilities.length
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  return router
}
