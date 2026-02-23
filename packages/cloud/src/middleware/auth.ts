import type { Request, Response, NextFunction } from 'express'
import type { CryptoProvider } from '@harmony/crypto'
import type { VerifiablePresentation } from '@harmony/vc'
import { VCService } from '@harmony/vc'
import { DIDKeyProvider } from '@harmony/did'

export interface AuthenticatedRequest extends Request {
  holderDID?: string
  presentation?: VerifiablePresentation
}

export function vpAuthMiddleware(crypto: CryptoProvider) {
  const vcService = new VCService(crypto)
  const didProvider = new DIDKeyProvider(crypto)

  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing VP authorization' })
      return
    }

    try {
      const vpJson = Buffer.from(authHeader.slice(7), 'base64').toString('utf-8')
      const vp: VerifiablePresentation = JSON.parse(vpJson)

      if (!vp.type?.includes('VerifiablePresentation') || !vp.holder || !vp.proof) {
        res.status(401).json({ error: 'Invalid VP structure' })
        return
      }

      const result = await vcService.verifyPresentation(vp, (did) => didProvider.resolve(did))
      if (!result.valid) {
        const errors = result.checks
          .filter((c) => !c.passed)
          .map((c) => c.error)
          .join(', ')
        res.status(401).json({ error: `VP verification failed: ${errors}` })
        return
      }

      req.holderDID = vp.holder
      req.presentation = vp
      next()
    } catch (err: any) {
      res.status(401).json({ error: `VP authentication error: ${err.message}` })
    }
  }
}
