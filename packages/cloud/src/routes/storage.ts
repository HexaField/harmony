import { Router, type Request, type Response } from 'express'
import type { HostingService } from '../hosting-service.js'
import type { AuthenticatedRequest } from '../middleware/auth.js'

export function storageRoutes(hostingService: HostingService): Router {
  const router = Router()

  router.post('/storage/:instanceId/blobs', async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthenticatedRequest
      const uploaderDID = authReq.holderDID || req.body.uploaderDID
      if (!uploaderDID) {
        res.status(400).json({ error: 'uploaderDID required' })
        return
      }
      const blob = await hostingService.uploadBlob({
        instanceId: req.params.instanceId as string,
        uploaderDID,
        data: req.body.data
      })
      res.status(201).json({ id: blob.id, sizeBytes: blob.sizeBytes, createdAt: blob.createdAt })
    } catch (err: any) {
      const status = err.message.includes('quota') ? 413 : err.message.includes('not found') ? 404 : 500
      res.status(status).json({ error: err.message })
    }
  })

  router.get('/storage/:instanceId/blobs', async (req: Request, res: Response) => {
    try {
      const blobs = hostingService.listBlobs(req.params.instanceId as string)
      res.json(
        blobs.map((b) => ({ id: b.id, uploaderDID: b.uploaderDID, sizeBytes: b.sizeBytes, createdAt: b.createdAt }))
      )
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  router.get('/storage/blobs/:blobId', async (req: Request, res: Response) => {
    try {
      const blob = hostingService.getBlob(req.params.blobId as string)
      if (!blob) {
        res.status(404).json({ error: 'Blob not found' })
        return
      }
      res.json(blob)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  router.delete('/storage/blobs/:blobId', async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthenticatedRequest
      const requesterDID = authReq.holderDID || req.body.requesterDID
      await hostingService.deleteBlob(req.params.blobId as string, requesterDID)
      res.status(204).end()
    } catch (err: any) {
      const status = err.message === 'Unauthorized' ? 403 : err.message.includes('not found') ? 404 : 500
      res.status(status).json({ error: err.message })
    }
  })

  return router
}
