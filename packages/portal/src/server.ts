import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'
// Load .env from monorepo root (pnpm runs from package dir)
loadEnv({ path: resolve(import.meta.dirname, '../../../.env') })
import express, { type Application, type Request, type Response } from 'express'
import { createCryptoProvider } from '@harmony/crypto'
import { PortalService } from './index.js'
import { identityRoutes } from './routes/identity.js'
import { oauthRoutes } from './routes/oauth.js'
import { storageRoutes } from './routes/storage.js'
import { friendsRoutes } from './routes/friends.js'

export async function createApp(portal?: PortalService): Promise<Application> {
  const app = express()
  app.use(express.json({ limit: '50mb' }))

  // CORS — allow UI dev server and desktop app
  app.use((_req, res, next) => {
    const origin = _req.headers.origin
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    if (_req.method === 'OPTIONS') {
      res.sendStatus(204)
      return
    }
    next()
  })

  if (!portal) {
    const crypto = createCryptoProvider()
    portal = new PortalService(crypto)
  }
  await portal.initialize()

  app.use('/api', identityRoutes(portal))
  app.use('/api', oauthRoutes(portal))
  app.use('/api', storageRoutes(portal))
  app.use('/api', friendsRoutes(portal))

  app.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok' }))

  return app
}

// Start server when run directly
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))
if (isMain) {
  const port = parseInt(process.env.PORT || '3000', 10)
  createApp().then((app) => {
    app.listen(port, () => {
      console.log(`Harmony Portal listening on port ${port}`)
    })
  })
}
