import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'
// Load .env from monorepo root — go up from src/ to packages/portal/ to packages/ to root
loadEnv({ path: resolve(import.meta.dirname, '..', '..', '..', '.env') })
import express, { type Application, type Request, type Response } from 'express'
import { createCryptoProvider } from '@harmony/crypto'
import { PortalService } from './index.js'
import { createPortalDB } from './db.js'
import { requireAuth } from './middleware/auth.js'
import { identityRoutes } from './routes/identity.js'
import { oauthRoutes } from './routes/oauth.js'
import { storageRoutes } from './routes/storage.js'
import { friendsRoutes } from './routes/friends.js'
import { bugsRoutes } from './routes/bugs.js'

export async function createApp(
  portal?: PortalService,
  existingDb?: import('better-sqlite3').Database
): Promise<Application> {
  const app = express()
  app.use((req, _res, next) => {
    process.stderr.write(`[Portal] ${req.method} ${req.url}\n`)
    next()
  })
  app.use(express.json({ limit: '100mb' }))

  // CORS — configurable allowed origins
  const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:5173').split(',')

  app.use((_req, res, next) => {
    console.error(`[Portal] ${_req.method} ${_req.url} origin=${_req.headers.origin || 'none'}`)
    const origin = _req.headers.origin
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    if (_req.method === 'OPTIONS') {
      res.sendStatus(204)
      return
    }
    next()
  })

  const db = existingDb ?? createPortalDB()
  if (!portal) {
    const crypto = createCryptoProvider()
    portal = new PortalService(crypto, db)
  }
  await portal.initialize()

  // Health check (no auth)
  app.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok' }))

  // OAuth routes (browser redirects — no auth headers possible)
  app.use('/api', oauthRoutes(portal))

  // Auth middleware on all other /api routes
  app.use('/api', requireAuth())

  app.use('/api', identityRoutes(portal))
  app.use('/api', storageRoutes(portal))
  app.use('/api', friendsRoutes(portal))
  app.use('/api', bugsRoutes(db))

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
