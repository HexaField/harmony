export { CloudIdentityService, type CloudIdentityResult } from './identity-service.js'
export { HostingService, type ManagedInstance, type StoredBlob } from './hosting-service.js'
export { DiscordLinkService, type DiscordLinkRequest, type DiscordProfile } from './discord-link.js'
export { RecoveryService, type RecoverySetup, type OAuthRecoveryToken } from './recovery.js'
export { vpAuthMiddleware, type AuthenticatedRequest } from './middleware/auth.js'
export { rateLimitMiddleware, type RateLimitOptions } from './middleware/rate-limit.js'
export { identityRoutes } from './routes/identity.js'
export { hostingRoutes } from './routes/hosting.js'
export { oauthRoutes } from './routes/oauth.js'
export { storageRoutes } from './routes/storage.js'
export { recoveryRoutes } from './routes/recovery.js'

import express, { type Application, type Request, type Response } from 'express'
import { type CryptoProvider } from '@harmony/crypto'
import { CloudIdentityService } from './identity-service.js'
import { HostingService } from './hosting-service.js'
import { DiscordLinkService } from './discord-link.js'
import { RecoveryService } from './recovery.js'
import { vpAuthMiddleware } from './middleware/auth.js'
import { rateLimitMiddleware } from './middleware/rate-limit.js'
import { identityRoutes } from './routes/identity.js'
import { hostingRoutes } from './routes/hosting.js'
import { oauthRoutes } from './routes/oauth.js'
import { storageRoutes } from './routes/storage.js'
import { recoveryRoutes } from './routes/recovery.js'

export interface CloudServices {
  identityService: CloudIdentityService
  hostingService: HostingService
  discordLinkService: DiscordLinkService
  recoveryService: RecoveryService
}

export async function createCloudApp(
  crypto: CryptoProvider,
  options?: {
    useAuth?: boolean
    rateLimit?: { windowMs: number; maxRequests: number }
  }
): Promise<{ app: Application; services: CloudServices }> {
  const app = express()
  app.use(express.json({ limit: '50mb' }))

  const identityService = new CloudIdentityService(crypto)
  await identityService.initialize()

  const hostingService = new HostingService(crypto)
  const discordLinkService = new DiscordLinkService(crypto)
  await discordLinkService.initialize(identityService.getCloudDID(), identityService.getCloudKeyPair())

  const recoveryService = new RecoveryService(crypto)

  if (options?.rateLimit) {
    app.use(rateLimitMiddleware(options.rateLimit))
  }

  if (options?.useAuth) {
    app.use('/api', vpAuthMiddleware(crypto))
  }

  app.use('/api', identityRoutes(identityService))
  app.use('/api', hostingRoutes(hostingService))
  app.use('/api', oauthRoutes(discordLinkService))
  app.use('/api', storageRoutes(hostingService))
  app.use('/api', recoveryRoutes(recoveryService))
  app.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok' }))

  return { app, services: { identityService, hostingService, discordLinkService, recoveryService } }
}
