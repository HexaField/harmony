import { Router, type Request, type Response } from 'express'
import type { PortalService } from '../index.js'

export function storageRoutes(portal: PortalService): Router {
  const router = Router()

  router.post('/storage/exports', async (req: Request, res: Response) => {
    try {
      const { ciphertext, nonce, metadata } = req.body
      if (!ciphertext || !nonce || !metadata) {
        res.status(400).json({ error: 'Missing required fields' })
        return
      }
      const bundle = {
        ciphertext: new Uint8Array(ciphertext),
        nonce: new Uint8Array(nonce),
        metadata
      }
      const result = await portal.storeExport(bundle)
      res.status(201).json(result)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  router.get('/storage/exports', async (req: Request, res: Response) => {
    try {
      const adminDID = req.query.adminDID as string
      if (!adminDID) {
        res.status(400).json({ error: 'Missing adminDID query param' })
        return
      }
      const list = await portal.listExports(adminDID)
      res.json(list)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  router.get('/storage/exports/:exportId', async (req: Request, res: Response) => {
    try {
      const adminDID = req.query.adminDID as string
      if (!adminDID) {
        res.status(400).json({ error: 'Missing adminDID query param' })
        return
      }
      const bundle = await portal.retrieveExport(req.params.exportId as string, adminDID)
      res.json({
        ciphertext: Array.from(bundle.ciphertext),
        nonce: Array.from(bundle.nonce),
        metadata: bundle.metadata
      })
    } catch (err: any) {
      if (err.message.includes('not found')) {
        res.status(404).json({ error: err.message })
        return
      }
      if (err.message.includes('Unauthorized')) {
        res.status(403).json({ error: err.message })
        return
      }
      res.status(500).json({ error: err.message })
    }
  })

  router.delete('/storage/exports/:exportId', async (req: Request, res: Response) => {
    try {
      const adminDID = req.query.adminDID as string
      if (!adminDID) {
        res.status(400).json({ error: 'Missing adminDID query param' })
        return
      }
      await portal.deleteExport(req.params.exportId as string, adminDID)
      res.status(204).send()
    } catch (err: any) {
      if (err.message.includes('not found')) {
        res.status(404).json({ error: err.message })
        return
      }
      if (err.message.includes('Unauthorized')) {
        res.status(403).json({ error: err.message })
        return
      }
      res.status(500).json({ error: err.message })
    }
  })

  return router
}
