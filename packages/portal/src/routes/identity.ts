import { Router, type Request, type Response } from 'express'
import type { PortalService } from '../index.js'

export function identityRoutes(portal: PortalService): Router {
  const router = Router()

  // POST /api/identity/create — Create identity via portal
  router.post('/identity/create', async (_req: Request, res: Response) => {
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

  // Legacy route (kept for backward compatibility)
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

  // GET /api/identity/:did — Resolve identity
  router.get('/identity/:did', async (req: Request, res: Response) => {
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

  // Legacy route (kept for backward compatibility)
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
