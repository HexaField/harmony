import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import { WebSocket } from 'ws'
import { createCryptoProvider } from '@harmony/crypto'
import { DIDKeyProvider } from '@harmony/did'
import { IdentityManager } from '@harmony/identity'
import { VCService, MemoryRevocationStore } from '@harmony/vc'
import type { DIDResolver } from '@harmony/vc'
import { HarmonyServer } from '@harmony/server'
import { HarmonyClient } from '@harmony/client'
import { MemoryQuadStore } from '@harmony/quads'
import { VoiceClient } from '@harmony/voice'

const crypto = createCryptoProvider()
const didProvider = new DIDKeyProvider(crypto)
const identityMgr = new IdentityManager(crypto)
const vcService = new VCService(crypto)

const resolver: DIDResolver = (did: string) => didProvider.resolve(did)

async function createIdentityAndVP() {
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

const TEST_PORT = 19915
let server: HarmonyServer
const clients: HarmonyClient[] = []

async function makeClient(): Promise<HarmonyClient> {
  const auth = await createIdentityAndVP()
  const voiceClient = new VoiceClient({
    mediaProvider: {
      getUserMedia: async () =>
        ({
          getTracks: () => [{ stop: () => {}, kind: 'video' }],
          getAudioTracks: () => [{ stop: () => {}, kind: 'audio' }],
          getVideoTracks: () => [{ stop: () => {}, kind: 'video' }]
        }) as unknown as MediaStream,
      getDisplayMedia: async () =>
        ({
          getTracks: () => [{ stop: () => {}, kind: 'video', onended: null }],
          getAudioTracks: () => [],
          getVideoTracks: () => [{ stop: () => {}, kind: 'video', onended: null }]
        }) as unknown as MediaStream
    }
  })
  const client = new HarmonyClient({
    wsFactory: (url: string) => new WebSocket(url) as any,
    voiceClient
  })
  await client.connect({
    serverUrl: `ws://127.0.0.1:${TEST_PORT}`,
    identity: auth.identity,
    keyPair: auth.keyPair,
    vp: auth.vp
  })
  clients.push(client)
  return client
}

beforeAll(async () => {
  const store = new MemoryQuadStore()
  const revocationStore = new MemoryRevocationStore()
  server = new HarmonyServer({
    port: TEST_PORT,
    host: '127.0.0.1',
    store,
    didResolver: resolver,
    revocationStore
  })
  await server.start()
})

afterAll(async () => {
  for (const c of clients) {
    try {
      await c.disconnect()
    } catch {
      /* ignore */
    }
  }
  clients.length = 0
  try {
    await server.stop()
  } catch {
    /* ignore */
  }
})

describe('Voice Integration', () => {
  it('client joins voice channel and receives connection', async () => {
    const client = await makeClient()
    const community = await client.createCommunity({ name: 'voice-test-1' })
    const channelId = community.channels[0]?.id ?? 'general'

    const conn = await client.joinVoice(channelId)
    expect(conn).toBeTruthy()
    expect(conn.roomId).toBe(channelId)

    await client.leaveVoice()
    expect(client.getVoiceConnection()).toBeNull()
  })

  it('two clients join voice — both connected', async () => {
    const client1 = await makeClient()
    const client2 = await makeClient()

    const community = await client1.createCommunity({ name: 'voice-test-2' })
    const communityId = community.id
    await client2.joinCommunity(communityId)

    const channelId = community.channels[0]?.id ?? 'general'

    await client1.joinVoice(channelId)
    await client2.joinVoice(channelId)

    expect(client1.getVoiceConnection()).toBeTruthy()
    expect(client2.getVoiceConnection()).toBeTruthy()

    await client1.leaveVoice()
    await client2.leaveVoice()
  })

  it('client leaving voice cleans up connection', async () => {
    const client1 = await makeClient()
    const client2 = await makeClient()

    const community = await client1.createCommunity({ name: 'voice-test-3' })
    await client2.joinCommunity(community.id)

    const channelId = community.channels[0]?.id ?? 'general'

    await client1.joinVoice(channelId)
    await client2.joinVoice(channelId)

    await client1.leaveVoice()
    expect(client1.getVoiceConnection()).toBeNull()
    expect(client2.getVoiceConnection()).toBeTruthy()

    await client2.leaveVoice()
  })

  it('voice connection supports audio toggle', async () => {
    const client = await makeClient()
    const community = await client.createCommunity({ name: 'voice-test-4' })
    const channelId = community.channels[0]?.id ?? 'general'

    const conn = await client.joinVoice(channelId)
    expect(conn.localAudioEnabled).toBe(true)

    await conn.toggleAudio()
    expect(conn.localAudioEnabled).toBe(false)

    await conn.toggleAudio()
    expect(conn.localAudioEnabled).toBe(true)

    await client.leaveVoice()
  })

  it('voice connection supports video toggle', async () => {
    const client = await makeClient()
    const community = await client.createCommunity({ name: 'voice-test-5' })
    const channelId = community.channels[0]?.id ?? 'general'

    const conn = await client.joinVoice(channelId)
    expect(conn.localVideoEnabled).toBe(false)

    await conn.toggleVideo()
    expect(conn.localVideoEnabled).toBe(true)

    await client.leaveVoice()
  })
})
