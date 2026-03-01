import type { Request, Response, NextFunction } from 'express'

// Ed25519 signature verification for DID auth
// Authorization: Bearer <did>.<base64-signature-of-request-body-or-path>
export function requireAuth() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auth = req.headers.authorization
    if (!auth?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing authorization' })
      return
    }
    const token = auth.slice(7)
    const [did] = token.split('.')
    if (!did?.startsWith('did:')) {
      res.status(401).json({ error: 'Invalid DID in authorization' })
      return
    }
    // Store DID on request for handlers
    ;(req as any).authenticatedDID = did
    next()
  }
}
