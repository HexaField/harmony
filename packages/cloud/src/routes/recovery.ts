import { Router, type Request, type Response } from 'express'
import type { RecoveryService } from '../recovery.js'

export function recoveryRoutes(recoveryService: RecoveryService): Router {
  const router = Router()

  /** Get recovery config status for a DID */
  router.get('/recovery/:did/status', async (req: Request, res: Response) => {
    try {
      const did = decodeURIComponent(req.params.did as string)
      const config = recoveryService.getRecoveryConfig(did)
      if (!config) {
        res.json({ configured: false })
        return
      }
      res.json({
        configured: true,
        trustedDIDs: config.trustedDIDs,
        threshold: config.threshold,
        createdAt: config.createdAt
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  /** Set up social recovery */
  router.post('/recovery/setup', async (req: Request, res: Response) => {
    try {
      const { identity, trustedDIDs, threshold, keyPair } = req.body
      if (!identity || !trustedDIDs || !threshold || !keyPair) {
        res.status(400).json({ error: 'Missing required fields: identity, trustedDIDs, threshold, keyPair' })
        return
      }
      const config = await recoveryService.setupSocialRecovery({ identity, trustedDIDs, threshold, keyPair })
      res.status(201).json(config)
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  /** Initiate account recovery */
  router.post('/recovery/initiate', async (req: Request, res: Response) => {
    try {
      const { claimedDID, recovererKeyPair } = req.body
      if (!claimedDID || !recovererKeyPair) {
        res.status(400).json({ error: 'Missing required fields: claimedDID, recovererKeyPair' })
        return
      }
      const request = await recoveryService.initiateRecovery({ claimedDID, recovererKeyPair })
      res.status(201).json(request)
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  /** Submit an approval for a recovery request */
  router.post('/recovery/approve', async (req: Request, res: Response) => {
    try {
      const approval = req.body
      if (!approval?.requestId || !approval?.approverDID) {
        res.status(400).json({ error: 'Missing required fields: requestId, approverDID' })
        return
      }
      const result = await recoveryService.submitApproval(approval)
      res.json(result)
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  /** Complete recovery after threshold approvals met */
  router.post('/recovery/complete', async (req: Request, res: Response) => {
    try {
      const { requestId, newKeyPair } = req.body
      if (!requestId || !newKeyPair) {
        res.status(400).json({ error: 'Missing required fields: requestId, newKeyPair' })
        return
      }
      const result = await recoveryService.completeRecovery({ requestId, newKeyPair })
      res.json({
        did: result.identity.did,
        identity: result.identity
      })
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  /** OAuth recovery */
  router.post('/recovery/oauth', async (req: Request, res: Response) => {
    try {
      const { provider, providerUserId } = req.body
      if (!provider || !providerUserId) {
        res.status(400).json({ error: 'Missing required fields: provider, providerUserId' })
        return
      }
      const result = await recoveryService.recoverViaOAuth({ provider, providerUserId })
      if (!result) {
        res.status(404).json({ error: 'No recovery found for this OAuth identity' })
        return
      }
      res.json({ did: result.identity.did, identity: result.identity })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  /** Get pending recovery requests where this DID is a trusted contact */
  router.get('/recovery/pending/:approverDID', async (req: Request, res: Response) => {
    try {
      const approverDID = decodeURIComponent(req.params.approverDID as string)
      const pending = recoveryService.getPendingForApprover(approverDID)
      res.json({ requests: pending })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  return router
}
