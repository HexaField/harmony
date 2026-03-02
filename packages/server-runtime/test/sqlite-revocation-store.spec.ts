import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { SqliteRevocationStore } from '../src/sqlite-revocation-store.js'

describe('SqliteRevocationStore', () => {
  let db: Database.Database
  let store: SqliteRevocationStore

  beforeEach(() => {
    db = new Database(':memory:')
    store = new SqliteRevocationStore(db)
  })

  afterEach(() => {
    db.close()
  })

  it('isRevoked returns false for unknown credential', async () => {
    expect(await store.isRevoked('cred-1')).toBe(false)
  })

  it('revoke marks a credential as revoked', async () => {
    await store.revoke('cred-1', 'compromised')
    expect(await store.isRevoked('cred-1')).toBe(true)
  })

  it('revoke without reason', async () => {
    await store.revoke('cred-2')
    expect(await store.isRevoked('cred-2')).toBe(true)
  })

  it('duplicate revoke is idempotent', async () => {
    await store.revoke('cred-1', 'reason-a')
    await store.revoke('cred-1', 'reason-b')
    const entries = await store.list()
    expect(entries.filter((e) => e.credentialId === 'cred-1')).toHaveLength(1)
    expect(entries[0].reason).toBe('reason-a')
  })

  it('list returns all revoked entries', async () => {
    await store.revoke('cred-1', 'bad')
    await store.revoke('cred-2')
    const entries = await store.list()
    expect(entries).toHaveLength(2)
    expect(entries.map((e) => e.credentialId).sort()).toEqual(['cred-1', 'cred-2'])
  })

  it('list entries have revokedAt timestamps', async () => {
    await store.revoke('cred-1')
    const entries = await store.list()
    expect(entries[0].revokedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('list entry without reason has undefined reason', async () => {
    await store.revoke('cred-1')
    const entries = await store.list()
    expect(entries[0].reason).toBeUndefined()
  })

  it('works with string path constructor', () => {
    const pathStore = new SqliteRevocationStore(':memory:')
    expect(pathStore).toBeDefined()
  })
})
