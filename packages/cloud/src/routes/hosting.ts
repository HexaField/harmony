import { Router, type Request, type Response } from 'express'
import type { HostingService } from '../hosting-service.js'
import type { AuthenticatedRequest } from '../middleware/auth.js'

export function hostingRoutes(hostingService: HostingService): Router {
  const router = Router()

  router.post('/hosting/instances', async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthenticatedRequest
      const ownerDID = authReq.holderDID || req.body.ownerDID
      if (!ownerDID) {
        res.status(400).json({ error: 'ownerDID required' })
        return
      }
      const instance = await hostingService.createInstance({ name: req.body.name, ownerDID })
      res.status(201).json({ instance, serverUrl: instance.serverUrl ?? null })
    } catch (err: any) {
      const status = err.message.includes('quota') ? 409 : 500
      res.status(status).json({ error: err.message })
    }
  })

  router.get('/hosting/instances', async (req: Request, res: Response) => {
    try {
      const ownerDID = req.query.ownerDID as string
      if (!ownerDID) {
        res.status(400).json({ error: 'ownerDID query param required' })
        return
      }
      const instances = hostingService.listInstances(ownerDID)
      res.json(instances)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  router.get('/hosting/instances/:id', async (req: Request, res: Response) => {
    try {
      const instance = hostingService.getInstance(req.params.id as string)
      if (!instance) {
        res.status(404).json({ error: 'Instance not found' })
        return
      }
      const health = await hostingService.getInstanceHealth(req.params.id as string)
      res.json({ ...instance, health })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  router.delete('/hosting/instances/:id', async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthenticatedRequest
      const requesterDID = authReq.holderDID || req.body.requesterDID
      await hostingService.deleteInstance(req.params.id as string, requesterDID)
      res.status(204).end()
    } catch (err: any) {
      const status = err.message === 'Unauthorized' ? 403 : err.message === 'Instance not found' ? 404 : 500
      res.status(status).json({ error: err.message })
    }
  })

  router.post('/hosting/instances/:id/restart', async (req: Request, res: Response) => {
    try {
      await hostingService.restartInstance(req.params.id as string)
      const instance = hostingService.getInstance(req.params.id as string)
      res.json({ instance, serverUrl: instance?.serverUrl ?? null })
    } catch (err: any) {
      const status = err.message === 'Instance not found' ? 404 : 500
      res.status(status).json({ error: err.message })
    }
  })

  return router
}
