import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HarmonyClient } from '../src/index.js'
import { serialise } from '@harmony/protocol'

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

interface MockWS {
  url: string
  readyState: number
  send: ReturnType<typeof vi.fn>
  close: () => void
  onopen: (() => void) | null
  onclose: (() => void) | null
  onmessage: ((event: { data: string }) => void) | null
  onerror: ((event: unknown) => void) | null
  _open(): void
  _close(): void
  _authRespond(): void
}

let mockWSInstances: MockWS[] = []

function createMockWS(url: string): MockWS {
  const ws: MockWS = {
    url,
    readyState: 0,
    send: vi.fn(),
    close() {
      this.readyState = 3
      this.onclose?.()
    },
    onopen: null,
    onclose: null,
    onmessage: null,
    onerror: null,
    _open() {
      this.readyState = 1
      this.onopen?.()
    },
    _close() {
      this.readyState = 3
      this.onclose?.()
    },
    _authRespond() {
      this.onmessage?.({
        data: serialise({
          id: 'sync-ok',
          type: 'sync.response',
          sender: 'server',
          timestamp: new Date().toISOString(),
          payload: {}
        })
      })
    }
  }
  mockWSInstances.push(ws)

  // Auto-open after a tick (so onopen handler is assigned first)
  setTimeout(() => {
    ws._open()
    // After open, client sends auth, then we respond
    setTimeout(() => ws._authRespond(), 0)
  }, 0)

  return ws
}

function mockWsFactory(url: string): MockWS {
  return createMockWS(url)
}

function stubIdentity(did = 'did:key:z6MkTest') {
  return {
    identity: { did, document: { id: did }, credentials: [], capabilities: [] } as any,
    keyPair: { publicKey: new Uint8Array(32), secretKey: new Uint8Array(64) } as any,
    vp: {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiablePresentation'],
      holder: did,
      verifiableCredential: [],
      proof: {
        type: 'Ed25519Signature2020',
        created: new Date().toISOString(),
        verificationMethod: `${did}#key`,
        proofPurpose: 'authentication',
        proofValue: 'zFAKE'
      }
    } as any
  }
}

// ---------------------------------------------------------------------------

describe('Reconnection', () => {
  beforeEach(() => {
    mockWSInstances = []
  })

  afterEach(async () => {
    vi.restoreAllMocks()
  })

  it('MUST emit reconnecting event when ws closes unexpectedly', async () => {
    const stubs = stubIdentity()
    const client = new HarmonyClient({ wsFactory: mockWsFactory as any })
    await client.connect({ serverUrl: 'ws://server1', identity: stubs.identity, keyPair: stubs.keyPair, vp: stubs.vp })
    const ws = mockWSInstances[0]

    let reconnecting = false
    client.on('reconnecting', () => {
      reconnecting = true
    })

    ws._close()
    await new Promise((r) => setTimeout(r, 50))

    expect(reconnecting).toBe(true)
    await client.disconnect()
  })

  it('MUST queue messages while disconnected and flush on reconnect', async () => {
    const stubs = stubIdentity()
    const client = new HarmonyClient({ wsFactory: mockWsFactory as any })
    await client.connect({ serverUrl: 'ws://server1', identity: stubs.identity, keyPair: stubs.keyPair, vp: stubs.vp })
    const ws1 = mockWSInstances[0]

    // Disconnect
    ws1._close()
    await new Promise((r) => setTimeout(r, 50))

    // Queue messages while offline
    client.sendMessage('c1', 'ch1', 'queued-1').catch(() => {})
    client.sendMessage('c1', 'ch1', 'queued-2').catch(() => {})
    await new Promise((r) => setTimeout(r, 10))

    // Reconnect
    await client.reconnect()
    await new Promise((r) => setTimeout(r, 50))

    // The newest WS should have received flushed messages
    const ws2 = mockWSInstances[mockWSInstances.length - 1]
    expect(ws2.send.mock.calls.length).toBeGreaterThanOrEqual(1)
    await client.disconnect()
  })

  it('MUST use exponential backoff delays', async () => {
    const stubs = stubIdentity()
    const client = new HarmonyClient({ wsFactory: mockWsFactory as any })
    await client.connect({ serverUrl: 'ws://server1', identity: stubs.identity, keyPair: stubs.keyPair, vp: stubs.vp })

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

    // Disconnect triggers attemptReconnectServer
    mockWSInstances[0]._close()
    await new Promise((r) => setTimeout(r, 10))

    // Check that a reconnect was scheduled with exponential delay
    const reconnectCalls = setTimeoutSpy.mock.calls.filter((c: any[]) => typeof c[1] === 'number' && c[1] >= 2000)
    expect(reconnectCalls.length).toBeGreaterThanOrEqual(1)
    // First attempt: delay = min(1000 * 2^1, 30000) = 2000
    expect(reconnectCalls[0][1]).toBe(2000)

    await client.disconnect()
  })

  it('MUST keep other servers connected when one disconnects', async () => {
    const stubs = stubIdentity()
    const client = new HarmonyClient({ wsFactory: mockWsFactory as any })

    await client.connect({ serverUrl: 'ws://server1', identity: stubs.identity, keyPair: stubs.keyPair, vp: stubs.vp })
    await client.connect({ serverUrl: 'ws://server2', identity: stubs.identity, keyPair: stubs.keyPair, vp: stubs.vp })

    expect(client.isConnectedTo('ws://server1')).toBe(true)
    expect(client.isConnectedTo('ws://server2')).toBe(true)

    // Disconnect server 1 only
    mockWSInstances[0]._close()
    await new Promise((r) => setTimeout(r, 50))

    expect(client.isConnectedTo('ws://server2')).toBe(true)
    expect(client.isConnectedToAny()).toBe(true)

    await client.disconnect()
  })

  it('MUST preserve community state across reconnect', async () => {
    const stubs = stubIdentity()
    const client = new HarmonyClient({ wsFactory: mockWsFactory as any })
    await client.connect({ serverUrl: 'ws://server1', identity: stubs.identity, keyPair: stubs.keyPair, vp: stubs.vp })

    // Simulate receiving community data
    // The onmessage is now the "normal" handler (post-auth)
    const ws1 = mockWSInstances[0]
    ws1.onmessage?.({
      data: serialise({
        id: 'cc-1',
        type: 'community.created',
        sender: 'server',
        timestamp: new Date().toISOString(),
        payload: {
          communityId: 'comm-1',
          name: 'Test Community',
          channels: [{ id: 'ch-1', name: 'general', type: 'text' }],
          roles: []
        }
      })
    })
    await new Promise((r) => setTimeout(r, 50))
    const commsBefore = client.communities().length

    // Disconnect
    ws1._close()
    await new Promise((r) => setTimeout(r, 50))

    // Communities should still be in memory
    expect(client.communities().length).toBe(commsBefore)

    // Reconnect
    await client.reconnect()
    await new Promise((r) => setTimeout(r, 50))

    expect(client.communities().length).toBe(commsBefore)
    await client.disconnect()
  })
})
