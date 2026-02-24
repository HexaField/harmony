import { describe, it, expect } from 'vitest'
import { pseudonymFromDid, initialsFromName } from '../src/utils/pseudonym'

describe('pseudonymFromDid', () => {
  it('returns a two-word name (Color Animal)', () => {
    const name = pseudonymFromDid('did:key:z6MkExampleDID123')
    const parts = name.split(' ')
    expect(parts).toHaveLength(2)
    expect(parts[0].length).toBeGreaterThan(0)
    expect(parts[1].length).toBeGreaterThan(0)
  })

  it('is deterministic — same DID always gives same name', () => {
    const did = 'did:key:z6MkSomeLongDIDString'
    const name1 = pseudonymFromDid(did)
    const name2 = pseudonymFromDid(did)
    expect(name1).toBe(name2)
  })

  it('different DIDs produce different names (with high probability)', () => {
    const name1 = pseudonymFromDid('did:key:z6MkAAAA')
    const name2 = pseudonymFromDid('did:key:z6MkBBBB')
    expect(name1).not.toBe(name2)
  })

  it('never contains "did:" in the output', () => {
    const testDids = ['did:key:z6MkTest1', 'did:key:z6MkTest2', 'did:plc:abc123', 'did:web:example.com']
    for (const did of testDids) {
      const name = pseudonymFromDid(did)
      expect(name).not.toContain('did:')
    }
  })

  it('handles empty string gracefully', () => {
    const name = pseudonymFromDid('')
    expect(name.split(' ')).toHaveLength(2)
  })
})

describe('initialsFromName', () => {
  it('returns two-letter initials from two-word name', () => {
    expect(initialsFromName('Blue Fox')).toBe('BF')
  })

  it('returns first two chars for single-word name', () => {
    expect(initialsFromName('Alice')).toBe('AL')
  })

  it('returns uppercase', () => {
    expect(initialsFromName('red panda')).toBe('RP')
  })
})
