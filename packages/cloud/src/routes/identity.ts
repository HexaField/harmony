import { Router, type Request, type Response } from 'express'
import type { CloudIdentityService } from '../identity-service.js'

export function identityRoutes(identityService: CloudIdentityService): Router {
  const router = Router()

  router.post('/identities', async (_req: Request, res: Response) => {
    try {
      const result = await identityService.createIdentity()
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
      const did = decodeURIComponent(req.params.did as string)
      const identity = await identityService.resolveIdentity(did)
      if (!identity) {
        res.status(404).json({ error: 'Identity not found' })
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

  router.post('/identities/:did/credentials', async (req: Request, res: Response) => {
    try {
      const did = decodeURIComponent(req.params.did as string)
      const { type, claims, expirationDate } = req.body
      const vc = await identityService.issueIdentityCredential({
        subjectDID: did,
        type,
        claims,
        expirationDate
      })
      res.status(201).json(vc)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  return router
}
