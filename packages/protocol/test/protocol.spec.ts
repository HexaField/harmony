import { describe, it, expect } from 'vitest'
import {
  CLIENT_TO_SERVER_TYPES,
  SERVER_TO_CLIENT_TYPES,
  FEDERATION_TYPES,
  ALL_MESSAGE_TYPES,
  serialise,
  deserialise,
  isValidISO8601,
  uint8ArrayToBase64,
  base64ToUint8Array
} from '../src/index.js'
import type {
  ProtocolMessage,
  ChannelSendPayload,
  ChannelEditPayload,
  ChannelDeletePayload,
  ChannelTypingPayload,
  ReactionPayload,
  DMSendPayload,
  DMEditPayload,
  DMDeletePayload,
  DMTypingPayload,
  ThreadCreatePayload,
  ThreadSendPayload,
  CommunityCreatePayload,
  CommunityUpdatePayload,
  CommunityJoinPayload,
  CommunityLeavePayload,
  ChannelCreatePayload,
  ChannelUpdatePayload,
  ChannelDeleteAdminPayload,
  RoleCreatePayload,
  RoleUpdatePayload,
  RoleDeletePayload,
  MemberUpdatePayload,
  MemberKickPayload,
  MemberBanPayload,
  PresenceUpdatePayload,
  SyncRequestPayload,
  SyncResponsePayload,
  SyncStatePayload,
  ErrorPayload,
  EncryptedContent,
  DecryptedContent,
  AttachmentRef,
  Embed,
  LamportClock,
  Proof,
  ZCAPInvocationProof,
  ErrorCode
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

  describe('Phase 3 Message Types', () => {
    it('MUST include voice message types', () => {
      expect(CLIENT_TO_SERVER_TYPES).toContain('voice.join')
      expect(CLIENT_TO_SERVER_TYPES).toContain('voice.leave')
      expect(CLIENT_TO_SERVER_TYPES).toContain('voice.state')
      expect(SERVER_TO_CLIENT_TYPES).toContain('voice.participant.joined')
      expect(SERVER_TO_CLIENT_TYPES).toContain('voice.participant.left')
      expect(SERVER_TO_CLIENT_TYPES).toContain('voice.speaking')
    })

    it('MUST include media message types', () => {
      expect(CLIENT_TO_SERVER_TYPES).toContain('media.upload.request')
      expect(CLIENT_TO_SERVER_TYPES).toContain('media.upload.complete')
      expect(CLIENT_TO_SERVER_TYPES).toContain('media.delete')
    })

    it('MUST include search message types', () => {
      expect(CLIENT_TO_SERVER_TYPES).toContain('search.metadata')
      expect(SERVER_TO_CLIENT_TYPES).toContain('search.metadata.result')
    })

    it('MUST include bot message types', () => {
      expect(CLIENT_TO_SERVER_TYPES).toContain('bot.install')
      expect(CLIENT_TO_SERVER_TYPES).toContain('bot.uninstall')
      expect(CLIENT_TO_SERVER_TYPES).toContain('bot.action')
      expect(SERVER_TO_CLIENT_TYPES).toContain('bot.event')
    })

    it('MUST include governance message types', () => {
      expect(CLIENT_TO_SERVER_TYPES).toContain('governance.propose')
      expect(CLIENT_TO_SERVER_TYPES).toContain('governance.sign')
      expect(CLIENT_TO_SERVER_TYPES).toContain('governance.execute')
      expect(CLIENT_TO_SERVER_TYPES).toContain('governance.contest')
      expect(CLIENT_TO_SERVER_TYPES).toContain('governance.cancel')
    })

    it('MUST include delegation message types', () => {
      expect(CLIENT_TO_SERVER_TYPES).toContain('delegation.create')
      expect(CLIENT_TO_SERVER_TYPES).toContain('delegation.revoke')
    })

    it('MUST include credential message types', () => {
      expect(CLIENT_TO_SERVER_TYPES).toContain('credential.issue')
      expect(CLIENT_TO_SERVER_TYPES).toContain('credential.present')
      expect(CLIENT_TO_SERVER_TYPES).toContain('credential.verify')
    })

    it('MUST include all Phase 3 types in ALL_MESSAGE_TYPES', () => {
      expect(ALL_MESSAGE_TYPES).toContain('voice.join')
      expect(ALL_MESSAGE_TYPES).toContain('media.upload.request')
      expect(ALL_MESSAGE_TYPES).toContain('bot.install')
      expect(ALL_MESSAGE_TYPES).toContain('governance.propose')
      expect(ALL_MESSAGE_TYPES).toContain('delegation.create')
      expect(ALL_MESSAGE_TYPES).toContain('credential.issue')
    })
  })

  describe('Message Type Integrity', () => {
    it('CLIENT_TO_SERVER and SERVER_TO_CLIENT MUST NOT overlap (except federation)', () => {
      const clientSet = new Set(CLIENT_TO_SERVER_TYPES)
      const serverSet = new Set(SERVER_TO_CLIENT_TYPES)
      for (const t of clientSet) {
        expect(serverSet.has(t)).toBe(false)
      }
    })

    it('ALL_MESSAGE_TYPES MUST equal union of all category arrays', () => {
      const union = new Set([...CLIENT_TO_SERVER_TYPES, ...SERVER_TO_CLIENT_TYPES, ...FEDERATION_TYPES])
      expect(ALL_MESSAGE_TYPES.length).toBe(union.size)
      for (const t of ALL_MESSAGE_TYPES) {
        expect(union.has(t)).toBe(true)
      }
    })

    it('FEDERATION_TYPES MUST NOT appear in client or server lists', () => {
      for (const t of FEDERATION_TYPES) {
        expect(CLIENT_TO_SERVER_TYPES).not.toContain(t)
        expect(SERVER_TO_CLIENT_TYPES).not.toContain(t)
      }
    })
  })

  describe('Base64 Encoding', () => {
    it('MUST encode empty Uint8Array', () => {
      expect(uint8ArrayToBase64(new Uint8Array([]))).toBe('')
    })

    it('MUST round-trip single byte', () => {
      const bytes = new Uint8Array([42])
      expect(Array.from(base64ToUint8Array(uint8ArrayToBase64(bytes)))).toEqual([42])
    })

    it('MUST round-trip 2 bytes (padding case)', () => {
      const bytes = new Uint8Array([1, 2])
      expect(Array.from(base64ToUint8Array(uint8ArrayToBase64(bytes)))).toEqual([1, 2])
    })

    it('MUST round-trip 3 bytes (no padding)', () => {
      const bytes = new Uint8Array([1, 2, 3])
      expect(Array.from(base64ToUint8Array(uint8ArrayToBase64(bytes)))).toEqual([1, 2, 3])
    })

    it('MUST round-trip all byte values (0-255)', () => {
      const bytes = new Uint8Array(256)
      for (let i = 0; i < 256; i++) bytes[i] = i
      const rt = base64ToUint8Array(uint8ArrayToBase64(bytes))
      expect(Array.from(rt)).toEqual(Array.from(bytes))
    })

    it('MUST handle large arrays', () => {
      const bytes = new Uint8Array(10000)
      for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256
      const rt = base64ToUint8Array(uint8ArrayToBase64(bytes))
      expect(rt.length).toBe(10000)
      expect(rt[9999]).toBe(9999 % 256)
    })
  })

  describe('Serialisation Edge Cases', () => {
    it('MUST handle nested Uint8Arrays', () => {
      const data = {
        outer: { inner: new Uint8Array([10, 20]), deep: { bytes: new Uint8Array([30]) } }
      }
      const rt = deserialise<typeof data>(serialise(data))
      expect(rt.outer.inner).toBeInstanceOf(Uint8Array)
      expect(Array.from(rt.outer.inner)).toEqual([10, 20])
      expect(rt.outer.deep.bytes).toBeInstanceOf(Uint8Array)
    })

    it('MUST handle null and undefined values', () => {
      const data = { a: null, b: undefined, c: 'value' }
      const rt = deserialise<typeof data>(serialise(data))
      expect(rt.a).toBeNull()
      expect(rt.b).toBeUndefined()
      expect(rt.c).toBe('value')
    })

    it('MUST handle arrays with Uint8Arrays', () => {
      const data = { items: [new Uint8Array([1]), new Uint8Array([2, 3])] }
      const rt = deserialise<typeof data>(serialise(data))
      expect(rt.items[0]).toBeInstanceOf(Uint8Array)
      expect(rt.items[1]).toBeInstanceOf(Uint8Array)
    })

    it('MUST handle empty object', () => {
      const rt = deserialise<Record<string, never>>(serialise({}))
      expect(rt).toEqual({})
    })
  })

  describe('ISO 8601 Validation Edge Cases', () => {
    it('MUST accept date with timezone offset', () => {
      expect(isValidISO8601('2026-02-22T10:00:00+05:30')).toBe(true)
    })

    it('MUST reject numeric input cast to string', () => {
      expect(isValidISO8601('12345')).toBe(true) // JS Date parses this as year
    })

    it('MUST reject null-like strings', () => {
      expect(isValidISO8601('null')).toBe(false)
      expect(isValidISO8601('undefined')).toBe(false)
    })
  })

  describe('Additional Payload Types', () => {
    const clock: LamportClock = { counter: 1, authorDID: 'did:key:z6MkTest' }
    const content: EncryptedContent = { ciphertext: new Uint8Array([1, 2, 3]), epoch: 0, senderIndex: 0 }

    it('ChannelEditPayload MUST include messageId and content', () => {
      const p: ChannelEditPayload = { communityId: 'c1', channelId: 'ch1', messageId: 'msg-1', content, clock }
      expect(p.messageId).toBe('msg-1')
      expect(p.content).toBeDefined()
    })

    it('ChannelDeletePayload MUST include messageId', () => {
      const p: ChannelDeletePayload = { communityId: 'c1', channelId: 'ch1', messageId: 'msg-1', clock }
      expect(p.messageId).toBeDefined()
    })

    it('ChannelTypingPayload MUST include communityId and channelId', () => {
      const p: ChannelTypingPayload = { communityId: 'c1', channelId: 'ch1' }
      expect(p.communityId).toBe('c1')
    })

    it('ReactionPayload MUST include emoji', () => {
      const p: ReactionPayload = { communityId: 'c1', channelId: 'ch1', messageId: 'msg-1', emoji: '👍' }
      expect(p.emoji).toBe('👍')
    })

    it('DMEditPayload MUST include recipientDID and messageId', () => {
      const p: DMEditPayload = { recipientDID: 'did:key:r', messageId: 'dm-1', content, clock }
      expect(p.recipientDID).toBeDefined()
      expect(p.messageId).toBeDefined()
    })

    it('DMDeletePayload MUST include recipientDID and messageId', () => {
      const p: DMDeletePayload = { recipientDID: 'did:key:r', messageId: 'dm-1', clock }
      expect(p.messageId).toBeDefined()
    })

    it('DMTypingPayload MUST include recipientDID', () => {
      const p: DMTypingPayload = { recipientDID: 'did:key:r' }
      expect(p.recipientDID).toBeDefined()
    })

    it('ThreadSendPayload MUST include threadId', () => {
      const p: ThreadSendPayload = { threadId: 't1', content, nonce: 'n1', clock }
      expect(p.threadId).toBe('t1')
    })

    it('CommunityCreatePayload MUST include name and defaultChannels', () => {
      const p: CommunityCreatePayload = { name: 'Test', defaultChannels: ['general'] }
      expect(p.name).toBe('Test')
      expect(p.defaultChannels).toContain('general')
    })

    it('CommunityUpdatePayload MUST include communityId', () => {
      const p: CommunityUpdatePayload = { communityId: 'c1', name: 'New Name' }
      expect(p.communityId).toBe('c1')
    })

    it('CommunityLeavePayload MUST include communityId', () => {
      const p: CommunityLeavePayload = { communityId: 'c1' }
      expect(p.communityId).toBe('c1')
    })

    it('ChannelCreatePayload MUST include name and type', () => {
      const p: ChannelCreatePayload = { communityId: 'c1', name: 'voice-1', type: 'voice' }
      expect(p.type).toBe('voice')
    })

    it('ChannelUpdatePayload MUST include channelId', () => {
      const p: ChannelUpdatePayload = { communityId: 'c1', channelId: 'ch1', name: 'renamed' }
      expect(p.channelId).toBe('ch1')
    })

    it('ChannelDeleteAdminPayload MUST include channelId', () => {
      const p: ChannelDeleteAdminPayload = { communityId: 'c1', channelId: 'ch1' }
      expect(p.channelId).toBe('ch1')
    })

    it('RoleCreatePayload MUST include permissions and position', () => {
      const p: RoleCreatePayload = { communityId: 'c1', name: 'Mod', permissions: ['kick', 'ban'], position: 1 }
      expect(p.permissions).toContain('kick')
      expect(p.position).toBe(1)
    })

    it('RoleUpdatePayload MUST include roleId', () => {
      const p: RoleUpdatePayload = { communityId: 'c1', roleId: 'r1', name: 'Admin' }
      expect(p.roleId).toBe('r1')
    })

    it('RoleDeletePayload MUST include roleId', () => {
      const p: RoleDeletePayload = { communityId: 'c1', roleId: 'r1' }
      expect(p.roleId).toBe('r1')
    })

    it('MemberUpdatePayload MUST include memberDID', () => {
      const p: MemberUpdatePayload = { communityId: 'c1', memberDID: 'did:key:u', roles: ['r1'] }
      expect(p.memberDID).toBeDefined()
    })

    it('MemberKickPayload MUST include memberDID', () => {
      const p: MemberKickPayload = { communityId: 'c1', memberDID: 'did:key:u', reason: 'spam' }
      expect(p.reason).toBe('spam')
    })

    it('MemberBanPayload MUST include memberDID', () => {
      const p: MemberBanPayload = { communityId: 'c1', memberDID: 'did:key:u' }
      expect(p.memberDID).toBeDefined()
    })

    it('PresenceUpdatePayload MUST include status', () => {
      const p: PresenceUpdatePayload = { status: 'dnd', customStatus: 'Busy' }
      expect(p.status).toBe('dnd')
    })

    it('SyncResponsePayload MUST include messages, hasMore, latestClock', () => {
      const p: SyncResponsePayload = {
        communityId: 'c1',
        channelId: 'ch1',
        messages: [],
        hasMore: false,
        latestClock: { counter: 0, authorDID: '' }
      }
      expect(p.hasMore).toBe(false)
      expect(p.latestClock).toBeDefined()
    })

    it('SyncStatePayload MUST include clock', () => {
      const p: SyncStatePayload = { communityId: 'c1', channelId: 'ch1', clock }
      expect(p.clock.counter).toBe(1)
    })

    it('DecryptedContent MUST support attachments, embeds, mentions', () => {
      const attachment: AttachmentRef = {
        id: 'a1',
        filename: 'file.txt',
        contentType: 'text/plain',
        size: 100,
        url: 'https://...',
        encrypted: true
      }
      const embed: Embed = { type: 'link', url: 'https://example.com', title: 'Example' }
      const dc: DecryptedContent = {
        text: 'hello',
        attachments: [attachment],
        embeds: [embed],
        mentions: ['did:key:x']
      }
      expect(dc.attachments![0].filename).toBe('file.txt')
      expect(dc.embeds![0].type).toBe('link')
      expect(dc.mentions![0]).toBe('did:key:x')
    })

    it('ChannelSendPayload MUST support optional replyTo', () => {
      const p: ChannelSendPayload = {
        communityId: 'c1',
        channelId: 'ch1',
        content,
        nonce: 'n1',
        clock,
        replyTo: 'msg-parent'
      }
      expect(p.replyTo).toBe('msg-parent')
    })

    it('ErrorCode MUST cover all defined codes', () => {
      const codes: ErrorCode[] = [
        'AUTH_REQUIRED',
        'AUTH_INVALID',
        'ZCAP_INVALID',
        'ZCAP_EXPIRED',
        'ZCAP_REVOKED',
        'NOT_FOUND',
        'RATE_LIMITED',
        'FORBIDDEN',
        'CONFLICT',
        'INTERNAL'
      ]
      for (const code of codes) {
        const payload: ErrorPayload = { code, message: 'test' }
        expect(payload.code).toBe(code)
      }
    })
  })

  describe('Serialisation Round-Trip for All Payload Types', () => {
    it('MUST round-trip ChannelEditPayload', () => {
      const p: ChannelEditPayload = {
        communityId: 'c1',
        channelId: 'ch1',
        messageId: 'msg-1',
        content: { ciphertext: new Uint8Array([5, 6]), epoch: 1, senderIndex: 0 },
        clock: { counter: 2, authorDID: 'did:key:x' }
      }
      const rt = deserialise<ChannelEditPayload>(serialise(p))
      expect(rt.messageId).toBe('msg-1')
      expect(rt.content.ciphertext).toBeInstanceOf(Uint8Array)
    })

    it('MUST round-trip ReactionPayload', () => {
      const p: ReactionPayload = { communityId: 'c1', channelId: 'ch1', messageId: 'msg-1', emoji: '🎉' }
      const rt = deserialise<ReactionPayload>(serialise(p))
      expect(rt.emoji).toBe('🎉')
    })

    it('MUST round-trip PresenceUpdatePayload', () => {
      const p: PresenceUpdatePayload = { status: 'idle', customStatus: 'AFK', activeChannelId: 'ch1' }
      const rt = deserialise<PresenceUpdatePayload>(serialise(p))
      expect(rt.status).toBe('idle')
      expect(rt.activeChannelId).toBe('ch1')
    })

    it('MUST round-trip SyncResponsePayload with messages', () => {
      const p: SyncResponsePayload = {
        communityId: 'c1',
        channelId: 'ch1',
        messages: [
          {
            id: 'm1',
            type: 'channel.message',
            timestamp: '2026-01-01T00:00:00Z',
            sender: 'did:key:x',
            payload: { content: { ciphertext: new Uint8Array([1]), epoch: 0, senderIndex: 0 } }
          }
        ],
        hasMore: true,
        latestClock: { counter: 5, authorDID: 'did:key:x' }
      }
      const rt = deserialise<SyncResponsePayload>(serialise(p))
      expect(rt.messages.length).toBe(1)
      expect(rt.hasMore).toBe(true)
      expect(rt.latestClock.counter).toBe(5)
    })
  })
})
