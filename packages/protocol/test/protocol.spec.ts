import { describe, it, expect } from 'vitest'
import {
  CLIENT_TO_SERVER_TYPES,
  SERVER_TO_CLIENT_TYPES,
  FEDERATION_TYPES,
  ALL_MESSAGE_TYPES,
  serialise,
  deserialise,
  isValidISO8601
} from '../src/index.js'
import type {
  ProtocolMessage,
  ChannelSendPayload,
  DMSendPayload,
  ThreadCreatePayload,
  CommunityJoinPayload,
  SyncRequestPayload,
  ErrorPayload,
  EncryptedContent,
  LamportClock
} from '../src/index.js'

describe('@harmony/protocol', () => {
  describe('Message Types', () => {
    it('MUST define all client→server message types', () => {
      expect(CLIENT_TO_SERVER_TYPES.length).toBeGreaterThan(0)
      expect(CLIENT_TO_SERVER_TYPES).toContain('channel.send')
      expect(CLIENT_TO_SERVER_TYPES).toContain('dm.send')
      expect(CLIENT_TO_SERVER_TYPES).toContain('community.create')
      expect(CLIENT_TO_SERVER_TYPES).toContain('sync.request')
      expect(CLIENT_TO_SERVER_TYPES).toContain('presence.update')
    })

    it('MUST define all server→client message types', () => {
      expect(SERVER_TO_CLIENT_TYPES.length).toBeGreaterThan(0)
      expect(SERVER_TO_CLIENT_TYPES).toContain('channel.message')
      expect(SERVER_TO_CLIENT_TYPES).toContain('dm.message')
      expect(SERVER_TO_CLIENT_TYPES).toContain('error')
      expect(SERVER_TO_CLIENT_TYPES).toContain('sync.response')
      expect(SERVER_TO_CLIENT_TYPES).toContain('presence.changed')
    })

    it('MUST define all federation message types', () => {
      expect(FEDERATION_TYPES).toContain('federation.relay')
      expect(FEDERATION_TYPES).toContain('federation.sync')
      expect(FEDERATION_TYPES).toContain('federation.presence')
    })

    it('MUST have unique type strings (no collisions)', () => {
      const unique = new Set(ALL_MESSAGE_TYPES)
      expect(unique.size).toBe(ALL_MESSAGE_TYPES.length)
    })
  })

  describe('Envelope', () => {
    it('MUST require id, type, timestamp, sender', () => {
      const msg: ProtocolMessage = {
        id: 'msg-001',
        type: 'channel.send',
        timestamp: new Date().toISOString(),
        sender: 'did:key:z6MkTest',
        payload: {}
      }
      expect(msg.id).toBeDefined()
      expect(msg.type).toBeDefined()
      expect(msg.timestamp).toBeDefined()
      expect(msg.sender).toBeDefined()
    })

    it('MUST accept optional proof field', () => {
      const msg: ProtocolMessage = {
        id: 'msg-002',
        type: 'channel.send',
        timestamp: new Date().toISOString(),
        sender: 'did:key:z6MkTest',
        payload: {},
        proof: {
          capabilityId: 'cap-1',
          capabilityChain: ['cap-1'],
          invocation: {
            action: 'SendMessage',
            target: 'channel-1',
            proof: {
              type: 'Ed25519Signature2020',
              created: new Date().toISOString(),
              verificationMethod: 'did:key:z6MkTest#z6MkTest',
              proofPurpose: 'capabilityInvocation',
              proofValue: 'zSig'
            }
          }
        }
      }
      expect(msg.proof).toBeDefined()
      expect(msg.proof!.capabilityId).toBe('cap-1')
    })

    it('MUST validate ISO 8601 timestamp format', () => {
      expect(isValidISO8601(new Date().toISOString())).toBe(true)
      expect(isValidISO8601('2026-02-22T10:00:00.000Z')).toBe(true)
      expect(isValidISO8601('not-a-date')).toBe(false)
      expect(isValidISO8601('')).toBe(false)
    })
  })

  describe('Payloads', () => {
    const clock: LamportClock = { counter: 1, authorDID: 'did:key:z6MkTest' }
    const content: EncryptedContent = {
      ciphertext: new Uint8Array([1, 2, 3]),
      epoch: 0,
      senderIndex: 0
    }

    it('ChannelSendPayload MUST include communityId, channelId, content, nonce, clock', () => {
      const payload: ChannelSendPayload = {
        communityId: 'community-1',
        channelId: 'channel-1',
        content,
        nonce: 'nonce-1',
        clock
      }
      expect(payload.communityId).toBeDefined()
      expect(payload.channelId).toBeDefined()
      expect(payload.content).toBeDefined()
      expect(payload.nonce).toBeDefined()
      expect(payload.clock).toBeDefined()
    })

    it('DMSendPayload MUST include recipientDID, content, nonce, clock', () => {
      const payload: DMSendPayload = {
        recipientDID: 'did:key:z6MkRecipient',
        content,
        nonce: 'nonce-2',
        clock
      }
      expect(payload.recipientDID).toBeDefined()
      expect(payload.content).toBeDefined()
      expect(payload.nonce).toBeDefined()
      expect(payload.clock).toBeDefined()
    })

    it('ThreadCreatePayload MUST include parentMessageId and name', () => {
      const payload: ThreadCreatePayload = {
        communityId: 'community-1',
        channelId: 'channel-1',
        parentMessageId: 'msg-parent',
        name: 'Thread Title',
        content,
        clock
      }
      expect(payload.parentMessageId).toBeDefined()
      expect(payload.name).toBeDefined()
    })

    it('CommunityJoinPayload MUST include membershipVC and encryptionPublicKey', () => {
      const payload: CommunityJoinPayload = {
        communityId: 'community-1',
        membershipVC: { type: 'VerifiableCredential' },
        encryptionPublicKey: new Uint8Array(32)
      }
      expect(payload.membershipVC).toBeDefined()
      expect(payload.encryptionPublicKey).toBeDefined()
    })

    it('SyncRequestPayload MUST include communityId and channelId', () => {
      const payload: SyncRequestPayload = {
        communityId: 'community-1',
        channelId: 'channel-1'
      }
      expect(payload.communityId).toBeDefined()
      expect(payload.channelId).toBeDefined()
    })

    it('ErrorPayload MUST include code and message', () => {
      const payload: ErrorPayload = {
        code: 'AUTH_REQUIRED',
        message: 'Authentication required'
      }
      expect(payload.code).toBeDefined()
      expect(payload.message).toBeDefined()
    })
  })

  describe('Encrypted Content', () => {
    it('MUST include ciphertext, epoch, senderIndex', () => {
      const content: EncryptedContent = {
        ciphertext: new Uint8Array([1, 2, 3, 4]),
        epoch: 1,
        senderIndex: 0
      }
      expect(content.ciphertext).toBeInstanceOf(Uint8Array)
      expect(content.epoch).toBe(1)
      expect(content.senderIndex).toBe(0)
    })

    it('MUST NOT include any plaintext fields', () => {
      const content: EncryptedContent = {
        ciphertext: new Uint8Array([1, 2, 3]),
        epoch: 0,
        senderIndex: 0
      }
      const keys = Object.keys(content)
      expect(keys).not.toContain('text')
      expect(keys).not.toContain('plaintext')
      expect(keys).toContain('ciphertext')
    })
  })

  describe('Serialisation', () => {
    it('MUST serialise to JSON', () => {
      const msg: ProtocolMessage = {
        id: 'msg-ser',
        type: 'channel.send',
        timestamp: new Date().toISOString(),
        sender: 'did:key:z6MkTest',
        payload: { text: 'hello' }
      }
      const json = serialise(msg)
      expect(typeof json).toBe('string')
      expect(() => JSON.parse(json)).not.toThrow()
    })

    it('MUST handle Uint8Array as base64 in JSON', () => {
      const data = { bytes: new Uint8Array([0, 1, 2, 255, 128, 64]) }
      const json = serialise(data)
      expect(json).not.toContain('[0,1,2')
      const parsed = deserialise<typeof data>(json)
      expect(parsed.bytes).toBeInstanceOf(Uint8Array)
      expect(Array.from(parsed.bytes)).toEqual([0, 1, 2, 255, 128, 64])
    })

    it('MUST round-trip all payload types through JSON', () => {
      const clock: LamportClock = { counter: 5, authorDID: 'did:key:z6MkTest' }
      const content: EncryptedContent = {
        ciphertext: new Uint8Array([10, 20, 30, 40, 50]),
        epoch: 2,
        senderIndex: 1
      }
      const payload: ChannelSendPayload = {
        communityId: 'c1',
        channelId: 'ch1',
        content,
        nonce: 'n1',
        replyTo: 'msg-0',
        clock
      }
      const msg: ProtocolMessage = {
        id: 'msg-rt',
        type: 'channel.send',
        timestamp: '2026-02-22T10:00:00.000Z',
        sender: 'did:key:z6MkTest',
        payload
      }
      const rt = deserialise<ProtocolMessage>(serialise(msg))
      expect(rt.id).toBe(msg.id)
      expect(rt.type).toBe(msg.type)
      expect(rt.timestamp).toBe(msg.timestamp)
      expect(rt.sender).toBe(msg.sender)
      const rtPayload = rt.payload as ChannelSendPayload
      expect(rtPayload.communityId).toBe('c1')
      expect(rtPayload.content.ciphertext).toBeInstanceOf(Uint8Array)
      expect(Array.from(rtPayload.content.ciphertext)).toEqual([10, 20, 30, 40, 50])
      expect(rtPayload.content.epoch).toBe(2)
      expect(rtPayload.clock.counter).toBe(5)

      // DM payload round-trip
      const dmPayload: DMSendPayload = {
        recipientDID: 'did:key:z6MkR',
        content,
        nonce: 'n2',
        clock
      }
      const dmRt = deserialise<DMSendPayload>(serialise(dmPayload))
      expect(dmRt.recipientDID).toBe('did:key:z6MkR')
      expect(dmRt.content.ciphertext).toBeInstanceOf(Uint8Array)

      // Sync payload round-trip
      const syncPayload: SyncRequestPayload = {
        communityId: 'c1',
        channelId: 'ch1',
        since: '2026-01-01T00:00:00Z',
        clock,
        limit: 50
      }
      const syncRt = deserialise<SyncRequestPayload>(serialise(syncPayload))
      expect(syncRt.communityId).toBe('c1')
      expect(syncRt.limit).toBe(50)
    })
  })
})
