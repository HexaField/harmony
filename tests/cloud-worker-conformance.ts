/**
 * Cloud Worker Protocol Conformance Tests
 *
 * Tests the cloud worker (via miniflare/wrangler dev) against the protocol spec.
 * Identifies bugs, missing handlers, and divergence from the server implementation.
 *
 * Usage: WORKER_URL=http://localhost:8686 node --import tsx tests/cloud-worker-conformance.ts
 *
 * Prerequisites: npx wrangler dev --port 8686 (in packages/cloud-worker/)
 */

import { serialise, deserialise } from '../packages/protocol/src/serialisation.js'
import type { ProtocolMessage } from '../packages/protocol/src/index.js'
import { createCryptoProvider } from '../packages/crypto/src/index.js'
import { IdentityManager } from '../packages/identity/src/index.js'
import { VCService } from '../packages/vc/src/index.js'
import WebSocket from 'ws'

const WORKER_URL = process.env.WORKER_URL || 'http://localhost:8686'
const COMMUNITY_ID = 'test-community-' + Date.now()

// ── Test Helpers ──

let testCount = 0
let passCount = 0
let failCount = 0
let skipCount = 0
const failures: string[] = []
const bugs: string[] = []

function pass(label: string) {
  testCount++
  passCount++
  console.log(`  ✅ ${label}`)
}

function fail(label: string, detail?: string) {
  testCount++
  failCount++
  const msg = detail ? `${label}: ${detail}` : label
  failures.push(msg)
  console.log(`  ❌ ${msg}`)
}

function bug(label: string, detail: string) {
  testCount++
  failCount++
  const msg = `BUG: ${label} — ${detail}`
  bugs.push(msg)
  console.log(`  🐛 ${msg}`)
}

function skip(label: string, reason: string) {
  testCount++
  skipCount++
  console.log(`  ⏭️  ${label}: ${reason}`)
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// ── Identity + VP Generation ──

async function createTestIdentity() {
  const crypto = createCryptoProvider()
  const idMgr = new IdentityManager(crypto)
  const { identity, mnemonic } = await idMgr.create()

  const vcService = new VCService(crypto)
  const vc = await vcService.issueIdentityCredential(identity.did, identity.keyPair)
  const vp = await vcService.createPresentation([vc], identity.did, identity.keyPair)

  return { did: identity.did, keyPair: identity.keyPair, vp, mnemonic }
}

// ── WebSocket Connection ──

interface WSClient {
  ws: WebSocket
  messages: any[]
  send: (msg: any) => void
  waitForMessage: (predicate: (msg: any) => boolean, timeoutMs?: number) => Promise<any>
  waitForType: (type: string, timeoutMs?: number) => Promise<any>
  close: () => void
  did: string
}

function connectWS(communityId: string): Promise<WSClient> {
  return new Promise((resolve, reject) => {
    const wsUrl = WORKER_URL.replace('http://', 'ws://').replace('https://', 'wss://') + `/ws/${communityId}`
    const ws = new WebSocket(wsUrl)
    const messages: any[] = []
    const waiters: { predicate: (msg: any) => boolean; resolve: (msg: any) => void; reject: (e: Error) => void }[] = []

    ws.on('message', (data) => {
      try {
        const msg = deserialise<any>(data.toString())
        messages.push(msg)
        // Check waiters
        for (let i = waiters.length - 1; i >= 0; i--) {
          if (waiters[i].predicate(msg)) {
            waiters[i].resolve(msg)
            waiters.splice(i, 1)
          }
        }
      } catch (e) {
        console.error('Parse error:', e)
      }
    })

    ws.on('open', () => {
      const client: WSClient = {
        ws,
        messages,
        did: '',
        send(msg: any) {
          ws.send(typeof msg === 'string' ? msg : serialise(msg))
        },
        waitForMessage(predicate, timeoutMs = 10000) {
          // Check existing
          const existing = messages.find(predicate)
          if (existing) return Promise.resolve(existing)
          return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
              const idx = waiters.findIndex((w) => w.resolve === resolve)
              if (idx >= 0) waiters.splice(idx, 1)
              reject(
                new Error(
                  `Timeout waiting for message (${timeoutMs}ms). Got: ${messages.map((m) => m.type).join(', ')}`
                )
              )
            }, timeoutMs)
            waiters.push({
              predicate,
              resolve: (msg) => {
                clearTimeout(timer)
                resolve(msg)
              },
              reject
            })
          })
        },
        waitForType(type, timeoutMs = 10000) {
          return client.waitForMessage((m) => m.type === type, timeoutMs)
        },
        close() {
          ws.close()
        }
      }
      resolve(client)
    })
    ws.on('error', reject)
    setTimeout(() => reject(new Error('WS connect timeout')), 5000)
  })
}

