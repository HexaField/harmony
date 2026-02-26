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
import type { ProtocolMessage } from '@harmony/protocol'

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
  const vp = await vcService.present({ holderDID: identity.did, holderKeyPair: keyPair, credentials: [vc] })
  return { identity, keyPair, vp }
}

async function getRandomPort(): Promise<number> {
  const { createServer } = await import('node:net')
  return new Promise((resolve) => {
    const s = createServer()
    s.listen(0, () => {
      const addr = s.address()
      const p = typeof addr === 'object' && addr ? addr.port : 0
      s.close(() => resolve(p))
    })
  })
}

const servers: HarmonyServer[] = []
const clients: HarmonyClient[] = []

afterEach(async () => {
  for (const c of clients) {
    try {
      await c.disconnect()
    } catch {}
  }
  clients.length = 0
  for (const s of servers) {
    try {
      await s.stop()
    } catch {}
  }
  servers.length = 0
})

async function startServer() {
  const port = await getRandomPort()
  const store = new MemoryQuadStore()
  const revocationStore = new MemoryRevocationStore()
  const server = new HarmonyServer({ port, host: '127.0.0.1', store, didResolver: resolver, revocationStore })
  await server.start()
  servers.push(server)
  return { server, port }
}

async function connect(port: number, auth?: { identity: Identity; keyPair: KeyPair; vp: VerifiablePresentation }) {
  const a = auth ?? (await createIdentityAndVP())
  const client = new HarmonyClient({ wsFactory: (url: string) => new WebSocket(url) as any })
  await client.connect({ serverUrl: `ws://127.0.0.1:${port}`, identity: a.identity, keyPair: a.keyPair, vp: a.vp })
  clients.push(client)
  return client
}

function rawSend(client: HarmonyClient, msg: ProtocolMessage): void {
  ;(client as any).send(msg)
}
function createMsg(client: HarmonyClient, type: string, payload: any): ProtocolMessage {
  return (client as any).createMessage(type, payload)
}

async function setupCommunity(port: number) {
  const admin = await createIdentityAndVP()
  const member = await createIdentityAndVP()
  const client1 = await connect(port, admin)
  const client2 = await connect(port, member)

  const community = await client1.createCommunity({ name: 'Pin Test' })
  await client2.joinCommunity(community.id)

  return { admin, member, client1, client2, community }
}

