import type { KeyPair, CryptoProvider } from '@harmony/crypto'
import { randomBytes } from '@harmony/crypto'
import type { Proof, DIDResolver, RevocationStore, VerificationResult } from '@harmony/vc'
import { createProof, verifyProof, getPublicKeyFromDocument } from '@harmony/vc'
import type { Quad } from '@harmony/quads'

export interface Caveat {
  type: string
  value: unknown
}

export interface Capability {
  '@context': string[]
  id: string
  parentCapability?: string
  invoker: string
  delegator: string
  allowedAction: string[]
  scope: Record<string, unknown>
  caveats?: Caveat[]
  proof: Proof
}

export interface Invocation {
  capability: string
  invoker: string
  action: string
  target: string
  proof: Proof
}

function generateId(): string {
  const bytes = randomBytes(16)
  return 'urn:uuid:' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function isSubset(child: string[], parent: string[]): boolean {
  return child.every((a) => parent.includes(a))
}

function isScopeNarrowerOrEqual(child: Record<string, unknown>, parent: Record<string, unknown>): boolean {
  for (const key of Object.keys(child)) {
    if (!(key in parent)) return false
  }
  return true
}

export class ZCAPService {
  private crypto: CryptoProvider
  constructor(crypto: CryptoProvider) {
    this.crypto = crypto
  }

  async createRoot(params: {
    ownerDID: string
    ownerKeyPair: KeyPair
    scope: Record<string, unknown>
    allowedAction: string[]
  }): Promise<Capability> {
    const id = generateId()
    const cap: Omit<Capability, 'proof'> = {
      '@context': ['https://w3id.org/zcap/v1'],
      id,
      invoker: params.ownerDID,
      delegator: params.ownerDID,
      allowedAction: params.allowedAction,
      scope: params.scope
    }

    const vmId = `${params.ownerDID}#${params.ownerDID.replace('did:key:', '')}`
    const proof = await createProof(
      cap as unknown as Record<string, unknown>,
      params.ownerKeyPair,
      vmId,
      'capabilityDelegation',
      this.crypto
    )

    return { ...cap, proof }
  }

  async delegate(params: {
    parentCapability: Capability
    delegatorKeyPair: KeyPair
    invokerDID: string
    allowedAction: string[]
    scope: Record<string, unknown>
    caveats?: Caveat[]
  }): Promise<Capability> {
    // Attenuation: actions must be subset
    if (!isSubset(params.allowedAction, params.parentCapability.allowedAction)) {
      throw new Error('Cannot widen actions beyond parent capability')
    }
    if (!isScopeNarrowerOrEqual(params.scope, params.parentCapability.scope)) {
      throw new Error('Cannot widen scope beyond parent capability')
    }

    const id = generateId()
    const cap: Omit<Capability, 'proof'> = {
      '@context': ['https://w3id.org/zcap/v1'],
      id,
      parentCapability: params.parentCapability.id,
      invoker: params.invokerDID,
      delegator: params.parentCapability.invoker,
      allowedAction: params.allowedAction,
      scope: params.scope,
      caveats: params.caveats
    }

    const vmId = `${params.parentCapability.invoker}#${params.parentCapability.invoker.replace('did:key:', '')}`
    const proof = await createProof(
      cap as unknown as Record<string, unknown>,
      params.delegatorKeyPair,
      vmId,
      'capabilityDelegation',
      this.crypto
    )

    return { ...cap, proof }
  }

  async invoke(params: {
    capability: Capability
    invokerKeyPair: KeyPair
    action: string
    target: string
  }): Promise<Invocation> {
    const inv: Omit<Invocation, 'proof'> = {
      capability: params.capability.id,
      invoker: params.capability.invoker,
      action: params.action,
      target: params.target
    }

    const vmId = `${params.capability.invoker}#${params.capability.invoker.replace('did:key:', '')}`
    const proof = await createProof(
      inv as unknown as Record<string, unknown>,
      params.invokerKeyPair,
      vmId,
      'capabilityInvocation',
      this.crypto
    )

    return { ...inv, proof }
  }

  async verifyInvocation(
    invocation: Invocation,
    capabilityChain: Capability[],
    resolverFn: DIDResolver,
    revocationStore?: RevocationStore
  ): Promise<VerificationResult> {
    const checks: VerificationResult['checks'] = []

    // Find the capability being invoked
    const cap = capabilityChain.find((c) => c.id === invocation.capability)
    if (!cap) {
      checks.push({ name: 'capabilityFound', passed: false, error: 'Capability not found in chain' })
      return { valid: false, checks }
    }
    checks.push({ name: 'capabilityFound', passed: true })

    // Check invoker matches
    if (invocation.invoker !== cap.invoker) {
      checks.push({ name: 'invokerMatch', passed: false, error: 'Invoker does not match capability' })
      return { valid: false, checks }
    }
    checks.push({ name: 'invokerMatch', passed: true })

    // Verify invocation proof
    const invokerDoc = await resolverFn(invocation.invoker)
    if (!invokerDoc) {
      checks.push({ name: 'invokerResolution', passed: false, error: 'Could not resolve invoker DID' })
      return { valid: false, checks }
    }

    const invokerPubKey = getPublicKeyFromDocument(invokerDoc, invocation.proof.verificationMethod)
    if (!invokerPubKey) {
      checks.push({ name: 'invokerKey', passed: false, error: 'Invoker key not found' })
      return { valid: false, checks }
    }

    const { proof: invProof, ...invData } = invocation
    const invValid = await verifyProof(invData, invProof, invokerPubKey, this.crypto)
    checks.push({
      name: 'invocationProof',
      passed: invValid,
      error: invValid ? undefined : 'Invalid invocation signature'
    })

    // Check action is allowed
    if (!cap.allowedAction.includes(invocation.action)) {
      checks.push({ name: 'actionAllowed', passed: false, error: 'Action not in allowed actions' })
    } else {
      checks.push({ name: 'actionAllowed', passed: true })
    }

    // Verify capability chain
    for (const chainCap of capabilityChain) {
      // Check revocation
      if (revocationStore && (await revocationStore.isRevoked(chainCap.id))) {
        checks.push({ name: `chainRevocation:${chainCap.id}`, passed: false, error: 'Capability revoked' })
        return { valid: checks.every((c) => c.passed), checks }
      }

      // Check caveats
      if (chainCap.caveats) {
        for (const caveat of chainCap.caveats) {
          if (caveat.type === 'harmony:Expiry') {
            const expired = new Date(caveat.value as string) < new Date()
            checks.push({ name: 'expiryCaveat', passed: !expired, error: expired ? 'Capability expired' : undefined })
          }
        }
      }

      // Verify chain proof
      const delegatorDoc = await resolverFn(chainCap.delegator)
      if (!delegatorDoc) {
        checks.push({ name: `chainResolution:${chainCap.id}`, passed: false, error: 'Could not resolve delegator' })
        continue
      }
      const delegatorKey = getPublicKeyFromDocument(delegatorDoc, chainCap.proof.verificationMethod)
      if (!delegatorKey) {
        checks.push({ name: `chainKey:${chainCap.id}`, passed: false, error: 'Delegator key not found' })
        continue
      }
      const { proof: capProof, ...capData } = chainCap
      const capValid = await verifyProof(capData, capProof, delegatorKey, this.crypto)
      checks.push({
        name: `chainProof:${chainCap.id}`,
        passed: capValid,
        error: capValid ? undefined : 'Invalid capability signature'
      })
    }

    // Verify chain linkage
    for (const chainCap of capabilityChain) {
      if (chainCap.parentCapability) {
        const parent = capabilityChain.find((c) => c.id === chainCap.parentCapability)
        if (!parent) {
          checks.push({
            name: `chainLink:${chainCap.id}`,
            passed: false,
            error: 'Parent capability missing from chain'
          })
        } else {
          checks.push({ name: `chainLink:${chainCap.id}`, passed: true })
        }
      }
    }

    return { valid: checks.every((c) => c.passed), checks }
  }

  async revoke(capabilityId: string, _revokerKeyPair: KeyPair, revocationStore: RevocationStore): Promise<void> {
    await revocationStore.revoke(capabilityId)
  }
}

export function capabilityToQuads(cap: Capability): Quad[] {
  const quads: Quad[] = []
  const g = cap.id
  quads.push({
    subject: cap.id,
    predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
    object: 'https://w3id.org/zcap#Capability',
    graph: g
  })
  quads.push({ subject: cap.id, predicate: 'https://w3id.org/zcap#invoker', object: cap.invoker, graph: g })
  quads.push({ subject: cap.id, predicate: 'https://w3id.org/zcap#delegator', object: cap.delegator, graph: g })
  for (const action of cap.allowedAction) {
    quads.push({ subject: cap.id, predicate: 'https://w3id.org/zcap#allowedAction', object: action, graph: g })
  }
  if (cap.parentCapability) {
    quads.push({
      subject: cap.id,
      predicate: 'https://w3id.org/zcap#parentCapability',
      object: cap.parentCapability,
      graph: g
    })
  }
  return quads
}

export function invocationToQuads(inv: Invocation): Quad[] {
  const quads: Quad[] = []
  const g = `urn:invocation:${inv.capability}`
  quads.push({
    subject: g,
    predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
    object: 'https://w3id.org/zcap#Invocation',
    graph: g
  })
  quads.push({ subject: g, predicate: 'https://w3id.org/zcap#capability', object: inv.capability, graph: g })
  quads.push({ subject: g, predicate: 'https://w3id.org/zcap#invoker', object: inv.invoker, graph: g })
  quads.push({ subject: g, predicate: 'https://w3id.org/zcap#action', object: inv.action, graph: g })
  quads.push({ subject: g, predicate: 'https://w3id.org/zcap#target', object: inv.target, graph: g })
  return quads
}