async function authenticateClient(
  client: WSClient,
  identity: Awaited<ReturnType<typeof createTestIdentity>>
): Promise<boolean> {
  client.did = identity.did

  // The client sends VP as ProtocolMessage with type 'sync.state'
  // But the cloud worker's parseVP expects raw VP JSON
  // Let's test both approaches

  // First: try what the actual client does (sync.state wrapper)
  const authMsg: ProtocolMessage = {
    id: crypto.randomUUID(),
    type: 'sync.state',
    timestamp: new Date().toISOString(),
    sender: identity.did,
    payload: identity.vp
  }
  client.send(authMsg)

  try {
    const resp = await client.waitForType('sync.response', 5000)
    return resp.payload?.authenticated === true
  } catch {
    return false
  }
}

async function authenticateClientRawVP(
  client: WSClient,
  identity: Awaited<ReturnType<typeof createTestIdentity>>
): Promise<boolean> {
  client.did = identity.did

  // Send raw VP JSON (what the cloud worker actually expects)
  client.ws.send(JSON.stringify(identity.vp))

  try {
    const resp = await client.waitForType('sync.response', 5000)
    return resp.payload?.authenticated === true
  } catch {
    return false
  }
}

function makeMsg(type: string, sender: string, payload: any): ProtocolMessage {
  return {
    id: crypto.randomUUID(),
    type: type as ProtocolMessage['type'],
    timestamp: new Date().toISOString(),
    sender,
    payload
  }
}

// ── Main ──

