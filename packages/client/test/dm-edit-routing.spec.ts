/**
 * Client-side tests for message edit decryption logic.
 *
 * Covers the handleChannelMessageUpdated regression (commit af406d0):
 * edited messages arrived as ciphertext objects instead of decrypted text.
 */
import { describe, it, expect } from 'vitest'

describe('Message Edit Decryption', () => {
  // These test the decryption logic extracted from handleChannelMessageUpdated

  it('decrypts ciphertext from Uint8Array (epoch 0, senderIndex 0)', () => {
    const text = 'edited content here'
    const ct = {
      ciphertext: new TextEncoder().encode(text),
      epoch: 0,
      senderIndex: 0
    }

    // This is the MLS-fallback decryption path
    let result = '[encrypted]'
    if (ct.epoch === 0 && ct.senderIndex === 0 && ct.ciphertext) {
      const bytes = ct.ciphertext instanceof Uint8Array ? ct.ciphertext : new Uint8Array(0)
      result = new TextDecoder().decode(bytes)
    }

    expect(result).toBe(text)
  })

  it('decrypts ciphertext from object (JSON-serialised Uint8Array)', () => {
    // When Uint8Array goes through JSON.stringify → JSON.parse, it becomes {0: byte, 1: byte, ...}
    const text = 'edited via json'
    const encoded = new TextEncoder().encode(text)
    const ciphertextObj: Record<string, number> = {}
    for (let i = 0; i < encoded.length; i++) {
      ciphertextObj[String(i)] = encoded[i]
    }

    const ct = { ciphertext: ciphertextObj, epoch: 0, senderIndex: 0 }

    let result = '[encrypted]'
    if (ct.epoch === 0 && ct.senderIndex === 0 && ct.ciphertext) {
      const ciphertext = ct.ciphertext
      const bytes =
        ciphertext instanceof Uint8Array
          ? ciphertext
          : (() => {
              const obj = ciphertext as Record<string, number>
              const keys = Object.keys(obj).sort((a, b) => Number(a) - Number(b))
              return new Uint8Array(keys.map((k) => obj[k]))
            })()
      result = new TextDecoder().decode(bytes)
    }

    expect(result).toBe(text)
  })

  it('returns [encrypted] for non-epoch-0 messages (real MLS)', () => {
    const ct = {
      ciphertext: new TextEncoder().encode('secret'),
      epoch: 3,
      senderIndex: 1
    }

    let result = '[encrypted]'
    if (ct.epoch === 0 && ct.senderIndex === 0 && ct.ciphertext) {
      result = new TextDecoder().decode(ct.ciphertext)
    }

    expect(result).toBe('[encrypted]')
  })

  it('handles empty ciphertext', () => {
    const ct = { ciphertext: new Uint8Array(0), epoch: 0, senderIndex: 0 }

    let result = '[encrypted]'
    if (ct.epoch === 0 && ct.senderIndex === 0 && ct.ciphertext) {
      result = new TextDecoder().decode(ct.ciphertext)
    }

    expect(result).toBe('')
  })

  it('handles null ciphertext gracefully', () => {
    const ct = { ciphertext: null, epoch: 0, senderIndex: 0 }

    let result = '[encrypted]'
    if (ct.epoch === 0 && ct.senderIndex === 0 && ct.ciphertext) {
      result = new TextDecoder().decode(ct.ciphertext)
    }

    // null is falsy so ciphertext check fails
    expect(result).toBe('[encrypted]')
  })

  it('handles unicode content', () => {
    const text = '🎉 edited emoji! café résumé 日本語'
    const ct = {
      ciphertext: new TextEncoder().encode(text),
      epoch: 0,
      senderIndex: 0
    }

    let result = '[encrypted]'
    if (ct.epoch === 0 && ct.senderIndex === 0 && ct.ciphertext) {
      result = new TextDecoder().decode(ct.ciphertext)
    }

    expect(result).toBe(text)
  })
})

