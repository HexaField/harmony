import express, { type Application, type Request, type Response } from 'express'
import { createCryptoProvider } from '@harmony/crypto'
import { CloudService } from './index.js'
import { identityRoutes } from './routes/identity.js'
import { oauthRoutes } from './routes/oauth.js'
import { storageRoutes } from './routes/storage.js'
import { friendsRoutes } from './routes/friends.js'

export async function createApp(cloud?: CloudService): Promise<Application> {
  const app = express()
  app.use(express.json({ limit: '50mb' }))

  if (!cloud) {
    const crypto = createCryptoProvider()
    cloud = new CloudService(crypto)
  }
  await cloud.initialize()

  app.use('/api', identityRoutes(cloud))
  app.use('/api', oauthRoutes(cloud))
  app.use('/api', storageRoutes(cloud))
  app.use('/api', friendsRoutes(cloud))

  app.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok' }))

  return app
}

// Start server when run directly
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))
if (isMain) {
  const port = parseInt(process.env.PORT || '3000', 10)
  createApp().then((app) => {
    app.listen(port, () => {
      console.log(`Harmony Cloud listening on port ${port}`)
    })
  })
}
