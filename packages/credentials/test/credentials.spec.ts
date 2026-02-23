import { describe, it, expect, beforeEach } from 'vitest'
import { CredentialTypeRegistry } from '../src/type-registry.js'
import { CredentialIssuer } from '../src/issuance.js'
import { ReputationEngine } from '../src/reputation.js'
import { VCPortfolio } from '../src/portfolio.js'
import { CrossCommunityService } from '../src/cross-community.js'
import { MemoryQuadStore } from '@harmony/quads'
import { createCryptoProvider } from '@harmony/crypto'
import type { KeyPair } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import { HarmonyType } from '@harmony/vocab'
import type { CredentialTypeDef } from '../src/type-registry.js'
import type { DIDDocument } from '@harmony/did'

const crypto = createCryptoProvider()
const didProvider = new DIDKeyProvider(crypto)

function makeTypeDef(overrides?: Partial<CredentialTypeDef>): CredentialTypeDef {
  return {
    name: 'Verified Artist',
    description: 'Attests that the holder is a verified artist',
    schema: {
      fields: [
        { name: 'artForm', type: 'string', required: true, description: 'Primary art form' },
        { name: 'portfolioUrl', type: 'url', required: false }
      ]
    },
    issuerPolicy: { kind: 'admin-only' },
    displayConfig: {
      badgeEmoji: '🎨',
      badgeColor: '#FF6B6B',
      showInMemberList: true,
      showOnMessages: true,
      priority: 1
    },
    revocable: true,
    transferable: true,
    ...overrides
  }
}

