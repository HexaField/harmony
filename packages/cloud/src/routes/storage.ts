import { Router } from 'express'
import type { CloudService } from '../index.js'

export function storageRoutes(cloud: CloudService): Router {
  const router = Router()

  router.post('/storage/exports', async (req, res) => {
    try {
      const { ciphertext, nonce, metadata } = req.body
      if (!ciphertext || !nonce || !metadata) {
        return res.status(400).json({ error: 'Missing required fields' })
      }
      const bundle = {
        ciphertext: new Uint8Array(ciphertext),
        nonce: new Uint8Array(nonce),
        metadata
      }
      const result = await cloud.storeExport(bundle)
      res.status(201).json(result)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  router.get('/storage/exports', async (req, res) => {
    try {
      const adminDID = req.query.adminDID as string
      if (!adminDID) return res.status(400).json({ error: 'Missing adminDID query param' })
      const list = await cloud.listExports(adminDID)
      res.json(list)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  router.get('/storage/exports/:exportId', async (req, res) => {
    try {
      const adminDID = req.query.adminDID as string
      if (!adminDID) return res.status(400).json({ error: 'Missing adminDID query param' })
      const bundle = await cloud.retrieveExport(req.params.exportId, adminDID)
      res.json({
        ciphertext: Array.from(bundle.ciphertext),
        nonce: Array.from(bundle.nonce),
        metadata: bundle.metadata
      })
    } catch (err: any) {
      if (err.message.includes('not found')) return res.status(404).json({ error: err.message })
      if (err.message.includes('Unauthorized')) return res.status(403).json({ error: err.message })
      res.status(500).json({ error: err.message })
    }
  })

  router.delete('/storage/exports/:exportId', async (req, res) => {
    try {
      const adminDID = req.query.adminDID as string
      if (!adminDID) return res.status(400).json({ error: 'Missing adminDID query param' })
      await cloud.deleteExport(req.params.exportId, adminDID, {} as any)
      res.status(204).send()
    } catch (err: any) {
      if (err.message.includes('not found')) return res.status(404).json({ error: err.message })
      if (err.message.includes('Unauthorized')) return res.status(403).json({ error: err.message })
      res.status(500).json({ error: err.message })
    }
  })

  return router
}