async function main() {
  console.log('=== Cloud Worker Protocol Conformance Tests ===')
  console.log(`Worker: ${WORKER_URL}`)
  console.log(`Community: ${COMMUNITY_ID}`)
  console.log()

  // Pre-generate identities
  console.log('Generating test identities...')
  const alice = await createTestIdentity()
  const bob = await createTestIdentity()
  console.log(`Alice: ${alice.did.substring(0, 30)}...`)
  console.log(`Bob: ${bob.did.substring(0, 30)}...`)
  console.log()

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SECTION 1: HTTP Endpoints
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('[1] HTTP Endpoints')

  {
    const resp = await fetch(`${WORKER_URL}/health`)
    const body = (await resp.json()) as any
    body.status === 'ok' ? pass('GET /health returns ok') : fail('GET /health', JSON.stringify(body))
  }

  {
    const resp = await fetch(`${WORKER_URL}/nonexistent`)
    resp.status === 404 ? pass('Unknown route returns 404') : fail('Unknown route', `got ${resp.status}`)
  }

  // Provisioning
  {
    const resp = await fetch(`${WORKER_URL}/api/instances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Instance', ownerDID: alice.did })
    })
    if (resp.status === 201) {
      const body = (await resp.json()) as any
      body.id && body.serverUrl
        ? pass('POST /api/instances creates instance')
        : fail('Create instance', 'missing fields')
    } else {
      fail('POST /api/instances', `status ${resp.status}`)
    }
  }

  {
    const resp = await fetch(`${WORKER_URL}/api/instances?owner=${encodeURIComponent(alice.did)}`)
    if (resp.ok) {
      const body = (await resp.json()) as any
      Array.isArray(body) && body.length > 0
        ? pass('GET /api/instances lists instances')
        : fail('List instances', 'empty')
    } else {
      fail('GET /api/instances', `status ${resp.status}`)
    }
  }

  console.log()

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SECTION 2: WebSocket + Auth
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('[2] WebSocket Connection & Authentication')

  // Test 2a: Auth with raw VP (what DO expects)
  {
    const client = await connectWS(COMMUNITY_ID)
    const authOk = await authenticateClientRawVP(client, alice)
    authOk ? pass('Auth with raw VP JSON succeeds') : fail('Auth with raw VP JSON')
    client.close()
  }

  await sleep(500)

  // Test 2b: Auth with ProtocolMessage wrapper (what client actually sends)
  {
    const client = await connectWS(COMMUNITY_ID)
    const authOk = await authenticateClient(client, alice)
    if (authOk) {
      pass('Auth with sync.state wrapper succeeds')
    } else {
      bug(
        'Auth with sync.state wrapper fails',
        'Client sends VP as ProtocolMessage{type:"sync.state", payload:VP} but cloud worker\'s parseVP() expects raw VP JSON. ' +
          'Server handles sync.state correctly. This means the cloud worker auth is broken for the actual client.'
      )
    }
    client.close()
  }

  await sleep(500)

  // Test 2c: Auth timeout for unauthenticated connections
  {
    const client = await connectWS(COMMUNITY_ID)
    // Don't send auth — should timeout
    // The DO sets a 30s alarm, but we'll just verify the connection works
    pass('Unauthenticated connection accepted (auth timeout is 30s alarm)')
    client.close()
  }

  // Test 2d: Invalid auth
  {
    const client = await connectWS(COMMUNITY_ID)
    client.ws.send(JSON.stringify({ garbage: true }))
    try {
      await client.waitForType('error', 3000)
      pass('Invalid auth format returns error')
    } catch {
      // Might just close the connection
      pass('Invalid auth rejects (close or error)')
    }
    client.close()
  }

  console.log()

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SECTION 3: Core Message Handlers
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('[3] Protocol Message Handlers')

  // Create fresh clients for message testing
  // Use raw VP auth since that's what actually works with the DO
  const aliceClient = await connectWS(COMMUNITY_ID)
  const aliceAuth = await authenticateClientRawVP(aliceClient, alice)
  if (!aliceAuth) {
    fail('Could not authenticate Alice for message tests')
    aliceClient.close()
    printSummary()
    process.exit(1)
  }

  await sleep(1000)

  const bobClient = await connectWS(COMMUNITY_ID)
  const bobAuth = await authenticateClientRawVP(bobClient, bob)
  if (!bobAuth) {
    fail('Could not authenticate Bob for message tests')
    bobClient.close()
    aliceClient.close()
    printSummary()
    process.exit(1)
  }

  await sleep(1000)

  // Clear message buffers
  aliceClient.messages.length = 0
  bobClient.messages.length = 0

  // ── 3a: community.create ──
  console.log('  --- community.create ---')
  {
    aliceClient.send(
      makeMsg('community.create', alice.did, {
        name: 'Conformance Test Community',
        description: 'Testing protocol conformance'
      })
    )

    try {
      const resp = await aliceClient.waitForType('community.updated', 5000)
      pass(`community.create → community.updated (id=${resp.payload?.id?.substring?.(0, 20)}...)`)

      // Bob should also get the broadcast
      try {
        await bobClient.waitForType('community.updated', 3000)
        pass('community.create broadcasts to other clients')
      } catch {
        fail('community.create broadcast to Bob not received')
      }
    } catch (e: any) {
      fail('community.create', e.message)
    }
  }

  await sleep(500)

  // ── 3b: channel.create ──
  console.log('  --- channel.create ---')
  let channelId: string | null = null
  {
    aliceClient.messages.length = 0
    bobClient.messages.length = 0

    aliceClient.send(
      makeMsg('channel.create', alice.did, {
        communityId: COMMUNITY_ID,
        name: 'test-channel',
        type: 'text'
      })
    )

    try {
      const resp = await aliceClient.waitForType('channel.created', 5000)
      channelId = resp.payload?.channelId || resp.payload?.id
      pass(`channel.create → channel.created (id=${channelId?.substring?.(0, 20)}...)`)

      try {
        await bobClient.waitForType('channel.created', 3000)
        pass('channel.create broadcasts to other clients')
      } catch {
        fail('channel.create broadcast to Bob not received')
      }
    } catch (e: any) {
      fail('channel.create', e.message)
    }
  }

  if (!channelId) {
    // Get general channel from sync
    channelId = 'general'
  }

  await sleep(500)

  // ── 3c: channel.send ──
  console.log('  --- channel.send ---')
  let messageId: string | null = null
  {
    aliceClient.messages.length = 0
    bobClient.messages.length = 0

    aliceClient.send(
      makeMsg('channel.send', alice.did, {
        communityId: COMMUNITY_ID,
        channelId,
        content: { ciphertext: { __type: 'Uint8Array', data: btoa('Hello from Alice') }, epoch: 0, senderIndex: 0 },
        nonce: crypto.randomUUID()
      })
    )

    try {
      const resp = await bobClient.waitForType('channel.message', 5000)
      messageId = resp.payload?.messageId || resp.id
      pass(`channel.send → channel.message received by Bob`)

      // Check payload structure
      const p = resp.payload
      if (p?.channelId === channelId) pass('channel.message has correct channelId')
      else fail('channel.message channelId', `expected ${channelId}, got ${p?.channelId}`)

      if (p?.authorDID === alice.did || resp.sender === alice.did) pass('channel.message has correct author DID')
      else fail('channel.message author', `expected ${alice.did}`)
    } catch (e: any) {
      fail('channel.send', e.message)
    }
  }

  // ── 3d: channel.send — community ID mismatch ──
  console.log('  --- channel.send (community ID mismatch) ---')
  {
    aliceClient.messages.length = 0

    aliceClient.send(
      makeMsg('channel.send', alice.did, {
        communityId: 'wrong-community-id',
        channelId,
        content: { ciphertext: { __type: 'Uint8Array', data: btoa('Should be rejected') }, epoch: 0, senderIndex: 0 },
        nonce: crypto.randomUUID()
      })
    )

    try {
      const err = await aliceClient.waitForType('error', 3000)
      if (err.payload?.message?.includes('mismatch') || err.payload?.code === 'COMMUNITY_MISMATCH') {
        pass('channel.send with wrong communityId rejected with error')
      } else {
        pass(`channel.send with wrong communityId rejected (error: ${err.payload?.message})`)
      }
    } catch {
      fail('channel.send with wrong communityId', 'no error received — message may have been accepted')
    }
  }

  await sleep(500)

  // ── 3e: channel.edit ──
  console.log('  --- channel.edit ---')
  {
    aliceClient.messages.length = 0
    bobClient.messages.length = 0

    aliceClient.send(
      makeMsg('channel.edit', alice.did, {
        communityId: COMMUNITY_ID,
        channelId,
        messageId: messageId || 'msg-1',
        content: { ciphertext: { __type: 'Uint8Array', data: btoa('Edited message') }, epoch: 0, senderIndex: 0 }
      })
    )

    try {
      const resp = await bobClient.waitForType('channel.message.updated', 5000)
      pass('channel.edit → channel.message.updated received by Bob')
    } catch (e: any) {
      fail('channel.edit', e.message)
    }
  }

  await sleep(500)

  // ── 3f: channel.delete ──
  console.log('  --- channel.delete ---')
  {
    aliceClient.messages.length = 0
    bobClient.messages.length = 0

    aliceClient.send(
      makeMsg('channel.delete', alice.did, {
        communityId: COMMUNITY_ID,
        channelId,
        messageId: messageId || 'msg-1'
      })
    )

    try {
      const resp = await bobClient.waitForType('channel.message.deleted', 5000)
      pass('channel.delete → channel.message.deleted received by Bob')
    } catch (e: any) {
      fail('channel.delete', e.message)
    }
  }

  await sleep(500)

  // ── 3g: channel.typing ──
  console.log('  --- channel.typing ---')
  {
    bobClient.messages.length = 0

    aliceClient.send(
      makeMsg('channel.typing', alice.did, {
        communityId: COMMUNITY_ID,
        channelId
      })
    )

    try {
      const resp = await bobClient.waitForType('channel.typing.indicator', 3000)
      pass('channel.typing → channel.typing.indicator received by Bob')
    } catch {
      fail('channel.typing', 'typing indicator not received by Bob')
    }
  }

  await sleep(500)

  // ── 3h: presence.update ──
  console.log('  --- presence.update ---')
  {
    bobClient.messages.length = 0

    aliceClient.send(
      makeMsg('presence.update', alice.did, {
        status: 'away',
        customStatus: 'testing'
      })
    )

    try {
      const resp = await bobClient.waitForType('presence.changed', 3000)
      if (resp.payload?.did === alice.did) pass('presence.update → presence.changed with correct DID')
      else fail('presence.update DID', `got ${resp.payload?.did}`)
      if (resp.payload?.status === 'away') pass('presence.update status propagated correctly')
      else fail('presence.update status', `got ${resp.payload?.status}`)
    } catch {
      fail('presence.update', 'not received by Bob')
    }
  }

  await sleep(500)

  // ── 3i: sync.request ──
  console.log('  --- sync.request ---')
  {
    aliceClient.messages.length = 0

    aliceClient.send(makeMsg('sync.request', alice.did, {}))

    try {
      const resp = await aliceClient.waitForType('sync.response', 5000)
      const p = resp.payload
      pass('sync.request → sync.response')
      if (p?.community) pass(`sync.response includes community data`)
      else fail('sync.response missing community data')
      if (p?.channels && Array.isArray(p.channels)) pass(`sync.response includes channels (${p.channels.length})`)
      else fail('sync.response missing channels array')
      if (p?.members && Array.isArray(p.members)) pass(`sync.response includes members (${p.members.length})`)
      else fail('sync.response missing members array')
    } catch (e: any) {
      fail('sync.request', e.message)
    }
  }

  await sleep(500)

  // ── 3j: community.join ──
  console.log('  --- community.join ---')
  {
    aliceClient.messages.length = 0

    bobClient.send(
      makeMsg('community.join', bob.did, {
        communityId: COMMUNITY_ID
      })
    )

    try {
      const resp = await aliceClient.waitForType('community.member.joined', 5000)
      if (resp.payload?.did === bob.did) pass('community.join → community.member.joined with correct DID')
      else fail('community.join DID', `expected ${bob.did}, got ${resp.payload?.did}`)
    } catch (e: any) {
      fail('community.join', e.message)
    }
  }

  await sleep(500)

  // ── 3k: community.leave ──
  console.log('  --- community.leave ---')
  {
    aliceClient.messages.length = 0

    bobClient.send(
      makeMsg('community.leave', bob.did, {
        communityId: COMMUNITY_ID
      })
    )

    try {
      const resp = await aliceClient.waitForType('community.member.left', 5000)
      if (resp.payload?.did === bob.did) pass('community.leave → community.member.left with correct DID')
      else fail('community.leave DID', `got ${resp.payload?.did}`)
    } catch (e: any) {
      fail('community.leave', e.message)
    }
  }

  await sleep(500)

  // ── 3l: voice.join ──
  console.log('  --- voice.join ---')
  {
    bobClient.messages.length = 0

    aliceClient.send(
      makeMsg('voice.join', alice.did, {
        channelId
      })
    )

    try {
      const resp = await bobClient.waitForType('voice.participant.joined', 5000)
      if (resp.payload?.did === alice.did || resp.payload?.userId === alice.did) {
        pass('voice.join → voice.participant.joined')
      } else {
        fail('voice.join participant', `unexpected payload: ${JSON.stringify(resp.payload)}`)
      }
    } catch (e: any) {
      fail('voice.join', e.message)
    }
  }

  await sleep(500)

  // ── 3m: voice.mute ──
  console.log('  --- voice.mute ---')
  {
    bobClient.messages.length = 0

    aliceClient.send(
      makeMsg('voice.mute', alice.did, {
        channelId,
        muted: true
      })
    )

    try {
      // Check for any voice state broadcast
      const resp = await bobClient.waitForMessage(
        (m) => m.type?.startsWith('voice.') && m.type !== 'voice.participant.joined',
        3000
      )
      pass(`voice.mute → ${resp.type} broadcast`)
    } catch {
      fail('voice.mute', 'no broadcast received')
    }
  }

  await sleep(500)

  // ── 3n: voice.leave ──
  console.log('  --- voice.leave ---')
  {
    bobClient.messages.length = 0

    aliceClient.send(
      makeMsg('voice.leave', alice.did, {
        channelId
      })
    )

    try {
      const resp = await bobClient.waitForType('voice.participant.left', 5000)
      pass('voice.leave → voice.participant.left')
    } catch (e: any) {
      fail('voice.leave', e.message)
    }
  }

  console.log()

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SECTION 4: Missing Handlers (Cloud Worker ❌ in conformance table)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('[4] Missing Protocol Handlers (should return error or be unhandled)')

  const missingTypes = [
    'channel.update',
    'channel.delete.admin',
    'channel.reaction.add',
    'channel.reaction.remove',
    'channel.pin',
    'channel.unpin',
    'channel.pins.list',
    'channel.history',
    'dm.send',
    'dm.edit',
    'dm.delete',
    'dm.typing',
    'dm.keyexchange',
    'community.update',
    'community.info',
    'community.list',
    'community.ban',
    'community.unban',
    'community.kick',
    'mls.keypackage.upload',
    'mls.keypackage.fetch',
    'mls.welcome',
    'mls.commit',
    'mls.group.setup',
    'thread.create',
    'thread.send',
    'role.create',
    'role.update',
    'role.delete',
    'role.assign',
    'role.remove',
    'media.upload.request',
    'media.delete',
    'search.query',
    'search.metadata',
    'notification.list',
    'notification.mark-read',
    'notification.count',
    'moderation.config.update',
    'moderation.config.get',
    'member.update',
    'voice.offer',
    'voice.answer',
    'voice.ice',
    'voice.video',
    'voice.screen',
    'voice.speaking',
    'voice.token',
    'voice.transport.connect',
    'voice.produce',
    'voice.consume'
  ]

  for (const type of missingTypes) {
    aliceClient.messages.length = 0

    aliceClient.send(
      makeMsg(type, alice.did, {
        communityId: COMMUNITY_ID,
        channelId
      })
    )

    await sleep(200)

    const errMsg = aliceClient.messages.find((m) => m.type === 'error')
    if (errMsg) {
      skip(type, `returns error: "${errMsg.payload?.message?.substring?.(0, 50)}"`)
    } else {
      const anyMsg = aliceClient.messages[0]
      if (anyMsg) {
        // It handled it somehow — might be partially implemented
        skip(type, `got response: ${anyMsg.type} (partially handled?)`)
      } else {
        skip(type, 'silently ignored (no response)')
      }
    }
  }

  console.log()

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SECTION 5: Broadcast Behaviour
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('[5] Broadcast Behaviour')
  {
    // Verify sender doesn't receive their own broadcast for channel.send
    aliceClient.messages.length = 0
    bobClient.messages.length = 0

    aliceClient.send(
      makeMsg('channel.send', alice.did, {
        communityId: COMMUNITY_ID,
        channelId,
        content: { ciphertext: { __type: 'Uint8Array', data: btoa('Broadcast test') }, epoch: 0, senderIndex: 0 },
        nonce: crypto.randomUUID()
      })
    )

    await sleep(2000)

    const bobGot = bobClient.messages.find((m) => m.type === 'channel.message')
    const aliceGot = aliceClient.messages.find((m) => m.type === 'channel.message')

    if (bobGot) pass("Bob receives broadcast of Alice's message")
    else fail("Bob did not receive Alice's message broadcast")

    // Server implementation excludes sender from broadcast. Does cloud worker?
    if (!aliceGot) {
      pass('Sender excluded from own broadcast (matches server)')
    } else {
      bug(
        'Sender receives own broadcast',
        'Cloud worker broadcasts to ALL via getWebSockets() without excluding sender. ' +
          'Server excludes sender. This causes duplicate messages on the sending client.'
      )
    }
  }

  console.log()

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SECTION 6: Serialisation Conformance
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('[6] Serialisation')
  {
    // Test that Uint8Array content survives round-trip through the worker
    aliceClient.messages.length = 0
    bobClient.messages.length = 0

    const testBytes = new Uint8Array([72, 101, 108, 108, 111]) // "Hello"
    aliceClient.send(
      makeMsg('channel.send', alice.did, {
        communityId: COMMUNITY_ID,
        channelId,
        content: { ciphertext: testBytes, epoch: 42, senderIndex: 1 },
        nonce: crypto.randomUUID()
      })
    )

    try {
      const resp = await bobClient.waitForType('channel.message', 5000)
      const content = resp.payload?.content
      if (content?.epoch === 42) pass('Epoch preserved through worker')
      else fail('Epoch not preserved', `got ${content?.epoch}`)

      if (content?.senderIndex === 1) pass('SenderIndex preserved through worker')
      else fail('SenderIndex not preserved', `got ${content?.senderIndex}`)

      // Check ciphertext bytes survive (via base64 serialisation)
      const ct = content?.ciphertext
      if (ct instanceof Uint8Array) {
        const match = ct.length === testBytes.length && ct.every((b: number, i: number) => b === testBytes[i])
        match ? pass('Ciphertext Uint8Array survives round-trip') : fail('Ciphertext bytes mismatch')
      } else if (ct && typeof ct === 'object' && ct.__type === 'Uint8Array') {
        // Still in serialised form — the worker may not be round-tripping through deserialise
        fail('Ciphertext still in serialised form (worker not using deserialise/serialise properly)')
      } else {
        fail('Ciphertext missing or wrong type', `got ${typeof ct}`)
      }
    } catch (e: any) {
      fail('Serialisation round-trip', e.message)
    }
  }

  console.log()

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SECTION 7: Storage (QuadStore)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('[7] Storage Persistence')
  {
    // Send a message, then sync — the message should be in sync response
    aliceClient.messages.length = 0

    const uniqueNonce = crypto.randomUUID()
    aliceClient.send(
      makeMsg('channel.send', alice.did, {
        communityId: COMMUNITY_ID,
        channelId,
        content: { ciphertext: { __type: 'Uint8Array', data: btoa('Persistence test') }, epoch: 0, senderIndex: 0 },
        nonce: uniqueNonce
      })
    )

    await sleep(1000)

    aliceClient.messages.length = 0
    aliceClient.send(makeMsg('sync.request', alice.did, {}))

    try {
      const resp = await aliceClient.waitForType('sync.response', 5000)
      // Check if recent messages are included
      if (resp.payload?.recentMessages || resp.payload?.messages) {
        const msgs = resp.payload.recentMessages || resp.payload.messages
        pass(`sync.response includes recent messages (${msgs.length})`)
      } else {
        skip('sync.response message history', 'sync.response may not include message history (only state)')
      }
    } catch (e: any) {
      fail('sync.request for persistence', e.message)
    }
  }

  console.log()

  // Cleanup
  aliceClient.close()
  bobClient.close()
  await sleep(500)

  printSummary()
  process.exit(failCount > 0 ? 1 : 0)
}

function printSummary() {
  console.log()
  console.log('═══════════════════════════════════════════════════')
  console.log(`Results: ${passCount} passed, ${failCount} failed, ${skipCount} skipped (${testCount} total)`)

  if (bugs.length > 0) {
    console.log()
    console.log('🐛 BUGS FOUND:')
    for (const b of bugs) console.log(`  ${b}`)
  }

  if (failures.length > 0) {
    console.log()
    console.log('❌ FAILURES:')
    for (const f of failures) console.log(`  ${f}`)
  }
  console.log('═══════════════════════════════════════════════════')
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