describe('Pins', () => {
  it('pin a message → pinned event broadcast', async () => {
    const { port } = await startServer()
    const { client1, client2, community } = await setupCommunity(port)
    const channelId = community.channels[0]?.id

    // channel.message.pinned is not a known client event — it'll be emitted via generic handler
    const pinned = new Promise<any>((resolve) => {
      client2.on('message' as any, (msg: any) => {
        if (msg?.type === 'channel.message.pinned') resolve(msg.payload)
      })
    })
    rawSend(
      client1,
      createMsg(client1, 'channel.pin', {
        communityId: community.id,
        channelId,
        messageId: 'msg-123'
      })
    )

    const result = await pinned
    expect(result.messageId).toBe('msg-123')
    expect(result.pinnedBy).toBeTruthy()
  }, 10000)

  it('unpin a message → unpinned event broadcast', async () => {
    const { port } = await startServer()
    const { client1, client2, community } = await setupCommunity(port)
    const channelId = community.channels[0]?.id

    // Pin first
    const pinned = new Promise<void>((resolve) => {
      client1.on('message' as any, (msg: any) => {
        if (msg?.type === 'channel.message.pinned') resolve()
      })
    })
    rawSend(
      client1,
      createMsg(client1, 'channel.pin', {
        communityId: community.id,
        channelId,
        messageId: 'msg-456'
      })
    )
    await pinned

    // Unpin
    const unpinned = new Promise<any>((resolve) => {
      client2.on('message' as any, (msg: any) => {
        if (msg?.type === 'channel.message.unpinned') resolve(msg.payload)
      })
    })
    rawSend(
      client1,
      createMsg(client1, 'channel.unpin', {
        communityId: community.id,
        channelId,
        messageId: 'msg-456'
      })
    )

    const result = await unpinned
    expect(result.messageId).toBe('msg-456')
  }, 10000)

  it('list pinned messages → returns correct list', async () => {
    const { port } = await startServer()
    const admin = await createIdentityAndVP()
    const client1 = await connect(port, admin)

    const community = await client1.createCommunity({ name: 'List Pins' })
    const channelId = community.channels[0]?.id

    // Pin two messages sequentially
    const pin1 = new Promise<void>((resolve) => {
      const handler = (msg: any) => {
        if (msg?.type === 'channel.message.pinned' && msg?.payload?.messageId === 'msg-a') {
          client1.off('message' as any, handler)
          resolve()
        }
      }
      client1.on('message' as any, handler)
    })
    rawSend(
      client1,
      createMsg(client1, 'channel.pin', {
        communityId: community.id,
        channelId,
        messageId: 'msg-a'
      })
    )
    await pin1

    const pin2 = new Promise<void>((resolve) => {
      const handler = (msg: any) => {
        if (msg?.type === 'channel.message.pinned' && msg?.payload?.messageId === 'msg-b') {
          client1.off('message' as any, handler)
          resolve()
        }
      }
      client1.on('message' as any, handler)
    })
    rawSend(
      client1,
      createMsg(client1, 'channel.pin', {
        communityId: community.id,
        channelId,
        messageId: 'msg-b'
      })
    )
    await pin2

    // List pins
    const pinsResponse = new Promise<any>((resolve) => {
      client1.on('message' as any, (msg: any) => {
        if (msg?.type === 'channel.pins.response') resolve(msg.payload)
      })
    })
    rawSend(
      client1,
      createMsg(client1, 'channel.pins.list', {
        communityId: community.id,
        channelId
      })
    )

    const pins = await pinsResponse
    expect(pins.messageIds).toContain('msg-a')
    expect(pins.messageIds).toContain('msg-b')
    expect(pins.messageIds.length).toBe(2)
  }, 10000)

  it('max 50 pins per channel → error on 51st', async () => {
    const { port } = await startServer()
    const admin = await createIdentityAndVP()
    const client1 = await connect(port, admin)

    const community = await client1.createCommunity({ name: 'Max Pins' })
    const channelId = community.channels[0]?.id

    // Pin 50 messages
    for (let i = 0; i < 50; i++) {
      const p = new Promise<void>((resolve) => {
        const handler = (msg: any) => {
          if (msg?.type === 'channel.message.pinned' && msg?.payload?.messageId === `msg-${i}`) {
            client1.off('message' as any, handler)
            resolve()
          }
        }
        client1.on('message' as any, handler)
      })
      rawSend(
        client1,
        createMsg(client1, 'channel.pin', {
          communityId: community.id,
          channelId,
          messageId: `msg-${i}`
        })
      )
      await p
    }

    // Try 51st
    const errorReceived = new Promise<any>((resolve) => {
      client1.on('error' as any, (payload: any) => {
        if (payload?.code === 'PIN_LIMIT') resolve(payload)
      })
    })
    rawSend(
      client1,
      createMsg(client1, 'channel.pin', {
        communityId: community.id,
        channelId,
        messageId: 'msg-51'
      })
    )

    const error = await errorReceived
    expect(error.code).toBe('PIN_LIMIT')
  }, 30000)

  it('non-admin cannot pin (permission-gated)', async () => {
    const { port } = await startServer()
    const { client2, community } = await setupCommunity(port)
    const channelId = community.channels[0]?.id

    const errorReceived = new Promise<any>((resolve) => {
      client2.on('error' as any, (payload: any) => {
        if (payload?.code === 'FORBIDDEN') resolve(payload)
      })
    })
    rawSend(
      client2,
      createMsg(client2, 'channel.pin', {
        communityId: community.id,
        channelId,
        messageId: 'msg-hacker'
      })
    )

    const error = await errorReceived
    expect(error.code).toBe('FORBIDDEN')
  }, 10000)

  it('pin persists across reconnection (within same server session)', async () => {
    const { port } = await startServer()
    const admin = await createIdentityAndVP()
    const client1 = await connect(port, admin)

    const community = await client1.createCommunity({ name: 'Persist Pins' })
    const channelId = community.channels[0]?.id

    const pinned = new Promise<void>((resolve) => {
      client1.on('message' as any, (msg: any) => {
        if (msg?.type === 'channel.message.pinned') resolve()
      })
    })
    rawSend(
      client1,
      createMsg(client1, 'channel.pin', {
        communityId: community.id,
        channelId,
        messageId: 'persist-msg'
      })
    )
    await pinned

    await client1.disconnect()
    const idx = clients.indexOf(client1)
    if (idx >= 0) clients.splice(idx, 1)

    const client1b = await connect(port, admin)

    const pinsResponse = new Promise<any>((resolve) => {
      client1b.on('message' as any, (msg: any) => {
        if (msg?.type === 'channel.pins.response') resolve(msg.payload)
      })
    })
    rawSend(
      client1b,
      createMsg(client1b, 'channel.pins.list', {
        communityId: community.id,
        channelId
      })
    )

    const pins = await pinsResponse
    expect(pins.messageIds).toContain('persist-msg')
  }, 10000)
})
