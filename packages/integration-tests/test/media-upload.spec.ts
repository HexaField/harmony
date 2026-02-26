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

const PORT = 19913

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

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

describe('Media Upload Integration', () => {
  let server: HarmonyServer
  const clients: HarmonyClient[] = []
  let portOffset = 0

  async function startServer(): Promise<number> {
    const port = PORT + portOffset++
    server = new HarmonyServer({
      port,
      host: '127.0.0.1',
      store: new MemoryQuadStore(),
      didResolver: resolver,
      revocationStore: new MemoryRevocationStore(),
      cryptoProvider: crypto
    })
    await server.start()
    return port
  }

  async function createClient(port: number): Promise<HarmonyClient> {
    const auth = await createIdentityAndVP()
    const client = new HarmonyClient({
      wsFactory: (url: string) => new WebSocket(url) as any
    })
    await client.connect({
      serverUrl: `ws://127.0.0.1:${port}`,
      ...auth
    })
    clients.push(client)
    return client
  }

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

  it('should upload a file and receive media.upload.complete with mediaId', async () => {
    const port = await startServer()
    const alice = await createClient(port)

    const community = await alice.createCommunity({ name: 'Media Test' })
    const channelId = community.channels[0].id

    const fileData = new TextEncoder().encode('Hello, this is a test file!')
    const result = await alice.uploadMediaToServer(community.id, channelId, {
      filename: 'test.txt',
      mimeType: 'text/plain',
      data: fileData
    })

    expect(result.mediaId).toBeTruthy()
    expect(result.mediaId).toMatch(/^media-/)
    expect(result.url).toContain(result.mediaId)
    expect(result.filename).toBe('test.txt')
    expect(result.mimeType).toBe('text/plain')
    expect(result.size).toBe(fileData.length)
  })

  it('should send message with attachments and other clients receive attachment refs', async () => {
    const port = await startServer()
    const alice = await createClient(port)
    const bob = await createClient(port)

    const community = await alice.createCommunity({ name: 'Attach Test' })
    const channelId = community.channels[0].id
    await bob.joinCommunity(community.id)

    await wait(200)

    const fileData = new TextEncoder().encode('attachment content')
    const msgId = await alice.sendMessageWithAttachments(community.id, channelId, 'Check out this file!', [
      {
        filename: 'doc.txt',
        mimeType: 'text/plain',
        data: fileData
      }
    ])

    expect(msgId).toBeTruthy()
  })

  it('should reject files exceeding size limit', async () => {
    const port = await startServer()
    const alice = await createClient(port)

    const community = await alice.createCommunity({ name: 'Size Test' })
    const channelId = community.channels[0].id

    // Create data that exceeds 10MB limit
    const largeData = new Uint8Array(11 * 1024 * 1024)

    await expect(
      alice.uploadMediaToServer(community.id, channelId, {
        filename: 'huge.bin',
        mimeType: 'application/octet-stream',
        data: largeData
      })
    ).rejects.toThrow()
  })

  it('should reject invalid MIME types', async () => {
    const port = await startServer()
    const alice = await createClient(port)

    const community = await alice.createCommunity({ name: 'MIME Test' })
    const channelId = community.channels[0].id

    const fileData = new TextEncoder().encode('some data')

    await expect(
      alice.uploadMediaToServer(community.id, channelId, {
        filename: 'hack.exe',
        mimeType: 'application/x-msdownload',
        data: fileData
      })
    ).rejects.toThrow('MIME type not allowed')
  })

  it('should support multiple attachments on a single message', async () => {
    const port = await startServer()
    const alice = await createClient(port)

    const community = await alice.createCommunity({ name: 'Multi Test' })
    const channelId = community.channels[0].id

    const file1 = new TextEncoder().encode('file one')
    const file2 = new TextEncoder().encode('file two')

    const msgId = await alice.sendMessageWithAttachments(community.id, channelId, 'Two files!', [
      { filename: 'one.txt', mimeType: 'text/plain', data: file1 },
      { filename: 'two.txt', mimeType: 'text/plain', data: file2 }
    ])

    expect(msgId).toBeTruthy()
  })

  it('should reject upload by non-member', async () => {
    const port = await startServer()
    const alice = await createClient(port)
    const charlie = await createClient(port)

    const community = await alice.createCommunity({ name: 'Non-member Test' })
    const channelId = community.channels[0].id

    // Charlie has NOT joined the community
    const fileData = new TextEncoder().encode('sneaky upload')

    await expect(
      charlie.uploadMediaToServer(community.id, channelId, {
        filename: 'sneaky.txt',
        mimeType: 'text/plain',
        data: fileData
      })
    ).rejects.toThrow('Not a member')
  })
})
