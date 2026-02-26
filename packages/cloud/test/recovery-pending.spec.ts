import { describe, it, expect, beforeAll } from 'vitest'
import { createCryptoProvider } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import { createCloudApp } from '../src/index.js'
import request from 'supertest'

const crypto = createCryptoProvider()
const didProvider = new DIDKeyProvider(crypto)

describe('Recovery Pending Endpoint', () => {
  let app: any
  let services: any

  beforeAll(async () => {
    const cloud = await createCloudApp(crypto)
    app = cloud.app
    services = cloud.services
  })

  it('MUST return unconfigured status for unknown DID', async () => {
    const res = await request(app).get('/api/recovery/did%3Akey%3Aunknown/status')
    expect(res.status).toBe(200)
    expect(res.body.configured).toBe(false)
  })

  it('MUST return configured status after setup', async () => {
    const keyPair = await crypto.generateSigningKeyPair()
    const doc = await didProvider.create(keyPair)
    const identity = { did: doc.id, document: doc, credentials: [] as any[], capabilities: [] as any[] }

    await services.recoveryService.setupSocialRecovery({
      identity,
      trustedDIDs: ['did:key:zTrusted1', 'did:key:zTrusted2'],
      threshold: 2,
      keyPair
    })

    const res = await request(app).get(`/api/recovery/${encodeURIComponent(doc.id)}/status`)
    expect(res.status).toBe(200)
    expect(res.body.configured).toBe(true)
    expect(res.body.threshold).toBe(2)
    expect(res.body.trustedDIDs).toHaveLength(2)
  })

  it('MUST return empty pending requests for non-trusted DID', async () => {
    const res = await request(app).get(`/api/recovery/pending/${encodeURIComponent('did:key:zNobody')}`)
    expect(res.status).toBe(200)
    expect(res.body.requests).toEqual([])
  })

  it('MUST complete full recovery flow with pending endpoint', async () => {
    const { recoveryService } = services

    // Create owner identity
    const ownerKP = await crypto.generateSigningKeyPair()
    const ownerDoc = await didProvider.create(ownerKP)
    const ownerIdentity = { did: ownerDoc.id, document: ownerDoc, credentials: [] as any[], capabilities: [] as any[] }

    // Create trusted contacts
    const trustedKP_B = await crypto.generateSigningKeyPair()
    const trustedDoc_B = await didProvider.create(trustedKP_B)
    const trustedKP_C = await crypto.generateSigningKeyPair()
    const trustedDoc_C = await didProvider.create(trustedKP_C)
    const trustedKP_D = await crypto.generateSigningKeyPair()
    const trustedDoc_D = await didProvider.create(trustedKP_D)

    // Setup recovery for owner with trusted DIDs [B, C, D], threshold 2
    await recoveryService.setupSocialRecovery({
      identity: ownerIdentity,
      trustedDIDs: [trustedDoc_B.id, trustedDoc_C.id, trustedDoc_D.id],
      threshold: 2,
      keyPair: ownerKP
    })

    // Initiate recovery
    const recovererKP = await crypto.generateSigningKeyPair()
    const recoveryRequest = await recoveryService.initiateRecovery({
      claimedDID: ownerDoc.id,
      recovererKeyPair: recovererKP
    })

    // GET /recovery/pending/:B → returns the pending request
    const pendingB = await request(app).get(`/api/recovery/pending/${encodeURIComponent(trustedDoc_B.id)}`)
    expect(pendingB.status).toBe(200)
    expect(pendingB.body.requests).toHaveLength(1)
    expect(pendingB.body.requests[0].requestId).toBe(recoveryRequest.id)
    expect(pendingB.body.requests[0].claimedDID).toBe(ownerDoc.id)
    expect(pendingB.body.requests[0].approvalsCount).toBe(0)
    expect(pendingB.body.requests[0].threshold).toBe(2)
    expect(pendingB.body.requests[0].alreadyApproved).toBe(false)

    // GET /recovery/pending/:X (non-trusted) → returns empty
    const nonTrustedKP = await crypto.generateSigningKeyPair()
    const nonTrustedDoc = await didProvider.create(nonTrustedKP)
    const pendingX = await request(app).get(`/api/recovery/pending/${encodeURIComponent(nonTrustedDoc.id)}`)
    expect(pendingX.status).toBe(200)
    expect(pendingX.body.requests).toEqual([])

    // POST /recovery/approve with B
    const approve1 = await request(app).post('/api/recovery/approve').send({
      requestId: recoveryRequest.id,
      approverDID: trustedDoc_B.id,
      timestamp: new Date().toISOString()
    })
    expect(approve1.status).toBe(200)
    expect(approve1.body.approvalsCount).toBe(1)
    expect(approve1.body.approved).toBe(false)

    // GET /recovery/pending/:B → shows alreadyApproved: true
    const pendingB2 = await request(app).get(`/api/recovery/pending/${encodeURIComponent(trustedDoc_B.id)}`)
    expect(pendingB2.body.requests[0].alreadyApproved).toBe(true)
    expect(pendingB2.body.requests[0].approvalsCount).toBe(1)

    // POST /recovery/approve with C → approved: true
    const approve2 = await request(app).post('/api/recovery/approve').send({
      requestId: recoveryRequest.id,
      approverDID: trustedDoc_C.id,
      timestamp: new Date().toISOString()
    })
    expect(approve2.status).toBe(200)
    expect(approve2.body.approved).toBe(true)
    expect(approve2.body.approvalsCount).toBe(2)

    // Complete recovery via service (KeyPair contains Uint8Array, can't serialize over JSON)
    const newKP = await crypto.generateSigningKeyPair()
    const recovered = await recoveryService.completeRecovery({
      requestId: recoveryRequest.id,
      newKeyPair: newKP
    })
    expect(recovered.identity.did).toMatch(/^did:key:z/)
  })
})
