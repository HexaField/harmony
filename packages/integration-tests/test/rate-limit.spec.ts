import { describe, it, expect, afterEach } from 'vitest'
import { WebSocket } from 'ws'
import { createCryptoProvider } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import { IdentityManager } from '@harmony/identity'
import { VCService, MemoryRevocationStore } from '@harmony/vc'
import type { DIDResolver } from '@harmony/vc'
import { HarmonyServer } from '@harmony/server'
import { HarmonyClient } from '@harmony/client'
import { MemoryQuadStore } from '@harmony/quads'
import type { KeyPair } from '@harmony/crypto'
import type { Identity } from '@harmony/identity'
import type { VerifiablePresentation } from '@harmony/vc'

const PORT = 19919

const crypto = createCryptoProvider()
const didProvider = new DIDKeyProvider(crypto)
const identityMgr = new IdentityManager(crypto)
const vcService = new VCService(crypto)

const resolver: DIDResolver = (did: string) => didProvider.resolve(did)

async function createIdentityAndVP(): Promise<{
  identity: Identity
  keyPair: KeyPair
  vp: VerifiablePresentation
}> {
  const { identity, keyPair } = await identityMgr.create()
  const vc = await vcService.issue({
    issuerDID: identity.did,
    issuerKeyPair: keyPair,
    subjectDID: identity.did,
    type: 'HarmonyAuthCredential',
    claims: { auth: true }
  })
  const vp = await vcService.present({
    holderDID: identity.did,
    holderKeyPair: keyPair,
    credentials: [vc]
  })
  return { identity, keyPair, vp }
}

function wsFactory(url: string) {
  return new WebSocket(url) as any
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

describe('Rate Limiting (10.6)', () => {
  let server: HarmonyServer
  const clients: HarmonyClient[] = []

  afterEach(async () => {
    for (const c of clients) {
      try {
        await c.disconnect()
      } catch {
        /* */
      }
    }
    clients.length = 0
    if (server) await server.stop()
  })

  async function createClient(): Promise<HarmonyClient> {
    const { identity, keyPair, vp } = await createIdentityAndVP()
    const client = new HarmonyClient({ wsFactory })
    await client.connect({
      serverUrl: `ws://localhost:${PORT}`,
      identity,
      keyPair,
      vp
    })
    clients.push(client)
    return client
  }

  it('server rejects messages exceeding rate limit', async () => {
    server = new HarmonyServer({
      port: PORT,
      store: new MemoryQuadStore(),
      didResolver: resolver,
      revocationStore: new MemoryRevocationStore(),
      cryptoProvider: crypto,
      rateLimit: {
        windowMs: 2000,
        maxMessages: 5
      }
    })
    await server.start()

    const alice = await createClient()
    const community = await alice.createCommunity({ name: 'Rate Limit Test' })
    const channelId = community.defaultChannelId || community.channels?.[0]?.id

    // Collect error events
    const errors: any[] = []
    alice.on('error' as any, (...args: unknown[]) => {
      errors.push(args[0])
    })

    // Send messages rapidly — first 5 should succeed, rest should be rate limited
    // Note: createCommunity and joinCommunity also count as messages
    // Send 12 messages rapidly to ensure we exceed the limit
    const results: Array<{ ok: boolean; error?: any }> = []
    for (let i = 0; i < 12; i++) {
      try {
        if (channelId) {
          await alice.sendMessage(community.id, channelId, `Rapid message ${i}`)
        }
        results.push({ ok: true })
      } catch (err) {
        results.push({ ok: false, error: err })
      }
    }

    await wait(500)

    // Some messages should have been rate-limited
    // Either we get errors back via the error event, or some sends fail
    // The server sends back an error message with code RATE_LIMITED
    const totalAttempts = results.length
    expect(totalAttempts).toBe(12)

    // Verify rate limiting kicked in: either errors array has items
    // or not all messages were delivered
    // The server silently drops rate-limited messages by returning an error
    // and not processing them further
    expect(errors.length > 0 || results.some((r) => !r.ok)).toBe(true)
  })

  it('rate limit resets after window expires', async () => {
    server = new HarmonyServer({
      port: PORT,
      store: new MemoryQuadStore(),
      didResolver: resolver,
      revocationStore: new MemoryRevocationStore(),
      cryptoProvider: crypto,
      rateLimit: {
        windowMs: 500,
        maxMessages: 3
      }
    })
    await server.start()

    const alice = await createClient()
    const community = await alice.createCommunity({ name: 'Rate Reset Test' })
    const channelId = community.defaultChannelId || community.channels?.[0]?.id
    if (!channelId) return

    // Send 3 messages (at limit)
    for (let i = 0; i < 3; i++) {
      await alice.sendMessage(community.id, channelId, `Batch 1 msg ${i}`)
    }

    // Wait for window to expire
    await wait(600)

    // Should be able to send again
    let succeeded = false
    try {
      await alice.sendMessage(community.id, channelId, 'After window reset')
      succeeded = true
    } catch {
      succeeded = false
    }

    // After window reset, sending should work
    expect(succeeded).toBe(true)
  })
})
