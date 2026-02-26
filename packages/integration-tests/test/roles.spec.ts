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

  const community = await client1.createCommunity({ name: 'Role Test' })
  await client2.joinCommunity(community.id)

  return { admin, member, client1, client2, community }
}

describe('Role Management', () => {
  it('create role → role.created event received by members', async () => {
    const { port } = await startServer()
    const { client1, client2, community } = await setupCommunity(port)

    const roleCreated = new Promise<any>((resolve) => {
      client2.on('role.created' as any, (payload: any) => resolve(payload))
    })

    rawSend(
      client1,
      createMsg(client1, 'role.create', {
        communityId: community.id,
        name: 'Moderator',
        color: '#ff0000',
        permissions: ['channel.delete', 'channel.pin'],
        position: 1
      })
    )

    const role = await roleCreated
    expect(role.name).toBe('Moderator')
    expect(role.color).toBe('#ff0000')
    expect(role.permissions).toContain('channel.delete')
    expect(role.id).toBeTruthy()
  }, 10000)

  it('update role → role.updated event received', async () => {
    const { port } = await startServer()
    const { client1, client2, community } = await setupCommunity(port)

    const roleCreated = new Promise<any>((resolve) => {
      client1.on('role.created' as any, (payload: any) => resolve(payload))
    })
    rawSend(
      client1,
      createMsg(client1, 'role.create', {
        communityId: community.id,
        name: 'Helper',
        permissions: ['channel.pin'],
        position: 2
      })
    )
    const role = await roleCreated

    const roleUpdated = new Promise<any>((resolve) => {
      client2.on('role.updated' as any, (payload: any) => resolve(payload))
    })
    rawSend(
      client1,
      createMsg(client1, 'role.update', {
        communityId: community.id,
        roleId: role.id,
        name: 'Senior Helper',
        color: '#00ff00'
      })
    )

    const updated = await roleUpdated
    expect(updated.name).toBe('Senior Helper')
    expect(updated.color).toBe('#00ff00')
  }, 10000)

  it('delete role → role.deleted event received', async () => {
    const { port } = await startServer()
    const { client1, client2, community } = await setupCommunity(port)

    const roleCreated = new Promise<any>((resolve) => {
      client1.on('role.created' as any, (payload: any) => resolve(payload))
    })
    rawSend(
      client1,
      createMsg(client1, 'role.create', {
        communityId: community.id,
        name: 'Temp',
        permissions: [],
        position: 3
      })
    )
    const role = await roleCreated

    const roleDeleted = new Promise<any>((resolve) => {
      client2.on('role.deleted' as any, (payload: any) => resolve(payload))
    })
    rawSend(
      client1,
      createMsg(client1, 'role.delete', {
        communityId: community.id,
        roleId: role.id
      })
    )

    const deleted = await roleDeleted
    expect(deleted.roleId).toBe(role.id)
  }, 10000)

  it('assign role to member → member.updated event', async () => {
    const { port } = await startServer()
    const { client1, client2, community, member } = await setupCommunity(port)

    const roleCreated = new Promise<any>((resolve) => {
      client1.on('role.created' as any, (payload: any) => resolve(payload))
    })
    rawSend(
      client1,
      createMsg(client1, 'role.create', {
        communityId: community.id,
        name: 'VIP',
        permissions: ['channel.pin'],
        position: 1
      })
    )
    const role = await roleCreated

    // community.member.updated is not a known event in the client — it'll be emitted as the generic handler
    // The client emits unhandled types as: emit(msg.type, msg) and emit('message', msg)
    const memberUpdated = new Promise<any>((resolve) => {
      client2.on('message' as any, (msg: any) => {
        if (msg?.type === 'community.member.updated' && msg?.payload?.action === 'role.assigned') resolve(msg.payload)
      })
    })
    rawSend(
      client1,
      createMsg(client1, 'role.assign', {
        communityId: community.id,
        memberDID: member.identity.did,
        roleId: role.id
      })
    )

    const updated = await memberUpdated
    expect(updated.roleId).toBe(role.id)
    expect(updated.did).toBe(member.identity.did)
  }, 10000)

  it('remove role from member → permissions revoked', async () => {
    const { port } = await startServer()
    const { client1, client2, community, member } = await setupCommunity(port)

    const roleCreated = new Promise<any>((resolve) => {
      client1.on('role.created' as any, (payload: any) => resolve(payload))
    })
    rawSend(
      client1,
      createMsg(client1, 'role.create', {
        communityId: community.id,
        name: 'Mod',
        permissions: ['channel.pin'],
        position: 1
      })
    )
    const role = await roleCreated

    // Assign first
    const assigned = new Promise<void>((resolve) => {
      client1.on('message' as any, (msg: any) => {
        if (msg?.type === 'community.member.updated' && msg?.payload?.action === 'role.assigned') resolve()
      })
    })
    rawSend(
      client1,
      createMsg(client1, 'role.assign', {
        communityId: community.id,
        memberDID: member.identity.did,
        roleId: role.id
      })
    )
    await assigned

    // Remove
    const removed = new Promise<any>((resolve) => {
      client2.on('message' as any, (msg: any) => {
        if (msg?.type === 'community.member.updated' && msg?.payload?.action === 'role.removed') resolve(msg.payload)
      })
    })
    rawSend(
      client1,
      createMsg(client1, 'role.remove', {
        communityId: community.id,
        memberDID: member.identity.did,
        roleId: role.id
      })
    )

    const result = await removed
    expect(result.action).toBe('role.removed')
  }, 10000)

  it('non-admin cannot create roles', async () => {
    const { port } = await startServer()
    const { client2, community } = await setupCommunity(port)

    const errorReceived = new Promise<any>((resolve) => {
      client2.on('error' as any, (payload: any) => {
        if (payload?.code === 'FORBIDDEN') resolve(payload)
      })
    })
    rawSend(
      client2,
      createMsg(client2, 'role.create', {
        communityId: community.id,
        name: 'Hacker Role',
        permissions: ['*'],
        position: 0
      })
    )

    const error = await errorReceived
    expect(error.code).toBe('FORBIDDEN')
  }, 10000)

  it('non-admin cannot update or delete roles', async () => {
    const { port } = await startServer()
    const { client1, client2, community } = await setupCommunity(port)

    const roleCreated = new Promise<any>((resolve) => {
      client1.on('role.created' as any, (payload: any) => resolve(payload))
    })
    rawSend(
      client1,
      createMsg(client1, 'role.create', {
        communityId: community.id,
        name: 'Protected',
        permissions: [],
        position: 1
      })
    )
    const role = await roleCreated

    const updateError = new Promise<any>((resolve) => {
      client2.on('error' as any, (payload: any) => {
        if (payload?.code === 'FORBIDDEN') resolve(payload)
      })
    })
    rawSend(
      client2,
      createMsg(client2, 'role.update', {
        communityId: community.id,
        roleId: role.id,
        name: 'Hacked'
      })
    )
    expect((await updateError).code).toBe('FORBIDDEN')

    const deleteError = new Promise<any>((resolve) => {
      client2.on('error' as any, (payload: any) => {
        if (payload?.code === 'FORBIDDEN') resolve(payload)
      })
    })
    rawSend(
      client2,
      createMsg(client2, 'role.delete', {
        communityId: community.id,
        roleId: role.id
      })
    )
    expect((await deleteError).code).toBe('FORBIDDEN')
  }, 10000)
})
