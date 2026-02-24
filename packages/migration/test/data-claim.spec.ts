import { describe, it, expect } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { createCryptoProvider } from '@harmony/crypto'
import { parseDiscordExport } from '../src/discord-export-parser.js'
import { deriveStorageKey, encryptUserData, decryptUserData } from '../src/user-data-encryption.js'
import { transformDiscordExportToQuads, computeDataMeta } from '../src/user-data-transform.js'

function makeTestZip(files: Record<string, string>): ArrayBuffer {
  const entries: Record<string, Uint8Array> = {}
  for (const [path, content] of Object.entries(files)) {
    entries[path] = strToU8(content)
  }
  const zipped = zipSync(entries)
  return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength)
}

describe('Discord Export Parser', () => {
  it('parses account info from user.json', async () => {
    const zip = makeTestZip({
      'account/user.json': JSON.stringify({
        id: '123456',
        username: 'testuser',
        email: 'test@example.com'
      }),
      'messages/index.json': JSON.stringify({})
    })

    const result = await parseDiscordExport(zip)
    expect(result.account.id).toBe('123456')
    expect(result.account.username).toBe('testuser')
    expect(result.account.email).toBe('test@example.com')
  })

  it('parses servers from servers/index.json', async () => {
    const zip = makeTestZip({
      'account/user.json': JSON.stringify({ id: '1', username: 'u' }),
      'servers/index.json': JSON.stringify({ '111': 'Server One', '222': 'Server Two' }),
      'messages/index.json': JSON.stringify({})
    })

    const result = await parseDiscordExport(zip)
    expect(result.servers).toHaveLength(2)
    expect(result.servers[0]).toEqual({ id: '111', name: 'Server One' })
  })

  it('parses messages from messages.json', async () => {
    const zip = makeTestZip({
      'account/user.json': JSON.stringify({ id: '1', username: 'u' }),
      'messages/c100/channel.json': JSON.stringify({ id: '100', name: 'general' }),
      'messages/c100/messages.json': JSON.stringify([
        { ID: 'm1', Timestamp: '2024-01-01T00:00:00Z', Contents: 'Hello world', Attachments: '' },
        { ID: 'm2', Timestamp: '2024-01-02T00:00:00Z', Contents: 'Test msg', Attachments: '' }
      ]),
      'messages/index.json': JSON.stringify({ c100: 'general' })
    })

    const result = await parseDiscordExport(zip)
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].channelId).toBe('100')
    expect(result.messages[0].channelName).toBe('general')
    expect(result.messages[0].messages).toHaveLength(2)
    expect(result.messages[0].messages[0].content).toBe('Hello world')
  })

  it('parses messages from CSV format', async () => {
    const zip = makeTestZip({
      'account/user.json': JSON.stringify({ id: '1', username: 'u' }),
      'messages/c200/messages.csv':
        'ID,Timestamp,Contents,Attachments\nm1,2024-01-01T00:00:00Z,Hello CSV,\nm2,2024-01-02T00:00:00Z,Second msg,',
      'messages/index.json': JSON.stringify({ c200: 'csv-channel' })
    })

    const result = await parseDiscordExport(zip)
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].messages).toHaveLength(2)
    expect(result.messages[0].messages[0].content).toBe('Hello CSV')
  })

  it('returns empty account on missing user.json', async () => {
    const zip = makeTestZip({
      'messages/index.json': JSON.stringify({})
    })

    const result = await parseDiscordExport(zip)
    expect(result.account.id).toBe('unknown')
  })
})

describe('User Data Encryption', () => {
  const crypto = createCryptoProvider()

  it('derives deterministic key from same mnemonic', async () => {
    const mnemonic = crypto.generateMnemonic()
    const key1 = await deriveStorageKey(crypto, mnemonic)
    const key2 = await deriveStorageKey(crypto, mnemonic)
    expect(key1).toEqual(key2)
    expect(key1.length).toBe(32)
  })

  it('derives different keys from different mnemonics', async () => {
    const key1 = await deriveStorageKey(crypto, crypto.generateMnemonic())
    const key2 = await deriveStorageKey(crypto, crypto.generateMnemonic())
    expect(key1).not.toEqual(key2)
  })

  it('encrypts and decrypts round-trip', async () => {
    const mnemonic = crypto.generateMnemonic()
    const key = await deriveStorageKey(crypto, mnemonic)
    const original = 'test data with unicode: 日本語 🎉'

    const encrypted = await encryptUserData(crypto, original, key)
    expect(encrypted.ciphertext.length).toBeGreaterThan(0)
    expect(encrypted.nonce.length).toBe(24)

    const decrypted = await decryptUserData(crypto, encrypted, key)
    expect(decrypted).toBe(original)
  })

  it('fails to decrypt with wrong key', async () => {
    const key1 = await deriveStorageKey(crypto, crypto.generateMnemonic())
    const key2 = await deriveStorageKey(crypto, crypto.generateMnemonic())
    const encrypted = await encryptUserData(crypto, 'secret', key1)

    await expect(decryptUserData(crypto, encrypted, key2)).rejects.toThrow()
  })
})

describe('User Data Transform', () => {
  it('transforms parsed data to quads', () => {
    const data = {
      account: { id: '123', username: 'testuser' },
      messages: [
        {
          channelId: 'ch1',
          channelName: 'general',
          messages: [{ id: 'm1', timestamp: '2024-01-01T00:00:00Z', content: 'Hello', attachments: '' }]
        }
      ],
      servers: [{ id: 's1', name: 'My Server' }]
    }

    const quads = transformDiscordExportToQuads(data, 'did:key:test123')
    expect(quads.length).toBeGreaterThan(0)

    // Check user quad exists
    const userQuad = quads.find((q) => q.subject === 'harmony:user:123' && q.predicate.endsWith('#type'))
    expect(userQuad).toBeTruthy()

    // Check message quad
    const msgQuad = quads.find((q) => q.subject === 'harmony:message:m1' && q.predicate.endsWith('#content'))
    expect(msgQuad).toBeTruthy()
    expect((msgQuad!.object as any).value).toBe('Hello')

    // Check graph is scoped to DID
    expect(quads[0].graph).toBe('harmony:claimed:did:key:test123')
  })

  it('computes metadata correctly', () => {
    const data = {
      account: { id: '1', username: 'u' },
      messages: [
        {
          channelId: 'c1',
          channelName: 'general',
          messages: [
            { id: '1', timestamp: '2024-01-01T00:00:00Z', content: 'a', attachments: '' },
            { id: '2', timestamp: '2024-06-15T00:00:00Z', content: 'b', attachments: '' }
          ]
        },
        {
          channelId: 'c2',
          channelName: 'random',
          messages: [{ id: '3', timestamp: '2024-03-01T00:00:00Z', content: 'c', attachments: '' }]
        }
      ],
      servers: [
        { id: 's1', name: 'S1' },
        { id: 's2', name: 'S2' }
      ]
    }

    const meta = computeDataMeta(data)
    expect(meta.messageCount).toBe(3)
    expect(meta.channelCount).toBe(2)
    expect(meta.serverCount).toBe(2)
    expect(meta.dateRange?.earliest).toBe('2024-01-01T00:00:00Z')
    expect(meta.dateRange?.latest).toBe('2024-06-15T00:00:00Z')
  })
})
