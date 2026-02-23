import { Router, type Request, type Response } from 'express'
import type { PortalService } from '../index.js'

export function identityRoutes(portal: PortalService): Router {
  const router = Router()

  router.post('/identities', async (_req: Request, res: Response) => {
    try {
      const result = await portal.createIdentity()
      res.status(201).json({
        did: result.identity.did,
        mnemonic: result.mnemonic
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  router.get('/identities/:did', async (req: Request, res: Response) => {
    try {
      const identity = await portal.resolveIdentity(req.params.did as string)
      if (!identity) {
        res.status(404).json({ error: 'Not found' })
        return
      }
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
