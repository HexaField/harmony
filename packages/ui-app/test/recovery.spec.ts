import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  setupRecovery,
  initiateRecovery,
  loadRecoveryConfig,
  clearRecoveryConfig,
  RECOVERY_FEATURES
} from '../src/services/recovery.js'

// Mock localStorage
const store: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => {
    store[key] = value
  },
  removeItem: (key: string) => {
    delete store[key]
  }
})

describe('RECOVERY_FEATURES flags', () => {
  it('setup and initiate are enabled', () => {
    expect(RECOVERY_FEATURES.setup).toBe(true)
    expect(RECOVERY_FEATURES.initiate).toBe(true)
  })

  it('approve, statusCheck, complete are disabled', () => {
    expect(RECOVERY_FEATURES.approve).toBe(false)
    expect(RECOVERY_FEATURES.statusCheck).toBe(false)
    expect(RECOVERY_FEATURES.complete).toBe(false)
  })
})

describe('setupRecovery validation', () => {
  const validIdentity = {
    did: 'did:key:z6MkAlice123',
    document: {
      '@context': [''],
      id: '',
      verificationMethod: [],
      authentication: [],
      assertionMethod: [],
      keyAgreement: []
    } as any,
    credentials: [],
    capabilities: []
  }
  const validKeyPair = {
    publicKey: new Uint8Array(32),
    secretKey: new Uint8Array(64)
  }

  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key]
  })

  it('rejects empty identity', async () => {
    const result = await setupRecovery({
      identity: { did: '', document: {} as any, credentials: [], capabilities: [] },
      trustedDIDs: ['did:key:z6MkBob456'],
      threshold: 1,
      keyPair: validKeyPair
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('No identity')
  })

  it('rejects empty trusted DIDs', async () => {
    const result = await setupRecovery({
      identity: validIdentity,
      trustedDIDs: [],
      threshold: 1,
      keyPair: validKeyPair
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('At least one trusted DID')
  })

  it('rejects invalid DID format', async () => {
    const result = await setupRecovery({
      identity: validIdentity,
      trustedDIDs: ['not-a-did'],
      threshold: 1,
      keyPair: validKeyPair
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('Invalid DID format')
  })

  it('rejects duplicate trusted DIDs', async () => {
    const result = await setupRecovery({
      identity: validIdentity,
      trustedDIDs: ['did:key:z6MkBob456', 'did:key:z6MkBob456'],
      threshold: 1,
      keyPair: validKeyPair
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('Duplicate')
  })

  it('rejects self as trusted DID', async () => {
    const result = await setupRecovery({
      identity: validIdentity,
      trustedDIDs: ['did:key:z6MkAlice123'],
      threshold: 1,
      keyPair: validKeyPair
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('yourself')
  })

  it('rejects threshold < 1', async () => {
    const result = await setupRecovery({
      identity: validIdentity,
      trustedDIDs: ['did:key:z6MkBob456'],
      threshold: 0,
      keyPair: validKeyPair
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('at least 1')
  })

  it('rejects threshold > trusted DIDs count', async () => {
    const result = await setupRecovery({
      identity: validIdentity,
      trustedDIDs: ['did:key:z6MkBob456'],
      threshold: 3,
      keyPair: validKeyPair
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('cannot exceed')
  })

  it('succeeds with valid params and persists config', async () => {
    const result = await setupRecovery({
      identity: validIdentity,
      trustedDIDs: ['did:key:z6MkBob456', 'did:key:z6MkCharlie789'],
      threshold: 2,
      keyPair: validKeyPair
    })
    expect(result.ok).toBe(true)
    expect(result.data).toBeDefined()
    expect(result.data!.trustedDIDs).toEqual(['did:key:z6MkBob456', 'did:key:z6MkCharlie789'])
    expect(result.data!.threshold).toBe(2)
    expect(result.data!.configuredBy).toBe('did:key:z6MkAlice123')

    // Verify persistence
    const loaded = loadRecoveryConfig()
    expect(loaded).toBeDefined()
    expect(loaded!.threshold).toBe(2)
  })
})

describe('loadRecoveryConfig', () => {
  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key]
  })

  it('returns null when no config stored', () => {
    expect(loadRecoveryConfig()).toBeNull()
  })

  it('returns config when stored', () => {
    store['harmony:recovery:config'] = JSON.stringify({
      trustedDIDs: ['did:key:z6MkBob'],
      threshold: 1,
      configuredBy: 'did:key:z6MkAlice',
      configuredAt: '2026-03-01'
    })
    const config = loadRecoveryConfig()
    expect(config).toBeDefined()
    expect(config!.threshold).toBe(1)
  })

  it('returns null on corrupt data', () => {
    store['harmony:recovery:config'] = 'not json'
    expect(loadRecoveryConfig()).toBeNull()
  })
})

describe('clearRecoveryConfig', () => {
  it('removes stored config', () => {
    store['harmony:recovery:config'] = '{"threshold":1}'
    clearRecoveryConfig()
    expect(store['harmony:recovery:config']).toBeUndefined()
  })
})

describe('initiateRecovery', () => {
  it('rejects invalid DID format', async () => {
    const result = await initiateRecovery({
      claimedDID: 'bad-did',
      recovererDID: 'did:key:z6MkRecoverer'
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('Invalid DID')
  })

  it('succeeds with valid DID and returns request ID', async () => {
    const result = await initiateRecovery({
      claimedDID: 'did:key:z6MkAlice123',
      recovererDID: 'did:key:z6MkRecoverer'
    })
    expect(result.ok).toBe(true)
    expect(result.data).toBeDefined()
    expect(result.data!.requestId).toMatch(/^recovery:/)
  })
})