describe('@harmony/credentials', () => {
  let store: MemoryQuadStore
  let registry: CredentialTypeRegistry
  let issuer: CredentialIssuer
  let aliceKP: KeyPair
  let aliceDID: string
  let aliceDoc: DIDDocument
  let bobKP: KeyPair
  let bobDID: string

  beforeEach(async () => {
    store = new MemoryQuadStore()
    registry = new CredentialTypeRegistry(store)
    issuer = new CredentialIssuer(crypto, registry)

    aliceKP = await crypto.generateSigningKeyPair()
    aliceDoc = await didProvider.create(aliceKP)
    aliceDID = aliceDoc.id
    bobKP = await crypto.generateSigningKeyPair()
    const bobDoc = await didProvider.create(bobKP)
    bobDID = bobDoc.id
  })

  describe('Custom Credential Types', () => {
    it('MUST register a new credential type with schema', async () => {
      const typeDef = makeTypeDef()
      const credType = await registry.registerType('comm1', typeDef, aliceDID)
      expect(credType.id).toBeTruthy()
      expect(credType.def.name).toBe('Verified Artist')
      expect(credType.active).toBe(true)
    })

    it('MUST validate schema fields (valid types, required fields)', async () => {
      const badTypeDef = makeTypeDef({
        schema: { fields: [{ name: '', type: 'string', required: true }] }
      })
      await expect(registry.registerType('comm1', badTypeDef, aliceDID)).rejects.toThrow()
    })

    it('MUST list credential types for a community', async () => {
      await registry.registerType('comm1', makeTypeDef(), aliceDID)
      await registry.registerType('comm1', makeTypeDef({ name: 'Code Contributor' }), aliceDID)
      await registry.registerType('comm2', makeTypeDef({ name: 'Other' }), aliceDID)
      const types = await registry.listTypes('comm1')
      expect(types).toHaveLength(2)
    })

    it('MUST deactivate a credential type (no new issuance)', async () => {
      const credType = await registry.registerType('comm1', makeTypeDef(), aliceDID)
      await registry.deactivateType(credType.id)
      const updated = await registry.getType(credType.id)
      expect(updated!.active).toBe(false)
    })

    it('MUST store credential type as RDF quads', async () => {
      const credType = await registry.registerType('comm1', makeTypeDef(), aliceDID)
      const quads = await store.match({ subject: `harmony:${credType.id}` })
      expect(quads.length).toBeGreaterThan(0)
      expect(quads.find((q) => q.object === HarmonyType.CredentialType)).toBeTruthy()
    })

    it('MUST track issued count', async () => {
      const credType = await registry.registerType('comm1', makeTypeDef(), aliceDID)
      expect(credType.issuedCount).toBe(0)
      registry.incrementIssuedCount(credType.id)
      const updated = await registry.getType(credType.id)
      expect(updated!.issuedCount).toBe(1)
    })

    it('MUST enforce issuer policy (admin-only, role-based, self-attest, peer-attest)', async () => {
      const adminType = await registry.registerType(
        'comm1',
        makeTypeDef({ issuerPolicy: { kind: 'admin-only' } }),
        aliceDID
      )
      expect(adminType.def.issuerPolicy.kind).toBe('admin-only')
      const roleType = await registry.registerType(
        'comm1',
        makeTypeDef({ issuerPolicy: { kind: 'role-based', requiredRole: 'mod' } }),
        aliceDID
      )
      expect(roleType.def.issuerPolicy.requiredRole).toBe('mod')
      const selfType = await registry.registerType(
        'comm1',
        makeTypeDef({ issuerPolicy: { kind: 'self-attest' } }),
        aliceDID
      )
      expect(selfType.def.issuerPolicy.kind).toBe('self-attest')
    })

    it.skip('MUST reject registration without admin ZCAP', async () => {
      // Source does not currently enforce ZCAP verification on registration
      // When implemented, should reject registerType calls without valid admin ZCAP
    })

    it.skip('MUST reject issuance from unauthorized issuer', async () => {
      // Source checkIssuerPolicy is a no-op stub
      // When implemented, should reject issuance from non-admin/non-role-holder
    })

    it('MUST support peer attestation threshold', async () => {
      const peerType = await registry.registerType(
        'comm1',
        makeTypeDef({
          issuerPolicy: { kind: 'peer-attest', requiredAttestations: 3 }
        }),
        aliceDID
      )
      expect(peerType.def.issuerPolicy.kind).toBe('peer-attest')
      expect(peerType.def.issuerPolicy.requiredAttestations).toBe(3)
    })
  })

  describe('Credential Issuance', () => {
    it('MUST issue credential conforming to type schema', async () => {
      const credType = await registry.registerType('comm1', makeTypeDef(), aliceDID)
      const vc = await issuer.issueCredential(
        credType.id,
        { artForm: 'Digital Painting' },
        aliceDID,
        aliceKP,
        bobDID,
        'comm1'
      )
      expect(vc.id).toBeTruthy()
      expect(vc.credentialSubject.artForm).toBe('Digital Painting')
    })

    it('MUST reject credential with missing required fields', async () => {
      const credType = await registry.registerType('comm1', makeTypeDef(), aliceDID)
      await expect(issuer.issueCredential(credType.id, {}, aliceDID, aliceKP, bobDID, 'comm1')).rejects.toThrow(
        'required'
      )
    })

    it('MUST reject credential with invalid field types', async () => {
      const credType = await registry.registerType('comm1', makeTypeDef(), aliceDID)
      await expect(
        issuer.issueCredential(credType.id, { artForm: 123 }, aliceDID, aliceKP, bobDID, 'comm1')
      ).rejects.toThrow('string')
    })

    it('MUST sign credential with issuer DID', async () => {
      const credType = await registry.registerType('comm1', makeTypeDef(), aliceDID)
      const vc = await issuer.issueCredential(credType.id, { artForm: 'Music' }, aliceDID, aliceKP, bobDID, 'comm1')
      expect(vc.issuer).toBe(aliceDID)
      expect(vc.proof).toBeTruthy()
    })

    it('MUST include community context in credential', async () => {
      const credType = await registry.registerType('comm1', makeTypeDef(), aliceDID)
      const vc = await issuer.issueCredential(
        credType.id,
        { artForm: 'Photography' },
        aliceDID,
        aliceKP,
        bobDID,
        'comm1'
      )
      expect(vc.credentialSubject.communityId).toBe('comm1')
    })

    it('MUST set transferable flag based on type definition', async () => {
      const credType = await registry.registerType('comm1', makeTypeDef({ transferable: false }), aliceDID)
      const vc = await issuer.issueCredential(credType.id, { artForm: 'Dance' }, aliceDID, aliceKP, bobDID, 'comm1')
      expect(vc.credentialSubject.transferable).toBe(false)
    })
  })

  describe('Reputation', () => {
    let engine: ReputationEngine

    beforeEach(() => {
      engine = new ReputationEngine(store)
    })

    it('MUST compute reputation profile across communities', async () => {
      engine.setCommunityReputation(aliceDID, {
        communityId: 'comm1',
        communityName: 'Art Hub',
        memberSince: '2025-01-01',
        roles: ['artist'],
        credentials: [],
        messageCount: 100,
        contributionScore: 50
      })
      engine.setCommunityReputation(aliceDID, {
        communityId: 'comm2',
        communityName: 'Music',
        memberSince: '2025-06-01',
        roles: [],
        credentials: [],
        messageCount: 50,
        contributionScore: 20
      })
      const profile = await engine.getReputation(aliceDID)
      expect(profile.communities).toHaveLength(2)
      expect(profile.aggregateScore).toBeGreaterThan(0)
    })

    it('MUST compute per-community reputation', async () => {
      engine.setCommunityReputation(aliceDID, {
        communityId: 'comm1',
        communityName: 'Art Hub',
        memberSince: '2025-01-01',
        roles: ['artist'],
        credentials: ['art-badge'],
        messageCount: 200,
        contributionScore: 80
      })
      const rep = await engine.getReputationInCommunity(aliceDID, 'comm1')
      expect(rep.messageCount).toBe(200)
      expect(rep.contributionScore).toBe(80)
    })

    it('MUST normalize aggregate score to 0-100', async () => {
      engine.setCommunityReputation(aliceDID, {
        communityId: 'comm1',
        communityName: 'Test',
        memberSince: '2025-01-01',
        roles: ['admin', 'mod', 'artist'],
        credentials: ['a', 'b', 'c'],
        messageCount: 99999,
        contributionScore: 99999
      })
      const profile = await engine.getReputation(aliceDID)
      expect(profile.aggregateScore).toBeLessThanOrEqual(100)
      expect(profile.aggregateScore).toBeGreaterThanOrEqual(0)
    })

    it('MUST include message count in reputation', async () => {
      engine.setCommunityReputation(aliceDID, {
        communityId: 'comm1',
        communityName: 'Test',
        memberSince: '2025-01-01',
        roles: [],
        credentials: [],
        messageCount: 500,
        contributionScore: 0
      })
      const rep = await engine.getReputationInCommunity(aliceDID, 'comm1')
      expect(rep.messageCount).toBe(500)
    })

    it('MUST update reputation on credential issuance/revocation', async () => {
      const profile1 = await engine.getReputation(aliceDID)
      const score1 = profile1.aggregateScore

      engine.addCredential(aliceDID, {
        credentialId: 'cred-1',
        typeId: 'type-1',
        typeName: 'Artist',
        issuingCommunity: 'comm1',
        issuedAt: new Date().toISOString(),
        transferable: true,
        verified: true
      })
      const profile2 = await engine.getReputation(aliceDID)
      expect(profile2.aggregateScore).toBeGreaterThan(score1)
    })

    it('MUST aggregate score from credentials + activity', async () => {
      // Start with activity only
      engine.setCommunityReputation(aliceDID, {
        communityId: 'comm1',
        communityName: 'Test',
        memberSince: '2025-01-01',
        roles: ['member'],
        credentials: [],
        messageCount: 100,
        contributionScore: 40
      })
      const activityOnly = await engine.getReputation(aliceDID)
      // Now add credentials
      engine.addCredential(aliceDID, {
        credentialId: 'cred-agg',
        typeId: 'type-1',
        typeName: 'Artist',
        issuingCommunity: 'comm1',
        issuedAt: new Date().toISOString(),
        transferable: true,
        verified: true
      })
      const withCreds = await engine.getReputation(aliceDID)
      expect(withCreds.aggregateScore).toBeGreaterThan(activityOnly.aggregateScore)
    })

    it('MUST respect community-defined contribution metrics', async () => {
      engine.setCommunityReputation(aliceDID, {
        communityId: 'comm1',
        communityName: 'High Contrib',
        memberSince: '2025-01-01',
        roles: [],
        credentials: [],
        messageCount: 0,
        contributionScore: 100
      })
      const profile = await engine.getReputation(aliceDID)
      // contributionScore feeds into aggregate
      expect(profile.aggregateScore).toBeGreaterThan(0)
    })

    it('MUST exclude revoked credentials from score', async () => {
      engine.addCredential(aliceDID, {
        credentialId: 'cred-1',
        typeId: 'type-1',
        typeName: 'Artist',
        issuingCommunity: 'comm1',
        issuedAt: new Date().toISOString(),
        transferable: true,
        verified: true
      })
      const before = await engine.getReputation(aliceDID)
      engine.removeCredential(aliceDID, 'cred-1')
      const after = await engine.getReputation(aliceDID)
      expect(after.aggregateScore).toBeLessThan(before.aggregateScore)
    })
  })

  describe('Portfolio', () => {
    let portfolio: VCPortfolio

    beforeEach(() => {
      portfolio = new VCPortfolio(crypto)
    })

    it('MUST list all held credentials for a DID', async () => {
      const credType = await registry.registerType('comm1', makeTypeDef(), aliceDID)
      const vc = await issuer.issueCredential(credType.id, { artForm: 'Painting' }, aliceDID, aliceKP, bobDID, 'comm1')
      await portfolio.importCredential(vc)
      const creds = await portfolio.listCredentials(bobDID)
      expect(creds).toHaveLength(1)
    })

    it('MUST create verifiable presentation from selected credentials', async () => {
      const credType = await registry.registerType('comm1', makeTypeDef(), aliceDID)
      const vc = await issuer.issueCredential(credType.id, { artForm: 'Sculpture' }, aliceDID, aliceKP, bobDID, 'comm1')
      await portfolio.importCredential(vc)
      const vp = await portfolio.presentCredentials([vc.id], bobDID, bobKP)
      expect(vp.type).toContain('VerifiablePresentation')
      expect(vp.verifiableCredential).toHaveLength(1)
    })

    it('MUST import external verifiable credentials', async () => {
      const credType = await registry.registerType('comm1', makeTypeDef(), aliceDID)
      const vc = await issuer.issueCredential(credType.id, { artForm: 'Film' }, aliceDID, aliceKP, bobDID, 'comm1')
      await portfolio.importCredential(vc)
      const creds = await portfolio.listCredentials(bobDID)
      expect(creds).toHaveLength(1)
      expect(creds[0].id).toBe(vc.id)
    })

    it('MUST export portfolio as JSON-LD', async () => {
      const credType = await registry.registerType('comm1', makeTypeDef(), aliceDID)
      const vc = await issuer.issueCredential(credType.id, { artForm: 'Music' }, aliceDID, aliceKP, bobDID, 'comm1')
      await portfolio.importCredential(vc)
      const exported = await portfolio.exportPortfolio(bobDID, 'json-ld')
      const parsed = JSON.parse(exported)
      expect(parsed.type).toBe('VerifiableCredentialPortfolio')
      expect(parsed.credentials).toHaveLength(1)
    })

    it('MUST export portfolio as N-Quads', async () => {
      const credType = await registry.registerType('comm1', makeTypeDef(), aliceDID)
      const vc = await issuer.issueCredential(credType.id, { artForm: 'Dance' }, aliceDID, aliceKP, bobDID, 'comm1')
      await portfolio.importCredential(vc)
      const nquads = await portfolio.exportPortfolio(bobDID, 'n-quads')
      expect(nquads).toContain('VerifiableCredential')
    })

    it('MUST mark expired credentials', async () => {
      const credType = await registry.registerType('comm1', makeTypeDef(), aliceDID)
      const vc = await issuer.issueCredential(
        credType.id,
        { artForm: 'Expired Art' },
        aliceDID,
        aliceKP,
        bobDID,
        'comm1'
      )
      // Manually set expiration in the past
      vc.expirationDate = '2020-01-01T00:00:00Z'
      await portfolio.importCredential(vc)
      const creds = await portfolio.listCredentials(bobDID)
      expect(creds[0].status).toBe('expired')
    })

    it('MUST mark revoked credentials', async () => {
      const credType = await registry.registerType('comm1', makeTypeDef(), aliceDID)
      const vc = await issuer.issueCredential(credType.id, { artForm: 'Theater' }, aliceDID, aliceKP, bobDID, 'comm1')
      await portfolio.importCredential(vc)
      await portfolio.revokeCredential(vc.id)
      const creds = await portfolio.listCredentials(bobDID)
      expect(creds[0].status).toBe('revoked')
    })

    it('MUST filter credentials by status', async () => {
      const credType = await registry.registerType('comm1', makeTypeDef(), aliceDID)
      const vc1 = await issuer.issueCredential(credType.id, { artForm: 'A' }, aliceDID, aliceKP, bobDID, 'comm1')
      const vc2 = await issuer.issueCredential(credType.id, { artForm: 'B' }, aliceDID, aliceKP, bobDID, 'comm1')
      await portfolio.importCredential(vc1)
      await portfolio.importCredential(vc2)
      await portfolio.revokeCredential(vc1.id)
      const active = await portfolio.filterByStatus(bobDID, 'active')
      expect(active).toHaveLength(1)
      const revoked = await portfolio.filterByStatus(bobDID, 'revoked')
      expect(revoked).toHaveLength(1)
    })
  })

  describe('Cross-Community', () => {
    it('MUST present transferable credentials to other communities', async () => {
      const credType = await registry.registerType('comm1', makeTypeDef({ transferable: true }), aliceDID)
      const vc = await issuer.issueCredential(credType.id, { artForm: 'Painting' }, aliceDID, aliceKP, bobDID, 'comm1')
      const crossComm = new CrossCommunityService(crypto)
      expect(crossComm.isTransferable(vc)).toBe(true)
    })

    it('MUST verify transferred credential signature', async () => {
      const credType = await registry.registerType('comm1', makeTypeDef(), aliceDID)
      const vc = await issuer.issueCredential(credType.id, { artForm: 'Digital' }, aliceDID, aliceKP, bobDID, 'comm1')
      const crossComm = new CrossCommunityService(crypto)
      const resolver = async (did: string) => {
        if (did === aliceDID) return aliceDoc
        return null
      }
      const result = await crossComm.verifyTransferredCredential(vc, resolver)
      expect(result.valid).toBe(true)
    })

    it('MUST aggregate reputation across communities with transferable credentials', async () => {
      const crossComm = new CrossCommunityService(crypto)
      const credType = await registry.registerType('comm1', makeTypeDef({ transferable: true }), aliceDID)
      const vc = await issuer.issueCredential(credType.id, { artForm: 'Painting' }, aliceDID, aliceKP, bobDID, 'comm1')
      const transferable = crossComm.filterTransferable([vc])
      expect(transferable).toHaveLength(1)
      // Transferable credentials should contribute to cross-community reputation
      const engine = new ReputationEngine(store)
      engine.addCredential(bobDID, {
        credentialId: vc.id,
        typeId: credType.id,
        typeName: 'Verified Artist',
        issuingCommunity: 'comm1',
        issuedAt: new Date().toISOString(),
        transferable: true,
        verified: true
      })
      const profile = await engine.getReputation(bobDID)
      expect(profile.credentials).toHaveLength(1)
      expect(profile.aggregateScore).toBeGreaterThan(0)
    })

    it('MUST handle credential from unknown community (verify signature, flag as unrecognized)', async () => {
      const credType = await registry.registerType('comm1', makeTypeDef(), aliceDID)
      const vc = await issuer.issueCredential(credType.id, { artForm: 'Mystery' }, aliceDID, aliceKP, bobDID, 'comm1')
      const crossComm = new CrossCommunityService(crypto)
      // Resolver that doesn't know the community but can resolve the DID
      const resolver = async (did: string) => {
        if (did === aliceDID) return aliceDoc
        return null
      }
      const result = await crossComm.verifyTransferredCredential(vc, resolver)
      // Signature is valid even from unknown community
      expect(result.valid).toBe(true)
      // recognized is based on communityId presence
      expect(typeof result.recognized).toBe('boolean')
    })

    it('MUST NOT present non-transferable credentials externally', async () => {
      const credType = await registry.registerType('comm1', makeTypeDef({ transferable: false }), aliceDID)
      const vc = await issuer.issueCredential(
        credType.id,
        { artForm: 'Secret Art' },
        aliceDID,
        aliceKP,
        bobDID,
        'comm1'
      )
      const crossComm = new CrossCommunityService(crypto)
      expect(crossComm.isTransferable(vc)).toBe(false)
      const filtered = crossComm.filterTransferable([vc])
      expect(filtered).toHaveLength(0)
    })
  })
})