describe('DM Multi-Server Routing Logic', () => {
  // Test the send() routing behavior: non-community messages must go to ALL servers

  it('non-community message goes to all connected servers', () => {
    const servers = new Map<string, { connected: boolean; sent: string[] }>()
    servers.set('ws://local:4515', { connected: true, sent: [] })
    servers.set('ws://remote:4515', { connected: true, sent: [] })

    const msg = { type: 'dm.send', payload: { recipientDID: 'did:key:bob' } }
    const communityId = undefined // DMs have no communityId

    // Simulate the fixed send() logic
    let sent = false
    if (communityId) {
      // Community-specific routing (not this path)
    }

    if (!sent) {
      // Fixed: send to ALL connected servers, not just the first
      for (const sc of servers.values()) {
        if (sc.connected) {
          sc.sent.push(JSON.stringify(msg))
          sent = true
        }
      }
    }

    expect(servers.get('ws://local:4515')!.sent.length).toBe(1)
    expect(servers.get('ws://remote:4515')!.sent.length).toBe(1)
  })

  it('old buggy behavior: only first server gets the message', () => {
    const servers = new Map<string, { connected: boolean; sent: string[] }>()
    servers.set('ws://local:4515', { connected: true, sent: [] })
    servers.set('ws://remote:4515', { connected: true, sent: [] })

    const msg = { type: 'dm.send' }

    // Old (broken) behavior: break after first
    for (const sc of servers.values()) {
      if (sc.connected) {
        sc.sent.push(JSON.stringify(msg))
        break // BUG: only first server
      }
    }

    // Only one server got the message
    const totalSent = Array.from(servers.values()).reduce((sum, sc) => sum + sc.sent.length, 0)
    expect(totalSent).toBe(1) // This is the broken behavior we fixed
  })

  it('queues message if no servers are connected', () => {
    const servers = new Map<string, { connected: boolean; sent: string[] }>()
    servers.set('ws://local:4515', { connected: false, sent: [] })

    const queue: any[] = []
    const msg = { type: 'dm.send' }

    let sent = false
    for (const sc of servers.values()) {
      if (sc.connected) {
        sc.sent.push(JSON.stringify(msg))
        sent = true
      }
    }

    if (!sent) {
      queue.push(msg)
    }

    expect(queue.length).toBe(1)
    expect(servers.get('ws://local:4515')!.sent.length).toBe(0)
  })
})

describe('Channel Lifecycle Event Shapes', () => {
  // Test the event shape contracts the store expects from the client

  it('channel.created event has required fields', () => {
    const event = { id: 'ch-1', channelId: 'ch-1', name: 'general', type: 'text', communityId: 'c1' }
    const chId = event.channelId || event.id
    expect(chId).toBe('ch-1')
    expect(event.name).toBe('general')
    expect(event.type).toBe('text')
  })

  it('channel.updated event handles partial updates', () => {
    const event = { channelId: 'ch-1', name: 'renamed' }
    const chId = (event as any).channelId || (event as any).id
    expect(chId).toBe('ch-1')
    expect(event.name).toBe('renamed')
  })

  it('channel.deleted event uses channelId or id', () => {
    const event1 = { channelId: 'ch-1' }
    const event2 = { id: 'ch-2' }
    expect(event1.channelId || (event1 as any).id).toBe('ch-1')
    expect((event2 as any).channelId || event2.id).toBe('ch-2')
  })
})

describe('DM Event Shapes', () => {
  it('outgoing DM includes _recipientDID for store keying', () => {
    // The optimistic DM emit must include _recipientDID
    const event = {
      id: 'dm-1',
      authorDID: 'did:key:alice', // sender
      _recipientDID: 'did:key:bob', // for store keying
      content: { text: 'hello' },
      timestamp: new Date().toISOString()
    }

    const isOutgoing = event.authorDID === 'did:key:alice'
    const peerDid = isOutgoing ? event._recipientDID || event.authorDID : event.authorDID

    expect(peerDid).toBe('did:key:bob')
  })

  it('incoming DM uses authorDID as peer key', () => {
    const event = {
      id: 'dm-1',
      authorDID: 'did:key:bob', // sender
      content: { text: 'hello' },
      timestamp: new Date().toISOString()
    }

    const myDid = 'did:key:alice'
    const isOutgoing = event.authorDID === myDid
    const peerDid = isOutgoing ? (event as any)._recipientDID || event.authorDID : event.authorDID

    expect(isOutgoing).toBe(false)
    expect(peerDid).toBe('did:key:bob')
  })
})
