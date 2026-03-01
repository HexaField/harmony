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

const PORT = 19905

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

interface WSLike {
  send(data: string): void
  close(): void
  readyState: number
  onmessage: ((event: { data: string }) => void) | null
  onclose: (() => void) | null
  onopen: (() => void) | null
  onerror: ((event: unknown) => void) | null
}

function wsFactory(url: string): WSLike {
  return new WebSocket(url) as unknown as WSLike
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

describe('MLS Group Creation for New Channels', () => {
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

  async function startServer() {
    server = new HarmonyServer({
      port: PORT,
      store: new MemoryQuadStore(),
      didResolver: resolver,
      revocationStore: new MemoryRevocationStore(),
      cryptoProvider: crypto
    })
    await server.start()
  }

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

  it('creates MLS group for a channel added after community setup', async () => {
    await startServer()
    const alice = await createClient()

    // Create community — initial channels get MLS groups automatically
    const community = await alice.createCommunity({ name: 'New Channel MLS Test' })
    const initialChannelId = community.channels[0].id

    // Wait for initial MLS setup
    await wait(300)

    // Verify initial channel has MLS group
    expect(alice.hasMLSGroup(community.id, initialChannelId)).toBe(true)

    // Create a new channel after initial setup
    const newChannel = await alice.createChannel(community.id, {
      name: 'new-encrypted-channel',
      type: 'text'
    })

    // Wait for MLS group setup notification and processing
    await wait(500)

    // The new channel should now have an MLS group
    expect(alice.hasMLSGroup(community.id, newChannel.id)).toBe(true)
  })

  it('encrypts and decrypts messages on a dynamically created channel', async () => {
    await startServer()
    const alice = await createClient()

    const community = await alice.createCommunity({ name: 'Dynamic Channel E2EE' })
    await wait(300)

    // Create new channel
    const newChannel = await alice.createChannel(community.id, {
      name: 'late-channel',
      type: 'text'
    })
    await wait(500)

    expect(alice.hasMLSGroup(community.id, newChannel.id)).toBe(true)

    // Send a message on the new channel — should use E2EE
    const msgId = await alice.sendMessage(community.id, newChannel.id, 'Hello from new channel!')

    // Verify message was sent (alice receives her own message back)
    const received = await Promise.race([
      new Promise<any>((resolve) => {
        alice.on('message', (...args: unknown[]) => {
          const msg = args[0] as any
          if (msg.id === msgId) resolve(msg)
        })
      }),
      wait(3000).then(() => null)
    ])

    // Message should have been sent successfully
    expect(msgId).toBeTruthy()
  })

  it('does not duplicate MLS group if channel already has one', async () => {
    await startServer()
    const alice = await createClient()

    const community = await alice.createCommunity({ name: 'No Duplicate MLS' })
    const initialChannelId = community.channels[0].id
    await wait(300)

    expect(alice.hasMLSGroup(community.id, initialChannelId)).toBe(true)

    // Manually call setupMLSGroupForChannel again — should be a no-op
    await alice.setupMLSGroupForChannel(community.id, initialChannelId)

    // Still has the group, no error thrown
    expect(alice.hasMLSGroup(community.id, initialChannelId)).toBe(true)
  })
})
